// Error codes shared with the client (phase 15's src/source/errors.ts uses the same names) and
// the JSON response helpers. Messages may quote an untrusted server, so they are always cleaned.

export type ErrorCode =
  | 'invalid-url'
  | 'blocked-host'
  | 'timeout'
  | 'too-large'
  | 'http-error'
  | 'needs-auth'
  | 'legacy-transport'
  | 'rate-limited'
  | 'bad-request';

const STATUS: Record<ErrorCode, number> = {
  'invalid-url': 400,
  'blocked-host': 403,
  timeout: 504,
  'too-large': 413,
  'http-error': 502,
  'needs-auth': 401,
  'legacy-transport': 502,
  'rate-limited': 429,
  'bad-request': 400,
};

/** Collapses whitespace, control and format characters to one space and caps the length. */
export const clean = (text: string, max = 200): string => text.replace(/[\p{Cc}\p{Cf}\s]+/gu, ' ').trim().slice(0, max);

export class ProxyError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  constructor(code: ErrorCode, message: string, status = STATUS[code]) {
    super(clean(message));
    this.name = 'ProxyError';
    this.code = code;
    this.status = status;
  }
}

/** Maps anything thrown to a ProxyError without echoing unknown error details. */
export function toProxyError(error: unknown): ProxyError {
  if (error instanceof ProxyError) return error;
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return new ProxyError('timeout', 'The server took too long to answer.');
  }
  return new ProxyError('http-error', 'Could not reach the server.');
}

export const SAFE_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; sandbox",
};

export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { ...SAFE_HEADERS, 'content-type': 'application/json; charset=utf-8' } });

export function errorResponse(error: unknown): Response {
  const { code, message, status } = toProxyError(error);
  return json({ error: { code, message } }, status);
}
