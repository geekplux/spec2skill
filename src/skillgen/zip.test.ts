import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildGraph } from '../graph';
import { SAMPLES, sampleModel } from '../samples';
import { generateSkill } from './index';
import { zipSkill } from './zip';

const tasksTree = async () => {
  const model = await sampleModel(SAMPLES.find((s) => s.id === 'tasks')!);
  return generateSkill(model, buildGraph(model), { version: '0.0.0' });
};

describe('zipSkill', () => {
  it('round-trips the tree under <slug>/', async () => {
    const tree = await tasksTree();
    const files = unzipSync(zipSkill('tasks-api', tree));
    expect(Object.keys(files).toSorted()).toEqual(Object.keys(tree).map((p) => `tasks-api/${p}`).toSorted());
    for (const [path, text] of Object.entries(tree)) expect(strFromU8(files[`tasks-api/${path}`]!)).toBe(text);
  });
  it('gives identical bytes for two generations of the same model', async () => {
    expect(zipSkill('tasks-api', await tasksTree())).toEqual(zipSkill('tasks-api', await tasksTree()));
  });
  it('rejects traversal and absolute names, and kebabs the root folder', () => {
    for (const bad of ['../evil.md', '/etc/passwd', 'a/../../b', 'C:\\x', '']) expect(() => zipSkill('x', { [bad]: 'x' })).toThrow(/unsafe/);
    expect(Object.keys(unzipSync(zipSkill('../My Skill!', { 'SKILL.md': 'x' })))).toEqual(['my-skill/SKILL.md']);
  });
});
