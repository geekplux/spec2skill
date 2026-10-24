import { describe, expect, it } from 'vitest';
import { syntheticSpec } from '../__fixtures__/synthetic';
import { type AtlasGraph, buildGraph } from '../graph';
import { normalise } from '../model/normalise';
import type { ApiModel, Operation } from '../model/types';
import { parseText } from '../parse/text';
import { SAMPLES, getSample, sampleModel } from '../samples';
import { generateSkill } from '../skillgen';
import { topChains } from '../skillgen/graph-chains';
import type { Point } from './geometry';
import {
  CARD_W, CLEARANCE, COLUMN_STEP, HEAD, HOVER_REACH, MAX_ROWS, ROW, type RouteCard, type RouteLayout, hoverBounds, hoverLinks, methodOf, routeLayout,
} from './route';
import { columnsOf, feedbackOrder } from './route-columns';
import { OPEN_REACH, TRACK, corridorY, openReach, routeAcross, routeWires, samplePath } from './route-path';

const routeOf = async (id: string) => {
  const model = await sampleModel(getSample(id)!);
  const graph = buildGraph(model);
  return { model, graph, layout: routeLayout(model, graph) };
};

let synthetic: Promise<{ model: ApiModel; graph: AtlasGraph }> | undefined;
const syntheticModel = () =>
  (synthetic ??= normalise(syntheticSpec(40)).then((model) => ({ model, graph: buildGraph(model) })));

/** Deep copy with every object's keys in reverse order (arrays keep their order). */
function shuffleKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shuffleKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.keys(value).toReversed().map((k) => [k, shuffleKeys((value as Record<string, unknown>)[k])]));
}

const tool = (o: Partial<Operation>) => ({ kind: 'tool', hints: {}, ...o }) as Operation;
const card = (layout: RouteLayout, name: string) => layout.cards.find((c) => c.name === name)!;
const row = (layout: RouteLayout, op: string) => layout.cards.flatMap((c) => c.rows).find((r) => r.op === op)!;
const inside = (p: Point, c: RouteCard) => p.x > c.x + 0.5 && p.x < c.x + c.w - 0.5 && p.y > c.y + 0.5 && p.y < c.y + c.h - 0.5;

/** Cards never overlap; cards sharing a column keep CLEARANCE between them. */
function expectNoOverlap(layout: RouteLayout) {
  for (const [i, a] of layout.cards.entries()) {
    for (const b of layout.cards.slice(i + 1)) {
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h + CLEARANCE <= b.y || b.y + b.h + CLEARANCE <= a.y;
      expect(apart, `${a.name} / ${b.name}`).toBe(true);
    }
  }
}

/** No point of any path lies inside a card. */
function expectClearOfCards(layout: RouteLayout, paths: { id: string; d: string }[]) {
  for (const { id, d } of paths) {
    for (const p of samplePath(d)) {
      const hit = layout.cards.find((c) => inside(p, c));
      expect(hit, `${id} crosses ${hit?.name} at ${p.x},${p.y}`).toBeUndefined();
    }
  }
}

/** The straight runs (`H`) of a path: y and x extent. */
function runs(d: string): { y: number; x0: number; x1: number }[] {
  const out: { y: number; x0: number; x1: number }[] = [];
  const tokens = d.match(/[MCH]|-?\d+(?:\.\d+)?/g) ?? [];
  let [x, y] = [0, 0];
  for (let i = 0; i < tokens.length; ) {
    const cmd = tokens[i++];
    if (cmd === 'M') [x, y] = [Number(tokens[i++]), Number(tokens[i++])];
    else if (cmd === 'C') [i, x, y] = [i + 6, Number(tokens[i + 4]), Number(tokens[i + 5])];
    else {
      const to = Number(tokens[i++]);
      out.push({ y, x0: Math.min(x, to), x1: Math.max(x, to) });
      x = to;
    }
  }
  return out;
}

/** No two straight runs overlapping by more than 2 px sit closer than TRACK (less 0.1 px of rounding). */
function expectApart(paths: { id: string; d: string }[]) {
  const all = paths.flatMap((l) => runs(l.d).map((r) => ({ ...r, id: l.id })));
  const close: string[] = [];
  for (const [i, a] of all.entries()) {
    for (const b of all.slice(i + 1)) {
      if (a.id !== b.id && Math.abs(a.y - b.y) < TRACK - 0.1 && Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 2) close.push(`${a.id} / ${b.id} at y ${a.y}, ${b.y}`);
    }
  }
  expect(close).toEqual([]);
}
const expectNoSharedRuns = (layout: RouteLayout) => expectApart(layout.links);

/** Off the first and last gap of each straight workflow step, no rest link comes within 12 px of the line. */
function expectOffTheLine(layout: RouteLayout) {
  for (const step of layout.workflow?.steps.filter((s) => s.shape === 'line') ?? []) {
    const [x0, x1] = [Number(/^M(-?[\d.]+)/.exec(step.d)![1]) + 88, Number(/H(-?[\d.]+)$/.exec(step.d)![1]) - 88];
    const near = layout.links.flatMap((l) =>
      samplePath(l.d).filter((p) => p.x > x0 && p.x < x1 && Math.abs(p.y - layout.workflow!.y) < 12).map((p) => `${l.id} at ${p.x},${p.y}`),
    );
    expect(near).toEqual([]);
  }
}

const restPaths = (layout: RouteLayout) => [
  ...layout.links.map((l) => ({ id: l.id, d: l.d })),
  ...(layout.workflow?.steps.map((s) => ({ id: `step ${s.from}->${s.to}`, d: s.d })) ?? []),
];

describe('route map: Tasks API (the V2Home target)', () => {
  it('puts Projects | Members, Labels | Tasks | Comments in columns at x = 0, 290, 580, 870', async () => {
    const { layout } = await routeOf('tasks');
    expect(layout.columns.map((col) => col.cards.map((id) => layout.cards.find((c) => c.id === id)!.name))).toEqual([
      ['Projects'], ['Members', 'Labels'], ['Tasks'], ['Comments'],
    ]);
    expect(layout.columns.map((col) => col.x)).toEqual([0, 290, 580, 870]);
    expect(layout.cards.every((c) => c.w === CARD_W && c.x === c.column * COLUMN_STEP)).toBe(true);
    expect([layout.width, layout.scrolls]).toEqual([1072, false]);
  });

  it('draws listProjects -> listTasks -> getTask straight, with a loop for the same-card step', async () => {
    const { layout } = await routeOf('tasks');
    const wf = layout.workflow!;
    expect(wf.ops).toEqual(['listProjects', 'listTasks', 'getTask']);
    expect(wf.steps.map((s) => s.shape)).toEqual(['line', 'loop']);
    expect(wf.steps[0]!.d).toBe(`M202 ${wf.y}H580`);
    expect(row(layout, 'listProjects').cy).toBe(wf.y);
    expect(row(layout, 'listTasks').cy).toBe(wf.y);
    expect(wf.stops.map((s) => [s.op, s.n])).toEqual([['listProjects', 1], ['listTasks', 2], ['getTask', 3]]);
    expect(wf.stops.slice(0, 2).every((s) => s.cy === wf.y)).toBe(true);
    // The main line's cards share their top.
    const tops = ['Projects', 'Tasks', 'Comments'].map((n) => card(layout, n).y);
    expect(new Set(tops).size).toBe(1);
    expect(layout.cards.filter((c) => c.main).map((c) => c.name)).toEqual(['Projects', 'Tasks']);
    // The line's own edge is drawn by the workflow, not again as a feed.
    expect(layout.links.some((l) => l.edges.includes('feeds:listProjects->listTasks'))).toBe(false);
  });

  it('stacks Members above and Labels below the line, 32 px clear of the main-line row', async () => {
    const { layout } = await routeOf('tasks');
    const y = layout.workflow!.y;
    const [members, labels] = [card(layout, 'Members'), card(layout, 'Labels')];
    expect(members.y + members.h).toBeLessThanOrEqual(y - ROW / 2 - CLEARANCE);
    expect(labels.y).toBeGreaterThanOrEqual(y + ROW / 2 + CLEARANCE);
    expect(Math.min(...layout.cards.map((c) => c.y))).toBe(0);
  });

  it('keeps CRUD order, methods as text and DELETE marked destructive', async () => {
    const { graph, layout } = await routeOf('tasks');
    for (const c of graph.clusters) expect(layout.cards.find((k) => k.id === c.id)!.rows.map((r) => r.op)).toEqual(c.operationIds);
    expect(card(layout, 'Projects').rows.map((r) => r.method)).toEqual(['GET', 'POST', 'GET', 'PATCH', 'DELETE']);
    expect(layout.cards.flatMap((c) => c.rows).filter((r) => r.destructive).map((r) => r.op).toSorted()).toEqual(
      ['deleteComment', 'deleteLabel', 'deleteProject', 'deleteTask', 'removeMember'],
    );
    const projects = card(layout, 'Projects');
    expect(projects.h).toBe(HEAD + 5 * ROW + 4);
    expect(projects.rows.map((r) => r.y - projects.y)).toEqual([36, 68, 100, 132, 164]);
  });

  it('draws feeds between columns row to row and bundles to the fed card head', async () => {
    const { layout } = await routeOf('tasks');
    const bundles = layout.links.filter((l) => l.kind === 'bundle');
    expect(bundles.map((b) => [b.from, b.to, b.edges.length])).toEqual([
      ['listProjects', 'cluster-members', 4], ['createProject', 'cluster-members', 4],
    ]);
    const members = card(layout, 'Members');
    for (const b of bundles) expect(b.d.endsWith(` ${members.x} ${members.y + HEAD / 2}`)).toBe(true);
    const feed = layout.links.find((l) => l.id === 'feed:listTasks->listComments')!;
    expect(feed.d).toBe(`M${580 + CARD_W} ${row(layout, 'listTasks').cy}H870`);
    // Only forward links rest on the map; backward ones (Tasks -> Projects) wait for hover.
    const col = (op: string) => layout.cards.find((c) => c.rows.some((r) => r.op === op))!.column;
    expect(layout.links.filter((l) => l.kind === 'feed').every((l) => col(l.to) > col(l.from))).toBe(true);
    expect(layout.links.some((l) => l.inferred)).toBe(true);
  });

  it('gives each link its own run and keeps them off the main line between Projects and Tasks', async () => {
    const { layout } = await routeOf('tasks');
    expectNoSharedRuns(layout);
    expectOffTheLine(layout);
    // The three Projects -> Tasks links on tracks 6 px apart under the line's band (not one shared y).
    const ys = ['feed:listProjects->createTask', 'feed:createProject->listTasks', 'feed:createProject->createTask'].map(
      (id) => runs(layout.links.find((l) => l.id === id)!.d)[0]!.y,
    );
    expect(ys.map((y) => y - layout.workflow!.y)).toEqual([27, 33, 39]);
  });

  it('gives every link of an operation on hover, backward and same-card included, clear of cards', async () => {
    const { graph, layout } = await routeOf('tasks');
    const links = hoverLinks(layout, graph, 'getTask');
    expect(links.map((l) => l.edge)).toEqual(graph.edges.filter((e) => e.from === 'getTask' || e.to === 'getTask').map((e) => e.id));
    const back = links.find((l) => l.edge === 'feeds:getTask->getProject')!;
    const [task, project] = [row(layout, 'getTask'), row(layout, 'getProject')];
    expect(back.d.startsWith(`M580 ${task.cy}`)).toBe(true);
    expect(back.d.endsWith(`${CARD_W} ${project.cy}`)).toBe(true);
    const loop = links.find((l) => l.edge === 'feeds:listTasks->getTask')!;
    expect(loop.d).toMatch(/^M580 \d+C5\d\d(\.\d)? /); // out of the left edge
    expect(links.map((l) => l.kind)).toContain('sub-path');
    expect(links.map((l) => l.kind)).toContain('shared-schema');
  });
});

describe('route map: Petstore and Filesystem MCP', () => {
  it('Petstore: the Pet loop on the main card, User beside it in the next column (no feeds between them)', async () => {
    const { layout } = await routeOf('petstore');
    expect(layout.columns.map((c) => c.cards)).toEqual([['cluster-pet'], ['cluster-user']]);
    expect(layout.workflow!.steps.map((s) => s.shape)).toEqual(['loop']);
    expect(card(layout, 'User').rows[0]!.cy).toBe(row(layout, 'findPetsByStatus').cy);
    expect(layout.bounds.x).toBe(-24); // the loop bulges into the frame's padding
    expect(layout.links).toEqual([]);
  });

  it('Filesystem MCP: Directory | File, the line straight across rows that differ in index, method words', async () => {
    const { layout } = await routeOf('filesystem');
    expect(layout.columns.map((c) => c.cards)).toEqual([['cluster-directory'], ['cluster-file']]);
    expect(layout.workflow!.ops).toEqual(['list_allowed_directories', 'search_files', 'read_text_file']);
    expect(row(layout, 'list_allowed_directories').cy).toBe(row(layout, 'search_files').cy);
    expect(layout.workflow!.steps.map((s) => s.shape)).toEqual(['line', 'loop']);
    const methods = new Set(layout.cards.flatMap((c) => c.rows.map((r) => r.method)));
    expect([...methods].toSorted()).toEqual(['read', 'write']);
    // write_file, edit_file and move_file are writes; the destructive ones are flagged, not renamed (D41).
    const rows = layout.cards.flatMap((c) => c.rows);
    expect(rows.filter((r) => r.destructive).map((r) => r.method)).toEqual(rows.filter((r) => r.destructive).map(() => 'write'));
    expect(rows.find((r) => r.op === 'write_file')).toMatchObject({ method: 'write', destructive: true });
    // File has 9 operations: 8 rows, then "1 more"; the bundles end on its head.
    const file = card(layout, 'File');
    expect([file.rows.length, file.more?.count]).toEqual([MAX_ROWS, 1]);
    expect(layout.links.filter((l) => l.kind === 'bundle').every((l) => l.d.endsWith(` ${file.x} ${file.y + HEAD / 2}`))).toBe(true);
  });
});

describe('route map: every sample', () => {
  for (const sample of SAMPLES) {
    it(`${sample.id} matches __snapshots__/${sample.id}.route.json`, async () => {
      const { layout } = await routeOf(sample.id);
      await expect(`${JSON.stringify(layout, null, 2)}\n`).toMatchFileSnapshot(`./__snapshots__/${sample.id}.route.json`);
    });

    it(`${sample.id}: no overlaps, no link crossing a card (rest and hover), every operation placed`, async () => {
      const { model, graph, layout } = await routeOf(sample.id);
      expectNoOverlap(layout);
      expectClearOfCards(layout, restPaths(layout));
      for (const op of model.operations) {
        expectClearOfCards(layout, hoverLinks(layout, graph, op.id).map((l) => ({ id: l.edge, d: l.d })));
      }
      const placed = layout.cards.flatMap((c) => [...c.rows.map((r) => r.op), ...(c.more?.hidden ?? [])]);
      expect(placed.toSorted()).toEqual(model.operations.map((op) => op.id).toSorted());
      for (const c of layout.cards) expect(c.h).toBe(HEAD + (c.rows.length + (c.more ? 1 : 0)) * ROW + 4);
      for (const c of layout.cards) {
        expect(c.x >= layout.bounds.x && c.x + c.w <= layout.bounds.x + layout.bounds.w).toBe(true);
        expect(c.y >= layout.bounds.y && c.y + c.h <= layout.bounds.y + layout.bounds.h).toBe(true);
      }
    });
  }

  it('is identical across runs and across input key shuffles', async () => {
    for (const sample of SAMPLES) {
      const model = await sampleModel(sample);
      const shuffled = await normalise(shuffleKeys(sample.load()), sample.options);
      const first = JSON.stringify(routeLayout(model, buildGraph(model)));
      expect(JSON.stringify(routeLayout(model, buildGraph(model)))).toBe(first);
      expect(JSON.stringify(routeLayout(shuffled, buildGraph(shuffled)))).toBe(first);
    }
  });
});

describe('route map: the synthetic large spec', () => {
  it('lays out 1000 operations within the 2000 ms budget (parse, infer, layout, skill)', async () => {
    const text = JSON.stringify(syntheticSpec(40));
    const run = async () => {
      const start = performance.now();
      const model = await normalise(parseText(text).value);
      const graph = buildGraph(model);
      const layout = routeLayout(model, graph);
      generateSkill(model, graph);
      return { ms: performance.now() - start, layout };
    };
    let r = await run();
    if (r.ms >= 2000) r = await run(); // one retry: the machine is shared
    expect(r.ms).toBeLessThan(2000);
    expect(r.layout.cards).toHaveLength(40);
  });

  it('matches __snapshots__/synthetic.route.json (summary), scrolls past four columns, no overlap or crossing', async () => {
    const { graph, model } = await syntheticModel();
    const layout = routeLayout(model, graph);
    const summary = {
      width: layout.width, height: layout.height, scrolls: layout.scrolls, bounds: layout.bounds,
      columns: layout.columns.map((c) => c.cards.join(' ')),
      cards: layout.cards.map((c) => `${c.name} ${c.column} ${c.x},${c.y} h${c.h} rows ${c.rows.length} more ${c.more?.count ?? 0}${c.main ? ' main' : ''}`),
      links: layout.links.length,
      workflow: layout.workflow && { ops: layout.workflow.ops, y: layout.workflow.y, steps: layout.workflow.steps },
    };
    expectNoSharedRuns(layout);
    expectOffTheLine(layout);
    await expect(`${JSON.stringify(summary, null, 2)}\n`).toMatchFileSnapshot('./__snapshots__/synthetic.route.json');
    expect(layout.columns.length).toBeGreaterThan(4);
    expect(layout.scrolls).toBe(true);
    expect(layout.width).toBe(layout.columns.length * COLUMN_STEP - 88);
    expect(layout.workflow!.steps.find((s) => s.shape !== 'loop')!.shape).toBe('line');
    // The bundle holding the workflow's own step is not drawn on top of the line.
    const step = layout.workflow!.steps.find((s) => s.shape === 'line')!;
    const bundle = graph.bundles.find((b) => b.edges.includes(`feeds:${step.from}->${step.to}`));
    expect(bundle).toBeDefined();
    expect(layout.links.some((l) => l.id === bundle!.id)).toBe(false);
    expectNoOverlap(layout);
    expectClearOfCards(layout, restPaths(layout));
    for (const op of model.operations.slice(0, 50)) {
      expectClearOfCards(layout, hoverLinks(layout, graph, op.id).map((l) => ({ id: l.edge, d: l.d })));
    }
  });

  it('caps a card at 8 rows plus "N more", expands in place, and keeps workflow stops visible', async () => {
    const { graph, model } = await syntheticModel();
    const c = graph.clusters.find((k) => k.name === 'R3s')!;
    const shut = routeLayout(model, graph);
    const short = shut.cards.find((k) => k.id === c.id)!;
    expect(short.rows.map((r) => r.op)).toEqual(c.operationIds.slice(0, MAX_ROWS));
    expect(short.more).toMatchObject({ count: 17, expanded: false, cy: short.y + HEAD + MAX_ROWS * ROW + ROW / 2 });
    expect(short.more!.hidden).toEqual(c.operationIds.slice(MAX_ROWS));
    expect(short.h).toBe(HEAD + 9 * ROW + 4);

    const open = routeLayout(model, graph, { expanded: new Set([c.id]) });
    const long = open.cards.find((k) => k.id === c.id)!;
    expect(long.rows.map((r) => r.op)).toEqual(c.operationIds);
    expect(long.more).toMatchObject({ count: 17, expanded: true, hidden: [] });
    expect(long.h).toBe(HEAD + 26 * ROW + 4);
    expectNoOverlap(open);
    expectClearOfCards(open, restPaths(open));

    // A stop beyond the first 8 stays visible; the rows keep CRUD order.
    const chain = { ops: [c.operationIds[0]!, c.operationIds[24]!], via: ['x'], inferred: [false] };
    const pinned = routeLayout(model, graph, { chain }).cards.find((k) => k.id === c.id)!;
    expect(pinned.rows.map((r) => r.op)).toEqual([...c.operationIds.slice(0, MAX_ROWS - 1), c.operationIds[24]]);
    expect(pinned.rows.at(-1)!.stop).toBe(2);
  });
});

describe('route map: parts', () => {
  it('breaks cycles greedily (Eades-Lin-Smyth), ties in model order', () => {
    const out = new Map([['a', new Set(['b'])], ['b', new Set(['c'])], ['c', new Set(['a', 'd'])], ['d', new Set<string>()]]);
    expect(feedbackOrder(['a', 'b', 'c', 'd'], out)).toEqual(['a', 'b', 'c', 'd']);
    expect(feedbackOrder(['c', 'b', 'a', 'd'], out)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('runs the workflow forward even when the feed graph would put its target first', async () => {
    const model = await sampleModel(getSample('tasks')!);
    const graph = buildGraph(model);
    expect(Object.fromEntries(columnsOf(graph, ['cluster-projects', 'cluster-tasks']))).toEqual({
      'cluster-comments': 3, 'cluster-labels': 1, 'cluster-projects': 0, 'cluster-members': 1, 'cluster-tasks': 2,
    });
    const back = columnsOf(graph, ['cluster-tasks', 'cluster-projects']);
    expect(back.get('cluster-projects')!).toBeGreaterThan(back.get('cluster-tasks')!);
  });

  it('defaults to topChains()[0] and draws nothing for chain: null', async () => {
    const { model, graph, layout } = await routeOf('tasks');
    expect(layout.workflow!.ops).toEqual(topChains(model, graph)[0]!.ops);
    const none = routeLayout(model, graph, { chain: null });
    expect(none.workflow).toBeUndefined();
    expect(none.cards.every((c) => !c.main && c.rows.every((r) => r.stop === undefined))).toBe(true);
    expectNoOverlap(none);
    expectClearOfCards(none, restPaths(none));
  });

  it('ends the workflow before a step that does not run right; a one-stop chain is no workflow', async () => {
    const { model, graph } = await routeOf('tasks');
    const flat = routeLayout(model, graph, { chain: { ops: ['listMembers', 'listLabels'], via: ['x'], inferred: [false] } });
    expect(flat.workflow).toBeUndefined();
    expect(flat.cards.filter((c) => c.main)).toEqual([]);
    expectNoOverlap(flat);
    const cut = routeLayout(model, graph, { chain: { ops: ['listProjects', 'listMembers', 'listLabels'], via: ['a', 'b'], inferred: [false, true] } });
    expect(cut.workflow).toMatchObject({ ops: ['listProjects', 'listMembers'], via: ['a'], inferred: [false] });
    expect(cut.cards.filter((c) => c.main).map((c) => c.name)).toEqual(['Projects', 'Members']);
    expectNoOverlap(cut);
    const one = routeLayout(model, graph, { chain: { ops: ['listTasks'], via: [], inferred: [] } });
    expect(one.workflow).toBeUndefined();
    expect(one.cards.some((c) => c.main || c.rows.some((r) => r.stop !== undefined))).toBe(false);
  });

  it('hoverBounds holds every hover link of every operation', async () => {
    for (const sample of SAMPLES) {
      const { model, graph, layout } = await routeOf(sample.id);
      const box = hoverBounds(layout, graph);
      expect(box.x).toBeLessThanOrEqual(-HOVER_REACH);
      expect(box.y + box.h).toBeGreaterThanOrEqual(layout.height + OPEN_REACH);
      for (const op of model.operations) {
        for (const p of hoverLinks(layout, graph, op.id).flatMap((l) => samplePath(l.d))) {
          expect(p.x >= box.x - 0.1 && p.x <= box.x + box.w + 0.1 && p.y >= box.y - 0.1 && p.y <= box.y + box.h + 0.1).toBe(true);
        }
      }
    }
  });

  it('writes the method column: HTTP methods in capitals, MCP tools as read or write (D41)', () => {
    expect(methodOf(tool({ kind: 'endpoint', method: 'patch' }), 'update')).toEqual({ method: 'PATCH', destructive: false });
    expect(methodOf(tool({ kind: 'endpoint', method: 'delete' }), 'delete')).toEqual({ method: 'DELETE', destructive: true });
    expect(methodOf(tool({ hints: { destructive: true } }), 'update')).toEqual({ method: 'write', destructive: true });
    expect(methodOf(tool({ hints: { readOnly: true } }), 'action')).toEqual({ method: 'read', destructive: false });
    expect(methodOf(tool({}), 'list')).toEqual({ method: 'read', destructive: false });
    expect(methodOf(tool({}), 'create')).toEqual({ method: 'write', destructive: false });
  });

  it('takes the direct curve when it clears the columns between, else its own track', () => {
    const lane = { x: 290, w: 202, spans: [{ top: 0, bottom: 100 }, { top: 132, bottom: 232 }] };
    // From 112 to 120 the direct curve stays in the free stretch 108..124: no straight run at all.
    expect(routeAcross({ x: 202, y: 112 }, { x: 580, y: 120 }, [lane])).toBe('M202 112C391 112 391 120 580 120');
    // Two links that want the same corridor get tracks TRACK apart, the upper source on the upper track.
    const [a, b] = routeWires([
      { from: { x: 202, y: 40 }, to: { x: 580, y: 180 }, lanes: [lane] },
      { from: { x: 202, y: 20 }, to: { x: 580, y: 200 }, lanes: [lane] },
    ]);
    expect(runs(b!)[0]!.y).toBe(runs(a!)[0]!.y - TRACK);
    expect(runs(a!)[0]!.y).toBeLessThanOrEqual(124);
    expect(runs(b!)[0]!.y).toBeGreaterThanOrEqual(108);
  });

  it('spreads 20 links across one tall card over both open corridors, then past them, always TRACK apart', () => {
    const lane = { x: 290, w: 202, spans: [{ top: 0, bottom: 400 }] };
    const wires = Array.from({ length: 20 }, (_, i) => ({ from: { x: 202, y: 20 + i * 18 }, to: { x: 580, y: 20 + i * 18 }, lanes: [lane] }));
    const paths = routeWires(wires).map((d, i) => ({ id: `w${i}`, d }));
    const ys = paths.map((p) => runs(p.d)[0]!.y);
    const [above, below] = [ys.filter((y) => y < 0), ys.filter((y) => y > 400)];
    // The upper 8 fill the corridor above, the next 8 overflow below, the last 4 (nearer the bottom) stay there past 8.
    expect([above.length, below.length]).toEqual([8, 12]);
    expect(below.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, k) => 408 + k * TRACK));
    expect(ys.every((y) => y <= -8 || y >= 408)).toBe(true);
    expectApart(paths);
    // The deepest track is where openReach says it can be.
    expect(Math.min(...above)).toBeGreaterThanOrEqual(-openReach(20));
    expect(Math.max(...below)).toBeLessThanOrEqual(400 + openReach(20));
  });

  it('routes a link through a free corridor of each column it passes', () => {
    const lane = { x: 290, w: 202, spans: [{ top: 0, bottom: 100 }, { top: 132, bottom: 232 }] };
    expect(corridorY(lane, 50)).toBe(-8);
    expect(corridorY(lane, 90)).toBe(108);
    expect(corridorY(lane, 116)).toBe(116);
    expect(corridorY(lane, 300)).toBe(300);
    const d = routeAcross({ x: 202, y: 60 }, { x: 580, y: 60 }, [lane]);
    expect(d).toBe('M202 60C246 60 246 108 290 108H492C536 108 536 60 580 60');
    expect(samplePath(d).every((p) => !(p.x > 290 && p.x < 492 && ((p.y > 0 && p.y < 100) || (p.y > 132 && p.y < 232))))).toBe(true);
  });
});
