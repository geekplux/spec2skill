// The skill browser (redesign R5; was SkillPane.test.ts): every check the pane had, on the new markup.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SkillBrowser, checkText } from './SkillBrowser';
import type { Skill } from './useSkill';

const skill: Skill = {
  hash: 'h', slug: 'tasks-api', run: 0, prose: 'deterministic', zip: () => new Uint8Array(),
  tree: { 'SKILL.md': '---\nname: tasks-api\n---\n<script>alert(1)</script>\n<img src=x onerror=alert(2)>\n', 'references/tasks.md': '# Tasks\n' },
  audit: { ok: false, checks: [{ id: 'frontmatter', label: 'f', ok: true }, { id: 'evals', label: 'e', ok: false, reason: 'only 4 evals (need at least 5)' }] },
};
const render = (props: Partial<Parameters<typeof SkillBrowser>[0]> = {}) =>
  renderToStaticMarkup(createElement(SkillBrowser, {
    skill, ready: true, empty: false, options: { key: 'h', slug: 'tasks-api', license: 'MIT' }, onOptions: () => {},
    file: 'SKILL.md', open: false, onFile: () => {}, onClose: () => {}, run: 0, phone: false, ...props,
  }));

describe('SkillBrowser', () => {
  it('previews the selected file as literal text with generated line numbers, never markup (S3)', () => {
    const html = render();
    expect(html).toContain('<h3 id="file-head"><span class="fname">SKILL.md</span><span class="visually-hidden">, </span><span class="lines">5 lines</span></h3>');
    expect(html).toContain('<div id="skill-preview" class="code" tabindex="0" role="region" aria-labelledby="file-head">');
    expect(html).toContain('<div class="l" data-n="4">&lt;script&gt;alert(1)&lt;/script&gt;</div>');
    expect(html).not.toMatch(/<(script|img)\b/);
    expect(html).toContain('aria-label="Copy SKILL.md"');
  });
  it('heads the files with the slug and opens no options until asked', () => {
    const html = render();
    expect(html).toContain('<h3 class="sb-head mono" id="skill-title" tabindex="-1">tasks-api/<span class="visually-hidden"> skill</span></h3>');
    expect(html).toContain('<button type="button" class="edit" aria-expanded="false" aria-controls="skill-options">Edit name and licence</button>');
    expect(html).not.toContain('id="opt-slug"');
  });
  it('shows the audit open, every check in text, a failure with an amber ! and the word Failed', () => {
    const html = render();
    expect(html).toContain('<span class="verdict">');
    expect(html).toContain('Audit failed</span><span class="visually-hidden">, </span><span class="tally">1 of 2</span>');
    expect(html).toMatch(/<li data-ok="true"[^>]*><svg class="i-check"[\s\S]*?Frontmatter has name, description, license and compatibility<span class="visually-hidden">: passed<\/span>/);
    expect(html).toMatch(/<li data-ok="false"[^>]*><svg class="i-fail"[\s\S]*?E: <strong>Failed<\/strong>, only 4 evals \(need at least 5\)/);
    expect(html).not.toContain('<details');
    expect(html).not.toContain('hidden=""'); // nothing collapsed on desktop
  });
  it('on phones: no preview until a file is opened, and the audit is one row that expands', () => {
    const closed = render({ phone: true });
    expect(closed).not.toContain('id="skill-preview"');
    expect(closed).toContain('<button type="button" class="audit-row" aria-expanded="false" aria-controls="audit-checks">');
    expect(closed).toContain('<ul class="checks" id="audit-checks" hidden=""');
    const open = render({ phone: true, open: true, file: 'references/tasks.md' });
    expect(open).toContain('<span class="fname">references/tasks.md</span><span class="visually-hidden">, </span><span class="lines">1 line</span>');
    expect(open).toContain('Close<span class="visually-hidden"> references/tasks.md</span>');
  });
  it('shows the static outline while writing, and the empty sentence when there are no operations', () => {
    expect(render({ skill: undefined, ready: false })).toContain('Writing skill…');
    const empty = render({ skill: undefined, ready: false, empty: true });
    expect(empty).toContain('<p class="sb-note" id="skill-empty">No operations, so no skill to write.</p>');
    expect(empty).not.toContain('Edit name and licence');
  });
  it('marks a stale skill in words, not by fading the text', () => {
    const html = render({ ready: false });
    expect(html).toContain('<div class="sb-preview" data-stale="true">');
    expect(html).toContain('<span class="lines">5 lines</span><span class="visually-hidden">, </span><span class="lines">Updating…</span>');
    expect(render()).not.toContain('Updating');
  });
  it('falls back to SKILL.md when the selected file is not in this skill', () => {
    expect(render({ file: 'references/nope.md' })).toContain('<span class="fname">SKILL.md</span>');
    expect(render({ file: 'references/tasks.md' })).toContain('<span class="fname">references/tasks.md</span>');
  });
});

describe('checkText', () => {
  const tree = { 'examples/a/run.mjs': '', 'examples/b/run.mjs': '', 'examples/b/README.md': '', 'evals/evals.json': JSON.stringify({ evals: [1, 2, 3, 4, 5, 6, 7] }) };
  it('counts what the browser can see, and never claims the examples ran', () => {
    expect(checkText({ id: 'examples', label: 'x', ok: true }, tree)).toBe('2 worked examples are present');
    expect(checkText({ id: 'evals', label: 'x', ok: true }, tree)).toBe('7 evals name known operations');
    expect(checkText({ id: 'evals', label: 'evals/evals.json: at least 5', ok: false, reason: 'r' }, tree)).toBe('Evals/evals.json: at least 5');
    expect(checkText({ id: 'body', label: 'SKILL.md body is at most 200 lines', ok: true }, tree)).toBe('SKILL.md body is at most 200 lines');
  });
});
