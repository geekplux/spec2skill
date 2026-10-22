// Docs link check (`pnpm test:docs`, also run by Vitest): in the repo's Markdown docs, every relative
// link and image (Markdown or HTML) must resolve, every repo path in a code span (`src/graph/infer.ts`)
// must exist, and every function named in a code span (`buildGraph()`) must be defined in the source.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DOCS = ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'docs/EXTENDING.md', 'docs/GOOD_FIRST_ISSUES.md', 'examples/README.md'];
const SOURCE_DIRS = ['src', 'worker', 'scripts'];
const PATH_SPAN = /^(?:src|worker|scripts|samples|docs|examples|public|ci)\/[\w./-]*$/;

/** Relative link and image targets, without #fragment or ?query; external and in-page links are skipped. */
export function linkTargets(markdown) {
  const text = markdown.replace(/^```[\s\S]*?^```/gm, '');
  const raw = [
    ...[...text.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1]),
    ...[...text.matchAll(/^\[[^\]]+\]:\s*(\S+)/gm)].map((m) => m[1]),
    ...[...text.matchAll(/\b(?:src|href|srcset)="([^"]+)"/g)].map((m) => m[1]),
  ];
  return raw.filter((t) => !/^([a-z][a-z0-9+.-]*:|#)/i.test(t)).map((t) => t.split(/[#?]/)[0]).filter(Boolean);
}

/** Code spans outside fenced blocks: repo paths, and names called like functions (`name()`). */
export function codeSpans(markdown) {
  const spans = [...markdown.replace(/^```[\s\S]*?^```/gm, '').matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim());
  return {
    paths: spans.filter((s) => PATH_SPAN.test(s)),
    functions: spans.flatMap((s) => /^([A-Za-z_$][\w$]*)\(\)$/.exec(s)?.[1] ?? []),
  };
}

function sourceText(root) {
  const files = SOURCE_DIRS.flatMap((dir) =>
    readdirSync(join(root, dir), { recursive: true }).map(String).filter((p) => /\.(ts|tsx|mjs)$/.test(p) && !p.includes('node_modules')).map((p) => join(root, dir, p)),
  );
  return files.map((f) => readFileSync(f, 'utf8')).join('\n');
}

/** Problems in `file` (relative to `root`): one line each, empty when every link, path and name resolves. */
export function problemsIn(root, file, source = sourceText(root)) {
  const markdown = readFileSync(join(root, file), 'utf8');
  const out = [];
  for (const target of linkTargets(markdown)) {
    if (!existsSync(resolve(root, dirname(file), decodeURIComponent(target)))) out.push(`${file}: broken link ${target}`);
  }
  const { paths, functions } = codeSpans(markdown);
  for (const path of paths) if (!existsSync(join(root, path))) out.push(`${file}: no such path \`${path}\``);
  for (const name of functions) {
    const defined = new RegExp(`(?:function\\*?|const|let|class)\\s+${name.replace('$', '\\$')}\\b|\\b${name}\\s*\\([^)]*\\)\\s*\\{`).test(source);
    if (!defined) out.push(`${file}: no function \`${name}()\` in ${SOURCE_DIRS.join(', ')}`);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const source = sourceText(root);
  const problems = DOCS.flatMap((file) => problemsIn(root, file, source));
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`links ok (${DOCS.length} files)`);
}
