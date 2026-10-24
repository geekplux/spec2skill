import { beforeAll, describe, expect, it } from 'vitest';
import { type AtlasGraph, buildGraph } from '../graph';
import { type RouteLayout, routeLayout } from '../layout/route';
import type { ApiModel } from '../model/types';
import { getSample, sampleModel } from '../samples';
import { type NavMap, type NavNode, type NavState, RELATIONS, describeEdge, edgesOf, keyAction, mapName, moreId, navOf, nearest, nodeName, opFromHash, relation } from './keyboard';

let model: ApiModel, graph: AtlasGraph, layout: RouteLayout, nav: NavMap;
beforeAll(async () => {
  model = await sampleModel(getSample('tasks')!);
  graph = buildGraph(model);
  layout = routeLayout(model, graph);
  nav = navOf(layout, null);
});
const at = (id: string, edge: number | null = null): NavState => ({ focus: nav.nodes.find((n) => n.id === id), edges: edgesOf(graph.edges, id), edge });
const key = (id: string, k: string, edge: number | null = null) => keyAction(nav, at(id, edge), k);
const focus = (id: string) => ({ type: 'focus', id });
const n = (id: string, x: number, y: number): NavNode => ({ id, card: 'c', x, y, w: 10, h: 10 });
const has = (id: string) => id === 'getTask' || id === 'a b';
const row = (id: string) => layout.cards.flatMap((c) => c.rows).find((r) => r.op === id)!;
const op = (id: string) => model.operations.find((o) => o.id === id)!;

describe('keyAction on the Tasks route map (Projects | Members, Labels | Tasks | Comments)', () => {
  it('arrows move to the nearest row that way: down a card, across columns', () => {
    expect(key('getTask', 'ArrowDown')).toEqual(focus('updateTask'));
    expect(key('getTask', 'ArrowUp')).toEqual(focus('createTask'));
    expect(key('listTasks', 'ArrowRight')).toEqual(focus('listComments')); // same y: the main line
    expect(key('listTasks', 'ArrowLeft')).toEqual(focus('removeMember')); // the nearest to the left, in the column between
    expect(key('listProjects', 'ArrowRight')).toEqual(focus('removeMember'));
    expect(key('removeMember', 'ArrowDown')).toEqual(focus('listLabels')); // the next card below
    expect(key('listProjects', 'ArrowLeft')).toBeNull(); // nothing further left
    expect(key('listMembers', 'ArrowUp')).toBeNull();
  });

  it('every row can reach every other with arrows (no dead ends)', () => {
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
    expect(seen.size).toBe(nav.nodes.length);
    expect(nav.nodes).toHaveLength(22);
  });

  it('Home/End go to the first/last row of the card; PageUp/PageDown change card in column order (wrapping)', () => {
    expect(nav.cards.map((id) => layout.cards.find((c) => c.id === id)!.name)).toEqual(['Projects', 'Members', 'Labels', 'Tasks', 'Comments']);
    expect(key('getTask', 'Home')).toEqual(focus('listTasks'));
    expect(key('getTask', 'End')).toEqual(focus('completeTask'));
    expect(key('listTasks', 'Home')).toBeNull();
    expect(key('getTask', 'PageDown')).toEqual(focus('listComments'));
    expect(key('getTask', 'PageUp')).toEqual(focus('listLabels'));
    expect(key('deleteComment', 'PageDown')).toEqual(focus('listProjects'));
    expect(key('listProjects', 'PageUp')).toEqual(focus('listComments'));
  });

  it('E cycles the links, Enter follows the highlighted one, Esc clears it then closes', () => {
    const count = edgesOf(graph.edges, 'getTask').length;
    expect(key('getTask', 'e')).toEqual({ type: 'edge', index: 0 });
    expect(key('getTask', 'E', 0)).toEqual({ type: 'edge', index: 1 });
    expect(key('getTask', 'e', count - 1)).toEqual({ type: 'edge', index: 0 });
    expect(key('getTask', 'Enter', 0)).toEqual(focus('listComments'));
    expect(key('listComments', 'Enter', edgesOf(graph.edges, 'listComments').findIndex((e) => e.from === 'getTask'))).toEqual(focus('getTask'));
    expect(key('getTask', 'Escape', 2)).toEqual({ type: 'edge', index: null });
    expect(key('getTask', 'Escape')).toEqual({ type: 'close' });
  });

  it('Enter and Space open (pin the card, or expand "N more"); ? asks for help; zoom and pan keys are gone', () => {
    expect(key('getTask', 'Enter')).toEqual({ type: 'open' });
    expect(key('getTask', ' ')).toEqual({ type: 'open' });
    expect(key('getTask', '?')).toEqual({ type: 'help' });
    for (const k of ['+', '=', '-', '0', 'x']) expect(key('getTask', k)).toBeNull();
  });

  it('without a focused row only ? acts', () => {
    const empty = { focus: undefined, edges: [], edge: null };
    expect(keyAction(nav, empty, 'ArrowDown')).toBeNull();
    expect(keyAction(nav, empty, 'Enter')).toBeNull();
    expect(keyAction(nav, empty, '?')).toEqual({ type: 'help' });
  });

  it('nearest prefers the 45° cone over a closer row far to the side', () => {
    const from = n('a', 0, 0);
    expect(nearest([from, n('side', 30, 200), n('cone', 300, 50)], from, [1, 0])?.id).toBe('cone');
    expect(nearest([from, n('side', 30, 200)], from, [1, 0])?.id).toBe('side');
  });

  it('visits only matching rows while a search narrows the map', () => {
    const match = new Set(['listTasks', 'getTask', 'listComments']);
    const narrow = navOf(layout, match);
    expect(narrow.nodes.map((x) => x.id).toSorted()).toEqual([...match].toSorted());
    expect(narrow.cards.map((id) => layout.cards.find((c) => c.id === id)!.name)).toEqual(['Tasks', 'Comments']);
    expect(keyAction(narrow, { focus: narrow.nodes.find((x) => x.id === 'listTasks'), edges: [], edge: null }, 'ArrowDown')).toEqual(focus('getTask'));
  });
});

describe('"N more" rows', () => {
  it('are keyboard stops after a capped card\'s rows, kept while a search matches what they hide', async () => {
    const { syntheticSpec } = await import('../__fixtures__/synthetic');
    const { normalise } = await import('../model/normalise');
    const big = await normalise(syntheticSpec(3));
    const g = buildGraph(big);
    const l = routeLayout(big, g);
    const card = l.cards.find((c) => c.more)!;
    const all = navOf(l, null);
    const peers = all.nodes.filter((x) => x.card === card.id);
    expect(peers.at(-1)).toMatchObject({ id: moreId(card.id), more: true, y: card.more!.y });
    expect(peers).toHaveLength(9);
    // End reaches it; E has no links to cycle on it.
    expect(keyAction(all, { focus: peers[0], edges: [], edge: null }, 'End')).toEqual(focus(moreId(card.id)));
    expect(keyAction(all, { focus: peers.at(-1), edges: edgesOf(g.edges, card.rows[0]!.op), edge: null }, 'e')).toBeNull();
    const hiddenMatch = navOf(l, new Set([card.more!.hidden[0]!]));
    expect(hiddenMatch.nodes.map((x) => x.id)).toEqual([moreId(card.id)]);
    expect(navOf(l, new Set([card.rows[0]!.op])).nodes.some((x) => x.more)).toBe(false);
  });
});

describe('words for screen readers', () => {
  it('names the map with what search and filters leave', () => {
    expect(mapName('Tasks API', 'operations', 22, 5, 85, null, 85)).toBe('Tasks API: 22 operations in 5 clusters, 85 relationships');
    expect(mapName('Echo', 'tools', 2, 1, 0, null, 0)).toBe('Echo: 2 tools in 1 cluster, 0 relationships');
    expect(mapName('Tasks API', 'operations', 22, 5, 85, 4, 18)).toBe('Tasks API: 4 of 22 operations match, 18 of 85 relationships shown');
    expect(mapName('Echo', 'tools', 2, 1, 1, null, 1)).toBe('Echo: 2 tools in 1 cluster, 1 relationship');
    expect(mapName('Echo', 'tools', 2, 1, 1, 1, 0)).toBe('Echo: 1 of 2 tools match, 0 of 1 relationship shown');
    expect(mapName('Tasks API', 'operations', 22, 5, 85, null, 30)).toBe('Tasks API: 22 operations in 5 clusters, 30 of 85 relationships shown');
  });

  it('names rows per A2 with the full path, writes, destructive (D41) and workflow steps in words', async () => {
    expect(nodeName(op('getTask'), row('getTask'), 'Tasks', 19)).toBe('GET getTask, /tasks/{taskId}, Get a task, workflow step 3, cluster Tasks, 19 relationships');
    expect(nodeName(op('getProject'), row('getProject'), 'Projects', 2)).toBe('GET getProject, /projects/{projectId}, Get a project, cluster Projects, 2 relationships');
    expect(nodeName(op('deleteTask'), row('deleteTask'), 'Tasks', 1)).toBe('DELETE deleteTask, /tasks/{taskId}, Delete a task, destructive, cluster Tasks, 1 relationship');
    expect(nodeName(op('createTask'), row('createTask'), 'Tasks', 1)).toBe('POST createTask, /projects/{projectId}/tasks, Create a task, changes data, cluster Tasks, 1 relationship');
    const fs = await sampleModel(getSample('filesystem')!);
    const fsLayout = routeLayout(fs, buildGraph(fs));
    const fsRow = (id: string) => fsLayout.cards.flatMap((c) => c.rows).find((r) => r.op === id)!;
    const tool = (id: string) => fs.operations.find((o) => o.id === id)!;
    expect(fsRow('write_file')).toMatchObject({ method: 'write', destructive: true });
    expect(nodeName(tool('write_file'), fsRow('write_file'), 'File', 3)).toMatch(/^write write_file, .*, destructive, cluster File, 3 relationships$/);
    expect(nodeName(tool('read_text_file'), fsRow('read_text_file'), 'File', 3)).not.toMatch(/destructive|changes data/);
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
