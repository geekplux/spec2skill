// Size, time and redirect limits for upstream requests (S1, P5). No Worker-only APIs: the CLI
// (phase 16) reuses this module through the MCP client.
import { ProxyError } from './errors';
import { checkUrl } from './ssrf';

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 3;

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
export type UrlCheck = (raw: string, base?: URL) => URL;
/** A byte allowance that several responses (MCP pages) can draw from. */
export interface ByteBudget {
  left: number;
}

const tooLarge = () => new ProxyError('too-large', 'The response is too large (the limit is 5 MB).');
const discard = (body: ReadableStream | null) => void body?.cancel().catch(() => {});

/** An abort signal that fires a `timeout` ProxyError after `ms` (setTimeout, so fake timers work). */
export function deadline(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new ProxyError('timeout', `The server did not answer within ${ms / 1000} s.`)), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/** Streams `body` as text into `onText` until it returns true, the stream ends, the budget runs out or `signal` aborts. */
export async function streamText(
  body: ReadableStream<Uint8Array> | null,
  budget: ByteBudget,
  signal: AbortSignal | undefined,
  onText: (text: string) => boolean,
): Promise<void> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const stop = () => void reader.cancel().catch(() => {});
  signal?.addEventListener('abort', stop, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        onText(decoder.decode());
        return;
      }
      budget.left -= value.byteLength;
      if (budget.left < 0) throw tooLarge();
      if (onText(decoder.decode(value, { stream: true }))) return;
    }
  } finally {
    signal?.removeEventListener('abort', stop);
    stop();
  }
}

export async function readCapped(
  message: { headers: Headers; body: ReadableStream<Uint8Array> | null },
  budget: ByteBudget,
  signal?: AbortSignal,
): Promise<string> {
  if (Number(message.headers.get('content-length')) > budget.left) {
    discard(message.body);
    throw tooLarge();
  }
  let text = '';
  await streamText(message.body, budget, signal, (chunk) => {
    text += chunk;
    return false;
  });
  return text;
}

/** Fetches with `redirect: "manual"`, re-checking every hop with `check`; at most MAX_REDIRECTS hops. */
export async function fetchFollowing(fetchFn: FetchFn, start: URL, init: RequestInit, check: UrlCheck = checkUrl): Promise<{ res: Response; url: URL }> {
  let url = start;
  for (let hop = 0; ; hop++) {
    const res = await fetchFn(url.href, { ...init, redirect: 'manual' });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (location === null) return { res, url };
    discard(res.body);
    if (hop === MAX_REDIRECTS) throw new ProxyError('http-error', `Too many redirects (more than ${MAX_REDIRECTS}).`);
    url = check(location, url);
  }
}
