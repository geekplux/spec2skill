// MCP Streamable HTTP client that only lists tools: initialize ->
// notifications/initialized -> paginated tools/list -> best-effort DELETE. It can never send
// tools/call (ALLOWED_METHODS). Written against an injected `fetch` with no Worker-only APIs, so the
// CLI (phase 16) runs it from Node, passing its own `checkUrl` (no SSRF filter on the user's machine).
import { ProxyError, clean } from './errors';
import { type ByteBudget, type FetchFn, MAX_BYTES, type UrlCheck, deadline, fetchFollowing, readCapped, streamText } from './limits';
import { checkUrl } from './ssrf';

export const PROTOCOL_VERSION = '2025-06-18';
export const MCP_BUDGET_MS = 15_000;
export const MAX_PAGES = 10;
export const MAX_TOOLS = 2000;
export const ALLOWED_METHODS: ReadonlySet<string> = new Set(['initialize', 'notifications/initialized', 'tools/list']);

export interface McpToolsResult {
  tools: unknown[];
  serverInfo?: { name: string; version: string; title?: string };
  protocolVersion: string;
  /** True when the page or tool cap cut the list short. */
  truncated: boolean;
}

export interface McpClientOptions {
  fetch: FetchFn;
  budgetMs?: number;
  checkUrl?: UrlCheck;
}

type Message = Record<string, unknown>;
const isRecord = (v: unknown): v is Message => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 120) => (typeof v === 'string' ? clean(v, max) : undefined);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The JSON-RPC response with `id` in a single message or a batch. */
const reply = (doc: unknown, id: number): Message | undefined =>
  (Array.isArray(doc) ? doc : [doc]).find((m): m is Message => isRecord(m) && m.id === id && ('result' in m || 'error' in m));

/** Reads SSE events until the response with `id` arrives; the server may keep the stream open. */
async function readSse(res: Response, id: number, budget: ByteBudget, signal: AbortSignal): Promise<Message | undefined> {
  let partial = '';
  let data: string[] = [];
  let found: Message | undefined;
  const onLine = (raw: string): boolean => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.startsWith('data:')) data.push(line.slice(line.startsWith('data: ') ? 6 : 5));
    else if (line === '' && data.length) {
      found = reply(parseJson(data.join('\n')), id);
      data = [];
    }
    return found !== undefined;
  };
  await streamText(res.body, budget, signal, (chunk) => {
    partial += chunk;
    if (!chunk.includes('\n')) return false;
    const lines = partial.split('\n');
    partial = lines.pop() ?? '';
    return lines.some(onLine);
  });
  if (!found && !onLine(partial)) onLine('');
  return found;
}

export async function listMcpTools(target: URL | string, options: McpClientOptions): Promise<McpToolsResult> {
  const check = options.checkUrl ?? checkUrl;
  let url = check(String(target));
  const { signal, clear } = deadline(options.budgetMs ?? MCP_BUDGET_MS);
  const budget: ByteBudget = { left: MAX_BYTES };
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  let nextId = 1;

  async function send(method: string, params?: Message): Promise<Message> {
    if (!ALLOWED_METHODS.has(method)) throw new Error(`spec2skill never sends ${method}`);
    const id = nextId++;
    const isNotification = method.startsWith('notifications/');
    const body = JSON.stringify(isNotification ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', id, method, params });
    const out = await fetchFollowing(options.fetch, url, { method: 'POST', headers, body, signal }, check);
    const { res } = out;
    url = out.url;
    if (res.status === 401 || res.status === 403) {
      throw new ProxyError('needs-auth', `The MCP server answered ${res.status}: it needs credentials, which spec2skill never sends.`);
    }
    if (method === 'initialize' && (res.status === 404 || res.status === 405)) {
      throw new ProxyError('legacy-transport', `The server answered ${res.status}: it may only support the older HTTP+SSE transport.`);
    }
    if (!res.ok) throw new ProxyError('http-error', `The MCP server answered ${res.status} to ${method}.`);
    const session = res.headers.get('mcp-session-id');
    if (method === 'initialize' && session && /^[\x21-\x7e]{1,256}$/.test(session)) headers['mcp-session-id'] = session;
    if (isNotification) {
      void res.body?.cancel().catch(() => {});
      return {};
    }
    const sse = (res.headers.get('content-type') ?? '').includes('text/event-stream');
    const message = sse ? await readSse(res, id, budget, signal) : reply(parseJson(await readCapped(res, budget, signal)), id);
    if (!message) throw new ProxyError('http-error', `The server sent no JSON-RPC response to ${method}; is this an MCP endpoint?`);
    if (isRecord(message.error)) throw new ProxyError('http-error', `The MCP server refused ${method}: ${str(message.error.message) ?? 'no message'}`);
    if (!isRecord(message.result)) throw new ProxyError('http-error', `The MCP server sent an empty ${method} result.`);
    return message.result;
  }

  try {
    const init = await send('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'spec2skill', version: '0.1.0' } });
    const version = typeof init.protocolVersion === 'string' && /^[\w.-]{1,32}$/.test(init.protocolVersion) ? init.protocolVersion : PROTOCOL_VERSION;
    headers['mcp-protocol-version'] = version;
    await send('notifications/initialized');
    const tools: unknown[] = [];
    let truncated = false;
    let cursor: string | undefined;
    for (let page = 1; ; page++) {
      const result = await send('tools/list', cursor === undefined ? {} : { cursor });
      if (!Array.isArray(result.tools)) throw new ProxyError('http-error', 'The tools/list result has no tools array.');
      for (const tool of result.tools) {
        if (tools.length === MAX_TOOLS) {
          truncated = true;
          break;
        }
        tools.push(tool);
      }
      const next = result.nextCursor;
      if (typeof next !== 'string' || next === '' || next === cursor) break;
      if (page === MAX_PAGES || tools.length === MAX_TOOLS) {
        truncated = true;
        break;
      }
      cursor = next;
    }
    const info = isRecord(init.serverInfo) ? init.serverInfo : {};
    const name = str(info.name);
    const title = str(info.title);
    const serverInfo = name ? { name, version: str(info.version, 40) ?? '', ...(title ? { title } : {}) } : undefined;
    return { tools, protocolVersion: version, truncated, ...(serverInfo ? { serverInfo } : {}) };
  } finally {
    clear();
    const session = headers['mcp-session-id'];
    if (session) {
      const end = { 'mcp-session-id': session, 'mcp-protocol-version': headers['mcp-protocol-version'] ?? PROTOCOL_VERSION };
      void options
        .fetch(url.href, { method: 'DELETE', headers: end, redirect: 'manual', signal: AbortSignal.timeout(2000) })
        .then((res) => res.body?.cancel())
        .catch(() => {});
    }
  }
}
