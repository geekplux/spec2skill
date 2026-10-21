// Regression tests for scripts/audit.mjs: the skill passes its own audit, and each mutation of a
// temporary copy fails it with a specific reason. Run: node --test scripts/*.test.mjs
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { auditDir } from './audit.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const edit = (dir, path, change) => writeFileSync(join(dir, path), change(readFileSync(join(dir, path), 'utf8')));
const editJson = (dir, path, change) => edit(dir, path, (text) => JSON.stringify(change(JSON.parse(text))));

async function auditCopy(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'skill-audit-'));
  try {
    cpSync(root, dir, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)$/.test(src) });
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
