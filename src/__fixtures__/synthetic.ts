// A synthetic OpenAPI 3.1 spec for the large-spec checks (P4): `resources` x 25 operations
// (40 resources = 1000 operations). Each resource points at the previous one and at r0 (a hub),
// so feeds, sub-path and shared-schema edges all occur at scale. Test-only: never imported by the app.
const ok = (ref: string) => ({ '200': { description: 'ok', content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } } });
const param = (name: string, where = 'path') => ({ name, in: where, required: where === 'path', schema: { type: 'string' } });

export function syntheticSpec(resources = 40) {
  const paths: Record<string, unknown> = {};
  const schemas: Record<string, unknown> = {};
  for (let i = 0; i < resources; i++) {
    const [r, id, prev] = [`R${i}`, `r${i}Id`, `r${(i + resources - 1) % resources}Id`];
    schemas[r] = { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, [prev]: { type: 'string' }, r0Id: { type: 'string' } } };
    schemas[`${r}Page`] = { type: 'object', properties: { data: { type: 'array', items: { $ref: `#/components/schemas/${r}` } } } };
    const body = { content: { 'application/json': { schema: { $ref: `#/components/schemas/${r}` } } } };
    const tags = [`r${i}s`];
    const base = `/r${i}s`;
    paths[base] = {
      get: { operationId: `list${r}`, tags, parameters: [param(prev, 'query')], responses: ok(`${r}Page`) },
      post: { operationId: `create${r}`, tags, requestBody: body, responses: ok(r) },
    };
    paths[`${base}/search`] = { get: { operationId: `search${r}`, tags, parameters: [param('q', 'query')], responses: ok(`${r}Page`) } };
    paths[`${base}/{${id}}`] = {
      parameters: [param(id)],
      get: { operationId: `get${r}`, tags, responses: ok(r) },
      put: { operationId: `replace${r}`, tags, requestBody: body, responses: ok(r) },
      patch: { operationId: `update${r}`, tags, requestBody: body, responses: ok(r) },
      delete: { operationId: `delete${r}`, tags, responses: { '204': { description: 'gone' } } },
    };
    paths[`${base}/{${id}}/children`] = {
      parameters: [param(id)],
      get: { operationId: `children${r}`, tags, responses: ok(`${r}Page`) },
      post: { operationId: `addChild${r}`, tags, requestBody: body, responses: ok(r) },
    };
    paths[`${base}/{${id}}/archive`] = { parameters: [param(id)], post: { operationId: `archive${r}`, tags, responses: ok(r) } };
    paths[`${base}/{${id}}/restore`] = { parameters: [param(id)], post: { operationId: `restore${r}`, tags, responses: ok(r) } };
    for (let k = 0; k < 7; k++) {
      paths[`${base}/{${id}}/facet${k}`] = {
        parameters: [param(id)],
        get: { operationId: `getFacet${k}${r}`, tags, responses: ok(r) },
        put: { operationId: `setFacet${k}${r}`, tags, requestBody: body, responses: ok(r) },
      };
    }
  }
  return { openapi: '3.1.0', info: { title: 'Synthetic', version: '1' }, paths, components: { schemas } };
}
