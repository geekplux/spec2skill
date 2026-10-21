// URL state (F13): `?sample=`, `?view=`, `?q=` and `#op=`, so any view can be shared and
// back/forward walk through samples and selections. Pure parse/serialise; App owns history.
import { opFromHash } from '../map/keyboard';

export type View = 'skill' | 'map' | 'list';
export interface UrlState { sample?: string; view?: View; q: string; op?: string }

const VIEWS: readonly string[] = ['skill', 'map', 'list'];

export function readUrl(href: string): UrlState {
  const url = new URL(href);
  const view = url.searchParams.get('view') ?? '';
  return {
    sample: url.searchParams.get('sample') || undefined,
    view: VIEWS.includes(view) ? (view as View) : undefined,
    q: url.searchParams.get('q') ?? '',
    op: opFromHash(url.hash, () => true),
  };
}

/** `href` with the state's parameters set (empty ones removed); other parameters are kept. */
export function writeUrl(href: string, state: UrlState): string {
  const url = new URL(href);
  for (const key of ['sample', 'view', 'q'] as const) {
    const value = state[key];
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  url.hash = state.op ? `op=${encodeURIComponent(state.op)}` : '';
  return url.href;
}
