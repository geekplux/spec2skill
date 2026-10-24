// The spacing rule of docs/redesign/DESIGN.md 2, as a lint step (`pnpm lint`): layout spacing (margin,
// padding, gap, inset, top/right/bottom/left) uses the --space-* tokens, named by value (2, 4, 8, 12, 14,
// 16, 20, 24, 32, 40, 48, 64, 88, 96, 104; src/design/tokens.css), never raw px or rem.
// The token file is exempt, and so is the short allow-list below.
//
//   node scripts/check-spacing.mjs [file.css ...]   (default: every .css file under src/)
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TOKENS = 'src/design/tokens.css';
const PROPS = /^(?:(?:margin|padding|inset)(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|(?:row-|column-)?gap|top|right|bottom|left)$/;
const RAW = /(?<![\w.#-])-?(\d*\.?\d+)(px|rem)\b/g;

/** [file, selector, property]: each a deliberate exception, with why. */
export const ALLOW = [
  // The skip link waits above the page until focused (off-screen positioning, not spacing).
  ['src/app.css', '.skip', 'top'],
  // Joined tabs overlap by one hairline so their shared border is 1 px, not 2.
  ['src/app.css', ".tabs [role='tab'] + [role='tab']", 'margin-left'],
];

/** One problem per raw px/rem length in a spacing declaration of `source`. */
export function checkSpacing(source, file = 'inline.css', allow = ALLOW) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const problems = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '{' && ch !== '}' && ch !== ';') continue;
    const chunk = text.slice(start, i);
    if (ch === '{') stack.push(chunk.trim().replace(/\s+/g, ' '));
    else {
      const colon = chunk.indexOf(':');
      const selector = stack.at(-1) ?? '';
      if (colon > 0 && !selector.startsWith('@')) {
        const prop = chunk.slice(0, colon).trim().toLowerCase();
        const value = chunk.slice(colon + 1).trim();
        const raw = PROPS.test(prop) ? [...value.matchAll(RAW)].filter((m) => Number(m[1]) !== 0) : [];
        const allowed = allow.some(([f, s, p]) => f === file && s === selector && p === prop);
        if (raw.length > 0 && !allowed) {
          const line = text.slice(0, start + chunk.search(/\S/)).split('\n').length;
          problems.push(`${file}:${line}: ${selector} { ${prop}: ${value} } uses ${raw.map((m) => m[0]).join(', ')}; use var(--space-*)`);
        }
      }
      if (ch === '}') stack.pop();
    }
    start = i + 1;
  }
  return problems;
}

function cssFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? cssFiles(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : []);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = (process.argv.length > 2 ? process.argv.slice(2).map((f) => resolve(f)) : cssFiles(join(ROOT, 'src')))
    .map((f) => relative(ROOT, f).split('\\').join('/'))
    .filter((f) => f !== TOKENS);
  const problems = files.flatMap((f) => checkSpacing(readFileSync(join(ROOT, f), 'utf8'), f));
  for (const p of problems) console.error(p);
  if (problems.length > 0) {
    console.error(`spacing check failed: ${problems.length} raw px/rem spacing value(s) (docs/DESIGN.md 3)`);
    process.exit(1);
  }
  console.log(`spacing check passed (${files.length} file${files.length === 1 ? '' : 's'})`);
}
