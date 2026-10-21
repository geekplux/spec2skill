import { beforeAll, describe, expect, it } from 'vitest';
import { type AtlasGraph, buildGraph } from '../graph';
import type { ApiModel } from '../model/types';
import { getSample, sampleModel } from '../samples';
import { type SearchIndex, SHOW_ALL, edgeShown, facets, hiddenCount, matches, searchIndex, toggle } from './filter';

let model: ApiModel, graph: AtlasGraph, index: SearchIndex;
beforeAll(async () => {
  model = await sampleModel(getSample('tasks')!);
  graph = buildGraph(model);
  index = searchIndex(model, graph);
});
const ids = (s: Set<string> | null) => (s ? [...s].toSorted() : s);

describe('matches', () => {
  it('returns null when nothing narrows the view', () => {
    expect(matches(index, '', SHOW_ALL)).toBeNull();
    expect(matches(index, '   ', SHOW_ALL)).toBeNull();
  });

  it('searches id, title, path and parameter names, case-insensitively, every word', () => {
    const member = ids(matches(index, 'member', SHOW_ALL))!;
    expect(member).toContain('getMember'); // id
    expect(member).toContain('listMembers'); // path /members
    expect(member.every((id) => index.rows.find((r) => r.id === id)!.text.includes('member'))).toBe(true);
    expect(ids(matches(index, 'MEMBER', SHOW_ALL))).toEqual(member);
    expect(ids(matches(index, 'get a task', SHOW_ALL))).toContain('getTask'); // title words
    expect(ids(matches(index, '{taskid} delete', SHOW_ALL))).toEqual(['deleteTask']); // path + id, AND
    const byParam = model.operations.find((op) => op.inputs.some((p) => p.name === 'assigneeId'))!;
    expect(ids(matches(index, 'assigneeid', SHOW_ALL))).toContain(byParam.id);
    expect(matches(index, 'zzz-nothing', SHOW_ALL)!.size).toBe(0);
  });

  it('drops switched-off methods and clusters', () => {
    const noGet = matches(index, '', { ...SHOW_ALL, methods: ['get'] })!;
    expect(noGet.size).toBe(model.operations.filter((op) => op.method !== 'get').length);
    const tasks = graph.clusters.find((c) => c.name === 'Tasks')!;
    const noTasks = matches(index, '', { ...SHOW_ALL, clusters: [tasks.id] })!;
    expect(tasks.operationIds.some((id) => noTasks.has(id))).toBe(false);
    expect(noTasks.size).toBe(model.operations.length - tasks.operationIds.length);
  });

  it('stays well under a frame per keystroke on a 1000-operation index', () => {
    const big: SearchIndex = { rows: Array.from({ length: 1000 }, (_, i) => ({ ...index.rows[i % index.rows.length]!, id: `op${i}` })) };
    const t = performance.now();
    for (const q of ['m', 'me', 'mem', 'memb', 'membe', 'member']) matches(big, q, SHOW_ALL);
    expect((performance.now() - t) / 6).toBeLessThan(16);
  });
});

describe('edges and facets', () => {
  it('shows an edge when its kind is on and one end matches', () => {
    const e = graph.edges.find((x) => x.kind === 'feeds')!;
    expect(edgeShown(e, null, SHOW_ALL)).toBe(true);
    expect(edgeShown(e, null, { ...SHOW_ALL, edges: ['feeds'] })).toBe(false);
    expect(edgeShown(e, new Set([e.to]), SHOW_ALL)).toBe(true);
    expect(edgeShown(e, new Set(['other']), SHOW_ALL)).toBe(false);
  });

  it('feeds only hides sub-path and shared-schema edges', () => {
    const shown = graph.edges.filter((e) => edgeShown(e, null, { ...SHOW_ALL, edges: ['sub-path', 'shared-schema'] }));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((e) => e.kind === 'feeds')).toBe(true);
  });

  it('lists methods in HTTP order and every cluster', async () => {
    const f = facets(model, graph);
    expect(f.methods).toEqual(['get', 'post', 'patch', 'delete'].filter((m) => model.operations.some((op) => op.method === m)));
    expect(f.clusters.map((c) => c.name)).toEqual(graph.clusters.map((c) => c.name));
    const fs = await sampleModel(getSample('filesystem')!);
    expect(facets(fs, buildGraph(fs)).methods).toEqual(['tool']);
  });

  it('toggles and counts switched-off choices', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
    expect(hiddenCount({ edges: ['feeds'], methods: ['get', 'post'], clusters: [] })).toBe(3);
  });
});
