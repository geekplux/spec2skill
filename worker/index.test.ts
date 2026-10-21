import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Deps, type WorkerEnv, handle } from './index';
import { SPEC_HEADERS } from './fetchSpec';
import { hangingFetch, recorder, redirect } from './__fixtures__/fakes';

const ORIGIN = 'https://spec2skill.example';
const assets = { fetch: async (request: Request) => new Response(`asset ${new URL(request.url).pathname}`) };
const env: WorkerEnv = { ASSETS: assets };

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers });
}

const unreachable = async (): Promise<Response> => {
  throw new TypeError('getaddrinfo ENOTFOUND internal-detail');
};

async function errorCode(res: Response): Promise<string> {
  const body = (await res.json()) as { error?: { code: string } };
  return body.error?.code ?? 'none';
}

const spies: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, method));
});
afterEach(() => {
  const logged = spies.some((spy) => spy.mock.calls.length > 0);
  vi.restoreAllMocks();
  spies.length = 0;
  vi.useRealTimers();
  if (logged) throw new Error('The Worker wrote to the console (request bodies must never be logged).');
});

describe('router', () => {
  it('serves health, assets and JSON errors for unknown routes', async () => {
    const deps: Deps = { fetch: hangingFetch };
    const health = await handle(new Request(`${ORIGIN}/api/health`), env, deps);
    expect(await health.text()).toBe('{"ok":true,"ai":false}');
    expect(await (await handle(new Request(`${ORIGIN}/`), env, deps)).text()).toBe('asset /');
    const unknown = await handle(post('/api/nope', {}), env, deps);
    expect([unknown.status, await errorCode(unknown)]).toEqual([404, 'bad-request']);
    const get = await handle(new Request(`${ORIGIN}/api/fetch-spec`), env, deps);
    expect(get.status).toBe(405);
  });

  it.each([['not json'], [{}], [{ url: 42 }], [{ url: `https://example.com/${'a'.repeat(2100)}` }]])('rejects body %j as bad-request', async (body) => {
    const res = await handle(post('/api/fetch-spec', body), env, { fetch: hangingFetch });
    expect([res.status, await errorCode(res)]).toEqual([400, 'bad-request']);
  });

  it('rejects an oversized request body', async () => {
    const res = await handle(post('/api/fetch-spec', { url: 'https://example.com/', pad: 'x'.repeat(20_000) }), env, { fetch: hangingFetch });
    expect(await errorCode(res)).toBe('too-large');
  });

  it('blocks private targets before any fetch (form-encoded curl body too)', async () => {
    const { fetch, calls } = recorder(() => new Response('never'));
    for (const path of ['/api/fetch-spec', '/api/mcp/tools']) {
      const res = await handle(post(path, '{"url":"http://127.0.0.1/"}', { 'content-type': 'application/x-www-form-urlencoded' }), env, { fetch });
      expect([res.status, await errorCode(res)]).toEqual([403, 'blocked-host']);
    }
    expect(calls).toHaveLength(0);
  });

  it('rate limits by client IP and degrades to no limit without the binding', async () => {
    const keys: string[] = [];
    let remaining = 1;
    const limited: WorkerEnv = {
      ASSETS: assets,
      RATE_LIMITER: { limit: async ({ key }) => (keys.push(key), { success: remaining-- > 0 }) },
    };
    const { fetch } = recorder(() => new Response('openapi: 3.1.0'));
    const first = await handle(post('/api/fetch-spec', { url: 'https://example.com/a.yaml' }, { 'cf-connecting-ip': '203.0.113.9' }), limited, { fetch });
    expect(first.status).toBe(200);
    const second = await handle(post('/api/fetch-spec', { url: 'https://example.com/a.yaml' }, { 'cf-connecting-ip': '203.0.113.9' }), limited, { fetch });
    expect([second.status, await errorCode(second)]).toEqual([429, 'rate-limited']);
    expect(keys).toEqual(['203.0.113.9', '203.0.113.9']);
  });
});

describe('POST /api/fetch-spec', () => {
  it('never forwards client cookies, authorization or other headers', async () => {
    const { fetch, calls } = recorder(() => new Response('{"openapi":"3.1.0"}', { headers: { 'content-type': 'application/json' } }));
    const res = await handle(
      post('/api/fetch-spec', { url: 'https://example.com/openapi.json' }, {
        cookie: 'session=secret',
        authorization: 'Bearer secret',
        'x-api-key': 'secret',
        'user-agent': 'Browser/1.0',
        'cf-connecting-ip': '203.0.113.9',
      }),
      env,
      { fetch },
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(Object.fromEntries(call?.headers ?? [])).toEqual(SPEC_HEADERS);
    expect('credentials' in (call?.init ?? {})).toBe(false);
    expect(call?.body).toBeUndefined();
    expect(JSON.stringify(call?.init)).not.toContain('secret');
  });

  it('returns the spec as text/plain with the upstream type and final URL in headers', async () => {
    const { fetch } = recorder(({ url }) =>
      url.endsWith('/old') ? redirect('/new.yaml', 301) : new Response('<script>openapi: 3.1.0', { headers: { 'content-type': 'text/html' } }),
    );
    const res = await handle(post('/api/fetch-spec', { url: 'https://example.com/old' }), env, { fetch });
    expect(await res.text()).toBe('<script>openapi: 3.1.0');
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-spec-content-type')).toBe('text/html');
    expect(res.headers.get('x-spec-url')).toBe('https://example.com/new.yaml');
  });

  it('caches by normalised URL for 5 minutes', async () => {
    const store = new Map<string, Response>();
    const cache = {
      match: async (key: RequestInfo | URL) => store.get(String(key))?.clone(),
      put: async (key: RequestInfo | URL, value: Response) => void store.set(String(key), value),
    } as unknown as Deps['cache'];
    const { fetch, calls } = recorder(() => new Response('swagger: "2.0"'));
    for (const url of ['https://Example.com/s.yaml#a', 'https://example.com/s.yaml']) {
      const res = await handle(post('/api/fetch-spec', { url }), env, { fetch, cache });
      expect(await res.text()).toBe('swagger: "2.0"');
    }
    expect(calls).toHaveLength(1);
    expect([...store.keys()]).toEqual([`${ORIGIN}/api/fetch-spec?url=${encodeURIComponent('https://example.com/s.yaml')}`]);
    expect(store.values().next().value?.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it.each([
    [404, 'http-error', 502],
    [500, 'http-error', 502],
    [401, 'needs-auth', 401],
    [403, 'needs-auth', 401],
  ])('maps upstream %i to %s', async (status, code, ours) => {
    const { fetch } = recorder(() => new Response('nope', { status }));
    const res = await handle(post('/api/fetch-spec', { url: 'https://example.com/x' }), env, { fetch });
    expect([res.status, await errorCode(res)]).toEqual([ours, code]);
  });

  it('times out a hanging upstream after 10 s', async () => {
    vi.useFakeTimers();
    const pending = handle(post('/api/fetch-spec', { url: 'https://example.com/slow' }), env, { fetch: hangingFetch });
    await vi.advanceTimersByTimeAsync(10_000);
    const res = await pending;
    expect([res.status, await errorCode(res)]).toEqual([504, 'timeout']);
  });

  it('maps an unreachable host to http-error without echoing details', async () => {
    const res = await handle(post('/api/fetch-spec', { url: 'https://example.com/x' }), env, { fetch: unreachable });
    const text = await res.text();
    expect(text).toContain('http-error');
    expect(text).not.toContain('internal-detail');
  });
});
