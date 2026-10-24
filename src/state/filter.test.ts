import { beforeAll, describe, expect, it } from 'vitest';
import { type AtlasGraph, buildGraph } from '../graph';
import type { ApiModel } from '../model/types';
import { getSample, sampleModel } from '../samples';
import { type SearchIndex, edgeShown, matches, searchIndex } from './filter';

let model: ApiModel, graph: AtlasGraph, index: SearchIndex;
beforeAll(async () => {
  model = await sampleModel(getSample('tasks')!);
  graph = buildGraph(model);
  index = searchIndex(model);
});
const ids = (s: Set<string> | null) => (s ? [...s].toSorted() : s);

describe('matches', () => {
  it('returns null when nothing narrows the view', () => {
    expect(matches(index, '')).toBeNull();
    expect(matches(index, '   ')).toBeNull();
  });

  it('searches id, title, path and parameter names, case-insensitively, every word', () => {
    const member = ids(matches(index, 'member'))!;
    expect(member).toContain('getMember'); // id
    expect(member).toContain('listMembers'); // path /members
    expect(member.every((id) => index.rows.find((r) => r.id === id)!.text.includes('member'))).toBe(true);
    expect(ids(matches(index, 'MEMBER'))).toEqual(member);
    expect(ids(matches(index, 'get a task'))).toContain('getTask'); // title words
    expect(ids(matches(index, '{taskid} delete'))).toEqual(['deleteTask']); // path + id, AND
    const byParam = model.operations.find((op) => op.inputs.some((p) => p.name === 'assigneeId'))!;
    expect(ids(matches(index, 'assigneeid'))).toContain(byParam.id);
    expect(matches(index, 'zzz-nothing')!.size).toBe(0);
  });

  it('stays well under a frame per keystroke on a 1000-operation index', () => {
    const big: SearchIndex = { rows: Array.from({ length: 1000 }, (_, i) => ({ ...index.rows[i % index.rows.length]!, id: `op${i}` })) };
    const t = performance.now();
    for (const q of ['m', 'me', 'mem', 'memb', 'membe', 'member']) matches(big, q);
    expect((performance.now() - t) / 6).toBeLessThan(16);
  });
});

describe('edges', () => {
  it('shows an edge when one end matches', () => {
    const e = graph.edges.find((x) => x.kind === 'feeds')!;
    expect(edgeShown(e, null)).toBe(true);
    expect(edgeShown(e, new Set([e.to]))).toBe(true);
    expect(edgeShown(e, new Set([e.from]))).toBe(true);
    expect(edgeShown(e, new Set(['other']))).toBe(false);
  });
});
