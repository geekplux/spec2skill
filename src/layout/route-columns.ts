// Route map columns (docs/DESIGN.md 5, layout rule 1): resources in columns by
// longest-path depth over the cross-cluster feed graph. Cycles are broken with the greedy
// feedback-arc order of Eades, Lin and Smyth on distinct cluster pairs, ties by model order;
// pairs that run against the strongest workflow are dropped first so its line runs forward
// (D42). Pure and deterministic.
import type { AtlasGraph } from '../graph';

/** Directed cluster pairs `from -> to` with at least one feeds edge between their operations. */
export function clusterFeeds(graph: AtlasGraph): Map<string, Set<string>> {
  const home = new Map(graph.clusters.flatMap((c) => c.operationIds.map((id) => [id, c.id] as const)));
  const out = new Map<string, Set<string>>(graph.clusters.map((c) => [c.id, new Set<string>()]));
  for (const e of graph.edges) {
    if (e.kind !== 'feeds') continue;
    const [a, b] = [home.get(e.from), home.get(e.to)];
    if (a !== undefined && b !== undefined && a !== b) out.get(a)!.add(b);
  }
  return out;
}

/** Eades-Lin-Smyth: sinks to the end, sources to the front, else the largest out - in; ties in `order`. */
export function feedbackOrder(order: readonly string[], out: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  const left = new Set(order);
  const into = new Map(order.map((id) => [id, new Set<string>()]));
  for (const [a, targets] of out) for (const b of targets) into.get(b)?.add(a);
  const deg = (id: string, map: ReadonlyMap<string, ReadonlySet<string>>) => {
    let n = 0;
    for (const other of map.get(id) ?? []) if (left.has(other)) n++;
    return n;
  };
  const head: string[] = [];
  const tail: string[] = [];
  while (left.size > 0) {
    let moved = true;
    while (moved) {
      moved = false;
      // Reverse order, so sinks found together keep model order at the end.
      for (const id of order.toReversed()) {
        if (!left.has(id) || deg(id, out) > 0) continue;
        tail.unshift(id);
        left.delete(id);
        moved = true;
      }
      for (const id of order) {
        if (!left.has(id) || deg(id, into) > 0) continue;
        head.push(id);
        left.delete(id);
        moved = true;
      }
    }
    let best: string | undefined;
    let bestScore = -Infinity;
    for (const id of order) {
      if (!left.has(id)) continue;
      const score = deg(id, out) - deg(id, into);
      if (score > bestScore) [best, bestScore] = [id, score];
    }
    if (best !== undefined) {
      head.push(best);
      left.delete(best);
    }
  }
  return [...head, ...tail];
}

/**
 * Column of every cluster id: 0 for clusters nobody feeds (after cycles are broken), else one more
 * than the deepest cluster feeding it. `first` lists clusters in workflow order: a pair running
 * back against it is ignored.
 */
export function columnsOf(graph: AtlasGraph, first: readonly string[] = []): Map<string, number> {
  const out = clusterFeeds(graph);
  const rank = new Map(first.map((id, i) => [id, i]));
  for (const [a, targets] of out) {
    for (const b of targets) if (rank.has(a) && rank.has(b) && rank.get(b)! < rank.get(a)!) targets.delete(b);
  }
  const sequence = feedbackOrder(graph.clusters.map((c) => c.id), out);
  // The workflow's clusters take their own slots in workflow order, so its steps always run forward.
  const slots = sequence.flatMap((id, i) => (rank.has(id) ? [i] : []));
  first.forEach((id, i) => (sequence[slots[i]!] = id));
  const at = new Map(sequence.map((id, i) => [id, i]));
  const column = new Map<string, number>(sequence.map((id) => [id, 0]));
  for (const a of sequence) {
    for (const b of out.get(a) ?? []) {
      if (at.get(b)! > at.get(a)!) column.set(b, Math.max(column.get(b)!, column.get(a)! + 1));
    }
  }
  return column;
}
