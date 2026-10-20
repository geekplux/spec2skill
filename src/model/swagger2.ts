// Swagger 2.0 document -> ApiModel. The document is upgraded in memory to the OpenAPI 3
// shape and handed to the OpenAPI 3 builder, so both sources normalise identically.
// `$ref`s are left as written: the upgraded document still contains the original
// `definitions`, `parameters` and `responses`, so `#/definitions/Pet` resolves as before
// and unresolvable refs are left for the builder to warn about.
// Mapping: non-body params -> `schema` from type/format/items/enum (`file` -> binary string);
// `in: body` -> requestBody per `consumes`; `in: formData` -> one object requestBody
// (multipart/form-data or x-www-form-urlencoded) whose fields become `body` inputs;
// response `schema` -> content per `produces`; host + basePath + schemes -> servers;
// securityDefinitions -> securitySchemes (basic -> http basic, oauth2 flow renamed).
import { RefResolver } from '../parse/ref';
import { ParseError } from '../parse/text';
import { hashModel } from './hash';
import { METHODS, buildFromOpenApi3Shape } from './openapi3';
import type { ApiModel, ApiModelBody } from './types';
import { isRecord } from './util';

type Obj = Record<string, unknown>;

const FORM_TYPES = ['multipart/form-data', 'application/x-www-form-urlencoded'];
const OAUTH_FLOWS: Record<string, string> = {
  implicit: 'implicit',
  password: 'password',
  application: 'clientCredentials',
  accessCode: 'authorizationCode',
};

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 20) : [];
}

/** A non-body parameter or Items object -> a JSON Schema. */
function itemSchema(raw: Obj, depth = 0): Obj {
  const out: Obj = raw.type === 'file' ? { type: 'string', format: 'binary' } : { type: raw.type, format: raw.format };
  if (Array.isArray(raw.enum)) out.enum = raw.enum;
  if (isRecord(raw.items) && depth < 16) out.items = itemSchema(raw.items, depth + 1);
  return out;
}

interface Params {
  params: unknown[];
  body?: Obj;
  form: Map<string, Obj>;
}

function splitParams(list: unknown, r: RefResolver): Params {
  const out: Params = { params: [], form: new Map() };
  for (const raw of Array.isArray(list) ? list : []) {
    const { value } = r.deref(raw);
    if (!isRecord(value)) out.params.push(raw); // the builder warns about it
    else if (value.in === 'body') out.body = value;
    else if (value.in === 'formData' && typeof value.name === 'string') out.form.set(value.name, value);
    else out.params.push({ name: value.name, in: value.in, required: value.required, description: value.description, schema: itemSchema(value) });
  }
  return out;
}

function requestBody(shared: Params, own: Params, consumes: string[]): Obj | undefined {
  const form = new Map([...shared.form, ...own.form]);
  if (form.size > 0) {
    const hasFile = [...form.values()].some((p) => p.type === 'file');
    const type = consumes.find((t) => FORM_TYPES.includes(t)) ?? FORM_TYPES[hasFile ? 0 : 1]!;
    const properties = Object.fromEntries([...form].map(([name, p]) => [name, { ...itemSchema(p), description: p.description }]));
    const required = [...form].filter(([, p]) => p.required === true).map(([name]) => name);
    return { required: required.length > 0, content: { [type]: { schema: { type: 'object', properties, required } } } };
  }
  const body = own.body ?? shared.body;
  if (!body) return undefined;
  const types = consumes.length > 0 ? consumes : ['application/json'];
  return { required: body.required, description: body.description, content: Object.fromEntries(types.map((t) => [t, { schema: body.schema }])) };
}

function responses(raw: unknown, r: RefResolver, produces: string[]): Obj {
  const entries = Object.entries(isRecord(raw) ? raw : {}).map(([status, res]) => {
    const { value } = r.deref(res);
    if (!isRecord(value)) return [status, res];
    const content = value.schema === undefined ? undefined : Object.fromEntries(produces.map((t) => [t, { schema: value.schema }]));
    return [status, { description: value.description, ...(content && { content }) }];
  });
  return Object.fromEntries(entries);
}

function securitySchemes(raw: unknown): Obj {
  const entries = Object.entries(isRecord(raw) ? raw : {}).map(([id, def]): [string, unknown] => {
    if (!isRecord(def)) return [id, def];
    if (def.type === 'basic') return [id, { type: 'http', scheme: 'basic', description: def.description }];
    if (def.type !== 'oauth2' || typeof def.flow !== 'string') return [id, def];
    const flow = OAUTH_FLOWS[def.flow] ?? def.flow;
    return [id, { type: 'oauth2', description: def.description, flows: { [flow]: { scopes: def.scopes } } }];
  });
  return Object.fromEntries(entries);
}

function servers(doc: Obj): Obj[] {
  const basePath = typeof doc.basePath === 'string' ? doc.basePath.replace(/\/+$/, '') : '';
  if (typeof doc.host !== 'string' || doc.host === '') return basePath ? [{ url: basePath }] : [];
  const schemes = strings(doc.schemes).filter((s) => /^(https?|wss?)$/.test(s));
  return (schemes.length > 0 ? schemes : ['https']).map((s) => ({ url: `${s}://${doc.host}${basePath}` }));
}

/** The Swagger 2 document in the OpenAPI 3 shape `buildFromOpenApi3Shape` reads. */
export function upgradeSwagger2(doc: Obj): Obj {
  const r = new RefResolver(doc);
  const consumes = strings(doc.consumes);
  const produces = strings(doc.produces);
  const paths = Object.entries(isRecord(doc.paths) ? doc.paths : {}).map(([path, rawItem]) => {
    const { value: item } = r.deref(rawItem);
    if (!isRecord(item)) return [path, rawItem];
    const shared = splitParams(item.parameters, r);
    const upgraded: Obj = { ...item, parameters: shared.params };
    for (const method of METHODS) {
      const op = item[method];
      if (!isRecord(op)) continue;
      const own = splitParams(op.parameters, r);
      const opConsumes = Array.isArray(op.consumes) ? strings(op.consumes) : consumes;
      const opProduces = Array.isArray(op.produces) ? strings(op.produces) : produces;
      const body = requestBody(shared, own, opConsumes);
      upgraded[method] = {
        ...op,
        parameters: own.params,
        ...(body && { requestBody: body }),
        responses: responses(op.responses, r, opProduces.length > 0 ? opProduces : ['application/json']),
      };
    }
    return [path, upgraded];
  });
  return {
    ...doc,
    openapi: '3.0.3',
    servers: servers(doc),
    paths: Object.fromEntries(paths),
    components: { schemas: doc.definitions, securitySchemes: securitySchemes(doc.securityDefinitions) },
  };
}

export function buildSwagger2(doc: unknown, { url }: { url?: string } = {}): ApiModelBody {
  if (!isRecord(doc) || doc.swagger !== '2.0') {
    throw new ParseError('unsupported', 'Not a Swagger 2.0 document (missing `swagger: "2.0"`).');
  }
  return buildFromOpenApi3Shape(upgradeSwagger2(doc), { kind: 'swagger2', specVersion: '2.0' }, { url, schemaPrefix: '#/definitions/' });
}

export async function normaliseSwagger2(doc: unknown, options: { url?: string } = {}): Promise<ApiModel> {
  const body = buildSwagger2(doc, options);
  return { hash: await hashModel(body), ...body };
}
