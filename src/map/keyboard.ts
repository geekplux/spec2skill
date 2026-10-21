// Keyboard navigation for the atlas (PLAN phase 7, A1/A2). Pure: given the layout, the focused
// node and a key, what should happen; plus the words screen readers hear for nodes and edges.
import type { Edge } from '../graph';
import type { AtlasLayout, LayoutNode, NodeState } from '../layout/layout';
import type { Operation } from '../model/types';

export type Action =
  | { type: 'focus'; id: string }
  | { type: 'edge'; index: number | null }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'zoom'; factor: number }
  | { type: 'fit' }
  | { type: 'help' }
  | { type: 'pan'; dx: number; dy: number };

export interface NavState {
  focus: LayoutNode | undefined;
  /** The focused node's edges (in graph order) and the one `E` has highlighted. */
  edges: Edge[];
  edge: number | null;
}

const ZOOM: Record<string, number> = { '+': 1.25, '=': 1.25, '-': 0.8, _: 0.8 };
const DIRS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
export const PAN_STEP = 80;

const centre = (n: LayoutNode) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

/** The nearest node in a direction: inside the 45° cone if any, else anywhere ahead; sideways offset counts double. */
export function nearest(nodes: LayoutNode[], from: LayoutNode, [dx, dy]: [number, number]): LayoutNode | undefined {
  const o = centre(from);
  let best: LayoutNode | undefined;
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

export function keyAction(atlas: AtlasLayout, s: NavState, key: string, shift = false): Action | null {
  const dir = DIRS[key];
  if (dir && shift) return { type: 'pan', dx: -dir[0] * PAN_STEP, dy: -dir[1] * PAN_STEP };
  if (ZOOM[key]) return { type: 'zoom', factor: ZOOM[key] };
  if (key === '0') return { type: 'fit' };
  if (key === '?') return { type: 'help' };
  const at = s.focus;
  if (!at) return null;
  const to = (n: LayoutNode | undefined): Action | null => (n && n !== at ? { type: 'focus', id: n.id } : null);
  if (dir) return to(nearest(atlas.nodes, at, dir));
  const peers = atlas.nodes.filter((n) => n.cluster === at.cluster);
  switch (key) {
    case 'Home':
      return to(peers[0]);
    case 'End':
      return to(peers.at(-1));
    case 'PageUp':
    case 'PageDown': {
      const ids = atlas.clusters.map((c) => c.id);
      const next = ids[(ids.indexOf(at.cluster) + (key === 'PageDown' ? 1 : ids.length - 1)) % ids.length];
      return to(atlas.nodes.find((n) => n.cluster === next));
    }
    case 'e':
    case 'E':
      return s.edges.length ? { type: 'edge', index: s.edge === null ? 0 : (s.edge + 1) % s.edges.length } : null;
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
 *  every key `keyAction`, the file tree and the tabs handle is in it. Keys are `KeyboardEvent.key`. */
export const SHORTCUTS: { where: string; keys: string[]; what: string }[] = [
  { where: 'Anywhere', keys: ['/'], what: 'Search operations' },
  { where: 'Anywhere', keys: ['?'], what: 'Show these shortcuts' },
  { where: 'Search box', keys: ['Escape'], what: 'Clear the search' },
  { where: 'Map', keys: ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'], what: 'Move to the nearest operation that way (skips ones the search hides)' },
  { where: 'Map', keys: ['PageUp', 'PageDown'], what: 'Previous or next cluster' },
  { where: 'Map', keys: ['Home', 'End'], what: 'First or last operation in the cluster' },
  { where: 'Map', keys: ['e', 'E'], what: 'Cycle the focused operation\'s edges' },
  { where: 'Map', keys: ['Enter', ' '], what: 'Open details, or follow the highlighted edge (Enter)' },
  { where: 'Map', keys: ['Escape'], what: 'Clear the edge highlight, then close details' },
  { where: 'Map', keys: ['+', '=', '-', '_'], what: 'Zoom in or out' },
  { where: 'Map', keys: ['0'], what: 'Fit the map to the screen' },
  { where: 'Map', keys: ['Shift+ArrowLeft', 'Shift+ArrowUp', 'Shift+ArrowRight', 'Shift+ArrowDown'], what: 'Pan the map' },
  { where: 'Skill files', keys: ['ArrowUp', 'ArrowDown'], what: 'Previous or next file' },
  { where: 'Skill files', keys: ['ArrowRight', 'ArrowLeft'], what: 'Open or close a folder, or go to its parent' },
  { where: 'Skill files', keys: ['Home', 'End'], what: 'First or last file' },
  { where: 'Skill files', keys: ['Enter', ' '], what: 'Show the file, or open or close the folder' },
  { where: 'Tabs', keys: ['ArrowLeft', 'ArrowRight', 'Home', 'End'], what: 'Switch between Skill, Map and List' },
];

const KEY_LABEL: Record<string, string> = {
  ArrowLeft: '←', ArrowUp: '↑', ArrowRight: '→', ArrowDown: '↓', PageUp: 'Page Up', PageDown: 'Page Down', Escape: 'Esc', ' ': 'Space',
};
/** How a key is printed: `Shift+ArrowLeft` -> `Shift + ←`. */
export const keyLabel = (key: string): string => key.split(/\+(?=.)/).map((k) => KEY_LABEL[k] ?? k).join(' + ');

/** A2 node name: "GET /tasks/{taskId}, Get a task, cluster Tasks, 4 relationships" (full, never truncated). */
export function nodeName(op: Operation, state: NodeState, cluster: string, relationships: number): string {
  const parts = [op.kind === 'tool' ? `Tool ${op.id}` : `${op.method!.toUpperCase()} ${op.path}`];
  if (op.title !== op.id && op.title !== op.path) parts.push(op.title);
  if (state !== 'read') parts.push(state === 'destructive' ? 'destructive' : 'changes data');
  if (op.deprecated) parts.push('deprecated');
  parts.push(`cluster ${cluster}`, `${relationships} relationship${relationships === 1 ? '' : 's'}`);
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
