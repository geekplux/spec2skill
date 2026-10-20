import { describe, expect, it } from 'vitest';
import { normalise } from '../model/normalise';
import type { ApiModel } from '../model/types';
import { SAMPLES, getSample, sampleModel } from '../samples';
import { buildGraph, CRUD_LETTER, type AtlasGraph, type Edge } from './index';
import { MAX_INCOMING_FEEDS } from './types';

const graphOf = async (id: string) => buildGraph(await sampleModel(getSample(id)!));
const find = (g: AtlasGraph, kind: Edge['kind'], from: string, to: string) =>
  g.edges.find((e) => e.kind === kind && e.from === from && e.to === to);
const names = (g: AtlasGraph) => g.clusters.map((c) => c.name);

/** Deep copy with every object's keys in reverse order (arrays keep their order). */
function shuffleKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shuffleKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.keys(value).toReversed().map((k) => [k, shuffleKeys((value as Record<string, unknown>)[k])]));
}

describe('buildGraph: golden snapshots', () => {
  for (const sample of SAMPLES) {
    it(`${sample.id} matches __snapshots__/${sample.id}.graph.json`, async () => {
      const json = `${JSON.stringify(await graphOf(sample.id), null, 2)}\n`;
      await expect(json).toMatchFileSnapshot(`./__snapshots__/${sample.id}.graph.json`);
    });
  }

  it('is byte-identical across runs and across input key shuffles', async () => {
    for (const sample of SAMPLES) {
      const model = await sampleModel(sample);
      const shuffled = await normalise(shuffleKeys(sample.load()), sample.options);
      const first = JSON.stringify(buildGraph(model));
      expect(JSON.stringify(buildGraph(model))).toBe(first);
      expect(JSON.stringify(buildGraph(shuffled))).toBe(first);
    }
  });

  it('never links through Error, keeps every operation in exactly one cluster, caps incoming feeds', async () => {
    for (const sample of SAMPLES) {
      const model = await sampleModel(sample);
      const g = buildGraph(model);
      expect(g.clusters.flatMap((c) => c.operationIds).toSorted()).toEqual(model.operations.map((op) => op.id).toSorted());
      for (const e of g.edges) {
        expect(`${e.label} ${e.evidence}`).not.toMatch(/\bError\b/);
        expect(e.from).not.toBe(e.to);
      }
      for (const op of model.operations) {
        expect(g.edges.filter((e) => e.kind === 'feeds' && e.to === op.id).length).toBeLessThanOrEqual(MAX_INCOMING_FEEDS);
      }
    }
  });
});

describe('buildGraph: Tasks sample', async () => {
  const g = await graphOf('tasks');

  it('clusters by tag, in model order', () => {
    expect(names(g)).toEqual(['Comments', 'Labels', 'Projects', 'Members', 'Tasks']);
    expect(g.clusters.find((c) => c.name === 'Tasks')).toMatchObject({
      id: 'cluster-tasks',
      nameSource: 'deterministic',
      description: '6 operations: list, create, read, update, delete, action',
      operationIds: ['listTasks', 'createTask', 'getTask', 'updateTask', 'deleteTask', 'completeTask'],
    });
  });

  it('feeds Task.assigneeId -> getMember(memberId) and listProjects -> listTasks(projectId)', () => {
    const assignee = find(g, 'feeds', 'getTask', 'getMember')!;
    expect(assignee.label).toBe('projectId -> projectId, assigneeId -> memberId');
    expect(assignee.evidence).toContain('Task.assigneeId -> memberId (path)');
    expect(find(g, 'feeds', 'listProjects', 'listTasks')).toMatchObject({ label: 'id -> projectId, ownerId -> assigneeId', confidence: 'exact' });
    // Member.id fills the assigneeId filter only through its description ("this member"): inferred.
    expect(find(g, 'feeds', 'listMembers', 'listTasks')).toMatchObject({ label: 'id -> assigneeId', confidence: 'inferred' });
  });

  it('a source never feeds back its own input, and only reads offer foreign keys', () => {
    expect(find(g, 'feeds', 'getProject', 'updateProject')).toBeUndefined(); // projectId was the input
    expect(find(g, 'feeds', 'updateTask', 'getProject')).toBeUndefined(); // updates do not offer Task.projectId
    expect(find(g, 'feeds', 'getTask', 'getProject')).toMatchObject({ label: 'projectId -> projectId' });
  });

  it('links /projects/{projectId} -> /projects/{projectId}/tasks via the parent GET', () => {
    expect(find(g, 'sub-path', 'getProject', 'listTasks')).toMatchObject({ label: '/tasks', confidence: 'exact' });
    expect(find(g, 'sub-path', 'getProject', 'createTask')).toBeDefined();
    expect(g.edges.some((e) => e.kind === 'sub-path' && e.to === 'getTask')).toBe(false); // no /tasks path
  });

  it('Error (on 20 operations) is a hub badge, not an edge', () => {
    expect(g.hubSchemas).toEqual([{ name: 'Error', usedBy: 20 }]);
    expect(find(g, 'shared-schema', 'createTask', 'getTask')).toMatchObject({ label: 'Task' });
    expect(find(g, 'shared-schema', 'updateComment', 'createComment')).toMatchObject({ label: 'Comment, CommentInput' });
  });
});

describe('buildGraph: Petstore sample', async () => {
  const g = await graphOf('petstore');

  it('clusters Pet and User', () => expect(names(g)).toEqual(['Pet', 'User']));

  it('sub-path /pet -> /pet/{petId}, from the first /pet operation when /pet has no GET', () => {
    expect(find(g, 'sub-path', 'addPet', 'getPetById')).toMatchObject({ label: '/{petId}', evidence: '/pet/{petId} is under /pet' });
    expect(find(g, 'sub-path', 'getPetById', 'uploadFile')).toMatchObject({ label: '/uploadImage' });
  });

  it('feeds Pet.id -> getPetById(petId)', () => {
    expect(find(g, 'feeds', 'findPetsByStatus', 'getPetById')).toMatchObject({
      label: 'id -> petId',
      evidence: 'Pet.id -> petId (path)',
      confidence: 'exact',
    });
    expect(find(g, 'feeds', 'getPetById', 'deletePet')).toBeUndefined(); // echo of its own petId
  });

  it('classifies CRUD from method and path shape', () => {
    const letters = Object.fromEntries(Object.entries(g.crud).map(([id, crud]) => [id, CRUD_LETTER[crud]]));
    expect(letters).toMatchObject({
      findPetsByStatus: 'L', addPet: 'C', getPetById: 'R', updatePet: 'U', deletePet: 'D', uploadFile: 'A',
      createUsersWithArrayInput: 'C', loginUser: 'A', logoutUser: 'A', getUserByName: 'R',
    });
  });
});

describe('buildGraph: Filesystem MCP sample', async () => {
  const g = await graphOf('filesystem');

  it('clusters File and Directory (list_allowed_directories joins Directory; no Other)', () => {
    expect(names(g)).toEqual(['File', 'Directory']);
    expect(g.clusters[1]!.operationIds).toEqual([
      'list_directory', 'list_directory_with_sizes', 'list_allowed_directories', 'create_directory', 'directory_tree',
    ]);
  });

  it('assigns a CRUD letter to every tool', () => {
    const letters = Object.entries(g.crud).map(([id, crud]) => `${CRUD_LETTER[crud]}:${id}`);
    expect(letters).toEqual([
      'R:read_file', 'R:read_text_file', 'R:read_media_file', 'R:read_multiple_files', 'C:write_file', 'U:edit_file',
      'C:create_directory', 'L:list_directory', 'L:list_directory_with_sizes', 'R:directory_tree', 'U:move_file',
      'L:search_files', 'R:get_file_info', 'L:list_allowed_directories',
    ]);
  });

  it('list_directory and search_files feed read_text_file(path) as inferred; creates are not fed', () => {
    for (const from of ['list_directory', 'search_files']) {
      expect(find(g, 'feeds', from, 'read_text_file')).toMatchObject({ label: 'listed path', confidence: 'inferred' });
    }
    expect(g.edges.some((e) => e.to === 'write_file' || e.to === 'create_directory')).toBe(false);
    expect(g.edges.every((e) => e.kind === 'feeds')).toBe(true);
  });
});

const ok = (ref: string) => ({ '200': { description: 'ok', content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } } });
const param = (name: string, where = 'path') => ({ name, in: where, required: where === 'path', schema: { type: 'string' } });

/** OpenAPI 3.1 with `resources * 10` operations; each resource points at the previous one and at r0 (a hub). */
function syntheticSpec(resources: number) {
  const paths: Record<string, unknown> = {};
  const schemas: Record<string, unknown> = {};
  for (let i = 0; i < resources; i++) {
    const [r, id, prev] = [`R${i}`, `r${i}Id`, `r${(i + resources - 1) % resources}Id`];
    schemas[r] = { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, [prev]: { type: 'string' }, r0Id: { type: 'string' } } };
    schemas[`${r}Page`] = { type: 'object', properties: { data: { type: 'array', items: { $ref: `#/components/schemas/${r}` } } } };
    const body = { content: { 'application/json': { schema: { $ref: `#/components/schemas/${r}` } } } };
    const tags = [`r${i}s`];
    paths[`/r${i}s`] = {
      get: { operationId: `list${r}`, tags, parameters: [param(prev, 'query')], responses: ok(`${r}Page`) },
      post: { operationId: `create${r}`, tags, requestBody: body, responses: ok(r) },
    };
    paths[`/r${i}s/{${id}}`] = {
      parameters: [param(id)],
      get: { operationId: `get${r}`, tags, responses: ok(r) },
      put: { operationId: `replace${r}`, tags, requestBody: body, responses: ok(r) },
      patch: { operationId: `update${r}`, tags, requestBody: body, responses: ok(r) },
      delete: { operationId: `delete${r}`, tags, responses: { '204': { description: 'gone' } } },
    };
    paths[`/r${i}s/{${id}}/children`] = {
      parameters: [param(id)],
      get: { operationId: `children${r}`, tags, responses: ok(`${r}Page`) },
      post: { operationId: `addChild${r}`, tags, requestBody: body, responses: ok(r) },
    };
    paths[`/r${i}s/{${id}}/archive`] = { parameters: [param(id)], post: { operationId: `archive${r}`, tags, responses: ok(r) } };
    paths[`/r${i}s/{${id}}/restore`] = { parameters: [param(id)], post: { operationId: `restore${r}`, tags, responses: ok(r) } };
  }
  return { openapi: '3.1.0', info: { title: 'Synthetic', version: '1' }, paths, components: { schemas } };
}

describe('buildGraph: scale', () => {
  it('builds a 1000-operation graph in under 1000 ms', async () => {
    const model: ApiModel = await normalise(syntheticSpec(100));
    expect(model.operations).toHaveLength(1000);
    const start = performance.now();
    const g = buildGraph(model);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(1000);
    expect(g.clusters).toHaveLength(100);
    const incoming = new Map<string, number>();
    for (const e of g.edges) if (e.kind === 'feeds') incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    expect(Math.max(...incoming.values())).toBe(MAX_INCOMING_FEEDS);
  });
});
