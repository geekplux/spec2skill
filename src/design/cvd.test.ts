// CVD safety of the meaning-carrying hues (docs/PLAN.md 3.2, AC-A5): Machado 2009 simulation,
// minimum OKLab distance between hues that appear side by side, tolerated pairs listed explicitly.
import { describe, expect, it } from 'vitest';
import { CVD_TYPES, type CvdType, cvdDistance, oklab, simulate } from './cvd';
import { EDGE_HUE, METHOD_HUE, PALETTE, type Theme } from './tokens';

/** Distinct enough to tell apart at a glance. */
const MIN_DISTANCE = 0.06;
/** Even tolerated pairs must not collapse into one colour (about two OKLab JNDs). */
const FLOOR = 0.02;

const pairs = (hues: readonly string[]) => {
  const unique = [...new Set(hues)];
  return unique.flatMap((a, i) => unique.slice(i + 1).map((b) => `${a}/${b}`));
};
const SIDE_BY_SIDE = [...new Set([...pairs(Object.values(METHOD_HUE)), ...pairs(Object.values(EDGE_HUE))])];

/**
 * Below MIN_DISTANCE, tolerated because the colour is never the only channel: method badges
 * always show the method text (and DELETE adds a hatched bar and `!`), MCP tools a notched shape
 * and `fn` glyph, and edges differ by line style, marker and label.
 */
const TOLERATED: Record<Theme, string[]> = {
  light: ['tritanopia meridian/fir', 'deuteranopia meridian/plum', 'deuteranopia ochre/brick'],
  dark: [
    'tritanopia meridian/fir',
    'protanopia meridian/plum',
    'deuteranopia meridian/plum',
    'deuteranopia graphite/plum',
  ],
};

describe('cvd helpers', () => {
  it('maps white and black to themselves under every deficiency', () => {
    for (const type of CVD_TYPES) {
      expect(simulate('#FFFFFF', type).map((v) => v.toFixed(2))).toEqual(['1.00', '1.00', '1.00']);
      expect(simulate('#000000', type)).toEqual([0, 0, 0]);
    }
  });

  it('computes OKLab like the reference (white L=1, a=b=0)', () => {
    const [l, a, b] = oklab([1, 1, 1]);
    expect(l).toBeCloseTo(1, 4);
    expect(a).toBeCloseTo(0, 4);
    expect(b).toBeCloseTo(0, 4);
  });

  it('collapses the classic red/green pair under deuteranopia', () => {
    expect(cvdDistance('#D62728', '#2CA02C', 'none')).toBeGreaterThan(0.2);
    expect(cvdDistance('#D62728', '#2CA02C', 'deuteranopia')).toBeLessThan(cvdDistance('#D62728', '#2CA02C', 'none') / 2);
  });
});

describe.each<Theme>(['light', 'dark'])('%s theme', (theme) => {
  const hex = (token: string) => PALETTE[token as keyof typeof PALETTE][theme];
  const cases = (['none', ...CVD_TYPES] as (CvdType | 'none')[]).flatMap((type) => SIDE_BY_SIDE.map((pair) => [type, pair]));

  it.each(cases)('%s %s', (type, pair) => {
    const [a, b] = pair!.split('/') as [string, string];
    const distance = cvdDistance(hex(a), hex(b), type as CvdType | 'none');
    // Tolerated pairs sit in [FLOOR, MIN_DISTANCE): the list stays exact, so a tolerated pair
    // that now passes must be removed from it.
    const [low, high] = TOLERATED[theme].includes(`${type} ${pair}`) ? [FLOOR, MIN_DISTANCE] : [MIN_DISTANCE, Infinity];
    expect(distance).toBeGreaterThanOrEqual(low);
    expect(distance).toBeLessThan(high);
  });
});
