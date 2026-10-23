// Large specs (PLAN 5.5, P4). Pure: which clusters start collapsed to summary cards, when the map
// switches to aggregated cluster-to-cluster links, and the edge count between each pair of clusters.
import type { AtlasGraph } from '../graph';

/** Above this many operations, clusters start collapsed (summary cards; Enter or a click expands). */
export const COLLAPSE_OVER = 400;
/** Above this many edges, the map draws counted links between clusters plus the focused node's edges. */
export const AGGREGATE_OVER = 300;

/** A collapsed cluster's one node: its summary card. */
export const summaryId = (cluster: string): string => `cluster:${cluster}`;

/** Every cluster on a large spec, except the one holding `keep` (the operation a link opened). */
export function startCollapsed(graph: AtlasGraph, keep?: string): Set<string> {
  if (Object.keys(graph.crud).length <= COLLAPSE_OVER) return new Set();
  return new Set(graph.clusters.filter((c) => !keep || !c.operationIds.includes(keep)).map((c) => c.id));
}

export const aggregated = (graph: AtlasGraph): boolean => graph.edges.length > AGGREGATE_OVER;

/** Edges between two clusters (either direction), per pair in cluster order. */
export function clusterLinks(graph: AtlasGraph): { from: string; to: string; count: number }[] {
  const order = new Map(graph.clusters.map((c, i) => [c.id, i]));
  const home = new Map(graph.clusters.flatMap((c) => c.operationIds.map((id) => [id, c.id] as const)));
  const counts = new Map<string, { from: string; to: string; count: number }>();
  for (const e of graph.edges) {
    const pair = [home.get(e.from)!, home.get(e.to)!].toSorted((a, b) => order.get(a)! - order.get(b)!) as [string, string];
    if (pair[0] === pair[1]) continue;
    const link = counts.get(pair.join(' ')) ?? { from: pair[0], to: pair[1], count: 0 };
    link.count++;
    counts.set(pair.join(' '), link);
  }
  return [...counts.values()].toSorted((a, b) => order.get(a.from)! - order.get(b.from)! || order.get(a.to)! - order.get(b.to)!);
}
