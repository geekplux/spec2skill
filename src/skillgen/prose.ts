// Deterministic SkillProse: specific, never generic (always real operation ids and fields).
// Phase 17 fills the same shape from AI; skillmd.ts sanitises whichever it gets.
import type { AtlasGraph } from '../graph/types';
import type { ApiModel, Crud } from '../model/types';
import { code, label } from './sanitize';
import type { Chain, SkillProse } from './types';

export const nouns = (model: ApiModel) => (model.source.kind === 'mcp' ? 'tools' : 'operations');

/** `a`, `a and b`, `a, b and c`. */
export const listing = (items: string[], and = 'and') =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${and} ${items.at(-1)}`;

/** `listProjects` -> `listTasks` (`id -> projectId`) -> ...; guessed matches say "inferred". */
export const chainText = (chain: Chain) =>
  chain.ops.map((id, i) => (i === 0 ? code(id) : `${code(id)} (${code(chain.via[i - 1])}${chain.inferred[i - 1] ? ', inferred' : ''})`)).join(' -> ');

/** `id -> projectId, listed path` -> `[{from: 'id', to: 'projectId'}, {to: 'path'}]` (a listed entry has no field). */
export const feedPairs = (via = '') =>
  via.split(', ').flatMap((part) => {
    const m = /^(?:(\S+) -> |listed )(\S+)$/.exec(part);
    return m ? [{ from: m[1], to: m[2]! }] : [];
  });

/** "Paths" when every value flowing along the chain is a path, URI or URL; "Ids" otherwise. */
export const flowing = (chain: Chain) =>
  chain.via.flatMap((v) => feedPairs(v)).every((p) => /path|uri|url/i.test(p.to)) ? 'Paths' : 'Ids';

const singular = (w: string) => w.replace(/ies$/, 'y').replace(/([^s])s$/, '$1');
/** Lower-case plural of a resource name: `Directory` -> `directories`, `Tasks` -> `tasks`. */
export const plural = (w: string) => singular(w.toLowerCase()).replace(/([^aeiou])y$/, '$1ie').replace(/([^s])$/, '$1s');
const PHRASES: [Crud, (one: string, many: string) => string][] = [
  ['list', (_, many) => `list ${many}`], ['create', (one) => `create ${/^[aeio]/.test(one) ? 'an' : 'a'} ${one}`],
  ['update', (one) => `update a ${one}`], ['delete', (one) => `delete a ${one}`], ['read', (one) => `look up a ${one}`],
];

/** Up to four things a user asks for, one per resource, varying the verb: `list comments`, `create a label`, ... */
export function triggers(graph: AtlasGraph): string[] {
  const used = new Set<Crud>();
  return graph.clusters.flatMap((c) => {
    const kinds = new Set(c.operationIds.map((id) => graph.crud[id]));
    const found = PHRASES.find(([kind]) => kinds.has(kind) && !used.has(kind)) ?? PHRASES.find(([kind]) => kinds.has(kind));
    if (!found) return [];
    used.add(found[0]);
    const many = plural(label(c.name, c.id));
    return [found[1](singular(many), many)];
  }).slice(0, 4);
}

export function fallbackProse(model: ApiModel, graph: AtlasGraph, chains: Chain[]): SkillProse {
  const resources = graph.clusters.map((c) => plural(label(c.name, c.id)));
  const top = chains[0];
  return {
    source: 'deterministic',
    summary: `Calls the ${label(model.source.title)} (${model.operations.length} ${nouns(model)} over ${listing(resources)}) correctly from code or the command line`,
    idea: top
      ? `**${flowing(top)} flow from call to call: ${chainText(top)}.** Never guess an id or a path: take it from the output of the call before (\`kit/chains.mjs\` lists what feeds what).`
      : `**Every call is one of the ${model.operations.length} ${nouns(model)} in \`kit/operations.json\`, with exactly the arguments it declares.** No output was found to feed another call's input, so ids come from the user.`,
    clusters: Object.fromEntries(graph.clusters.map((c) => [c.id, c.description])),
  };
}
