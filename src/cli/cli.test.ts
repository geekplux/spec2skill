// The CLI in-process: arguments and exit codes, what it writes and where, and what it fetches
// (an injected fetch spy, or a local http server on 127.0.0.1 started and closed here).
import { strFromU8, unzipSync } from 'fflate';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recorder } from '../../worker/__fixtures__/fakes';
import { buildGraph } from '../graph';
import { getSample, sampleModel } from '../samples';
import { generateSkill } from '../skillgen';
import { zipSkill } from '../skillgen/zip';
import { WriteError, insideTarget, writeTree } from './fs';
import { type CliDeps, EXIT, run } from './main';

const ROOT = join(import.meta.dirname, '../..');
const tmp = mkdtempSync(join(tmpdir(), 'spec2skill-cli-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const fresh = () => join(tmp, `out-${++n}`);

const realFetch: CliDeps['fetch'] = (input, init) => fetch(input, init);
const noNetwork: CliDeps['fetch'] = () => Promise.reject(new Error('network use'));
/** GET answers `get`; every POST (the MCP client) answers `post`. */
const fake = (get: () => Response, post: number): CliDeps['fetch'] => async (_input, init) => (init?.method === 'POST' ? new Response('', { status: post }) : get());
const rpc = () => new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32600, message: 'POST only' } }), { headers: { 'content-type': 'application/json' } });
async function cli(args: string[], fetch: CliDeps['fetch'] = noNetwork) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, { fetch, cwd: ROOT, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n'), last: (out.at(-1) ?? '') };
}

/** Every file under `dir` as `{ relative path: content }`. */
const treeOf = (dir: string) =>
  Object.fromEntries(readdirSync(dir, { recursive: true }).map(String).filter((p) => statSync(join(dir, p)).isFile()).toSorted().map((p) => [p, readFileSync(join(dir, p), 'utf8')]));

describe('arguments', () => {
  it('prints help and version', async () => {
    expect(await cli(['--help'])).toMatchObject({ code: EXIT.ok, out: expect.stringContaining('Usage: spec2skill <url|file>') });
    expect(await cli(['-v'])).toMatchObject({ code: EXIT.ok, out: 'spec2skill 0.0.0' });
  });

  it.each([
    [[], 'missing <url|file>'],
    [['a.json', 'b.json'], 'exactly one'],
    [['--bogus'], "Unknown option '--bogus'"],
    [['--sample', 'nope'], 'unknown sample "nope"'],
    [['--sample', 'tasks', 'a.json'], 'not both'],
    [['a.json', '--source', 'graphql'], '--source must be'],
  ])('%j is a usage error (exit 2)', async (args, message) => {
    const r = await cli(args);
    expect(r.code).toBe(EXIT.usage);
    expect(r.err).toContain(message);
    expect(r.err).toContain('Usage: spec2skill');
  });
});

describe('--sample', () => {
  it.each(['tasks', 'petstore', 'filesystem'])('%s writes the web zip contents, audits them and uses no network', async (id) => {
    const out = fresh();
    const { fetch, calls } = recorder(() => new Response('', { status: 500 }));
    const r = await cli(['--sample', id, '--out', out], fetch);
    expect(r).toMatchObject({ code: EXIT.ok, last: 'audit passed' });
    expect(calls).toEqual([]);
    const model = await sampleModel(getSample(id)!);
    const tree = generateSkill(model, buildGraph(model));
    const [slug] = readdirSync(out);
    const zip = unzipSync(zipSkill(slug!, tree));
    expect(treeOf(join(out, slug!))).toEqual(Object.fromEntries(Object.entries(zip).map(([p, b]) => [p.slice(slug!.length + 1), strFromU8(b)])));
    expect(statSync(join(out, slug!, 'scripts/audit.mjs')).mode & 0o777).toBe(0o755);
  });

  it('honours --slug, --license and --quiet', async () => {
    const out = fresh();
    const r = await cli(['--sample', 'tasks', '--out', out, '--slug', 'My Tasks', '--license', 'Apache-2.0', '--quiet']);
    expect(r).toMatchObject({ code: EXIT.ok, out: 'audit passed' });
    const skill = readFileSync(join(out, 'my-tasks/SKILL.md'), 'utf8');
    expect(skill).toMatch(/^name: my-tasks$/m);
    expect(skill).toMatch(/^license: "Apache-2.0"$/m);
  });
});

describe('writing', () => {
  it('refuses a non-empty target without --force and overwrites with it', async () => {
    const out = fresh();
    mkdirSync(join(out, 'tasks-api'), { recursive: true });
    writeFileSync(join(out, 'tasks-api/SKILL.md'), 'mine');
    const r = await cli(['--sample', 'tasks', '--out', out]);
    expect(r).toMatchObject({ code: EXIT.usage, err: expect.stringContaining('is not empty') });
    expect(readFileSync(join(out, 'tasks-api/SKILL.md'), 'utf8')).toBe('mine');
    expect(await cli(['--sample', 'tasks', '--out', out, '--force'])).toMatchObject({ code: EXIT.ok });
    expect(readFileSync(join(out, 'tasks-api/SKILL.md'), 'utf8')).toMatch(/^---\nname: tasks-api/);
  });

  it('keeps the injection fixture inside <out>/<slug>/', async () => {
    const out = fresh();
    const r = await cli(['src/skillgen/__fixtures__/injection.json', '--out', out]);
    expect(r.code).toBe(EXIT.ok);
    expect(readdirSync(out)).toHaveLength(1);
    expect(Object.keys(treeOf(out)).every((p) => p.startsWith(`${readdirSync(out)[0]}/`))).toBe(true);
    expect(existsSync(join(tmp, 'etc'))).toBe(false);
  });

  it('never writes outside the target or through a symlink', () => {
    const target = fresh();
    for (const bad of ['../evil.md', '/abs.md', 'a/../../b.md', 'a/./b.md']) expect(() => writeTree(target, { [bad]: 'x' })).toThrow(/unsafe file name/);
    expect(() => insideTarget(target, '../x')).toThrow(WriteError);
    expect(existsSync(target)).toBe(false);
    mkdirSync(target);
    symlinkSync(tmp, join(target, 'scripts'));
    expect(() => writeTree(target, { 'scripts/audit.mjs': 'x' }, true)).toThrow(/not a plain directory/);
  });
});

describe('inputs', () => {
  it('reads a Swagger 2 file', async () => {
    expect(await cli(['samples/petstore-swagger2.json', '--out', fresh(), '--quiet'])).toMatchObject({ code: EXIT.ok, last: 'audit passed' });
  });

  it.each([
    [['package.json'], 'This is not an OpenAPI, Swagger or MCP document', 'top-level keys "name"'],
    [['missing.yaml'], 'No such file: missing.yaml', ''],
    [['ftp://example.com/spec.json'], 'not a web address', ''],
  ])('%j exits 3 with the reason', async (args, title, detail) => {
    const r = await cli([...args, '--out', fresh()]);
    expect(r.code).toBe(EXIT.input);
    expect(r.err).toContain(title);
    expect(r.err).toContain(detail);
  });

  it('fetches only the given URL for an OpenAPI spec', async () => {
    const yaml = readFileSync(join(ROOT, 'samples/tasks-openapi31.yaml'), 'utf8');
    const { fetch, calls } = recorder(() => new Response(yaml, { headers: { 'content-type': 'application/yaml' } }));
    expect(await cli(['https://api.example.com/openapi.yaml', '--out', fresh()], fetch)).toMatchObject({ code: EXIT.ok, last: 'audit passed' });
    expect(calls.map((c) => c.url)).toEqual(['https://api.example.com/openapi.yaml']);
    expect(calls[0]!.headers.get('authorization')).toBeNull();
  });

  it('asks an MCP server only for tools/list, at the given URL', async () => {
    const tools = JSON.parse(readFileSync(join(ROOT, 'samples/mcp-filesystem.tools-list.json'), 'utf8')).tools;
    const { fetch, calls } = recorder(({ init, body }) => {
      const msg = body ? JSON.parse(body) : {};
      if (init.method !== 'POST' || !('id' in msg)) return new Response(null, { status: 202 });
      const result = msg.method === 'initialize' ? { protocolVersion: '2025-06-18', serverInfo: { name: 'fake', version: '1' } } : { tools };
      return Response.json({ jsonrpc: '2.0', id: msg.id, result }, { headers: { 'mcp-session-id': 's1' } });
    });
    expect(await cli(['https://mcp.example.com/mcp', '--out', fresh()], fetch)).toMatchObject({ code: EXIT.ok, last: 'audit passed' });
    expect(new Set(calls.map((c) => c.url))).toEqual(new Set(['https://mcp.example.com/mcp']));
    expect(calls.flatMap((c) => (c.body ? [JSON.parse(c.body).method] : []))).toEqual(['initialize', 'notifications/initialized', 'tools/list']);
  });
});

describe('a local server on 127.0.0.1', () => {
  let server: Server;
  let base = '';
  const methods: string[] = [];
  beforeAll(async () => {
    const yaml = readFileSync(join(ROOT, 'samples/tasks-openapi31.yaml'));
    const tools = JSON.parse(readFileSync(join(ROOT, 'samples/mcp-filesystem.tools-list.json'), 'utf8')).tools;
    server = createServer((req, res) => {
      if (req.url === '/openapi.yaml') return res.writeHead(200, { 'content-type': 'application/yaml' }).end(yaml);
      if (req.url === '/moved') return res.writeHead(302, { location: '/openapi.yaml' }).end();
      if (req.method !== 'POST') return res.writeHead(req.url === '/rpc' ? 405 : 404).end();
      let body = '';
      req.on('data', (c) => (body += c)).on('end', () => {
        const msg = JSON.parse(body);
        methods.push(msg.method);
        if (!('id' in msg)) return res.writeHead(202).end();
        const reply = JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: msg.method === 'initialize' ? { protocolVersion: '2025-06-18', serverInfo: { name: 'local-files', version: '1' } } : { tools } });
        if (req.url === '/sse') res.writeHead(200, { 'content-type': 'text/event-stream' }).end(`event: message\ndata: ${reply}\n\n`);
        else res.writeHead(200, { 'content-type': 'application/json' }).end(reply);
      });
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((done) => server.close(() => done())));

  it.each(['/openapi.yaml', '/moved', '/mcp', '/sse', '/rpc'])('%s gives a passing skill', async (path) => {
    expect(await cli([`${base}${path}`, '--out', fresh(), '--quiet'], realFetch)).toMatchObject({ code: EXIT.ok, last: 'audit passed' });
  });

  it('in Auto mode shows an MCP-only error only when the GET looked like MCP (same rule as the web app)', async () => {
    const url = 'https://specs.example.test/api';
    expect(await cli([url, '--out', fresh()], fake(rpc, 401))).toMatchObject({ code: EXIT.input, err: expect.stringContaining('needs credentials') });
    expect(await cli([url, '--out', fresh()], fake(rpc, 404))).toMatchObject({ code: EXIT.input, err: expect.stringContaining('older HTTP+SSE') });
    const typo = await cli([url, '--out', fresh()], fake(() => new Response('', { status: 404 }), 404));
    expect(typo).toMatchObject({ code: EXIT.input, err: expect.stringContaining('The server answered 404') });
    expect(typo.err).not.toContain('HTTP+SSE');
    const waf = await cli([url, '--out', fresh()], fake(() => new Response('', { status: 404 }), 403));
    expect(waf.err).not.toContain('credentials');
  });

  it('never sends tools/call, and reports a missing spec with exit 3', async () => {
    expect(methods).not.toContain('tools/call');
    const r = await cli([`${base}/missing.json`, '--source', 'openapi', '--out', fresh()], realFetch);
    expect(r).toMatchObject({ code: EXIT.input, err: expect.stringContaining('The server answered 404') });
  });
});
