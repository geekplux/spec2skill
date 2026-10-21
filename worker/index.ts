// The Worker: static assets for everything except /api/* (run_worker_first), plus the three API
// routes. Handlers take (request, env, deps) so tests run in plain Vitest (D3). Request bodies are
// never logged; parsing stays in the browser.
import { ProxyError, errorResponse, json } from './errors';
import { type SpecDeps, fetchSpec } from './fetchSpec';
import { readCapped } from './limits';
import { listMcpTools } from './mcpClient';
import { checkUrl } from './ssrf';

export interface WorkerEnv {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  /** Workers rate limiting binding (30 / 60 s per IP); absent in local tests = no limit. */
  RATE_LIMITER?: { limit: (options: { key: string }) => Promise<{ success: boolean }> };
}

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
    if (pathname === '/api/health') return json({ ok: true, ai: false });
    const route = Object.hasOwn(ROUTES, pathname) ? ROUTES[pathname] : undefined;
    if (!route) throw new ProxyError('bad-request', 'Unknown API route.', 404);
    if (request.method !== 'POST') throw new ProxyError('bad-request', 'Use POST.', 405);
    const limit = await env.RATE_LIMITER?.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' });
    if (limit && !limit.success) throw new ProxyError('rate-limited', 'Too many requests; try again in a minute.');
    return await route(await targetUrl(request), request, deps);
  } catch (error) {
    return errorResponse(error);
  }
}

export default {
  fetch: (request, env) => handle(request, env, { fetch: (input, init) => fetch(input, init), cache: caches.default }),
} satisfies ExportedHandler<Env>;
