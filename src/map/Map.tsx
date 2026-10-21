// The atlas map (PLAN 5.5): pure SVG, one camera transform, survey grid, cards, edges, nodes, labels.
// The SVG is one composite, focusable widget (zoom keys now, node navigation in phase 7, which
// settles its role per A1/A2), so the static-element a11y lint rules are disabled on its opening tag only.
import { type CSSProperties, type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { WASH } from '../design/tokens';
import type { AtlasGraph } from '../graph';
import { layout } from '../layout/layout';
import type { ApiModel } from '../model/types';
import { type Camera, LABEL_ZOOM, fit, pan, toCss, zoomAt } from './camera';
import { EdgeLabel, EdgeLine, MapDefs } from './Edge';
import { Legend } from './Legend';
import { Node } from './Node';
import { Toolbar } from './Toolbar';

const KEYS: Record<string, number> = { '+': 1.25, '=': 1.25, '-': 0.8, _: 0.8 };

export function AtlasMap({ model, graph }: { model: ApiModel; graph: AtlasGraph }) {
  const atlas = useMemo(() => layout(model, graph), [model, graph]);
  const ops = useMemo(() => new Map(model.operations.map((op) => [op.id, op])), [model]);
  const frame = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const touched = useRef(false); // until the user moves the camera, resizes refit
  const [cam, setCam] = useState<Camera | null>(null);
  const [animate, setAnimate] = useState(false);
  const [hot, setHot] = useState<string | null>(null);

  const move = (next: (c: Camera) => Camera, smooth = false) => {
    touched.current = true;
    setAnimate(smooth);
    setCam((c) => c && next(c));
  };
  const fitAll = (smooth: boolean) => {
    const el = frame.current!;
    touched.current = false;
    setAnimate(smooth);
    setCam(fit(atlas.bounds, el.clientWidth, el.clientHeight));
  };
  const zoomBy = (f: number) => move((c) => zoomAt(c, f, frame.current!.clientWidth / 2, frame.current!.clientHeight / 2), true);

  // Size the map from its real page top (header, chips and heading above it vary), so the fitted
  // atlas fills the first view without scrolling; app.css reads --map-top.
  useLayoutEffect(() => {
    const el = frame.current!;
    const measure = () => el.style.setProperty('--map-top', `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
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
      setCam(fit(atlas.bounds, el.clientWidth, el.clientHeight));
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

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === '0') fitAll(true);
    else if (KEYS[e.key]) zoomBy(KEYS[e.key]!);
    else return;
    e.preventDefault();
  };

  const linked = (from: string, to: string) => hot !== null && (from === hot || to === hot);
  const noun = model.source.kind === 'mcp' ? 'tools' : 'operations';
  return (
    <>
    <div className="map" ref={frame}>
      {/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex, jsx-a11y/prefer-tag-over-role -- composite atlas widget, see phase 7 */}
      <svg
        ref={svg}
        className="atlas"
        data-testid="atlas"
        data-ready={cam ? 'true' : 'false'}
        data-far={cam && cam.k < LABEL_ZOOM ? 'true' : undefined}
        data-hot={hot ?? undefined}
        tabIndex={0}
        role="group"
        aria-roledescription="atlas"
        aria-label={`${model.source.title} atlas: ${model.operations.length} ${noun} in ${graph.clusters.length} clusters, ${graph.edges.length} relationships. Plus and minus zoom, 0 fits. A text list follows the map.`}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={({ clientX: x, clientY: y }) => {
          const from = drag.current;
          if (from) move((c) => pan(c, x - from.x, y - from.y));
          if (from) drag.current = { x, y };
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {/* oxlint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex, jsx-a11y/prefer-tag-over-role */}
        <MapDefs />
        <pattern id="grid" width={48} height={48} patternUnits="userSpaceOnUse">
          <path className="grid-line" d="M48 0H0V48" />
        </pattern>
        {cam && (
          <g className="camera" data-animate={animate || undefined} style={{ transform: toCss(cam) }}>
            <rect fill="url(#grid)" x={atlas.bounds.x - 2400} y={atlas.bounds.y - 2400} width={atlas.bounds.w + 4800} height={atlas.bounds.h + 4800} />
            {atlas.clusters.map((c) => (
              <g key={c.id} className="cluster" transform={`translate(${c.x} ${c.y})`} style={{ '--wash': `var(--${WASH[graph.clusters.findIndex((g) => g.id === c.id) % WASH.length]})` } as CSSProperties}>
                <rect className="card" width={c.w} height={c.h} rx={8} />
                <path className="card-rule" d={`M0 36H${c.w}`} />
                <text className="territory-label" x={16} y={23}>{c.name}</text>
                {/* Hub schemas (used by > 8 operations) are badges, not edges. */}
                <text className="hub" x={c.w - 12} y={23} textAnchor="end">{c.hubs.map((h) => `${h.name} on ${h.count} ops`).join(', ')}</text>
              </g>
            ))}
            {atlas.edges.map((e) => <EdgeLine key={e.id} edge={e} hot={linked(e.from, e.to)} />)}
            {atlas.nodes.map((n) => <Node key={n.id} node={n} op={ops.get(n.id)!} crud={graph.crud[n.id]} hot={n.id === hot} onHover={setHot} />)}
            <g className="labels">{atlas.edges.map((e) => <EdgeLabel key={e.id} edge={e} hot={linked(e.from, e.to)} />)}</g>
          </g>
        )}
      </svg>
      <Toolbar onZoom={zoomBy} onFit={() => fitAll(true)} />
    </div>
    <Legend />
    </>
  );
}
