// Plain geometry for the atlas layout (PLAN 5.5): rectangles, side anchors, path strings.
export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }

/** One decimal place, so path strings and snapshots stay short and stable. */
export const round = (n: number): number => Math.round(n * 10) / 10;

export const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Which sides two boxes connect through: facing sides, or both right sides when they overlap horizontally. */
export function sides(a: Rect, b: Rect): [1 | -1, 1 | -1] {
  if (b.x >= a.x + a.w) return [1, -1];
  if (a.x >= b.x + b.w) return [-1, 1];
  return [1, 1];
}

/** A cubic Bézier from `a` to `b` whose control points sit `ca` / `cb` px to the right (negative: left). */
export function bezier(a: Point, ca: number, b: Point, cb: number): Point[] {
  return [a, { x: a.x + ca, y: a.y }, { x: b.x + cb, y: b.y }, b];
}

export function pointAt([p0, p1, p2, p3]: Point[], t: number): Point {
  const u = 1 - t;
  const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return { x: a * p0!.x + b * p1!.x + c * p2!.x + d * p3!.x, y: a * p0!.y + b * p1!.y + c * p2!.y + d * p3!.y };
}

export const curvePath = (c: Point[]): string =>
  `M${round(c[0]!.x)} ${round(c[0]!.y)}C${c.slice(1).map((p) => `${round(p.x)} ${round(p.y)}`).join(' ')}`;

/** A left-gutter elbow: out to `gx`, down/up to `b`, back in. Returns the path and its midpoint. */
export function elbow(a: Point, b: Point, gx: number): { d: string; mid: Point } {
  return { d: `M${round(a.x)} ${round(a.y)}H${round(gx)}V${round(b.y)}H${round(b.x)}`, mid: { x: gx, y: (a.y + b.y) / 2 } };
}
