// The page shell (docs/redesign/DESIGN.md 4, R2): structure and copy, rendered to static markup.
// Behaviour (Enter, drop, arrow keys, in-page links) is covered by scripts/browser/flows/redesign-r2.mjs
// and phase-15-source-input.mjs.
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SAMPLES } from '../samples';
import { SourceError, explain } from '../source/errors';
import { Samples } from '../source/Samples';
import { SourceInput } from '../source/SourceInput';
import { ErrorPanel } from '../source/Status';
import { Layout } from './Layout';
import { CLI_COMMANDS } from './Sections';

const noop = () => {};
const page = () => renderToStaticMarkup(createElement(Layout, {
  source: createElement(SourceInput, { value: '', onValue: noop, onLoad: noop, onGenerate: noop, field: createRef() }),
  samples: createElement(Samples, { value: 'tasks', onSelect: noop }),
  busy: false, onShortcuts: noop, children: createElement('p', null, 'result'),
}));

describe('page shell', () => {
  const html = page();
  it('has one h1 (the hero), the lede, and the header links without buttons other than the phone menu', () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('<h1 id="hero-title">Turn any API into an agent skill</h1>');
    expect(html).toContain('Paste an OpenAPI spec or an MCP server. Get a tested skill, and a map to check what it teaches.');
    const header = /<header[\s\S]*<\/header>/.exec(html)![0];
    expect([...header.matchAll(/<a [^>]*>([^<]*)</g)].map((m) => m[1])).toEqual(['', 'How it works', 'Command line', 'GitHub']);
    expect(header).toContain('href="#how"');
    expect(header).toContain('href="#cli"');
    expect(header).toContain('href="https://github.com/geekplux/spec2skill"');
    expect([...header.matchAll(/<button[^>]*aria-label="([^"]*)"/g)].map((m) => m[1])).toEqual(['Menu']);
    expect(html).not.toContain('Generate skill');
    expect(html).not.toContain('class="pitch"');
  });

  it('puts the source field and the samples in the hero, and the result in the frame', () => {
    const hero = /<section class="hero"[\s\S]*?<\/section>/.exec(html)![0];
    expect(hero).toContain('placeholder="OpenAPI or MCP URL, or paste the spec"');
    expect(hero).toContain('aria-label="Open a spec file"');
    expect(hero).toMatch(/<button type="submit" class="generate">Generate<\/button>/);
    expect(hero).toContain('role="radiogroup" aria-labelledby="samples-label"');
    expect(html).toMatch(/<section id="result" class="frame stage" tabindex="-1" aria-label="Result">[\s\S]*<p>result<\/p>/);
  });

  it('has no source-kind selector and no More options (detection is automatic, D37)', () => {
    expect(html).not.toMatch(/<select|More options|Auto-detect/);
  });

  it('has the Command line, How it works and Made by sections and the footer, with the target copy', () => {
    expect(html).toContain('id="cli"');
    expect(html).toContain('Run it from the command line');
    expect(html).toContain('Writes the skill to disk and ends with its audit. Works offline, with no key.');
    for (const c of CLI_COMMANDS) expect(html).toContain(c.replace('&&', '&amp;&amp;'));
    expect(html).toContain('aria-label="Copy commands"');
    expect(html).toContain('id="how"');
    expect([...html.matchAll(/<li><b>([^<]+)<\/b>/g)].map((m) => m[1])).toEqual(['Parse', 'Relate', 'Write and audit', 'Check']);
    expect(html).toContain('Made by GeekPlux');
    expect(html).toContain('href="https://geekplux.com"');
    for (const href of ['https://vert.geekplux.org', 'https://explorable.geekplux.com', 'https://reasontrail.geekplux.com', 'https://github.com/geekplux/markvis']) {
      expect(html).toContain(`href="${href}"`);
    }
    const footer = /<footer[\s\S]*<\/footer>/.exec(html)![0];
    expect([...footer.matchAll(/<(?:a|button)\b[^>]*>([^<]+)</g)].map((m) => m[1])).toEqual(['How it works', 'GitHub', 'Keyboard shortcuts', 'MIT licence']);
    expect(footer).toContain('href="https://github.com/geekplux/spec2skill/blob/main/LICENSE"');
  });
});

describe('Samples', () => {
  it('is a radio group with one radio per sample, the shown one checked', () => {
    const html = renderToStaticMarkup(createElement(Samples, { value: 'petstore', onSelect: noop }));
    const radios = [...html.matchAll(/<input ([^>]*)\/>([^<]+)/g)].map(([, attrs, label]) => [/value="(\w+)"/.exec(attrs!)?.[1], /type="radio"/.test(attrs!) && /name="sample"/.test(attrs!) && /\bchecked=""/.test(attrs!), label]);
    expect(radios)
      .toEqual(SAMPLES.map((s) => [s.id, s.id === 'petstore', s.label]));
    expect(SAMPLES.map((s) => s.label)).toEqual(['Tasks API', 'Petstore', 'Filesystem MCP']);
  });

  it('has nothing selected while a user source is shown', () => {
    expect(renderToStaticMarkup(createElement(Samples, { value: undefined, onSelect: noop }))).not.toContain('checked');
  });
});

describe('ErrorPanel', () => {
  it('offers exactly the two recovery actions', () => {
    const html = renderToStaticMarkup(createElement(ErrorPanel, { error: explain(new SourceError('html-page')), onPaste: noop, onSample: noop }));
    expect([...html.matchAll(/<button[^>]*>([^<]+)</g)].map((m) => m[1])).toEqual(['Paste spec text instead', 'Try a sample']);
  });
});
