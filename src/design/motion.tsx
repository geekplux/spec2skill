// Motion (docs/redesign/DESIGN.md 7, redesign R6): the timings of the load sequence, the window in which
// it plays, the label swap of a button and the Generate spinner. The animations themselves are CSS
// (app.css, "Motion"), declared only under prefers-reduced-motion: no-preference, so under reduce
// everything is in its end state at once and the spinner is a still arc.
import { type ReactNode, useEffect, useState } from 'react';

/**
 * DESIGN.md 7 in ms, as app.css uses them: base 250 (ease-out), a workflow segment 300, the staggers;
 * `stage`: how long a Generate stage label stays up before the next may replace it (D65).
 */
export const TIMING = { base: 250, segment: 300, column: 40, check: 30, links: 200, route: 450, audit: 900, stage: 100 } as const;

/**
 * How long a new result keeps `data-enter` (the load sequence may play): until the last stop disc has
 * popped (the route starts at 450 ms, a segment takes 300) and at least 2 s, which covers the audit rows
 * (900 ms + 30 ms a row + 250) of a skill written a few hundred ms after the map. Past it, a card that
 * mounts (view toggle, "N more", a hover) appears as it is.
 */
export const enterMs = (segments: number): number => Math.max(2000, TIMING.route + segments * TIMING.segment + TIMING.base + 200);

/**
 * True from the first render and from each change of `deps` (a new result: a load, a sample switch,
 * Generate) for `ms`; never on other renders (hover, search, view toggle, resize).
 */
export function useEnter(deps: readonly unknown[], ms: number): boolean {
  const [seen, setSeen] = useState(deps);
  const [n, setN] = useState(1);
  const [done, setDone] = useState(0);
  if (deps.length !== seen.length || deps.some((d, i) => d !== seen[i])) {
    setSeen(deps);
    setN(n + 1);
  }
  useEffect(() => {
    const t = setTimeout(() => setDone(n), ms);
    return () => clearTimeout(t);
  }, [n, ms]);
  return done !== n;
}

/**
 * A button's label (icon and words) that fades in over 250 ms each time `id` changes ("Copied",
 * "Downloaded", a Generate stage), but not when first shown.
 */
export function Swap({ id, children }: { id: string; children: ReactNode }) {
  const [first] = useState(id);
  const [moved, setMoved] = useState(false);
  if (!moved && id !== first) setMoved(true);
  return <span key={id} className={moved ? 'label swap' : 'label'}>{children}</span>;
}

/** The Generate stage spinner (V2Motion), 16 px; it turns only when motion is allowed (app.css). */
export const SPINNER = (
  <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
    <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
