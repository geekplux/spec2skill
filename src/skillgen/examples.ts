// examples/<chain>/: a worked example per top chain (at least two; single calls fill in when the
// spec has fewer chains). run.mjs is one static template with the chain embedded as JSON.
// oxlint-disable import/default -- `?raw` imports are the files' text, not the modules
import runMjs from './assets/examples/run.mjs?raw';
import { chainText } from './prose';
import { code, kebab, label, safeFileName } from './sanitize';
import type { Chain, FileTree, SkillContext } from './types';

export interface Example { chain: Chain; dir: string }
const MIN = 2;

/** The top two chains, topped up with single list/read calls; each with a unique `examples/<name>/` dir. */
export function pickExamples({ model, graph, chains }: Pick<SkillContext, 'model' | 'graph' | 'chains'>): Example[] {
  const picked = chains.slice(0, MIN);
  const rank = (id: string) => ['list', 'read'].indexOf(graph.crud[id] ?? '') >>> 0; // list, read, then the rest
  const singles = model.operations.filter((op) => !op.deprecated && !picked.some((c) => c.ops[0] === op.id)).map((op) => op.id).toSorted((a, b) => rank(a) - rank(b));
  for (const id of singles.slice(0, MIN - picked.length)) picked.push({ ops: [id], via: [], inferred: [] });
  const taken = new Set<string>();
  return picked.map((chain, i) => {
    const name = (chain.ops.length > 1 ? `${chain.ops[0]} to ${chain.ops.at(-1)}` : chain.ops[0]!).replace(/([a-z0-9])([A-Z])/g, '$1-$2');
    return { chain, dir: `examples/${safeFileName(kebab(name), taken, `example-${i + 1}`)}/` };
  });
}

export function exampleFiles({ model, env, examples }: SkillContext): FileTree {
  const files: FileTree = {};
  const mcp = model.source.kind === 'mcp';
  for (const { chain, dir } of examples) {
    // JSON is a valid JS expression; ids are data inside string literals, never code.
    const json = JSON.stringify({ ops: chain.ops, via: chain.via }).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
    files[`${dir}run.mjs`] = runMjs.replace(/\/\* @chain \*\/ \{[^;]*\};/, () => `/* @chain */ ${json};`);
    const live = mcp ? `${env}_URL=<server endpoint>` : `${model.auth.length ? `${env}_TOKEN=...` : ''} ${env}_BASE_URL=<optional>`.trim();
    files[`${dir}README.md`] = `${[
      `# Example: ${chain.ops.map(code).join(' -> ')}`,
      '',
      `${chain.ops.length > 1 ? `${chainText(chain)}.` : `One call to ${code(chain.ops[0])}: the spec has no further chain.`} Back to [SKILL.md](../../SKILL.md).`,
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
