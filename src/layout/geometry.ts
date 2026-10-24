// Plain geometry for the route layout: points, rectangles and the rounding that keeps paths short.
export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }

/** One decimal place, so path strings and snapshots stay short and stable. */
export const round = (n: number): number => Math.round(n * 10) / 10;
