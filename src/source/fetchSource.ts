// A URL, pasted text or a file -> model, graph and skill, step by step; `fetch` and the writer are injected.
// OpenAPI URLs: direct fetch, then the Worker proxy on a CORS/network failure (D10); MCP: always the proxy.
import { type AtlasGraph, buildGraph } from '../graph';
import type { McpOptions } from '../model/mcp';
import { normalise } from '../model/normalise';
import type { ApiModel } from '../model/types';
import { detect } from '../parse/detect';
import { MAX_SPEC_BYTES, parseText } from '../parse/text';
import { SourceError, isSourceErrorCode } from './errors';

export type Mode = 'auto' | 'openapi' | 'mcp';
export type Input = { url: string } | { text: string } | { file: Blob & { name: string } };
export type StepId = 'fetch' | 'parse' | 'map' | 'write';
export const STEPS: readonly StepId[] = ['fetch', 'parse', 'map', 'write'];
export const DIRECT_TIMEOUT_MS = 5000;

export interface LoadDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  signal: AbortSignal;
  /** A step starts, with its label ("Fetching spec (example.com)"); the steps before it are done. */
  step: (id: StepId, label: string) => void;
  write: (model: ApiModel, graph: AtlasGraph) => Promise<unknown>;
}

interface Got { text: string; type?: string; url?: string }
type Doc = { doc: unknown; options: McpOptions };

/** URL or spec text? Several lines, or a start like `{`, `[`, `openapi:` or `swagger:`, means text. */
export const isUrlInput = (value: string): boolean => !/\n/.test(value.trim()) && !/^\s*([{[]|(openapi|swagger)\s*:)/.test(value);
const MCP_PATH = /\/(mcp|sse)\/?$/;

export function toUrl(value: string): URL {
  const url = URL.canParse(value.trim()) ? new URL(value.trim()) : undefined;
  if (!url || !/^https?:$/.test(url.protocol)) throw new SourceError('invalid-url');
  return url;
}

/** Errors that mean "not a spec": in Auto mode the URL is then tried as an MCP server. */
const notSpec = (e: unknown) => e instanceof SourceError && (e.code === 'not-a-spec' || e.code === 'unsupported' || (e.code === 'http-error' && /\b40[56]\b/.test(e.message)));

/** Reads a direct or proxied answer: 405/406 or an event stream means an MCP endpoint. */
async function read(res: Response, type = res.headers.get('content-type') ?? ''): Promise<Got | 'mcp'> {
  if (res.status === 405 || res.status === 406 || type.includes('text/event-stream')) return void res.body?.cancel().catch(() => {}), 'mcp';
  if (res.status === 401 || res.status === 403) throw new SourceError('needs-auth');
  if (!res.ok) throw new SourceError('http-error', `The server answered ${res.status}.`);
  if (Number(res.headers.get('content-length')) > MAX_SPEC_BYTES) throw new SourceError('too-large');
  return { text: await res.text(), type };
}

/** POST {url} to a proxy route; anything but its JSON error shape means the proxy is not there. */
async function api(path: string, url: URL, { fetch, signal }: LoadDeps): Promise<Response> {
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: url.href }), signal };
  const res = await fetch(path, init).catch((e: unknown) => Promise.reject(signal.aborted ? e : new SourceError('proxy-unavailable')));
  if (res.ok && !(res.headers.get('content-type') ?? '').includes('text/html')) return res;
  const error = ((await res.json().catch(() => null)) as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  if (!isSourceErrorCode(error?.code)) throw new SourceError('proxy-unavailable');
  throw new SourceError(error.code, typeof error.message === 'string' ? error.message.slice(0, 200) : '');
}

async function mcp(url: URL, deps: LoadDeps): Promise<Doc> {
  const r = (await (await api('/api/mcp/tools', url, deps)).json()) as { tools?: unknown; serverInfo?: McpOptions['serverInfo']; protocolVersion?: string };
  return { doc: { tools: r.tools }, options: { url: url.href, serverInfo: r.serverInfo, protocolVersion: r.protocolVersion } };
}

function parse(got: Got): Doc {
  if (got.type?.includes('text/html') || /^\s*<(!doctype|html)/i.test(got.text)) throw new SourceError('html-page');
  const { value } = parseText(got.text);
  const found = detect(value);
  if (found.kind === 'unsupported') throw new SourceError('unsupported', found.message);
  return { doc: value, options: got.url ? { url: got.url } : {} };
}

async function fromUrl(raw: string, mode: Mode, deps: LoadDeps): Promise<Doc> {
  const url = toUrl(raw);
  deps.step('fetch', `Fetching spec (${url.host})`);
  if (mode === 'mcp' || (mode === 'auto' && MCP_PATH.test(url.pathname))) return mcp(url, deps);
  try {
    const slow = new AbortController();
    const timer = setTimeout(() => slow.abort(), DIRECT_TIMEOUT_MS);
    let got = await deps.fetch(url.href, { signal: AbortSignal.any([deps.signal, slow.signal]), credentials: 'omit' }).then((res) => read(res), (e: unknown) => {
      if (deps.signal.aborted) throw e;
      return undefined; // CORS, network or slow: ask the proxy
    }).finally(() => clearTimeout(timer));
    if (!got) {
      const res = await api('/api/fetch-spec', url, deps);
      got = await read(res, res.headers.get('x-spec-content-type') ?? '');
      if (got !== 'mcp') got.url = res.headers.get('x-spec-url') ?? url.href;
    }
    if (got === 'mcp') {
      if (mode === 'openapi') throw new SourceError('http-error', 'The URL answered like an MCP server, not a spec.');
      return await mcp(url, deps);
    }
    return parse({ url: url.href, ...got });
  } catch (e) {
    if (mode !== 'auto' || !notSpec(e)) throw e;
    return mcp(url, deps).catch((second: unknown) => Promise.reject(deps.signal.aborted ? second : e)); // the spec error says more
  }
}

async function fromText(input: Exclude<Input, { url: string }>, deps: LoadDeps): Promise<Doc> {
  if ('text' in input) return deps.step('fetch', 'Reading pasted text'), parse({ text: input.text });
  deps.step('fetch', `Reading ${input.file.name}`);
  if (input.file.size > MAX_SPEC_BYTES) throw new SourceError('too-large');
  return parse({ text: await input.file.text() });
}

const KIND = { openapi3: 'OpenAPI', swagger2: 'Swagger', mcp: 'MCP' } as const;

export async function loadSource(input: Input, mode: Mode, deps: LoadDeps): Promise<{ model: ApiModel; graph: AtlasGraph }> {
  const { doc, options } = 'url' in input ? await fromUrl(input.url, mode, deps) : await fromText(input, deps);
  deps.signal.throwIfAborted();
  const found = detect(doc);
  deps.step('parse', found.kind === 'unsupported' ? 'Parsing' : `Parsing (${KIND[found.kind]} ${'version' in found ? found.version : 'tools/list'})`);
  const model = await normalise(doc, options);
  deps.signal.throwIfAborted();
  deps.step('map', `Mapping ${model.operations.length} ${model.source.kind === 'mcp' ? 'tools' : 'operations'}`);
  const graph = buildGraph(model);
  deps.step('write', 'Writing skill');
  if (model.operations.length > 0) await deps.write(model, graph);
  deps.signal.throwIfAborted();
  return { model, graph };
}
