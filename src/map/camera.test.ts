import { describe, expect, it } from 'vitest';
import { LABEL_ZOOM, MAX_ZOOM, MIN_ZOOM, fit, follow, frameRect, pan, pinch, toCss, zoomAt } from './camera';

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
    const below = fit({ x: 0, y: 0, w: 100, h: 100 }, 1000, 240, 20, 40);
    expect([below.k, below.y]).toEqual([1.25, 40 + (200 - 125) / 2]); // centred in the 200 px under the toolbar

  });

  it('writes a CSS transform', () => {
    expect(toCss({ x: 1, y: 2, k: 0.5 })).toBe('translate(1px, 2px) scale(0.5)');
  });
});

describe('follow', () => {
  const c = { x: 0, y: 0, k: 1 };
  const all = { x: 0, y: 0, w: 800, h: 600 };
  it('leaves the camera alone when the rect is comfortably on screen', () => {
    expect(follow(c, { x: 100, y: 100, w: 50, h: 20 }, all)).toBe(c);
  });
  it('centres an off-screen rect at the same zoom', () => {
    expect(follow({ ...c, k: 2 }, { x: 1000, y: 10, w: 100, h: 40 }, all)).toEqual({ k: 2, x: 400 - 1050 * 2, y: 300 - 30 * 2 });
  });
  it('treats a rect under a side panel as hidden and centres it in the part left of the panel', () => {
    const r = { x: 600, y: 100, w: 100, h: 40 };
    expect(follow(c, r, all)).toBe(c); // visible without the panel
    expect(follow(c, r, { ...all, w: 440 })).toEqual({ k: 1, x: 220 - 650, y: 300 - 120 });
  });
  it('treats a rect under a bottom sheet as hidden and centres it in the part above the sheet', () => {
    const r = { x: 100, y: 400, w: 100, h: 40 };
    expect(follow(c, r, all)).toBe(c);
    expect(follow(c, r, { ...all, h: 300 })).toEqual({ k: 1, x: 400 - 150, y: 150 - 420 });
  });
});

const at = (x: number, y: number) => ({ x, y });

describe('pinch', () => {
  const c = { x: 10, y: 20, k: 1 };

  it('spreading two pointers zooms about their midpoint, keeping that point fixed', () => {
    const next = pinch(c, [at(100, 100), at(200, 100)], [at(50, 100), at(250, 100)]);
    expect(next.k).toBe(2);
    // The content point under the midpoint (150, 100) stays there: (150 - x) / k is unchanged.
    expect((150 - next.x) / next.k).toBeCloseTo((150 - c.x) / c.k);
    expect((100 - next.y) / next.k).toBeCloseTo((100 - c.y) / c.k);
  });

  it('moving both pointers together pans; pinching in is clamped to the zoom range', () => {
    expect(pinch(c, [at(0, 0), at(10, 0)], [at(5, 7), at(15, 7)])).toEqual({ x: 15, y: 27, k: 1 });
    expect(pinch(c, [at(0, 0), at(1000, 0)], [at(0, 0), at(1, 0)]).k).toBe(MIN_ZOOM);
    expect(pinch(c, [at(5, 5), at(5, 5)], [at(5, 5), at(5, 5)])).toEqual(c); // no distance: no zoom
  });
});

describe('frameRect', () => {
  const v = { x: 0, y: 0, w: 800, h: 600 };
  it('centres a small cluster, as large as fits (capped at 1.25x)', () => {
    expect(frameRect({ x: 100, y: 100, w: 200, h: 100 }, v, LABEL_ZOOM)).toEqual({ k: 1.25, x: 400 - 200 * 1.25, y: 300 - 150 * 1.25 });
  });
  it('never zooms below the label zoom; an oversized cluster keeps its top-left in view', () => {
    const c = frameRect({ x: 50, y: 40, w: 4000, h: 3000 }, v, LABEL_ZOOM, 16, 40);
    expect(c.k).toBe(LABEL_ZOOM);
    expect(c).toEqual({ k: LABEL_ZOOM, x: 16 - 50 * LABEL_ZOOM, y: 40 + 16 - 40 * LABEL_ZOOM });
  });
  it('centres on the axis that fits and frames inside the visible part only', () => {
    const c = frameRect({ x: 0, y: 0, w: 2000, h: 100 }, { ...v, w: 440 }, LABEL_ZOOM);
    expect(c.k).toBe(LABEL_ZOOM);
    expect(c.x).toBe(16);
    expect(c.y).toBe(300 - 50 * LABEL_ZOOM);
  });
});
