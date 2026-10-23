// WCAG AA over the Survey palette (docs/PLAN.md 3.2, AC-A6), both themes.
import { describe, expect, it } from 'vitest';
import appCss from '../app.css?raw';
import { blend, contrastRatio, luminance } from './contrast';
import { type ColorToken, EDGE_HUE, PALETTE, type Theme } from './tokens';

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

/** The resting opacity app.css gives a map edge rule (calm map, phase 20). */
function restOpacity(selector: string): number {
  const rule = appCss.split('\n').find((line) => line.startsWith(`${selector} { opacity: `));
  const m = rule && /\{ opacity: ([\d.]+);/.exec(rule);
  if (!m) throw new Error(`no resting opacity for ${selector} in app.css`);
  return Number(m[1]);
}

describe('contrast helpers', () => {
  it('composites a colour at an opacity over a surface', () => {
    expect(blend('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(blend('#1F5FAD', '#F7F3EA', 1)).toBe('#1F5FAD');
    expect(blend('#1F5FAD', '#F7F3EA', 0)).toBe('#F7F3EA');
  });

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

  // Map edges rest at reduced opacity (calm map); after compositing over each surface every edge hue
  // (with its end marker and shared-schema diamond) and the feed bundles must still reach 3:1.
  const resting: [string, ColorToken[]][] = [
    ['.edge', Object.values(EDGE_HUE)],
    [".map-link[data-link='bundle']", [EDGE_HUE.feeds]],
  ];
  it.each(resting.flatMap(([sel, hues]) => hues.flatMap((hue) => SURFACES.map((bg) => [sel, hue, bg]))))(
    'resting %s %s on %s >= 3:1 after opacity',
    (sel, hue, bg) => {
      const surface = c(bg as ColorToken);
      expect(contrastRatio(blend(c(hue as ColorToken), surface, restOpacity(sel)), surface)).toBeGreaterThanOrEqual(3);
    },
  );

  it('classifies every palette token', () => {
    const covered = new Set([...SURFACES, ...TEXT, ...GRAPHICS, ...EXEMPT]);
    expect([...covered].toSorted()).toEqual(Object.keys(PALETTE).toSorted());
  });
});
