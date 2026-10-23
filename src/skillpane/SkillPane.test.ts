import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SkillPane } from './SkillPane';
import type { Skill } from './useSkill';

const skill: Skill = {
  hash: 'h', slug: 'tasks-api', run: 0, prose: 'deterministic', zip: () => new Uint8Array(),
  tree: { 'SKILL.md': '---\nname: tasks-api\n---\n<script>alert(1)</script>\n<img src=x onerror=alert(2)>\n', 'references/tasks.md': '# Tasks\n' },
  audit: { ok: false, checks: [{ id: 'frontmatter', label: 'f', ok: true }, { id: 'evals', label: 'e', ok: false, reason: 'only 4 evals (need at least 5)' }] },
};
const render = (props: Partial<Parameters<typeof SkillPane>[0]> = {}) =>
  renderToStaticMarkup(createElement(SkillPane, {
    skill, ready: true, empty: false, options: { key: 'h', slug: 'tasks-api', license: 'MIT' }, onOptions: () => {}, file: 'SKILL.md', onFile: () => {}, run: 0, ...props,
  }));

describe('SkillPane', () => {
  it('previews the selected file as literal text, never markup (S3)', () => {
    const html = render();
    expect(html).toContain('<p class="file-head" id="file-head"><code>SKILL.md</code> · 5 lines</p>');
    expect(html).toContain('<pre id="skill-preview" class="preview" tabindex="0" role="region" aria-labelledby="file-head">');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toMatch(/<(script|img)\b/);
  });
  it('states every audit check in text, with a glyph that is not the only signal', () => {
    const html = render();
    expect(html).toContain('<span class="mark" aria-hidden="true">✗</span> <span class="verdict">Audit failed:</span> <span class="tally">1 of 2 checks</span></summary>');
    expect(html).toContain('<span class="mark" aria-hidden="true">✓</span> Frontmatter: <span class="status">passed</span>');
    expect(html).toContain('<span class="status">failed: only 4 evals (need at least 5)</span><span class="visually-hidden"> (e)</span>');
    expect(html).not.toContain('title=');
  });
  it('names the install commands after the slug, behind a labelled disclosure (closed), with the audit rows', () => {
    const html = render();
    expect(html).toContain('<details class="install"><summary>Install command</summary><pre><code>unzip tasks-api-skill.zip -d .claude/skills/ &amp;&amp;\n  node .claude/skills/tasks-api/scripts/audit.mjs .claude/skills/tasks-api</code></pre>');
    expect(html).toContain('<details class="audit" data-ok="false"><summary>');
    expect(html).not.toMatch(/<details[^>]* open/);
  });
  it('shows the static outline while writing, and disables Download with a reason when there are no operations', () => {
    expect(render({ skill: undefined, ready: false })).toContain('Writing skill…');
    const empty = render({ skill: undefined, ready: false, empty: true });
    expect(empty).toContain('No operations, so no skill to write.');
    expect(empty).toMatch(/<button type="button" class="btn primary" disabled="" aria-describedby="skill-empty">/);
    expect(empty).not.toContain('Install command'); // nothing to install
  });
  it('marks a stale skill in words, not by fading the text', () => {
    const html = render({ ready: false });
    expect(html).toContain('<div class="skill-body" data-stale="true">');
    expect(html).toContain('5 lines · Updating…</p>');
    expect(render()).not.toContain('Updating');
  });
  it('falls back to SKILL.md when the selected file is not in this skill', () => {
    expect(render({ file: 'references/nope.md' })).toContain('<code>SKILL.md</code> · 5 lines');
    expect(render({ file: 'references/tasks.md' })).toContain('<code>references/tasks.md</code> · 1 lines');
  });
});
