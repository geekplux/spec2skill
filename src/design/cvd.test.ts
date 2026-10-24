// CVD safety of the colours that sit side by side (docs/redesign/DESIGN.md 8.5): Machado 2009
// simulation, minimum OKLab distance under protanopia, deuteranopia and tritanopia, both themes.
import { describe, expect, it } from 'vitest';
import { CVD_TYPES, type CvdType, cvdDistance, oklab, simulate } from './cvd';
import { type ColorToken, ROLE, type RoleToken, type Theme, color } from './tokens';

/** Distinct enough to tell apart at a glance. */
const MIN_DISTANCE = 0.06;

type Token = ColorToken | RoleToken;
const pairs = (tokens: Token[]) => tokens.flatMap((a, i) => tokens.slice(i + 1).map((b) => `${a}/${b}`));

/** Groups of colours that appear next to each other; every pair inside a group must stay apart. */
const GROUPS: Record<string, Token[]> = {
  // DESIGN.md 8.5: the accent, the destructive hue and ink.
  accent: ['indigo-9', 'amber-11', 'gray-12'],
  // The logo: the spec square, the skill circle and their ink overlap.
  logo: ['indigo-9', 'amber-9', 'gray-12'],
  // Text: ink, muted text and method text, accent text, destructive method text.
  text: ['gray-12', 'gray-11', 'indigo-11', 'destructive'],
  // The map: the strongest workflow, resting links and highlighted links.
  map: ['indigo-9', 'gray-9', 'gray-12'],
};
const SIDE_BY_SIDE = [...new Set(Object.values(GROUPS).flatMap(pairs))];

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
  const hex = (token: string) => (token in ROLE ? ROLE[token as RoleToken][theme] : color(token as ColorToken, theme));
  const cases = (['none', ...CVD_TYPES] as (CvdType | 'none')[]).flatMap((type) => SIDE_BY_SIDE.map((pair) => [type, pair]));

  it.each(cases)('%s %s', (type, pair) => {
    const [a, b] = pair!.split('/') as [string, string];
    expect(cvdDistance(hex(a), hex(b), type as CvdType | 'none')).toBeGreaterThanOrEqual(MIN_DISTANCE);
  });
});
