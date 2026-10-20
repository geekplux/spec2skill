// Headless-browser check: serves dist/ with `vite preview`, drives the system Chrome
// through playwright-core, runs the flows for phases <= --phase, saves screenshots.
//
//   pnpm build && pnpm check:browser -- --phase 1 [--flow <name>] [--no-axe] [--no-cvd]
//   axe (serious/critical violations fail; run after every flow and wherever a flow calls
//   axe(label)) and CVD simulation screenshots (flows call cvd(type)) are on by default.
//   env: CHROME_PATH (default /usr/bin/google-chrome), CHROME_ARGS (extra flags),
//        CHECK_FAIL=1 (force a failure after startup, to test cleanup),
//        CHECK_PORT (default 4173; for when another project's preview holds the port)
//
// Every request outside http://127.0.0.1:<port> is aborted and fails the check.
// The preview server runs in its own process group and is killed, with the browser,
// on success, failure and SIGINT/SIGTERM/SIGHUP. Manual cleanup if this process is
// SIGKILLed: pkill -f "tool-atlas/node_modules/vite/bin/vite.js preview"
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { runAxe } from './browser/axe.mjs';
import { simulateCvd } from './browser/cvd.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.CHECK_PORT || 4173);
const ORIGIN = `http://${HOST}:${PORT}`;
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };
// Unique flag on our Chrome's command line, so leftovers can be found without touching other browsers.
const MARKER = `--tool-atlas-check=${process.pid}`;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

let server = null;
let serverLog = '';
let browser = null;
let cleaning = null;

function parseArgs(argv) {
  const args = { phase: 1, flow: null, axe: true, cvd: true };
  for (let i = 0; i < argv.length; i++) {
    const [key, inline] = argv[i].split('=', 2);
    if (key === '--') continue;
    const toggle = /^--(no-)?(axe|cvd)$/.exec(key);
    if (toggle) {
      args[toggle[2]] = !toggle[1];
      continue;
    }
    if (key !== '--phase' && key !== '--flow') throw new Error(`unknown argument: ${argv[i]}`);
    const value = inline ?? argv[++i];
    if (!value) throw new Error(`${key} needs a value`);
    if (key === '--flow') args.flow = value;
    else if (/^\d+$/.test(value)) args.phase = Number(value);
    else throw new Error(`--phase must be a number, got ${value}`);
  }
  return args;
}

function portInUse() {
  return new Promise((done) => {
    const socket = connect(PORT, HOST);
    socket.once('connect', () => (socket.destroy(), done(true)));
    socket.once('error', () => done(false));
  });
}

function groupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch {
    // already gone
  }
}

async function startServer() {
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const args = [viteBin, 'preview', '--host', HOST, '--port', String(PORT), '--strictPort'];
  server = spawn(process.execPath, args, { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const append = (chunk) => (serverLog = (serverLog + chunk).slice(-4000));
  server.stdout.on('data', append);
  server.stderr.on('data', append);
  console.log(`preview server started (pid ${server.pid}, process group ${server.pid})`);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`preview server exited early:\n${serverLog}`);
    }
    try {
      if ((await fetch(`${ORIGIN}/`)).ok) return;
    } catch {
      // not listening yet
    }
    await sleep(200);
  }
  throw new Error(`preview server not reachable at ${ORIGIN} after 20 s:\n${serverLog}`);
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
  if (await portInUse()) throw new Error(`port ${PORT} is already in use; nothing was started`);
  const flows = await loadFlows(args.phase, null);

  await startServer();
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-first-run', MARKER, ...(process.env.CHROME_ARGS ?? '').split(/\s+/).filter(Boolean)],
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
  console.log(`chrome ${browser.version()} launched (${MARKER})`);
  if (process.env.CHECK_FAIL === '1') throw new Error('forced failure (CHECK_FAIL=1)');
  const selected = args.flow ? await loadFlows(args.phase, args.flow) : flows;

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

  const outDir = join(ROOT, 'docs', 'screenshots', `phase-${args.phase}`);
  mkdirSync(outDir, { recursive: true });
  for (const flow of selected) {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.on('console', (msg) => msg.type() === 'error' && problems.push(`[${flow.name}] console error: ${msg.text()}`));
    page.on('pageerror', (error) => problems.push(`[${flow.name}] page error: ${error.message}`));
    const screenshot = async (name) => {
      const path = join(outDir, `${name}.png`);
      await page.screenshot({ path });
      console.log(`  screenshot ${path.slice(ROOT.length + 1)}`);
    };
    const axe = async (label) => args.axe && problems.push(...(await runAxe(page, `${flow.name}: ${label}`)));
    // null when --no-cvd, so flows skip their simulated screenshots.
    const cvd = args.cvd ? (type) => simulateCvd(page, type) : null;
    console.log(`flow ${flow.name} (phase ${flow.phase})`);
    await flow.run({ page, context, origin: ORIGIN, viewports: VIEWPORTS, screenshot, axe, cvd });
    await axe('end of flow');
    await page.close();
  }
  await context.close();
  if (problems.length > 0) throw new Error(problems.join('\n'));
  console.log(`${requests} requests, all to ${ORIGIN}`);
}

function cleanup() {
  cleaning ??= (async () => {
    if (browser) {
      await Promise.race([browser.close().catch(() => {}), sleep(5000)]);
      // Only our own Chrome carries MARKER; never touch other browsers on this machine.
      spawnSync('pkill', ['-KILL', '-f', '--', MARKER]);
      browser = null;
      console.log('chrome closed');
    }
    if (server) {
      const pid = server.pid;
      killGroup(pid, 'SIGTERM');
      for (let i = 0; i < 25 && groupAlive(pid); i++) await sleep(200);
      if (groupAlive(pid)) killGroup(pid, 'SIGKILL');
      server = null;
      console.log(`preview server stopped (process group ${pid})`);
    }
  })();
  return cleaning;
}

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.on(signal, () => {
    console.error(`received ${signal}, cleaning up`);
    cleanup().finally(() => process.exit(code));
  });
}
// Last resort if we exit without running cleanup (e.g. an uncaught throw elsewhere).
process.on('exit', () => server && killGroup(server.pid, 'SIGKILL'));

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  console.error(`browser check failed:\n${error instanceof Error ? error.message : error}`);
} finally {
  await cleanup();
}
if (exitCode === 0) console.log('browser check passed');
process.exit(exitCode);
