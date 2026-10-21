// examples/<chain>/: a worked example per top chain (at least two; single calls fill in when the
// spec has fewer chains, and a one-operation API repeats its call with other argument values).
// run.mjs is one static template with the chain (and any preset arguments) embedded as JSON.
// oxlint-disable import/default -- `?raw` imports are the files' text, not the modules
import runMjs from './assets/examples/run.mjs?raw';
import { chainText } from './prose';
import { code, kebab, label, safeFileName } from './sanitize';
import type { Operation, Param } from '../model/types';
import type { Example, FileTree, SkillContext } from './types';

export type { Example } from './types';
const MIN = 2;

/** A second value for an input, unlike kit/args.mjs's placeholder (objects and arrays keep the placeholder). */
const other = (p: Param): unknown => {
  const listed = p.schema.enum ?? p.schema.items?.enum;
  const value = listed?.length ? listed[1] ?? listed[0] : undefined;
  const type = p.schema.type?.split('|')[0] ?? 'string';
  if (type === 'array') return listed?.length ? [value] : undefined;
  return value ?? { string: `second-${p.name}`, integer: 2, number: 2.5, boolean: true }[type];
};
const otherArgs = (op: Operation) =>
  Object.fromEntries(op.inputs.flatMap((p) => { const v = other(p); return v === undefined ? [] : [[p.name, v]]; }));

/**
 * The top two chains, topped up with single list/read calls; when the API has too few operations
 * for that, the first single call again with every input set to a second value (`set`).
 * Each with a unique `examples/<name>/` dir.
 */
export function pickExamples({ model, graph, chains }: Pick<SkillContext, 'model' | 'graph' | 'chains'>): Example[] {
  const picked: Omit<Example, 'dir'>[] = chains.slice(0, MIN).map((chain) => ({ chain }));
  const rank = (id: string) => ['list', 'read'].indexOf(graph.crud[id] ?? '') >>> 0; // list, read, then the rest
  const usable = model.operations.some((op) => !op.deprecated) ? model.operations.filter((op) => !op.deprecated) : model.operations;
  const singles = usable.filter((op) => !picked.some((p) => p.chain.ops[0] === op.id)).toSorted((a, b) => rank(a.id) - rank(b.id));
  for (const op of singles.slice(0, MIN - picked.length)) picked.push({ chain: { ops: [op.id], via: [], inferred: [] } });
  const again = singles[0] ?? usable[0];
  if (picked.length < MIN && again) picked.push({ chain: { ops: [again.id], via: [], inferred: [] }, set: otherArgs(again) });
  const taken = new Set<string>();
  return picked.map((example, i) => {
    const { ops } = example.chain;
    const name = `${ops.length > 1 ? `${ops[0]} to ${ops.at(-1)}` : ops[0]!}${example.set ? ' other values' : ''}`.replace(/([a-z0-9])([A-Z])/g, '$1-$2');
    return { ...example, dir: `examples/${safeFileName(kebab(name), taken, `example-${i + 1}`)}/` };
  });
}

export function exampleFiles({ model, env, examples }: SkillContext): FileTree {
  const files: FileTree = {};
  const mcp = model.source.kind === 'mcp';
  for (const { chain, dir, set } of examples) {
    // JSON is a valid JS expression; ids are data inside string literals, never code.
    const json = JSON.stringify({ ops: chain.ops, via: chain.via, ...(set && { set }) }).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
    files[`${dir}run.mjs`] = runMjs.replace(/\/\* @chain \*\/ \{[^;]*\};/, () => `/* @chain */ ${json};`);
    const live = mcp ? `${env}_URL=<server endpoint>` : `${model.auth.length ? `${env}_TOKEN=...` : ''} ${env}_BASE_URL=<optional>`.trim();
    files[`${dir}README.md`] = `${[
      `# Example: ${chain.ops.map(code).join(' -> ')}`,
      '',
      `${chain.ops.length > 1 ? `${chainText(chain)}.` : set ? `One call to ${code(chain.ops[0])} again, with a second value for every input it declares (\`CHAIN.set\` in run.mjs): the API has too few operations for a second chain.` : `One call to ${code(chain.ops[0])}: the spec has no further chain.`} Back to [SKILL.md](../../SKILL.md).`,
      '',
      '```sh',
      `node ${dir}run.mjs          # dry run: writes ${dir}plan.json, calls nothing`,
      `${live} node ${dir}run.mjs --live   # makes the calls`,
      '```',
      '',
      'Add `--set name=value` for an argument the chain does not fill and `--yes` to allow a destructive step (ask the user first).',
      `\`plan.json\` lists each step: the ${mcp ? '`tools/call` body' : 'request (credentials shown as REDACTED)'}, its placeholder arguments and \`fedBy\`, the earlier output each fed argument comes from.`,
      '',
      `Generated for ${label(model.source.title)} by spec2skill.`,
    ].join('\n')}\n`;
  }
  return files;
}
