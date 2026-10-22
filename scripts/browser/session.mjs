// One headless-browser session for the repo's scripts (check-browser, capture-readme, social-preview):
// an optional `vite preview` of dist/ in its own process group, the system Chrome via playwright-core,
// and cleanup of both on success, failure and SIGINT/SIGTERM/SIGHUP.
//   env: CHROME_PATH (default /usr/bin/google-chrome), CHROME_ARGS (extra flags),
//        CHECK_PORT (default 4173; for when another project's preview holds the port)
// Manual cleanup if a script is SIGKILLed, from the repo root:
//   pkill -f "$PWD/node_modules/vite/bin/vite.js preview"
import { spawn, spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const HOST = '127.0.0.1';
export const PORT = Number(process.env.CHECK_PORT || 4173);
export const ORIGIN = `http://${HOST}:${PORT}`;
// Unique flag on our Chrome's command line, so leftovers can be found without touching other browsers.
const MARKER = `--spec2skill-check=${process.pid}`;
export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

let server = null;
let serverLog = '';
let browser = null;
let cleaning = null;

const portInUse = () =>
  new Promise((done) => {
    const socket = connect(PORT, HOST);
    socket.once('connect', () => (socket.destroy(), done(true)));
    socket.once('error', () => done(false));
  });

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

/** Serves dist/ at ORIGIN; refuses (starting nothing) when the port is taken. */
export async function startPreview() {
  if (await portInUse()) throw new Error(`port ${PORT} is already in use; nothing was started (set CHECK_PORT)`);
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const args = [viteBin, 'preview', '--host', HOST, '--port', String(PORT), '--strictPort'];
  server = spawn(process.execPath, args, { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const append = (chunk) => (serverLog = (serverLog + chunk).slice(-4000));
  server.stdout.on('data', append);
  server.stderr.on('data', append);
  console.log(`preview server started (pid ${server.pid}, process group ${server.pid})`);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) throw new Error(`preview server exited early:\n${serverLog}`);
    try {
      if ((await fetch(`${ORIGIN}/`)).ok) return;
    } catch {
      // not listening yet
    }
    await sleep(200);
  }
  throw new Error(`preview server not reachable at ${ORIGIN} after 20 s:\n${serverLog}`);
}

export async function launchChrome() {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-first-run', MARKER, ...(process.env.CHROME_ARGS ?? '').split(/\s+/).filter(Boolean)],
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
  console.log(`chrome ${browser.version()} launched (${MARKER})`);
  return browser;
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

/** Runs `main`, always cleans up, prints `<name> passed` or `<name> failed: ...`, and exits. */
export async function runSession(name, main) {
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
    console.error(`${name} failed:\n${error instanceof Error ? error.message : error}`);
  } finally {
    await cleanup();
  }
  if (exitCode === 0) console.log(`${name} passed`);
  process.exit(exitCode);
}
