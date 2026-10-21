// Search and filters for the map and the list view (F11). Pure: a lowercase index built once per
// model, then each keystroke is a scan of short strings (well under a frame for 1000 operations).
import type { AtlasGraph, Edge, EdgeKind } from '../graph';
import type { ApiModel, Operation } from '../model/types';

/** What the filter menu has switched off; empty lists show everything. */
export interface Hidden { edges: EdgeKind[]; methods: string[]; clusters: string[] }
export const SHOW_ALL: Hidden = { edges: [], methods: [], clusters: [] };
export const EDGE_KINDS: EdgeKind[] = ['feeds', 'sub-path', 'shared-schema'];
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace', 'tool'];

/** `get`, `post`, ... for endpoints; `tool` for MCP tools. */
export const methodOf = (op: Operation): string => op.method ?? 'tool';

export interface SearchIndex { rows: { id: string; text: string; method: string; cluster: string }[] }

/** Id, title (summary), path and parameter names, lowercased once per model. */
export function searchIndex(model: ApiModel, graph: AtlasGraph): SearchIndex {
  const cluster = new Map(graph.clusters.flatMap((c) => c.operationIds.map((id) => [id, c.id] as const)));
  return {
    rows: model.operations.map((op) => ({
      id: op.id,
      text: [op.id, op.title, op.path ?? '', ...op.inputs.map((p) => p.name)].join('\n').toLowerCase(),
      method: methodOf(op),
      cluster: cluster.get(op.id) ?? '',
    })),
  };
}

/** The operations matching every word of `q` and no switched-off method or cluster; null when nothing narrows. */
export function matches(index: SearchIndex, q: string, hidden: Hidden): Set<string> | null {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length && !hidden.methods.length && !hidden.clusters.length) return null;
  return new Set(
    index.rows
      .filter((r) => !hidden.methods.includes(r.method) && !hidden.clusters.includes(r.cluster) && words.every((w) => r.text.includes(w)))
      .map((r) => r.id),
  );
}

/** An edge is drawn and listed when its kind is on and at least one end matches. */
export const edgeShown = (e: Edge, match: Set<string> | null, hidden: Hidden): boolean =>
  !hidden.edges.includes(e.kind) && (!match || match.has(e.from) || match.has(e.to));

/** The filter menu's choices for a model: methods (in HTTP order, tools last) and clusters. */
export function facets(model: ApiModel, graph: AtlasGraph): { methods: string[]; clusters: { id: string; name: string }[] } {
  const used = new Set(model.operations.map(methodOf));
  return { methods: METHODS.filter((m) => used.has(m)), clusters: graph.clusters.map(({ id, name }) => ({ id, name })) };
}

/** Switch one value on or off in a list. */
export const toggle = <T>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** How many choices are switched off (the menu's summary shows it). */
export const hiddenCount = (h: Hidden): number => h.edges.length + h.methods.length + h.clusters.length;
