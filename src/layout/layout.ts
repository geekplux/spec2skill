// Deterministic atlas layout (PLAN 5.5): cluster cards packed on shelves, nodes in path-tree +
// CRUD order, edges routed as gutter elbows/arcs inside a card and Béziers between cards.
// Pure and dependency-free; the output is plain JSON, snapshot-tested.
import type { AtlasGraph, Cluster, EdgeKind } from '../graph';
import type { ApiModel, Crud, Operation } from '../model/types';
import { aggregated, clusterLinks, summaryId } from './collapse';
import { type Point, type Rect, bezier, curvePath, elbow, overlaps, pointAt, round, sides } from './geometry';

export const NODE_W = 232;
export const NODE_H = 40;
const GAP = 8, PAD = 16, HEAD = 36, INDENT = 12, MAX_DEPTH = 3, COL_GAP = 16, CARD_GAP = 88, MARGIN = 48;
// Edge labels are mono 12 px (0.6 em a character, 16 px a line).
const LABEL_H = 16, CHAR_W = 7.2, LABEL_T = [0.5, 0.38, 0.62, 0.28, 0.72];

export type NodeState = 'read' | 'mutating' | 'destructive';
export interface LayoutNode extends Rect {
  id: string; cluster: string; depth: number; column: number; state: NodeState;
  /** A collapsed cluster's summary card (its id is `summaryId(cluster)`), not an operation. */
  summary?: true;
}
export interface LayoutCluster extends Rect { id: string; name: string; hubs: { name: string; count: number }[] }
export interface LayoutEdge {
  id: string; kind: EdgeKind; from: string; to: string; d: string;
  /** Curve midpoint (where the shared-schema diamond sits). */
  mid: Point;
  /** Label centre; `shown: false` when it would collide or repeat a nearby label (it appears on highlight). */
  label: Point & { text: string; shown: boolean };
}
/** Drawn instead of many edges: a bundle (node -> cluster card) or counted cluster-to-cluster links. */
export interface LayoutLink { id: string; kind: 'bundle' | 'clusters'; from: string; to: string; d: string; label: Point & { text: string } }
export interface AtlasLayout { nodes: LayoutNode[]; clusters: LayoutCluster[]; edges: LayoutEdge[]; links: LayoutLink[]; bounds: Rect }

/** Read-only, mutating, or destructive (DELETE / destructiveHint): drawn as no bar, a solid bar, a hatched bar + `!`. */
export function nodeState(op: Operation, crud: Crud | undefined): NodeState {
  if (op.method === 'delete' || op.hints.destructive) return 'destructive';
  const reads = op.kind === 'tool' ? (op.hints.readOnly ?? (crud === 'list' || crud === 'read')) : ['get', 'head', 'options'].includes(op.method!);
  return reads ? 'read' : 'mutating';
}

/** Path-tree order (parents before children, depth = in-cluster ancestors) keeping the cluster's CRUD order among siblings. */
function treeOrder(ops: Operation[]): { op: Operation; depth: number }[] {
  const keys = [...new Set(ops.map((op) => op.path ?? op.id))];
  const parent = (key: string) => {
    const s = key.split('/');
    for (let end = s.length - 1; end > 1; end--) if (keys.includes(s.slice(0, end).join('/'))) return s.slice(0, end).join('/');
    return undefined;
  };
  const out: { op: Operation; depth: number }[] = [];
  const visit = (key: string, depth: number): void => {
    for (const op of ops) if ((op.path ?? op.id) === key) out.push({ op, depth: Math.min(depth, MAX_DEPTH) });
    for (const child of keys) if (parent(child) === key) visit(child, depth + 1);
  };
  for (const key of keys) if (parent(key) === undefined) visit(key, 0);
  return out;
}

const pairKey = (from: string, to: string) => (from < to ? `${from} ${to}` : `${to} ${from}`);

const byName = (a: Cluster, b: Cluster) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const bySize = (a: Cluster, b: Cluster) => b.operationIds.length - a.operationIds.length || byName(a, b);

/** Largest cluster first, then greedily the one with the most edges to those already placed (ties by name). */
export function cardOrder(graph: AtlasGraph): Cluster[] {
  const near = new Map<string, Map<string, number>>();
  for (const { from, to, count } of clusterLinks(graph)) {
    near.set(from, (near.get(from) ?? new Map()).set(to, count));
    near.set(to, (near.get(to) ?? new Map()).set(from, count));
  }
  const left = graph.clusters.toSorted(bySize);
  const pull = new Map<string, number>();
  const out: Cluster[] = [];
  while (left.length > 0) {
    let best = 0;
    for (let i = 1; out.length > 0 && i < left.length; i++) {
      const d = (pull.get(left[i]!.id) ?? 0) - (pull.get(left[best]!.id) ?? 0);
      if (d > 0 || (d === 0 && byName(left[i]!, left[best]!) < 0)) best = i;
    }
    const [next] = left.splice(best, 1) as [Cluster];
    out.push(next);
    for (const [id, n] of near.get(next.id) ?? []) pull.set(id, (pull.get(id) ?? 0) + n);
  }
  return out;
}

/** A Bézier from anchor `pa` (box `ca`) to anchor `pb` (box `cb`) through facing sides, round the right when stacked. */
function across(pa: Rect, ay: number, ca: Rect, pb: Rect, by: number, cb: Rect): Point[] {
  const [da, db] = sides(ca, cb);
  const [p, q] = [{ x: da > 0 ? pa.x + pa.w : pa.x, y: ay }, { x: db > 0 ? pb.x + pb.w : pb.x, y: by }];
  const loop = da === db ? Math.max(ca.x + ca.w, cb.x + cb.w) + 24 : 0;
  const bend = (from: number) => (loop ? (loop - from) / 0.75 : Math.max(48, Math.abs(q.x - p.x) / 2));
  return bezier(p, da * bend(p.x), q, db * bend(q.x));
}

/** `collapsed` clusters are drawn as one summary card each; their edges are left out. */
export function layout(model: ApiModel, graph: AtlasGraph, collapsed: ReadonlySet<string> = new Set()): AtlasLayout {
  const ops = new Map(model.operations.map((op) => [op.id, op]));
  const nodes = new Map<string, LayoutNode>();
  const clusters: LayoutCluster[] = [];

  // Cards in greedy order, packed left to right on shelves of width sqrt(area * 1.6), gaps included.
  const cards = cardOrder(graph).map((c) => {
    const items = collapsed.has(c.id) ? [{ op: undefined, depth: 0 }] : treeOrder(c.operationIds.map((id) => ops.get(id)!));
    const cols = items.length <= 10 ? 1 : items.length <= 30 ? 2 : 3;
    const perCol = Math.ceil(items.length / cols);
    const colW = NODE_W + INDENT * Math.max(0, ...items.map((i) => i.depth));
    const w = 2 * PAD + cols * colW + (cols - 1) * COL_GAP;
    return { c, items, perCol, colW, w, h: HEAD + PAD / 2 + perCol * (NODE_H + GAP) - GAP + PAD };
  });
  const target = Math.sqrt(cards.reduce((sum, k) => sum + (k.w + CARD_GAP) * (k.h + CARD_GAP), 0) * 1.6);
  let x = 0, y = 0, rowH = 0;
  for (const { c, items, perCol, colW, w, h } of cards) {
    if (x > 0 && x + w > target) [x, y, rowH] = [0, y + rowH + CARD_GAP, 0];
    const users = (hub: string) =>
      c.operationIds.filter((id) => {
        const op = ops.get(id)!;
        return [op.requestBody?.schema, ...op.responses.map((r) => r.schema)].some((s) => s?.ref === hub || s?.items?.ref === hub);
      }).length;
    const hubs = graph.hubSchemas.map((hub) => ({ name: hub.name, count: users(hub.name) })).filter((hub) => hub.count > 0);
    clusters.push({ id: c.id, name: c.name, x, y, w, h, hubs });
    items.forEach(({ op, depth }, i) => {
      const column = Math.floor(i / perCol);
      const nx = x + PAD + column * (colW + COL_GAP) + depth * INDENT;
      const ny = y + HEAD + PAD / 2 + (i % perCol) * (NODE_H + GAP);
      const at = { cluster: c.id, depth, column, x: nx, y: ny, w: NODE_W, h: NODE_H };
      if (op) nodes.set(op.id, { id: op.id, ...at, state: nodeState(op, graph.crud[op.id]) });
      else nodes.set(summaryId(c.id), { id: summaryId(c.id), ...at, state: 'read', summary: true });
    });
    [x, rowH] = [x + w + CARD_GAP, Math.max(rowH, h)];
  }

  // Edges, in graph order. Labels avoid nodes, card headers and earlier labels, else wait for a highlight.
  const card = new Map(clusters.map((c) => [c.id, c]));
  const blocked: Rect[] = [...nodes.values(), ...clusters.map((c) => ({ ...c, h: HEAD }))];
  const pairs = new Map<string, string[]>();
  for (const e of graph.edges) pairs.set(pairKey(e.from, e.to), [...(pairs.get(pairKey(e.from, e.to)) ?? []), e.id]);
  const arcs = new Map<string, number>();
  const said = new Set<string>(); // one visible copy of a label per kind and cluster pair
  const many = aggregated(graph); // labels only on highlight, links between clusters instead
  const edges = graph.edges.filter((e) => nodes.has(e.from) && nodes.has(e.to)).map((e): LayoutEdge => {
    const [a, b] = [nodes.get(e.from)!, nodes.get(e.to)!];
    const pair = pairs.get(pairKey(e.from, e.to))!;
    const dy = (pair.indexOf(e.id) - (pair.length - 1) / 2) * 6;
    const [ay, by] = [a.y + NODE_H / 2 + dy, b.y + NODE_H / 2 + dy];
    const text = e.kind === 'sub-path' ? 'sub-path' : e.label;
    const lw = text.length * CHAR_W + 6;
    let d: string, mid: Point, spots: Point[];
    const home = card.get(a.cluster)!;
    if (a.cluster === b.cluster && a.column === b.column && e.kind === 'sub-path') {
      ({ d, mid } = elbow({ x: a.x, y: ay }, { x: b.x, y: by }, Math.min(a.x, b.x) - 8));
      spots = [0.5, 0.25, 0.75].map((f) => ({ x: home.x - lw / 2 - 3, y: ay + (by - ay) * f }));
    } else if (a.cluster === b.cluster && a.column === b.column) {
      const j = arcs.get(a.cluster) ?? 0;
      arcs.set(a.cluster, j + 1);
      const reach = home.x + home.w + 10 + 6 * (j % 5);
      const c = bezier({ x: a.x + NODE_W, y: ay }, (reach - a.x - NODE_W) / 0.75, { x: b.x + NODE_W, y: by }, (reach - b.x - NODE_W) / 0.75);
      [d, mid] = [curvePath(c), pointAt(c, 0.5)];
      spots = LABEL_T.map((t) => ({ x: pointAt(c, t).x + lw / 2 + 3, y: pointAt(c, t).y }));
    } else {
      const box = (n: LayoutNode) => (n.cluster === a.cluster && n.cluster === b.cluster ? n : card.get(n.cluster)!);
      const c = across(a, ay, box(a), b, by, box(b));
      [d, mid] = [curvePath(c), pointAt(c, 0.5)];
      spots = LABEL_T.map((t) => pointAt(c, t));
    }
    if (e.kind === 'shared-schema') spots = spots.map((s) => ({ x: s.x, y: s.y - 10 })); // clear the midpoint diamond
    const repeat = `${e.kind} ${text} ${a.cluster} ${b.cluster}`;
    const box = (s: Point): Rect => ({ x: s.x - lw / 2, y: s.y - LABEL_H / 2, w: lw, h: LABEL_H });
    const fit = said.has(repeat) || many || e.bundledInto ? undefined : spots.find((s) => !blocked.some((r) => overlaps(r, box(s))));
    if (fit) {
      blocked.push(box(fit));
      said.add(repeat);
    }
    const at = fit ?? spots[0]!;
    return {
      id: e.id, kind: e.kind, from: e.from, to: e.to, d,
      mid: { x: round(mid.x), y: round(mid.y) },
      label: { x: round(at.x), y: round(at.y), text, shown: fit !== undefined },
    };
  });

  // Bundles run from their source node to the fed cluster's header; aggregated links join card headers.
  const link = (id: string, kind: LayoutLink['kind'], from: string, to: string, pa: Rect, ay: number, ca: Rect, text: string): LayoutLink => {
    const b = card.get(to)!;
    const c = across(pa, ay, ca, b, b.y + HEAD / 2, b);
    // Always labelled: the first spot just above the curve clear of nodes, headers and other labels.
    const lw = text.length * CHAR_W + 6;
    const box = (p: Point): Rect => ({ x: p.x - lw / 2, y: p.y - LABEL_H / 2, w: lw, h: LABEL_H });
    const spots = LABEL_T.map((t) => ({ x: pointAt(c, t).x, y: pointAt(c, t).y - LABEL_H / 2 - 2 })); // above the line
    const at = spots.find((p) => !blocked.some((r) => overlaps(r, box(p)))) ?? spots[0]!;
    blocked.push(box(at));
    return { id, kind, from, to, d: curvePath(c), label: { x: round(at.x), y: round(at.y), text } };
  };
  const links = graph.bundles.filter((b) => nodes.has(b.from)).map((b) => {
    const n = nodes.get(b.from)!;
    return link(b.id, 'bundle', b.from, b.cluster, n, n.y + NODE_H / 2, card.get(n.cluster)!, `${b.param} -> ${b.edges.length} ops`);
  });
  if (many) {
    for (const l of clusterLinks(graph)) {
      const a = card.get(l.from)!;
      links.push(link(`clusters:${l.from}->${l.to}`, 'clusters', l.from, l.to, a, a.y + HEAD / 2, a, `${l.count} links`));
    }
  }

  const [right, bottom] = [Math.max(0, ...clusters.map((c) => c.x + c.w)), Math.max(0, ...clusters.map((c) => c.y + c.h))];
  return { nodes: [...nodes.values()], clusters, edges, links, bounds: { x: -MARGIN, y: -MARGIN, w: right + 2 * MARGIN, h: bottom + 2 * MARGIN } };
}
