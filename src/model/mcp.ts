// MCP `tools/list` -> ApiModel. Accepts the result object (`{ tools, nextCursor? }`), a full
// JSON-RPC response (`{ jsonrpc, id, result }`) or a bare tools array; tool order is kept.
// Each tool's inputSchema/outputSchema is its own JSON Schema document: local `$ref`s
// (`#/$defs/...`, `#/properties/...`) resolve against it and are inlined, cycle-safe and
// budgeted per tool. There are no named schemas. Annotations are copied only when set
// (they are hints from an untrusted server, and "unknown" is not "false").
import { RefResolver } from '../parse/ref';
import { ParseError } from '../parse/text';
import { hashModel } from './hash';
import { type Ctx, toSchemaRef } from './openapi3';
import type { ApiModel, ApiModelBody, Operation, Param, SchemaRef, Warning } from './types';
import { cleanName, cleanText, isRecord } from './util';

export const MAX_TOOLS = 1000;
const NODES_PER_SCHEMA = 5000;
const HINTS = [
  ['readOnlyHint', 'readOnly'],
  ['destructiveHint', 'destructive'],
  ['idempotentHint', 'idempotent'],
  ['openWorldHint', 'openWorld'],
] as const;

export interface McpOptions {
  url?: string;
  /** From the `initialize` result, when known. */
  serverInfo?: { name: string; version: string; title?: string };
  protocolVersion?: string;
}

function toolsOf(doc: unknown): unknown[] {
  if (Array.isArray(doc)) return doc;
  if (isRecord(doc) && doc.jsonrpc === '2.0' && isRecord(doc.error)) {
    throw new ParseError('unsupported', `The JSON-RPC response is an error: ${cleanName(doc.error.message) ?? 'no message'}`);
  }
  const result = isRecord(doc) && doc.jsonrpc === '2.0' ? doc.result : doc;
  if (isRecord(result) && Array.isArray(result.tools)) return result.tools;
  throw new ParseError('unsupported', 'Not an MCP tools/list result (no `tools` array).');
}

/** Converts one tool-local schema document; its warnings get the tool's pointer. */
function schemaOf(raw: unknown, pointer: string, warnings: Warning[]): SchemaRef {
  const ctx: Ctx = { r: new RefResolver(raw, { maxNodes: NODES_PER_SCHEMA }), schemaNames: new Set(), schemaPrefix: '' };
  const schema = toSchemaRef(raw, ctx);
  for (const w of ctx.r.warnings) warnings.push({ ...w, pointer: w.pointer ?? pointer });
  return schema;
}

function isDeprecated(tool: Record<string, unknown>, title: string, description = ''): boolean {
  // oxlint-disable-next-line no-underscore-dangle -- `_meta` is MCP's own field name
  if ([tool.annotations, tool._meta].some((o) => isRecord(o) && o.deprecated === true)) return true;
  return /\(deprecated\)|^\W*deprecated\b/i.test(title) || /^\W*deprecated\b/i.test(description) || /\bDEPRECATED\b/.test(description);
}

export function buildMcp(doc: unknown, { url, serverInfo, protocolVersion }: McpOptions = {}): ApiModelBody {
  const tools = toolsOf(doc);
  const warnings: Warning[] = [];
  if (tools.length > MAX_TOOLS) {
    warnings.push({ code: 'budget-exceeded', message: `Only the first ${MAX_TOOLS} of ${tools.length} tools are shown.` });
  }
  const operations: Operation[] = [];
  const used = new Set<string>();
  tools.slice(0, MAX_TOOLS).forEach((tool, i) => {
    const pointer = `#/tools/${i}`;
    let id = isRecord(tool) ? cleanName(tool.name, 128) : undefined;
    if (!isRecord(tool) || !id) {
      warnings.push({ code: 'invalid-tool', message: 'A tool without a name was skipped.', pointer });
      return;
    }
    if (used.has(id)) {
      warnings.push({ code: 'duplicate-operation-id', message: `Tool name "${id}" is used more than once; later uses get a suffix.`, pointer });
      let n = 2;
      while (used.has(`${id}_${n}`)) n++;
      id = `${id}_${n}`;
    }
    used.add(id);

    const annotations = isRecord(tool.annotations) ? tool.annotations : {};
    const title = cleanName(tool.title) ?? cleanName(annotations.title) ?? id;
    const description = cleanText(tool.description);
    const input = schemaOf(tool.inputSchema, `${pointer}/inputSchema`, warnings);
    const inputs = (input.fields ?? []).map(({ name, required, description: about, ...schema }): Param => ({
      name,
      in: 'argument',
      required,
      schema,
      ...(about && { description: about }),
    }));
    const hints: Operation['hints'] = {};
    for (const [from, to] of HINTS) if (typeof annotations[from] === 'boolean') hints[to] = annotations[from];
    operations.push({
      id,
      kind: 'tool',
      title,
      ...(description && { description }),
      tags: [],
      inputs,
      ...(isRecord(tool.outputSchema) && { output: { schema: schemaOf(tool.outputSchema, `${pointer}/outputSchema`, warnings) } }),
      responses: [],
      security: [],
      hints,
      ...(isDeprecated(tool, title, description) && { deprecated: true }),
    });
  });

  const name = cleanName(serverInfo?.name, 200);
  const version = cleanName(serverInfo?.version, 50);
  const title = cleanName(serverInfo?.title) ?? name ?? 'MCP server';
  return {
    source: {
      kind: 'mcp',
      specVersion: cleanName(protocolVersion, 20) ?? 'unknown',
      ...(url && { url }),
      title,
      ...(version && { version }),
      ...(name && { serverInfo: { name, version: version ?? '' } }),
    },
    servers: [],
    auth: [],
    operations,
    schemas: {},
    warnings: warnings.slice(0, 200),
  };
}

export async function normaliseMcp(doc: unknown, options: McpOptions = {}): Promise<ApiModel> {
  const body = buildMcp(doc, options);
  return { hash: await hashModel(body), ...body };
}
