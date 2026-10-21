// The atlas map (PLAN 5.5, phase 7): pure SVG, one camera transform, survey grid, cards, edges, nodes, labels.
// The SVG is a named group (aria-roledescription "atlas"); nodes are buttons with a roving tabindex,
// so the map is one Tab stop. Keys and clicks are handled here (pure logic in keyboard.ts), so the
// static-element a11y lint rules are disabled on the SVG's opening tag only.
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAnnounce } from '../a11y/Announcer';
import { DetailPanel } from '../detail/DetailPanel';
import { WASH } from '../design/tokens';
import type { AtlasGraph, Edge } from '../graph';
import { aggregated, startCollapsed } from '../layout/collapse';
import type { Point, Rect } from '../layout/geometry';
import { layout } from '../layout/layout';
import type { ApiModel } from '../model/types';
import { type Camera, LABEL_ZOOM, fit, follow, pan, pinch, toCss, zoomAt } from './camera';
import { EdgeLabel, EdgeLine, LinkLine, MapDefs } from './Edge';
import { describeEdge, edgesOf, keyAction, mapName, nodeName, otherEnd } from './keyboard';
import { Legend } from './Legend';
import { Node, Summary } from './Node';
import { Toolbar } from './Toolbar';

/** Height kept clear for the floating toolbar when fitting. */
const TOOLBAR_H = 40;

interface AtlasMapProps {
  model: ApiModel;
  graph: AtlasGraph;
  /** The skill file documenting an operation, once the skill is written ("In the skill"). */
  skillFile?: (id: string) => string | undefined;
  onSkillFile: (path: string) => void;
  /** The operation whose details are open (`#op=`); `onSelect` pushes a history entry when `push`. */
  selected?: string;
  onSelect: (id: string | undefined, push: boolean) => void;
  /** Search and filter matches (null: all) and the edges left shown (F11). */
  match: Set<string> | null;
  edges: Edge[];
}

export function AtlasMap({ model, graph, skillFile, onSkillFile, selected, onSelect, match, edges: shownEdges }: AtlasMapProps) {
  // Large specs start with clusters collapsed to summary cards (P4); Enter or a click expands one.
  const [collapsed, setCollapsed] = useState(() => startCollapsed(graph, selected));
  const atlas = useMemo(() => layout(model, graph, collapsed), [model, graph, collapsed]);
  const many = aggregated(graph);
  const ops = useMemo(() => new Map(model.operations.map((op) => [op.id, op])), [model]);
  const degree = useMemo(() => new Map(model.operations.map((op) => [op.id, edgesOf(shownEdges, op.id).length])), [model, shownEdges]);
  const names = useMemo(() => new Map(atlas.clusters.map((c) => [c.id, c.name])), [atlas]);
  const frame = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const touches = useRef(new Map<number, Point>()); // pointers down, for two-finger pinch
  const dragged = useRef(false);
  const touched = useRef(false); // until the user moves the camera, resizes refit
  const [cam, setCam] = useState<Camera | null>(null);
  const [animate, setAnimate] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  // The roving focus (also the operation the detail panel shows), and whether DOM focus is on a node.
  const [cursor, setCursor] = useState(selected);
  const [seen, setSeen] = useState(selected);
  if (seen !== selected) {
    // Selected from outside (back/forward, an edited #op=): focus follows.
    setSeen(selected);
    if (selected) setCursor(selected);
  }
  const open = selected !== undefined;
  const [focusIn, setFocusIn] = useState(false);
  const [edge, setEdge] = useState<number | null>(null);
  const setSay = useAnnounce();
  const helpId = useId();

  // Keyboard navigation only visits matches; a focused node the search hides gives up the Tab stop.
  const nav = useMemo(() => {
    if (!match) return atlas;
    const nodes = atlas.nodes.filter((n) => n.summary || match.has(n.id));
    return { ...atlas, nodes, clusters: atlas.clusters.filter((c) => nodes.some((n) => n.cluster === c.id)) };
  }, [atlas, match]);
  const shown = useMemo(() => new Set(shownEdges.map((e) => e.id)), [shownEdges]);
  const stop = cursor && (open || !match || match.has(cursor)) ? cursor : (nav.nodes[0]?.id ?? cursor ?? atlas.nodes[0]?.id);
  const node = atlas.nodes.find((n) => n.id === stop);
  const edges = useMemo(() => (stop ? edgesOf(shownEdges, stop) : []), [shownEdges, stop]);
  const cycled = edge === null ? undefined : edges[edge];
  const hot = hover ?? (focusIn || open ? (stop ?? null) : null);

  const move = (next: (c: Camera) => Camera, smooth = false) => {
    touched.current = true;
    setAnimate(smooth);
    setCam((c) => c && next(c));
  };
  const fitAll = (smooth: boolean) => {
    const el = frame.current!;
    touched.current = false;
    setAnimate(smooth);
    setCam(fit(atlas.bounds, el.clientWidth, el.clientHeight, 16, TOOLBAR_H));
  };
  const zoomBy = (f: number) => move((c) => zoomAt(c, f, frame.current!.clientWidth / 2, frame.current!.clientHeight / 2), true);

  /** The part of the map not covered by the detail panel (WCAG 2.4.11): an overlay on tablets covers
   *  the right, a bottom sheet on phones covers the bottom (the page first scrolls the map to the top). */
  const visibleBox = (): Rect => {
    const el = frame.current!;
    const box = { x: 0, y: 0, w: el.clientWidth, h: el.clientHeight };
    const panel = el.parentElement!.querySelector<HTMLElement>('.detail');
    const position = panel && getComputedStyle(panel).position;
    if (position === 'absolute') {
      return { ...box, w: Math.min(box.w, Math.max(0, panel!.getBoundingClientRect().left - el.getBoundingClientRect().left)) };
    }
    if (position === 'fixed') {
      const top = el.getBoundingClientRect().top - 8;
      if (Math.abs(top) > 1) window.scrollTo({ top: window.scrollY + top, behavior: 'instant' });
      return { ...box, h: Math.min(box.h, Math.max(0, panel!.getBoundingClientRect().top - el.getBoundingClientRect().top)) };
    }
    return box;
  };
  /** Camera follows a node (250 ms, 0 under reduced motion) so it is clear of the toolbar edge and the panel. */
  const reveal = (id: string) => {
    const n = atlas.nodes.find((x) => x.id === id);
    if (!n) return;
    const v = visibleBox();
    setAnimate(true);
    setCam((c) => {
      const next = c && follow(c, n, v);
      if (next !== c) touched.current = true;
      return next;
    });
  };
  /** Open the panel, then (once it is laid out) keep the node clear of it. */
  const openPanel = (id: string) => {
    onSelect(id, true);
    requestAnimationFrame(() => reveal(id));
  };

  /** Move focus to a node: DOM focus, camera follows, position announced; keyboard focus outranks hover.
   *  Open details follow it (replacing the history entry, or adding one when `push`). */
  const focusNode = (id: string, push = false) => {
    const n = atlas.nodes.find((x) => x.id === id)!;
    if ((open || push) && !n.summary) onSelect(id, push);
    setCursor(id);
    setEdge(null);
    setHover(null);
    svg.current!.querySelector<SVGRectElement>(`.hit[data-op="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    reveal(id);
    const peers = nav.nodes.filter((p) => p.cluster === n.cluster);
    setSay(`${names.get(n.cluster)} cluster, ${peers.indexOf(n) + 1} of ${peers.length}.`);
  };

  /** Expand a summary card; focus moves to the cluster's first operation once it is laid out. */
  const pending = useRef<string | null>(null);
  const expand = (cluster: string) => {
    pending.current = graph.clusters.find((c) => c.id === cluster)!.operationIds[0]!;
    setCollapsed((shut) => new Set([...shut].filter((id) => id !== cluster)));
  };
  useEffect(() => {
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- runs once the expanded layout is drawn
    if (pending.current) focusNode(pending.current);
    pending.current = null;
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- as above
  }, [atlas]);

  // Back/forward changed the selection from outside: if that dropped focus (the panel closed) or left
  // it on another node, it follows the restored node, as in the list view.
  const prev = useRef(selected);
  useEffect(() => {
    if (prev.current === selected) return;
    const id = selected ?? prev.current;
    prev.current = selected;
    const active = document.activeElement;
    const at = active?.getAttribute('data-op');
    if (id && (!active || active === document.body || !active.isConnected || (at != null && at !== id))) {
      svg.current?.querySelector<SVGElement>(`.hit[data-op="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    }
  }, [selected]);

  // Size the map from its real page top (header, chips and heading above it vary), so the fitted
  // atlas fills the first view without scrolling; app.css reads --map-top (map and detail panel).
  useLayoutEffect(() => {
    const el = frame.current!;
    const measure = () => el.parentElement!.style.setProperty('--map-top', `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []); // the map remounts per sample (keyed by model hash)

  // Fit on first measure (the observer reports the initial size) and on resizes until the user moves.
  useEffect(() => {
    const el = frame.current!;
    const observer = new ResizeObserver(() => {
      if (touched.current) return;
      setAnimate(false);
      setCam(fit(atlas.bounds, el.clientWidth, el.clientHeight, 16, TOOLBAR_H));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [atlas.bounds]);

  // Ctrl/Cmd + wheel zooms (trackpad pinch arrives as ctrlKey); a plain wheel scrolls the page, never trapped.
  useEffect(() => {
    const el = svg.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      touched.current = true;
      setAnimate(false);
      setCam((c) => c && zoomAt(c, Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const close = () => {
    if (stop) focusNode(stop);
    onSelect(undefined, true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target as Element).closest('input, textarea, select, [contenteditable]')) return;
    const a = keyAction(nav, { focus: node, edges, edge }, e.key, e.shiftKey);
    if (!a || a.type === 'help') return; // `?` bubbles to the app, which opens the shortcut help
    e.preventDefault();
    if (a.type === 'open' && node?.summary) expand(node.cluster);
    else if (a.type === 'focus') focusNode(a.id);
    else if (a.type === 'edge') {
      setEdge(a.index);
      setSay(a.index === null ? 'Edge highlight cleared.' : describeEdge(edges[a.index]!, stop!, a.index, edges.length));
    } else if (a.type === 'open') {
      openPanel(stop!);
      setSay('Details open after the map; Tab to read them.');
    } else if (a.type === 'close') onSelect(undefined, true);
    else if (a.type === 'zoom') zoomBy(a.factor);
    else if (a.type === 'fit') fitAll(true);
    else move((c) => pan(c, a.dx, a.dy), true);
  };

  const linked = (from: string, to: string) => hot !== null && (from === hot || to === hot);
  const byId = new Map(graph.edges.map((e) => [e.id, e]));
  const bundled = new Map(graph.bundles.map((b) => [b.id, b.edges]));
  const drawn = atlas.edges.filter((e) => shown.has(e.id) && (!many || linked(e.from, e.to)));
  const noun = model.source.kind === 'mcp' ? 'tools' : 'operations';
  const op = open && stop ? ops.get(stop) : undefined;
  return (
    <>
    <div className="atlas-wrap" data-panel={op ? 'open' : undefined}>
    <div className="map" ref={frame}>
      <Toolbar onZoom={zoomBy} onFit={() => fitAll(true)} />
      {/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-tabindex, jsx-a11y/prefer-tag-over-role -- composite atlas widget */}
      <svg
        ref={svg}
        className="atlas"
        data-testid="atlas"
        data-ready={cam ? 'true' : 'false'}
        data-far={cam && cam.k < LABEL_ZOOM ? 'true' : undefined}
        data-hot={hot ?? undefined}
        style={{ '--inv': cam ? 1 / cam.k : 1 } as CSSProperties}
        tabIndex={-1}
        role="group"
        aria-roledescription="atlas"
        aria-label={mapName(model.source.title, noun, model.operations.length, graph.clusters.length, graph.edges.length, match && match.size, shownEdges.length)}
        aria-describedby={helpId}
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          const id = (e.target as Element).getAttribute('data-op');
          if (id && id !== cursor) {
            setCursor(id);
            setEdge(null);
          }
          setFocusIn(id !== null);
        }}
        onBlur={() => setFocusIn(false)}
        onClick={(e) => {
          const id = dragged.current ? null : (e.target as Element).closest('.node')?.getAttribute('data-op');
          dragged.current = false;
          const summary = atlas.nodes.find((n) => n.id === id && n.summary);
          if (summary) return expand(summary.cluster);
          if (!id) return;
          focusNode(id, true);
          requestAnimationFrame(() => reveal(id));
        }}
        onPointerDown={(e) => {
          touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          drag.current = touches.current.size === 1 ? { x: e.clientX, y: e.clientY } : null;
          dragged.current = false;
        }}
        onPointerMove={(e) => {
          const t = touches.current;
          if (t.size === 2 && t.has(e.pointerId)) {
            // Two fingers: pinch-zoom about their midpoint (in map coordinates), never a click.
            const r = e.currentTarget.getBoundingClientRect();
            const local = (p: Point): Point => ({ x: p.x - r.left, y: p.y - r.top });
            const before = [...t.values()].map(local) as [Point, Point];
            t.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const after = [...t.values()].map(local) as [Point, Point];
            dragged.current = true;
            return move((c) => pinch(c, before, after));
          }
          const from = drag.current;
          if (!from || (!dragged.current && Math.hypot(e.clientX - from.x, e.clientY - from.y) < 4)) return;
          // Capture only once a drag starts, so a plain click still reaches the node under the pointer.
          if (!dragged.current) e.currentTarget.setPointerCapture?.(e.pointerId);
          dragged.current = true;
          move((c) => pan(c, e.clientX - from.x, e.clientY - from.y));
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          touches.current.delete(e.pointerId);
          drag.current = null;
        }}
        onPointerCancel={(e) => {
          touches.current.delete(e.pointerId);
          drag.current = null;
        }}
      >
        {/* oxlint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-tabindex, jsx-a11y/prefer-tag-over-role */}
        <MapDefs />
        <pattern id="grid" width={48} height={48} patternUnits="userSpaceOnUse">
          <path className="grid-line" d="M48 0H0V48" />
        </pattern>
        {cam && (
          <g className="camera" data-animate={animate || undefined} style={{ transform: toCss(cam) }}>
            <rect fill="url(#grid)" x={atlas.bounds.x - 2400} y={atlas.bounds.y - 2400} width={atlas.bounds.w + 4800} height={atlas.bounds.h + 4800} />
            {/* Visible text is hidden from assistive tech: each node's name carries it (A2). */}
            {atlas.clusters.map((c) => (
              <g key={c.id} className="cluster" aria-hidden="true" transform={`translate(${c.x} ${c.y})`} style={{ '--wash': `var(--${WASH[graph.clusters.findIndex((g) => g.id === c.id) % WASH.length]})` } as CSSProperties}>
                <rect className="card" width={c.w} height={c.h} rx={8} />
                <path className="card-rule" d={`M0 36H${c.w}`} />
                <text className="territory-label" x={16} y={23}>{c.name}</text>
                {/* Hub schemas (used by > 8 operations) are badges, not edges. */}
                <text className="hub" x={c.w - 12} y={23} textAnchor="end">{c.hubs.map((h) => `${h.name} on ${h.count} ops`).join(', ')}</text>
              </g>
            ))}
            {/* Bundles stand in for their edges (shown on highlight); above 300 edges only the highlighted
                node's edges are drawn, plus counted links between clusters. */}
            <g aria-hidden="true">
              {atlas.links.filter((l) => l.kind === 'clusters' || (l.from !== hot && bundled.get(l.id)!.some((id) => shown.has(id)))).map((l) => <LinkLine key={l.id} link={l} hot={l.from === hot} />)}
              {drawn.map((e) => <EdgeLine key={e.id} edge={e} bundled={!!byId.get(e.id)!.bundledInto} hot={linked(e.from, e.to)} cycled={e.id === cycled?.id} />)}
            </g>
            {atlas.nodes.map((n) => n.summary ? (
              <Summary key={n.id} node={n} cluster={graph.clusters.find((c) => c.id === n.cluster)!} crud={graph.crud} noun={noun} tabbable={n.id === stop} />
            ) : (
              <Node key={n.id} node={n} op={ops.get(n.id)!} crud={graph.crud[n.id]} label={nodeName(ops.get(n.id)!, n.state, names.get(n.cluster)!, degree.get(n.id)!)}
                tabbable={n.id === stop} hot={n.id === hot} dim={!!match && !match.has(n.id)} target={!!cycled && n.id === otherEnd(cycled, stop!)} onHover={setHover} />
            ))}
            <g className="labels" aria-hidden="true">{drawn.map((e) => <EdgeLabel key={e.id} edge={e} hot={linked(e.from, e.to)} />)}</g>
          </g>
        )}
      </svg>
      <p className="visually-hidden" id={helpId}>Arrow keys move between {noun}, Page Up and Page Down change cluster, E cycles edges, Enter opens details, question mark lists every shortcut. The List view shows the same map as text.</p>
    </div>
    {op && <DetailPanel model={model} graph={graph} op={op} onGo={(id) => focusNode(id, true)} onClose={close} announce={setSay} inSkill={skillFile?.(op.id)} onInSkill={onSkillFile} />}
    </div>
    <Legend />
    </>
  );
}
