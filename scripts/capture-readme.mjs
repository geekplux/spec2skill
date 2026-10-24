// The README hero, captured from the real app: the Tasks sample's skill browser ("Audit passed") under
// the map with getTask's detail panel open, at 1440x900 in the light theme with reduced motion.
//   pnpm build && pnpm capture:readme      (also renders the social preview, scripts/social-preview.mjs)
// Offline: every request outside the preview server is aborted and fails the capture.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, ORIGIN, ROOT, runSession, startPreview } from './browser/session.mjs';

const HERO = join(ROOT, 'docs', 'media', 'hero.png');

await runSession('capture-readme', async () => {
  await startPreview();
  const browser = await launchChrome();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const blocked = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (new URL(url).origin === ORIGIN) return route.continue();
    blocked.push(url);
    return route.abort('blockedbyclient');
  });
  // No Worker behind the preview server: answer health as a Worker without AI, so the prose is deterministic.
  await context.route(`${ORIGIN}/api/health`, (route) => route.fulfill({ json: { ok: true, ai: false } }));
  const page = await context.newPage();
  page.setDefaultTimeout(Number(process.env.CHECK_TIMEOUT_MS || 30_000));
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto(`${ORIGIN}/?sample=tasks`);
  await page.locator('.skill-browser[data-ready="true"]').waitFor({ state: 'attached' });
  await page.locator('[data-testid="atlas"][data-ready="true"]').waitFor({ state: 'attached' });
  await page.getByText(/Audit passed/).first().waitFor();
  await page.locator('.op[data-op="getTask"]').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('op-card').waitFor();
  await page.mouse.move(1, 1);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  mkdirSync(join(ROOT, 'docs', 'media'), { recursive: true });
  await page.screenshot({ path: HERO });
  console.log(`wrote ${HERO.slice(ROOT.length + 1)}`);
  if (blocked.length) throw new Error(`blocked off-origin requests:\n${blocked.join('\n')}`);
});
