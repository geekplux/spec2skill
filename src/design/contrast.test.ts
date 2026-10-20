// WCAG AA over the Survey palette (docs/PLAN.md 3.2, AC-A6), both themes.
import { describe, expect, it } from 'vitest';
import { contrastRatio, luminance } from './contrast';
import { type ColorToken, PALETTE, type Theme } from './tokens';

const SURFACES: ColorToken[] = ['paper', 'vellum'];
/** Text drawn on paper and vellum: body, secondary, links/kickers and method badges. */
const TEXT: ColorToken[] = ['ink', 'graphite', 'meridian', 'fir', 'ochre', 'brick', 'plum'];
/** Text drawn on a filled control: pressed chip/toggle (paper on ink), primary button (paper on meridian). */
const INVERSE: [ColorToken, ColorToken][] = [['paper', 'ink'], ['paper', 'meridian']];
/** Non-text graphics: node borders, focus outline, method bars and edge strokes. */
const GRAPHICS: ColorToken[] = ['ink', 'graphite', 'meridian', 'fir', 'ochre', 'brick', 'plum'];
/**
 * Exempt, documented: `rule` (survey grid, dividers, cluster borders) is decoration; `marker` is
 * the focus halo, always paired with the 2 px `ink` outline that carries the contrast.
 */
const EXEMPT: ColorToken[] = ['rule', 'marker'];

describe('contrast helpers', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    expect(luminance('#FFFFFF')).toBe(1);
    expect(() => luminance('red')).toThrow(/#RRGGBB/);
  });
});

describe.each<Theme>(['light', 'dark'])('%s theme', (theme) => {
  const c = (token: ColorToken) => PALETTE[token][theme];

  it.each(TEXT.flatMap((fg) => SURFACES.map((bg) => [fg, bg])))('text %s on %s >= 4.5:1', (fg, bg) => {
    expect(contrastRatio(c(fg as ColorToken), c(bg as ColorToken))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(INVERSE)('text %s on %s >= 4.5:1', (fg, bg) => {
    expect(contrastRatio(c(fg), c(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GRAPHICS.flatMap((fg) => SURFACES.map((bg) => [fg, bg])))('graphic %s on %s >= 3:1', (fg, bg) => {
    expect(contrastRatio(c(fg as ColorToken), c(bg as ColorToken))).toBeGreaterThanOrEqual(3);
  });

  it('classifies every palette token', () => {
    const covered = new Set([...SURFACES, ...TEXT, ...GRAPHICS, ...EXEMPT]);
    expect([...covered].toSorted()).toEqual(Object.keys(PALETTE).toSorted());
  });
});
