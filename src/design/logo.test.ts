import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import appCss from '../app.css?raw';
import { Logo, Wordmark } from './Logo';
import { color } from './tokens';
import favicon from '../../public/favicon.svg?raw';
import logo from '../../public/logo.svg?raw';
import wordmark from '../../docs/media/wordmark.svg?raw';
import wordmarkDark from '../../docs/media/wordmark-dark.svg?raw';

const FILES: Record<string, string> = { 'logo.svg': logo, 'favicon.svg': favicon };
const bytes = (text: string) => new TextEncoder().encode(text).length;
const hexes = (text: string) => new Set(text.match(/#[0-9a-f]{6}\b/gi)?.map((h) => h.toLowerCase()));
const [INDIGO, AMBER, INK, INK_DARK] = [color('indigo-9', 'light'), color('amber-9', 'light'), color('gray-12', 'light'), color('gray-12', 'dark')];

describe('logo assets', () => {
  it.each(['logo.svg', 'favicon.svg'])('%s is a small, self-contained, labelled SVG', (name) => {
    const text = FILES[name]!;
    expect(bytes(text)).toBeLessThanOrEqual(1536);
    expect(text).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24"/);
    expect(text.trim().endsWith('</svg>')).toBe(true);
    expect(text).toContain('<title>spec2skill</title>');
    expect(text).not.toMatch(/<(script|image|text)\b|href=|var\(/); // no scripts, external refs, font text or CSS variables
  });

  it.each(['logo.svg', 'favicon.svg'])('%s draws the Overlap mark: indigo square, amber circle, ink overlap', (name) => {
    const text = FILES[name]!;
    expect(text).toContain(`<rect x="1.5" y="1.5" width="13.5" height="13.5" rx="3" fill="${INDIGO}"/>`);
    expect(text).toContain(`<circle cx="15.5" cy="15.5" r="7" fill="${AMBER}"/>`);
    expect(text).toMatch(/<circle [^>]*clip-path="url\(#a\)"/);
  });

  it('logo.svg uses the light values; the favicon flips its ink with prefers-color-scheme', () => {
    expect(hexes(logo)).toEqual(new Set([INDIGO, AMBER, INK]));
    expect(hexes(favicon)).toEqual(new Set([INDIGO, AMBER, INK, INK_DARK]));
    expect(favicon).toContain(`@media (prefers-color-scheme:dark){.i{fill:${INK_DARK}}}`);
  });

  it('the README wordmarks are the mark plus outlined text, in light and dark ink', () => {
    for (const [text, ink] of [[wordmark, INK], [wordmarkDark, INK_DARK]] as const) {
      expect(text).toContain('<title>spec2skill</title>');
      expect(text).not.toMatch(/<(script|image|text|tspan)\b|href=|var\(/);
      expect(hexes(text)).toEqual(new Set([INDIGO, AMBER, ink]));
    }
  });
});

describe('Logo', () => {
  it('is decorative (the wordmark text names it) and filled from the Radix tokens', () => {
    const svg = renderToStaticMarkup(createElement(Logo));
    expect(svg).toMatch(/^<svg class="logo" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"/);
    expect(svg).not.toMatch(/<(text|tspan|foreignObject|image)\b/);
    expect(appCss).toContain('.logo-spec { fill: var(--indigo-9); }');
    expect(appCss).toContain('.logo-skill { fill: var(--amber-9); }');
    expect(appCss).toContain('.logo-both { fill: var(--gray-12); }');
  });

  it('gives every instance its own clip path id', () => {
    const html = renderToStaticMarkup(createElement(Fragment, null, createElement(Logo), createElement(Logo, { size: 48 })));
    const ids = [...html.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);
    const refs = [...html.matchAll(/clip-path="url\(#([^)]+)\)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(refs).toEqual(ids);
    expect(ids.every((id) => /^s2s-[\w-]+$/.test(id!))).toBe(true);
  });

  it('the wordmark is the mark and the product name as text', () => {
    const html = renderToStaticMarkup(createElement(Wordmark));
    expect(html).toMatch(/^<span class="wordmark"><svg class="logo"[^]*<\/svg>spec2skill<\/span>$/);
  });
});
