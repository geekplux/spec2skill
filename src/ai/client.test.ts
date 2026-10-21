import { describe, expect, it } from 'vitest';
import { syntheticSpec } from '../__fixtures__/synthetic';
import { buildGraph } from '../graph';
import { normalise } from '../model/normalise';
import { SAMPLES, sampleModel } from '../samples';
import { auditTree } from '../skillgen/audit-core';
import injection from '../skillgen/__fixtures__/injection.json';
import { generateSkill } from '../skillgen/index';
import { STORE_KEY, STORE_MAX, aiClient, aiProse, applyAi, buildSummary } from './client';
import { type AiDescription, MAX_SUMMARY_BYTES, cacheKey, checkOutput } from './contract';

const tasks = async () => {
  const model = await sampleModel(SAMPLES.find((s) => s.id === 'tasks')!);
  return { model, graph: buildGraph(model) };
};

/** An answer naming every cluster of the graph. */
const answerFor = (ids: string[]): AiDescription => ({
  clusters: ids.map((id, i) => ({ id, name: `Area ${i + 1}`, description: `What area ${i + 1} does` })),
  prose: { summary: 'Plans and tracks work for a coding agent', idea: 'Read projectId from listProjects before you call listTasks, never guess it.' },
});

function memoryStore() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

function fakeServer(health: unknown, reply: (body: string) => Response) {
  const calls: string[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push(url);
    return url === '/api/health' ? Response.json(health) : reply(String(init?.body));
  };
  return { calls, fetch };
}

describe('buildSummary', () => {
  it('is compact: ids, method/path and capped titles, never descriptions; sampled clusters; top 20 edges', async () => {
    const { model, graph } = await tasks();
    const summary = buildSummary(model, graph)!;
    const text = JSON.stringify(summary);
    const descriptions = model.operations.flatMap((op) => (op.description ? [op.description] : []));
    expect(descriptions.length).toBeGreaterThan(0);
    expect(descriptions.filter((d) => text.includes(d))).toEqual([]);
    expect(summary.clusters.map((c) => c.id)).toEqual(graph.clusters.map((c) => c.id));
    expect(summary.clusters.every((c) => c.keep)).toBe(true); // every Tasks operation is tagged
    expect(summary.clusters.every((c) => c.ops.length <= 8)).toBe(true);
    expect(summary.edges.length).toBeLessThanOrEqual(20);
    expect(summary.edges[0]!.label).toMatch(/^feeds: /);
    expect(summary.ops.every((o) => !o.title || o.title.length <= 120)).toBe(true);
  });

  it('fits a 1000-operation spec into 32 KB', async () => {
    const model = await normalise(syntheticSpec());
    const summary = buildSummary(model, buildGraph(model))!;
    expect(summary.ops.length).toBeLessThanOrEqual(200);
    expect(new TextEncoder().encode(JSON.stringify(summary)).length).toBeLessThanOrEqual(MAX_SUMMARY_BYTES);
  });

  it('marks untagged (path or noun) clusters as renamable', async () => {
    const model = await sampleModel(SAMPLES.find((s) => s.kind === 'mcp')!);
    expect(buildSummary(model, buildGraph(model))!.clusters.every((c) => !c.keep)).toBe(true);
  });
});

describe('applying an answer', () => {
  it('renames only untagged clusters, describes all, and the skill with AI prose still passes its audit', async () => {
    const model = await normalise(injection);
    const graph = buildGraph(model);
    const summary = buildSummary(model, graph)!;
    const ai = checkOutput(answerFor(graph.clusters.map((c) => c.id)), summary)!;
    const named = applyAi(graph, ai, summary);
    for (const [i, c] of named.clusters.entries()) {
      expect(c.name).toBe(summary.clusters[i]!.keep ? graph.clusters[i]!.name : `Area ${i + 1}`);
      expect([c.description, c.nameSource]).toEqual([`What area ${i + 1} does`, 'ai']);
    }
    const tree = generateSkill(model, named, { prose: aiProse(named, ai) });
    expect(tree['SKILL.md']).toContain('  prose: ai\n');
    expect(tree['SKILL.md']).toContain('Read projectId from listProjects');
    expect(auditTree(tree).ok).toBe(true);
  });

  it('keeps the Tasks sample skill passing with AI prose', async () => {
    const { model, graph } = await tasks();
    const summary = buildSummary(model, graph)!;
    const ai = checkOutput(answerFor(graph.clusters.map((c) => c.id)), summary)!;
    const named = applyAi(graph, ai, summary);
    const tree = generateSkill(model, named, { prose: aiProse(named, ai) });
    expect(auditTree(tree)).toMatchObject({ ok: true });
  });
});

describe('aiClient', () => {
  it('asks nothing more when /api/health says ai: false (or fails)', async () => {
    const { model, graph } = await tasks();
    const off = fakeServer({ ok: true, ai: false }, () => new Response('never'));
    expect(await aiClient({ fetch: off.fetch }).describe(model, graph)).toBeUndefined();
    expect(off.calls).toEqual(['/api/health']);
    const down = aiClient({ fetch: async () => new Response('<!doctype html>', { status: 404 }) });
    expect(await down.describe(model, graph)).toBeUndefined();
  });

  it('makes one describe call per summary, then none after a reload (localStorage under the Worker key)', async () => {
    const { model, graph } = await tasks();
    const store = memoryStore();
    const answer = answerFor(graph.clusters.map((c) => c.id));
    const server = fakeServer({ ok: true, ai: true, model: '@cf/test/model' }, () => Response.json({ ...answer, cached: false, model: '@cf/test/model' }));
    const client = aiClient({ fetch: server.fetch, store });
    const [a, b] = await Promise.all([client.describe(model, graph), client.describe(model, graph)]);
    expect(a?.ai.prose).toEqual(answer.prose);
    expect(b).toBe(a);
    expect(await client.describe(model, graph)).toBe(a);
    expect(server.calls.filter((c) => c === '/api/ai/describe')).toHaveLength(1);
    const key = await cacheKey(a!.summary, '@cf/test/model');
    expect(Object.keys(JSON.parse(store.data.get(STORE_KEY)!))).toEqual([key]);

    const reloaded = fakeServer({ ok: true, ai: true, model: '@cf/test/model' }, () => new Response('never', { status: 500 }));
    expect((await aiClient({ fetch: reloaded.fetch, store }).describe(model, graph))?.ai).toEqual(a!.ai);
    expect(reloaded.calls).toEqual(['/api/health']);
  });

  it('stays deterministic on a 501, a rejected answer or a network error', async () => {
    const { model, graph } = await tasks();
    const on = { ok: true, ai: true, model: 'm' };
    for (const reply of [() => Response.json({ fallback: true }, { status: 501 }), () => Response.json({ clusters: [{ id: 'cluster-x', name: 'X', description: 'y' }], prose: answerFor([]).prose })]) {
      expect(await aiClient({ fetch: fakeServer(on, reply).fetch }).describe(model, graph)).toBeUndefined();
    }
    const flaky = aiClient({ fetch: async (url) => (url === '/api/health' ? Response.json(on) : Promise.reject(new TypeError('offline'))) });
    expect(await flaky.describe(model, graph)).toBeUndefined();
  });

  it(`keeps at most ${STORE_MAX} answers in localStorage, dropping the oldest`, async () => {
    const { model, graph } = await tasks();
    const store = memoryStore();
    store.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(Array.from({ length: STORE_MAX }, (_, i) => [`ai:v1:describe:old${i}`, {}]))));
    const answer = answerFor(graph.clusters.map((c) => c.id));
    await aiClient({ fetch: fakeServer({ ai: true, model: 'm' }, () => Response.json(answer)).fetch, store }).describe(model, graph);
    const keys = Object.keys(JSON.parse(store.data.get(STORE_KEY)!));
    expect(keys).toHaveLength(STORE_MAX);
    expect(keys[0]).toBe('ai:v1:describe:old1');
  });
});
