// The normalised model every source (OpenAPI 3.x, Swagger 2, MCP) is turned into.
// Everything here is plain JSON so it can be hashed,
// snapshot-tested and cached.

export type SourceKind = 'openapi3' | 'swagger2' | 'mcp';
export type HttpMethod = 'get' | 'put' | 'post' | 'delete' | 'patch' | 'head' | 'options' | 'trace';
export type Crud = 'list' | 'create' | 'read' | 'update' | 'delete' | 'action';

export interface ApiModel {
  /** SHA-256 (hex) of the canonical JSON of everything below except `source.url`. */
  hash: string;
  source: {
    kind: SourceKind;
    specVersion: string;
    url?: string;
    title: string;
    version?: string;
    description?: string;
    license?: string;
    serverInfo?: { name: string; version: string };
  };
  /** Base URLs (OpenAPI servers / Swagger host+basePath+schemes / MCP endpoint). */
  servers: string[];
  auth: AuthScheme[];
  /** Stable order: by path then method, or by MCP tool order. */
  operations: Operation[];
  /** Named components/definitions, sorted by name; MCP: none. */
  schemas: Record<string, SchemaNode>;
  warnings: Warning[];
}

/** The model without its hash: what the normalisers build and `hashModel` digests. */
export type ApiModelBody = Omit<ApiModel, 'hash'>;

export interface AuthScheme {
  id: string;
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect' | 'mutualTLS' | 'none';
  /** `http` only: `bearer`, `basic`, ... (lower-cased). */
  scheme?: string;
  bearerFormat?: string;
  /** `apiKey` only. */
  in?: 'header' | 'query' | 'cookie';
  name?: string;
  /** `oauth2` only: flow names and the union of their scopes. */
  flows?: string[];
  scopes?: string[];
  description?: string;
}

export interface Operation {
  /** operationId | `${method}_${pathSlug}` | MCP tool name; unique within the model. */
  id: string;
  kind: 'endpoint' | 'tool';
  /** summary | MCP title | id. */
  title: string;
  /** Plain text, capped at 2000 chars. */
  description?: string;
  method?: HttpMethod;
  path?: string;
  tags: string[];
  /** path/query/header/cookie params, then flattened top-level body fields; MCP: inputSchema properties. */
  inputs: Param[];
  requestBody?: { contentType: string; schema: SchemaRef };
  /** Primary 2xx response with a schema / MCP outputSchema. */
  output?: { status?: string; contentType?: string; schema: SchemaRef };
  responses: { status: string; description?: string; schema?: SchemaRef }[];
  /** OR of AND-sets of AuthScheme ids; [] = none. An empty AND-set means "anonymous allowed". */
  security: string[][];
  hints: { readOnly?: boolean; destructive?: boolean; idempotent?: boolean; openWorld?: boolean };
  pagination?: { style: 'cursor' | 'offset' | 'page'; params: string[] };
  deprecated?: boolean;
}

export interface Param {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie' | 'body' | 'argument';
  required: boolean;
  schema: SchemaRef;
  description?: string;
}

/**
 * A shallow, bounded view of a JSON Schema. Named schemas are referenced by name (`ref`),
 * never inlined, so cycles cannot occur. `type` is a JSON Schema type, or several joined
 * with `|` (3.1 type arrays without `null`); `null` becomes `nullable: true`.
 */
export interface SchemaRef {
  /** Name of a schema in `ApiModel.schemas`, or the raw `$ref` when `unresolved`. */
  ref?: string;
  /** The `$ref` is external or missing (D18): shown, not followed. */
  unresolved?: boolean;
  type?: string;
  format?: string;
  nullable?: boolean;
  enum?: unknown[];
  /** Object properties, sorted by name (so neither the model nor its hash depends on key order). */
  fields?: SchemaField[];
  items?: SchemaRef;
  /** oneOf/anyOf alternatives (null alternatives removed). */
  variants?: SchemaRef[];
}

/** A property: a shallow SchemaRef (no nested `fields`) plus its name. */
export interface SchemaField extends SchemaRef {
  name: string;
  required: boolean;
  description?: string;
}

export interface SchemaNode extends SchemaRef {
  description?: string;
}

export type WarningCode =
  | 'external-ref'
  | 'missing-ref'
  | 'cyclic-ref'
  | 'budget-exceeded'
  | 'missing-operation-id'
  | 'duplicate-operation-id'
  | 'invalid-parameter'
  | 'unknown-security-scheme'
  | 'invalid-tool';

export interface Warning {
  code: WarningCode;
  message: string;
  /** JSON pointer into the source document, when there is one place to look. */
  pointer?: string;
}
