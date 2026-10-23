// The map camera (PLAN 5.5): a translate + uniform scale applied to one <g>. Pure.
import type { Point, Rect } from '../layout/geometry';

export interface Camera { x: number; y: number; k: number }
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;
/** Edge labels are hidden below this zoom, except on the highlighted node's edges. */
export const LABEL_ZOOM = 0.6;

export const clampZoom = (k: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

export const pan = (c: Camera, dx: number, dy: number): Camera => ({ ...c, x: c.x + dx, y: c.y + dy });

/** Zoom by `factor` keeping the screen point (px, py) fixed. */
export function zoomAt(c: Camera, factor: number, px: number, py: number): Camera {
  const k = clampZoom(c.k * factor);
  const f = k / c.k;
  return { k, x: px - (px - c.x) * f, y: py - (py - c.y) * f };
}

/** Two-pointer pinch from pair `[a0, b0]` to `[a1, b1]` (screen px): scale by the change in their
 *  distance about the old midpoint, then follow the midpoint, so the content stays under the fingers. */
export function pinch(c: Camera, [a0, b0]: [Point, Point], [a1, b1]: [Point, Point]): Camera {
  const [d0, d1] = [Math.hypot(b0.x - a0.x, b0.y - a0.y), Math.hypot(b1.x - a1.x, b1.y - a1.y)];
  const [m0, m1] = [{ x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 }];
  return pan(d0 > 0 ? zoomAt(c, d1 / d0, m0.x, m0.y) : c, m1.x - m0.x, m1.y - m0.y);
}

/** Centre `b` in a `w` x `h` viewport below a `top` strip (the toolbar), as large as fits (never above 1.25x). */
export function fit(b: Rect, w: number, h: number, pad = 16, top = 0): Camera {
  const k = clampZoom(Math.min((w - 2 * pad) / b.w, (h - top - 2 * pad) / b.h, 1.25));
  return { k, x: (w - b.w * k) / 2 - b.x * k, y: top + (h - top - b.h * k) / 2 - b.y * k };
}

export const toCss = (c: Camera): string => `translate(${c.x}px, ${c.y}px) scale(${c.k})`;

/** Keep `r` inside the visible part `v` of the viewport (the map minus any panel over it) with `pad`
 *  px to spare: unchanged if it already is, else centred in `v` (same zoom). */
export function follow(c: Camera, r: Rect, v: Rect, pad = 48): Camera {
  const [x0, y0] = [c.x + r.x * c.k, c.y + r.y * c.k];
  if (x0 >= v.x + pad && y0 >= v.y + pad && x0 + r.w * c.k <= v.x + v.w - pad && y0 + r.h * c.k <= v.y + v.h - pad) return c;
  return { k: c.k, x: v.x + v.w / 2 - (r.x + r.w / 2) * c.k, y: v.y + v.h / 2 - (r.y + r.h / 2) * c.k };
}

/** Frame `r` in the visible part `v` below a `top` strip: as large as fits (never above 1.25x) but
 *  never below `minK`, so labels stay legible. Centred on an axis where it fits, else its top/left
 *  edge is kept `pad` px inside the view. */
export function frameRect(r: Rect, v: Rect, minK: number, pad = 16, top = 0): Camera {
  const [w, h] = [v.w - 2 * pad, v.h - top - 2 * pad];
  const k = clampZoom(Math.max(minK, Math.min(w / r.w, h / r.h, 1.25)));
  const x = r.w * k <= w ? v.x + v.w / 2 - (r.x + r.w / 2) * k : v.x + pad - r.x * k;
  const y = r.h * k <= h ? v.y + top + (v.h - top) / 2 - (r.y + r.h / 2) * k : v.y + top + pad - r.y * k;
  return { k, x, y };
}
