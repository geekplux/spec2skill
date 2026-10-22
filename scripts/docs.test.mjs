// Open-source packaging (phase 19): the docs link check, and the repo files a visitor and GitHub read.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';
import { DOCS, codeSpans, linkTargets, problemsIn } from './check-links.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (path) => readFileSync(join(root, path), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'links-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('check-links', () => {
  it('finds relative Markdown, reference and HTML targets, skipping external links, anchors and fenced code', () => {
    const md = '[a](docs/A.md#x) ![i](img/p.png "t") [w](https://x.test) [h](#top)\n[ref]: ../B.md\n<img src="c.svg">\n```\n[no](skip.md)\n```\n';
    expect(linkTargets(md)).toEqual(['docs/A.md', 'img/p.png', '../B.md', 'c.svg']);
  });
  it('collects repo paths and function names from code spans', () => {
    expect(codeSpans('`src/a.ts` `buildGraph()` `node x` `<skill>/scripts/a.mjs` `scripts/`')).toEqual({ paths: ['src/a.ts', 'scripts/'], functions: ['buildGraph'] });
  });
  it('reports broken links, missing paths and undefined functions', () => {
    mkdirSync(join(tmp, 'src'), { recursive: true });
    writeFileSync(join(tmp, 'src', 'a.ts'), 'export function real() {}\n');
    writeFileSync(join(tmp, 'DOC.md'), '[ok](src/a.ts) [gone](src/b.ts) `src/c.ts` `real()` `ghost()`\n');
    expect(problemsIn(tmp, 'DOC.md', 'export function real() {}')).toEqual([
      'DOC.md: broken link src/b.ts',
      'DOC.md: no such path `src/c.ts`',
      'DOC.md: no function `ghost()` in src, worker, scripts',
    ]);
  });
  it('passes on the repo docs', () => {
    expect(DOCS.flatMap((file) => problemsIn(root, file))).toEqual([]);
  });
});

describe('repo packaging', () => {
  it('README leads with the pitch, hero, demo placeholder, the skill tree with audit passed, and quick start', () => {
    const readme = read('README.md');
    const top = readme.slice(0, readme.indexOf('## Why spec2skill'));
    for (const text of ['Turn any OpenAPI spec or MCP server into an agent skill in one click.', '](docs/media/hero.png)', 'Live demo:', 'SKILL.md', 'evals/evals.json', 'audit passed', 'pnpm install && pnpm dev', 'pnpm cli --sample tasks']) {
      expect(top).toContain(text);
    }
    expect(readme).not.toMatch(/tool-atlas|mcp2skill/i);
  });
  it('has an MIT licence, the Contributor Covenant 2.1 and a changelog with an Unreleased release', () => {
    expect(read('LICENSE')).toMatch(/^MIT License\n\nCopyright \(c\) \d{4} spec2skill contributors\n/);
    expect(read('CODE_OF_CONDUCT.md')).toMatch(/^# Contributor Covenant Code of Conduct[\s\S]*version 2\.1/);
    expect(read('CHANGELOG.md')).toMatch(/^## \[0\.1\.0\] - Unreleased$/m);
  });
  it('has issue forms that parse as YAML, and no workflow files', () => {
    for (const name of ['bug_report', 'feature_request', 'spec_not_mapped']) {
      const form = load(read(`.github/ISSUE_TEMPLATE/${name}.yml`));
      expect([name, Boolean(form.name && form.description), form.body.length > 1]).toEqual([name, true, true]);
      for (const item of form.body) expect(['markdown', 'textarea', 'input', 'dropdown', 'checkboxes']).toContain(item.type);
    }
    expect(load(read('.github/ISSUE_TEMPLATE/config.yml')).blank_issues_enabled).toBe(false);
    expect(existsSync(join(root, '.github', 'pull_request_template.md'))).toBe(true);
    expect(existsSync(join(root, '.github', 'workflows'))).toBe(false);
  });
  it('has a CI workflow that parses and runs every check', () => {
    const ci = load(read('ci/github-workflow.yml'));
    const runs = Object.values(ci.jobs).flatMap((job) => job.steps.map((s) => s.run ?? '')).join('\n');
    for (const cmd of ['pnpm lint', 'pnpm typecheck', 'pnpm test', 'pnpm build', 'pnpm check:size', 'pnpm check:browser', 'pnpm build:cli', 'pnpm gallery --check', 'node --test', 'scripts/audit.mjs']) {
      expect(runs).toContain(cmd);
    }
  });
  it('has a 1280x640 social preview under 1 MB and a README hero', () => {
    const png = readFileSync(join(root, 'docs', 'social-preview.png'));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1280, 640]);
    expect(png.length).toBeLessThan(1024 * 1024);
    expect(statSync(join(root, 'docs', 'media', 'hero.png')).size).toBeGreaterThan(10_000);
  });
});
