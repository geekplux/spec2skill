// WCAG AA over the Radix tokens the UI draws (docs/DESIGN.md 8.5), both themes.
import { describe, expect, it } from 'vitest';
import appCss from '../app.css?raw';
import { blend, contrastRatio, luminance } from './contrast';
import { COLOR_TOKENS, type ColorToken, ROLE, type RoleToken, type Theme, color } from './tokens';

type Token = ColorToken | RoleToken;
const hex = (token: Token, theme: Theme) => (token in ROLE ? ROLE[token as RoleToken][theme] : color(token as ColorToken, theme));

/** Page and raised surfaces: the page, code boxes and panels. */
const SURFACES: ColorToken[] = ['gray-1', 'gray-2'];
/** Text on those surfaces: ink, muted text, accent text (links, audit pass) and destructive method text. */
const TEXT: Token[] = ['gray-12', 'gray-11', 'indigo-11', 'destructive'];
/** Text on a component background: selected, pressed and hovered rows and tags (gray-3). */
const ON_COMPONENT: Token[] = ['gray-12', 'gray-11'];
/** Text on a solid fill: the primary button. */
const ON_SOLID: [Token, Token][] = [['indigo-contrast', 'indigo-9']];
/**
 * Graphics that carry meaning (WCAG 1.4.11, 3:1): map links and arrowheads (gray-9), the write bar
 * (gray-11), focus rings and highlighted nodes (gray-12), accent fills (indigo-9), the destructive
 * warning mark (amber-11, both themes, D53) and destructive method text (destructive).
 */
const GRAPHICS: Token[] = ['gray-9', 'gray-11', 'gray-12', 'indigo-9', 'amber-11', 'destructive'];
/**
 * Exempt, documented: rules, rings and component fills (gray-3 to gray-8) are decoration, since every
 * control is named by its text; amber-8 rings an invalid field whose help line says "Not used:";
 * amber-9 is the logo's circle only; the other steps are unused.
 */
const DECORATION: ColorToken[] = ['gray-3', 'gray-4', 'gray-5', 'gray-6', 'gray-7', 'gray-8', 'amber-8', 'amber-9'];

/** The stroke app.css gives a map line rule (`.ln { stroke: var(--gray-9); ...`), and whether it sets an opacity. */
function stroke(selector: string): { token: Token; opacity: boolean } {
  const rule = appCss.split('\n').find((line) => line.startsWith(`${selector} { `));
  const m = rule && /stroke: var\(--([\w-]+)\)/.exec(rule);
  if (!m) throw new Error(`no stroke for ${selector} in app.css`);
  return { token: m[1] as Token, opacity: /opacity/.test(rule!) };
}
/** Lines drawn at rest on the route map: feed links and bundles, the workflow, and their arrowheads. */
const MAP_LINES = ['.ln', '.wf', '.ah', '.ahk', '.ln-hot'];

describe('contrast helpers', () => {
  it('composites a colour at an opacity over a surface', () => {
    expect(blend('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(blend('#3e63dd', '#fcfcfc', 1)).toBe('#3E63DD');
    expect(blend('#3e63dd', '#fcfcfc', 0)).toBe('#FCFCFC');
  });

  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    expect(luminance('#FFFFFF')).toBe(1);
    expect(() => luminance('red')).toThrow(/#RRGGBB/);
  });

  it('records why destructive text is not amber-11 in light (4.49:1 on gray-1)', () => {
    expect(contrastRatio(color('amber-11', 'light'), color('gray-1', 'light'))).toBeLessThan(4.5);
    expect(contrastRatio(color('amber-11', 'dark'), color('gray-1', 'dark'))).toBeGreaterThan(4.5);
  });
});

describe.each<Theme>(['light', 'dark'])('%s theme', (theme) => {
  const c = (token: Token) => hex(token, theme);

  it.each(TEXT.flatMap((fg) => SURFACES.map((bg) => [fg, bg])))('text %s on %s >= 4.5:1', (fg, bg) => {
    expect(contrastRatio(c(fg as Token), c(bg as Token))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ON_COMPONENT.map((fg) => [fg, 'gray-3']))('text %s on %s >= 4.5:1', (fg, bg) => {
    expect(contrastRatio(c(fg as Token), c(bg as Token))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ON_SOLID)('text %s on %s >= 4.5:1', (fg, bg) => {
    expect(contrastRatio(c(fg), c(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GRAPHICS.flatMap((fg) => SURFACES.map((bg) => [fg, bg])))('graphic %s on %s >= 3:1', (fg, bg) => {
    expect(contrastRatio(c(fg as Token), c(bg as Token))).toBeGreaterThanOrEqual(3);
  });

  it('gray-9 map links reach 3:1 on gray-1 (DESIGN.md 8.5)', () => {
    expect(contrastRatio(c('gray-9'), c('gray-1'))).toBeGreaterThanOrEqual(3);
  });

  // Route map lines (R4) are drawn at full opacity in a meaningful hue: 3:1 on both surfaces.
  it.each(MAP_LINES.flatMap((sel) => SURFACES.map((bg) => [sel, bg])))('map line %s on %s >= 3:1, no opacity', (sel, bg) => {
    const { token, opacity } = stroke(sel!);
    expect(GRAPHICS).toContain(token);
    expect(opacity).toBe(false);
    expect(contrastRatio(c(token), c(bg as Token))).toBeGreaterThanOrEqual(3);
  });
});

describe('the route map', () => {
  it('finds its line rules in app.css', () => {
    expect(MAP_LINES.map((sel) => stroke(sel).token)).toEqual(['gray-9', 'indigo-9', 'gray-9', 'gray-12', 'gray-12']);
  });

  it('every token used in app.css is checked here or listed as decoration', () => {
    const checked = new Set<string>([...SURFACES, ...TEXT, ...ON_COMPONENT, ...ON_SOLID.flat(), ...GRAPHICS, ...DECORATION]);
    const used = [...new Set([...appCss.matchAll(/var\(--((?:gray|indigo|amber)-\d+|indigo-contrast|destructive)\)/g)].map((m) => m[1]!))];
    expect(used.filter((t) => !checked.has(t))).toEqual([]);
    expect([...checked].filter((t) => !COLOR_TOKENS.includes(t as ColorToken) && !(t in ROLE))).toEqual([]);
  });
});
