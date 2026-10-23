// The CLI's inputs -> a normalised model: a built-in sample, a spec file, or a URL fetched directly
// from this machine (no proxy and no SSRF filter: the CLI runs on the user's own machine and talks
// only to the URL it is given). MCP URLs go through the Worker's tools/list-only client.
import { readFile, stat } from 'node:fs/promises';
import { normalise } from '../model/normalise';
import type { ApiModel } from '../model/types';
import { MAX_SPEC_BYTES, ParseError } from '../parse/text';
import { getSample, sampleModel } from '../samples';
import { SourceError, isSourceErrorCode } from '../source/errors';
import { type Doc, MCP_PATH, type Mode, notSpec, parse, toUrl } from '../source/fetchSource';
import { ProxyError, toProxyError } from '../../worker/errors';
import { SPEC_HEADERS, SPEC_TIMEOUT_MS } from '../../worker/fetchSpec';
import { type FetchFn, MAX_BYTES, type UrlCheck, deadline, fetchFollowing, readCapped } from '../../worker/limits';
import { listMcpTools } from '../../worker/mcpClient';

/** Any http(s) URL (redirects resolved against the previous hop); nothing else. */
export const checkCliUrl: UrlCheck = (raw, base) => {
  const url = URL.canParse(raw, base) ? new URL(raw, base) : undefined;
  if (!url || !/^https?:$/.test(url.protocol)) throw new ProxyError('invalid-url', 'Redirects must stay on http:// or https://.');
  return url;
};

/** Parse errors pass through; Worker errors carry the same codes as the web app's table (src/source/errors.ts). */
const asSource = (e: unknown): unknown => {
  if (e instanceof SourceError || e instanceof ParseError) return e;
  const p = toProxyError(e);
  return new SourceError(isSourceErrorCode(p.code) ? p.code : 'http-error', p.message);
};

async function mcp(url: URL, fetch: FetchFn): Promise<Doc> {
  const r = await listMcpTools(url, { fetch, checkUrl: checkCliUrl });
  return { doc: { tools: r.tools }, options: { url: url.href, serverInfo: r.serverInfo, protocolVersion: r.protocolVersion } };
}

/** The spec at `url`, or 'mcp' when the server answers like an MCP endpoint (405/406 or an event stream). */
async function spec(url: URL, fetch: FetchFn): Promise<Doc | 'mcp'> {
  const { signal, clear } = deadline(SPEC_TIMEOUT_MS);
  try {
    const { res, url: final } = await fetchFollowing(fetch, url, { headers: SPEC_HEADERS, signal }, checkCliUrl);
    const type = res.headers.get('content-type') ?? '';
    if (res.status === 405 || res.status === 406 || type.includes('text/event-stream')) return void res.body?.cancel().catch(() => {}), 'mcp';
    if (res.status === 401 || res.status === 403) throw new SourceError('needs-auth');
    if (!res.ok) throw new SourceError('http-error', `The server answered ${res.status}.`);
    return parse({ text: await readCapped(res, { left: MAX_BYTES }, signal), type, url: final.href });
  } finally {
    clear();
  }
}

async function fromUrl(raw: string, mode: Mode, fetch: FetchFn): Promise<Doc> {
  const url = toUrl(raw);
  if (mode === 'mcp' || (mode === 'auto' && MCP_PATH.test(url.pathname))) return mcp(url, fetch);
  try {
    const got = await spec(url, fetch);
    if (got !== 'mcp') return got;
    if (mode === 'openapi') throw new SourceError('http-error', 'The URL answered like an MCP server, not a spec.');
    return await mcp(url, fetch);
  } catch (e) {
    const error = asSource(e);
    if (mode !== 'auto' || !notSpec(error)) throw error;
    return mcp(url, fetch).catch(() => Promise.reject(error)); // the spec error says more
  }
}

async function fromFile(path: string): Promise<Doc> {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile()) throw new CliInputError(`No such file: ${path}`);
  if (info.size > MAX_SPEC_BYTES) throw new SourceError('too-large');
  return parse({ text: await readFile(path, 'utf8') });
}

/** An input problem with no entry in the web app's error table (a missing file). */
export class CliInputError extends Error {}

export const isUrlArg = (arg: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(arg);

export type Input = { sample: string } | { source: string; mode: Mode };

export async function loadModel(input: Input, fetch: FetchFn): Promise<ApiModel> {
  if ('sample' in input) {
    const sample = getSample(input.sample);
    if (!sample) throw new CliInputError(`Unknown sample: ${input.sample}`);
    return sampleModel(sample);
  }
  const { doc, options } = await (isUrlArg(input.source) ? fromUrl(input.source, input.mode, fetch) : fromFile(input.source)).catch((e: unknown) =>
    Promise.reject(e instanceof CliInputError ? e : asSource(e)),
  );
  return normalise(doc, options);
}
