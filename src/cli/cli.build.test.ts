// The built CLI (dist-cli/spec2skill.mjs, D24) as users run it: copied alone into an empty temp dir
// (no node_modules), run with the project's Node 22 and the system Node 20 for every sample; each
// written skill passes its own audit and then equals the committed examples/ gallery byte for byte.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const SYSTEM_NODE = '/usr/bin/node';
const NODES = [process.execPath, ...(existsSync(SYSTEM_NODE) && execFileSync(SYSTEM_NODE, ['--version'], { encoding: 'utf8' }).startsWith('v20.') ? [SYSTEM_NODE] : [])];
const SAMPLES = [['tasks', 'tasks-api'], ['petstore', 'petstore-api'], ['filesystem', 'filesystem-mcp']] as const;

const tmp = mkdtempSync(join(tmpdir(), 'spec2skill-cli-build-'));
const alone = mkdtempSync(join(tmpdir(), 'spec2skill-cli-alone-')); // outside the repo: no node_modules to fall back on
const cli = join(alone, 'spec2skill.mjs');
afterAll(() => [tmp, alone].forEach((d) => rmSync(d, { recursive: true, force: true })));

beforeAll(async () => {
  await build({ configFile: join(ROOT, 'vite.config.cli.ts'), root: ROOT, logLevel: 'silent', build: { outDir: join(tmp, 'dist-cli') } });
  copyFileSync(join(tmp, 'dist-cli/spec2skill.mjs'), cli);
}, 120_000);

const run = (node: string, args: string[], cwd: string) => {
  try {
    return { code: 0, out: execFileSync(node, args, { cwd, encoding: 'utf8', stdio: 'pipe', timeout: 120_000 }) };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
};
const files = (dir: string) => readdirSync(dir, { recursive: true }).map(String).filter((p) => statSync(join(dir, p)).isFile()).toSorted();

describe.each(NODES.map((node) => [node, execFileSync(node, ['--version'], { encoding: 'utf8' }).trim()]))('the built CLI on %s (%s)', (node) => {
  it.each(SAMPLES)('--sample %s writes examples/%s byte for byte', (id, slug) => {
    const out = mkdtempSync(join(tmp, `${id}-`));
    const r = run(node, [cli, '--sample', id, '--out', out], alone);
    expect(r).toMatchObject({ code: 0 });
    expect(r.out.trim().split('\n').at(-1)).toBe('audit passed');
    const dir = join(out, slug);
    expect(run(node, ['scripts/audit.mjs', '.'], dir).out.trim().split('\n').at(-1)).toBe('audit passed'); // also writes the examples' plan.json
    const gallery = join(ROOT, 'examples', slug);
    expect(files(dir)).toEqual(files(gallery));
    expect(files(dir).filter((p) => !readFileSync(join(dir, p)).equals(readFileSync(join(gallery, p))))).toEqual([]);
  });

  it('writes a skill whose own tests pass', () => {
    const out = mkdtempSync(join(tmp, 'tests-'));
    expect(run(node, [cli, '--sample', 'tasks', '--out', out, '--quiet'], alone)).toMatchObject({ code: 0 });
    const dir = join(out, 'tasks-api');
    const tests = run(node, ['--test', ...readdirSync(join(dir, 'scripts')).filter((f) => f.endsWith('.test.mjs')).map((f) => `scripts/${f}`)], dir);
    expect(tests).toMatchObject({ code: 0 });
    expect(tests.out).toMatch(/# fail 0/);
  });

  it('exits 2 with usage for a missing argument and 3 for a file that is not a spec', () => {
    expect(run(node, [cli], alone)).toMatchObject({ code: 2, out: expect.stringContaining('Usage: spec2skill') });
    expect(run(node, [cli, join(ROOT, 'package.json')], alone)).toMatchObject({ code: 3, out: expect.stringContaining('not an OpenAPI, Swagger or MCP document') });
  });
});
