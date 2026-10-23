import { describe, expect, it } from 'vitest';
import filesystem from '../../samples/mcp-filesystem.tools-list.json';
import edge from './__fixtures__/mcp-edge.json';
import { buildMcp, normaliseMcp } from './mcp';
import type { Operation } from './types';

const byId = (ops: Operation[], id: string) => ops.find((op) => op.id === id)!;
const inputNames = (op: Operation) => op.inputs.map((p) => `${p.name}${p.required ? '!' : ''}`);

describe('normaliseMcp: filesystem sample', async () => {
  const model = await normaliseMcp(filesystem, { serverInfo: { name: 'secure-filesystem-server', version: '2.0.0' }, protocolVersion: '2025-06-18' });
  const ops = model.operations;

  it('reads all 14 tools in server order', () => {
    expect(model.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(model.source).toEqual({
      kind: 'mcp', specVersion: '2025-06-18', title: 'secure-filesystem-server', version: '2.0.0',
      serverInfo: { name: 'secure-filesystem-server', version: '2.0.0' },
    });
    expect(ops).toHaveLength(14);
    expect(ops.slice(0, 3).map((op) => op.id)).toEqual(['read_file', 'read_text_file', 'read_media_file']);
    expect(ops.every((op) => op.kind === 'tool' && op.inputs.every((p) => p.in === 'argument'))).toBe(true);
    expect(model.warnings).toEqual([]);
  });

  it('maps titles, deprecation and annotations', () => {
    expect(byId(ops, 'read_file').deprecated).toBe(true);
    expect(ops.filter((op) => op.deprecated).map((op) => op.id)).toEqual(['read_file']);
    expect(byId(ops, 'read_text_file')).toMatchObject({ title: 'Read Text File', hints: { readOnly: true, openWorld: false } });
    for (const id of ['write_file', 'edit_file', 'move_file']) expect(byId(ops, id).hints.readOnly).toBe(false);
    expect(byId(ops, 'write_file').hints).toEqual({ readOnly: false, destructive: true, idempotent: true, openWorld: false });
  });

  it('turns inputSchema properties into arguments and keeps the outputSchema', () => {
    expect(inputNames(byId(ops, 'edit_file'))).toEqual(['dryRun', 'edits!', 'path!']);
    expect(byId(ops, 'edit_file').inputs[1]!.schema).toMatchObject({ type: 'array', items: { type: 'object' } });
    expect(inputNames(byId(ops, 'move_file'))).toEqual(['destination!', 'source!']);
    expect(byId(ops, 'list_allowed_directories').inputs).toEqual([]);
    expect(byId(ops, 'read_text_file').output!.schema.fields!.map((f) => f.name)).toEqual(['content']);
  });
});

describe('normaliseMcp: shapes and hostile input', () => {
  it('accepts a JSON-RPC response and a bare array with the same result', async () => {
    const tools = edge.result.tools;
    const fromRpc = await normaliseMcp(edge);
    expect(await normaliseMcp({ tools })).toEqual(fromRpc);
    expect(await normaliseMcp(tools)).toEqual(fromRpc);
  });

  it('inlines tool-local refs, survives cycles, skips nameless tools and suffixes duplicates', () => {
    const model = buildMcp(edge);
    expect(model.operations.map((op) => op.id)).toEqual(['create_note', 'loop', 'create_note_2']);
    const create = model.operations[0]!;
    expect(create).toMatchObject({ title: 'Create note', description: 'Creates a note.', hints: { readOnly: false, destructive: false } });
    expect(create.inputs).toEqual([
      { name: 'folder', in: 'argument', required: false, schema: { type: 'string', nullable: true }, description: 'Folder path' },
      { name: 'note', in: 'argument', required: true, schema: { type: 'object' } },
    ]);
    expect(create.output!.schema.fields).toEqual([{ name: 'id', required: true, type: 'string' }]);
    expect(model.operations[1]!.inputs).toEqual([]);
    expect(model.operations[2]!.deprecated).toBe(true);
    expect(model.warnings.map((w) => `${w.code} ${w.pointer}`)).toEqual([
      'cyclic-ref #/tools/1/inputSchema', 'invalid-tool #/tools/2', 'duplicate-operation-id #/tools/3',
    ]);
  });

  it('rejects JSON-RPC errors and documents without tools', () => {
    expect(() => buildMcp({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } })).toThrow(/error: Method not found/);
    expect(() => buildMcp({ openapi: '3.1.0' })).toThrow(/no `tools` array/);
  });
});
