// The route map layout (docs/redesign/DESIGN.md 5): resource cards in columns by dependency on the
// 4 x 202 / 88 grid, operations as 32 px rows in CRUD order (8 at most, then "N more"), the
// strongest workflow as one straight line across the main-line cards, feed links and bundles
// between columns, and the hover-only links on demand. Pure and deterministic; plain JSON out.
import type { AtlasGraph, Cluster, EdgeKind } from '../graph';
import type { ApiModel, Operation } from '../model/types';
import type { Chain } from '../skillgen/types';
import { topChains } from '../skillgen/graph-chains';
import { type Rect, round } from './geometry';
import { clusterFeeds, columnsOf } from './route-columns';
import { type Lane, Pen, type Span, openReach, routeWires, samplePath } from './route-path';

export const CARD_W = 202;
export const COLUMN_GAP = 88;
export const COLUMN_STEP = CARD_W + COLUMN_GAP;
export const HEAD = 36;
export const ROW = 32;
/** Card padding under the last row; rows sit 4 px in from the card's sides. */
export const CARD_PAD = 4;
export const ROW_INSET = 4;
/** Rows a collapsed card shows before its "N more" row. */
export const MAX_ROWS = 8;
/** Clearance between stacked cards, and between a card and a main-line row it would cross. */
export const CLEARANCE = 32;
/** How far the workflow's same-card loop bulges out of the card's left edge. */
export const LOOP_OUT = 32;
/** Columns the frame shows before the map scrolls sideways. */
export const VISIBLE_COLUMNS = 4;
const STOP_R = 9;
/** Half the workflow halo (6 px): the main line's band is its row plus this, each side. */
const HALO = 3;
/** The farthest a hover loop bulges out of a card's side (0.75 of its 48 px handle). */
export const HOVER_REACH = 36;

export interface RouteRow extends Rect {
  op: string;
  /** Row centre: where links attach. */
  cy: number;
  /** HTTP method in capitals; MCP tools: `read` or `write` (D41). */
  method: string;
  /** DELETE or a destructive hint: the method text is amber (and R4 adds a non-colour cue, D41). */
  destructive: boolean;
  /** Its number on the strongest workflow. */
  stop?: number;
}
export interface RouteMore extends Rect {
  cy: number;
  /** Operations not shown while collapsed (in CRUD order); empty when expanded. */
  hidden: string[];
  /** How many rows the cap holds back: the N of "N more". */
  count: number;
  expanded: boolean;
}
export interface RouteCard extends Rect {
  id: string;
  name: string;
  column: number;
  /** Holds a cross-card stop of the strongest workflow: its line row sits on the main line. */
  main: boolean;
  /** Operations in the cluster. */
  count: number;
  rows: RouteRow[];
  more?: RouteMore;
}
/** A link drawn at rest: a feed between columns (row to row) or a bundle (row to card head). */
export interface RouteLink {
  id: string;
  kind: 'feed' | 'bundle';
  from: string;
  /** Operation id (feed) or cluster id (bundle). */
  to: string;
  /** The graph's feeds edges it stands for (several when hidden rows share the "N more" row). */
  edges: string[];
  /** Every edge it stands for is inferred: drawn dashed. */
  inferred: boolean;
  d: string;
}
export interface RouteStop { op: string; n: number; cx: number; cy: number }
export interface RouteStep {
  from: string;
  to: string;
  /** `line`: straight across columns; `loop`: same card, out of its left edge; `curve`: anything else. */
  shape: 'line' | 'loop' | 'curve';
  d: string;
}
export interface RouteWorkflow extends Chain {
  stops: RouteStop[];
  steps: RouteStep[];
  /** The main line's y (row centre of the first cross-card step). */
  y: number;
}
export interface RouteLayout {
  cards: RouteCard[];
  links: RouteLink[];
  workflow?: RouteWorkflow;
  columns: { index: number; x: number; cards: string[] }[];
  /** Cards' extent from (0, 0); links and loops may reach outside it, see `bounds`. */
  width: number;
  height: number;
  /** Everything drawn at rest, loops included; `hoverBounds` adds what hover links can reach. */
  bounds: Rect;
  /** More than four columns: the frame scrolls sideways. */
  scrolls: boolean;
}
export interface HoverLink {
  edge: string;
  kind: EdgeKind;
  from: string;
  to: string;
  inferred: boolean;
  d: string;
}
export interface RouteOptions {
  /** Clusters whose "N more" row is open. */
  expanded?: ReadonlySet<string>;
  /** The strongest workflow; default `topChains(model, graph, 1)[0]`. `null`: none. */
  chain?: Chain | null;
}

/** Method text and tone of a row (D41). */
export function methodOf(op: Operation, crud: string | undefined): { method: string; destructive: boolean } {
  const destructive = op.method === 'delete' || op.hints.destructive === true;
  if (op.method) return { method: op.method.toUpperCase(), destructive };
  const reads = op.hints.readOnly ?? (crud === 'list' || crud === 'read');
  return { method: reads ? 'read' : 'write', destructive };
}

const cardHeight = (rows: number) => HEAD + rows * ROW + CARD_PAD;
const bySize = (order: Map<string, number>) => (a: Cluster, b: Cluster) =>
  b.operationIds.length - a.operationIds.length || order.get(a.id)! - order.get(b.id)!;

/** Which operations a card shows: all when open or short, else the first 8 in CRUD order, workflow stops kept. */
function shown(c: Cluster, open: boolean, keep: ReadonlySet<string>): { rows: string[]; hidden: string[]; count: number } {
  const ids = c.operationIds;
  if (ids.length <= MAX_ROWS) return { rows: ids, hidden: [], count: 0 };
  if (open) return { rows: ids, hidden: [], count: ids.length - MAX_ROWS };
  const pinned = ids.filter((id) => keep.has(id)).slice(0, MAX_ROWS);
  const fill = new Set([...pinned, ...ids.filter((id) => !keep.has(id)).slice(0, MAX_ROWS - pinned.length)]);
  const rows = ids.filter((id) => fill.has(id));
  return { rows, hidden: ids.filter((id) => !fill.has(id)), count: ids.length - rows.length };
}

interface Draft { c: Cluster; column: number; rows: string[]; hidden: string[]; count: number; open: boolean; h: number; top: number; main: boolean }

export function routeLayout(model: ApiModel, graph: AtlasGraph, options: RouteOptions = {}): RouteLayout {
  const ops = new Map(model.operations.map((op) => [op.id, op]));
  const order = new Map(graph.clusters.map((c, i) => [c.id, i]));
  const home = new Map(graph.clusters.flatMap((c) => c.operationIds.map((id) => [id, c.id] as const)));
  const chain = options.chain === undefined ? topChains(model, graph, 1)[0] : (options.chain ?? undefined);
  const asked = chain?.ops.filter((id) => home.has(id)) ?? [];
  const mainOrder = [...new Set(asked.map((id) => home.get(id)!))];
  const column = columnsOf(graph, mainOrder);
  // The workflow runs forward only: it ends before a step into a resource that is not further right.
  let route = asked;
  for (let i = 1; i < asked.length; i++) {
    const [a, b] = [home.get(asked[i - 1]!)!, home.get(asked[i]!)!];
    if (a !== b && column.get(b)! <= column.get(a)!) {
      route = asked.slice(0, i);
      break;
    }
  }
  if (route.length < 2) route = [];
  const keep = new Set(route);

  const drafts = new Map<string, Draft>(
    graph.clusters.map((c) => {
      const open = options.expanded?.has(c.id) ?? false;
      const s = shown(c, open, keep);
      const h = cardHeight(s.rows.length + (s.count > 0 ? 1 : 0));
      return [c.id, { c, column: column.get(c.id) ?? 0, ...s, open, h, top: 0, main: false }];
    }),
  );
  spreadUnlinked(graph, drafts, new Set(mainOrder), order);
  const rowIndex = (id: string) => drafts.get(home.get(id)!)!.rows.indexOf(id);
  const rowCentre = (id: string, top: number) => top + HEAD + rowIndex(id) * ROW + ROW / 2;

  // The main line at y = 0 for now: each main card puts its line row (the stop where the line
  // leaves the first card, or enters any later one) on it.
  const lineRow = new Map<string, string>();
  route.forEach((id, i) => {
    const prev = route[i - 1];
    if (prev === undefined || home.get(prev) === home.get(id)) return;
    if (!lineRow.has(home.get(prev)!)) lineRow.set(home.get(prev)!, prev);
    if (!lineRow.has(home.get(id)!)) lineRow.set(home.get(id)!, id);
  });
  if (route.length > 0 && lineRow.size === 0) lineRow.set(home.get(route[0]!)!, route[0]!); // one card: its first stop
  for (const [cid, id] of lineRow) {
    const d = drafts.get(cid)!;
    d.main = true;
    d.top = -(rowCentre(id, 0));
  }

  // Columns the main line passes through between two main cards: a reserved band around it.
  const columns = [...new Set([...drafts.values()].map((d) => d.column))].toSorted((a, b) => a - b);
  const band = new Map<number, [number, number]>();
  const reserve = (col: number, top: number, bottom: number) => {
    const b = band.get(col);
    band.set(col, b ? [Math.min(b[0], top), Math.max(b[1], bottom)] : [top, bottom]);
  };
  for (const d of drafts.values()) if (d.main) reserve(d.column, d.top, d.top + d.h);
  for (let i = 1; i < route.length; i++) {
    const [a, b] = [drafts.get(home.get(route[i - 1]!)!)!, drafts.get(home.get(route[i]!)!)!];
    if (a === b) continue;
    const y = rowCentre(route[i - 1]!, a.top);
    for (let col = Math.min(a.column, b.column) + 1; col < Math.max(a.column, b.column); col++) reserve(col, y - ROW / 2, y + ROW / 2);
  }

  // Stack the other cards of each column, biggest first, alternating around what is reserved.
  for (const col of columns) {
    const rest = graph.clusters
      .filter((c) => drafts.get(c.id)!.column === col && !drafts.get(c.id)!.main)
      .toSorted(bySize(order))
      .map((c) => drafts.get(c.id)!);
    let reserved = band.get(col);
    let aboveFirst = reserved !== undefined && ![...drafts.values()].some((d) => d.main && d.column === col);
    if (!reserved && rest.length > 0) {
      // Not on the main line: the biggest card's first row sits on it (or at the top without a workflow).
      const anchor = rest.shift()!;
      anchor.top = route.length > 0 ? -(HEAD + ROW / 2) : 0;
      reserved = [anchor.top, anchor.top + anchor.h];
      aboveFirst = false;
    }
    if (!reserved) continue;
    let [up, down] = [reserved[0] - CLEARANCE, reserved[1] + CLEARANCE];
    rest.forEach((d, i) => {
      const above = route.length > 0 && (i % 2 === 0) === aboveFirst;
      if (above) {
        d.top = up - d.h;
        up = d.top - CLEARANCE;
      } else {
        d.top = down;
        down = d.top + d.h + CLEARANCE;
      }
    });
  }

  // Shift so the highest card's top is 0, then write the cards.
  const all = [...drafts.values()];
  if (all.length > 0) {
    const shift = -Math.min(...all.map((d) => d.top));
    for (const d of all) d.top += shift;
  }
  const stopOf = new Map(route.map((id, i) => [id, i + 1]));
  const cards: RouteCard[] = all
    .toSorted((a, b) => a.column - b.column || a.top - b.top)
    .map((d) => {
      const x = d.column * COLUMN_STEP;
      const rows = d.rows.map((id, i): RouteRow => {
        const y = d.top + HEAD + i * ROW;
        const stop = stopOf.get(id);
        return {
          op: id, x: x + ROW_INSET, y, w: CARD_W - 2 * ROW_INSET, h: ROW, cy: y + ROW / 2,
          ...methodOf(ops.get(id)!, graph.crud[id]), ...(stop ? { stop } : {}),
        };
      });
      const card: RouteCard = { id: d.c.id, name: d.c.name, column: d.column, x, y: d.top, w: CARD_W, h: d.h, main: d.main, count: d.c.operationIds.length, rows };
      if (d.count > 0) {
        const y = d.top + HEAD + d.rows.length * ROW;
        card.more = { x: x + ROW_INSET, y, w: CARD_W - 2 * ROW_INSET, h: ROW, cy: y + ROW / 2, hidden: d.hidden, count: d.count, expanded: d.open };
      }
      return card;
    });

  const plain = buildIndex(cards);
  const workflow = chain && route.length > 1 ? workflowOf(chain, route, plain) : undefined;
  const links = restLinks(graph, buildIndex(cards, workflow), route);

  const width = columns.length === 0 ? 0 : (columns.at(-1)! + 1) * COLUMN_STEP - COLUMN_GAP;
  const height = Math.max(0, ...cards.map((c) => c.y + c.h));
  let [x0, y0, x1, y1] = [0, 0, width, height];
  for (const d of [...links.map((l) => l.d), ...(workflow?.steps.map((s) => s.d) ?? [])]) {
    for (const p of samplePath(d)) [x0, y0, x1, y1] = [Math.min(x0, p.x), Math.min(y0, p.y), Math.max(x1, p.x), Math.max(y1, p.y)];
  }
  return {
    cards,
    links,
    ...(workflow ? { workflow } : {}),
    columns: columns.map((col) => ({ index: col, x: col * COLUMN_STEP, cards: cards.filter((c) => c.column === col).map((c) => c.id) })),
    width,
    height,
    bounds: { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) },
    scrolls: columns.length > VISIBLE_COLUMNS,
  };
}

/**
 * Resources with no feeds to or from another resource have no dependency to place them by: they go
 * to the shortest of the first four columns (or of all columns, when there are more), biggest
 * first, instead of piling up in column 0 (D43).
 */
function spreadUnlinked(graph: AtlasGraph, drafts: Map<string, Draft>, main: ReadonlySet<string>, order: Map<string, number>): void {
  const linked = new Set<string>();
  for (const [a, targets] of clusterFeeds(graph)) {
    if (targets.size > 0) linked.add(a);
    for (const b of targets) linked.add(b);
  }
  const loose = graph.clusters.filter((c) => !linked.has(c.id) && !main.has(c.id)).toSorted(bySize(order));
  if (loose.length === 0) return;
  const placed = [...drafts.values()].filter((d) => !loose.includes(d.c));
  const count = Math.max(VISIBLE_COLUMNS, ...placed.map((d) => d.column + 1));
  const height = Array.from({ length: count }, (_, col) =>
    placed.filter((d) => d.column === col).reduce((sum, d) => sum + d.h + CLEARANCE, 0),
  );
  for (const c of loose) {
    const col = height.indexOf(Math.min(...height));
    drafts.get(c.id)!.column = col;
    height[col]! += drafts.get(c.id)!.h + CLEARANCE;
  }
}

/** Where each operation attaches: its row, or its card's "N more" row while hidden. */
interface Anchor { card: RouteCard; y: number }
interface Index {
  anchor: Map<string, Anchor>;
  lanes: Map<number, Lane>;
  /** Columns the main line passes through (between main cards). */
  banded: Set<number>;
}

/**
 * Anchors and lanes. With a workflow, every column its straight line passes through also blocks
 * the line's band (row +- 16 + 3 halo), so links keep off the line between main cards.
 */
function buildIndex(cards: readonly RouteCard[], workflow?: RouteWorkflow): Index {
  const anchor = new Map<string, Anchor>();
  const spans = new Map<number, Span[]>();
  for (const card of cards) {
    for (const r of card.rows) anchor.set(r.op, { card, y: r.cy });
    if (card.more) for (const id of card.more.hidden) anchor.set(id, { card, y: card.more.cy });
    spans.set(card.column, [...(spans.get(card.column) ?? []), { top: card.y, bottom: card.y + card.h }]);
  }
  const banded = new Set<number>();
  for (const step of workflow?.steps ?? []) {
    if (step.shape !== 'line') continue;
    const [a, b] = [anchor.get(step.from)!, anchor.get(step.to)!];
    for (let col = a.card.column + 1; col < b.card.column; col++) {
      spans.get(col)?.push({ top: a.y - ROW / 2 - HALO, bottom: a.y + ROW / 2 + HALO });
      banded.add(col);
    }
  }
  const lanes = new Map<number, Lane>();
  for (const [col, list] of spans) lanes.set(col, { x: col * COLUMN_STEP, w: CARD_W, spans: list.toSorted((p, q) => p.top - q.top) });
  return { anchor, lanes, banded };
}

const lanesBetween = (index: Index, a: number, b: number): Lane[] => {
  const out: Lane[] = [];
  if (a < b) for (let col = a + 1; col < b; col++) out.push(index.lanes.get(col)!);
  else for (let col = a - 1; col > b; col--) out.push(index.lanes.get(col)!);
  return out.filter(Boolean);
};

/**
 * Paths between anchor pairs drawn together: same card, a loop out of the left edge; same column,
 * out of the right edge; else across the columns between (route-path.ts routeWires), forward from
 * right edge to left edge, backward from left edge to right edge. A link passing the main line's
 * columns stays on one side of the line there: the side of its far end when it leaves a main card
 * (it crosses the line in the gap it leaves by), else the side of its start (it crosses, if at
 * all, in the gap it arrives by); it never takes the direct curve, which could cross in between.
 */
function draw(index: Index, pairs: readonly (readonly [Anchor, Anchor])[]): string[] {
  const wires = pairs.map(([a, b]) => {
    if (a.card === b.card || a.card.column === b.card.column) return undefined;
    const forward = b.card.column > a.card.column;
    const lanes = lanesBetween(index, a.card.column, b.card.column);
    const banded = lanes.some((l) => index.banded.has(l.x / COLUMN_STEP));
    return {
      from: { x: forward ? a.card.x + CARD_W : a.card.x, y: a.y },
      to: { x: forward ? b.card.x : b.card.x + CARD_W, y: b.y },
      lanes,
      ...(banded ? { ideal: a.card.main ? b.y : a.y, direct: false } : {}),
    };
  });
  const across = routeWires(wires.filter((w) => w !== undefined));
  let k = 0;
  return pairs.map(([a, b], i) => {
    if (wires[i]) return across[k++]!;
    if (a.card === b.card) {
      return new Pen({ x: a.card.x, y: a.y }).loop({ x: a.card.x, y: b.y }, -Math.min(48, 20 + Math.abs(a.y - b.y) / 6)).d;
    }
    const right = a.card.x + CARD_W;
    return new Pen({ x: right, y: a.y }).loop({ x: right, y: b.y }, Math.min(48, 24 + Math.abs(a.y - b.y) / 8)).d;
  });
}

function restLinks(graph: AtlasGraph, index: Index, route: string[]): RouteLink[] {
  const onLine = new Set(route.slice(1).map((id, i) => `${route[i]} ${id}`));
  // A bundle holding a workflow step would run on top of the line: its edges show on hover only.
  const covered = new Set(graph.edges.filter((e) => e.bundledInto && onLine.has(`${e.from} ${e.to}`)).map((e) => e.bundledInto));
  const links = new Map<string, RouteLink & { ends: readonly [Anchor, Anchor] }>();
  const bundles = new Map(graph.bundles.map((b) => [b.id, b]));
  for (const e of graph.edges) {
    if (e.kind !== 'feeds' || onLine.has(`${e.from} ${e.to}`) || covered.has(e.bundledInto)) continue;
    const [a, b] = [index.anchor.get(e.from), index.anchor.get(e.to)];
    if (!a || !b || b.card.column <= a.card.column) continue; // same column and backward: on hover only
    const bundle = e.bundledInto ? bundles.get(e.bundledInto) : undefined;
    const key = bundle ? bundle.id : `${a.card.id}:${a.y} ${b.card.id}:${b.y}`;
    const known = links.get(key);
    if (known) {
      known.edges.push(e.id);
      known.inferred &&= e.confidence === 'inferred';
      continue;
    }
    links.set(key, {
      id: bundle ? bundle.id : `feed:${e.from}->${e.to}`,
      kind: bundle ? 'bundle' : 'feed',
      from: e.from,
      to: bundle ? bundle.cluster : e.to,
      edges: [e.id],
      inferred: e.confidence === 'inferred',
      d: '',
      ends: [a, bundle ? { card: b.card, y: b.card.y + HEAD / 2 } : b],
    });
  }
  const list = [...links.values()];
  const paths = draw(index, list.map((l) => l.ends));
  return list.map((l, i) => ({ id: l.id, kind: l.kind, from: l.from, to: l.to, edges: l.edges, inferred: l.inferred, d: paths[i]! }));
}

function workflowOf(chain: Chain, route: string[], index: Index): RouteWorkflow {
  const kept = { ops: route, via: chain.via.slice(0, route.length - 1), inferred: chain.inferred.slice(0, route.length - 1) };
  const stops = route.map((op, i): RouteStop => {
    const { card, y } = index.anchor.get(op)!;
    return { op, n: i + 1, cx: card.x + CARD_W - ROW_INSET - 6 - STOP_R, cy: y };
  });
  const steps = route.slice(1).map((to, i): RouteStep => {
    const from = route[i]!;
    const [a, b] = [index.anchor.get(from)!, index.anchor.get(to)!];
    if (a.card === b.card) return { from, to, shape: 'loop', d: new Pen({ x: a.card.x, y: a.y }).loop({ x: a.card.x, y: b.y }, -LOOP_OUT).d };
    const straight = a.y === b.y && b.card.column > a.card.column;
    return { from, to, shape: straight ? 'line' : 'curve', d: draw(index, [[a, b]])[0]! };
  });
  const first = steps.find((s) => s.shape !== 'loop');
  return { ...kept, stops, steps, y: first ? index.anchor.get(first.from)!.y : stops[0]!.cy };
}

/**
 * Every link of one operation, for hover and focus: its feeds both ways (same card, same column,
 * backward included), sub-path and shared-schema links. Ends on hidden rows attach to "N more".
 * The links are routed together, so they do not share a track; `hoverBounds` holds them all.
 */
export function hoverLinks(layout: RouteLayout, graph: AtlasGraph, op: string): HoverLink[] {
  const index = buildIndex(layout.cards, layout.workflow);
  const found: { e: AtlasGraph['edges'][number]; ends: readonly [Anchor, Anchor] }[] = [];
  for (const e of graph.edges) {
    if (e.from !== op && e.to !== op) continue;
    const [a, b] = [index.anchor.get(e.from), index.anchor.get(e.to)];
    if (a && b && !(a.card === b.card && a.y === b.y)) found.push({ e, ends: [a, b] });
  }
  const paths = draw(index, found.map((f) => f.ends));
  return found.map(({ e }, i) => ({ edge: e.id, kind: e.kind, from: e.from, to: e.to, inferred: e.confidence === 'inferred', d: paths[i]! }));
}

/**
 * The box every hover link of any operation stays in: `bounds` plus the loops' reach left of the
 * first column and right of the last, and the open corridors above and below the cards, as deep
 * as the operation with the most links could fill them.
 */
export function hoverBounds(layout: RouteLayout, graph: AtlasGraph): Rect {
  const count = new Map<string, number>();
  for (const e of graph.edges) for (const id of new Set([e.from, e.to])) count.set(id, (count.get(id) ?? 0) + 1);
  const reach = openReach(Math.max(0, ...count.values()));
  const b = layout.bounds;
  const [x0, y0] = [Math.min(b.x, -HOVER_REACH), Math.min(b.y, -reach)];
  const [x1, y1] = [Math.max(b.x + b.w, layout.width + HOVER_REACH), Math.max(b.y + b.h, layout.height + reach)];
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
