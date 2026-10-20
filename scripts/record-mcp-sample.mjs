// One-off: records the `tools/list` result of the reference filesystem MCP server over stdio
// into samples/mcp-filesystem.tools-list.json. Needs network for `pnpm dlx` the first time.
//
//   node scripts/record-mcp-sample.mjs
//
// The server runs as a short-lived child in its own process group, scoped to an empty
// temporary directory, and is killed (group-wide) on success, failure and timeout.
// No tool is ever called: only initialize, notifications/initialized and tools/list.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE = '@modelcontextprotocol/server-filesystem@2.0.0';
const PROTOCOL_VERSION = '2025-06-18';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'samples', 'mcp-filesystem.tools-list.json');
const TIMEOUT_MS = 180_000;

const sandbox = mkdtempSync(join(tmpdir(), 'tool-atlas-mcp-'));
const child = spawn('pnpm', ['dlx', PACKAGE, sandbox], { detached: true, stdio: ['pipe', 'pipe', 'inherit'] });
console.log(`server started (pid ${child.pid}, process group ${child.pid})`);

const pending = new Map();
let buffer = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue; // not a JSON-RPC line
    }
    pending.get(message.id)?.(message);
  }
});

let nextId = 1;
function request(method, params) {
  const id = nextId++;
  return new Promise((done, fail) => {
    pending.set(id, (message) => {
      pending.delete(id);
      if (message.error) fail(new Error(`${method}: ${JSON.stringify(message.error)}`));
      else done(message.result);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

function stop() {
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // already gone
  }
  rmSync(sandbox, { recursive: true, force: true });
}

let exitCode = 0;
const timer = setTimeout(() => {
  console.error(`timed out after ${TIMEOUT_MS / 1000} s`);
  stop();
  process.exit(1);
}, TIMEOUT_MS);
try {
  const init = await request('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'tool-atlas-recorder', version: '0.0.0' },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const tools = [];
  let cursor;
  do {
    const page = await request('tools/list', cursor ? { cursor } : {});
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  writeFileSync(OUT, `${JSON.stringify({ tools }, null, 2)}\n`);
  console.log(`serverInfo ${JSON.stringify(init.serverInfo)}, protocolVersion ${init.protocolVersion}`);
  console.log(`wrote ${tools.length} tools to ${OUT}`);
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
} finally {
  clearTimeout(timer);
  stop();
}
process.exit(exitCode);
