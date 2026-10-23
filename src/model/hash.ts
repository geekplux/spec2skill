// Content hash of a model: SHA-256 over canonical JSON (sorted keys, no whitespace,
// undefined dropped), excluding `source.url` so the same spec hashes the same wherever
// it was loaded from. Used as the cache key for AI results (phase 14).
import type { ApiModelBody } from './types';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    // Non-finite numbers become null, as in JSON.stringify.
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item ?? null)).join(',')}]`;
  const entries = Object.keys(value)
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .toSorted()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hashModel(body: ApiModelBody): Promise<string> {
  const { url: _url, ...source } = body.source;
  return sha256Hex(canonicalJson({ ...body, source }));
}
