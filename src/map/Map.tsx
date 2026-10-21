// The atlas map (PLAN 5.5, phase 7): pure SVG, one camera transform, survey grid, cards, edges, nodes, labels.
// The SVG is a named group (aria-roledescription "atlas"); nodes are buttons with a roving tabindex,
// so the map is one Tab stop. Keys and clicks are handled here (pure logic in keyboard.ts), so the
// static-element a11y lint rules are disabled on the SVG's opening tag only.
import { type CSSProperties, type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DetailPanel } from '../detail/DetailPanel';
import { WASH } from '../design/tokens';
import type { AtlasGraph } from '../graph';
import { layout } from '../layout/layout';
import type { ApiModel } from '../model/types';
import { type Camera, LABEL_ZOOM, fit, follow, pan, toCss, zoomAt } from './camera';
import { EdgeLabel, EdgeLine, MapDefs } from './Edge';
import { describeEdge, edgesOf, keyAction, nodeName, opFromHash, otherEnd } from './keyboard';
import { Legend } from './Legend';
import { Node } from './Node';
import { Toolbar } from './Toolbar';

/** Height kept clear for the floating toolbar when fitting. */
const TOOLBAR_H = 40;

export function AtlasMap({ model, graph }: { model: ApiModel; graph: AtlasGraph }) {
  const atlas = useMemo(() => layout(model, graph), [model, graph]);
  const ops = useMemo(() => new Map(model.operations.map((op) => [op.id, op])), [model]);
  const degree = useMemo(() => new Map(model.operations.map((op) => [op.id, edgesOf(graph.edges, op.id).length])), [model, graph]);
  const names = useMemo(() => new Map(atlas.clusters.map((c) => [c.id, c.name])), [atlas]);
  const frame = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const touched = useRef(false); // until the user moves the camera, resizes refit
  const [cam, setCam] = useState<Camera | null>(null);
  const [animate, setAnimate] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  // The roving focus (also the operation the detail panel shows), and whether DOM focus is on a node.
  const [cursor, setCursor] = useState(() => opFromHash(window.location.hash, (id) => ops.has(id)));
  const [open, setOpen] = useState(() => cursor !== undefined);
  const [focusIn, setFocusIn] = useState(false);
  const [edge, setEdge] = useState<number | null>(null);
  const [say, setSay] = useState('');

  const stop = cursor ?? atlas.nodes[0]?.id;
  const node = atlas.nodes.find((n) => n.id === stop);
  const edges = useMemo(() => (stop ? edgesOf(graph.edges, stop) : []), [graph, stop]);
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

  /** Move focus to a node: DOM focus, camera follows (250 ms, 0 under reduced motion), position announced. */
  const focusNode = (id: string) => {
    const n = atlas.nodes.find((x) => x.id === id)!;
    setCursor(id);
    setEdge(null);
    svg.current!.querySelector<SVGRectElement>(`.hit[data-op="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    const el = frame.current!;
    const next = cam && follow(cam, n, el.clientWidth, el.clientHeight);
    if (next && next !== cam) move(() => next, true);
    const peers = atlas.nodes.filter((p) => p.cluster === n.cluster);
    setSay(`${names.get(n.cluster)} cluster, ${peers.indexOf(n) + 1} of ${peers.length}.`);
  };

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

  // `#op=<id>` names the open operation, so the view can be shared; an edited hash opens its node.
  useEffect(() => {
    const onHash = () => {
      const id = opFromHash(window.location.hash, (x) => ops.has(x));
      if (!id) return;
      setCursor(id);
      setOpen(true);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [ops]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.hash = open && stop ? `op=${encodeURIComponent(stop)}` : '';
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }, [open, stop]);

  const close = () => {
    setOpen(false);
    if (stop) focusNode(stop);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target as Element).closest('input, textarea, select, [contenteditable]')) return;
    const a = keyAction(atlas, { focus: node, edges, edge }, e.key, e.shiftKey);
    if (!a || a.type === 'help') return; // the `?` shortcut dialog is deferred to phase 8
    e.preventDefault();
    if (a.type === 'focus') focusNode(a.id);
    else if (a.type === 'edge') {
      setEdge(a.index);
      setSay(a.index === null ? 'Edge highlight cleared.' : describeEdge(edges[a.index]!, stop!, a.index, edges.length));
    } else if (a.type === 'open') {
      setOpen(true);
      setSay('Details open after the map; Tab to read them.');
    } else if (a.type === 'close') setOpen(false);
    else if (a.type === 'zoom') zoomBy(a.factor);
    else if (a.type === 'fit') fitAll(true);
    else move((c) => pan(c, a.dx, a.dy), true);
  };

  const linked = (from: string, to: string) => hot !== null && (from === hot || to === hot);
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
        tabIndex={-1}
        role="group"
        aria-roledescription="atlas"
        aria-label={`${model.source.title} atlas: ${model.operations.length} ${noun} in ${graph.clusters.length} clusters, ${graph.edges.length} relationships. Arrow keys move between ${noun}, Page Up and Page Down change cluster, E cycles edges, Enter opens details. A text list follows the map.`}
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
          if (!id) return;
          setOpen(true);
          focusNode(id);
        }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY };
          dragged.current = false;
        }}
        onPointerMove={(e) => {
          const from = drag.current;
          if (!from || (!dragged.current && Math.hypot(e.clientX - from.x, e.clientY - from.y) < 4)) return;
          // Capture only once a drag starts, so a plain click still reaches the node under the pointer.
          if (!dragged.current) e.currentTarget.setPointerCapture?.(e.pointerId);
          dragged.current = true;
          move((c) => pan(c, e.clientX - from.x, e.clientY - from.y));
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
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
            <g aria-hidden="true">{atlas.edges.map((e) => <EdgeLine key={e.id} edge={e} hot={linked(e.from, e.to)} cycled={e.id === cycled?.id} />)}</g>
            {atlas.nodes.map((n) => (
              <Node key={n.id} node={n} op={ops.get(n.id)!} crud={graph.crud[n.id]} label={nodeName(ops.get(n.id)!, n.state, names.get(n.cluster)!, degree.get(n.id)!)}
                tabbable={n.id === stop} hot={n.id === hot} target={!!cycled && n.id === otherEnd(cycled, stop!)} onHover={setHover} />
            ))}
            <g className="labels" aria-hidden="true">{atlas.edges.map((e) => <EdgeLabel key={e.id} edge={e} hot={linked(e.from, e.to)} />)}</g>
          </g>
        )}
      </svg>
      <p className="visually-hidden" aria-live="polite" data-testid="announcer">{say}</p>
    </div>
    {op && <DetailPanel model={model} graph={graph} op={op} onGo={focusNode} onClose={close} announce={setSay} />}
    </div>
    <Legend />
    </>
  );
}
