// The repository's social preview: renders docs/media/social-preview.html (which crops the README hero,
// docs/media/hero.png) in headless system Chrome at 1280x640 to docs/social-preview.png (< 1 MB).
//   node scripts/social-preview.mjs        (run by `pnpm capture:readme` after the hero)
// Only file:// requests are allowed; nothing is fetched from the network.
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchChrome, ROOT, runSession } from './browser/session.mjs';

const PAGE = join(ROOT, 'docs', 'media', 'social-preview.html');
const OUT = join(ROOT, 'docs', 'social-preview.png');

await runSession('social-preview', async () => {
  if (!existsSync(join(ROOT, 'docs', 'media', 'hero.png'))) throw new Error('docs/media/hero.png is missing; run pnpm capture:readme');
  const browser = await launchChrome();
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  const blocked = [];
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) return route.continue();
    blocked.push(url);
    return route.abort('blockedbyclient');
  });
  await page.goto(pathToFileURL(PAGE).href);
  await page.evaluate(() => document.fonts.ready);
  const broken = await page.evaluate(() => [...document.images].filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src));
  if (broken.length) throw new Error(`images did not load: ${broken.join(', ')}`);
  await page.screenshot({ path: OUT });
  const kb = statSync(OUT).size / 1024;
  console.log(`wrote docs/social-preview.png (${kb.toFixed(0)} KB)`);
  if (kb >= 1024) throw new Error('social preview is 1 MB or more');
  if (blocked.length) throw new Error(`blocked requests:\n${blocked.join('\n')}`);
});
