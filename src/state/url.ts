// URL state: `?sample=`, `?url=` (a loaded spec or MCP URL; pasted text never), `?view=`, `?q=` and `#op=`, so any view can be shared and
// back/forward walk through samples and selections. Pure parse/serialise; App owns history.
import { opFromHash } from '../map/keyboard';

export type View = 'map' | 'list';
export interface UrlState { sample?: string; url?: string; view?: View; q: string; op?: string }

const VIEWS: readonly string[] = ['map', 'list'];

export function readUrl(href: string): UrlState {
  const url = new URL(href);
  const view = url.searchParams.get('view') ?? '';
  return {
    sample: url.searchParams.get('sample') || undefined,
    url: url.searchParams.get('url') || undefined,
    view: VIEWS.includes(view) ? (view as View) : undefined,
    q: url.searchParams.get('q') ?? '',
    op: opFromHash(url.hash, () => true),
  };
}

/** `href` with the state's parameters set (empty ones removed); other parameters are kept. */
export function writeUrl(href: string, state: UrlState): string {
  const url = new URL(href);
  for (const key of ['sample', 'url', 'view', 'q'] as const) {
    const value = state[key];
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  url.hash = state.op ? `op=${encodeURIComponent(state.op)}` : '';
  return url.href;
}

/**
 * `href` with a `?sample=` that names no known sample set to `fallback` (the one then shown) and an
 * unknown `?view=` removed, so a link never keeps parameters the app ignored. Others are kept.
 */
export function canonicalUrl(href: string, known: (sample: string) => boolean, fallback: string): string {
  const url = new URL(href);
  const sample = url.searchParams.get('sample');
  if (sample !== null && !known(sample)) url.searchParams.set('sample', fallback);
  const view = url.searchParams.get('view');
  if (view !== null && !VIEWS.includes(view)) url.searchParams.delete('view');
  return url.href;
}
