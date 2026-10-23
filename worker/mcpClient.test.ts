import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Deps, handle } from './index';
import { ProxyError } from './errors';
import { ALLOWED_METHODS, MAX_PAGES, PROTOCOL_VERSION, listMcpTools } from './mcpClient';
import { type Call, recorder, redirect, streamOf } from './__fixtures__/fakes';

const MCP_URL = 'https://mcp.example.com/mcp';
const tool = (name: string) => ({ name, description: `${name} tool`, inputSchema: { type: 'object' } });

interface FakeOptions {
  sse?: boolean;
  /** Tools per page; the cursor is the page index. */
  pages?: unknown[][];
  status?: number;
  session?: string;
  serverInfo?: unknown;
  error?: boolean;
}

/** A fake Streamable HTTP MCP server as an injected fetch. */
function fakeServer(options: FakeOptions = {}) {
  const { sse = false, pages = [[tool('read_file'), tool('write_file')]], status, session = 'sess-1' } = options;
  return recorder((call: Call) => {
    if (status) return new Response('no', { status });
    if (call.init.method === 'DELETE') return new Response(null, { status: 204 });
    const message = JSON.parse(call.body ?? '{}') as { id?: number; method: string; params?: { cursor?: string } };
    if (message.method === 'notifications/initialized') return new Response(null, { status: 202 });
    let result: unknown;
    if (message.method === 'initialize') {
      result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: options.serverInfo ?? { name: 'fake-fs', version: '1.2.0' } };
    } else if (message.method === 'tools/list') {
      const page = Number(message.params?.cursor ?? 0);
      result = { tools: pages[page] ?? [], ...(page + 1 < pages.length ? { nextCursor: String(page + 1) } : {}) };
    }
    const reply = options.error && message.method === 'tools/list'
      ? { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method\u0000 not found' } }
      : { jsonrpc: '2.0', id: message.id, result };
    const headers: Record<string, string> = { 'mcp-session-id': session };
    if (!sse) return new Response(JSON.stringify(reply), { headers: { ...headers, 'content-type': 'application/json' } });
    // A progress notification first, CRLF line endings, then the response; the stream stays open.
    const events = [
      'event: message\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\r\n\r\n',
      `id: 1\r\ndata: ${JSON.stringify(reply).slice(0, 10)}`,
      `${JSON.stringify(reply).slice(10)}\r\n\r\n`,
    ];
    return new Response(streamOf(events, true), { headers: { ...headers, 'content-type': 'text/event-stream' } });
  });
}

const methods = (calls: Call[]) => calls.map((c) => (c.body ? (JSON.parse(c.body) as { method: string }).method : c.init.method));
const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: unknown) => (error instanceof ProxyError ? error.code : String(error)),
  );

afterEach(() => {
  vi.useRealTimers();
});

describe('listMcpTools', () => {
  it('lists tools from a JSON server with the session and protocol headers', async () => {
    const { fetch, calls } = fakeServer();
    const result = await listMcpTools(MCP_URL, { fetch });
    expect(result).toEqual({
      tools: [tool('read_file'), tool('write_file')],
      protocolVersion: '2025-03-26',
      truncated: false,
      serverInfo: { name: 'fake-fs', version: '1.2.0' },
    });
    expect(methods(calls)).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'DELETE']);
    const [init, notified, list, end] = calls;
    expect(JSON.parse(init?.body ?? '')).toMatchObject({ params: { protocolVersion: PROTOCOL_VERSION, clientInfo: { name: 'spec2skill' } } });
    expect(init?.headers.get('accept')).toBe('application/json, text/event-stream');
    expect(init?.headers.get('mcp-session-id')).toBeNull();
    for (const call of [notified, list, end]) {
      expect(call?.headers.get('mcp-session-id')).toBe('sess-1');
      expect(call?.headers.get('mcp-protocol-version')).toBe('2025-03-26');
    }
    expect(JSON.parse(notified?.body ?? '')).toEqual({ jsonrpc: '2.0', method: 'notifications/initialized' });
  });

  it('parses SSE responses and stops reading once the response arrives', async () => {
    const { fetch } = fakeServer({ sse: true });
    const result = await listMcpTools(MCP_URL, { fetch });
    expect(result.tools).toHaveLength(2);
  });

  it('follows nextCursor across pages', async () => {
    const { fetch, calls } = fakeServer({ pages: [[tool('a')], [tool('b')], [tool('c')]] });
    const result = await listMcpTools(MCP_URL, { fetch });
    expect(result.tools.map((t) => (t as { name: string }).name)).toEqual(['a', 'b', 'c']);
    const cursors = calls.filter((c) => c.body?.includes('tools/list')).map((c) => (JSON.parse(c.body ?? '') as { params: unknown }).params);
    expect(cursors).toEqual([{}, { cursor: '1' }, { cursor: '2' }]);
  });

  it('stops at 10 pages and 2000 tools and reports truncation', async () => {
    const many = Array.from({ length: 12 }, (_, i) => [tool(`t${i}`)]);
    const paged = await listMcpTools(MCP_URL, { fetch: fakeServer({ pages: many }).fetch });
    expect([paged.tools.length, paged.truncated]).toEqual([MAX_PAGES, true]);
    const big = Array.from({ length: 2100 }, (_, i) => ({ name: `t${i}` }));
    const capped = await listMcpTools(MCP_URL, { fetch: fakeServer({ pages: [big] }).fetch });
    expect([capped.tools.length, capped.truncated]).toEqual([2000, true]);
  });

  it.each([
    [401, 'needs-auth'],
    [403, 'needs-auth'],
    [404, 'legacy-transport'],
    [405, 'legacy-transport'],
    [500, 'http-error'],
  ])('maps HTTP %i on initialize to %s', async (status, code) => {
    expect(await codeOf(listMcpTools(MCP_URL, { fetch: fakeServer({ status }).fetch }))).toBe(code);
  });

  it('reports a JSON-RPC error with a cleaned message', async () => {
    await expect(listMcpTools(MCP_URL, { fetch: fakeServer({ error: true }).fetch })).rejects.toThrow('The MCP server refused tools/list: Method not found');
  });

  it('rejects non-MCP answers and blocked URLs', async () => {
    const { fetch } = recorder(() => new Response('<html>docs</html>', { headers: { 'content-type': 'text/html' } }));
    expect(await codeOf(listMcpTools(MCP_URL, { fetch }))).toBe('http-error');
    expect(await codeOf(listMcpTools('http://10.0.0.5/mcp', { fetch }))).toBe('blocked-host');
  });

  it('re-validates redirects of the MCP endpoint', async () => {
    const { fetch, calls } = recorder(() => redirect('http://169.254.169.254/mcp', 307));
    expect(await codeOf(listMcpTools(MCP_URL, { fetch }))).toBe('blocked-host');
    expect(calls).toHaveLength(1);
  });

  it('gives up after a 15 s budget on an SSE stream that never answers', async () => {
    vi.useFakeTimers();
    const { fetch } = recorder(() => new Response(streamOf([': keep-alive\n\n'], true), { headers: { 'content-type': 'text/event-stream' } }));
    const pending = codeOf(listMcpTools(MCP_URL, { fetch }));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toBe('timeout');
  });

  it('cleans server info and drops a malformed session id', async () => {
    const { fetch, calls } = fakeServer({ serverInfo: { name: 'evil‮\nname', version: 7 }, session: 'bad id\n' });
    const result = await listMcpTools(MCP_URL, { fetch });
    expect(result.serverInfo).toEqual({ name: 'evil name', version: '' });
    expect(calls.every((c) => c.headers.get('mcp-session-id') === null)).toBe(true);
    expect(methods(calls)).not.toContain('DELETE');
  });

  it('never sends tools/call, whatever the server advertises', async () => {
    const { fetch, calls } = fakeServer({ sse: true, pages: [[tool('delete_everything')], [tool('b')]] });
    await listMcpTools(MCP_URL, { fetch });
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call.body ?? '').not.toContain('tools/call');
    expect([...ALLOWED_METHODS]).toEqual(['initialize', 'notifications/initialized', 'tools/list']);
  });
});

describe('POST /api/mcp/tools', () => {
  it('returns the tools/list result shape the client parser accepts', async () => {
    const { fetch } = fakeServer({ sse: true });
    const deps: Deps = { fetch };
    const request = new Request('https://spec2skill.example/api/mcp/tools', { method: 'POST', body: JSON.stringify({ url: MCP_URL }) });
    const res = await handle(request, { ASSETS: { fetch: async () => new Response('') } }, deps);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const body = (await res.json()) as { tools: unknown[]; serverInfo: unknown };
    expect(body.tools).toHaveLength(2);
    expect(body.serverInfo).toEqual({ name: 'fake-fs', version: '1.2.0' });
  });
});
