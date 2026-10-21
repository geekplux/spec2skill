import { describe, expect, it } from 'vitest';
import filesystem from '../../samples/mcp-filesystem.tools-list.json';
import petstore from '../../samples/petstore-swagger2.json';
import tasksText from '../../samples/tasks-openapi31.yaml?raw';
import { normalise } from '../model/normalise';
import asyncapiText from './__fixtures__/asyncapi.yaml?raw';
import { detect } from './detect';
import { parseText } from './text';

function found(doc: unknown): string {
  const d = detect(doc);
  return d.kind === 'unsupported' ? d.message : `supported: ${d.kind}`;
}

describe('detect', () => {
  it('recognises the five supported shapes', () => {
    expect(detect(parseText(tasksText).value)).toEqual({ kind: 'openapi3', version: '3.1.0' });
    expect(detect({ openapi: '3.0.3' })).toEqual({ kind: 'openapi3', version: '3.0.3' });
    expect(detect(petstore)).toEqual({ kind: 'swagger2', version: '2.0' });
    expect(detect(filesystem)).toEqual({ kind: 'mcp', shape: 'result' });
    expect(detect({ jsonrpc: '2.0', id: 1, result: filesystem })).toEqual({ kind: 'mcp', shape: 'jsonrpc' });
    expect(detect(filesystem.tools)).toEqual({ kind: 'mcp', shape: 'tools-array' });
  });

  it('names what it found when it is not supported', () => {
    expect(found(parseText(asyncapiText).value)).toMatch(/^This looks like an AsyncAPI 3\.0\.0 document; AsyncAPI .* not supported\. spec2skill reads/);
    expect(found({ hello: 'world', items: [1, 2] })).toBe(
      'This looks like JSON with the top-level keys "hello", "items" but no "openapi", "swagger" or "tools" key. spec2skill reads OpenAPI 3.0/3.1, Swagger 2.0 and MCP tools/list responses.',
    );
    expect(found({ openapi: '4.0.0' })).toMatch(/OpenAPI 4\.0\.0, which is not supported/);
    expect(found({ swaggerVersion: '1.2' })).toMatch(/Swagger 1\.2, which is not supported/);
    expect(found({ jsonrpc: '2.0', id: 1, error: { message: 'Unauthorized' } })).toMatch(/JSON-RPC error response: "Unauthorized"/);
    expect(found({ jsonrpc: '2.0', id: 1, result: { serverInfo: {} } })).toMatch(/without a tools\/list result/);
    expect(found({ data: { __schema: {} } })).toMatch(/GraphQL/);
    expect(found([1, 2])).toMatch(/JSON array that is not a list of MCP tools/);
    expect(found([])).toMatch(/empty JSON array/);
    expect(found({})).toMatch(/empty JSON object/);
    expect(found({ tools: 'x' })).toBe(
      'This looks like an object whose "tools" is not an array (an MCP tools/list result needs "tools": [...]). spec2skill reads OpenAPI 3.0/3.1, Swagger 2.0 and MCP tools/list responses.',
    );
  });

  it('normalise() dispatches by kind and rejects unsupported documents', async () => {
    expect((await normalise(petstore)).source.kind).toBe('swagger2');
    expect((await normalise(filesystem.tools)).operations).toHaveLength(14);
    await expect(normalise(parseText(asyncapiText).value)).rejects.toThrow(/AsyncAPI/);
  });
});
