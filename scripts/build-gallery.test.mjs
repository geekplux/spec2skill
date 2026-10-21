import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { driftBetween, readme } from './build-gallery.mjs';

const root = mkdtempSync(join(tmpdir(), 'gallery-test-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const tree = (name, files) => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, name, path, '..'), { recursive: true });
    writeFileSync(join(root, name, path), text);
  }
  return join(root, name);
};

describe('build-gallery', () => {
  it('reports added, removed and changed files, and nothing for equal trees', () => {
    const fresh = tree('fresh', { 'a/SKILL.md': 'x', 'a/kit/new.mjs': 'n', 'README.md': 'r' });
    const kept = tree('kept', { 'a/SKILL.md': 'y', 'a/old.md': 'o', 'README.md': 'r' });
    expect(driftBetween(fresh, kept)).toEqual(['+ a/kit/new.mjs', '- a/old.md', '~ a/SKILL.md']);
    expect(driftBetween(fresh, fresh)).toEqual([]);
    expect(driftBetween(fresh, join(root, 'missing'))).toHaveLength(3);
  });
  it('indexes each skill with its source and audit command', () => {
    expect(readme([['tasks-api', 'Tasks']])).toContain('| [tasks-api](tasks-api/SKILL.md) | Tasks | `node examples/tasks-api/scripts/audit.mjs examples/tasks-api` |');
  });
});
