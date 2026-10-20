// Gzip size budgets for the initial page load (PLAN.md section 4, P1).
// Usage: pnpm build && pnpm check:size
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Asset paths (relative to dist/) that index.html loads up front. */
export function initialAssets(html) {
  const found = new Set();
  for (const match of html.matchAll(/(?:src|href)="\/?(assets\/[^"]+)"/g)) found.add(match[1]);
  return [...found].toSorted();
}

const kb = (bytes) => bytes / 1024;

/** sizes: { [path]: gzipBytes } for index.html + initial assets. */
export function evaluateSizes(sizes, budget) {
  let js = 0;
  let total = 0;
  for (const [path, bytes] of Object.entries(sizes)) {
    total += bytes;
    if (path.endsWith('.js')) js += bytes;
  }
  const failures = [];
  if (kb(js) > budget.initialJsGzipKB)
    failures.push(`initial JS ${kb(js).toFixed(1)} KB gzip > ${budget.initialJsGzipKB} KB`);
  if (kb(total) > budget.initialTotalGzipKB)
    failures.push(`initial total ${kb(total).toFixed(1)} KB gzip > ${budget.initialTotalGzipKB} KB`);
  return { jsKB: kb(js), totalKB: kb(total), failures };
}

function main() {
  const indexPath = join('dist', 'index.html');
  if (!existsSync(indexPath)) {
    console.error('check:size: dist/index.html not found; run `pnpm build` first');
    process.exit(1);
  }
  const budget = JSON.parse(readFileSync(new URL('./size-budget.json', import.meta.url), 'utf8'));
  const html = readFileSync(indexPath);
  const sizes = { 'index.html': gzipSync(html, { level: 9 }).length };
  for (const asset of initialAssets(html.toString('utf8'))) {
    sizes[asset] = gzipSync(readFileSync(join('dist', asset)), { level: 9 }).length;
  }
  for (const [path, bytes] of Object.entries(sizes)) {
    console.log(`  ${kb(bytes).toFixed(1).padStart(7)} KB  ${path}`);
  }
  const result = evaluateSizes(sizes, budget);
  console.log(
    `initial JS ${result.jsKB.toFixed(1)}/${budget.initialJsGzipKB} KB, ` +
      `total ${result.totalKB.toFixed(1)}/${budget.initialTotalGzipKB} KB (gzip)`,
  );
  if (result.failures.length > 0) {
    for (const failure of result.failures) console.error(`over budget: ${failure}`);
    process.exit(1);
  }
  console.log('size check passed');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
