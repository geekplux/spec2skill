// Deterministic edges (PLAN 5.4 rules 3-5). Pure: same model in, same edges out.
import type { ApiModel, Crud, Operation, Param, SchemaRef } from '../model/types';
import type { ClusterKey } from './cluster';
import { type AtlasGraph, type Confidence, type Edge, type EdgeKind, HUB_THRESHOLD, MAX_INCOMING_FEEDS } from './types';
import { singular, words } from './words';

const edge = (kind: EdgeKind, from: string, to: string, label: string, evidence: string, confidence: Confidence): Edge => ({
  id: `${kind}:${from}->${to}`, kind, from, to, label, evidence, confidence,
});

/** Rule 3: each path hangs off its nearest existing ancestor path, via that path's GET (else its first op). */
export function subPathEdges(ops: readonly Operation[]): Edge[] {
  const byPath = new Map<string, Operation[]>();
  for (const op of ops) if (op.path) byPath.set(op.path, byPath.get(op.path) ?? []).get(op.path)!.push(op);
  const edges: Edge[] = [];
  for (const [path, children] of byPath) {
    const segments = path.split('/');
    for (let end = segments.length - 1; end > 1; end--) {
      const parentPath = segments.slice(0, end).join('/');
      const parents = byPath.get(parentPath);
      if (!parents) continue;
      const parent = parents.find((op) => op.method === 'get') ?? parents[0]!;
      const label = path.slice(parentPath.length);
      for (const child of children) edges.push(edge('sub-path', parent.id, child.id, label, `${path} is under ${parentPath}`, 'exact'));
      break;
    }
  }
  return edges;
}

/** The named schema behind a schema, through arrays. */
function named(schema: SchemaRef | undefined, schemas: ApiModel['schemas']): string | undefined {
  for (let s = schema, depth = 0; s && depth < 4; s = s.items, depth++) {
    if (s.ref) return !s.unresolved && Object.hasOwn(schemas, s.ref) ? s.ref : undefined;
  }
  return undefined;
}

function add(map: Map<string, Set<number>>, name: string | undefined, i: number): void {
  if (name) map.set(name, (map.get(name) ?? new Set()).add(i));
}

/** Rule 4: operations sharing a named request/primary-response schema; schemas on > 8 operations are hubs. */
export function sharedSchemaEdges(model: ApiModel): Pick<AtlasGraph, 'edges' | 'hubSchemas'> {
  const ops = model.operations;
  const usedBy = new Map<string, Set<number>>();
  const linked = new Map<string, Set<number>>();
  ops.forEach((op, i) => {
    const primary = [op.requestBody?.schema, op.output?.schema].map((s) => named(s, model.schemas));
    for (const name of primary) add(linked, name, i);
    for (const name of [...primary, ...op.responses.map((r) => named(r.schema, model.schemas))]) add(usedBy, name, i);
  });
  const hubSchemas = [...usedBy]
    .filter(([, users]) => users.size > HUB_THRESHOLD)
    .map(([name, users]) => ({ name, usedBy: users.size }))
    .toSorted((a, b) => b.usedBy - a.usedBy || (a.name < b.name ? -1 : 1));
  const hubs = new Set(hubSchemas.map((hub) => hub.name));
  const pairs = new Map<string, { from: number; to: number; names: string[] }>();
  for (const [name, users] of [...linked].toSorted(([a], [b]) => (a < b ? -1 : 1))) {
    if (hubs.has(name)) continue;
    const list = [...users].toSorted((a, b) => a - b);
    list.forEach((from, a) => {
      for (const to of list.slice(a + 1)) {
        const pair = pairs.get(`${from},${to}`) ?? { from, to, names: [] };
        pair.names.push(name);
        pairs.set(`${from},${to}`, pair);
      }
    });
  }
  const edges = [...pairs.values()].map(({ from, to, names }) =>
    edge('shared-schema', ops[from]!.id, ops[to]!.id, names.join(', '), `both use ${names.join(' and ')}`, 'exact'),
  );
  return { edges, hubSchemas };
}

/** What entity an id-like name points at; `sure` when the name itself says so (`memberId`). */
interface IdRef { noun: string; sure: boolean }

const nounOf = (name: string): string => singular(words(name).join('_'));

function idRef(name: string, description: string | undefined, nouns: Set<string>, self?: string): IdRef | undefined {
  const parts = words(name);
  if (parts.length < 2 || parts.at(-1) !== 'id') return undefined;
  const stem = singular(parts.slice(0, -1).join('_'));
  if (nouns.has(stem)) return { noun: stem, sure: true };
  const last = singular(parts.at(-2)!);
  if (nouns.has(last)) return { noun: last, sure: false };
  // `assigneeId: The member the task is assigned to.` -> member (skipping the owner's own noun).
  const mentioned = words(description ?? '').map(singular).find((word) => word !== self && nouns.has(word));
  return { noun: mentioned ?? stem, sure: false };
}

interface Out { field: string; from: string; id?: IdRef; primary: boolean }

/** Output fields of an operation; pages (no `id`, an array of a named schema) are looked through. */
function outputs(op: Operation, model: ApiModel, nouns: Set<string>): Out[] {
  const out: Out[] = [];
  const visit = (s: SchemaRef | undefined, depth: number): void => {
    if (!s || depth > 3) return;
    if (s.items) return visit(s.items, depth + 1);
    const node = s.ref ? (Object.hasOwn(model.schemas, s.ref) ? model.schemas[s.ref] : undefined) : s;
    const fields = node?.fields ?? [];
    const self = s.ref ? nounOf(s.ref) : undefined;
    const hasId = fields.some((f) => f.name === 'id');
    for (const f of fields) {
      const from = `${s.ref ?? op.id}.${f.name}`;
      if (f.name === 'id' && self) out.push({ field: 'id', from, id: { noun: self, sure: true }, primary: true });
      else if (f.name !== 'id') out.push({ field: f.name, from, id: idRef(f.name, f.description, nouns, self), primary: false });
      if (!hasId && f.items?.ref) visit(f.items, depth + 1);
    }
  };
  visit(op.output?.schema, 0);
  return out;
}

interface Candidate { src: number; confidence: Confidence; primary: boolean; labels: string[]; evidence: string[] }
const FEED_IN = new Set<Param['in']>(['path', 'query', 'argument']);
const LISTED = new Set(['path', 'uri', 'url', 'id']);

/** Rule 5: output fields that can fill another operation's input; <= 6 incoming per operation. */
export function feedsEdges(model: ApiModel, crud: Record<string, Crud>, keys: Map<string, ClusterKey>): Edge[] {
  const ops = model.operations;
  const nouns = new Set([...Object.keys(model.schemas).map(nounOf), ...[...keys.values()].map((k) => k.key)]);
  const inputIds = ops.map((op) => op.inputs.map((p) => ({ param: p, id: idRef(p.name, p.description, nouns, keys.get(op.id)?.key) })));
  // Index producers by entity noun and by field name. A source never feeds back a value it took as
  // input, and only reads/lists offer foreign keys (`getTask` -> `Task.projectId`, not `updateTask`).
  const producers = new Map<string, { src: number; out: Out }[]>();
  ops.forEach((op, src) => {
    const reads = crud[op.id] === 'read' || crud[op.id] === 'list';
    for (const out of outputs(op, model, nouns)) {
      const echo = inputIds[src]!.some(({ param, id }) => param.name === out.field || (id && id.noun === out.id?.noun));
      if (echo || (!out.primary && !reads)) continue;
      for (const key of [`f:${out.field}`, ...(out.id ? [`n:${out.id.noun}`] : [])]) {
        producers.set(key, producers.get(key) ?? []).get(key)!.push({ src, out });
      }
    }
  });

  const listers = ops.flatMap((op, src) => (op.kind === 'tool' && crud[op.id] === 'list' ? [src] : []));
  const edges: Edge[] = [];
  ops.forEach((target, tgt) => {
    const found = new Map<number, Candidate>();
    const offer = (src: number, confidence: Confidence, primary: boolean, label: string, evidence: string) => {
      if (src === tgt) return;
      const c = found.get(src) ?? { src, confidence, primary, labels: [], evidence: [] };
      if (confidence === 'exact') c.confidence = 'exact';
      c.primary ||= primary;
      if (!c.labels.includes(label)) {
        c.labels.push(label);
        c.evidence.push(evidence);
      }
      found.set(src, c);
    };
    for (const { param, id } of inputIds[tgt]!) {
      if (!FEED_IN.has(param.in)) continue;
      const name = param.name;
      for (const { src, out } of [...(producers.get(`f:${name}`) ?? []), ...(id ? (producers.get(`n:${id.noun}`) ?? []) : [])]) {
        const byName = out.field === name && (id || param.in === 'path');
        const byNoun = id && out.id?.noun === id.noun;
        if (!byName && !byNoun) continue;
        const confidence = byName || (out.id!.sure && id!.sure) ? 'exact' : 'inferred';
        offer(src, confidence, out.primary, `${out.field} -> ${name}`, `${out.from} -> ${name} (${param.in})`);
      }
      // MCP: list/search tools feed other tools' required string params (path, uri, id, the cluster noun);
      // not creates, which take a new name rather than a listed one.
      if (target.kind !== 'tool' || crud[target.id] === 'create' || !param.required || param.schema.type !== 'string') continue;
      for (const src of listers) {
        const key = keys.get(ops[src]!.id)!.key;
        if (LISTED.has(name) || name === key) {
          offer(src, 'inferred', false, `listed ${name}`, `${ops[src]!.id} lists ${key} entries; ${target.id} takes ${name}`);
        }
      }
    }
    const rank = (c: Candidate) => (c.confidence === 'exact' ? 0 : 2) + (c.primary ? 0 : 1);
    const kept = [...found.values()].toSorted((a, b) => rank(a) - rank(b) || a.src - b.src).slice(0, MAX_INCOMING_FEEDS);
    for (const c of kept) {
      edges.push(edge('feeds', ops[c.src]!.id, target.id, c.labels.join(', '), c.evidence.join('; '), c.confidence));
    }
  });
  return edges;
}
