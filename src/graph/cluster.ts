// Resource clusters (PLAN 5.4 rule 1): first tag; else first literal path segment that is
// not a version; else the noun in the operation/tool name. Keys are singular, so `files`
// and `file` merge.
import type { ApiModel, Crud, Operation } from '../model/types';
import type { Cluster } from './types';
import { CRUD_ORDER } from './crud';
import { VERBS, capitalise, singular, words } from './words';

const VERSION = /^(v\d+(\.\d+)*|api|rest)$/i;
const PREPOSITIONS = new Set(['with', 'by', 'for', 'from', 'to', 'in', 'of', 'as', 'on', 'at']);
const MAX_CLUSTERS = 12;

export interface ClusterKey {
  key: string;
  label: string;
  tagged: boolean;
}

/** Candidate nouns of a name: words after a verb prefix, up to the first preposition. */
function nameNouns(name: string): string[] {
  const all = words(name);
  const start = all.length > 1 && VERBS.has(all[0]!) ? 1 : 0;
  const nouns: string[] = [];
  for (const word of all.slice(start)) {
    if (PREPOSITIONS.has(word)) break;
    nouns.push(singular(word));
  }
  return nouns.length > 0 ? nouns : [all.join('_') || 'other'];
}

/** The cluster key of every operation, keyed by operation id. */
export function clusterKeys(operations: readonly Operation[]): Map<string, ClusterKey> {
  // Name nouns are ranked by how many operations mention them: `read_text_file` joins `file`.
  const nouns = new Map(operations.map((op) => [op.id, nameNouns(op.id)]));
  const counts = new Map<string, number>();
  for (const list of nouns.values()) for (const noun of new Set(list)) counts.set(noun, (counts.get(noun) ?? 0) + 1);
  const keys = new Map<string, ClusterKey>();
  for (const op of operations) {
    const tag = op.tags[0]?.trim();
    const segment = op.path?.split('/').find((s) => s !== '' && !s.startsWith('{') && !VERSION.test(s));
    const label = tag || segment;
    if (label) {
      keys.set(op.id, { key: singular(label.toLowerCase()), label, tagged: Boolean(tag) });
      continue;
    }
    // Most frequent noun; ties go to the later word (the head noun: `text_file` -> `file`).
    const noun = nouns.get(op.id)!.reduce((best, n) => ((counts.get(n) ?? 0) >= (counts.get(best) ?? 0) ? n : best));
    keys.set(op.id, { key: noun, label: noun, tagged: false });
  }
  return keys;
}

export function buildClusters(model: ApiModel, crud: Record<string, Crud>, keys = clusterKeys(model.operations)): Cluster[] {
  const groups = new Map<string, { label: string; tagged: boolean; ops: Operation[] }>();
  for (const op of model.operations) {
    const { key, label, tagged } = keys.get(op.id)!;
    const group = groups.get(key) ?? { label, tagged: false, ops: [] };
    group.tagged ||= tagged;
    group.ops.push(op);
    groups.set(key, group);
  }
  if (groups.size > MAX_CLUSTERS) {
    const other = { label: 'Other', tagged: false, ops: [] as Operation[] };
    for (const [key, group] of groups) {
      if (group.ops.length === 1 && !group.tagged) {
        other.ops.push(...group.ops);
        groups.delete(key);
      }
    }
    const existing = groups.get('other');
    if (existing) existing.ops.push(...other.ops);
    else if (other.ops.length > 0) groups.set('other', other);
  }

  const index = new Map(model.operations.map((op, i) => [op.id, i]));
  const rank = (id: string) => CRUD_ORDER.indexOf(crud[id]!) * 1e6 + index.get(id)!;
  const ids = new Set<string>();
  const noun = model.source.kind === 'mcp' ? 'tool' : 'operation';
  return [...groups.values()].map(({ label, ops }) => {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cluster';
    let id = `cluster-${slug}`;
    for (let n = 2; ids.has(id); n++) id = `cluster-${slug}-${n}`;
    ids.add(id);
    const operationIds = ops.map((op) => op.id).toSorted((a, b) => rank(a) - rank(b));
    const roles = CRUD_ORDER.filter((role) => operationIds.some((opId) => crud[opId] === role));
    const count = `${ops.length} ${noun}${ops.length === 1 ? '' : 's'}`;
    return { id, name: capitalise(label), description: `${count}: ${roles.join(', ')}`, nameSource: 'deterministic', operationIds };
  });
}
