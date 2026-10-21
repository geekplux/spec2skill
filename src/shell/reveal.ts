/** Horizontal extent of a box in viewport coordinates. */
export interface Span {
  left: number;
  right: number;
}

/**
 * The scrollLeft that brings `item` fully inside the scrolling row `view` (with `pad` px of
 * breathing room), moving as little as possible. Used instead of scrollIntoView, which would move
 * the browser's sequential-focus starting point and make the first Tab skip the skip link.
 */
export function revealScrollLeft(view: Span, scrollLeft: number, item: Span, pad = 0): number {
  if (item.left < view.left + pad) return Math.max(0, scrollLeft - (view.left + pad - item.left));
  if (item.right > view.right - pad) return scrollLeft + (item.right - (view.right - pad));
  return scrollLeft;
}

/** Scroll `row` horizontally so `item` is visible; never touches focus or the page scroll. */
export function revealInRow(row: HTMLElement | null, item: HTMLElement | null | undefined): void {
  if (!row || !item) return;
  const pad = Number.parseFloat(getComputedStyle(row).scrollPaddingInlineStart) || 0;
  const next = revealScrollLeft(row.getBoundingClientRect(), row.scrollLeft, item.getBoundingClientRect(), pad);
  if (next !== row.scrollLeft) row.scrollLeft = next;
}
