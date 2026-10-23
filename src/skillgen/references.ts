// references/*.md: one page per resource cluster plus auth, workflows, and pagination and errors.
// Spec text appears only as blockquotes or table cells (sanitize.ts).
import type { Edge } from '../graph/types';
import { outputFields, typeLabel } from '../model/examples';
import type { Operation, SchemaRef } from '../model/types';
import { authEnv } from './kit';
import { chainText } from './prose';
import { CAP, code, inert, label, quote } from './sanitize';
import type { FileTree, SkillContext } from './types';

const BACK = 'Back to [SKILL.md](../SKILL.md).';
const MAX_LINKS = 8;
const row = (cells: string[]) => `| ${cells.join(' | ')} |`;
const table = (head: string[], rows: string[][]) => [row(head), row(head.map(() => '---')), ...rows.map(row)];
const page = (title: string, intro: string, ...blocks: string[][]) => `${[`# ${title}`, '', intro, ...blocks.flatMap((b) => ['', ...b])].join('\n')}\n`;

export const hints = (op: Operation, crud?: string) =>
  [crud, op.hints.readOnly && 'read-only', op.hints.destructive && 'destructive: confirm first', op.hints.idempotent && 'idempotent',
    op.pagination && `paginated (${op.pagination.style})`, op.deprecated && 'deprecated'].filter(Boolean).join(' · ');

const steps = (edges: Edge[], end: 'from' | 'to') => {
  const shown = edges.slice(0, MAX_LINKS).map((e) => `${code(e[end])} (${code(e.label)}${e.confidence === 'inferred' ? ', inferred' : ''})`);
  return shown.join(', ') + (edges.length > MAX_LINKS ? ` and ${edges.length - MAX_LINKS} more` : '');
};

function operationBlock(ctx: SkillContext, op: Operation): string[] {
  const feeds = ctx.graph.edges.filter((e) => e.kind === 'feeds');
  const next = feeds.filter((e) => e.from === op.id);
  const from = feeds.filter((e) => e.to === op.id);
  const where = op.method ? code(`${op.method.toUpperCase()} ${op.path}`) : `MCP tool ${code(op.id)}`;
  const named = (s?: SchemaRef) => (s?.ref && ctx.model.schemas[s.ref]) || s;
  const values = (s: SchemaRef) => named(s)?.enum ?? (named(s)?.type === 'array' ? named(named(s)!.items)?.enum : undefined);
  const params = op.inputs.map((p) => {
    const one = values(p.schema);
    const many = one && named(p.schema)?.type === 'array' ? 'each one of' : 'one of';
    return [code(p.name), p.in, p.required ? 'yes' : 'no', inert(typeLabel(p.schema), 80),
      inert([one && `${many} ${one.map(String).join(', ')}`, p.description].filter(Boolean).join('. '), 300)];
  });
  const fields = outputFields(ctx.model, op.output?.schema).map((f) => code(f.name));
  return [
    `## ${code(op.id)}`, '', `${where} · ${hints(op, ctx.graph.crud[op.id])}`, '', quote(op.title, CAP.summary),
    ...(op.description && op.description !== op.title ? ['>', quote(op.description)] : []), '',
    ...(params.length ? table(['Param', 'In', 'Required', 'Type', 'Notes'], params) : ['Takes no arguments.']), '',
    op.output ? `Returns ${code(typeLabel(op.output.schema))}${fields.length ? ` with ${fields.join(', ')}` : ''}.` : 'Returns no documented body.',
    ...(next.length ? ['', `Feeds: ${steps(next, 'to')}.`] : []),
    ...(from.length ? ['', `Fed by: ${steps(from, 'from')}.`] : []),
  ];
}

export function referenceFiles(ctx: SkillContext): FileTree {
  const { model, graph, chains, env } = ctx;
  const byId = new Map(model.operations.map((op) => [op.id, op]));
  const files: FileTree = {};
  for (const c of graph.clusters) {
    const name = label(c.name, c.id);
    files[`references/${ctx.refFiles.get(c.id)}.md`] = page(name, `${inert(ctx.prose.clusters[c.id] ?? c.description, CAP.summary)}. ${BACK}`,
      ...c.operationIds.map((id) => operationBlock(ctx, byId.get(id)!)));
  }

  const open = model.operations.filter((op) => op.security.length === 0 || op.security.some((set) => set.length === 0));
  files['references/auth.md'] = page('Auth', `How calls authenticate.${model.auth.length ? ' `buildRequest` in `kit/client.mjs` reads the variables below and lists any unset one in `missingAuth` (sending a `$NAME` placeholder). Never print or commit their values.' : ''} ${BACK}`,
    model.auth.length
      ? table(['Scheme', 'Type', 'Environment variables', 'Notes'], model.auth.map((s) => [code(s.id), inert([s.type, s.scheme, s.in && `in ${s.in}`, s.name && `as ${s.name}`].filter(Boolean).join(' '), 80),
        authEnv(env, s).map(code).join(', ') || 'none', inert(s.description, 300)]))
      : ['The source declares no auth. If calls are refused, ask the user how the server authenticates; never guess a credential.'],
    [open.length ? `No auth needed: ${open.map((op) => code(op.id)).join(', ')}.` : 'Every operation needs auth.']);

  files['references/workflows.md'] = page('Workflows', `Chains where one call's output feeds the next call's input, strongest first. A step marked inferred matches by meaning, not by name: check the value before you rely on it. Each step names the output field and the input it fills, so you know where every required id comes from. \`kit/chains.mjs\` exports them as \`chains\`, with \`nextSteps(id)\` and \`sources(id)\` for single steps. ${BACK}`,
    chains.length
      ? chains.flatMap((chain, i) => [`## ${i + 1}. ${chain.ops.map(code).join(' -> ')}${chain.inferred.some(Boolean) ? ' (inferred)' : ''}`, '', chainText(chain), ''])
      : ['No output of one operation matches an input of another: take ids from the user, never invent them.']);

  const paged = model.operations.filter((op) => op.pagination);
  const failures = new Map<string, string[]>();
  for (const op of model.operations) {
    for (const r of op.responses) {
      const key = inert(`${r.status}${r.description ? ` ${r.description}` : ''}`, CAP.summary);
      if (!r.status.startsWith('2')) failures.set(key, [...(failures.get(key) ?? []), code(op.id)]);
    }
  }
  files['references/pagination-and-errors.md'] = page('Pagination and errors', `How lists continue and calls fail. ${BACK}`,
    ['## Pagination', '', ...(paged.length
      ? [...table(['Operation', 'Style', 'Params'], paged.map((op) => [code(op.id), op.pagination!.style, op.pagination!.params.map(code).join(', ')])), '',
        'Keep calling with the cursor, offset or page from the last response until it is empty or the page is short; say how many items you read.']
      : ['No operation declares pagination.'])],
    ['## Errors', '', 'The kit throws `ArgsError` before anything is sent: unknown operation, unknown or missing argument, wrong type, value outside the enum; the message names the operation and the argument. Report it, fix the arguments from an earlier output or the user, and never retry a 4xx with guessed arguments.',
      ...(failures.size ? ['', ...table(['Documented failure', 'Operations'], [...failures].map(([f, ids]) => [f, ids.join(', ')]))] : [])],
    ['## Known gaps in the source spec', '', ...(model.warnings.length ? table(['Warning', 'Message'], model.warnings.map((w) => [code(w.code), inert(w.message, 300)])) : ['None reported.'])]);
  return files;
}
