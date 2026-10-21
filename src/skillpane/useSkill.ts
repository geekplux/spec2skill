// Writes the skill for the model on screen with the skill generator chunk (D22), and again when the
// options change or "Generate skill" is pressed (`run`). The previous skill stays until the next is ready.
import { useEffect, useState } from 'react';
import type { AtlasGraph } from '../graph';
import type { ApiModel } from '../model/types';
import type { AuditResult } from '../skillgen/audit-core';
import type { FileTree } from '../skillgen/types';

let chunk: Promise<typeof import('../skillgen/skill')> | undefined;
const load = () => (chunk ??= import('../skillgen/skill'));

export interface Skill { hash: string; slug: string; tree: FileTree; audit: AuditResult; run: number; zip: () => Uint8Array }

export function useSkill(model: ApiModel, graph: AtlasGraph, slug: string, license: string, run: number) {
  const [state, setState] = useState<{ skill?: Skill; error?: string }>({});
  useEffect(() => {
    if (model.operations.length === 0) return;
    let live = true;
    load().then(
      (gen) => {
        if (!live) return;
        const tree = gen.generateSkill(model, graph, { slug, license });
        setState({ skill: { hash: model.hash, slug, tree, audit: gen.auditTree(tree), run, zip: () => gen.zipSkill(slug, tree) } });
      },
      () => live && setState({ error: 'The skill generator did not load. Reload the page to try again.' }),
    );
    return () => {
      live = false;
    };
  }, [model, graph, slug, license, run]);
  return state;
}
