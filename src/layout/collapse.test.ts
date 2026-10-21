import { describe, expect, it } from 'vitest';
import { syntheticSpec } from '../__fixtures__/synthetic';
import { buildGraph } from '../graph';
import { normalise } from '../model/normalise';
import { parseText } from '../parse/text';
import { getSample, sampleModel } from '../samples';
import { generateSkill } from '../skillgen';
import { AGGREGATE_OVER, COLLAPSE_OVER, aggregated, clusterLinks, startCollapsed, summaryId } from './collapse';
import { cardOrder, layout } from './layout';

describe('large specs (P4)', () => {
  it('parses, infers, lays out and writes the skill of a 1000-operation spec in under 2000 ms', async () => {
    const text = JSON.stringify(syntheticSpec(40));
    const run = async () => {
      const start = performance.now();
      const model = await normalise(parseText(text).value);
      const graph = buildGraph(model);
      const atlas = layout(model, graph, startCollapsed(graph));
      const skill = generateSkill(model, graph);
      return { ms: performance.now() - start, model, graph, atlas, skill };
    };
    let r = await run();
    if (r.ms >= 2000) r = await run(); // one retry: the machine is shared
    const { ms, model, graph, atlas, skill } = r;
    console.log(`  1000 operations: ${Math.round(ms)} ms, ${graph.edges.length} edges, ${Object.keys(skill).length} skill files`);
    expect(ms).toBeLessThan(2000);
    expect(model.operations).toHaveLength(1000);
    expect(Object.keys(skill).filter((p) => p.startsWith('references/')).length).toBeGreaterThan(40);

    // Above 400 operations every cluster starts as one summary card; above 300 edges, counted links.
    expect(model.operations.length).toBeGreaterThan(COLLAPSE_OVER);
    expect(graph.edges.length).toBeGreaterThan(AGGREGATE_OVER);
    expect(atlas.nodes).toHaveLength(40);
    expect(atlas.nodes.every((n) => n.summary && n.id === summaryId(n.cluster))).toBe(true);
    expect(atlas.edges).toEqual([]);
    const links = atlas.links.filter((l) => l.kind === 'clusters');
    expect(links.length).toBe(clusterLinks(graph).length);
    expect(links[0]!.label.text).toMatch(/^\d+ links$/);
    const total = clusterLinks(graph).reduce((n, l) => n + l.count, 0);
    const home = new Map(graph.clusters.flatMap((c) => c.operationIds.map((id) => [id, c.id] as const)));
    expect(total).toBe(graph.edges.filter((e) => home.get(e.from) !== home.get(e.to)).length);
  });

  it('expanding one cluster lays out its operations and only the edges whose ends are both shown', async () => {
    const model = await normalise(syntheticSpec(40));
    const graph = buildGraph(model);
    const open = graph.clusters[1]!;
    const shut = startCollapsed(graph, open.operationIds[3]);
    expect(shut.has(open.id)).toBe(false);
    expect(shut.size).toBe(39);
    const atlas = layout(model, graph, shut);
    expect(atlas.nodes.filter((n) => !n.summary).map((n) => n.id).toSorted()).toEqual(open.operationIds.toSorted());
    expect(atlas.edges.length).toBeGreaterThan(0);
    expect(atlas.edges.every((e) => open.operationIds.includes(e.from) && open.operationIds.includes(e.to))).toBe(true);
    expect(atlas.edges.every((e) => !e.label.shown)).toBe(true); // labels wait for a highlight
  });

  it('leaves the samples expanded and unaggregated', async () => {
    const model = await sampleModel(getSample('tasks')!);
    const graph = buildGraph(model);
    expect(startCollapsed(graph).size).toBe(0);
    expect(aggregated(graph)).toBe(false);
    expect(layout(model, graph).links.map((l) => l.kind)).toEqual(['bundle', 'bundle']);
  });
});

describe('cardOrder', () => {
  it('places the largest cluster first, then the most connected to those placed (ties by name)', async () => {
    const graph = buildGraph(await sampleModel(getSample('tasks')!));
    expect(cardOrder(graph).map((c) => c.name)).toEqual(['Tasks', 'Projects', 'Members', 'Labels', 'Comments']);
    // The order depends only on the graph, not on the order clusters arrive in.
    const reversed = { ...graph, clusters: graph.clusters.toReversed() };
    expect(cardOrder(reversed).map((c) => c.id)).toEqual(cardOrder(graph).map((c) => c.id));
  });
});
