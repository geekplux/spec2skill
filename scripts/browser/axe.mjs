// axe-core accessibility scan for the browser check: injected from node_modules (no CDN),
// WCAG 2.0-2.2 A/AA rules; serious and critical violations fail the run.
import { createRequire } from 'node:module';
import { settled } from './redesign-checks.mjs';

const AXE_PATH = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const FAILING = new Set(['serious', 'critical']);

/**
 * Returns one problem string per serious/critical violation (empty when clean); `{ all: true }` fails
 * on every violation, whatever its impact (the acceptance suite: DESIGN.md 8.8 asks for none).
 */
export async function runAxe(page, label, { all = false } = {}) {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE_PATH });
  // Contrast is read at rest: let running CSS transitions and one-shot animations (a state change, the
  // load sequence, a label fading in) finish first.
  await settled(page);
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] });
    return result.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target.join(' ')) }));
  });
  for (const v of violations) console.log(`  axe [${label}] ${v.impact}: ${v.id} (${v.targets.length} nodes)`);
  return violations
    .filter((v) => all || FAILING.has(v.impact))
    .map((v) => `axe [${label}] ${v.impact} ${v.id}: ${v.help} at ${v.targets.slice(0, 3).join(', ')}`);
}
