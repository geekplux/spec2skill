// No motion outside DESIGN.md 7's table (redesign R6): every transition and animation in the app's CSS
// and inline styles is one of the listed moments, ease-out at 250 ms (a workflow segment 300), and every
// animation is declared only under prefers-reduced-motion: no-preference.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import appCss from '../app.css?raw';
import tokensCss from './tokens.css?raw';
import { TIMING, enterMs } from './motion';

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first `@media <query> {` block, matched by braces, and the source without it. */
function mediaBlock(css: string, query: string): { body: string; rest: string } {
  const start = css.indexOf(`@media ${query}`);
  if (start < 0) return { body: '', rest: css };
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return { body: css.slice(open + 1, i), rest: css.slice(0, start) + css.slice(i + 1) };
  }
  throw new Error(`unclosed @media ${query}`);
}

/** `selector { ... prop: value ... }` for every declaration of `prop` (flat rules; @media wrappers dropped). */
function declarations(css: string, prop: string): { selector: string; value: string }[] {
  const flat = css.replace(/@media[^{]*\{/g, '');
  const out: { selector: string; value: string }[] = [];
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const d of m[2]!.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g'))) out.push({ selector: m[1]!.trim(), value: d[1]!.trim() });
  }
  return out;
}

const css = strip(appCss);
const motion = mediaBlock(css, '(prefers-reduced-motion: no-preference)');

describe('motion (DESIGN.md 7)', () => {
  it('has transitions only for the hover moment: an operation row and its text, and the links fading', () => {
    expect(declarations(motion.rest, 'transition').map((d) => `${d.selector} | ${d.value}`)).toEqual([
      '.ln | stroke var(--motion-map) ease-out',
      '.op | background-color var(--motion-map) ease-out',
      '.op .m, .op .id, .rc-name | color var(--motion-map) ease-out',
      '.lrow | background-color var(--motion-map) ease-out',
    ]);
  });

  it('declares animations only under prefers-reduced-motion: no-preference, each one a moment of the table', () => {
    expect(declarations(motion.rest, 'animation[\\w-]*')).toEqual([]);
    const animations = declarations(motion.body, 'animation');
    expect(animations.map((a) => a.selector)).toEqual([
      '[data-enter] .rc', '[data-enter] .links', '[data-enter] :is(.halo, .wf)', '[data-enter] .wf', '[data-enter] .op[data-route]::after',
      '[data-enter] .checks li', '[data-enter] .lgroup', '[data-enter] .audit-row', '.ln-hot', '.op-card', '.swap', '.spinner',
    ]);
    const parts = animations.flatMap(({ selector, value }) => value.split(/,(?![^(]*\))/).map((one) => {
      const [name, duration, easing] = one.trim().split(/\s+/);
      return { selector, name, duration, easing, infinite: one.includes('infinite') };
    }));
    // The spinner is the one loop (linear, as a spinner turns); the arrowhead's 0 s step waits for its segment.
    const expected = (p: (typeof parts)[number]) => p.name === 's2-spin' ? { ...p, duration: '800ms', easing: 'linear', infinite: true }
      : p.name === 's2-nomark' ? { ...p, duration: '0s', easing: 'linear', infinite: false }
      : { ...p, duration: p.name === 's2-draw' ? 'var(--motion-draw)' : 'var(--motion-map)', easing: 'ease-out', infinite: false };
    expect(parts).toEqual(parts.map(expected));
    expect(parts.filter((p) => p.infinite).map((p) => p.selector)).toEqual(['.spinner']);
  });

  it('keeps every keyframe in use and none unused', () => {
    const defined = [...css.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]);
    const used = new Set([...motion.body.matchAll(/\b(s2-[\w-]+)/g)].map((m) => m[1]));
    expect(defined.toSorted()).toEqual([...used].toSorted());
  });

  it('uses the 250 ms base and 300 ms segment, both 0 ms under reduced motion', () => {
    expect(tokensCss).toMatch(/--motion-map: 250ms; --motion-draw: 300ms;/);
    expect(mediaBlock(strip(tokensCss), '(prefers-reduced-motion: reduce)').body).toMatch(/--motion-map: 0ms; --motion-draw: 0ms;/);
    expect([TIMING.base, TIMING.segment]).toEqual([250, 300]);
  });

  it('sets no transition or animation in inline styles', () => {
    const files = readdirSync(join(__dirname, '..'), { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.tsx'));
    const inline = files.filter((f) => /\b(transition|animation)\w*\s*:/.test(readFileSync(join(__dirname, '..', f), 'utf8')));
    expect(inline).toEqual([]);
  });

  it('keeps data-enter until the last stop disc has popped, and at least 2 s', () => {
    expect(enterMs(0)).toBe(2000);
    expect(enterMs(3)).toBe(2000); // 450 + 900 + 250 + 200 = 1800
    expect(enterMs(6)).toBe(450 + 6 * 300 + 250 + 200);
  });
});
