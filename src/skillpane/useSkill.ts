// Writes the skill for the model on screen with the skill generator chunk (D22), and again when the
// options change or "Generate skill" is pressed (`run`). The previous skill stays until the next is ready.
// The source loader writes a user's skill ahead (`writeSkill`), so the pane and the map change together.
import { useEffect, useState } from 'react';
import type { AtlasGraph } from '../graph';
import type { ApiModel } from '../model/types';
import type { AuditResult } from '../skillgen/audit-core';
import type { FileTree, SkillProse } from '../skillgen/types';

let chunk: Promise<typeof import('../skillgen/skill')> | undefined;
const load = () => (chunk ??= import('../skillgen/skill'));

export interface Skill { hash: string; slug: string; tree: FileTree; audit: AuditResult; run: number; prose: SkillProse['source']; zip: () => Uint8Array }

/** The last few skills written, by model hash, slug, licence and run. */
const made = new Map<string, Skill>();
/** AI prose always comes with its AI-named graph, so the prose source stands for both. */
const keyOf = (model: ApiModel, slug: string, license: string, run: number, prose?: SkillProse) => JSON.stringify([model.hash, slug, license, run, prose?.source]);

export async function writeSkill(model: ApiModel, graph: AtlasGraph, slug: string, license: string, run: number, prose?: SkillProse): Promise<Skill> {
  const gen = await load();
  const tree = gen.generateSkill(model, graph, { slug, license, prose });
  const skill = { hash: model.hash, slug, tree, audit: gen.auditTree(tree), run, prose: prose?.source ?? 'deterministic', zip: () => gen.zipSkill(slug, tree) };
  made.set(keyOf(model, slug, license, run, prose), skill);
  if (made.size > 6) made.delete(made.keys().next().value!);
  return skill;
}

export function useSkill(model: ApiModel, graph: AtlasGraph, slug: string, license: string, run: number, prose?: SkillProse) {
  const ahead = made.get(keyOf(model, slug, license, run, prose));
  const [state, setState] = useState<{ skill?: Skill; error?: string }>({});
  useEffect(() => {
    if (model.operations.length === 0 || ahead) return;
    let live = true;
    writeSkill(model, graph, slug, license, run, prose).then(
      (skill) => live && setState({ skill }),
      () => live && setState({ error: 'The skill generator did not load. Reload the page to try again.' }),
    );
    return () => {
      live = false;
    };
  }, [model, graph, slug, license, run, prose, ahead]);
  return ahead ? { skill: ahead } : state;
}
