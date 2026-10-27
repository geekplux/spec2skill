// The generated skills as they ship: written to temp dirs, then audited, tested and their
// examples run with plain `node`: the project's Node 22 and, when present, the system Node 20.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { load } from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';
import { buildGraph } from '../graph/index.ts';
import { normalise } from '../model/normalise.ts';
import { parseText } from '../parse/text.ts';
import { SAMPLES, sampleModel } from '../samples/index.ts';
import { auditTree } from './audit-core.ts';
import { generateSkill } from './index.ts';

const root = mkdtempSync(join(tmpdir(), 'spec2skill-audit-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const SYSTEM_NODE = '/usr/bin/node';
const NODES = [process.execPath, ...(existsSync(SYSTEM_NODE) && execFileSync(SYSTEM_NODE, ['--version'], { encoding: 'utf8' }).startsWith('v20.') ? [SYSTEM_NODE] : [])];
// Preloaded into every example run: any network use throws.
const NO_NETWORK = join(root, 'no-network.mjs');
writeFileSync(NO_NETWORK, "globalThis.fetch = () => { throw new Error('network use in a dry run'); };\n");

// Under load (a shared machine, other suites running) a child node process can take tens of seconds to
// start; the default 5 s test timeout and a tight child timeout made these tests flaky. A test spawns up
// to ~10 children, so its timeout covers several slow ones.
const CHILD_TIMEOUT = 180_000;
const TEST_TIMEOUT = 600_000;

const run = (node, args, cwd) => {
  try {
    return { code: 0, out: execFileSync(node, args, { cwd, encoding: 'utf8', stdio: 'pipe', timeout: CHILD_TIMEOUT }) };
  } catch (error) {
    return { code: error.status, out: `${error.stdout}${error.stderr}` };
  }
};

/** A built-in sample by id, or a spec file (as `node scripts/write-skill.mjs <file>` reads it). */
async function written(id) {
  const sample = SAMPLES.find((s) => s.id === id);
  const model = sample ? await sampleModel(sample) : await normalise(parseText(readFileSync(new URL(id, import.meta.url), 'utf8')).value);
  const tree = generateSkill(model, buildGraph(model), { version: '0.0.0' });
  const dir = join(root, id.replace(/\W+/g, '-'));
  for (const [path, text] of Object.entries(tree)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return { model, tree, dir };
}

const passes = async (id, node) => {
  const { tree, dir } = await written(id);
  const audit = run(node, ['scripts/audit.mjs', '.'], dir);
  expect(audit).toMatchObject({ code: 0 }); // the output shows in the diff on failure
  const lines = audit.out.trim().split('\n');
  expect(lines.at(-1)).toBe('audit passed');
  // The in-memory audit (as in the web app) agrees with the CLI, check for check.
  const memory = auditTree(tree).checks.map((c) => `${c.ok ? 'ok   ' : 'FAIL '} ${c.label}`);
  expect(lines.slice(0, memory.length)).toEqual(memory);
  const tests = run(node, ['--test', ...readdirSync(join(dir, 'scripts')).filter((f) => f.endsWith('.test.mjs')).map((f) => `scripts/${f}`)], dir);
  expect(tests).toMatchObject({ code: 0 });
  expect(tests.out).toMatch(/# fail 0/);
  return tree;
};

describe.each(SAMPLES.map((s) => s.id))('the generated %s skill', (id) => {
  it.each(NODES)('passes its audit and its own tests under %s', async (node) => {
    expect(await passes(id, node)).toHaveProperty(['SKILL.md']);
  }, TEST_TIMEOUT);

  it('runs every example as a dry run with no network and a plan of known operations', async () => {
    const { tree, dir } = await written(id);
    const known = new Set(JSON.parse(tree['kit/operations.json']).operations.map((op) => op.id));
    const examples = Object.keys(tree).filter((p) => p.endsWith('/run.mjs'));
    expect(examples.length).toBeGreaterThanOrEqual(2);
    for (const node of NODES) {
      for (const example of examples) {
        const result = run(node, ['--import', NO_NETWORK, example], dir);
        expect(result).toMatchObject({ code: 0 });
        const plan = JSON.parse(readFileSync(join(dir, dirname(example), 'plan.json'), 'utf8'));
        expect(plan.mode).toBe('dry-run');
        expect(plan.steps.map((s) => s.op)).toEqual(plan.chain);
        for (const step of plan.steps) expect(known.has(step.op)).toBe(true);
        expect(JSON.stringify(plan)).not.toMatch(/test-credential|"authorization":"Bearer (?!REDACTED)/);
      }
    }
  }, TEST_TIMEOUT);

  it('has >= 5 evals with unique ids, the edge cases, a valid CI workflow and the README credit', async () => {
    const { model, tree } = await written(id);
    const { skill_name, evals } = JSON.parse(tree['evals/evals.json']);
    expect(skill_name).toBe(tree['SKILL.md'].match(/^name: (.+)$/m)[1]);
    expect(evals.length).toBeGreaterThanOrEqual(5);
    const ids = evals.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['main-chain', 'single-call', 'missing-param', 'destructive-confirm', 'unsupported-capability']));
    const ci = load(tree['ci/github-workflow.yml']);
    expect(ci.jobs.audit.strategy.matrix.node).toEqual([20, 22]);
    const runs = ci.jobs.audit.steps.flatMap((s) => s.run ?? []);
    expect([runs[0], runs.at(-1)]).toEqual(['node --test scripts/*.test.mjs', 'node scripts/audit.mjs .']);
    expect(runs.slice(1, -1).toSorted()).toEqual(Object.keys(tree).filter((p) => p.endsWith('/run.mjs')).map((p) => `node ${p}`));
    expect(tree['README.md'].trimEnd().split('\n').at(-1)).toBe(`Generated by spec2skill from ${model.source.title} (source hash ${model.hash.slice(0, 12)}).`);
  }, TEST_TIMEOUT);
});

it('the dry-run plan redacts credentials even when they are set', async () => {
  const { dir } = await written('tasks');
  const example = readdirSync(join(dir, 'examples'))[0];
  execFileSync(process.execPath, ['--import', NO_NETWORK, `examples/${example}/run.mjs`], { cwd: dir, env: { ...process.env, TASKS_API_TOKEN: 'test-credential' }, timeout: CHILD_TIMEOUT });
  const plan = readFileSync(join(dir, 'examples', example, 'plan.json'), 'utf8');
  expect(plan).not.toContain('test-credential');
  expect(plan).toContain('Bearer REDACTED');
}, TEST_TIMEOUT);

// Small and odd APIs: 3 tools, 5 operations without ids, 1 operation with hostile strings.
describe.each(['../model/__fixtures__/mcp-edge.json', '../model/__fixtures__/missing-operation-ids.yaml', '../map/__fixtures__/hostile-strings.json'])('the generated skill for %s', (file) => {
  it.each(NODES)('has >= 5 evals and >= 2 examples and passes its audit and tests under %s', async (node) => {
    const tree = await passes(file, node);
    expect(auditTree(tree)).toMatchObject({ ok: true });
    expect(JSON.parse(tree['evals/evals.json']).evals.length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(tree).filter((p) => p.endsWith('/run.mjs')).length).toBeGreaterThanOrEqual(2);
  }, TEST_TIMEOUT);
});
