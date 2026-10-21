import { beforeAll, describe, expect, it } from 'vitest';
import { type AtlasGraph, buildGraph } from '../graph';
import { type AtlasLayout, layout } from '../layout/layout';
import type { ApiModel } from '../model/types';
import { getSample, sampleModel } from '../samples';
import { type NavState, RELATIONS, describeEdge, edgesOf, keyAction, nearest, nodeName, opFromHash, relation } from './keyboard';

let model: ApiModel, graph: AtlasGraph, atlas: AtlasLayout;
beforeAll(async () => {
  model = await sampleModel(getSample('tasks')!);
  graph = buildGraph(model);
  atlas = layout(model, graph);
});
const at = (id: string, edge: number | null = null): NavState => ({ focus: atlas.nodes.find((n) => n.id === id), edges: edgesOf(graph.edges, id), edge });
const key = (id: string, k: string, shift = false, edge: number | null = null) => keyAction(atlas, at(id, edge), k, shift);
const focus = (id: string) => ({ type: 'focus', id });
const n = (id: string, x: number, y: number) => ({ id, cluster: 'c', depth: 0, column: 0, state: 'read' as const, x, y, w: 10, h: 10 });
const has = (id: string) => id === 'getTask' || id === 'a b';

describe('keyAction on the Tasks layout', () => {
  it('arrows move to the spatially nearest node in that direction', () => {
    expect(key('getTask', 'ArrowDown')).toEqual(focus('updateTask'));
    expect(key('getTask', 'ArrowUp')).toEqual(focus('createTask'));
    expect(key('getTask', 'ArrowRight')).toEqual(focus('getProject'));
    expect(key('getProject', 'ArrowLeft')).toEqual(focus('getTask'));
    expect(key('completeTask', 'ArrowDown')).toEqual(focus('listMembers')); // next card below
    expect(key('getTask', 'ArrowLeft')).toBeNull(); // nothing further left
    expect(key('listTasks', 'ArrowUp')).toBeNull();
  });

  it('every node can reach every other with arrows (no dead ends)', () => {
    const seen = new Set(['listTasks']);
    const queue = ['listTasks'];
    while (queue.length) {
      const id = queue.shift()!;
      for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        const a = key(id, k);
        if (a?.type !== 'focus' || seen.has(a.id)) continue;
        seen.add(a.id);
        queue.push(a.id);
      }
    }
    expect(seen.size).toBe(atlas.nodes.length);
  });

  it('Home/End go to the first/last node of the cluster; PageUp/PageDown change cluster (wrapping)', () => {
    expect(key('getTask', 'Home')).toEqual(focus('listTasks'));
    expect(key('getTask', 'End')).toEqual(focus('completeTask'));
    expect(key('listTasks', 'Home')).toBeNull();
    expect(key('getTask', 'PageDown')).toEqual(focus('listProjects'));
    expect(key('getTask', 'PageUp')).toEqual(focus('listLabels'));
    expect(key('deleteLabel', 'PageDown')).toEqual(focus('listTasks'));
  });

  it('E cycles the edges, Enter follows the highlighted one, Esc clears it then closes', () => {
    const count = edgesOf(graph.edges, 'getTask').length;
    expect(key('getTask', 'e')).toEqual({ type: 'edge', index: 0 });
    expect(key('getTask', 'E', true, 0)).toEqual({ type: 'edge', index: 1 });
    expect(key('getTask', 'e', false, count - 1)).toEqual({ type: 'edge', index: 0 });
    expect(key('getTask', 'Enter', false, 0)).toEqual(focus('listComments'));
    expect(key('listComments', 'Enter', false, edgesOf(graph.edges, 'listComments').findIndex((e) => e.from === 'getTask'))).toEqual(focus('getTask'));
    expect(key('getTask', 'Escape', false, 2)).toEqual({ type: 'edge', index: null });
    expect(key('getTask', 'Escape')).toEqual({ type: 'close' });
  });

  it('Enter and Space open details; camera, help and pan keys', () => {
    expect(key('getTask', 'Enter')).toEqual({ type: 'open' });
    expect(key('getTask', ' ')).toEqual({ type: 'open' });
    expect(key('getTask', '+')).toEqual({ type: 'zoom', factor: 1.25 });
    expect(key('getTask', '=')).toEqual({ type: 'zoom', factor: 1.25 });
    expect(key('getTask', '-')).toEqual({ type: 'zoom', factor: 0.8 });
    expect(key('getTask', '0')).toEqual({ type: 'fit' });
    expect(key('getTask', '?')).toEqual({ type: 'help' });
    expect(key('getTask', 'ArrowRight', true)).toEqual({ type: 'pan', dx: -80, dy: -0 });
    expect(key('getTask', 'ArrowUp', true)).toEqual({ type: 'pan', dx: -0, dy: 80 });
    expect(key('getTask', 'x')).toBeNull();
  });

  it('without a focused node only camera keys act', () => {
    const empty = { focus: undefined, edges: [], edge: null };
    expect(keyAction(atlas, empty, 'ArrowDown')).toBeNull();
    expect(keyAction(atlas, empty, 'Enter')).toBeNull();
    expect(keyAction(atlas, empty, '0')).toEqual({ type: 'fit' });
  });

  it('nearest prefers the 45° cone over a closer node far to the side', () => {
    const from = n('a', 0, 0);
    expect(nearest([from, n('side', 30, 200), n('cone', 300, 50)], from, [1, 0])?.id).toBe('cone');
    expect(nearest([from, n('side', 30, 200)], from, [1, 0])?.id).toBe('side');
  });
});

describe('words for screen readers', () => {
  it('names nodes per A2 with the full path', () => {
    const op = model.operations.find((o) => o.id === 'getTask')!;
    expect(nodeName(op, 'read', 'Tasks', 19)).toBe('GET /tasks/{taskId}, Get a task, cluster Tasks, 19 relationships');
    const del = model.operations.find((o) => o.id === 'deleteTask')!;
    expect(nodeName(del, 'destructive', 'Tasks', 1)).toBe('DELETE /tasks/{taskId}, Delete a task, destructive, cluster Tasks, 1 relationship');
  });

  it('describes edges relative to the focused node', () => {
    const edges = edgesOf(graph.edges, 'getTask');
    const i = edges.findIndex((e) => e.to === 'getMember');
    expect(describeEdge(edges[i]!, 'getTask', i, edges.length)).toBe(
      `Edge ${i + 1} of ${edges.length}: feeds getMember via projectId -> projectId, assigneeId -> memberId. Enter follows it.`,
    );
    expect(describeEdge(edges[0]!, 'getTask', 0, 3)).toBe('Edge 1 of 3: has sub-path listComments. Enter follows it.');
    expect(describeEdge(edges[0]!, 'listComments', 0, 3)).toBe('Edge 1 of 3: sub-path of getTask. Enter follows it.');
    const shared = edges.find((e) => e.kind === 'shared-schema')!;
    expect(describeEdge(shared, 'getTask', 0, 1)).toMatch(/^Edge 1 of 1: shares schema Task with \w+\./);
  });

  it('groups related operations', () => {
    const groups = new Set(edgesOf(graph.edges, 'getTask').map((e) => relation(e, 'getTask').group));
    expect([...groups].every((g) => RELATIONS.includes(g))).toBe(true);
    expect(edgesOf(graph.edges, 'getTask').filter((e) => relation(e, 'getTask').group === 'Fed by').map((e) => e.from)).toContain('listTasks');
  });
});

describe('opFromHash', () => {
  it('reads #op=<id> only for known operations', () => {
    expect(opFromHash('#op=getTask', has)).toBe('getTask');
    expect(opFromHash('#op=a%20b', has)).toBe('a b');
    expect(opFromHash('#op=nope', has)).toBeUndefined();
    expect(opFromHash('#op=%E0%A4%A', has)).toBeUndefined();
    expect(opFromHash('', has)).toBeUndefined();
  });
});
