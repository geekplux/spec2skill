// Final pre-deploy smoke (phase 21): the built app served by the real Worker under `wrangler dev`
// (local env, no Cloudflare login, no AI), checked over HTTP and in one headless Chrome:
// /api/health, the SSRF guard, cache headers from public/_headers, the first view (skill pane ready,
// "Audit passed" beside the map) and a downloaded sample zip. Everything started is stopped at the end.
//
//   pnpm build && flock /workspace/gx-projects/logs/browser.lock pnpm smoke:worker
//   env: SMOKE_PORT (default 8787), CHROME_PATH, CHROME_ARGS
//   Screenshots: docs/screenshots/phase-21/worker-dev-landing.png, worker-dev-health.png.
// Manual cleanup if the script is SIGKILLed: pkill -f "wrangler.js dev -c wrangler.local.jsonc"; pkill workerd
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { ROOT, launchChrome, runSession, startServer } from './browser/session.mjs';

const PORT = Number(process.env.SMOKE_PORT || 8787);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = join(ROOT, 'docs', 'screenshots', 'phase-21');

const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

async function httpChecks() {
  const health = await (await fetch(`${ORIGIN}/api/health`)).json();
  expect(health.ok === true && health.ai === false, `/api/health: ${JSON.stringify(health)}`);
  console.log(`  GET /api/health -> ${JSON.stringify(health)}`);

  const blocked = await fetch(`${ORIGIN}/api/fetch-spec`, { method: 'POST', body: JSON.stringify({ url: 'http://127.0.0.1/' }) });
  const { error } = await blocked.json();
  expect(error.code === 'blocked-host', `/api/fetch-spec to 127.0.0.1: ${blocked.status} ${JSON.stringify(error)}`);
  console.log(`  POST /api/fetch-spec {"url":"http://127.0.0.1/"} -> ${blocked.status} ${error.code}`);

  const shell = await fetch(`${ORIGIN}/`);
  const html = await shell.text();
  expect(shell.ok && html.includes('<div id="root">'), `/ did not serve the app (${shell.status})`);
  expect(/no-cache/.test(shell.headers.get('cache-control') ?? ''), `/ Cache-Control: ${shell.headers.get('cache-control')}`);
  const asset = /src="\/(assets\/[^"]+\.js)"/.exec(html)?.[1];
  expect(asset, 'no hashed script in index.html');
  const cached = (await fetch(`${ORIGIN}/${asset}`)).headers.get('cache-control') ?? '';
  expect(cached.includes('immutable'), `/${asset} Cache-Control: ${cached}`);
  console.log(`  GET / -> Cache-Control: ${shell.headers.get('cache-control')}; /${asset} -> ${cached}`);

  const deepLink = await fetch(`${ORIGIN}/some/client/route`);
  expect(deepLink.ok && (await deepLink.text()).includes('<div id="root">'), `SPA fallback: ${deepLink.status}`);
  console.log('  GET /some/client/route -> app shell (SPA fallback)');
}

async function browserChecks() {
  const browser = await launchChrome();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, serviceWorkers: 'block' });
  const problems = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (new URL(url).origin === ORIGIN) return route.continue();
    problems.push(`blocked off-origin request: ${url}`);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(Number(process.env.CHECK_TIMEOUT_MS || 30_000));
  page.on('console', (msg) => msg.type() === 'error' && problems.push(`console error: ${msg.text()}`));
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  await page.emulateMedia({ colorScheme: 'light' });

  await page.goto(ORIGIN);
  await page.locator('.skill-browser[data-ready="true"]').waitFor();
  await page.locator('[data-testid="atlas"][data-ready="true"]').waitFor();
  const verdict = (await page.locator('.skill-browser .verdict').first().textContent())?.trim();
  expect(verdict === 'Audit passed:', `skill pane verdict: ${verdict}`);
  const [pane, map] = [await page.locator('.skill-browser').boundingBox(), await page.locator('.map').first().boundingBox()];
  expect(pane && map && pane.x + pane.width <= map.x, `skill pane is not beside the map: ${JSON.stringify({ pane, map })}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, 'worker-dev-landing.png') });
  console.log('  / -> skill pane ready, "Audit passed" beside the map; screenshot worker-dev-landing.png');

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.skill-browser').getByRole('button', { name: 'Download .zip' }).click()]);
  const file = await download.path();
  const entries = Object.keys(unzipSync(readFileSync(file)));
  const slug = download.suggestedFilename().replace(/-skill\.zip$/, '');
  expect(entries.includes(`${slug}/SKILL.md`) && entries.includes(`${slug}/evals/evals.json`), `zip entries: ${entries.slice(0, 10).join(', ')}`);
  console.log(`  Download .zip -> ${download.suggestedFilename()} (${entries.length} entries, SKILL.md and evals/evals.json present)`);

  await page.goto(`${ORIGIN}/api/health`);
  expect((await page.locator('body').textContent())?.includes('"ok":true'), '/api/health in the browser');
  await page.screenshot({ path: join(OUT, 'worker-dev-health.png') });
  console.log('  /api/health in Chrome; screenshot worker-dev-health.png');

  await context.close();
  if (problems.length > 0) throw new Error(problems.join('\n'));
}

async function main() {
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) throw new Error('dist/ not found; run `pnpm build` first');
  mkdirSync(OUT, { recursive: true });
  const wrangler = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const args = [wrangler, 'dev', '-c', 'wrangler.local.jsonc', '--ip', '127.0.0.1', '--port', String(PORT), '--show-interactive-dev-session=false'];
  await startServer('wrangler dev', process.execPath, args, ORIGIN, { readyPath: '/api/health', timeoutMs: 90_000 });
  await httpChecks();
  await browserChecks();
}

await runSession('worker smoke', main);
