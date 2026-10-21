import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, fit, pan, toCss, zoomAt } from './camera';

describe('camera', () => {
  const c = { x: 10, y: 20, k: 1 };

  it('pans by screen pixels', () => {
    expect(pan(c, 5, -5)).toEqual({ x: 15, y: 15, k: 1 });
  });

  it('zooms about a point, keeping that point fixed', () => {
    const z = zoomAt(c, 2, 110, 120);
    expect(z.k).toBe(2);
    // The world point under (110, 120) stays there: (110 - x) / k is unchanged.
    expect((110 - z.x) / z.k).toBe((110 - c.x) / c.k);
    expect((120 - z.y) / z.k).toBe((120 - c.y) / c.k);
  });

  it(`clamps zoom to ${MIN_ZOOM}..${MAX_ZOOM}`, () => {
    expect(zoomAt(c, 100, 0, 0).k).toBe(MAX_ZOOM);
    expect(zoomAt(c, 0.001, 0, 0).k).toBe(MIN_ZOOM);
  });

  it('fits and centres the bounds in the viewport', () => {
    const f = fit({ x: -50, y: -50, w: 1000, h: 500 }, 532, 400, 16);
    expect(f.k).toBe(0.5);
    expect(f.x + -50 * f.k).toBe(16); // left edge lands on the padding
    expect(f.y + -50 * f.k + (500 * f.k) / 2).toBe(200); // vertically centred
    expect(fit({ x: 0, y: 0, w: 10, h: 10 }, 1000, 1000).k).toBe(1.25);
    expect(fit({ x: 0, y: 0, w: 100_000, h: 10 }, 100, 100).k).toBe(MIN_ZOOM);
  });

  it('writes a CSS transform', () => {
    expect(toCss({ x: 1, y: 2, k: 0.5 })).toBe('translate(1px, 2px) scale(0.5)');
  });
});
