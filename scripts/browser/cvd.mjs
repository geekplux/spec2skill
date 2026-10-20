// Colour-vision-deficiency simulation for screenshots: an SVG feColorMatrix filter on <html>
// using the Machado 2009 matrices that the unit tests use (src/design/cvd-matrices.json).
// feColorMatrix works in linearRGB by default, which is where the matrices apply.
import { readFileSync } from 'node:fs';

const MATRICES = JSON.parse(readFileSync(new URL('../../src/design/cvd-matrices.json', import.meta.url), 'utf8'));
export const CVD_TYPES = ['protanopia', 'deuteranopia', 'tritanopia'];

/** Applies the simulation for `type` (or removes it with `null`). */
export async function simulateCvd(page, type) {
  const values = type ? MATRICES[type] : null;
  if (type && !values) throw new Error(`unknown CVD type ${type}`);
  await page.evaluate((m) => {
    document.getElementById('cvd-sim')?.remove();
    document.documentElement.style.filter = '';
    if (!m) return;
    const rows = [0, 1, 2].map((r) => `${m[r * 3]} ${m[r * 3 + 1]} ${m[r * 3 + 2]} 0 0`).join(' ');
    const holder = document.createElement('div');
    holder.id = 'cvd-sim';
    holder.innerHTML = `<svg width="0" height="0" style="position:absolute"><filter id="cvd-filter"><feColorMatrix type="matrix" values="${rows} 0 0 0 1 0"/></filter></svg>`;
    document.body.append(holder);
    document.documentElement.style.filter = 'url(#cvd-filter)';
  }, values);
}
