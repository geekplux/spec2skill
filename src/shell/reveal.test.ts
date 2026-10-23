import { describe, expect, it } from 'vitest';
import { revealScrollLeft } from './reveal';

const view = { left: 0, right: 390 };

describe('revealScrollLeft', () => {
  it('leaves a fully visible item alone', () => {
    expect(revealScrollLeft(view, 40, { left: 100, right: 200 }, 8)).toBe(40);
  });
  it('scrolls right just enough to show an item past the right edge', () => {
    expect(revealScrollLeft(view, 0, { left: 300, right: 450 }, 8)).toBe(68);
  });
  it('scrolls left just enough to show an item past the left edge, never below zero', () => {
    expect(revealScrollLeft(view, 100, { left: -50, right: 60 }, 8)).toBe(42);
    expect(revealScrollLeft(view, 10, { left: -50, right: 60 }, 8)).toBe(0);
  });
  it('keeps an item clear of a wider end padding (the "More samples" hint)', () => {
    expect(revealScrollLeft(view, 0, { left: 185, right: 325 }, 8, 160)).toBe(95);
    expect(revealScrollLeft(view, 0, { left: 40, right: 200 }, 8, 160)).toBe(0);
  });
});
