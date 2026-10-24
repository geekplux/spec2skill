// Keyboard navigation for the route map (PLAN phase 7, A1/A2; redesign R4). Pure: given the route
// layout's rows, the focused row and a key, what should happen; plus the words screen readers hear.
import type { Edge } from '../graph';
import { counted } from '../graph/words';
import type { RouteLayout, RouteRow } from '../layout/route';
import type { Operation } from '../model/types';

export type Action =
  | { type: 'focus'; id: string }
  | { type: 'edge'; index: number | null }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'help' };

/** A place keyboard focus can rest: an operation row, or a card's "N more" row (`more:<card>`). */
export interface NavNode { id: string; card: string; x: number; y: number; w: number; h: number; more?: boolean }
/** Rows in reading order: cards by column, then top to bottom. */
export interface NavMap { nodes: NavNode[]; cards: string[] }

export interface NavState {
  focus: NavNode | undefined;
  /** The focused operation's edges (in graph order) and the one `E` has highlighted. */
  edges: Edge[];
  edge: number | null;
}

const DIRS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** The id of a card's "N more" row. */
export const moreId = (card: string): string => `more:${card}`;

/**
 * Where focus can go: every row, and each "N more" row; while a search narrows the map (`match`),
 * only matching rows, and a "N more" row only while it hides a match.
 */
export function navOf(layout: RouteLayout, match: Set<string> | null): NavMap {
  const nodes: NavNode[] = [];
  for (const c of layout.cards) {
    for (const r of c.rows) if (!match || match.has(r.op)) nodes.push({ id: r.op, card: c.id, x: r.x, y: r.y, w: r.w, h: r.h });
    const m = c.more;
    if (m && (!match || m.hidden.some((id) => match.has(id)))) nodes.push({ id: moreId(c.id), card: c.id, x: m.x, y: m.y, w: m.w, h: m.h, more: true });
  }
  return { nodes, cards: layout.cards.map((c) => c.id).filter((id) => nodes.some((n) => n.card === id)) };
}

const centre = (n: NavNode) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

/** The nearest row in a direction: inside the 45° cone if any, else anywhere ahead; sideways offset counts double. */
export function nearest(nodes: NavNode[], from: NavNode, [dx, dy]: [number, number]): NavNode | undefined {
  const o = centre(from);
  let best: NavNode | undefined;
  let bestScore = Infinity;
  for (const n of nodes) {
    const c = centre(n);
    const ahead = (c.x - o.x) * dx + (c.y - o.y) * dy;
    const side = Math.abs((c.x - o.x) * dy - (c.y - o.y) * dx);
    if (n === from || ahead <= 0) continue;
    const score = ahead + 2 * side + (side > ahead ? 1e6 : 0);
    if (score < bestScore) [best, bestScore] = [n, score];
  }
  return best;
}

export const edgesOf = (edges: Edge[], id: string): Edge[] => edges.filter((e) => e.from === id || e.to === id);
export const otherEnd = (e: Edge, id: string): string => (e.from === id ? e.to : e.from);

export function keyAction(nav: NavMap, s: NavState, key: string): Action | null {
  if (key === '?') return { type: 'help' };
  const at = s.focus;
  if (!at) return null;
  const to = (n: NavNode | undefined): Action | null => (n && n !== at ? { type: 'focus', id: n.id } : null);
  const dir = DIRS[key];
  if (dir) return to(nearest(nav.nodes, at, dir));
  const peers = nav.nodes.filter((n) => n.card === at.card);
  switch (key) {
    case 'Home':
      return to(peers[0]);
    case 'End':
      return to(peers.at(-1));
    case 'PageUp':
    case 'PageDown': {
      const ids = nav.cards;
      const next = ids[(ids.indexOf(at.card) + (key === 'PageDown' ? 1 : ids.length - 1)) % ids.length];
      return to(nav.nodes.find((n) => n.card === next));
    }
    case 'e':
    case 'E':
      return !at.more && s.edges.length ? { type: 'edge', index: s.edge === null ? 0 : (s.edge + 1) % s.edges.length } : null;
    case 'Enter':
      return s.edge === null ? { type: 'open' } : { type: 'focus', id: otherEnd(s.edges[s.edge]!, at.id) };
    case ' ':
      return { type: 'open' };
    case 'Escape':
      return s.edge === null ? { type: 'close' } : { type: 'edge', index: null };
  }
  return null;
}

/** How an edge relates to one of its ends: the detail panel's groups, in display order. */
export const RELATIONS = ['Fed by', 'Feeds', 'Parent path', 'Sub-paths', 'Shares a schema'] as const;
export type Relation = (typeof RELATIONS)[number];

export function relation(e: Edge, id: string): { group: Relation; other: string; via?: string } {
  const out = e.from === id;
  const other = otherEnd(e, id);
  if (e.kind === 'feeds') return { group: out ? 'Feeds' : 'Fed by', other, via: e.label };
  if (e.kind === 'sub-path') return { group: out ? 'Sub-paths' : 'Parent path', other };
  return { group: 'Shares a schema', other, via: e.label };
}

/** An edge from one end, in words with its kind and label: "feeds getMember via assigneeId -> memberId". */
export function edgeText(e: Edge, id: string): string {
  const { group, other, via } = relation(e, id);
  return {
    'Fed by': `fed by ${other} via ${via}`,
    Feeds: `feeds ${other} via ${via}`,
    'Parent path': `sub-path of ${other}`,
    'Sub-paths': `has sub-path ${other}`,
    'Shares a schema': `shares schema ${via} with ${other}`,
  }[group];
}

/** "Edge 2 of 4: feeds getMember via assigneeId -> memberId". */
export const describeEdge = (e: Edge, id: string, index: number, count: number): string =>
  `Edge ${index + 1} of ${count}: ${edgeText(e, id)}. Enter follows it.`;

/** Every shortcut, by where it works: the help dialog renders this table and a test checks that
 *  every key `keyAction`, the file tree, the tabs and the source field handle is in it. Keys are `KeyboardEvent.key`. */
export const SHORTCUTS: { where: string; keys: string[]; what: string }[] = [
  { where: 'Anywhere outside a text field', keys: ['/'], what: 'Search operations' },
  { where: 'Anywhere outside a text field', keys: ['?'], what: 'Show these shortcuts' },
  { where: 'Search box', keys: ['Escape'], what: 'Clear the search' },
  { where: 'Map', keys: ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'], what: 'Move to the nearest operation that way (skips ones the search hides)' },
  { where: 'Map', keys: ['PageUp', 'PageDown'], what: 'Previous or next resource' },
  { where: 'Map', keys: ['Home', 'End'], what: 'First or last operation in the resource' },
  { where: 'Map', keys: ['e', 'E'], what: 'Cycle the focused operation\'s links' },
  { where: 'Map', keys: ['Enter', ' '], what: 'Pin the operation card, follow the highlighted link (Enter), or show more rows' },
  { where: 'Map', keys: ['Escape'], what: 'Clear the link highlight, then close the operation card' },
  { where: 'Skill files', keys: ['ArrowUp', 'ArrowDown'], what: 'Previous or next file' },
  { where: 'Skill files', keys: ['ArrowRight', 'ArrowLeft'], what: 'Open or close a folder, or go to its parent' },
  { where: 'Skill files', keys: ['Home', 'End'], what: 'First or last file' },
  { where: 'Skill files', keys: ['Enter', ' '], what: 'Show the file, or open or close the folder' },
  { where: 'Tabs', keys: ['ArrowLeft', 'ArrowRight', 'Home', 'End'], what: 'Switch between Skill, Map and List' },
  { where: 'Source field', keys: ['Enter'], what: 'Load the URL or spec text' },
  { where: 'Source field', keys: ['Shift+Enter'], what: 'Add a new line' },
];

/** The source field (a multi-line textarea): Enter loads, Shift+Enter adds a line (listed above). */
export const sourceFieldLoads = (key: string, shift: boolean): boolean => key === 'Enter' && !shift;

const KEY_LABEL: Record<string, string> = {
  ArrowLeft: '←', ArrowUp: '↑', ArrowRight: '→', ArrowDown: '↓', PageUp: 'Page Up', PageDown: 'Page Down', Escape: 'Esc', ' ': 'Space',
};
/** How a key is printed: `Shift+ArrowLeft` -> `Shift + ←`. */
export const keyLabel = (key: string): string => key.split(/\+(?=.)/).map((k) => KEY_LABEL[k] ?? k).join(' + ');

/** The map's accessible name; once search narrows it, what matches and what is shown:
 *  "Tasks API: 4 of 22 operations match, 18 of 85 relationships shown". */
export function mapName(title: string, noun: string, operations: number, clusters: number, edges: number, match: number | null, shownEdges: number): string {
  const all = `${operations} ${noun}`;
  const groups = counted(clusters, 'cluster');
  if (match === null && shownEdges === edges) return `${title}: ${all} in ${groups}, ${counted(edges, 'relationship')}`;
  return `${title}: ${match === null ? `${all} in ${groups}` : `${match} of ${all} match`}, ${shownEdges} of ${counted(edges, 'relationship')} shown`;
}

const READS = new Set(['GET', 'HEAD', 'OPTIONS', 'read']);

/**
 * A2 row name: "GET getTask, /tasks/{taskId}, Get a task, workflow step 3, cluster Tasks, 13 relationships"
 * (full, never truncated). It starts with the row's visible text, method and id (WCAG 2.5.3 label in
 * name), then the path. Destructive rows say so in words (D41); other writes "changes data".
 */
export function nodeName(op: Operation, row: Pick<RouteRow, 'method' | 'destructive' | 'stop'>, cluster: string, relationships: number): string {
  const parts = [`${row.method} ${op.id}`];
  if (op.kind !== 'tool') parts.push(op.path!);
  if (op.title !== op.id && op.title !== op.path) parts.push(op.title);
  if (row.destructive) parts.push('destructive');
  else if (!READS.has(row.method)) parts.push('changes data');
  if (op.deprecated) parts.push('deprecated');
  if (row.stop) parts.push(`workflow step ${row.stop}`);
  parts.push(`cluster ${cluster}`, counted(relationships, 'relationship'));
  return parts.join(', ');
}

/** The operation id in a `#op=<id>` hash, if the model has it. */
export function opFromHash(hash: string, has: (id: string) => boolean): string | undefined {
  const m = /^#op=(.+)$/.exec(hash);
  try {
    const id = m ? decodeURIComponent(m[1]!) : undefined;
    return id !== undefined && has(id) ? id : undefined;
  } catch {
    return undefined;
  }
}
