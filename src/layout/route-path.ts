// Path geometry for the route map (docs/DESIGN.md 5): a link is one direct curve when that
// clears the columns it passes; otherwise it curves only inside the 88 px gaps (horizontal
// tangents) and crosses each column through a free corridor on its own track, so no link crosses a
// card or the main line's band and no two links share a straight run (D44). Pure.
import { type Point, round } from './geometry';

/** Something a link must not cross in a column: a card, or the band of the main line passing through. */
export interface Span { top: number; bottom: number }
/** One column of the map: its left edge, width, and what blocks it, sorted by `top`. */
export interface Lane { x: number; w: number; spans: readonly Span[] }

/** Distance a link keeps from every span. */
export const CORRIDOR_MARGIN = 8;
/** Distance between links sharing a corridor. */
export const TRACK = 6;
/** Tracks an open corridor (above or below every card) takes before links overflow into the other one. */
export const MAX_TRACKS = 8;
/** How far `links` links routed together can reach above the top card or below the bottom card of a column. */
export const openReach = (links: number): number => CORRIDOR_MARGIN + TRACK * (Math.max(MAX_TRACKS, links) - 1);
/** The reach of a set of at most MAX_TRACKS links. */
export const OPEN_REACH = openReach(MAX_TRACKS);

/** A free stretch of a lane: from `lo` to `hi` (open-ended above the top span or below the bottom one). */
export interface Corridor { lo: number; hi: number }

/** The free stretches of a lane, CORRIDOR_MARGIN clear of every span, top to bottom. */
export function corridors(lane: Lane): Corridor[] {
  const out: Corridor[] = [];
  let lo = -Infinity;
  for (const s of lane.spans) {
    if (s.top - CORRIDOR_MARGIN >= lo) out.push({ lo, hi: s.top - CORRIDOR_MARGIN });
    lo = Math.max(lo, s.bottom + CORRIDOR_MARGIN);
  }
  out.push({ lo, hi: Infinity });
  return out;
}

/** The free y nearest to `ideal`. */
export function corridorY(lane: Lane, ideal: number): number {
  let best = ideal;
  let gap = Infinity;
  for (const c of corridors(lane)) {
    const y = Math.min(Math.max(ideal, c.lo), c.hi);
    if (Math.abs(y - ideal) < gap) [best, gap] = [y, Math.abs(y - ideal)];
  }
  return best;
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
 * A link from `from` on one column's edge to `to` on another's; `lanes` are the columns strictly
 * between, in travel order. `ideal`: the y it wants in every lane (default: on the straight line
 * between its ends); `direct: false` rules out the direct curve.
 */
export interface Wire { from: Point; to: Point; lanes: readonly Lane[]; ideal?: number; direct?: boolean }

const cubic = (from: Point, to: Point) => new Pen(from).curve(to).d;

/** The direct curve clears every span of the lanes it passes. */
function clear(w: Wire): boolean {
  for (const p of samplePath(cubic(w.from, w.to), 32)) {
    const lane = w.lanes.find((l) => p.x > l.x && p.x < l.x + l.w);
    if (lane?.spans.some((s) => p.y > s.top - CORRIDOR_MARGIN && p.y < s.bottom + CORRIDOR_MARGIN)) return false;
  }
  return true;
}

/**
 * Paths for a set of links drawn together. A link takes the direct curve when that clears every
 * card and band in the columns it passes; otherwise it crosses each column through the corridor
 * nearest its straight line, on its own track: links sharing a corridor sit TRACK px apart, in
 * the order of their source and target y, so no two share a straight run. Curves stay in the gaps.
 */
export function routeWires(wires: readonly Wire[]): string[] {
  const out = wires.map((w) => (w.lanes.length === 0 || (w.direct !== false && clear(w)) ? cubic(w.from, w.to) : undefined));
  // Per lane: who passes, wanting which y.
  const asks = new Map<Lane, { wire: number; ideal: number }[]>();
  wires.forEach((w, i) => {
    if (out[i] !== undefined) return;
    for (const lane of w.lanes) {
      const t = (lane.x + lane.w / 2 - w.from.x) / (w.to.x - w.from.x);
      asks.set(lane, [...(asks.get(lane) ?? []), { wire: i, ideal: w.ideal ?? w.from.y + (w.to.y - w.from.y) * t }]);
    }
  });
  const ys = new Map<string, number>(); // `${wire} ${lane x}` -> y
  for (const [lane, list] of asks) {
    // A closed corridor holds what fits TRACK px apart; an open one MAX_TRACKS, then the other open
    // one; when every corridor is full, the nearest open one takes the rest, still TRACK px apart.
    const free = corridors(lane).map((c) => ({ ...c, cap: Number.isFinite(c.hi - c.lo) ? Math.floor((c.hi - c.lo) / TRACK) + 1 : MAX_TRACKS, in: [] as typeof list }));
    const away = (c: Corridor, y: number) => (y < c.lo ? c.lo - y : y > c.hi ? y - c.hi : 0);
    for (const ask of list.toSorted((a, b) => a.ideal - b.ideal || a.wire - b.wire)) {
      // The nearest corridor with room; on a tie, the one nearer the middle of the link's ends.
      const w = wires[ask.wire]!;
      const mid = (w.from.y + w.to.y) / 2;
      let pick: (typeof free)[number] | undefined;
      let gap = Infinity;
      for (const full of [false, true]) {
        for (const c of free) {
          const open = !Number.isFinite(c.hi - c.lo);
          if (full ? !open : c.in.length >= c.cap) continue;
          const d = away(c, ask.ideal);
          if (d < gap || (d === gap && pick && away(c, mid) < away(pick, mid))) [pick, gap] = [c, d];
        }
        if (pick) break;
      }
      pick!.in.push(ask);
    }
    for (const c of free) {
      const n = c.in.length;
      if (n === 0) continue;
      const step = TRACK;
      const mean = c.in.reduce((sum, a) => sum + a.ideal, 0) / n;
      const span = step * (n - 1);
      const start = Math.min(Math.max(mean - span / 2, c.lo), c.hi - span);
      const order = c.in.toSorted((a, b) => {
        const [wa, wb] = [wires[a.wire]!, wires[b.wire]!];
        return wa.from.y - wb.from.y || wa.to.y - wb.to.y || a.wire - b.wire;
      });
      order.forEach((a, k) => ys.set(`${a.wire} ${lane.x}`, round(start + k * step)));
    }
  }
  return wires.map((w, i) => {
    if (out[i] !== undefined) return out[i];
    const pen = new Pen(w.from);
    const dir = Math.sign(w.to.x - w.from.x) || 1;
    for (const lane of w.lanes) {
      const [enter, leave] = dir > 0 ? [lane.x, lane.x + lane.w] : [lane.x + lane.w, lane.x];
      pen.curve({ x: enter, y: ys.get(`${i} ${lane.x}`)! }).line(leave);
    }
    return pen.curve(w.to).d;
  });
}

/** One link on its own (see routeWires). */
export const routeAcross = (from: Point, to: Point, lanes: readonly Lane[]): string => routeWires([{ from, to, lanes }])[0]!;

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
