// The Worker: static assets for everything except /api/* (run_worker_first), plus the API
// routes. Handlers take (request, env, deps) so tests run in plain Vitest (D3). Request bodies are
// never logged; parsing stays in the browser.
import { type AiEnv, aiModel, describe } from './ai';
import { ProxyError, errorResponse, json } from './errors';
import { type SpecDeps, fetchSpec } from './fetchSpec';
import { readCapped } from './limits';
import { listMcpTools } from './mcpClient';
import { checkUrl } from './ssrf';

type Limiter = { limit: (options: { key: string }) => Promise<{ success: boolean }> };

export interface WorkerEnv extends AiEnv {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  /** Workers rate limiting binding (30 / 60 s per IP); absent in local tests = no limit. */
  RATE_LIMITER?: Limiter;
  /** The same for /api/ai/describe (10 / 60 s per IP). */
  AI_RATE_LIMITER?: Limiter;
  /** One shared key for the two fetch proxies, site-wide (300 / 60 s): many IPs together cannot turn
   * them into a bulk fetcher. Per Cloudflare location, approximate. */
  PROXY_LIMITER?: Limiter;
}

/** The key every proxy request is counted under by PROXY_LIMITER. */
const PROXY_KEY = 'proxy';

export type Deps = SpecDeps;

const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_URL_LENGTH = 2048;

const ROUTES: Record<string, (url: URL, request: Request, deps: Deps) => Promise<Response>> = {
  '/api/fetch-spec': (url, request, deps) => fetchSpec(url, deps, new URL(request.url).origin),
  '/api/mcp/tools': async (url, _request, deps) => json(await listMcpTools(url, { fetch: deps.fetch })),
};

/** Reads `{"url": "..."}` from the request body and validates the URL (S1). */
async function targetUrl(request: Request): Promise<URL> {
  const text = await readCapped(request, { left: MAX_REQUEST_BYTES });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  const url = typeof body === 'object' && body !== null && 'url' in body ? body.url : undefined;
  if (typeof url !== 'string' || url.length > MAX_URL_LENGTH) {
    throw new ProxyError('bad-request', 'Send a JSON body like {"url": "https://example.com/openapi.json"}.');
  }
  return checkUrl(url.trim());
}

export async function handle(request: Request, env: WorkerEnv, deps: Deps): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  try {
    if (pathname === '/api/health') return json(env.AI ? { ok: true, ai: true, model: aiModel(env) } : { ok: true, ai: false });
    const ai = pathname === '/api/ai/describe';
    const route = Object.hasOwn(ROUTES, pathname) ? ROUTES[pathname] : undefined;
    if (!route && !ai) throw new ProxyError('bad-request', 'Unknown API route.', 404);
    if (request.method !== 'POST') throw new ProxyError('bad-request', 'Use POST.', 405);
    const limit = await (ai ? env.AI_RATE_LIMITER : env.RATE_LIMITER)?.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' });
    if (limit && !limit.success) throw new ProxyError('rate-limited', 'Too many requests; try again in a minute.');
    const site = route ? await env.PROXY_LIMITER?.limit({ key: PROXY_KEY }) : undefined;
    if (site && !site.success) throw new ProxyError('rate-limited', 'This site is fetching a lot of specs right now; try again in a minute.');
    return await (route ? route(await targetUrl(request), request, deps) : describe(request, env));
  } catch (error) {
    return errorResponse(error);
  }
}

export default {
  fetch: (request, env) => handle(request, env, { fetch: (input, init) => fetch(input, init), cache: caches.default }),
} satisfies ExportedHandler<Env>;
