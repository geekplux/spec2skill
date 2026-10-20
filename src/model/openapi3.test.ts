import { describe, expect, it } from 'vitest';
import tasksText from '../../samples/tasks-openapi31.yaml?raw';
import { ParseError, parseText } from '../parse/text';
import cyclic from './__fixtures__/cyclic.json';
import external from './__fixtures__/external-ref.json';
import missingIdsText from './__fixtures__/missing-operation-ids.yaml?raw';
import nullable30Text from './__fixtures__/nullable-30.yaml?raw';
import typeArrays31Text from './__fixtures__/type-arrays-31.yaml?raw';
import { buildOpenApi3, normaliseOpenApi3 } from './openapi3';
import type { Operation } from './types';

const tasks = parseText(tasksText).value;
const byId = (ops: Operation[], id: string) => ops.find((op) => op.id === id)!;
const inputNames = (op: Operation) => op.inputs.map((p) => `${p.in}:${p.name}${p.required ? '!' : ''}`);

describe('normaliseOpenApi3: Tasks sample', async () => {
  const model = await normaliseOpenApi3(tasks, { url: 'https://tasks.example.com/openapi.yaml' });
  const ops = model.operations;

  it('reads the source, servers and bearer auth', () => {
    expect(model.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(model.source).toMatchObject({ kind: 'openapi3', specVersion: '3.1.0', title: 'Tasks API', version: '1.0.0', license: 'MIT' });
    expect(model.servers).toEqual(['https://tasks.example.com/v1']);
    expect(model.auth).toEqual([
      expect.objectContaining({ id: 'bearerAuth', type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }),
    ]);
    expect(model.warnings).toEqual([]);
  });

  it('has exactly 21 operations sorted by path then method, all behind bearerAuth', () => {
    expect(ops).toHaveLength(21);
    expect(ops.slice(0, 3).map((op) => `${op.method} ${op.path} ${op.id}`)).toEqual([
      'patch /comments/{commentId} updateComment',
      'delete /comments/{commentId} deleteComment',
      'delete /labels/{labelId} deleteLabel',
    ]);
    expect(new Set(ops.map((op) => op.id)).size).toBe(21);
    for (const op of ops) expect(op.security).toEqual([['bearerAuth']]);
  });

  it('merges path-level params and flattens request bodies', () => {
    const create = byId(ops, 'createTask');
    expect(create).toMatchObject({ method: 'post', path: '/projects/{projectId}/tasks', tags: ['tasks'], title: 'Create a task' });
    expect(inputNames(create)).toEqual([
      'path:projectId!', 'body:assigneeId', 'body:description', 'body:dueDate', 'body:labelIds', 'body:title!',
    ]);
    expect(create.requestBody).toEqual({ contentType: 'application/json', schema: { ref: 'TaskInput' } });
    expect(create.inputs.find((p) => p.name === 'assigneeId')!.schema).toEqual({ type: 'string', nullable: true });
    expect(create.output).toEqual({ status: '201', contentType: 'application/json', schema: { ref: 'Task' } });
    expect(create.responses.map((r) => r.status)).toEqual(['201', '400', '404']);
    expect(create.hints).toEqual({ readOnly: false, destructive: false, idempotent: false });

    expect(inputNames(byId(ops, 'listTasks'))).toEqual([
      'path:projectId!', 'query:cursor', 'query:limit', 'query:status', 'query:assigneeId', 'query:labelId',
    ]);
    expect(byId(ops, 'listTasks').inputs[3]!.schema).toEqual({ ref: 'TaskStatus' });
    expect(inputNames(byId(ops, 'removeMember'))).toEqual(['path:projectId!', 'path:memberId!']);
    expect(byId(ops, 'deleteProject').output).toBeUndefined();
    expect(byId(ops, 'deleteProject').hints).toEqual({ readOnly: false, destructive: true, idempotent: true });
  });

  it('detects cursor pagination on every list operation and nowhere else', () => {
    const paginated = ops.filter((op) => op.pagination).map((op) => op.id);
    expect(paginated.toSorted()).toEqual(['listComments', 'listLabels', 'listMembers', 'listProjects', 'listTasks']);
    for (const id of paginated) expect(byId(ops, id).pagination).toEqual({ style: 'cursor', params: ['cursor', 'limit'] });
    expect(byId(ops, 'listMembers').output!.schema).toEqual({ ref: 'MemberPage' });
  });

  it('keeps named schemas by name, merging allOf and mapping 3.1 type arrays', () => {
    expect(Object.keys(model.schemas)).toHaveLength(21);
    expect(model.schemas.TaskPage!.fields).toEqual([
      { name: 'data', required: true, type: 'array', items: { ref: 'Task' } },
      expect.objectContaining({ name: 'nextCursor', required: true, type: 'string', nullable: true }),
    ]);
    const task = model.schemas.Task!;
    expect(task.fields!.map((f) => f.name)).toEqual([
      'assigneeId', 'createdAt', 'description', 'dueDate', 'id', 'labelIds', 'projectId', 'status', 'title',
    ]);
    expect(task.fields!.find((f) => f.name === 'status')).toEqual({ name: 'status', required: true, ref: 'TaskStatus' });
    expect(model.schemas.TaskStatus).toEqual({ type: 'string', enum: ['todo', 'in_progress', 'done'] });
    expect(model.schemas.MemberInput!.fields![1]).toEqual({ name: 'role', required: false, ref: 'Role', description: 'Defaults to editor.' });
  });

  it('contains nothing finance-related', () => {
    expect(tasksText).not.toMatch(/\b(price|payment|invoice|billing|currency|crypto|trading|wallet|order)s?\b/i);
  });
});

describe('normaliseOpenApi3: hostile and edge-case fixtures', () => {
  it('terminates on cyclic $refs and still produces a model', () => {
    const model = buildOpenApi3(cyclic);
    expect(model.operations.map((op) => op.id)).toEqual(['getDeep', 'createNode']);
    expect(model.schemas.Node!.fields).toEqual([
      { name: 'children', required: false, type: 'array', items: { ref: 'Node' } },
      { name: 'id', required: false, type: 'string' },
      { name: 'parent', required: false, ref: 'Node' },
    ]);
    expect(model.schemas.A!.fields!.map((f) => f.name)).toEqual(['a', 'b']);
    expect(model.schemas.Alias1).toEqual({ ref: 'Alias2' });
    const create = byId(model.operations, 'createNode');
    expect(inputNames(create)).toEqual(['body:a', 'body:b']); // the looping parameter is dropped
    expect(model.warnings.some((w) => w.code === 'cyclic-ref')).toBe(true);
  });

  it('warns about external refs and never throws', () => {
    const model = buildOpenApi3(external);
    const list = byId(model.operations, 'listPets');
    expect(list.output!.schema).toEqual({ type: 'array', items: { ref: 'https://schemas.example.com/pet.json#/Pet', unresolved: true } });
    expect(list.inputs).toEqual([
      { name: 'kind', in: 'query', required: false, schema: { ref: 'https://schemas.example.com/kind.json', unresolved: true } },
    ]);
    expect(model.schemas.Owner!.fields!.map((f) => [f.name, f.ref, f.unresolved])).toEqual([
      ['missing', '#/components/schemas/Nope', true],
      ['pet', 'pet.yaml#/components/schemas/Pet', true],
    ]);
    const codes = model.warnings.map((w) => w.code);
    expect(codes.filter((c) => c === 'external-ref')).toHaveLength(4);
    expect(codes).toContain('missing-ref');
    expect(model.warnings.find((w) => w.message.includes('parameters.yaml'))!.pointer).toBe('#/paths/~1pets/get/parameters/0');
  });

  it('derives unique ids when operationIds are missing or duplicated', () => {
    const model = buildOpenApi3(parseText(missingIdsText).value);
    expect(model.operations.map((op) => [op.id, op.title])).toEqual([
      ['get_root', 'get_root'],
      ['removePet', 'removePet'],
      ['post_pets', 'post_pets'],
      ['get_pets_petId', 'Get a pet'],
      ['removePet_2', 'removePet_2'],
    ]);
    expect(byId(model.operations, 'get_pets_petId').inputs[0]!.required).toBe(true); // path params are always required
    expect(byId(model.operations, 'post_pets').inputs).toEqual([]);
    expect(model.warnings.map((w) => w.code).toSorted()).toEqual([
      'duplicate-operation-id', 'invalid-parameter', 'missing-operation-id',
    ]);
    expect(model.operations.every((op) => op.security.length === 0)).toBe(true);
  });

  it('maps 3.0 nullable and 3.1 type arrays to the same schema', () => {
    const v30 = buildOpenApi3(parseText(nullable30Text).value).schemas;
    const v31 = buildOpenApi3(parseText(typeArrays31Text).value).schemas;
    expect(v31).toEqual(v30);
    expect(v30.Thing!.fields).toEqual([
      { name: 'count', required: false, type: 'integer', format: 'int32', nullable: true },
      { name: 'id', required: true, type: 'string' },
      { name: 'kind', required: false, type: 'string', enum: ['a'] },
      { name: 'note', required: false, type: 'string', nullable: true },
      { name: 'owner', required: false, ref: 'Owner', nullable: true },
      { name: 'tags', required: false, type: 'array', nullable: true, items: { type: 'string' } },
    ]);
  });

  it('rejects documents that are not OpenAPI 3.x and keeps hostile keys inert', () => {
    expect(() => buildOpenApi3({ swagger: '2.0' })).toThrow(ParseError);
    expect(() => buildOpenApi3([])).toThrow(/OpenAPI 3/);
    const hostile = JSON.parse('{"openapi":"3.0.0","info":{"title":"<img src=x onerror=alert(1)>\\u0007\\u202e"},"paths":{},' +
      '"components":{"schemas":{"__proto__":{"type":"string"}}}}');
    const model = buildOpenApi3(hostile);
    expect(model.source.title).toBe('<img src=x onerror=alert(1)>'); // plain text, control/bidi chars stripped
    expect(Object.getPrototypeOf(model.schemas)).toBe(Object.prototype);
    expect(Object.keys(model.schemas)).toEqual(['__proto__']);
  });

  it('stays bounded on YAML alias fan-out (allOf bomb: 4^16 visits without the node budget)', () => {
    const lines = ['openapi: 3.0.0', 'info: { title: Bomb }', 'components:', '  schemas:', '    L0: &l0 { properties: { a: { type: string } } }'];
    for (let i = 1; i <= 16; i++) lines.push(`    L${i}: &l${i} { allOf: [*l${i - 1}, *l${i - 1}, *l${i - 1}, *l${i - 1}] }`);
    const started = performance.now();
    const model = buildOpenApi3(parseText(lines.join('\n')).value);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(Object.keys(model.schemas)).toHaveLength(17);
    expect(model.warnings.map((w) => w.code)).toContain('budget-exceeded');
  });
});
