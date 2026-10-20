import { describe, expect, it } from 'vitest';
import petstore from '../../samples/petstore-swagger2.json';
import { parseText } from '../parse/text';
import edgeText from './__fixtures__/swagger2-edge.yaml?raw';
import { buildSwagger2, normaliseSwagger2 } from './swagger2';
import type { Operation } from './types';

const byId = (ops: Operation[], id: string) => ops.find((op) => op.id === id)!;
const inputNames = (op: Operation) => op.inputs.map((p) => `${p.in}:${p.name}${p.required ? '!' : ''}`);

describe('normaliseSwagger2: Petstore sample', async () => {
  const model = await normaliseSwagger2(petstore);
  const ops = model.operations;

  it('reads source, servers and both security schemes', () => {
    expect(model.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(model.source).toMatchObject({ kind: 'swagger2', specVersion: '2.0', title: 'Swagger Petstore', version: '1.0.7' });
    expect(model.servers).toEqual(['https://petstore.swagger.io/v2', 'http://petstore.swagger.io/v2']);
    expect(model.auth).toEqual([
      { id: 'api_key', type: 'apiKey', in: 'header', name: 'api_key' },
      { id: 'petstore_auth', type: 'oauth2', flows: ['implicit'], scopes: ['read:pets', 'write:pets'] },
    ]);
    expect(Object.keys(model.schemas)).toEqual(['ApiResponse', 'Category', 'Pet', 'Tag', 'User']);
    expect(model.warnings).toEqual([]);
  });

  it('has exactly the 16 trimmed operations, none under /store', () => {
    expect(ops).toHaveLength(16);
    expect(ops.some((op) => op.path!.startsWith('/store'))).toBe(false);
    expect(byId(ops, 'getPetById')).toMatchObject({ method: 'get', path: '/pet/{petId}', security: [['api_key']] });
    expect(byId(ops, 'getPetById').output).toEqual({ status: '200', contentType: 'application/json', schema: { ref: 'Pet' } });
    expect(byId(ops, 'findPetsByStatus').output!.schema).toEqual({ type: 'array', items: { ref: 'Pet' } });
  });

  it('turns uploadFile formData params into a multipart body', () => {
    const upload = byId(ops, 'uploadFile');
    expect(upload.requestBody!.contentType).toBe('multipart/form-data');
    expect(inputNames(upload)).toEqual(['path:petId!', 'body:additionalMetadata', 'body:file']);
    expect(upload.inputs[2]!.schema).toEqual({ type: 'string', format: 'binary' });
    expect(byId(ops, 'updatePetWithForm').requestBody!.contentType).toBe('application/x-www-form-urlencoded');
  });

  it('turns in: body into a JSON request body, flattened like OpenAPI 3', () => {
    const add = byId(ops, 'addPet');
    expect(add.requestBody).toEqual({ contentType: 'application/json', schema: { ref: 'Pet' } });
    expect(inputNames(add)).toContain('body:name!');
    expect(inputNames(byId(ops, 'createUsersWithArrayInput'))).toEqual(['body:body!']);
  });
});

describe('normaliseSwagger2: edge cases', () => {
  const model = buildSwagger2(parseText(edgeText).value);
  const ops = model.operations;

  it('keeps a relative basePath and maps basic and accessCode schemes', () => {
    expect(model.servers).toEqual(['/api']);
    expect(model.auth).toEqual([
      { id: 'basicAuth', type: 'http', scheme: 'basic' },
      { id: 'oauth', type: 'oauth2', flows: ['authorizationCode'], scopes: ['notes:read'] },
    ]);
  });

  it('resolves $ref params and responses, applies path-level body params and per-op produces', () => {
    expect(inputNames(byId(ops, 'listNotes'))).toEqual(['query:limit', 'query:tag']);
    expect(byId(ops, 'listNotes').inputs[1]!.schema).toEqual({ type: 'array', items: { type: 'string', enum: ['a', 'b'] } });
    expect(model.warnings.map((w) => `${w.code} ${w.pointer}`)).toEqual(['missing-ref #/paths/~1notes/get/parameters/2']);
    const replace = byId(ops, 'replaceNote');
    expect(replace.requestBody).toEqual({ contentType: 'application/json', schema: { ref: 'Note' } });
    expect(inputNames(replace)).toEqual(['path:id!', 'body:id!', 'body:parent', 'body:tags']);
    expect(replace.security).toEqual([['oauth']]);
    expect(byId(ops, 'getNote').output).toEqual({ status: '200', contentType: 'application/xml', schema: { ref: 'Note' } });
    expect(byId(ops, 'getNote').security).toEqual([['basicAuth']]);
    expect(byId(ops, 'getNote').responses.map((r) => r.status)).toEqual(['200', 'default']);
  });
});
