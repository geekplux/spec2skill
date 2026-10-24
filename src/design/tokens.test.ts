import { describe, expect, it } from 'vitest';
import appCss from '../app.css?raw';
import css from './tokens.css?raw';
import { COLOR_TOKENS, FACES, FONT, LINE, MOTION, RADIUS, ROLE, SPACE, TYPE, color } from './tokens';

/** `--name: value;` declarations in the :root block (the first one). */
function rootVars(source: string): Map<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(source)?.[1] ?? '';
  const text = root.replace(/\/\*[\s\S]*?\*\//g, '');
  return new Map([...text.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

const OLD_PALETTE = ['paper', 'vellum', 'ink', 'graphite', 'rule', 'meridian', 'fir', 'ochre', 'brick', 'plum', 'marker', 'wash'];

describe('tokens.css mirrors tokens.ts', () => {
  const vars = rootVars(css);

  it('has the 36 Radix steps (gray, indigo, amber) for both themes via light-dark()', () => {
    expect(COLOR_TOKENS).toHaveLength(36);
    for (const token of COLOR_TOKENS) {
      expect({ token, value: vars.get(token) }).toEqual({ token, value: `light-dark(${color(token, 'light')}, ${color(token, 'dark')})` });
    }
  });

  it('matches the Radix Colors 3.0 values in DESIGN.md', () => {
    expect([color('gray-1', 'light'), color('gray-12', 'light'), color('gray-1', 'dark'), color('gray-12', 'dark')]).toEqual(['#fcfcfc', '#202020', '#111111', '#eeeeee']);
    expect([color('indigo-9', 'light'), color('indigo-11', 'light'), color('indigo-11', 'dark')]).toEqual(['#3e63dd', '#3a5bc7', '#9eb1ff']);
    expect([color('amber-9', 'light'), color('amber-11', 'light'), color('amber-11', 'dark')]).toEqual(['#ffc53d', '#ab6400', '#ffca16']);
    // The roles are Radix values too (plus #fff on indigo-9).
    expect([ROLE.destructive.light, ROLE.destructive.dark]).toEqual([color('amber-12', 'light'), color('amber-11', 'dark')]);
    expect(ROLE['indigo-contrast']).toEqual({ light: '#ffffff', dark: '#ffffff' });
  });

  it('has the same roles, line, type, spacing, radii, fonts and motion, and nothing extra', () => {
    const expected = new Map<string, string>([
      ...COLOR_TOKENS.map((t) => [t, `light-dark(${color(t, 'light')}, ${color(t, 'dark')})`] as [string, string]),
      ...Object.entries(ROLE).map(([k, v]) => [k, `light-dark(${v.light}, ${v.dark})`] as [string, string]),
      ['line', LINE],
      ...Object.entries(TYPE).flatMap(([k, v]) => [[`text-${k}`, v.size], [`leading-${k}`, v.leading]] as [string, string][]),
      ...Object.entries(SPACE).map(([k, v]) => [`space-${k}`, v] as [string, string]),
      ...Object.entries(RADIUS).map(([k, v]) => [`radius-${k}`, v] as [string, string]),
      ...Object.entries(FONT).map(([k, v]) => [`font-${k}`, v] as [string, string]),
      ...Object.entries(MOTION).map(([k, v]) => [`motion-${k}`, v] as [string, string]),
    ]);
    expect(Object.fromEntries(vars)).toEqual(Object.fromEntries(expected));
  });

  it('has exactly the four font sizes 12/14/20/48 with the line heights of DESIGN.md', () => {
    expect(Object.entries(TYPE).map(([k, v]) => `${k}/${v.size}/${v.leading}`)).toEqual(['12/12px/16px', '14/14px/20px', '20/20px/28px', '48/48px/52px']);
    expect(LINE).toBe('0.5px');
  });

  it('has the one spacing scale, each token named by its value, with the grid gap 88 and the section steps (docs/redesign/DESIGN.md 2)', () => {
    expect(Object.entries(SPACE).map(([k, v]) => `${k}=${v}`)).toEqual(Object.keys(SPACE).map((k) => `${k}=${k}px`));
    expect(Object.keys(SPACE).map(Number)).toEqual([2, 4, 8, 12, 14, 16, 20, 24, 32, 40, 48, 64, 88, 96, 104]);
    expect(RADIUS).toMatchObject({ sm: '4px', row: '6px', md: '8px', box: '10px', frame: '16px' });
  });

  it('sets every motion duration to 0ms under prefers-reduced-motion', () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const zeroed = [...block.matchAll(/--motion-([\w-]+):\s*0ms;/g)].map((m) => m[1]);
    expect(zeroed.toSorted()).toEqual(Object.keys(MOTION).toSorted());
  });

  it('follows the system theme and never pins one (no toggle, no [data-theme])', () => {
    expect(css).toMatch(/:root\s*\{\s*color-scheme: light dark;/);
    for (const source of [css, appCss]) expect(source.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/data-theme|prefers-color-scheme/);
  });

  it('self-hosts only the Latin subset of IBM Plex Sans and Mono, 400/500/600, as woff2', () => {
    const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
    const expected = Object.entries(FACES).flatMap(([family, weights]) => weights.map((w) => `@fontsource/${family}/files/${family}-latin-${w}-normal.woff2`));
    expect(urls.toSorted()).toEqual(expected.toSorted());
    const faces = [...css.matchAll(/@font-face \{([^}]*)\}/g)].map((m) => m[1]!);
    expect(faces).toHaveLength(6);
    for (const face of faces) {
      expect(face).toContain('font-display: swap');
      expect(face).toContain("format('woff2')");
      expect(face).toContain('unicode-range: U+0000-00FF');
    }
    expect(css).not.toMatch(/bricolage/i);
  });
});

describe('app.css uses only the tokens', () => {
  const source = appCss.replace(/\/\*[\s\S]*?\*\//g, '');

  it('has no raw colours: no hex, rgb(), hsl(), color-mix() or named colours', () => {
    expect(source.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
    expect(source.match(/\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\(/gi) ?? []).toEqual([]);
    expect(source.match(/:\s*(?:white|black|red|blue|green|gray|grey)\b/gi) ?? []).toEqual([]);
  });

  it('references only defined custom properties, none of the old palette', () => {
    const defined = new Set(rootVars(css).keys());
    const used = new Set([...source.matchAll(/var\(--([\w-]+)/g)].map((m) => m[1]!));
    const local = new Set([...source.matchAll(/(?:^|[;{\s])--([\w-]+)\s*:/g)].map((m) => m[1]!)); // set in app.css itself
    for (const fromScript of ['map-top', 'panes-top', 'level']) local.add(fromScript); // set inline by Map.tsx, App.tsx, FileTree.tsx
    expect([...used].filter((name) => !defined.has(name) && !local.has(name))).toEqual([]);
    expect([...used, ...local].filter((name) => OLD_PALETTE.includes(name))).toEqual([]);
  });

  it('uses only the four font sizes, through the type tokens', () => {
    const sizes = [...source.matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1]!.trim());
    expect(sizes.filter((s) => !/^var\(--text-(12|14|20|48)\)$/.test(s) && s !== 'inherit')).toEqual([]);
    // The `font` shorthand: its size is a type token (or the whole font is inherited).
    const shorthand = [...source.matchAll(/(?:^|[;{\s])font:\s*([^;}]+)/g)].map((m) => m[1]!.trim());
    expect(shorthand.filter((f) => f !== 'inherit' && !/var\(--text-(12|14|20|48)\)/.test(f))).toEqual([]);
  });

  it('draws lines as 0.5 px box-shadows, never as borders', () => {
    const borders = [...source.matchAll(/(?:^|[;{\s])(border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-width)?)\s*:\s*([^;}]+)/g)]
      .map((m) => `${m[1]}: ${m[2]!.trim()}`)
      .filter((d) => !/:\s*(?:0|none)$/.test(d));
    expect(borders).toEqual([]);
    // Every shadow is a 0.5 px ring (`0 0 0 var(--line)`) or a 0.5 px inset rule on one side.
    const line = String.raw`(?:var\(--line\)|calc\(-1 \* var\(--line\)\))`;
    const allowed = new RegExp(String.raw`^(?:(?:inset )?0 0 0 var\(--line\)|inset (?:0 ${line}|${line} 0) 0) (?:var\(--[\w-]+\)|currentColor)$`);
    const shadows = [...source.matchAll(/box-shadow:\s*([^;}]+)/g)].flatMap((m) => m[1]!.split(/,(?![^(]*\))/)).map((s) => s.trim());
    expect(shadows.filter((s) => s !== 'none' && !allowed.test(s))).toEqual([]);
  });
});
