// axe-core accessibility scan for the browser check: injected from node_modules (no CDN),
// WCAG 2.0-2.2 A/AA rules; serious and critical violations fail the run.
import { createRequire } from 'node:module';

const AXE_PATH = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const FAILING = new Set(['serious', 'critical']);

/** Returns one problem string per serious/critical violation (empty when clean). */
export async function runAxe(page, label) {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE_PATH });
  // Contrast is read at rest: let running CSS transitions (a theme switch, a state change) finish first.
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => {}))),
    new Promise((done) => setTimeout(done, 1000)),
  ]));
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] });
    return result.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target.join(' ')) }));
  });
  for (const v of violations) console.log(`  axe [${label}] ${v.impact}: ${v.id} (${v.targets.length} nodes)`);
  return violations
    .filter((v) => FAILING.has(v.impact))
    .map((v) => `axe [${label}] ${v.impact} ${v.id}: ${v.help} at ${v.targets.slice(0, 3).join(', ')}`);
}
