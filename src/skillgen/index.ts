// generateSkill: the anatomy-grade agent skill for one API (PLAN 5.7), as a sorted FileTree.
// Pure and deterministic for the same model, graph and options; imports nothing from React or the DOM.
import pkg from '../../package.json';
import type { AtlasGraph } from '../graph/types';
import { envName } from '../model/examples';
import type { ApiModel } from '../model/types';
import { topChains } from './graph-chains';
import { kitFiles } from './kit';
import { fallbackProse } from './prose';
import { referenceFiles } from './references';
import { assertSafePaths, kebab, plain, safeFileName } from './sanitize';
import { skillMd } from './skillmd';
import type { FileTree, SkillContext, SkillOptions } from './types';

export type { Chain, FileTree, SkillOptions, SkillProse } from './types';

export const GENERATOR_NAME = 'spec2skill';
const SHARED_REFS = ['auth', 'workflows', 'pagination-and-errors'];
const NOISE = new Set(['api', 'mcp', 'server', 'swagger', 'openapi']);

/** `tasks-api`, `petstore-api`, `secure-filesystem-mcp`: kebab, at most 64 characters. */
export function skillSlug(model: ApiModel): string {
  const suffix = model.source.kind === 'mcp' ? 'mcp' : 'api';
  const words = kebab(plain(model.source.serverInfo?.name ?? model.source.title, 200), 200).split('-').filter((w) => w && !NOISE.has(w));
  return `${kebab(words.join('-'), 60) || 'service'}-${suffix}`;
}

export function generateSkill(model: ApiModel, graph: AtlasGraph, options: SkillOptions = {}): FileTree {
  const chains = topChains(model, graph);
  const taken = new Set(SHARED_REFS);
  const ctx: SkillContext = {
    model,
    graph,
    slug: (options.slug && kebab(options.slug)) || skillSlug(model),
    license: options.license ?? 'MIT',
    prose: options.prose ?? fallbackProse(model, graph, chains),
    generator: `${GENERATOR_NAME} ${options.version ?? pkg.version}`,
    env: envName(model),
    chains,
    refFiles: new Map(graph.clusters.map((c, i) => [c.id, safeFileName(c.name, taken, `resource-${i + 1}`)])),
  };
  const files: FileTree = { 'SKILL.md': skillMd(ctx), ...kitFiles(ctx), ...referenceFiles(ctx) };
  const paths = Object.keys(files).toSorted();
  assertSafePaths(paths);
  return Object.fromEntries(paths.map((p) => [p, files[p]!]));
}
