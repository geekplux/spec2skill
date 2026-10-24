/**
 * `el`'s top inside the result frame (or on the page, outside one): the skill pane and the map size
 * themselves to fill the window from there, so they fit once the frame is scrolled to the top.
 */
export function topInFrame(el: Element): number {
  const frame = el.closest('.frame');
  return el.getBoundingClientRect().top - (frame ? frame.getBoundingClientRect().top : -window.scrollY);
}
