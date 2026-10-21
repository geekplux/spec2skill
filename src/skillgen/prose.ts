// Deterministic SkillProse: specific, never generic (always real operation ids and fields).
// Phase 17 fills the same shape from AI; skillmd.ts sanitises whichever it gets.
import type { AtlasGraph } from '../graph/types';
import type { ApiModel } from '../model/types';
import { code, label } from './sanitize';
import type { Chain, SkillProse } from './types';

export const nouns = (model: ApiModel) => (model.source.kind === 'mcp' ? 'tools' : 'operations');

/** `a`, `a and b`, `a, b and c`. */
export const listing = (items: string[]) =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** `listProjects` -> `listTasks` (`id -> projectId`) -> ... */
export const chainText = (chain: Chain) =>
  chain.ops.map((id, i) => (i === 0 ? code(id) : `${code(id)} (${code(chain.via[i - 1])})`)).join(' -> ');

export function fallbackProse(model: ApiModel, graph: AtlasGraph, chains: Chain[]): SkillProse {
  const resources = graph.clusters.map((c) => label(c.name, c.id));
  const top = chains[0];
  return {
    source: 'deterministic',
    summary: `Call the ${label(model.source.title)} (${model.operations.length} ${nouns(model)} over ${listing(resources)}) correctly from code or the command line`,
    idea: top
      ? `**Ids flow from call to call: ${chainText(top)}.** Never guess an id or a path: take it from the output of the call before (\`kit/chains.mjs\` lists what feeds what).`
      : `**Every call is one of the ${model.operations.length} ${nouns(model)} in \`kit/operations.json\`, with exactly the arguments it declares.** No output was found to feed another call's input, so ids come from the user.`,
    clusters: Object.fromEntries(graph.clusters.map((c) => [c.id, c.description])),
  };
}
