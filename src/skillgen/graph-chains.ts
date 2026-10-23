// The strongest call chains (2-3 operations) along feeds edges: what the skill's one idea,
// workflows and (phase 10) examples are built from. Pure and deterministic.
import type { AtlasGraph, Edge } from '../graph/types';
import type { ApiModel } from '../model/types';
import type { Chain } from './types';

const MAX_LENGTH = 3;
/** Out-edges explored per operation, best first: keeps large specs cheap. */
const FAN_OUT = 8;

/**
 * Chains scored by: a start that needs no arguments (+3); per step: exact (+2) or inferred
 * (+1), into a list/read operation (+1), each required input it fills (+1), the same kind of
 * call on the same resource (-3), back into a resource already visited (-3); ending in a read
 * (+2). Deprecated operations are skipped.
 * Picked greedily so no two chains share their first step or their last operation.
 */
export function topChains(model: ApiModel, graph: AtlasGraph, max = 5): Chain[] {
  const index = new Map(model.operations.map((op, i) => [op.id, i]));
  const usable = new Set(model.operations.filter((op) => !op.deprecated).map((op) => op.id));
  const clusterOf = new Map(graph.clusters.flatMap((c) => c.operationIds.map((id) => [id, c.id] as const)));
  const required = new Map(model.operations.map((op) => [op.id, new Set(op.inputs.filter((p) => p.required).map((p) => p.name))]));
  // The labels end in the input they fill: `id -> projectId, ownerId -> memberId`, `listed path`.
  const filled = (e: Edge) => e.label.split(', ').filter((part) => required.get(e.to)!.has(part.split(' ').at(-1)!)).length;
  const step = (e: Edge) =>
    (e.confidence === 'exact' ? 2 : 1) + (['list', 'read'].includes(graph.crud[e.to]!) ? 1 : 0) + filled(e) -
    (graph.crud[e.from] === graph.crud[e.to] && clusterOf.get(e.from) === clusterOf.get(e.to) ? 3 : 0);
  const out = new Map<string, Edge[]>();
  for (const e of graph.edges) {
    if (e.kind === 'feeds' && usable.has(e.from) && usable.has(e.to)) out.set(e.from, [...(out.get(e.from) ?? []), e]);
  }
  for (const [id, edges] of out) {
    out.set(id, edges.toSorted((a, b) => step(b) - step(a) || index.get(a.to)! - index.get(b.to)!).slice(0, FAN_OUT));
  }

  const found: (Chain & { score: number })[] = [];
  const walk = (ops: string[], via: string[], inferred: boolean[], score: number) => {
    if (ops.length > 1) found.push({ ops, via, inferred, score: score + (graph.crud[ops.at(-1)!] === 'read' ? 2 : 0) });
    if (ops.length === MAX_LENGTH) return;
    const seen = new Set(ops.map((id) => clusterOf.get(id)));
    const last = clusterOf.get(ops.at(-1)!);
    for (const e of out.get(ops.at(-1)!) ?? []) {
      if (ops.includes(e.to)) continue;
      const back = clusterOf.get(e.to) !== last && seen.has(clusterOf.get(e.to)) ? 3 : 0;
      walk([...ops, e.to], [...via, e.label], [...inferred, e.confidence !== 'exact'], score + step(e) - back);
    }
  };
  for (const op of model.operations) {
    if (out.has(op.id)) walk([op.id], [], [], op.inputs.some((p) => p.required) ? 0 : 3);
  }

  const order = (c: Chain) => c.ops.map((id) => String(index.get(id)).padStart(6, '0')).join();
  // Ties: longer, then through bigger resources (the API's main objects), then model order.
  const size = new Map(graph.clusters.map((c) => [c.id, c.operationIds.length]));
  const weight = (c: Chain) => c.ops.reduce((sum, id) => sum + (size.get(clusterOf.get(id)!) ?? 0), 0);
  found.sort((a, b) => b.score - a.score || b.ops.length - a.ops.length || weight(b) - weight(a) || order(a).localeCompare(order(b)));
  const picked: Chain[] = [];
  for (const { ops, via, inferred } of found) {
    if (picked.length === max) break;
    if (picked.some((c) => c.ops.at(-1) === ops.at(-1) || (c.ops[0] === ops[0] && c.ops[1] === ops[1]))) continue;
    picked.push({ ops, via, inferred });
  }
  return picked;
}
