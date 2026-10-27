// POST /api/fetch-spec: fetches a validated public spec URL for the browser. The
// upstream request is built from scratch, so no client header, cookie or credential is forwarded.
// The body goes back as text/plain (never the upstream type), so nothing renders on our origin.
import { ProxyError, SAFE_HEADERS, clean } from './errors';
import { type FetchFn, MAX_BYTES, deadline, fetchFollowing, readCapped } from './limits';

export const SPEC_TIMEOUT_MS = 10_000;
export const SPEC_HEADERS = {
  accept: 'application/json, application/yaml, text/yaml, */*',
  'user-agent': 'spec2skill (+https://github.com/geekplux/spec2skill)',
};
const CACHE_SECONDS = 300;

export interface SpecDeps {
  fetch: FetchFn;
  cache?: Pick<Cache, 'match' | 'put'> | null;
}

/** `url` has passed `checkUrl`; `origin` is this Worker's origin (the Cache API key lives there). */
export async function fetchSpec(url: URL, deps: SpecDeps, origin: string): Promise<Response> {
  const key = `${origin}/api/fetch-spec?url=${encodeURIComponent(url.href)}`;
  const hit = await deps.cache?.match(key);
  if (hit) return hit;
  const { signal, clear } = deadline(SPEC_TIMEOUT_MS);
  try {
    const { res, url: finalUrl } = await fetchFollowing(deps.fetch, url, { headers: SPEC_HEADERS, signal });
    if (res.status === 401 || res.status === 403) throw new ProxyError('needs-auth', `The server answered ${res.status}: this spec needs credentials.`);
    if (!res.ok) throw new ProxyError('http-error', `The server answered ${res.status}.`);
    const text = await readCapped(res, { left: MAX_BYTES }, signal);
    const out = new Response(text, {
      headers: {
        ...SAFE_HEADERS,
        'cache-control': `public, max-age=${CACHE_SECONDS}`,
        'content-type': 'text/plain; charset=utf-8',
        'x-spec-content-type': clean(res.headers.get('content-type') ?? '', 100),
        'x-spec-url': finalUrl.href,
      },
    });
    await deps.cache?.put(key, out.clone());
    return out;
  } finally {
    clear();
  }
}
