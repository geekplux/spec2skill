// OpenAPI 3.0 / 3.1 document -> ApiModel. Pure and deterministic: operations are sorted by
// path then method, object-derived lists by name, so key order never changes the model.
// JSON Schema 2020-12 support is shallow by design: type arrays and `null` alternatives
// become `nullable`, `const` becomes a one-value enum, `prefixItems[0]` stands in for
// `items`, allOf members are merged; `$defs`, conditionals and `not` are ignored.
import { ParseError } from '../parse/text';
import { RefResolver, encodePointer } from '../parse/ref';
import { hashModel } from './hash';
import type { ApiModel, ApiModelBody, AuthScheme, HttpMethod, Operation, Param, SchemaField, SchemaNode, SchemaRef } from './types';
import { cleanName, cleanText, isRecord } from './util';

// Read, create, replace, update, delete, then the rest: the order operations are listed in per path.
const METHODS: readonly HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
const PARAM_IN = new Set(['path', 'query', 'header', 'cookie']);
const SCHEMA_PREFIX = '#/components/schemas/';
const MAX_FIELDS = 200;
const MAX_ENUM = 50;
const MAX_VARIANTS = 20;
const MAX_DEPTH = 64;

const CURSOR_PARAMS = new Set(['cursor', 'after', 'before', 'pagetoken', 'page_token', 'starting_after', 'ending_before', 'continuation', 'next']);
const CURSOR_FIELDS = new Set(['nextcursor', 'next_cursor', 'nextpagetoken', 'next_page_token', 'cursor']);
const LIMIT_PARAMS = new Set(['limit', 'per_page', 'perpage', 'page_size', 'pagesize', 'size', 'max_results', 'maxresults', 'first']);

type Ctx = { r: RefResolver; schemaNames: Set<string> };

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

// ---- schemas ----------------------------------------------------------------------

/** Named component schema for a ref, or undefined if the ref points elsewhere. */
function componentName(ref: string, ctx: Ctx): string | undefined {
  if (!ref.startsWith(SCHEMA_PREFIX)) return undefined;
  const name = ref.slice(SCHEMA_PREFIX.length).replace(/~1/g, '/').replace(/~0/g, '~');
  return !name.includes('/') && ctx.schemaNames.has(name) ? name : undefined;
}

function typeOf(raw: Record<string, unknown>): { type?: string; nullable?: boolean } {
  const types = (Array.isArray(raw.type) ? raw.type : [raw.type]).filter((t): t is string => typeof t === 'string');
  const nullable = raw.nullable === true || types.includes('null');
  const rest = types.filter((t) => t !== 'null');
  const type = rest.length > 0 ? rest.join('|').slice(0, 50) : isRecord(raw.properties) || Array.isArray(raw.allOf) ? 'object' : undefined;
  return { ...(type && { type }), ...(nullable && { nullable }) };
}

/** Merges allOf members (cycle-safe via `stack`) into one property/required set. */
function collectObject(raw: Record<string, unknown>, ctx: Ctx, stack: Set<object>, depth: number, props: Map<string, unknown>, required: Set<string>) {
  if (stack.has(raw) || depth > MAX_DEPTH || !ctx.r.spend()) return;
  stack.add(raw);
  for (const member of Array.isArray(raw.allOf) ? raw.allOf : []) {
    const { value } = ctx.r.deref(member);
    if (isRecord(value)) collectObject(value, ctx, stack, depth + 1, props, required);
  }
  if (isRecord(raw.properties)) for (const [k, v] of Object.entries(raw.properties)) props.set(k, v);
  if (Array.isArray(raw.required)) for (const k of raw.required) if (typeof k === 'string') required.add(k);
  stack.delete(raw);
}

/**
 * Converts a raw schema. `full` includes object fields (top level and array items);
 * fields themselves are shallow. Component refs become `{ ref: name }` and are not followed.
 */
function toSchemaRef(raw: unknown, ctx: Ctx, full = true, depth = 0, stack = new Set<object>()): SchemaRef {
  if (!isRecord(raw) || depth > MAX_DEPTH || !ctx.r.spend()) return {};
  const ref = str(raw.$ref);
  if (ref !== undefined) {
    const name = componentName(ref, ctx);
    if (name) return { ref: name };
    const { value } = ctx.r.deref(raw);
    if (value === undefined) return { ref: ref.slice(0, 200), unresolved: true };
    if (isRecord(value) && stack.has(value)) {
      ctx.r.warn('cyclic-ref', `$ref "${ref.slice(0, 200)}" refers back to itself.`);
      return {};
    }
    if (isRecord(value)) stack.add(value);
    const out = toSchemaRef(value, ctx, full, depth + 1, stack);
    if (isRecord(value)) stack.delete(value);
    return out;
  }

  const allOf = Array.isArray(raw.allOf) ? raw.allOf : [];
  if (allOf.length === 1 && !isRecord(raw.properties) && isRecord(allOf[0]) && typeof allOf[0].$ref === 'string') {
    const out = toSchemaRef(allOf[0], ctx, full, depth + 1, stack); // `allOf: [$ref]` wrapper
    return raw.nullable === true ? { ...out, nullable: true } : out;
  }

  const out: SchemaRef = typeOf(raw);
  const format = str(raw.format);
  if (format) out.format = format.slice(0, 50);
  const enumValues = 'const' in raw ? [raw.const] : Array.isArray(raw.enum) ? raw.enum : undefined;
  if (enumValues) {
    const values = enumValues.filter((v) => v === null || ['string', 'number', 'boolean'].includes(typeof v));
    out.enum = values.slice(0, MAX_ENUM).map((v) => (typeof v === 'string' ? v.slice(0, 200) : v));
  }

  const alternatives = [raw.oneOf, raw.anyOf].find(Array.isArray) ?? [];
  const nonNull = alternatives.filter((alt) => !(isRecord(alt) && (alt.type === 'null' || ('const' in alt && alt.const === null))));
  if (nonNull.length < alternatives.length) out.nullable = true;
  if (nonNull.length === 1 && out.type === undefined) {
    return { ...toSchemaRef(nonNull[0], ctx, full, depth + 1, stack), ...(out.nullable && { nullable: true }) };
  }
  if (nonNull.length > 1) out.variants = nonNull.slice(0, MAX_VARIANTS).map((alt) => toSchemaRef(alt, ctx, false, depth + 1, stack));

  const items = raw.items ?? (Array.isArray(raw.prefixItems) ? raw.prefixItems[0] : undefined);
  if (items !== undefined) {
    out.type ??= 'array';
    out.items = toSchemaRef(items, ctx, full, depth + 1, stack);
  }

  if (full && out.type === 'object') {
    const props = new Map<string, unknown>();
    const required = new Set<string>();
    collectObject(raw, ctx, stack, depth, props, required);
    if (props.size > 0) {
      out.fields = [...props.keys()]
        .toSorted()
        .slice(0, MAX_FIELDS)
        .map((key): SchemaField => {
          const field = toSchemaRef(props.get(key), ctx, false, depth + 1, stack);
          const prop = props.get(key);
          const description = isRecord(prop) ? cleanText(prop.description, 500) : undefined;
          return { name: cleanName(key) ?? '?', required: required.has(key), ...field, ...(description && { description }) };
        });
    }
  }
  return out;
}

/** The object behind a schema (following refs and allOf), for flattening request bodies. */
function objectFields(raw: unknown, ctx: Ctx): SchemaField[] | undefined {
  const { value } = ctx.r.deref(raw);
  if (!isRecord(value)) return undefined;
  if (value.type === undefined && !isRecord(value.properties) && !Array.isArray(value.allOf)) return undefined;
  return toSchemaRef({ ...value, type: 'object' }, ctx).fields;
}

// ---- operations -------------------------------------------------------------------

function pickContent(content: unknown): { contentType: string; schema: unknown } | undefined {
  if (!isRecord(content)) return undefined;
  const types = Object.keys(content).toSorted();
  const contentType =
    types.find((t) => t === 'application/json') ?? types.find((t) => /[/+]json\b/.test(t)) ?? types[0];
  if (contentType === undefined) return undefined;
  const media = content[contentType];
  return { contentType: contentType.slice(0, 100), schema: isRecord(media) ? media.schema : undefined };
}

function toParam(raw: unknown, ctx: Ctx, pointer: string): Param | undefined {
  const { value } = ctx.r.deref(raw, pointer);
  if (!isRecord(value)) return undefined;
  const name = cleanName(value.name);
  const where = str(value.in);
  if (!name || !where || !PARAM_IN.has(where)) {
    ctx.r.warn('invalid-parameter', 'A parameter without a valid name or location was skipped.', pointer);
    return undefined;
  }
  const schema = value.schema ?? pickContent(value.content)?.schema;
  const description = cleanText(value.description, 500);
  return {
    name,
    in: where as Param['in'],
    required: where === 'path' || value.required === true,
    schema: toSchemaRef(schema, ctx),
    ...(description && { description }),
  };
}

function statusOrder(status: string): number {
  if (status === 'default') return 1000;
  if (/^[1-5]\d\d$/.test(status)) return Number(status);
  return /^[1-5]XX$/i.test(status) ? Number(status[0]) * 100 + 99 : 999;
}

function pathSlug(path: string): string {
  return path.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'root';
}

function detectPagination(op: Operation, schemas: Record<string, SchemaNode>): Operation['pagination'] {
  const query = op.inputs.filter((p) => p.in === 'query');
  const named = (set: Set<string>) => query.filter((p) => set.has(p.name.toLowerCase())).map((p) => p.name);
  const limits = named(LIMIT_PARAMS);
  const cursors = named(CURSOR_PARAMS);
  const out = op.output?.schema;
  const outFields = (out?.ref ? schemas[out.ref]?.fields : out?.fields) ?? [];
  const cursorOut = outFields.some((f) => CURSOR_FIELDS.has(f.name.toLowerCase()));
  if (cursors.length > 0 || (cursorOut && limits.length > 0)) return { style: 'cursor', params: [...cursors, ...limits] };
  const offset = named(new Set(['offset', 'skip']));
  if (offset.length > 0) return { style: 'offset', params: [...offset, ...limits] };
  const page = named(new Set(['page', 'page_number', 'pagenumber']));
  if (page.length > 0) return { style: 'page', params: [...page, ...limits] };
  return undefined;
}

function toSecurity(raw: unknown, ctx: Ctx, known: Set<string>, pointer: string): string[][] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((req) => {
    const ids = Object.keys(req).toSorted();
    for (const id of ids) {
      if (!known.has(id)) ctx.r.warn('unknown-security-scheme', `Security scheme "${id.slice(0, 100)}" is not defined.`, pointer);
    }
    return ids;
  });
}

function toAuth(raw: unknown, ctx: Ctx): AuthScheme[] {
  if (!isRecord(raw)) return [];
  const out: AuthScheme[] = [];
  for (const key of Object.keys(raw).toSorted()) {
    const { value } = ctx.r.deref(raw[key]);
    const id = cleanName(key, 100);
    if (!isRecord(value) || !id) continue;
    const type = str(value.type);
    const scheme: AuthScheme = {
      id,
      type: type === 'apiKey' || type === 'http' || type === 'oauth2' || type === 'openIdConnect' || type === 'mutualTLS' ? type : 'none',
    };
    if (type === 'http' && str(value.scheme)) scheme.scheme = str(value.scheme)!.toLowerCase().slice(0, 50);
    if (type === 'http' && str(value.bearerFormat)) scheme.bearerFormat = str(value.bearerFormat)!.slice(0, 50);
    if (type === 'apiKey') {
      const where = str(value.in);
      if (where === 'header' || where === 'query' || where === 'cookie') scheme.in = where;
      const name = cleanName(value.name, 100);
      if (name) scheme.name = name;
    }
    if (type === 'oauth2' && isRecord(value.flows)) {
      const flows = value.flows;
      scheme.flows = Object.keys(flows).toSorted();
      const scopes = new Set<string>();
      for (const flow of Object.values(flows)) if (isRecord(flow) && isRecord(flow.scopes)) for (const s of Object.keys(flow.scopes)) scopes.add(s.slice(0, 100));
      scheme.scopes = [...scopes].toSorted();
    }
    const description = cleanText(value.description, 500);
    if (description) scheme.description = description;
    out.push(scheme);
  }
  return out;
}

/** Server URLs with variables set to their defaults. Relative URLs stay relative (resolve against
 * `source.url` when needed), so the model and its hash do not depend on where the spec came from. */
function toServers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const server of raw) {
    if (!isRecord(server) || typeof server.url !== 'string') continue;
    const vars = isRecord(server.variables) ? server.variables : {};
    const url = server.url.replace(/\{([^}]+)\}/g, (whole, name: string) => {
      const v = vars[name];
      return isRecord(v) && typeof v.default === 'string' ? v.default : whole;
    });
    const clean = cleanName(url, 500);
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

// ---- document ---------------------------------------------------------------------

export function buildOpenApi3(doc: unknown, { url }: { url?: string } = {}): ApiModelBody {
  if (!isRecord(doc) || typeof doc.openapi !== 'string' || !/^3\.\d+/.test(doc.openapi)) {
    throw new ParseError('unsupported', 'Not an OpenAPI 3.x document (missing `openapi: 3.x`).');
  }
  const r = new RefResolver(doc);
  const components = isRecord(doc.components) ? doc.components : {};
  const rawSchemas = isRecord(components.schemas) ? components.schemas : {};
  const ctx: Ctx = { r, schemaNames: new Set(Object.keys(rawSchemas)) };

  const auth = toAuth(components.securitySchemes, ctx);
  const known = new Set(auth.map((a) => a.id));
  const globalSecurity = toSecurity(doc.security, ctx, known, '#/security');

  const operations: Operation[] = [];
  const usedIds = new Set<string>();
  let derivedIds = 0;
  const paths = isRecord(doc.paths) ? doc.paths : {};
  for (const path of Object.keys(paths).toSorted()) {
    const itemPointer = encodePointer(['paths', path]);
    const { value: item } = r.deref(paths[path], itemPointer);
    if (!isRecord(item)) continue;
    const shared = Array.isArray(item.parameters) ? item.parameters : [];
    for (const method of METHODS) {
      const raw = item[method];
      if (!isRecord(raw) || !r.spend()) continue;
      const pointer = encodePointer(['paths', path, method]);

      // Path-level params first, overridden by op-level params with the same (in, name).
      const params = new Map<string, Param>();
      const own = Array.isArray(raw.parameters) ? raw.parameters : [];
      [...shared, ...own].forEach((p, i) => {
        const param = toParam(p, ctx, `${pointer}/parameters/${i}`);
        if (param) params.set(`${param.in}:${param.name}`, param);
      });
      const inputs = [...params.values()];

      let requestBody: Operation['requestBody'];
      const body = r.deref(raw.requestBody, pointer).value;
      const picked = isRecord(body) ? pickContent(body.content) : undefined;
      if (picked) {
        requestBody = { contentType: picked.contentType, schema: toSchemaRef(picked.schema, ctx) };
        const fields = objectFields(picked.schema, ctx);
        if (fields) {
          for (const { name, required, description, ...schema } of fields) {
            inputs.push({ name, in: 'body', required, schema, ...(description && { description }) });
          }
        } else {
          inputs.push({ name: 'body', in: 'body', required: isRecord(body) && body.required === true, schema: requestBody.schema });
        }
      }

      const responses: Operation['responses'] = [];
      let output: Operation['output'];
      const rawResponses = isRecord(raw.responses) ? raw.responses : {};
      for (const status of Object.keys(rawResponses).toSorted((a, b) => statusOrder(a) - statusOrder(b) || a.localeCompare(b))) {
        const res = r.deref(rawResponses[status], `${pointer}/responses`).value;
        if (!isRecord(res)) continue;
        const content = pickContent(res.content);
        const schema = content?.schema !== undefined ? toSchemaRef(content.schema, ctx) : undefined;
        const description = cleanText(res.description, 500);
        responses.push({ status: status.slice(0, 10), ...(description && { description }), ...(schema && { schema }) });
        if (!output && schema && content && status.startsWith('2')) output = { status, contentType: content.contentType, schema };
      }

      let id = cleanName(raw.operationId, 200);
      if (!id) {
        derivedIds++;
        id = `${method}_${pathSlug(path)}`;
      }
      if (usedIds.has(id)) {
        r.warn('duplicate-operation-id', `Operation id "${id}" is used more than once; later uses get a suffix.`, pointer);
        let n = 2;
        while (usedIds.has(`${id}_${n}`)) n++;
        id = `${id}_${n}`;
      }
      usedIds.add(id);

      const description = cleanText(raw.description);
      const op: Operation = {
        id,
        kind: 'endpoint',
        title: cleanName(raw.summary) ?? id,
        ...(description && { description }),
        method,
        path: cleanName(path, 500) ?? path,
        tags: (Array.isArray(raw.tags) ? raw.tags : []).map((t) => cleanName(t, 100)).filter((t): t is string => !!t),
        inputs,
        ...(requestBody && { requestBody }),
        ...(output && { output }),
        responses,
        security: raw.security !== undefined ? toSecurity(raw.security, ctx, known, pointer) : globalSecurity,
        hints: {
          readOnly: method === 'get' || method === 'head' || method === 'options' || method === 'trace',
          destructive: method === 'delete',
          idempotent: method !== 'post' && method !== 'patch',
        },
        ...(raw.deprecated === true && { deprecated: true }),
      };
      operations.push(op);
    }
  }
  // Named schemas after operations, so a huge components section cannot starve the operations of budget.
  const schemaEntries: [string, SchemaNode][] = [];
  for (const name of Object.keys(rawSchemas).toSorted()) {
    const raw = rawSchemas[name];
    const node: SchemaNode = toSchemaRef(raw, ctx); // an alias (`$ref` to another schema) stays a ref
    const description = isRecord(raw) ? cleanText(raw.description, 2000) : undefined;
    schemaEntries.push([name, description ? { ...node, description } : node]);
  }
  // fromEntries defines own properties, so a schema called `__proto__` cannot touch the prototype.
  const schemas: Record<string, SchemaNode> = Object.fromEntries(schemaEntries);

  for (const op of operations) {
    const pagination = detectPagination(op, schemas);
    if (pagination) op.pagination = pagination;
  }
  if (derivedIds > 0) {
    r.warn('missing-operation-id', `${derivedIds} operation(s) have no operationId; ids were derived from method and path.`);
  }

  const info = isRecord(doc.info) ? doc.info : {};
  const license = isRecord(info.license) ? cleanName(info.license.identifier ?? info.license.name, 100) : undefined;
  const version = cleanName(info.version, 50);
  const description = cleanText(info.description);
  return {
    source: {
      kind: 'openapi3',
      specVersion: doc.openapi.slice(0, 20),
      ...(url && { url }),
      title: cleanName(info.title) ?? 'Untitled API',
      ...(version && { version }),
      ...(description && { description }),
      ...(license && { license }),
    },
    servers: toServers(doc.servers),
    auth,
    operations,
    schemas,
    warnings: r.warnings,
  };
}

export async function normaliseOpenApi3(doc: unknown, options: { url?: string } = {}): Promise<ApiModel> {
  const body = buildOpenApi3(doc, options);
  return { hash: await hashModel(body), ...body };
}
