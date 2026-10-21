// Spec text is untrusted data (S3): it reaches generated files only through these helpers,
// as one capped line with no HTML, no control characters and nothing Markdown acts on.

// Controls (tabs and newlines too), zero-width and bidi characters, BOM.
// oxlint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g;
/** Tags of real HTML elements; other angle-bracket text (`<token>`) stays and is escaped by `inert`. */
const HTML_TAG =
  /<\/?(?:a|abbr|b|base|blockquote|body|br|button|code|del|details|div|em|embed|font|form|h[1-6]|head|hr|html|i|iframe|img|input|ins|kbd|li|link|meta|noscript|object|ol|option|p|pre|s|select|small|span|strong|sub|summary|sup|svg|table|tbody|td|textarea|th|thead|tr|u|ul)\b[^>]*(?:>|$)/gi;
export const CAP = { summary: 160, description: 600, label: 60 } as const;

/** One line of plain text: tags and control characters removed, whitespace collapsed, capped. */
export function plain(value: unknown, max: number = CAP.description): string {
  if (typeof value !== 'string') return '';
  const text = value.replace(/<(script|style)\b[\s\S]*?(?:<\/\1\s*>|$)|<!--[\s\S]*?(?:-->|$)/gi, ' ')
    .replace(HTML_TAG, ' ').replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Plain text that Markdown renders literally: no code spans, links, HTML, table cells or block markers. */
export const inert = (value: unknown, max?: number): string =>
  plain(value, max).replaceAll('`', "'").replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replace(/[\\[\]|*]/g, '\\$&').replace(/^([#+=-]|\d+[.)])/, '\\$1');

/** Spec text as a blockquote line (empty when there is none). */
export const quote = (value: unknown, max?: number): string => (plain(value) ? `> ${inert(value, max)}` : '');

/** A name for headings and frontmatter: letters, digits, spaces and `.-_()` only. */
export const label = (value: unknown, fallback = 'API'): string =>
  plain(value, CAP.label).replace(/[^\p{L}\p{N} ._()-]/gu, '').replace(/\s+/g, ' ').trim() || fallback;

/** An identifier (operation id, param, path) as a code span. */
export const code = (value: unknown): string => `\`${plain(value, 120).replaceAll('`', "'") || '?'}\``;

/** kebab-case ASCII: `a-z`, `0-9` and single dashes, at most `max` characters. */
export const kebab = (value: string, max = 64): string =>
  value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, max).replace(/^-+|-+$/g, '');

/**
 * A file name from spec text: `[a-z0-9-]` only; traversal (`..`), absolute paths and names
 * with nothing left fall back; collisions with `taken` get `-2`, `-3`, ... Adds the result to `taken`.
 */
export function safeFileName(raw: string, taken: Set<string>, fallback: string): string {
  const base = (/\.\.|^[\\/]|^[a-z]:/i.test(raw) ? '' : kebab(raw, 48)) || kebab(fallback, 48) || 'file';
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  taken.add(name);
  return name;
}

/** Every key a relative path of safe segments, or throw: the last guard before files are written. */
export function assertSafePaths(paths: string[]): void {
  const bad = paths.find((p) => !/^(?:[a-z0-9][a-z0-9_.-]*\/)*[a-z0-9][a-z0-9_.-]*$/i.test(p) || p.split('/').includes('..'));
  if (bad !== undefined) throw new Error(`unsafe file name in generated skill: ${JSON.stringify(bad)}`);
}
