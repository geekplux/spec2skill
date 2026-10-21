// Shapes of the skill generator (PLAN 5.7). Pure data: no React, no DOM.
import type { AtlasGraph } from '../graph/types';
import type { ApiModel } from '../model/types';

/** Relative path -> file content, keys sorted. */
export type FileTree = Record<string, string>;

/** The sentences that are prose, not tables: a deterministic fallback now, AI-filled in phase 17. */
export interface SkillProse {
  source: 'deterministic' | 'ai';
  /** What the skill does: one sentence, no final period; starts the frontmatter description. */
  summary: string;
  /** The one idea that matters (Markdown). */
  idea: string;
  /** Cluster id -> one-line description. */
  clusters: Record<string, string>;
}

/** `license` defaults to "MIT" (D15), `version` to package.json's. */
export interface SkillOptions { slug?: string; license?: string; prose?: SkillProse; version?: string }

/** Calls where each output feeds the next input: `via[i]` maps `ops[i]` into `ops[i + 1]`; `inferred[i]` when that match is a guess. */
export interface Chain { ops: string[]; via: string[]; inferred: boolean[] }

/** A worked example: a chain, its `examples/<name>/` dir and, for a repeated single call, the argument values it presets. */
export interface Example { chain: Chain; dir: string; set?: Record<string, unknown> }

/** What the file builders share. `env` prefixes credential variables (TASKS_API); `refFiles` maps cluster id -> file name. */
export interface SkillContext {
  model: ApiModel; graph: AtlasGraph; slug: string; license: string; prose: SkillProse; generator: string;
  env: string; chains: Chain[]; refFiles: Map<string, string>;
  /** The worked examples: a chain and its `examples/<name>/` directory. */
  examples: Example[];
}
