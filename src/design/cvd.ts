// Colour-vision-deficiency simulation (Machado 2009) and perceptual distance (OKLab).
// The same matrices drive the browser check's feColorMatrix filters (scripts/browser/cvd.mjs).
import { type Rgb, hexToRgb, toLinear } from './contrast';
import matrices from './cvd-matrices.json';

export type CvdType = 'protanopia' | 'deuteranopia' | 'tritanopia';
export const CVD_TYPES: readonly CvdType[] = ['protanopia', 'deuteranopia', 'tritanopia'];

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Linear RGB as seen with the given deficiency (or unchanged for `none`). */
export function simulate(hex: string, type: CvdType | 'none'): Rgb {
  const rgb = hexToRgb(hex).map(toLinear) as Rgb;
  if (type === 'none') return rgb;
  const m = matrices[type];
  return [0, 1, 2].map((row) => clamp(m[row * 3]! * rgb[0] + m[row * 3 + 1]! * rgb[1] + m[row * 3 + 2]! * rgb[2])) as Rgb;
}

/** Linear sRGB to OKLab (Ottosson 2020). */
export function oklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Euclidean OKLab distance between two colours under a deficiency. */
export function cvdDistance(a: string, b: string, type: CvdType | 'none'): number {
  const [p, q] = [oklab(simulate(a, type)), oklab(simulate(b, type))];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
