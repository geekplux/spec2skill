// The "Survey chart" design tokens (docs/PLAN.md 3.2-3.4). tokens.css mirrors these values;
// tokens.test.ts fails if the two drift, and contrast/cvd tests check every pair below.
export type Theme = 'light' | 'dark';

export const PALETTE = {
  paper: { light: '#F7F3EA', dark: '#0E1621' },
  vellum: { light: '#FFFDF7', dark: '#16212F' },
  ink: { light: '#1C2430', dark: '#ECE6D8' },
  graphite: { light: '#59636F', dark: '#A6B0BC' },
  rule: { light: '#D9D1C0', dark: '#2B3B4F' },
  meridian: { light: '#1F5FAD', dark: '#7DB0EA' },
  fir: { light: '#1E7A5A', dark: '#5CC49B' },
  ochre: { light: '#9A6200', dark: '#E2B455' },
  brick: { light: '#B23A1E', dark: '#F08A6C' },
  plum: { light: '#7A3E8F', dark: '#C99BDB' },
  marker: { light: '#F2C230', dark: '#F2C230' },
} as const;

export type ColorToken = keyof typeof PALETTE;

/** Which hue marks which method/kind badge (the text label is always shown too). */
export const METHOD_HUE = { get: 'meridian', post: 'fir', put: 'ochre', patch: 'ochre', delete: 'brick', tool: 'plum' } as const;
/** Cluster territory washes, cycled in cluster order; decoration only. */
export const WASH = ['meridian', 'fir', 'ochre', 'plum', 'brick'] as const;
/** Edge hues; each edge kind also has its own line style, marker and label. */
export const EDGE_HUE = { feeds: 'meridian', 'sub-path': 'graphite', 'shared-schema': 'plum' } as const;

export const SPACE = { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '24px', 6: '32px', 7: '48px' } as const;
export const RADIUS = { sm: '4px', md: '8px', pill: '999px' } as const;
export const FONT = {
  display: "'Bricolage Grotesque Variable', 'Bricolage Grotesque', system-ui, sans-serif",
  body: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
} as const;
/** Motion durations; all become 0ms under prefers-reduced-motion: reduce. */
export const MOTION = { fast: '150ms', camera: '250ms', fade: '120ms' } as const;
