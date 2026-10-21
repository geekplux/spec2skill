// `spec2skill <url|file>` / `spec2skill --sample <id>`: the skill directory on disk, then the audit.
// Deterministic only (no AI, no key); `fetch` and the output streams are injected for tests.
// Exit codes: 0 ok, 1 audit failed, 2 usage error (or a target in use), 3 input, parse or fetch error.
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pkg from '../../package.json';
import { buildGraph } from '../graph';
import { SAMPLES } from '../samples';
import { auditTree } from '../skillgen/audit-core';
import { generateSkill, skillSlug } from '../skillgen';
import { kebab } from '../skillgen/sanitize';
import { explain } from '../source/errors';
import type { Mode } from '../source/fetchSource';
import type { FetchFn } from '../../worker/limits';
import { WriteError, writeTree } from './fs';
import { CliInputError, type Input, loadModel } from './load';

export const EXIT = { ok: 0, auditFailed: 1, usage: 2, input: 3 } as const;

const ids = SAMPLES.map((s) => s.id).join('|');
export const USAGE = `Usage: spec2skill <url|file> [options]
       spec2skill --sample <${ids}> [options]

Turns an OpenAPI 3.x / Swagger 2.0 spec (file or URL) or an MCP server URL into an
agent skill directory at <out>/<slug>/, then audits it. No AI, no account, no key.

Options:
  --out <dir>       parent directory for the skill (default: .)
  --slug <name>     skill name and folder (default: from the API title)
  --license <id>    licence in SKILL.md (default: MIT)
  --source <kind>   auto | openapi | mcp: how to treat a URL (default: auto)
  --sample <id>     use a built-in sample (offline): ${ids.replaceAll('|', ', ')}
  --force           write into a non-empty <out>/<slug>/, overwriting files
  --quiet           print only the final audit line
  -h, --help        show this help
  -v, --version     show the version

URLs are fetched directly from this machine (10 s, 5 MB, 3 redirects), with no
credentials; MCP servers are only asked for tools/list (never tools/call).
Exit codes: 0 ok, 1 audit failed, 2 usage error, 3 input, parse or fetch error.`;

export interface CliDeps {
  fetch: FetchFn;
  cwd: string;
  out: (line: string) => void;
  err: (line: string) => void;
}

const OPTIONS = {
  out: { type: 'string' }, slug: { type: 'string' }, license: { type: 'string' }, source: { type: 'string' }, sample: { type: 'string' },
  force: { type: 'boolean' }, quiet: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
} as const;

type Parsed = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>['values'];

/** The input the arguments ask for, or a usage problem. */
export function inputOf(values: Parsed, positionals: string[]): Input | string {
  const mode = values.source ?? 'auto';
  if (!['auto', 'openapi', 'mcp'].includes(mode)) return `--source must be auto, openapi or mcp (got "${mode}")`;
  if (values.sample !== undefined) {
    if (positionals.length) return 'give either --sample or a URL/file, not both';
    if (!SAMPLES.some((s) => s.id === values.sample)) return `unknown sample "${values.sample}" (try ${ids.replaceAll('|', ', ')})`;
    return { sample: values.sample };
  }
  if (positionals.length !== 1) return positionals.length ? 'give exactly one URL or file' : 'missing <url|file> (or --sample <id>)';
  return { source: positionals[0]!, mode: mode as Mode };
}

export async function run(argv: string[], deps: CliDeps): Promise<number> {
  let values: Parsed;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true }));
  } catch (e) {
    deps.err(`spec2skill: ${e instanceof Error ? e.message : String(e)}\n\n${USAGE}`);
    return EXIT.usage;
  }
  if (values.help) return deps.out(USAGE), EXIT.ok;
  if (values.version) return deps.out(`spec2skill ${pkg.version}`), EXIT.ok;
  const input = inputOf(values, positionals);
  if (typeof input === 'string') return deps.err(`spec2skill: ${input}\n\n${USAGE}`), EXIT.usage;
  const say = values.quiet ? () => {} : deps.out;

  let model;
  try {
    model = await loadModel(input, deps.fetch);
    if (!model.operations.length) throw new CliInputError('The spec has no operations or tools, so there is nothing to write a skill for.');
  } catch (e) {
    if (e instanceof CliInputError) return deps.err(`spec2skill: ${e.message}`), EXIT.input;
    const { title, reason, command } = explain(e);
    deps.err([`spec2skill: ${title}`, reason, command].filter(Boolean).join('\n'));
    return EXIT.input;
  }
  const options = { ...(values.slug !== undefined && { slug: values.slug }), ...(values.license && { license: values.license }) };
  const slug = (options.slug && kebab(options.slug)) || skillSlug(model);
  const tree = generateSkill(model, buildGraph(model), options);
  const target = resolve(deps.cwd, values.out ?? '.', slug);
  try {
    writeTree(target, tree, values.force);
  } catch (e) {
    if (!(e instanceof WriteError)) throw e;
    return deps.err(`spec2skill: ${e.message}`), EXIT.usage;
  }
  say(`wrote ${Object.keys(tree).length} files to ${target}`);
  const { ok, checks } = auditTree(tree);
  for (const c of checks) say(c.ok ? `ok    ${c.label}` : `FAIL  ${c.label}: ${c.reason}`);
  (ok ? deps.out : deps.err)(ok ? 'audit passed' : `audit failed: ${checks.filter((c) => !c.ok).length} of ${checks.length} checks`);
  return ok ? EXIT.ok : EXIT.auditFailed;
}
