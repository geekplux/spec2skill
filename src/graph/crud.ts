// CRUD role of every operation (relationship rule 2 in docs/ARCHITECTURE.md): HTTP method + path shape, or the MCP verb prefix.
import type { ApiModel, Crud, Operation, SchemaNode, SchemaRef } from '../model/types';
import { VERBS, words } from './words';

export const CRUD_ORDER: readonly Crud[] = ['list', 'create', 'read', 'update', 'delete', 'action'];
export const CRUD_LETTER: Record<Crud, string> = { list: 'L', create: 'C', read: 'R', update: 'U', delete: 'D', action: 'A' };

/** The path addresses one item: its last segment is a parameter (`/pets/{id}`). */
export const isItemPath = (path: string): boolean => /\/\{[^/]*\}\/?$/.test(path);

/** An array, or an object with an array field (a page such as `{data: Task[], nextCursor}`). */
function isListOutput(schema: SchemaRef | undefined, schemas: Record<string, SchemaNode>): boolean {
  if (!schema) return false;
  if (schema.items || schema.type === 'array') return true;
  const fields = schema.ref ? schemas[schema.ref]?.fields : schema.fields;
  return (fields ?? []).some((field) => field.type === 'array' || field.items !== undefined);
}

function toolCrud(op: Operation): Crud {
  const verb = VERBS.get(words(op.id)[0] ?? '');
  if (op.hints.readOnly) return verb === 'list' ? 'list' : 'read';
  return verb ?? 'action';
}

function httpCrud(op: Operation, path: string, gets: Set<string>, schemas: Record<string, SchemaNode>): Crud {
  const item = isItemPath(path);
  const body = op.requestBody?.schema;
  switch (op.method) {
    case 'get':
      if (item) return 'read';
      if (op.pagination || isListOutput(op.output?.schema, schemas)) return 'list';
      return op.output?.schema.ref || op.output?.schema.fields ? 'read' : 'action';
    case 'post':
      // A collection that can also be listed, or a body that is a named resource (or many).
      return !item && (gets.has(path) || body?.ref || body?.items?.ref) ? 'create' : 'action';
    case 'put':
    case 'patch':
      return 'update';
    case 'delete':
      return 'delete';
    default:
      return 'action';
  }
}

export function classifyCrud(model: ApiModel): Record<string, Crud> {
  const gets = new Set(model.operations.filter((op) => op.method === 'get').map((op) => op.path!));
  // fromEntries defines own properties, so an operation named `__proto__` stays data.
  return Object.fromEntries(
    model.operations.map((op) => [op.id, op.path && op.method ? httpCrud(op, op.path, gets, model.schemas) : toolCrud(op)]),
  );
}
