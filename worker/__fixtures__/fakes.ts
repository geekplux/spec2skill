// Test-only fakes: an injected `fetch` that records every call, and controllable body streams.
import type { FetchFn } from '../limits';

export interface Call {
  url: string;
  init: RequestInit;
  headers: Headers;
  body: string | undefined;
}

export type Handler = (call: Call) => Response | Promise<Response>;

export function recorder(handler: Handler): { fetch: FetchFn; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchFn = async (url, init = {}) => {
    const call = { url, init, headers: new Headers(init.headers), body: typeof init.body === 'string' ? init.body : undefined };
    calls.push(call);
    return handler(call);
  };
  return { fetch, calls };
}

/** A body that sends `chunks` and then closes, or stays open forever when `hang` is set. */
export function streamOf(chunks: (string | Uint8Array)[], hang = false): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      if (!hang) controller.close();
    },
  });
}

/** A fetch that never answers until its signal aborts, then rejects with the signal's reason. */
export const hangingFetch: FetchFn = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });

export const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });
