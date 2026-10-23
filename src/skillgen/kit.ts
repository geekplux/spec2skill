// kit/: operations.json from the model, plus the static ESM templates in assets/kit (real,
// linted and tested files; imported here as text).
// oxlint-disable import/default -- `?raw` imports are the files' text, not the modules
import { outputFields } from '../model/examples';
import type { AuthScheme, Param, SchemaRef } from '../model/types';
import argsMjs from './assets/kit/args.mjs?raw';
import chainsMjs from './assets/kit/chains.mjs?raw';
import clientMjs from './assets/kit/client.mjs?raw';
import mcpMjs from './assets/kit/mcp.mjs?raw';
import { CAP, plain } from './sanitize';
import type { FileTree, SkillContext } from './types';

/** The environment variables holding a scheme's credentials (read by kit/client.mjs). */
export function authEnv(env: string, s: AuthScheme): string[] {
  if (s.type === 'apiKey') return [`${env}_API_KEY`];
  if (s.type === 'http' && s.scheme === 'basic') return [`${env}_USER`, `${env}_PASSWORD`];
  return ['http', 'oauth2', 'openIdConnect'].includes(s.type) ? [`${env}_TOKEN`] : [];
}

export function operationsJson({ model, graph, slug, generator, env, chains }: SkillContext): string {
  const named = (s: SchemaRef) => (s.ref && model.schemas[s.ref]) || s;
  const input = (p: Param) => {
    const s = named(p.schema);
    const type = s.type ?? (s.fields ? 'object' : undefined);
    const values = s.enum ?? (s.items && named(s.items).enum); // an array's enum applies to each item
    return { name: p.name, in: p.in, required: p.required, ...(type && { type }), ...(values && { enum: values }), ...(s.nullable && { nullable: true }) };
  };
  const operations = model.operations.map((op) => ({
    id: op.id,
    title: plain(op.title, CAP.summary),
    crud: graph.crud[op.id],
    ...(op.method && { method: op.method, path: op.path }),
    ...(op.requestBody && { body: { type: op.requestBody.contentType, whole: !named(op.requestBody.schema).fields } }),
    inputs: op.inputs.map(input),
    output: outputFields(model, op.output?.schema).map((f) => f.name),
    security: op.security,
    readOnly: Boolean(op.hints.readOnly),
    destructive: Boolean(op.hints.destructive) || graph.crud[op.id] === 'delete',
    ...(op.pagination && { pagination: op.pagination }),
    ...(op.deprecated && { deprecated: true }),
    next: graph.edges.filter((e) => e.kind === 'feeds' && e.from === op.id).map((e) => ({ to: e.to, via: e.label, confidence: e.confidence })),
  }));
  const auth = model.auth.map((s) => ({ id: s.id, type: s.type, scheme: s.scheme, in: s.in, name: s.name, env: authEnv(env, s) }));
  const kind = model.source.kind === 'mcp' ? 'mcp' : 'http';
  return `${JSON.stringify({ generator, skill: slug, kind, sourceHash: model.hash, envPrefix: env, servers: model.servers, auth, operations, chains }, null, 2)}\n`;
}

export function kitFiles(ctx: SkillContext): FileTree {
  const transport: FileTree = ctx.model.source.kind === 'mcp' ? { 'kit/mcp.mjs': mcpMjs } : { 'kit/client.mjs': clientMjs };
  return { 'kit/operations.json': operationsJson(ctx), 'kit/args.mjs': argsMjs, 'kit/chains.mjs': chainsMjs, ...transport };
}
