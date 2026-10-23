import { describe, expect, it } from 'vitest';
import { buildGraph } from '../graph';
import { SAMPLES, sampleModel } from '../samples';
import { generateSkill } from '../skillgen';
import { ancestors, opFile, parentOf, treeKey, treeRows } from './tree';

const PATHS = ['README.md', 'SKILL.md', 'ci/github-workflow.yml', 'examples/a/run.mjs', 'examples/a/README.md', 'examples/b/run.mjs',
  'kit/client.mjs', 'references/tasks.md', 'references/auth.md'];
const names = (open: string[]) => treeRows(PATHS, new Set(open)).map((r) => `${'  '.repeat(r.level - 1)}${r.name}`);

describe('treeRows', () => {
  it('lists the top level in anatomy order with closed folders and file counts', () => {
    const rows = treeRows(PATHS, new Set());
    expect(rows.map((r) => r.name)).toEqual(['SKILL.md', 'kit/', 'references/', 'examples/', 'ci/', 'README.md']);
    expect(rows.find((r) => r.name === 'examples/')).toMatchObject({ folder: true, open: false, files: 3, pos: 4, size: 6, level: 1 });
  });
  it('expands open folders, folders before files below the top level', () => {
    expect(names(['examples/', 'examples/a/'])).toEqual([
      'SKILL.md', 'kit/', 'references/', 'examples/', '  a/', '    README.md', '    run.mjs', '  b/', 'ci/', 'README.md']);
  });
});

describe('paths', () => {
  it('finds ancestors and parents', () => {
    expect(ancestors('examples/a/run.mjs')).toEqual(['examples/', 'examples/a/']);
    expect(ancestors('SKILL.md')).toEqual([]);
    expect([parentOf('examples/a/'), parentOf('examples/a/run.mjs'), parentOf('SKILL.md')]).toEqual(['examples/', 'examples/a/', '']);
  });
});

describe('treeKey', () => {
  const rows = treeRows(PATHS, new Set(['references/']));
  const at = (path: string) => rows.findIndex((r) => r.path === path);
  it('moves with arrows, Home and End, clamped at the ends', () => {
    expect(treeKey(rows, 0, 'ArrowUp')).toEqual({ focus: 0 });
    expect(treeKey(rows, 0, 'ArrowDown')).toEqual({ focus: 1 });
    expect(treeKey(rows, 3, 'Home')).toEqual({ focus: 0 });
    expect(treeKey(rows, 0, 'End')).toEqual({ focus: rows.length - 1 });
    expect(treeKey(rows, rows.length - 1, 'ArrowDown')).toEqual({ focus: rows.length - 1 });
  });
  it('opens, enters, closes and leaves folders', () => {
    expect(treeKey(rows, at('kit/'), 'ArrowRight')).toEqual({ open: 'kit/' });
    expect(treeKey(rows, at('references/'), 'ArrowRight')).toEqual({ focus: at('references/') + 1 });
    expect(treeKey(rows, at('references/'), 'ArrowLeft')).toEqual({ close: 'references/' });
    expect(treeKey(rows, at('references/tasks.md'), 'ArrowLeft')).toEqual({ focus: at('references/') });
    expect(treeKey(rows, at('kit/'), 'Enter')).toEqual({ open: 'kit/' });
    expect(treeKey(rows, at('SKILL.md'), 'ArrowLeft')).toBeNull();
  });
  it('selects files with Enter and Space, ignores other keys', () => {
    expect(treeKey(rows, at('references/tasks.md'), 'Enter')).toEqual({ select: 'references/tasks.md' });
    expect(treeKey(rows, at('SKILL.md'), ' ')).toEqual({ select: 'SKILL.md' });
    expect(treeKey(rows, at('SKILL.md'), 'ArrowRight')).toBeNull();
    expect(treeKey(rows, 0, 'x')).toBeNull();
  });
});

describe('opFile', () => {
  it('names the reference page documenting each operation', async () => {
    const model = await sampleModel(SAMPLES.find((s) => s.id === 'tasks')!);
    const tree = generateSkill(model, buildGraph(model));
    expect(opFile(tree, 'getTask')).toBe('references/tasks.md');
    for (const op of model.operations) expect(opFile(tree, op.id)).toMatch(/^references\/[a-z0-9-]+\.md$/);
    expect(opFile(tree, 'nope')).toBeUndefined();
  });
});
