// generateSkill: the anatomy-grade agent skill for one API, as a sorted FileTree.
// Pure and deterministic for the same model, graph and options; imports nothing from React or the DOM.
import pkg from '../../package.json';
import type { AtlasGraph } from '../graph/types';
import type { ApiModel } from '../model/types';
import { topChains } from './graph-chains';
import { evalsJson } from './evals';
import { exampleFiles, pickExamples } from './examples';
import { kitFiles } from './kit';
import { metaFiles } from './meta';
import { fallbackProse } from './prose';
import { referenceFiles } from './references';
import { assertSafePaths, kebab, safeFileName } from './sanitize';
import { skillMd } from './skillmd';
import { envPrefix, skillSlug } from './slug';
import type { FileTree, SkillContext, SkillOptions } from './types';

export type { Chain, FileTree, SkillOptions, SkillProse } from './types';
export { skillSlug } from './slug';

export const GENERATOR_NAME = 'spec2skill';
const SHARED_REFS = ['auth', 'workflows', 'pagination-and-errors'];

export function generateSkill(model: ApiModel, graph: AtlasGraph, options: SkillOptions = {}): FileTree {
  const chains = topChains(model, graph);
  const slug = (options.slug && kebab(options.slug)) || skillSlug(model);
  const taken = new Set(SHARED_REFS);
  const ctx: SkillContext = {
    model,
    graph,
    slug,
    license: options.license ?? 'MIT',
    prose: options.prose ?? fallbackProse(model, graph, chains),
    generator: `${GENERATOR_NAME} ${options.version ?? pkg.version}`,
    env: envPrefix(skillSlug(model)), // the default slug's, as in the detail panel's curl example
    chains,
    examples: pickExamples({ model, graph, chains }),
    refFiles: new Map(graph.clusters.map((c, i) => [c.id, safeFileName(c.name, taken, `resource-${i + 1}`)])),
  };
  const files: FileTree = {
    'SKILL.md': skillMd(ctx), ...kitFiles(ctx), ...referenceFiles(ctx), ...exampleFiles(ctx), ...metaFiles(ctx), 'evals/evals.json': evalsJson(ctx),
  };
  const paths = Object.keys(files).toSorted();
  assertSafePaths(paths);
  return Object.fromEntries(paths.map((p) => [p, files[p]!]));
}
