// Regression tests for scripts/audit.mjs: the skill passes its own audit, and each mutation of a
// temporary copy fails it with a specific reason. Run: node --test scripts/*.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { auditDir, crashReason } from './audit.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const edit = (dir, path, change) => writeFileSync(join(dir, path), change(readFileSync(join(dir, path), 'utf8')));
const editJson = (dir, path, change) => edit(dir, path, (text) => JSON.stringify(change(JSON.parse(text))));

const copyTo = (dir) => cpSync(root, dir, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)$/.test(src) });

async function auditCopy(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'skill-audit-'));
  try {
    copyTo(dir);
    mutate(dir);
    return await auditDir(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the skill passes its own audit', async () => {
  const { ok, checks } = await auditDir(root);
  assert.ok(ok, JSON.stringify(checks.filter((c) => !c.ok)));
});

const MUTATIONS = [
  ['an operation no doc mentions', 'operations', /not referenced: ghostOperation/,
    (dir) => editJson(dir, 'kit/operations.json', (api) => ({ ...api, operations: [...api.operations, { ...api.operations[0], id: 'ghostOperation' }] }))],
  ['broken frontmatter', 'frontmatter', /name must be kebab-case/, (dir) => edit(dir, 'SKILL.md', (t) => t.replace(/^name: .*$/m, 'name: Not A Slug'))],
  ['only 4 evals', 'evals', /only 4 evals/, (dir) => editJson(dir, 'evals/evals.json', (doc) => ({ ...doc, evals: doc.evals.slice(0, 4) }))],
  ['a broken link', 'links', /SKILL\.md -> references\/missing\.md/, (dir) => edit(dir, 'SKILL.md', (t) => `${t}\nSee [missing](references/missing.md).\n`)],
  ['a missing example', 'examples', /found 1/, (dir) => rmSync(join(dir, 'examples', readdirSync(join(dir, 'examples'))[0]), { recursive: true })],
];

for (const [what, id, reason, mutate] of MUTATIONS) {
  test(`the audit fails on ${what}`, async () => {
    const { ok, checks } = await auditCopy(mutate);
    assert.equal(ok, false);
    const check = checks.find((c) => c.id === id);
    assert.equal(check.ok, false);
    assert.match(check.reason, reason);
  });
}

test('the audit names the error when an example crashes', async () => {
  const { ok, checks } = await auditCopy((dir) => edit(dir, `examples/${readdirSync(join(dir, 'examples'))[0]}/run.mjs`, (t) => `${t}\nthrow new TypeError('boom in the example');\n`));
  assert.equal(ok, false);
  assert.match(checks.find((c) => c.id === 'examples-run').reason, /run\.mjs failed: TypeError: boom in the example$/);
  assert.equal(crashReason({ stderr: 'file:///x/run.mjs:3\n  throw e;\n  ^\n\nRangeError: too far\n    at file:///x/run.mjs:3:9\n\nNode.js v20.19.0\n' }), 'RangeError: too far');
  assert.equal(crashReason({ stderr: '    at somewhere\nwarning: no error line\n\nNode.js v22.12.0\n' }), 'warning: no error line');
});

// `node scripts/audit.mjs .` from where the skill was unpacked: through a symlink, or under a path with `#`.
for (const [what, place] of [
  ['through a symlinked skill dir', (base) => { copyTo(join(base, 'real')); symlinkSync(join(base, 'real'), join(base, 'link'), 'dir'); return join(base, 'link'); }],
  ['from a path containing #', (base) => { mkdirSync(join(base, 'a#b c')); copyTo(join(base, 'a#b c', 'skill')); return join(base, 'a#b c', 'skill'); }],
]) {
  test(`the audit runs and passes ${what}`, () => {
    const base = mkdtempSync(join(tmpdir(), 'skill-audit-path-'));
    try {
      const dir = place(base);
      const out = execFileSync(process.execPath, ['scripts/audit.mjs', '.'], { cwd: dir, encoding: 'utf8', timeout: 120_000 });
      assert.equal(out.trim().split('\n').at(-1), 'audit passed');
      const direct = execFileSync(process.execPath, [join(dir, 'scripts', 'audit.mjs'), dir], { encoding: 'utf8', timeout: 120_000 });
      assert.equal(direct.trim().split('\n').at(-1), 'audit passed');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
}
