import { describe, expect, it } from 'vitest';
import { buildGraph } from '../graph';
import { normalise } from '../model/normalise';
import type { Operation } from '../model/types';
import { SAMPLES, getSample, sampleModel } from '../samples';
import { bezier, curvePath, elbow, overlaps, pointAt, sides } from './geometry';
import { NODE_H, NODE_W, layout, nodeState } from './layout';

const layoutOf = async (id: string) => {
  const model = await sampleModel(getSample(id)!);
  return { model, graph: buildGraph(model), atlas: layout(model, buildGraph(model)) };
};

/** Deep copy with every object's keys in reverse order (arrays keep their order). */
function shuffleKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shuffleKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.keys(value).toReversed().map((k) => [k, shuffleKeys((value as Record<string, unknown>)[k])]));
}

describe('geometry', () => {
  it('detects overlap, picks facing sides, and writes compact paths', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(overlaps(a, { x: 9, y: 9, w: 5, h: 5 })).toBe(true);
    expect(overlaps(a, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
    expect(sides(a, { x: 20, y: 0, w: 5, h: 5 })).toEqual([1, -1]);
    expect(sides({ x: 20, y: 0, w: 5, h: 5 }, a)).toEqual([-1, 1]);
    expect(sides(a, { x: 5, y: 40, w: 10, h: 5 })).toEqual([1, 1]);
    const c = bezier({ x: 0, y: 0 }, 10, { x: 100, y: 50 }, -10);
    expect(curvePath(c)).toBe('M0 0C10 0 90 50 100 50');
    expect(pointAt(c, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAt(c, 0.5)).toEqual({ x: 50, y: 25 });
    expect(elbow({ x: 20, y: 10 }, { x: 32, y: 60 }, 12)).toEqual({ d: 'M20 10H12V60H32', mid: { x: 12, y: 35 } });
  });
});

const stub = (o: Partial<Operation>) => ({ kind: 'endpoint', hints: {}, ...o }) as Operation;

describe('nodeState', () => {
  it('marks DELETE and destructiveHint destructive, writes mutating, reads plain', () => {
    expect(nodeState(stub({ method: 'delete' }), 'delete')).toBe('destructive');
    expect(nodeState(stub({ method: 'post' }), 'create')).toBe('mutating');
    expect(nodeState(stub({ method: 'get' }), 'read')).toBe('read');
    expect(nodeState(stub({ kind: 'tool', hints: { destructive: true } }), 'update')).toBe('destructive');
    expect(nodeState(stub({ kind: 'tool', hints: { readOnly: true } }), 'action')).toBe('read');
    expect(nodeState(stub({ kind: 'tool' }), 'list')).toBe('read');
    expect(nodeState(stub({ kind: 'tool' }), 'create')).toBe('mutating');
  });
});

describe('layout', () => {
  for (const sample of SAMPLES) {
    it(`${sample.id} matches __snapshots__/${sample.id}.layout.json`, async () => {
      const { atlas } = await layoutOf(sample.id);
      await expect(`${JSON.stringify(atlas, null, 2)}\n`).toMatchFileSnapshot(`./__snapshots__/${sample.id}.layout.json`);
    });

    it(`${sample.id}: one node per operation inside its card, one route per edge, no overlaps`, async () => {
      const { model, graph, atlas } = await layoutOf(sample.id);
      expect(atlas.nodes.map((n) => n.id).toSorted()).toEqual(model.operations.map((op) => op.id).toSorted());
      expect(atlas.edges.map((e) => e.id)).toEqual(graph.edges.map((e) => e.id));
      expect(atlas.clusters.map((c) => c.id).toSorted()).toEqual(graph.clusters.map((c) => c.id).toSorted());
      const cards = new Map(atlas.clusters.map((c) => [c.id, c]));
      for (const n of atlas.nodes) {
        const c = cards.get(n.cluster)!;
        expect([n.w, n.h]).toEqual([NODE_W, NODE_H]);
        expect(n.x >= c.x && n.y >= c.y + 36 && n.x + n.w <= c.x + c.w && n.y + n.h <= c.y + c.h).toBe(true);
      }
      atlas.nodes.forEach((a, i) => atlas.nodes.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)));
      atlas.clusters.forEach((a, i) => atlas.clusters.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)));
      for (const e of atlas.edges) expect(e.d).toMatch(/^M[\d. -]+[CH]/);
      const shown = atlas.edges.filter((e) => e.label.shown);
      shown.forEach((a, i) =>
        shown.slice(i + 1).forEach((b) => {
          const box = (e: typeof a) => ({ x: e.label.x - e.label.text.length * 3.2, y: e.label.y - 7, w: e.label.text.length * 6.4, h: 14 });
          expect(overlaps(box(a), box(b))).toBe(false);
        }),
      );
      for (const c of atlas.clusters) {
        expect(c.x >= atlas.bounds.x && c.y >= atlas.bounds.y).toBe(true);
        expect(c.x + c.w <= atlas.bounds.x + atlas.bounds.w && c.y + c.h <= atlas.bounds.y + atlas.bounds.h).toBe(true);
      }
    });
  }

  it('is byte-identical across runs and across input key shuffles', async () => {
    for (const sample of SAMPLES) {
      const model = await sampleModel(sample);
      const shuffled = await normalise(shuffleKeys(sample.load()), sample.options);
      const first = JSON.stringify(layout(model, buildGraph(model)));
      expect(JSON.stringify(layout(model, buildGraph(model)))).toBe(first);
      expect(JSON.stringify(layout(shuffled, buildGraph(shuffled)))).toBe(first);
    }
  });

  it('indents sub-paths under their parent and labels sub-path edges as such', async () => {
    const { atlas } = await layoutOf('tasks');
    const node = (id: string) => atlas.nodes.find((n) => n.id === id)!;
    expect(node('getProject').depth).toBe(1);
    expect(node('getProject').x - node('listProjects').x).toBe(12);
    expect(atlas.edges.filter((e) => e.kind === 'sub-path').every((e) => e.label.text === 'sub-path')).toBe(true);
    expect(atlas.clusters.find((c) => c.name === 'Tasks')!.hubs).toEqual([{ name: 'Error', count: 6 }]);
  });
});
