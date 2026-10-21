import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProxyError } from './errors';
import { MAX_BYTES, deadline, fetchFollowing, readCapped } from './limits';
import { hangingFetch, recorder, redirect, streamOf } from './__fixtures__/fakes';

const codeOf = async (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: unknown) => (error instanceof ProxyError ? error.code : String(error)),
  );

afterEach(() => {
  vi.useRealTimers();
});

describe('readCapped', () => {
  it('reads a body under the cap and charges the budget', async () => {
    const budget = { left: 100 };
    expect(await readCapped(new Response(streamOf(['hello ', 'world'])), budget)).toBe('hello world');
    expect(budget.left).toBe(89);
  });

  it('decodes UTF-8 split across chunks', async () => {
    const bytes = new TextEncoder().encode('café');
    const text = await readCapped(new Response(streamOf([bytes.slice(0, 4), bytes.slice(4)])), { left: 100 });
    expect(text).toBe('café');
  });

  it('rejects a declared Content-Length over the cap before reading', async () => {
    const res = new Response('x', { headers: { 'content-length': String(MAX_BYTES + 1) } });
    expect(await codeOf(readCapped(res, { left: MAX_BYTES }))).toBe('too-large');
  });

  it('aborts a streamed body over 5 MB with too-large (no Content-Length)', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(chunk);
      },
    });
    expect(await codeOf(readCapped(new Response(endless), { left: MAX_BYTES }))).toBe('too-large');
    expect(pulled).toBeLessThan(10);
  });
});

describe('deadline', () => {
  it('aborts a hanging upstream with timeout after 10 s', async () => {
    vi.useFakeTimers();
    const { signal } = deadline(10_000);
    const result = codeOf(hangingFetch('https://example.com/', { signal }));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe('timeout');
  });

  it('aborts a body that stalls after the headers', async () => {
    vi.useFakeTimers();
    const { signal } = deadline(10_000);
    const result = codeOf(readCapped(new Response(streamOf(['{"openapi":'], true)), { left: MAX_BYTES }, signal));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toBe('timeout');
  });
});

describe('fetchFollowing', () => {
  const start = new URL('https://a.example.com/spec');

  it('follows up to 3 redirects, re-validating each hop and always using redirect: manual', async () => {
    const { fetch, calls } = recorder(({ url }) => {
      const n = Number(new URL(url).searchParams.get('n') ?? 0);
      return n < 3 ? redirect(`/spec?n=${n + 1}`) : new Response('ok');
    });
    const { res, url } = await fetchFollowing(fetch, start, {});
    expect(await res.text()).toBe('ok');
    expect(url.href).toBe('https://a.example.com/spec?n=3');
    expect(calls).toHaveLength(4);
    expect(calls.every((c) => c.init.redirect === 'manual')).toBe(true);
  });

  it('fails a 4-hop redirect chain with a clear error', async () => {
    const { fetch, calls } = recorder(({ url }) => redirect(`${url}x`, 301));
    await expect(fetchFollowing(fetch, start, {})).rejects.toThrow('Too many redirects (more than 3).');
    expect(calls).toHaveLength(4);
  });

  it('refuses a redirect to 127.0.0.1 at the second hop without fetching it', async () => {
    const { fetch, calls } = recorder(() => redirect('http://127.0.0.1/admin'));
    expect(await codeOf(fetchFollowing(fetch, start, {}))).toBe('blocked-host');
    expect(calls.map((c) => c.url)).toEqual(['https://a.example.com/spec']);
  });

  it('refuses redirects to other schemes', async () => {
    const { fetch } = recorder(() => redirect('file:///etc/passwd', 307));
    expect(await codeOf(fetchFollowing(fetch, start, {}))).toBe('invalid-url');
  });

  it('returns a 3xx without Location as is', async () => {
    const { fetch } = recorder(() => new Response(null, { status: 304 }));
    expect((await fetchFollowing(fetch, start, {})).res.status).toBe(304);
  });
});
