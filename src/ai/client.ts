// The browser side of lean AI (PLAN 5.8, D23): the compact summary of a user-loaded spec, one
// /api/ai/describe call per summary at most (after /api/health says AI is on), a bounded
// localStorage cache under the Worker's key, and how an answer renames clusters and fills SkillProse.
// Samples and the CLI never come here. Any failure, or 5 s without an answer, keeps the deterministic text.
import type { AtlasGraph, Edge } from '../graph/types';
import type { ApiModel } from '../model/types';
import type { SkillProse } from '../skillgen/types';
import { type AiDescription, type AiSummary, CAP, cacheKey, checkOutput, checkSummary } from './contract';

/** Up to 8 operations a cluster, about 160 in all, so a large spec still fits the 32 KB summary. */
const perCluster = (clusters: number) => Math.max(1, Math.min(8, Math.floor(160 / clusters)));
const TOP_EDGES = 20;
const BUDGET_MS = 5000;
export const STORE_KEY = 'spec2skill:ai';
export const STORE_MAX = 50;

/** Feeds first (exact before inferred), then sub-paths, then shared schemas. */
const strength = (e: Edge) => ({ feeds: 0, 'sub-path': 2, 'shared-schema': 4 })[e.kind] + (e.confidence === 'inferred' ? 1 : 0);

/** Ids, method/path, capped titles, cluster membership (sampled) and the top 20 edges; never descriptions. */
export function buildSummary(model: ApiModel, graph: AtlasGraph): AiSummary | undefined {
  const tagged = new Set(model.operations.filter((op) => op.tags[0]?.trim()).map((op) => op.id));
  const per = perCluster(graph.clusters.length);
  const clusters = graph.clusters.map((c) => ({
    id: c.id, name: c.name.slice(0, 60), keep: c.operationIds.some((id) => tagged.has(id)), size: c.operationIds.length, ops: c.operationIds.slice(0, per),
  }));
  const ids = new Set(clusters.flatMap((c) => c.ops));
  const ops = model.operations.filter((op) => ids.has(op.id))
    .map((op) => ({ id: op.id, method: op.method, path: op.path, title: op.title === op.id ? undefined : op.title.slice(0, CAP.title) }));
  const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).toSorted((a, b) => strength(a) - strength(b))
    .slice(0, TOP_EDGES).map((e) => ({ from: e.from, to: e.to, label: `${e.kind}: ${e.label}`.slice(0, 80) }));
  const kind = model.source.kind === 'mcp' ? 'mcp' : 'openapi';
  return clusters.length ? checkSummary({ title: model.source.title.slice(0, CAP.title), kind, ops, clusters, edges }) : undefined;
}

/** The graph with AI names (tag-named clusters keep theirs) and descriptions. */
export function applyAi(graph: AtlasGraph, ai: AiDescription, summary: AiSummary): AtlasGraph {
  const keep = new Set(summary.clusters.filter((c) => c.keep).map((c) => c.id));
  const by = new Map(ai.clusters.map((c) => [c.id, c]));
  return {
    ...graph,
    clusters: graph.clusters.map((c) => {
      const a = by.get(c.id);
      return a ? { ...c, name: keep.has(c.id) ? c.name : a.name, description: a.description, nameSource: 'ai' } : c;
    }),
  };
}

export const aiProse = (named: AtlasGraph, ai: AiDescription): SkillProse => ({
  source: 'ai', summary: ai.prose.summary, idea: ai.prose.idea, clusters: Object.fromEntries(named.clusters.map((c) => [c.id, c.description])),
});

/** localStorage's shape (no DOM types: the Worker type-checks this file too). */
type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };
const read = (store?: Store): Record<string, unknown> => {
  try {
    const all: unknown = JSON.parse(store?.getItem(STORE_KEY) ?? '{}');
    return typeof all === 'object' && all !== null && !Array.isArray(all) ? (all as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};
/** Moves `key` to the end (most recent) and drops the oldest entries beyond STORE_MAX. */
function remember(store: Store | undefined, key: string, value: AiDescription) {
  const all = read(store);
  delete all[key];
  all[key] = value;
  const keys = Object.keys(all);
  for (const old of keys.slice(0, Math.max(0, keys.length - STORE_MAX))) delete all[old];
  try {
    store?.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    // storage full or blocked: the KV cache still saves the call next time
  }
}

export interface AiResult { summary: AiSummary; ai: AiDescription }
export interface AiDeps { fetch: (input: string, init?: RequestInit) => Promise<Response>; store?: Store }

/** One client per page: `describe` asks at most once per summary and checks /api/health once. */
export function aiClient({ fetch, store }: AiDeps) {
  let health: Promise<unknown> | undefined;
  const asked = new Map<string, Promise<AiResult | undefined>>();
  async function ask(summary: AiSummary): Promise<AiResult | undefined> {
    try {
      const signal = AbortSignal.timeout(BUDGET_MS);
      health ??= fetch('/api/health', { signal }).then((r) => r.json());
      const h = await health;
      const model = typeof h === 'object' && h !== null && 'ai' in h && h.ai === true && 'model' in h ? h.model : undefined;
      if (typeof model !== 'string') return undefined;
      const key = await cacheKey(summary, model);
      const hit = checkOutput(read(store)[key], summary);
      if (hit) return remember(store, key, hit), { summary, ai: hit };
      const res = await fetch('/api/ai/describe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ summary }), signal });
      const ai = res.ok ? checkOutput(await res.json(), summary) : undefined;
      if (ai) remember(store, key, ai);
      return ai && { summary, ai };
    } catch {
      return undefined;
    }
  }
  return {
    describe(model: ApiModel, graph: AtlasGraph): Promise<AiResult | undefined> {
      const summary = buildSummary(model, graph);
      if (!summary) return Promise.resolve(undefined);
      const id = JSON.stringify(summary);
      if (!asked.has(id)) asked.set(id, ask(summary));
      return asked.get(id)!;
    },
  };
}
