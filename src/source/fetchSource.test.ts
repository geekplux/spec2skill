import { describe, expect, it, vi } from 'vitest';
import petstore from '../../samples/petstore-swagger2.json';
import tasksYaml from '../../samples/tasks-openapi31.yaml?raw';
import { SAMPLES, sampleModel } from '../samples';
import { SourceError, explain } from './errors';
import { DIRECT_TIMEOUT_MS, type Input, type LoadDeps, type Mode, isUrlInput, loadSource, toUrl } from './fetchSource';

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const SPEC = 'https://specs.example.test/tasks.yaml';
const TOOLS = { tools: [{ name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }], protocolVersion: '2025-06-18', serverInfo: { name: 'files', version: '1.0.0' }, truncated: false };
const text = (body: string, headers: Record<string, string> = {}, status = 200) => new Response(body, { status, headers });
const json = (body: unknown, status = 200) => text(JSON.stringify(body), { 'content-type': 'application/json' }, status);
const html = (status = 404) => text('<!doctype html><title>x</title>', { 'content-type': 'text/html' }, status);
const cors = () => Promise.reject(new TypeError('Failed to fetch'));

/** Runs loadSource against `routes` (exact URL -> handler); records calls, steps and writes. */
async function run(input: Input, routes: Record<string, Handler>, mode: Mode = 'auto', ctl = new AbortController()) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const steps: string[] = [];
  const write = vi.fn<LoadDeps['write']>(async () => {});
  const deps: LoadDeps = {
    fetch: async (url, init) => {
      calls.push({ url, init });
      const route = routes[url];
      if (!route) throw new Error(`unrouted ${url}`);
      return route(url, init);
    },
    signal: ctl.signal,
    step: (id, label) => steps.push(`${id}: ${label}`),
    write,
  };
  const out = await loadSource(input, mode, deps).then((r) => ({ ...r, error: undefined }), (error: unknown) => ({ error, model: undefined }));
  return { ...out, calls, steps, write, urls: calls.map((c) => c.url) };
}
const hangUntilAbort: Handler = (_u, init) => new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason)));
const codeOf = (error: unknown) => (error instanceof SourceError ? error.code : explain(error).code);

describe('isUrlInput and toUrl', () => {
  it('treats one line as a URL and multi-line or document starts as text', () => {
    expect(isUrlInput('  https://a.test/openapi.json ')).toBe(true);
    for (const t of ['{"openapi": "3.1.0"}', '[]', 'openapi: 3.1.0', 'swagger: "2.0"', 'a: 1\nb: 2']) expect(isUrlInput(t)).toBe(false);
  });
  it('accepts only http(s) URLs', () => {
    expect(toUrl(' https://a.test/x ').href).toBe('https://a.test/x');
    for (const bad of ['ftp://a.test/x', 'javascript:alert(1)', 'not a url', 'a.test/openapi.json']) expect(() => toUrl(bad)).toThrow(SourceError);
  });
});

describe('loadSource: URLs', () => {
  it('fetches an OpenAPI URL directly, then parses, maps and writes, in order', async () => {
    const r = await run({ url: SPEC }, { [SPEC]: () => text(tasksYaml, { 'content-type': 'application/yaml' }) });
    expect(r.error).toBeUndefined();
    expect(r.urls).toEqual([SPEC]);
    expect(r.calls[0]!.init).toMatchObject({ credentials: 'omit' });
    expect(r.steps).toEqual(['fetch: Fetching spec (specs.example.test)', 'parse: Parsing (OpenAPI 3.1.0)', 'map: Mapping 22 operations', 'write: Writing skill']);
    expect(r.model!.source.url).toBe(SPEC);
    expect(r.write).toHaveBeenCalledOnce();
  });

  it('falls back to /api/fetch-spec on a CORS or network failure and reads the x-spec-* headers', async () => {
    const r = await run({ url: 'https://specs.example.test/petstore' }, {
      'https://specs.example.test/petstore': cors,
      '/api/fetch-spec': () => text(JSON.stringify(petstore), { 'content-type': 'text/plain', 'x-spec-content-type': 'application/json', 'x-spec-url': 'https://specs.example.test/v2/petstore.json' }),
    });
    expect(r.error).toBeUndefined();
    expect(r.urls).toEqual(['https://specs.example.test/petstore', '/api/fetch-spec']);
    expect(r.calls[1]!.init).toMatchObject({ method: 'POST', body: JSON.stringify({ url: 'https://specs.example.test/petstore' }) });
    expect(r.model!.source).toMatchObject({ kind: 'swagger2', url: 'https://specs.example.test/v2/petstore.json' });
  });

  it('times the direct fetch out after 5 s and then asks the proxy', async () => {
    vi.useFakeTimers();
    try {
      const pending = run({ url: SPEC }, { [SPEC]: hangUntilAbort, '/api/fetch-spec': () => text(tasksYaml) });
      await vi.advanceTimersByTimeAsync(DIRECT_TIMEOUT_MS + 10);
      const r = await pending;
      expect(r.urls).toEqual([SPEC, '/api/fetch-spec']);
      expect(r.error).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('says the proxy is unavailable when /api answers with HTML, a 404 or not at all', async () => {
    for (const proxy of [() => html(404), () => html(200), cors, () => text('nope', {}, 500)]) {
      const r = await run({ url: SPEC }, { [SPEC]: cors, '/api/fetch-spec': proxy });
      expect(codeOf(r.error)).toBe('proxy-unavailable');
    }
  });

  it('passes the proxy error codes through', async () => {
    for (const code of ['blocked-host', 'timeout', 'too-large', 'http-error', 'rate-limited', 'invalid-url']) {
      const r = await run({ url: SPEC }, { [SPEC]: cors, '/api/fetch-spec': () => json({ error: { code, message: 'why' } }, 400) });
      expect([codeOf(r.error), (r.error as Error).message]).toEqual([code, 'why']);
    }
    const odd = await run({ url: SPEC }, { [SPEC]: cors, '/api/fetch-spec': () => json({ error: { code: 'weird', message: 1 } }, 400) });
    expect(codeOf(odd.error)).toBe('proxy-unavailable');
  });

  it('maps direct answers: 401/403 needs auth, other statuses are HTTP errors, HTML is a docs page, big bodies are too large', async () => {
    const cases: [Handler, string][] = [
      [() => text('', {}, 401), 'needs-auth'], [() => text('', {}, 403), 'needs-auth'], [() => text('', {}, 500), 'http-error'],
      [() => html(200), 'html-page'], [() => text('<!DOCTYPE html><p>docs</p>'), 'html-page'],
      [() => text('x', { 'content-length': String(6 * 1024 * 1024) }), 'too-large'],
    ];
    for (const [handler, code] of cases) expect(codeOf((await run({ url: SPEC }, { [SPEC]: handler }, 'openapi')).error)).toBe(code);
    expect(codeOf((await run({ url: 'ftp://x.test/a' }, {})).error)).toBe('invalid-url');
  });

  it('sends MCP URLs (path /mcp or /sse, or the MCP selector) only to /api/mcp/tools', async () => {
    for (const [url, mode] of [['https://tools.example.test/mcp', 'auto'], ['https://tools.example.test/sse/', 'auto'], ['https://tools.example.test/x', 'mcp']] as const) {
      const r = await run({ url }, { '/api/mcp/tools': () => json(TOOLS) }, mode);
      expect(r.urls).toEqual(['/api/mcp/tools']);
      expect(r.model!.source).toMatchObject({ kind: 'mcp', title: 'files', url });
      expect(r.steps.at(1)).toBe('parse: Parsing (MCP tools/list)');
    }
    const auth = await run({ url: 'https://tools.example.test/mcp' }, { '/api/mcp/tools': () => json({ error: { code: 'needs-auth', message: '401' } }, 401) });
    expect(codeOf(auth.error)).toBe('needs-auth');
  });

  it('in Auto mode retries as MCP when the URL is not a spec (405, an event stream, or another document)', async () => {
    const url = 'https://tools.example.test/rpc';
    for (const answer of [() => text('', {}, 405), () => text('', { 'content-type': 'text/event-stream' }), () => json({ hello: 1 })]) {
      const r = await run({ url }, { [url]: answer, '/api/mcp/tools': () => json(TOOLS) });
      expect([r.error, r.urls]).toEqual([undefined, [url, '/api/mcp/tools']]);
    }
    // via the proxy too: its "answered 405" error
    const viaProxy = await run({ url }, { [url]: cors, '/api/fetch-spec': () => json({ error: { code: 'http-error', message: 'The server answered 405.' } }, 502), '/api/mcp/tools': () => json(TOOLS) });
    expect(viaProxy.model?.source.kind).toBe('mcp');
  });

  it('keeps the spec error when the MCP retry fails too, and never retries outside Auto', async () => {
    const url = 'https://specs.example.test/data.json';
    const both = await run({ url }, { [url]: () => json({ hello: 1 }), '/api/mcp/tools': () => json({ error: { code: 'legacy-transport', message: '' } }, 502) });
    expect(codeOf(both.error)).toBe('unsupported');
    expect((both.error as Error).message).toContain('"hello"');
    const strict = await run({ url }, { [url]: () => json({ hello: 1 }) }, 'openapi');
    expect([codeOf(strict.error), strict.urls]).toEqual(['unsupported', [url]]);
    const mcpOnly = await run({ url }, { [url]: () => text('', {}, 405) }, 'openapi');
    expect(codeOf(mcpOnly.error)).toBe('http-error');
  });
});

describe('loadSource: text and files', () => {
  it('reads pasted text with no request at all, into the same model as the built-in sample', async () => {
    const r = await run({ text: tasksYaml }, {});
    expect(r.urls).toEqual([]);
    expect(r.steps[0]).toBe('fetch: Reading pasted text');
    expect(r.model!.hash).toBe((await sampleModel(SAMPLES[0]!)).hash);
  });

  it('reads a file, refusing one over 5 MB before reading it', async () => {
    const file = Object.assign(new Blob([JSON.stringify(petstore)]), { name: 'petstore.json' });
    const r = await run({ file }, {});
    expect([r.steps[0], r.model!.hash]).toEqual(['fetch: Reading petstore.json', (await sampleModel(SAMPLES[1]!)).hash]);
    const big = { name: 'big.json', size: 6 * 1024 * 1024, text: vi.fn<() => Promise<string>>() } as unknown as Blob & { name: string };
    const tooBig = await run({ file: big }, {});
    expect(codeOf(tooBig.error)).toBe('too-large');
    expect(big.text).not.toHaveBeenCalled();
  });

  it('reports bad text plainly and does not write a skill for zero operations', async () => {
    expect(codeOf((await run({ text: '{ nope' }, {})).error)).toBe('not-a-spec');
    expect(codeOf((await run({ text: 'asyncapi: 2.6.0\ninfo: {}' }, {})).error)).toBe('unsupported');
    const empty = await run({ text: 'openapi: 3.1.0\ninfo: {title: Empty, version: "1"}\npaths: {}' }, {});
    expect([empty.model!.operations.length, empty.write.mock.calls.length]).toEqual([0, 0]);
  });
});

describe('loadSource: cancel', () => {
  it('aborts the in-flight request and never writes the skill', async () => {
    const ctl = new AbortController();
    let seen: AbortSignal | undefined;
    const hang: Handler = (_u, init) => new Promise((_, reject) => {
      seen = init!.signal!;
      seen.addEventListener('abort', () => reject(seen!.reason));
    });
    const pending = run({ url: 'https://tools.example.test/mcp' }, { '/api/mcp/tools': hang }, 'auto', ctl);
    await vi.waitFor(() => expect(seen).toBeDefined());
    ctl.abort();
    const r = await pending;
    expect(seen!.aborted).toBe(true);
    expect((r.error as Error).name).toBe('AbortError');
    expect(r.write).not.toHaveBeenCalled();
  });
});

describe('explain', () => {
  it('gives every error a title and a reason, with the detail first', () => {
    const codes = ['invalid-url', 'blocked-host', 'timeout', 'too-large', 'http-error', 'needs-auth', 'legacy-transport', 'rate-limited', 'proxy-unavailable', 'html-page', 'not-a-spec', 'unsupported'] as const;
    for (const code of codes) {
      const e = explain(new SourceError(code, code === 'unsupported' ? 'This looks like X.' : ''));
      expect(e.title.length).toBeGreaterThan(10);
      expect(e.reason.length).toBeGreaterThan(5);
    }
    expect(explain(new SourceError('http-error', 'The server answered 404.')).reason).toMatch(/^The server answered 404\. /);
    expect(explain(new SourceError('needs-auth')).command).toContain('--method tools/list');
    expect(explain(new SourceError('proxy-unavailable')).command).toBe('pnpm dev:worker');
    expect(explain(new SourceError('blocked-host')).reason).toContain('Paste the spec text to turn a private API into a skill.');
    expect(explain(new Error('secret internals')).reason).not.toContain('secret');
  });
});
