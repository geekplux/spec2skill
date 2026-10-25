// Where an identifier may wrap: at its word boundaries, never inside a word. Operation ids, paths,
// schema and field names and file names are long unbroken strings ("createUsersWithArrayInput",
// "/user/createWithArray", "pagination-and-errors.md"); in a narrow box the browser would otherwise
// break them anywhere ("createUsersWithArrayInp" / "ut"). <wbr> marks the boundaries: it adds no
// character, so copied text and accessible names stay the plain id. `overflow-wrap: anywhere` stays in
// the CSS only as the last resort for a single word longer than its box.
import { Fragment, type ReactNode } from 'react';

const SEPARATOR = /[_\-/.]/;
const isUpper = (c: string) => c >= 'A' && c <= 'Z';
const isLowerOrDigit = (c: string) => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');

/**
 * The pieces of `text` between its break opportunities: before a camelCase hump ("createUsers|With",
 * "HTTP|Server"), after "_", "-", "/" and "." (but not before a short lower-case file extension:
 * "tasks.md" stays whole) and before "{"; never after a run of separators alone ("__init__", the
 * leading "/" of a path). Joined, the pieces are `text`.
 */
export function idPieces(text: string): string[] {
  const pieces: string[] = [];
  let start = 0;
  for (let i = 1; i < text.length; i += 1) {
    const prev = text[i - 1]!;
    const ch = text[i]!;
    const next = text[i + 1] ?? '';
    const hump = isUpper(ch) && (isLowerOrDigit(prev) || (isUpper(prev) && next >= 'a' && next <= 'z'));
    const after = SEPARATOR.test(prev) && !SEPARATOR.test(ch) && ch !== ' ' && !(prev === '.' && /^[a-z0-9]{1,4}$/.test(text.slice(i)));
    const before = ch === '{' && prev !== ' ' && !SEPARATOR.test(prev);
    if ((hump || after || before) && /[^_\-/. ]/.test(text.slice(start, i))) {
      pieces.push(text.slice(start, i));
      start = i;
    }
  }
  pieces.push(text.slice(start));
  return pieces;
}

/** `text` with a <wbr> at each word boundary of its identifiers (idPieces). */
export function Breakable({ text }: { text: string }): ReactNode {
  const pieces = idPieces(text);
  if (pieces.length === 1) return text;
  let at = 0;
  return pieces.map((piece, i) => {
    const key = at;
    at += piece.length;
    return <Fragment key={key}>{i > 0 && <wbr />}{piece}</Fragment>;
  });
}
