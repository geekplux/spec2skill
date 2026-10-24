// The "Route map" design tokens (docs/redesign/DESIGN.md section 2). tokens.css mirrors these values;
// tokens.test.ts fails if the two drift, and contrast/cvd tests check the pairs the UI draws.
export type Theme = 'light' | 'dark';

/** Radix Colors 3.0.0 (@radix-ui/colors), steps 1-12, copied rather than installed (docs/DECISIONS.md). */
export const RADIX = {
  gray: {
    light: ['#fcfcfc', '#f9f9f9', '#f0f0f0', '#e8e8e8', '#e0e0e0', '#d9d9d9', '#cecece', '#bbbbbb', '#8d8d8d', '#838383', '#646464', '#202020'],
    dark: ['#111111', '#191919', '#222222', '#2a2a2a', '#313131', '#3a3a3a', '#484848', '#606060', '#6e6e6e', '#7b7b7b', '#b4b4b4', '#eeeeee'],
  },
  indigo: {
    light: ['#fdfdfe', '#f7f9ff', '#edf2fe', '#e1e9ff', '#d2deff', '#c1d0ff', '#abbdf9', '#8da4ef', '#3e63dd', '#3358d4', '#3a5bc7', '#1f2d5c'],
    dark: ['#11131f', '#141726', '#182449', '#1d2e62', '#253974', '#304384', '#3a4f97', '#435db1', '#3e63dd', '#5472e4', '#9eb1ff', '#d6e1ff'],
  },
  amber: {
    light: ['#fefdfb', '#fefbe9', '#fff7c2', '#ffee9c', '#fbe577', '#f3d673', '#e9c162', '#e2a336', '#ffc53d', '#ffba18', '#ab6400', '#4f3422'],
    dark: ['#16120c', '#1d180f', '#302008', '#3f2700', '#4d3000', '#5c3d05', '#714f19', '#8f6424', '#ffc53d', '#ffd60a', '#ffca16', '#ffe7b3'],
  },
} as const;

export type Scale = keyof typeof RADIX;
export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
/** `gray-1` ... `amber-12`: the CSS custom property names (without `--`). */
export type ColorToken = `${Scale}-${Step}`;

export const SCALES = Object.keys(RADIX) as Scale[];
export const STEPS: readonly Step[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const COLOR_TOKENS: ColorToken[] = SCALES.flatMap((s) => STEPS.map((n): ColorToken => `${s}-${n}`));

/** The hex value of a Radix step in a theme. */
export function color(token: ColorToken, theme: Theme): string {
  const [scale, step] = token.split('-') as [Scale, string];
  return RADIX[scale][theme][Number(step) - 1]!;
}

/**
 * Role tokens beyond the 36 steps. `indigo-contrast` is the text on an `indigo-9` fill (the solid-colour
 * exception Radix documents). `destructive` is the text of destructive operations and failures:
 * `amber-11` in dark, but `amber-12` in light, where `amber-11` on `gray-1` is 4.49:1, just under AA.
 */
export const ROLE = {
  'indigo-contrast': { light: '#ffffff', dark: '#ffffff' },
  destructive: { light: color('amber-12', 'light'), dark: color('amber-11', 'dark') },
} as const;
export type RoleToken = keyof typeof ROLE;

/** Every rule and border is this wide (DESIGN.md rule 6), drawn as a box-shadow so it stays 0.5 px. */
export const LINE = '0.5px';

/** The four font sizes (DESIGN.md rule 8) and their line heights. */
export const TYPE = {
  12: { size: '12px', leading: '16px' },
  14: { size: '14px', leading: '20px' },
  20: { size: '20px', leading: '28px' },
  48: { size: '48px', leading: '52px' },
} as const;

/** The one spacing scale, named by value (`--space-16` is 16px): layout CSS uses only these (scripts/check-spacing.mjs). */
export const SPACE = { 2: '2px', 4: '4px', 6: '6px', 8: '8px', 10: '10px', 12: '12px', 14: '14px', 16: '16px', 20: '20px', 24: '24px', 32: '32px', 40: '40px', 48: '48px', 64: '64px', 88: '88px', 96: '96px', 104: '104px' } as const;
export const RADIUS = { sm: '4px', row: '6px', md: '8px', box: '10px', frame: '16px', pill: '999px' } as const;
export const FONT = {
  sans: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace",
} as const;
/** Self-hosted faces, Latin subset only (@fontsource/<family>): the weights loaded. */
export const FACES = { 'ibm-plex-sans': [400, 500, 600], 'ibm-plex-mono': [400, 500, 600] } as const;
/** Motion durations; all become 0ms under prefers-reduced-motion: reduce. */
export const MOTION = { fast: '150ms', map: '250ms' } as const;
/** The one shadow (DESIGN.md rule 10): the operation card floats over the map. */
export const SHADOW = { float: '0 8px 24px rgba(0, 0, 0, 0.08)' } as const;
