// Headless-browser check: serves dist/ with `vite preview`, drives the system Chrome
// through playwright-core, runs the flows for phases <= --phase, saves screenshots.
//
//   pnpm build && pnpm check:browser -- --phase 1 [--flow <name>] [--no-axe] [--no-cvd] [--label <name>]
//   pnpm check:browser -- --phase 18 --audit [--viewports 1440x900,390x844] --label before
//   --audit visits every view (scripts/browser/audit.mjs) once per viewport instead of running the flows;
//   --label puts the screenshots in docs/screenshots/phase-<n>/<label>/.
//   axe (serious/critical violations fail; run after every flow and wherever a flow calls
//   axe(label)) and CVD simulation screenshots (flows call cvd(type)) are on by default.
//   env: CHROME_PATH (default /usr/bin/google-chrome), CHROME_ARGS (extra flags),
//        CHECK_FAIL=1 (force a failure after startup, to test cleanup),
//        CHECK_PORT (default 4173; for when another project's preview holds the port),
//        CHECK_TIMEOUT_MS (default 30000: waits and navigations; a loaded machine needs headroom)
//
// Every request outside http://127.0.0.1:<port> is aborted and fails the check.
// The preview server and Chrome are started and always cleaned up by scripts/browser/session.mjs.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runAxe } from './browser/axe.mjs';
import { simulateCvd } from './browser/cvd.mjs';
import { launchChrome, ORIGIN, ROOT, runSession, startPreview } from './browser/session.mjs';

const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };
const TIMEOUT = Number(process.env.CHECK_TIMEOUT_MS || 30_000);

function parseArgs(argv) {
  const args = { phase: 1, flow: null, axe: true, cvd: true, audit: false, label: null, viewports: [{ width: 1440, height: 900 }, { width: 390, height: 844 }] };
  for (let i = 0; i < argv.length; i++) {
    const [key, inline] = argv[i].split('=', 2);
    if (key === '--') continue;
    const toggle = /^--(no-)?(axe|cvd)$/.exec(key);
    if (toggle) {
      args[toggle[2]] = !toggle[1];
      continue;
    }
    if (key === '--audit') {
      args.audit = true;
      continue;
    }
    if (!['--phase', '--flow', '--label', '--viewports'].includes(key)) throw new Error(`unknown argument: ${argv[i]}`);
    const value = inline ?? argv[++i];
    if (!value) throw new Error(`${key} needs a value`);
    if (key === '--flow') args.flow = value;
    else if (key === '--label') {
      if (!/^[a-z0-9-]+$/.test(value)) throw new Error(`--label must be lowercase letters, digits and dashes, got ${value}`);
      args.label = value;
    } else if (key === '--viewports') {
      args.viewports = value.split(',').map((v) => {
        const m = /^(\d+)x(\d+)$/.exec(v.trim());
        if (!m) throw new Error(`--viewports takes WxH,WxH..., got ${v}`);
        return { width: Number(m[1]), height: Number(m[2]) };
      });
    }
    else if (/^\d+$/.test(value)) args.phase = Number(value);
    else throw new Error(`--phase must be a number, got ${value}`);
  }
  return args;
}

async function loadFlows(maxPhase, only) {
  const dir = join(ROOT, 'scripts', 'browser', 'flows');
  const flows = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs')).toSorted()) {
    const flow = (await import(pathToFileURL(join(dir, file)).href)).default;
    if (!flow?.name || !Number.isInteger(flow.phase) || typeof flow.run !== 'function') {
      throw new Error(`${file}: default export must be { name, phase, run }`);
    }
    flows.push(flow);
  }
  const selected = flows
    .filter((flow) => flow.phase <= maxPhase && (!only || flow.name === only))
    .toSorted((a, b) => a.phase - b.phase || a.name.localeCompare(b.name));
  if (only && selected.length === 0) {
    throw new Error(`unknown flow "${only}" for phase <= ${maxPhase}; known: ${flows.map((f) => f.name).join(', ')}`);
  }
  if (selected.length === 0) throw new Error(`no flows registered for phase <= ${maxPhase}`);
  return selected;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) throw new Error('dist/ not found; run `pnpm build` first');
  const flows = args.audit ? [] : await loadFlows(args.phase, null);

  await startPreview();
  const browser = await launchChrome();
  if (process.env.CHECK_FAIL === '1') throw new Error('forced failure (CHECK_FAIL=1)');
  const selected = args.flow && !args.audit ? await loadFlows(args.phase, args.flow) : flows;

  const problems = [];
  let requests = 0;
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop, serviceWorkers: 'block' });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    requests++;
    if (new URL(url).origin === ORIGIN) return route.continue();
    problems.push(`blocked off-origin request: ${url}`);
    return route.abort('blockedbyclient');
  });
  // The preview server has no Worker: /api/health answers as a Worker without the AI binding would
  // (phase 17), so user-loaded specs stay deterministic. Flows may route /api/* themselves first.
  await context.route(`${ORIGIN}/api/health`, (route) => route.fulfill({ json: { ok: true, ai: false } }));

  const outDir = join(ROOT, 'docs', 'screenshots', `phase-${args.phase}`, ...(args.label ? [args.label] : []));
  mkdirSync(outDir, { recursive: true });
  /** A fresh page for `flow`, with its console watch, retrying navigation and the helpers flows get. */
  const open = async (flow) => {
    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT);
    // One retry when a navigation times out (sporadic under load); any other failure stands.
    const goto = page.goto.bind(page);
    page.goto = (url, options) => goto(url, options).catch((error) => {
      if (error?.name !== 'TimeoutError') throw error;
      console.log(`  navigation to ${url} timed out; retrying once`);
      return goto(url, options);
    });
    // A flow may list console errors it causes on purpose (e.g. phase 15's failing fetches): `allowConsole: [RegExp]`.
    const allowed = (text) => (flow.allowConsole ?? []).some((re) => re.test(text));
    page.on('console', (msg) => msg.type() === 'error' && !allowed(msg.text()) && problems.push(`[${flow.name}] console error: ${msg.text()}`));
    page.on('pageerror', (error) => problems.push(`[${flow.name}] page error: ${error.message}`));
    // options go to page.screenshot (e.g. clip); options.page shoots another page, e.g. one at 2x.
    const screenshot = async (name, { page: target = page, ...options } = {}) => {
      const path = join(outDir, `${name}.png`);
      await target.screenshot({ ...options, path });
      console.log(`  screenshot ${path.slice(ROOT.length + 1)}`);
    };
    const axe = async (label) => args.axe && problems.push(...(await runAxe(page, `${flow.name}: ${label}`)));
    // null when --no-cvd, so flows skip their simulated screenshots.
    const cvd = args.cvd ? (type) => simulateCvd(page, type) : null;
    return { page, context, origin: ORIGIN, viewports: VIEWPORTS, screenshot, axe, cvd };
  };
  if (args.audit) {
    const audit = (await import(pathToFileURL(join(ROOT, 'scripts', 'browser', 'audit.mjs')).href)).default;
    for (const viewport of args.viewports) {
      console.log(`audit ${viewport.width}x${viewport.height}`);
      const helpers = await open(audit);
      await helpers.page.setViewportSize(viewport);
      await audit.run({ ...helpers, viewport });
      await helpers.page.close();
    }
  }
  for (const flow of selected) {
    const helpers = await open(flow);
    console.log(`flow ${flow.name} (phase ${flow.phase})`);
    await flow.run(helpers);
    await helpers.axe('end of flow');
    await helpers.page.close();
  }
  await context.close();
  if (problems.length > 0) throw new Error(problems.join('\n'));
  console.log(`${requests} requests, all to ${ORIGIN}`);
}

await runSession('browser check', main);
