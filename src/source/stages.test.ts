import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Clock, stageTimer } from './stages';

const clock: Clock = { now: () => Date.now(), set: (run, ms) => setTimeout(run, ms), clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) };

describe('stageTimer (D65: Generate stage labels)', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('shows a step at once when the label before has been up 100 ms', () => {
    const late = vi.fn<() => void>();
    const t = stageTimer(100, late, clock);
    vi.advanceTimersByTime(100);
    expect(t.step()).toBe(true);
    vi.advanceTimersByTime(250);
    expect(t.step()).toBe(true);
    expect(late).not.toHaveBeenCalled();
  });

  it('skips a step that starts within 100 ms, then shows the latest when its timer fires', () => {
    const late = vi.fn<() => void>();
    const t = stageTimer(100, late, clock);
    vi.advanceTimersByTime(30);
    expect(t.step()).toBe(false); // parse, 30 ms after fetch
    vi.advanceTimersByTime(30);
    expect(t.step()).toBe(false); // map replaces it; one timer, still due at 100 ms
    vi.advanceTimersByTime(39);
    expect(late).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(late).toHaveBeenCalledOnce();
    // The late label has been up since it was shown: the next step within 100 ms of it waits again.
    vi.advanceTimersByTime(50);
    expect(t.step()).toBe(false);
    vi.advanceTimersByTime(50);
    expect(late).toHaveBeenCalledTimes(2);
  });

  it('never fires after stop (the load ended or was cancelled), and returns at once (nothing awaited)', () => {
    const late = vi.fn<() => void>();
    const t = stageTimer(100, late, clock);
    const result = t.step();
    expect(typeof result).toBe('boolean');
    t.stop();
    vi.advanceTimersByTime(500);
    expect(late).not.toHaveBeenCalled();
  });

  it('a step after a skipped one, once 100 ms are up, shows at once and cancels the late label', () => {
    const late = vi.fn<() => void>();
    const t = stageTimer(100, late, clock);
    vi.advanceTimersByTime(50);
    expect(t.step()).toBe(false);
    // The thread was busy past the timer (synchronous work): the next step finds the time up.
    vi.setSystemTime(Date.now() + 200);
    expect(t.step()).toBe(true);
    vi.advanceTimersByTime(500);
    expect(late).not.toHaveBeenCalled();
  });
});
