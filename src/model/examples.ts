// Ready-to-paste examples for one operation (F10): curl for HTTP endpoints, a JSON-RPC
// `tools/call` body for MCP tools; plus the short type names the detail panel shows. Pure.
import type { ApiModel, Operation, Param, SchemaField, SchemaRef } from './types';

export const typeLabel = (s: SchemaRef | undefined): string => {
  if (!s) return 'any';
  if (s.ref) return s.ref;
  if (s.type === 'array') return `${typeLabel(s.items)}[]`;
  if (s.variants?.length) return s.variants.map(typeLabel).join(' | ');
  return (s.type ?? 'any') + (s.format ? ` (${s.format})` : '');
};

/** The output's fields: the named schema's, or its items' for arrays. */
export function outputFields(model: ApiModel, s: SchemaRef | undefined): SchemaField[] {
  const own = s?.ref ? model.schemas[s.ref] : s;
  const items = own?.items?.ref ? model.schemas[own.items.ref] : own?.items;
  return own?.fields ?? items?.fields ?? [];
}

/** A placeholder of the right JSON type: the first enum value, 0, false, [], {} or "<name>". */
function placeholder(p: Param): unknown {
  if (p.schema.enum?.length) return p.schema.enum[0];
  const t = p.schema.type ?? (p.schema.ref ? 'object' : 'string');
  return t === 'integer' || t === 'number' ? 0 : t === 'boolean' ? false : t === 'array' ? [] : t === 'object' ? {} : `<${p.name}>`;
}

/** The required ones, or all of them when none is required. */
const pick = (ps: Param[]) => (ps.some((p) => p.required) ? ps.filter((p) => p.required) : ps);
/** Placeholder arguments: the required ones, or all of them when none is required. */
export const exampleArgs = (ps: Param[]) => Object.fromEntries(pick(ps).map((p) => [p.name, placeholder(p)]));
/** POSIX single quotes: spec text can never break out of them. */
const sq = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;
/** curl -F reads a file for `name=@path`. */
const file = (p: Param) => (p.schema.type === 'file' || p.schema.format === 'binary' ? '@' : '');
/** Spec-provided names used inside double quotes keep only token characters. */
const token = (s = '') => s.replace(/[^\w-]/g, '');

/** `TASKS_API` from "Tasks API": the prefix of the environment variable holding the credential. */
export const envName = (model: ApiModel): string =>
  model.source.title.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'API';

/** curl flags for the operation's first security requirement, reading secrets from the environment. */
function authFlags(model: ApiModel, op: Operation): string[] {
  const env = envName(model);
  return (op.security[0] ?? []).flatMap((id) => {
    const s = model.auth.find((a) => a.id === id);
    if (s?.type === 'http' && s.scheme === 'basic') return [`-u "$${env}_USER:$${env}_PASSWORD"`];
    if (s?.type === 'http' || s?.type === 'oauth2' || s?.type === 'openIdConnect') return [`-H "Authorization: Bearer $${env}_TOKEN"`];
    if (s?.type !== 'apiKey') return [];
    const flag = { header: `-H "${token(s.name)}: `, query: `--url-query "${token(s.name)}=`, cookie: `-b "${token(s.name)}=` }[s.in ?? 'header'];
    return [`${flag}$${env}_API_KEY"`];
  });
}

export function curlExample(model: ApiModel, op: Operation): string {
  const base = (model.servers[0] ?? 'https://api.example.com').replace(/\/+$/, '');
  const path = (op.path ?? '/').replace(/\{([^}]+)\}/g, '<$1>');
  const query = op.inputs.filter((p) => p.in === 'query' && p.required).map((p) => `${p.name}=<${p.name}>`);
  const url = base + path + (query.length ? `?${query.join('&')}` : '');
  const lines = [`curl${op.method === 'get' ? '' : ` -X ${op.method!.toUpperCase()}`} ${sq(url)}`, ...authFlags(model, op)];
  for (const p of op.inputs) if (p.in === 'header' && p.required) lines.push(`-H ${sq(`${p.name}: <${p.name}>`)}`);
  const body = op.inputs.filter((p) => p.in === 'body');
  const type = op.requestBody?.contentType ?? '';
  if (type.includes('multipart')) lines.push(...pick(body).map((p) => `-F ${sq(`${p.name}=${file(p)}<${p.name}>`)}`));
  else if (type.includes('urlencoded')) lines.push(...pick(body).map((p) => `--data-urlencode ${sq(`${p.name}=<${p.name}>`)}`));
  else if (op.requestBody) lines.push(`-H ${sq(`Content-Type: ${type}`)}`, `-d ${sq(JSON.stringify(exampleArgs(body), null, 2))}`);
  return lines.join(' \\\n  ');
}

export const toolCallExample = (op: Operation): string =>
  JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: op.id, arguments: exampleArgs(op.inputs) } }, null, 2);

export const example = (model: ApiModel, op: Operation): string => (op.kind === 'tool' ? toolCallExample(op) : curlExample(model, op));
