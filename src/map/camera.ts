// The map camera (PLAN 5.5): a translate + uniform scale applied to one <g>. Pure.
import type { Rect } from '../layout/geometry';

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

/** Centre `b` in a `w` x `h` viewport, as large as fits (never above 1.25x). */
export function fit(b: Rect, w: number, h: number, pad = 16): Camera {
  const k = clampZoom(Math.min((w - 2 * pad) / b.w, (h - 2 * pad) / b.h, 1.25));
  return { k, x: (w - b.w * k) / 2 - b.x * k, y: (h - b.h * k) / 2 - b.y * k };
}

export const toCss = (c: Camera): string => `translate(${c.x}px, ${c.y}px) scale(${c.k})`;
