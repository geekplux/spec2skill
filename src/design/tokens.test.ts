import { describe, expect, it } from 'vitest';
import css from './tokens.css?raw';
import { FONT, MOTION, PALETTE, RADIUS, SPACE } from './tokens';

/** `--name: value;` declarations in the :root block (the first one). */
function rootVars(source: string): Map<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(source)?.[1] ?? '';
  return new Map([...root.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

describe('tokens.css mirrors tokens.ts', () => {
  it('has the one spacing scale 4/8/16/24/40/64 (docs/DESIGN.md 3)', () => {
    expect(Object.values(SPACE)).toEqual(['4px', '8px', '16px', '24px', '40px', '64px']);
  });

  const vars = rootVars(css);

  it('has every palette colour for both themes via light-dark()', () => {
    for (const [name, { light, dark }] of Object.entries(PALETTE)) {
      expect({ name, value: vars.get(name) }).toEqual({ name, value: `light-dark(${light}, ${dark})` });
    }
  });

  it('has the same spacing, radii, fonts and motion, and nothing extra', () => {
    const expected = new Map<string, string>([
      ...Object.entries(PALETTE).map(([k, v]) => [k, `light-dark(${v.light}, ${v.dark})`] as [string, string]),
      ...Object.entries(SPACE).map(([k, v]) => [`space-${k}`, v] as [string, string]),
      ...Object.entries(RADIUS).map(([k, v]) => [`radius-${k}`, v] as [string, string]),
      ...Object.entries(FONT).map(([k, v]) => [`font-${k}`, v] as [string, string]),
      ...Object.entries(MOTION).map(([k, v]) => [`motion-${k}`, v] as [string, string]),
    ]);
    expect(Object.fromEntries(vars)).toEqual(Object.fromEntries(expected));
  });

  it('sets every motion duration to 0ms under prefers-reduced-motion', () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const zeroed = [...block.matchAll(/--motion-([\w-]+):\s*0ms;/g)].map((m) => m[1]);
    expect(zeroed.toSorted()).toEqual(Object.keys(MOTION).toSorted());
  });

  it('pins each theme with [data-theme] and otherwise follows the system', () => {
    expect(css).toMatch(/:root\s*\{\s*color-scheme: light dark;/);
    expect(css).toContain(":root[data-theme='light'] { color-scheme: light; }");
    expect(css).toContain(":root[data-theme='dark'] { color-scheme: dark; }");
  });

  it('self-hosts only the Latin variable display font', () => {
    const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
    expect(urls).toEqual(['@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2']);
    expect(css).toContain('font-display: swap');
  });
});
