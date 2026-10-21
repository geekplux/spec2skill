import { describe, expect, it } from 'vitest';
import { nextTab } from './Tabs';

describe('nextTab', () => {
  it('wraps with the arrows and jumps with Home and End', () => {
    expect([nextTab('ArrowRight', 0, 3), nextTab('ArrowRight', 2, 3), nextTab('ArrowLeft', 0, 3)]).toEqual([1, 0, 2]);
    expect([nextTab('Home', 2, 3), nextTab('End', 0, 3)]).toEqual([0, 2]);
  });
  it('ignores other keys', () => {
    expect(nextTab('ArrowDown', 0, 3)).toBeUndefined();
    expect(nextTab('Enter', 0, 3)).toBeUndefined();
  });
});
