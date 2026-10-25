// When a Generate stage label may replace the one shown (D65), as a pure scheduler: a step that starts
// once the shown label has been up `min` ms shows at once; one that starts sooner shows when that time
// is up if the thread is free by then (`onLate`), else the next step replaces it. Nothing is awaited:
// the load never waits for a label.

export interface Clock {
  now: () => number;
  set: (run: () => void, ms: number) => unknown;
  clear: (timer: unknown) => void;
}

const SYSTEM: Clock = {
  now: () => performance.now(),
  set: (run, ms) => setTimeout(run, ms),
  clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

export interface StageTimer {
  /** A step starts: true when its label shows now; false when it waits (or is skipped). */
  step: () => boolean;
  /** The load ended or was cancelled: no late label. */
  stop: () => void;
}

/** Starts with the first stage shown now. `onLate`: show the latest step, whose wait is over. */
export function stageTimer(min: number, onLate: () => void, clock: Clock = SYSTEM): StageTimer {
  let since = clock.now();
  let timer: unknown;
  const stop = () => {
    if (timer !== undefined) clock.clear(timer);
    timer = undefined;
  };
  return {
    step() {
      const now = clock.now();
      stop();
      if (now - since >= min) {
        since = now;
        return true;
      }
      timer = clock.set(() => {
        timer = undefined;
        since = clock.now();
        onLate();
      }, since + min - now);
      return false;
    },
    stop,
  };
}
