// evals/evals.json: graded prompts. Every expected_output names real operation ids,
// so a grader can check the agent picked the right calls. Prompts use the API's own words.
// Always at least MIN evals, however small the API: per-operation variants and further
// unsupported-capability prompts pad the list (the generated audit requires MIN).
import type { Operation, Param } from '../model/types';
import { authEnv } from './kit';
import { feedPairs, nouns } from './prose';
import { label, plain } from './sanitize';
import type { Chain, SkillContext } from './types';

interface Eval { id: string; prompt: string; expected_output: string; files: string[] }
const MIN = 5;
/** Capabilities few APIs have, with the words that would mean this one does. */
const UNSUPPORTED: [RegExp, string, string][] = [
  [/mail|notif/i, 'email a summary of everything to my team', 'send email'],
  [/pdf|export|report/i, 'export everything as a PDF report', 'export a PDF'],
  [/undo|restore|history/i, 'undo the last change I made', 'undo a change'],
  [/translat|locale|language/i, 'translate the whole service into French', 'translate it'],
  [/sms|phone|text message/i, 'text me on my phone whenever anything changes', 'send text messages'],
  [/calendar|meeting|schedul/i, 'book a meeting about this in my calendar', 'book calendar meetings'],
];
/** An operation's title as the rest of a sentence: "List tasks." -> "list tasks" (its id when the title has no plain text). */
const lower = (op: Operation) =>
  plain(op.title, 100).replace(/[`<>]/g, '').replace(/\.$/, '').replace(/(?<![\p{L}\p{N}])\p{Lu}\p{Ll}+/gu, (w) => w.toLowerCase()).trim() || op.id;
const required = (op: Operation) => op.inputs.filter((p) => p.required);
/** A realistic-looking value of the declared type for a prompt. */
const sample = (p: Param): unknown => {
  const listed = p.schema.enum?.[0] ?? p.schema.items?.enum?.[0];
  // Spec values reach prompts only when they are plain words.
  const value = typeof listed === 'string' && /^[\w .-]{1,40}$/.test(listed) ? listed : `example-${p.name}`;
  return { integer: 7, number: 7, boolean: true, array: [value] }[p.schema.type ?? ''] ?? value;
};
const given = (params: Param[]) => params.map((p) => `${p.name} ${JSON.stringify(sample(p))}`).join(' and ');

export function evalsJson({ model, graph, chains, slug, env, examples }: SkillContext): string {
  const title = label(model.source.title);
  const byId = new Map(model.operations.map((op) => [op.id, op]));
  const live = model.operations.filter((op) => !op.deprecated);
  const evals: Eval[] = [];
  const add = (id: string, prompt: string, expected: string) => evals.push({ id, prompt, expected_output: expected, files: [] });
  const ids = new Set<string>();
  /** `base`, then `base-2`, `base-3`, ... so padding never repeats an id. */
  const fresh = (base: string) => {
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    return id;
  };

  /** A chain as a prompt that names every step and an expected_output that lists only what fills required inputs (as run.mjs does). */
  const chainEval = (id: string, chain: Chain, dir?: string) => {
    const ops = chain.ops.map((o) => byId.get(o)!);
    const fed = ops.map((op, i) => (i ? feedPairs(chain.via[i - 1]).filter((p) => required(op).some((r) => r.name === p.to)) : []));
    const unfed = ops.map((op, i) => required(op).filter((r) => !fed[i]!.some((p) => p.to === r.name)));
    const steps = ops.map((op, i) => `${lower(op)}${unfed[i]!.length ? ` with ${given(unfed[i]!)}` : ''}${i ? ' for the first result' : ''}`);
    const hops = ops.slice(1).map((op, i) => fed[i + 1]!.length
      ? `${fed[i + 1]!.map((p) => `${p.from ?? 'a listed entry'} -> ${p.to}`).join(', ')} from ${chain.ops[i]}'s output into ${op.id}`
      : `only what ${op.id} requires from ${chain.ops[i]}'s output`);
    const extra = unfed.flat();
    const inferred = chain.inferred.flatMap((guess, i) => (guess ? [`${chain.ops[i]} -> ${chain.ops[i + 1]}`] : []));
    add(id, `With the ${title}: ${steps.join(', then ')}.`, [
      `Calls ${chain.ops.join(', then ')} in that order${dir ? ` (as in ${dir})` : ''}, passing ${hops.join(', then ')}`,
      ...(extra.length ? [`uses ${given(extra)} as given`] : []),
      ...(inferred.length ? [`says the ${inferred.join(' and ')} link${inferred.length > 1 ? 's are' : ' is'} inferred (matched by name, not declared in the spec) and checks each passed value before relying on it`] : []),
      'never invents an id or path; validates arguments with validateArgs before each call.',
    ].join('; '));
  };
  const destroys = (op: Operation) => Boolean(op.hints.destructive) || graph.crud[op.id] === 'delete';
  const singleCall = (id: string, op: Operation) => {
    const args = Object.fromEntries(required(op).map((p) => [p.name, sample(p)]));
    add(id, `With the ${title}, ${lower(op)}${required(op).length ? ` using ${given(required(op))}` : ''}.`,
      `Makes exactly one ${op.id} call with arguments ${JSON.stringify(args)} and nothing invented; ${op.method ? `${op.method.toUpperCase()} ${op.path}` : 'one tools/call request'}; reports the result.`);
  };
  const missingParam = (id: string, op: Operation) => {
    const p = required(op)[0]!;
    const rank = (from: string) => required(byId.get(from)!).length;
    const source = graph.edges.filter((e) => e.kind === 'feeds' && e.to === op.id && feedPairs(e.label).some((f) => f.to === p.name))
      .toSorted((a, b) => Number(a.confidence !== 'exact') - Number(b.confidence !== 'exact') || rank(a.from) - rank(b.from))[0];
    add(id, `With the ${title}, ${lower(op)}.`,
      `Does not guess ${p.name}, which ${op.id} requires: ${source ? `gets it from ${source.from} (${source.label}) or asks the user` : 'asks the user for it'} before calling ${op.id}; validateArgs would throw 'missing required argument "${p.name}"'.`);
  };
  const words = model.operations.map((op) => `${op.id} ${op.title} ${op.path ?? ''}`).join(' ');
  const absent = UNSUPPORTED.filter(([re]) => !re.test(words));
  const closest = live.find((op) => graph.crud[op.id] === 'list') ?? live[0] ?? model.operations[0]!;
  const unsupported = (id: string, [, ask, can]: [RegExp, string, string]) => add(id, `With the ${title}, ${ask}.`,
    `Says plainly that none of the ${model.operations.length} ${nouns(model)} in kit/operations.json can ${can}, does not fake it, and names the closest one, ${closest.id}, offering to use it instead.`);

  const top = chains[0];
  if (top) chainEval(fresh('main-chain'), top, examples[0]!.dir);
  const single = live.find((op) => graph.crud[op.id] === 'create' && required(op).length && !destroys(op)) ?? live.find((op) => required(op).length && !destroys(op));
  if (single) singleCall(fresh('single-call'), single);
  const lister = live.find((op) => graph.crud[op.id] === 'list' && required(op).length) ?? live.find((op) => op !== single && required(op).length);
  if (lister) missingParam(fresh('missing-param'), lister);
  const destructive = live.find(destroys);
  if (destructive) {
    add(fresh('destructive-confirm'), `With the ${title}, ${lower(destructive)}${required(destructive).length ? ` (${required(destructive).map((p) => `${p.name} ${JSON.stringify(sample(p))}`).join(', ')})` : ''}.`,
      `Before ${destructive.id}, says what it will delete or change and asks the user to confirm; calls ${destructive.id} only after a yes, passing { confirmed: true } (the kit refuses "${destructive.id} is destructive" otherwise).`);
  }
  const secured = live.find((op) => op.security.some((set) => set.length));
  const scheme = secured && model.auth.find((s) => secured.security[0]?.includes(s.id));
  const vars = scheme ? authEnv(env, scheme) : [];
  if (secured && vars.length) {
    add(fresh('missing-auth'), `With the ${title}, ${lower(secured)}. I have not set up any credentials.`,
      `Notices ${vars.join(' and ')} is unset (buildRequest lists it in missingAuth; request refuses to send ${secured.id}), asks the user to set it in the environment, and never invents, prints or commits a credential.`);
  }
  const paged = live.find((op) => op.pagination);
  if (paged) {
    add(fresh('pagination'), `With the ${title}, ${lower(paged)}: all of them, not just the first page.`,
      `Calls ${paged.id} repeatedly, passing ${paged.pagination!.params.join('/')} from each response, until a page is empty or has no next cursor; reports how many items it read in total.`);
  }
  unsupported(fresh('unsupported-capability'), absent[0] ?? UNSUPPORTED.at(-1)!);

  // Padding, most useful first, until there are MIN evals.
  const uncalled = live.filter((op) => !evals.some((e) => e.expected_output.includes(op.id)));
  const pad: (() => void)[] = [
    ...chains.slice(1).map((chain) => () => chainEval(fresh('chain'), chain)),
    ...uncalled.map((op) => () => add(fresh('call'), `With the ${title}, ${lower(op)}.`, `Calls ${op.id} with only arguments it declares, asking the user for any required one it cannot take from an earlier output.`)),
    ...live.filter((op) => op !== lister && required(op).length).map((op) => () => missingParam(fresh('missing-param'), op)),
    ...live.filter((op) => op !== single && !destroys(op) && !uncalled.includes(op)).map((op) => () => singleCall(fresh('single-call'), op)),
    ...absent.slice(1).map((entry) => () => unsupported(fresh('unsupported-capability'), entry)),
    // Always possible: an argument the operation does not declare.
    ...(live.length ? live : model.operations).map((op) => () => {
      let extra = 'colour';
      while (op.inputs.some((p) => p.name === extra)) extra = `${extra}X`;
      add(fresh('unknown-argument'), `With the ${title}, ${lower(op)}${required(op).length ? ` using ${given(required(op))}` : ''}, and set ${extra} to "blue" as well.`,
        `Does not pass ${extra}, which ${op.id} does not declare (validateArgs would throw 'unknown argument "${extra}"'); calls ${op.id} with only its declared arguments and tells the user ${extra} is not supported.`);
    }),
  ];
  for (const next of pad) {
    if (evals.length >= MIN) break;
    next();
  }
  return `${JSON.stringify({ skill_name: slug, evals }, null, 2)}\n`;
}
