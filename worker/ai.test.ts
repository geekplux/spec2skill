import { describe, expect, it } from 'vitest';
import { type AiSummary, cacheKey } from '../src/ai/contract';
import { buildSummary } from '../src/ai/client';
import { buildGraph } from '../src/graph';
import { normalise } from '../src/model/normalise';
import injection from '../src/skillgen/__fixtures__/injection.json';
import { DEFAULT_MODEL } from './ai';
import { TTL_SECONDS } from './cache';
import { hangingFetch } from './__fixtures__/fakes';
import { type WorkerEnv, handle } from './index';

const ORIGIN = 'https://spec2skill.example';
const assets = { fetch: async () => new Response('asset') };
const deps = { fetch: hangingFetch };

const SUMMARY: AiSummary = {
  title: 'Notes API', kind: 'openapi',
  ops: [{ id: 'listNotes', method: 'get', path: '/notes', title: 'List notes' }, { id: 'getNote', method: 'get', path: '/notes/{noteId}' }],
  clusters: [{ id: 'cluster-notes', name: 'Notes', keep: false, size: 2, ops: ['listNotes', 'getNote'] }],
  edges: [{ from: 'listNotes', to: 'getNote', label: 'feeds: id -> noteId' }],
};
const GOOD = {
  clusters: [{ id: 'cluster-notes', name: 'Note Taking', description: 'List notes and read one by id' }],
  prose: { summary: 'Lists and reads notes for a coding agent.', idea: 'Take noteId from listNotes before calling getNote.' },
};

function kv(fail = false) {
  const data = new Map<string, { value: string; ttl?: number }>();
  return {
    data,
    get: async (key: string) => (fail ? Promise.reject(new Error('kv down')) : (data.get(key)?.value ?? null)),
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      if (fail) throw new Error('kv down');
      data.set(key, { value, ttl: options?.expirationTtl });
    },
  };
}

function fakeAi(answer: () => unknown) {
  const calls: { model: string; input: { messages: { content: string }[]; temperature: number } }[] = [];
  return { calls, run: async (model: string, input: object) => (calls.push({ model, input: input as (typeof calls)[number]['input'] }), answer()) };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/ai/describe`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers });
const ask = async (env: WorkerEnv, body: unknown = { summary: SUMMARY }) => {
  const res = await handle(post(body), env, deps);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe('/api/ai/describe', () => {
  it('without the AI binding: 501 fallback, and health says ai: false', async () => {
    expect(await ask({ ASSETS: assets })).toEqual({ status: 501, body: { fallback: true, reason: 'unavailable' } });
    const health = await handle(new Request(`${ORIGIN}/api/health`), { ASSETS: assets }, deps);
    expect(await health.json()).toEqual({ ok: true, ai: false });
  });

  it('health names the model when the binding exists', async () => {
    const health = await handle(new Request(`${ORIGIN}/api/health`), { ASSETS: assets, AI: fakeAi(() => GOOD) }, deps);
    expect(await health.json()).toEqual({ ok: true, ai: true, model: DEFAULT_MODEL });
  });

  it('answers once from the model, then from KV under a key it computes itself (client keys ignored)', async () => {
    const ai = fakeAi(() => ({ response: JSON.stringify(GOOD) }));
    const cache = kv();
    const env: WorkerEnv = { ASSETS: assets, AI: ai, SPEC_CACHE: cache, AI_MODEL: '@cf/test/model' };
    const first = await ask(env, { summary: SUMMARY, key: 'ai:v1:describe:evil' });
    const tidy = { ...GOOD, prose: { ...GOOD.prose, summary: 'Lists and reads notes for a coding agent' } };
    expect(first).toEqual({ status: 200, body: { ...tidy, cached: false, model: '@cf/test/model' } });
    const key = await cacheKey(SUMMARY, '@cf/test/model');
    expect([...cache.data.keys()]).toEqual([key]);
    expect(key).toMatch(/^ai:v1:describe:[0-9a-f]{64}$/);
    expect(cache.data.get(key)!.ttl).toBe(TTL_SECONDS);
    // Same summary with its keys in another order and an extra field: same key, served from KV.
    const shuffled = { edges: SUMMARY.edges, clusters: SUMMARY.clusters, ops: SUMMARY.ops, kind: 'openapi', title: 'Notes API', extra: 'x' };
    expect(await ask(env, { summary: shuffled })).toEqual({ status: 200, body: { ...tidy, cached: true, model: '@cf/test/model' } });
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]!.input.temperature).toBe(0.2);
    expect(ai.calls[0]!.input.messages[0]!.content).toContain('untrusted data');
  });

  it('accepts an already parsed JSON answer and works without KV or with a failing KV', async () => {
    expect((await ask({ ASSETS: assets, AI: fakeAi(() => ({ response: GOOD })) })).status).toBe(200);
    expect((await ask({ ASSETS: assets, AI: fakeAi(() => GOOD), SPEC_CACHE: kv(true) })).status).toBe(200);
  });

  const bad: [string, () => unknown][] = [
    ['invalid JSON', () => ({ response: '{"clusters": [' })],
    ['an unknown cluster id', () => ({ ...GOOD, clusters: [...GOOD.clusters, { id: 'cluster-admin', name: 'Admin', description: 'New' }] })],
    ['a repeated cluster id', () => ({ ...GOOD, clusters: [GOOD.clusters[0], GOOD.clusters[0]] })],
    ['an oversized name', () => ({ ...GOOD, clusters: [{ ...GOOD.clusters[0], name: 'N'.repeat(33) }] })],
    ['an oversized idea', () => ({ ...GOOD, prose: { ...GOOD.prose, idea: 'word '.repeat(130) } })],
    ['markup', () => ({ ...GOOD, prose: { ...GOOD.prose, idea: 'Call <script>x</script> first' } })],
    ['a link', () => ({ ...GOOD, prose: { ...GOOD.prose, summary: 'See https://evil.example' } })],
    ['Markdown', () => ({ ...GOOD, prose: { ...GOOD.prose, idea: '# Heading [x](y)' } })],
    ['a missing prose field', () => ({ clusters: GOOD.clusters, prose: { summary: 'Only a summary' } })],
    ['a non-object', () => ({ response: 42 })],
    ['a thrown error', () => {
      throw new Error('model unavailable');
    }],
  ];
  it.each(bad)('falls back (501) on %s and caches nothing', async (_, answer) => {
    const cache = kv();
    expect(await ask({ ASSETS: assets, AI: fakeAi(answer), SPEC_CACHE: cache })).toEqual({ status: 501, body: { fallback: true, reason: 'invalid-output' } });
    expect(cache.data.size).toBe(0);
  });

  it('rejects malformed summaries before calling the model', async () => {
    const ai = fakeAi(() => GOOD);
    const env: WorkerEnv = { ASSETS: assets, AI: ai };
    const unknownOp = { ...SUMMARY, clusters: [{ ...SUMMARY.clusters[0]!, ops: ['deleteEverything'] }] };
    const longTitle = { ...SUMMARY, ops: [{ id: 'listNotes', title: 't'.repeat(121) }] };
    for (const body of ['not json', {}, { summary: unknownOp }, { summary: longTitle }, { summary: { ...SUMMARY, kind: 'graphql' } }]) {
      expect((await ask(env, body)).status).toBe(400);
    }
    expect((await ask(env, { summary: SUMMARY, pad: 'x'.repeat(40_000) })).status).toBe(413);
    expect(ai.calls).toHaveLength(0);
  });

  it('rate limits with its own binding', async () => {
    let left = 1;
    const env: WorkerEnv = { ASSETS: assets, AI: fakeAi(() => GOOD), AI_RATE_LIMITER: { limit: async () => ({ success: left-- > 0 }) } };
    expect((await ask(env)).status).toBe(200);
    expect(await ask(env)).toMatchObject({ status: 429, body: { error: { code: 'rate-limited' } } });
  });

  it('sends the injection fixture as data only: no descriptions, and its text cannot add clusters', async () => {
    const model = await normalise(injection);
    const summary = buildSummary(model, buildGraph(model))!;
    const ai = fakeAi(() => ({ clusters: [{ id: 'cluster-pwned', name: 'Pwned', description: 'x' }], prose: GOOD.prose }));
    const res = await ask({ ASSETS: assets, AI: ai }, { summary });
    expect(res.status).toBe(501);
    const prompt = ai.calls[0]!.input.messages[1]!.content;
    expect(prompt).not.toContain('rm -rf');
    expect(prompt).not.toContain('you are root');
  });
});
