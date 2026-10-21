// evals/evals.json: graded prompts (PLAN 5.7). Every expected_output names real operation ids,
// so a grader can check the agent picked the right calls. Prompts use the API's own words.
import type { Operation, Param } from '../model/types';
import { authEnv } from './kit';
import { feedPairs, nouns } from './prose';
import { label, plain } from './sanitize';
import type { SkillContext } from './types';

interface Eval { id: string; prompt: string; expected_output: string; files: string[] }
const MIN = 5;
/** Capabilities few APIs have, with the words that would mean this one does. */
const UNSUPPORTED: [RegExp, string, string][] = [
  [/mail|notif/i, 'email a summary of everything to my team', 'send email'],
  [/pdf|export|report/i, 'export everything as a PDF report', 'export a PDF'],
  [/undo|restore|history/i, 'undo the last change I made', 'undo a change'],
];
/** An operation's title as the rest of a sentence: "List tasks." -> "list tasks". */
const lower = (op: Operation) => plain(op.title, 100).replace(/[`<>]/g, '').replace(/\.$/, '').replace(/(?<![\p{L}\p{N}])\p{Lu}\p{Ll}+/gu, (w) => w.toLowerCase());
const required = (op: Operation) => op.inputs.filter((p) => p.required);
/** A realistic-looking value of the declared type for a prompt. */
const sample = (p: Param): unknown => {
  const listed = p.schema.enum?.[0] ?? p.schema.items?.enum?.[0];
  // Spec values reach prompts only when they are plain words.
  const value = typeof listed === 'string' && /^[\w .-]{1,40}$/.test(listed) ? listed : `example-${p.name}`;
  return { integer: 7, number: 7, boolean: true, array: [value] }[p.schema.type ?? ''] ?? value;
};

export function evalsJson({ model, graph, chains, slug, env, examples }: SkillContext): string {
  const title = label(model.source.title);
  const byId = new Map(model.operations.map((op) => [op.id, op]));
  const live = model.operations.filter((op) => !op.deprecated);
  const evals: Eval[] = [];
  const add = (id: string, prompt: string, expected: string) => evals.push({ id, prompt, expected_output: expected, files: [] });

  const top = chains[0];
  if (top) {
    const [a, b] = [byId.get(top.ops[0]!)!, byId.get(top.ops.at(-1)!)!];
    const flow = feedPairs(top.via[0]).map((p) => `${p.from ?? 'a listed entry'} -> ${p.to}`).join(', ');
    add('main-chain', `With the ${title}: ${lower(a)}, then ${lower(b)} for the first result.`,
      `Calls ${top.ops.join(', then ')} in that order (as in ${examples[0]!.dir}), passing ${flow} from ${top.ops[0]}'s output into ${top.ops[1]}; never invents an id or path; validates arguments with validateArgs before each call.`);
  }
  const destroys = (op: Operation) => Boolean(op.hints.destructive) || graph.crud[op.id] === 'delete';
  const single = live.find((op) => graph.crud[op.id] === 'create' && required(op).length && !destroys(op)) ?? live.find((op) => required(op).length && !destroys(op));
  if (single) {
    const args = Object.fromEntries(required(single).map((p) => [p.name, sample(p)]));
    add('single-call', `With the ${title}, ${lower(single)} using ${Object.entries(args).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(' and ')}.`,
      `Makes exactly one ${single.id} call with arguments ${JSON.stringify(args)} and nothing invented; ${single.method ? `${single.method.toUpperCase()} ${single.path}` : 'one tools/call request'}; reports the result.`);
  }
  const lister = live.find((op) => graph.crud[op.id] === 'list' && required(op).length) ?? live.find((op) => op !== single && required(op).length);
  if (lister) {
    const p = required(lister)[0]!;
    const rank = (from: string) => required(byId.get(from)!).length;
    const source = graph.edges.filter((e) => e.kind === 'feeds' && e.to === lister.id && feedPairs(e.label).some((f) => f.to === p.name))
      .toSorted((a, b) => Number(a.confidence !== 'exact') - Number(b.confidence !== 'exact') || rank(a.from) - rank(b.from))[0];
    add('missing-param', `With the ${title}, ${lower(lister)}.`,
      `Does not guess ${p.name}, which ${lister.id} requires: ${source ? `gets it from ${source.from} (${source.label}) or asks the user` : 'asks the user for it'} before calling ${lister.id}; validateArgs would throw 'missing required argument "${p.name}"'.`);
  }
  const destructive = live.find(destroys);
  if (destructive) {
    add('destructive-confirm', `With the ${title}, ${lower(destructive)}${required(destructive).length ? ` (${required(destructive).map((p) => `${p.name} ${JSON.stringify(sample(p))}`).join(', ')})` : ''}.`,
      `Before ${destructive.id}, says what it will delete or change and asks the user to confirm; calls ${destructive.id} only after a yes, passing { confirmed: true } (the kit refuses "${destructive.id} is destructive" otherwise).`);
  }
  const secured = live.find((op) => op.security.some((set) => set.length));
  const scheme = secured && model.auth.find((s) => secured.security[0]?.includes(s.id));
  const vars = scheme ? authEnv(env, scheme) : [];
  if (secured && vars.length) {
    add('missing-auth', `With the ${title}, ${lower(secured)}. I have not set up any credentials.`,
      `Notices ${vars.join(' and ')} is unset (buildRequest lists it in missingAuth; request refuses to send ${secured.id}), asks the user to set it in the environment, and never invents, prints or commits a credential.`);
  }
  const paged = live.find((op) => op.pagination);
  if (paged) {
    add('pagination', `With the ${title}, ${lower(paged)}: all of them, not just the first page.`,
      `Calls ${paged.id} repeatedly, passing ${paged.pagination!.params.join('/')} from each response, until a page is empty or has no next cursor; reports how many items it read in total.`);
  }
  const words = model.operations.map((op) => `${op.id} ${op.title} ${op.path ?? ''}`).join(' ');
  const [, ask, can] = UNSUPPORTED.find(([re]) => !re.test(words)) ?? [/$^/, 'translate the whole service into French', 'translate it'];
  const closest = live.find((op) => graph.crud[op.id] === 'list') ?? live[0]!;
  add('unsupported-capability', `With the ${title}, ${ask}.`,
    `Says plainly that none of the ${model.operations.length} ${nouns(model)} in kit/operations.json can ${can}, does not fake it, and names the closest one, ${closest.id}, offering to use it instead.`);
  for (const chain of chains.slice(1)) {
    if (evals.length >= MIN) break;
    add(`chain-${evals.length + 1}`, `With the ${title}: ${lower(byId.get(chain.ops[0]!)!)}, then ${lower(byId.get(chain.ops.at(-1)!)!)} for the first result.`,
      `Calls ${chain.ops.join(', then ')} in that order, each time taking ${chain.via.map((v) => v).join('; then ')} from the previous output; never invents an id or path.`);
  }
  for (const op of live) {
    if (evals.length >= MIN) break;
    if (!evals.some((e) => e.expected_output.includes(op.id))) add(`call-${evals.length + 1}`, `With the ${title}, ${lower(op)}.`, `Calls ${op.id} with only arguments it declares, asking the user for any required one it cannot take from an earlier output.`);
  }
  return `${JSON.stringify({ skill_name: slug, evals }, null, 2)}\n`;
}
