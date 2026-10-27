// The route map (docs/DESIGN.md 5, redesign R4): resource cards in columns on the grid,
// operations as real buttons, feed links and bundles between columns, the strongest workflow as one
// indigo line; hover or focus a row and its links appear, the rest fades, and the operation card
// previews it; click or Enter pins the card. Positions come from the pure route layout
// (src/layout/route.ts). The map is one Tab stop (roving tabindex); arrows move between rows
// (keyboard.ts). Wider than the frame, it scrolls sideways in a focusable region: no zoom.
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAnnounce } from '../a11y/Announcer';
import { useFadeOut } from '../design/motion';
import type { AtlasGraph, Edge } from '../graph';
import { CARD_W, MAX_ROWS, type RouteCard, type RouteRow, hoverExtent, hoverLinks, routeLayout } from '../layout/route';
import type { ApiModel } from '../model/types';
import type { Chain } from '../skillgen/types';
import { describeEdge, edgesOf, keyAction, mapName, moreId, navOf, nodeName, otherEnd } from './keyboard';
import { OpCard } from './OpCard';

/** The operation card: 300 wide, 16 px from the row, its top 40 px above the row's centre (V2Hover);
 *  at most 64 px past the map's bottom (scrolling inside), never under 240 px tall. */
const CARD = { w: 300, gap: 16, lift: 40, below: 64, minH: 240 };
/** A pointer leaving a row has this long to reach its card before the preview goes. */
const LINGER = 150;

interface RouteMapProps {
  model: ApiModel;
  /** The graph as shown (cluster names may be AI-drafted). */
  graph: AtlasGraph;
  /** The deterministic graph the layout is computed from, so AI names never move a card. */
  base?: AtlasGraph;
  /** The strongest workflow, computed once per model (topChains is slow on large specs). */
  chain: Chain | null;
  /** The skill file documenting an operation, once the skill is written ("In skill"). */
  skillFile?: (id: string) => string | undefined;
  onSkillFile: (path: string) => void;
  /** The operation whose card is pinned (`#op=`); `onSelect` pushes a history entry when `push`. */
  selected?: string;
  onSelect: (id: string | undefined, push: boolean) => void;
  /** Search matches (null: all) and the relationships left shown. */
  match: Set<string> | null;
  edges: Edge[];
}

export function RouteMap({ model, graph, base = graph, chain, skillFile, onSkillFile, selected, onSelect, match, edges: shownEdges }: RouteMapProps) {
  const uid = useId();
  const noun = model.source.kind === 'mcp' ? 'tools' : 'operations';
  const announce = useAnnounce();
  const ops = useMemo(() => new Map(model.operations.map((op) => [op.id, op])), [model]);
  const names = useMemo(() => new Map(graph.clusters.map((c) => [c.id, c.name])), [graph]);
  const home = useMemo(() => new Map(base.clusters.flatMap((c) => c.operationIds.map((id) => [id, c] as const))), [base]);
  // Feeds only on hover: sub-path and shared-schema relations are listed in the card (D45).
  const feeds = useMemo(() => ({ ...base, edges: base.edges.filter((e) => e.kind === 'feeds') }), [base]);

  // A card holding the pinned operation past its eighth row opens, so the row is there to pin.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    const c = selected ? home.get(selected) : undefined;
    return c && c.operationIds.length > MAX_ROWS ? new Set([c.id]) : new Set();
  });
  const layout = useMemo(() => routeLayout(model, base, { expanded, chain }), [model, base, expanded, chain]);
  const rowOf = useMemo(() => new Map(layout.cards.flatMap((c) => c.rows.map((r) => [r.op, { row: r, card: c }] as const))), [layout]);
  if (selected && !rowOf.has(selected) && home.has(selected) && !expanded.has(home.get(selected)!.id)) {
    setExpanded(new Set([...expanded, home.get(selected)!.id]));
  }
  // What hover links actually reach (not the deepest any operation could): the scroll region's box.
  const reach = useMemo(() => hoverExtent(layout, feeds), [layout, feeds]);
  const nav = useMemo(() => navOf(layout, match), [layout, match]);
  const shown = useMemo(() => new Set(shownEdges.map((e) => e.id)), [shownEdges]);
  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of shownEdges) for (const id of new Set([e.from, e.to])) d.set(id, (d.get(id) ?? 0) + 1);
    return d;
  }, [shownEdges]);

  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(Infinity);
  const [scrollX, setScrollX] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const linger = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [cursor, setCursor] = useState(selected);
  const [seen, setSeen] = useState(selected);
  if (seen !== selected) {
    // Pinned from outside (back/forward, an edited #op=): focus follows.
    setSeen(selected);
    if (selected) setCursor(selected);
  }
  const [focusIn, setFocusIn] = useState(false);
  const [edge, setEdge] = useState<number | null>(null);

  const pinned = selected && rowOf.has(selected) ? selected : undefined;
  const stop = pinned ?? (cursor && nav.nodes.some((n) => n.id === cursor) ? cursor : nav.nodes[0]?.id);
  const at = nav.nodes.find((n) => n.id === stop);
  const opAt = at && !at.more ? at.id : undefined;
  const cycleEdges = opAt ? edgesOf(shownEdges, opAt) : [];
  const cycled = edge === null ? undefined : cycleEdges[edge];
  const focused = focusIn && opAt ? opAt : null;
  const hot = pinned ?? hover ?? focused;
  // For 250 ms after the last hot row, the rows and links keep their transitions so they fade back (app.css).
  const fading = useFadeOut(!!hot);
  const lit = hot ? hoverLinks(layout, feeds, hot) : [];
  const near = new Set(hot ? [hot, ...lit.flatMap((l) => [l.from, l.to])] : []);

  // Sideways scrolling only when the map is wider than the frame (or has more than four columns).
  useLayoutEffect(() => {
    const el = wrap.current!;
    const observer = new ResizeObserver(() => setAvail(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scrolls = layout.scrolls || layout.width > avail + 0.5;
  // The map's box and where the layout's (0, 0) sits in it: the cards plus what any link reaches
  // above and below them (rest and hover, `hoverExtent`), so nothing draws into the tools row or is
  // clipped. Scrolling, the region also holds the hover loops left of the first column and right of
  // the last (30 px at most, inside the frame's 32 px padding) and is pulled left by as much
  // (marginLeft), so the first column stays on the grid.
  const top = Math.max(0, -reach.y);
  const pad = scrolls
    ? { left: -reach.x, top, w: reach.w, h: reach.h }
    : { left: 0, top, w: layout.width, h: top + Math.max(layout.height, reach.y + reach.h) };
  /** The layout's origin relative to the wrapper (the card is placed outside the scroller). */
  const ox = scrolls ? -scrollX : 0;
  const oy = pad.top;

  const rowEl = (id: string) => wrap.current?.querySelector<HTMLElement>(`[data-nav="${CSS.escape(id)}"]`) ?? null;
  const cardName = (id: string) => names.get(id) ?? layout.cards.find((c) => c.id === id)?.name ?? id;
  // A row to focus once it is laid out (a link in the card to an operation behind "N more").
  const pending = useRef<string | null>(null);
  useEffect(() => {
    const id = pending.current;
    if (id && rowEl(id)) {
      pending.current = null;
      rowEl(id)!.focus();
    }
  });

  // Back/forward changed the pin from outside: if that dropped focus or left it on another row, it follows.
  const prev = useRef(selected);
  useEffect(() => {
    if (prev.current === selected) return;
    const id = selected ?? prev.current;
    prev.current = selected;
    const active = document.activeElement;
    const was = active?.getAttribute('data-nav');
    if (id && (!active || active === document.body || !active.isConnected || (was != null && was !== id))) rowEl(id)?.focus();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- runs when the pin changes
  }, [selected]);
  useEffect(() => () => clearTimeout(linger.current), []);

  /** Move focus to a row; a pinned card follows it (replacing the history entry, or adding one when `push`). */
  const focusNode = (id: string, push = false) => {
    const card = nav.nodes.find((x) => x.id === id)?.card ?? home.get(id)?.id;
    if (!card) return;
    const more = id.startsWith('more:');
    if (!more && (pinned || push)) onSelect(id, push);
    setCursor(id);
    setEdge(null);
    setHover(null);
    pending.current = id;
    rowEl(id)?.focus();
    const n = { card };
    const peers = nav.nodes.filter((p) => p.card === n.card);
    if (peers.some((p) => p.id === id)) announce(`${cardName(n.card)} cluster, ${peers.findIndex((p) => p.id === id) + 1} of ${peers.length}.`);
  };
  const close = () => {
    const id = pinned;
    onSelect(undefined, true);
    if (id) requestAnimationFrame(() => rowEl(id)?.focus());
  };
  const toggle = (card: RouteCard) => {
    const open = !expanded.has(card.id);
    setExpanded((e) => (open ? new Set([...e, card.id]) : new Set([...e].filter((id) => id !== card.id))));
    setCursor(moreId(card.id));
    announce(open ? `${cardName(card.id)}: all ${card.count} ${noun} shown.` : `${cardName(card.id)}: ${card.count - card.more!.count} of ${card.count} ${noun} shown.`);
  };
  const pin = (id: string) => {
    focusNode(id, true);
    // The row already has focus, so focus() does not scroll: once the card (on phones the bottom
    // sheet, with its scroll padding) is drawn, bring the row clear of it (2.4.11).
    requestAnimationFrame(() => rowEl(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    announce('Operation card open after the map; Tab to read it.');
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = keyAction(nav, { focus: at, edges: cycleEdges, edge }, e.key);
    if (!a || a.type === 'help') return; // `?` bubbles to the app, which opens the shortcut help
    e.preventDefault();
    if (a.type === 'focus') focusNode(a.id);
    else if (a.type === 'edge') {
      setEdge(a.index);
      announce(a.index === null ? 'Link highlight cleared.' : describeEdge(cycleEdges[a.index]!, opAt!, a.index, cycleEdges.length));
    } else if (a.type === 'open') {
      if (at?.more) toggle(layout.cards.find((c) => c.id === at.card)!);
      else if (opAt) pin(opAt);
    } else if (a.type === 'close' && pinned) close();
  };
  const onRowFocus = (id: string) => {
    // Focus scrolls a row that is only partly in the scroll region fully into it.
    if (scrolls) rowEl(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (id !== cursor) {
      setCursor(id);
      setEdge(null);
    }
    setFocusIn(true);
  };
  const enter = (id: string) => {
    clearTimeout(linger.current);
    setHover(id);
  };
  const leave = () => {
    clearTimeout(linger.current);
    linger.current = setTimeout(() => setHover(null), LINGER);
  };

  // Where the card goes: right of the row, or flipped left of its card when it would leave the frame.
  const cardOp = pinned ?? hover ?? focused;
  const [place, setPlace] = useState<{ left: number; top: number; flip: boolean; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    const to = cardOp ? rowOf.get(cardOp) : undefined;
    const el = wrap.current;
    if (!to || !el || avail <= 0) {
      setPlace(null);
      return;
    }
    const w = el.getBoundingClientRect();
    const frame = (el.closest('.frame') ?? el).getBoundingClientRect();
    const right = Math.min(frame.right, window.innerWidth) - w.left;
    let left = ox + to.card.x + CARD_W + CARD.gap;
    const flip = left + CARD.w > right;
    if (flip) left = Math.max(frame.left - w.left, ox + to.card.x - CARD.gap - CARD.w);
    // A tall pinned card scrolls inside itself rather than covering the skill browser under the map: it
    // may pass the map's bottom by the caption's height at most (the limit); near the bottom it rises,
    // still beside its row, to keep at least CARD.minH. The hover preview has no floor: the next effect
    // fits it to its own height.
    const limit = el.offsetHeight + CARD.below;
    const y = oy + to.row.cy - CARD.lift;
    const cardTop = cardOp === pinned ? Math.min(y, limit - CARD.minH) : y;
    setPlace({ left, top: cardTop, flip, maxHeight: Math.max(cardOp === pinned ? CARD.minH : 0, limit - cardTop) });
  }, [cardOp, pinned, rowOf, ox, oy, avail]);
  // The hover preview never scrolls (see app.css), so it is never cut and never reaches the skill
  // browser: any preview whose bottom would pass the limit rises, still beside its row, until it ends
  // at the limit. A preview is kept short (D80), so on the samples none is taller than the map and
  // caption together; should a pasted spec make one (a long title, a very short map), it keeps its full
  // height from the map's top and passes the limit rather than being cut (D70, D76).
  useLayoutEffect(() => {
    const el = wrap.current;
    const preview = el?.querySelector<HTMLElement>('.op-card[aria-hidden="true"]');
    if (!el || !preview || !place) return;
    const limit = el.offsetHeight + CARD.below;
    const height = preview.scrollHeight;
    const risen = Math.max(0, Math.min(place.top, limit - height));
    const maxHeight = Math.max(limit - risen, height);
    if (risen === place.top && maxHeight === place.maxHeight) return;
    setPlace({ ...place, top: risen, maxHeight });
  }, [place]);

  const routeShown = !hot; // the workflow's colour and discs rest while a row is hot (V2Hover)
  const marker = (name: string) => `url(#${CSS.escape(`${uid}${name}`)})`;
  const linkFaded = (ids: string[]) => !!hot || !ids.some((id) => shown.has(id));
  const target = cycled && opAt ? otherEnd(cycled, opAt) : undefined;
  // Lit: related to the hot row, or a search match; dim: the rest while something is hot or searched (D47).
  const isDim = (op: string) => (!!hot && !near.has(op)) || (!!match && !match.has(op));
  const isLit = (op: string) => (!!hot || !!match) && !isDim(op);
  const rowAttrs = (r: RouteRow) => ({ 'data-hot': r.op === hot || undefined, 'data-dim': isDim(r.op) || undefined, 'data-lit': isLit(r.op) || undefined, 'data-target': r.op === target || undefined });
  const cardDim = (c: RouteCard) => (!!hot || !!match) && !c.rows.some((r) => isLit(r.op)) && !(c.more?.hidden.some(isLit) ?? false);
  const card = cardOp && place ? ops.get(cardOp) : undefined;

  const map = (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a labelled group of cards, not a fieldset
    <div className="route" role="group" data-testid="atlas" data-ready="true" data-hot={hot ?? undefined} data-fading={fading || undefined} aria-roledescription="map"
      aria-label={mapName(model.source.title, noun, model.operations.length, graph.clusters.length, graph.edges.length, match && match.size, shownEdges.length)}
      aria-describedby={`${uid}help`} style={{ width: pad.w, height: pad.h }}>
      <div className="route-origin" style={{ left: pad.left, top: pad.top }}>
        <svg className="links" aria-hidden="true" style={{ left: reach.x, top: reach.y }} width={reach.w} height={reach.h} viewBox={`${reach.x} ${reach.y} ${reach.w} ${reach.h}`}>
          <defs>
            <marker id={`${uid}ah`} viewBox="0 0 8 8" refX={7} refY={4} markerWidth={8} markerHeight={8} orient="auto"><path className="ah" d="M1 1.5 6.5 4 1 6.5" /></marker>
            <marker id={`${uid}ahk`} viewBox="0 0 8 8" refX={7} refY={4} markerWidth={8} markerHeight={8} orient="auto"><path className="ahk" d="M1 1.5 6.5 4 1 6.5" /></marker>
            <marker id={`${uid}ahr`} viewBox="0 0 8 8" refX={6.5} refY={4} markerWidth={7} markerHeight={7} orient="auto"><path className="ahr" d="M1 1 7 4 1 7z" /></marker>
          </defs>
          {/* Links, then the workflow's halo, then its line: the halo masks feeds at the line's end rows.
              The halo and line of step i carry pathLength 1 and --i, so a new result draws them left to right (DESIGN.md 7). */}
          {layout.links.map((l) => {
            const faded = linkFaded(l.edges);
            return <path key={l.id} className="ln" data-link={l.kind} data-from={l.from} data-to={l.to} data-edges={l.edges.join(' ')} data-inferred={l.inferred || undefined} data-faded={faded || undefined} d={l.d} markerEnd={faded ? undefined : marker('ah')} />;
          })}
          {layout.workflow?.steps.map((s, i) => routeShown
            ? <path key={`h${s.from}`} className="halo" d={s.d} pathLength={1} style={{ '--i': i } as CSSProperties} />
            : <path key={`f${s.from}`} className="ln" data-faded d={s.d} />)}
          {routeShown && layout.workflow?.steps.map((s, i) => <path key={`r${s.from}`} className="wf" data-shape={s.shape} d={s.d} pathLength={1} style={{ '--i': i } as CSSProperties} markerEnd={marker('ahr')} />)}
          {lit.map((l) => <path key={l.edge} className="ln-hot" data-edge={l.edge} data-inferred={l.inferred || undefined} d={l.d} markerEnd={marker('ahk')} />)}
        </svg>
        {layout.cards.map((c) => (
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a labelled group of rows
          <div key={c.id} className="rc" role="group" aria-labelledby={`${uid}c-${c.id}`} data-column={c.column} data-dim={cardDim(c) || undefined} style={{ left: c.x, top: c.y, height: c.h, '--col': c.column } as CSSProperties}>
            <h3 className="rc-head" id={`${uid}c-${c.id}`}>
              <span className="rc-name">{names.get(c.id) ?? c.name}</span>
              <span className="rc-count"><span className="visually-hidden">, </span>{c.count}<span className="visually-hidden"> {noun}</span></span>
            </h3>
            {c.rows.map((r) => {
              const op = ops.get(r.op)!;
              return (
                // The stop disc is drawn from data-route by CSS (::after): the name says "workflow step N",
                // and the visible text stays method and id, the start of the name (WCAG 2.5.3).
                <button key={r.op} type="button" className="op" data-nav={r.op} data-op={r.op} data-route={(routeShown && r.stop) || undefined} {...rowAttrs(r)}
                  tabIndex={r.op === stop ? 0 : -1} aria-haspopup="dialog" aria-expanded={r.op === pinned} style={r.stop ? { '--stop': r.stop } as CSSProperties : undefined}
                  aria-label={nodeName(op, r, names.get(c.id) ?? c.name, degree.get(r.op) ?? 0)}
                  onKeyDown={onKeyDown} onFocus={() => onRowFocus(r.op)} onBlur={() => setFocusIn(false)}
                  onClick={() => pin(r.op)} onPointerEnter={() => enter(r.op)} onPointerLeave={leave}>
                  <span className="m" data-destructive={r.destructive || undefined}>{r.method}</span>
                  {/* A space between method and id for the text alternative (flex drops it visually). */}
                  {' '}
                  <span className="id">{r.op}</span>
                  {/* D41/D53: every destructive row (DELETE too) carries an amber warning mark at its right end, left of
                      a stop disc, so ids keep one x; the name says "destructive". */}
                  {r.destructive && <svg className="warn" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path className="warn-bg" d="M6 .9 11.6 10.9H.4Z" /><path className="warn-x" d="M6 4.6v2.9M6 9.1v.05" /></svg>}
                </button>
              );
            })}
            {c.more && (
              <button type="button" className="op more" data-nav={moreId(c.id)} aria-expanded={c.more.expanded}
                data-dim={c.more.hidden.some(isLit) ? undefined : (hot || match) ? true : undefined}
                tabIndex={moreId(c.id) === stop ? 0 : -1} aria-label={`${c.more.count} more ${noun} in ${names.get(c.id) ?? c.name}`}
                onKeyDown={onKeyDown} onFocus={() => onRowFocus(moreId(c.id))} onBlur={() => setFocusIn(false)} onClick={() => toggle(c)}>
                <span className="m"><svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></span>
                <span className="id">{c.more.count} more</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="map-wrap" ref={wrap} data-scrolls={scrolls || undefined}>
      {scrolls ? (
        // A Tab stop so the keyboard can scroll it (axe scrollable-region-focusable); arrows inside move between rows.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex, jsx-a11y/prefer-tag-over-role -- a labelled scroller
        <div className="map-scroll" ref={scroller} role="region" aria-label="Map, scrolls sideways" tabIndex={0}
          style={{ marginLeft: reach.x }}
          onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}>
          {map}
        </div>
      ) : map}
      <p className="visually-hidden" id={`${uid}help`}>Arrow keys move between {noun}, Page Up and Page Down change cluster, E cycles links, Enter pins the operation card, question mark lists every shortcut. The List view shows the same map as text.</p>
      {card && place && (
        <OpCard model={model} graph={graph} op={card} pinned={card.id === pinned} inSkill={skillFile?.(card.id)} onInSkill={onSkillFile}
          onGo={(id) => focusNode(id, true)} onClose={close} announce={announce}
          className={place.flip ? 'flip' : undefined} style={{ left: place.left, top: place.top, maxHeight: place.maxHeight }}
          onPointerEnter={() => clearTimeout(linger.current)} onPointerLeave={card.id === pinned ? undefined : leave} />
      )}
      {graph.clusters.some((c) => c.nameSource === 'ai') && <p className="map-credit" data-testid="names-provenance">Names: AI-drafted</p>}
    </div>
  );
}
