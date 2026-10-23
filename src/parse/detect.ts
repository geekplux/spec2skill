// What kind of API document is this? Decided by shape only (never by URL or file name),
// so the same text detects the same wherever it came from.
import { cleanName, isRecord } from '../model/util';

export type Detection =
  | { kind: 'openapi3'; version: string }
  | { kind: 'swagger2'; version: '2.0' }
  | { kind: 'mcp'; shape: 'result' | 'jsonrpc' | 'tools-array' }
  /** `found` names what the document looks like; `message` is a full sentence for the user. */
  | { kind: 'unsupported'; found: string; message: string };

const SUPPORTED = 'spec2skill reads OpenAPI 3.0/3.1, Swagger 2.0 and MCP tools/list responses.';

function unsupported(found: string, why = ''): Detection {
  return { kind: 'unsupported', found, message: `This looks like ${found}${why}. ${SUPPORTED}` };
}

function versionOf(value: unknown): string {
  return cleanName(typeof value === 'number' ? String(value) : value, 20) ?? '(no version)';
}

function isToolLike(value: unknown): boolean {
  return isRecord(value) && typeof value.name === 'string' && isRecord(value.inputSchema);
}

export function detect(doc: unknown): Detection {
  if (Array.isArray(doc)) {
    if (doc.length > 0 && doc.every(isToolLike)) return { kind: 'mcp', shape: 'tools-array' };
    return unsupported(doc.length === 0 ? 'an empty JSON array' : 'a JSON array', ' that is not a list of MCP tools (each needs "name" and "inputSchema")');
  }
  if (!isRecord(doc)) return unsupported('a value that is not a JSON object');
  if ('openapi' in doc) {
    const version = versionOf(doc.openapi);
    return /^3\.[01](\.|$)/.test(version) ? { kind: 'openapi3', version } : unsupported(`OpenAPI ${version}`, ', which is not supported (3.0 and 3.1 are)');
  }
  if ('swagger' in doc || 'swaggerVersion' in doc) {
    const version = versionOf(doc.swagger ?? doc.swaggerVersion);
    return version === '2.0' ? { kind: 'swagger2', version } : unsupported(`Swagger ${version}`, ', which is not supported (2.0 is)');
  }
  if ('asyncapi' in doc) {
    return unsupported(`an AsyncAPI ${versionOf(doc.asyncapi)} document`, '; AsyncAPI (event-driven APIs) is not supported');
  }
  if (doc.jsonrpc === '2.0') {
    if (isRecord(doc.result) && Array.isArray(doc.result.tools)) return { kind: 'mcp', shape: 'jsonrpc' };
    if (isRecord(doc.error)) return unsupported('a JSON-RPC error response', `: "${cleanName(doc.error.message, 200) ?? 'no message'}"`);
    return unsupported('a JSON-RPC response', ' without a tools/list result');
  }
  if (Array.isArray(doc.tools)) return { kind: 'mcp', shape: 'result' };
  if ('tools' in doc) {
    return unsupported('an object whose "tools" is not an array', ' (an MCP tools/list result needs "tools": [...])');
  }
  if ('__schema' in doc || (isRecord(doc.data) && '__schema' in doc.data)) {
    return unsupported('a GraphQL introspection result', '; GraphQL is not supported');
  }
  if (isRecord(doc.info) && typeof doc.info.schema === 'string' && doc.info.schema.includes('getpostman.com')) {
    return unsupported('a Postman collection', ', which is not supported');
  }
  const keys = Object.keys(doc);
  if (keys.length === 0) return unsupported('an empty JSON object');
  const shown = keys.slice(0, 5).map((k) => `"${cleanName(k, 40) ?? '?'}"`).join(', ');
  return unsupported(`JSON with the top-level keys ${shown}${keys.length > 5 ? ', ...' : ''}`, ' but no "openapi", "swagger" or "tools" key');
}
