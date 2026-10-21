import { describe, expect, it } from 'vitest';
import { buildGraph } from '../graph';
import type { AtlasGraph } from '../graph/types';
import { SAMPLES, sampleModel } from '../samples';
import { topChains } from './graph-chains';

const chainsOf = async (id: string) => {
  const model = await sampleModel(SAMPLES.find((s) => s.id === id)!);
  return { model, graph: buildGraph(model), chains: topChains(model, buildGraph(model)) };
};

describe('topChains', () => {
  it('Tasks: starts from listProjects and follows required ids', async () => {
    const { chains } = await chainsOf('tasks');
    expect(chains[0]).toEqual({
      ops: ['listProjects', 'listTasks', 'getTask', 'getMember'],
      via: ['id -> projectId, ownerId -> assigneeId', 'id -> taskId', 'projectId -> projectId, assigneeId -> memberId'],
    });
    expect(chains).toHaveLength(5);
  });

  it('Petstore skips the deprecated findPetsByTags; filesystem skips read_file', async () => {
    const pet = await chainsOf('petstore');
    expect(pet.chains.map((c) => c.ops.join(' '))).toEqual([
      'findPetsByStatus getPetById', 'findPetsByStatus updatePetWithForm', 'findPetsByStatus deletePet', 'findPetsByStatus uploadFile',
    ]);
    const fs = await chainsOf('filesystem');
    expect(fs.chains[0]!.ops[0]).toBe('list_allowed_directories');
    expect(fs.chains.flatMap((c) => c.ops)).not.toContain('read_file');
  });

  it('every chain is 2-4 distinct ops along feeds edges; no two share a last op or first step', async () => {
    for (const sample of SAMPLES) {
      const { graph, chains } = await chainsOf(sample.id);
      const feeds = new Set(graph.edges.filter((e) => e.kind === 'feeds').map((e) => `${e.from}>${e.to}`));
      for (const c of chains) {
        expect(c.ops.length).toBeGreaterThanOrEqual(2);
        expect(c.ops.length).toBeLessThanOrEqual(4);
        expect(new Set(c.ops).size).toBe(c.ops.length);
        expect(c.via).toHaveLength(c.ops.length - 1);
        c.ops.slice(1).forEach((to, i) => expect(feeds.has(`${c.ops[i]}>${to}`)).toBe(true));
      }
      expect(new Set(chains.map((c) => c.ops.at(-1))).size).toBe(chains.length);
      expect(new Set(chains.map((c) => c.ops.slice(0, 2).join())).size).toBe(chains.length);
    }
  });

  it('no feeds edges: no chains', async () => {
    const { model, graph } = await chainsOf('tasks');
    const bare: AtlasGraph = { ...graph, edges: graph.edges.filter((e) => e.kind !== 'feeds') };
    expect(topChains(model, bare)).toEqual([]);
  });
});
