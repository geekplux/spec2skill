// Small helpers shared by the normalisers. Spec strings are untrusted: they are kept as
// plain text (never HTML), stripped of control characters and capped.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// C0 controls except tab and newline, DEL, C1 controls, bidi overrides and isolates.
// oxlint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/g;

/** Plain multi-line text, or undefined when absent/empty. */
export function cleanText(value: unknown, max = 2000): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\r\n?/g, '\n').replace(UNSAFE, '').trim();
  if (text === '') return undefined;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** A single-line label (names, ids, titles). */
export function cleanName(value: unknown, max = 200): string | undefined {
  return cleanText(typeof value === 'string' ? value.replace(/\s+/g, ' ') : value, max);
}
