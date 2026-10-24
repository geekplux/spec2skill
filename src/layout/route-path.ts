// Path geometry for the route map (docs/redesign/DESIGN.md 5): links run through the 88 px gaps
// between columns as cubic curves with horizontal tangents and cross a column only through a
// free corridor between its cards, so no link crosses a card. Pure.
import { type Point, round } from './geometry';

/** A card's vertical extent in a column. */
export interface Span { top: number; bottom: number }
/** One column of the map: its left edge, width, and the cards in it sorted by `top`. */
export interface Lane { x: number; w: number; spans: readonly Span[] }

/** Distance a corridor keeps from the cards above and below it. */
export const CORRIDOR_MARGIN = 8;

/** The y nearest to `ideal` that is at least CORRIDOR_MARGIN clear of every card in the lane. */
export function corridorY(lane: Lane, ideal: number): number {
  for (const s of lane.spans) {
    const [top, bottom] = [s.top - CORRIDOR_MARGIN, s.bottom + CORRIDOR_MARGIN];
    if (ideal <= top || ideal >= bottom) continue;
    // Inside this card: go to the nearer side; that side is clear because cards keep 32 px apart.
    return ideal - top <= bottom - ideal ? top : bottom;
  }
  return ideal;
}

/** A path as its pen moves: `M` once, then cubic (`C`) and horizontal (`H`) pieces. */
export class Pen {
  private parts: string[];
  private at: Point;

  constructor(start: Point) {
    this.at = start;
    this.parts = [`M${round(start.x)} ${round(start.y)}`];
  }

  /** A curve to `to` leaving and arriving horizontally, its handles `reach` px along x. */
  curve(to: Point, reach = (to.x - this.at.x) / 2): this {
    if (to.y === this.at.y && Math.sign(to.x - this.at.x) === Math.sign(reach)) return this.line(to.x);
    const [c1, c2] = [{ x: this.at.x + reach, y: this.at.y }, { x: to.x - reach, y: to.y }];
    this.parts.push(`C${[c1, c2, to].map((p) => `${round(p.x)} ${round(p.y)}`).join(' ')}`);
    this.at = to;
    return this;
  }

  /** A loop out of a vertical edge at `x` and back: `out` < 0 bulges left, > 0 right. */
  loop(to: Point, out: number): this {
    const [c1, c2] = [{ x: this.at.x + out, y: this.at.y }, { x: to.x + out, y: to.y }];
    this.parts.push(`C${[c1, c2, to].map((p) => `${round(p.x)} ${round(p.y)}`).join(' ')}`);
    this.at = to;
    return this;
  }

  line(x: number): this {
    if (x !== this.at.x) {
      if (this.parts.at(-1)!.startsWith('H')) this.parts.pop(); // one straight run, one `H`
      this.parts.push(`H${round(x)}`);
      this.at = { x, y: this.at.y };
    }
    return this;
  }

  get d(): string {
    return this.parts.join('');
  }
}

/**
 * From `from` on one column's edge to `to` on another's: through each lane in between at its
 * corridor (the free y nearest the straight line), curving only inside the gaps. `lanes` are the
 * columns strictly between, in travel order.
 */
export function routeAcross(from: Point, to: Point, lanes: readonly Lane[]): Pen {
  const pen = new Pen(from);
  const dir = Math.sign(to.x - from.x) || 1;
  for (const lane of lanes) {
    const [enter, leave] = dir > 0 ? [lane.x, lane.x + lane.w] : [lane.x + lane.w, lane.x];
    const t = (lane.x + lane.w / 2 - from.x) / (to.x - from.x);
    const y = round(corridorY(lane, from.y + (to.y - from.y) * t));
    pen.curve({ x: enter, y }).line(leave);
  }
  return pen.curve(to);
}

/** Points along a path written by Pen (`M`, `C`, `H` only), `steps` per curve: for tests and hit checks. */
export function samplePath(d: string, steps = 24): Point[] {
  const tokens = d.match(/[MCH]|-?\d+(?:\.\d+)?/g) ?? [];
  const out: Point[] = [];
  let at: Point = { x: 0, y: 0 };
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M') {
      at = { x: num(), y: num() };
      out.push(at);
    } else if (cmd === 'H') {
      const x = num();
      for (let s = 1; s <= steps; s++) out.push({ x: at.x + ((x - at.x) * s) / steps, y: at.y });
      at = { x, y: at.y };
    } else if (cmd === 'C') {
      const [c1, c2, end] = [{ x: num(), y: num() }, { x: num(), y: num() }, { x: num(), y: num() }];
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        const [a, b, c, e] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
        out.push({ x: a * at.x + b * c1.x + c * c2.x + e * end.x, y: a * at.y + b * c1.y + c * c2.y + e * end.y });
      }
      at = end;
    } else {
      throw new Error(`samplePath: unexpected ${cmd}`);
    }
  }
  return out;
}
