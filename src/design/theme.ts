// Light and dark (D82, amending D31). By default the theme follows the system: `color-scheme: light
// dark` on the root and every colour a `light-dark()` token. The header's theme button pins one by
// setting `data-theme` on <html> (tokens.css turns it into `color-scheme: light` or `dark`) and
// remembers it in localStorage. index.html's inline script applies a stored choice before the first
// paint; this module is what the button uses. Storage may be blocked: every access is guarded, and the
// button then still switches for the visit. A choice made (or cleared) in another tab applies live
// through the `storage` event.
import { type Theme, color } from './tokens';

export const THEME_KEY = 'spec2skill:theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark';

/** window.localStorage, or undefined where there is none or touching it throws (blocked storage). */
export function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/** The stored choice, or null when there is none, it is not a theme, or storage is blocked. */
export function storedTheme(storage: Reader | undefined): Theme | null {
  try {
    const value = storage?.getItem(THEME_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

/** Remembers `theme`; false when it could not be stored (the choice then lasts for this visit). */
export function storeTheme(theme: Theme, storage: Writer | undefined): boolean {
  try {
    if (!storage) return false;
    storage.setItem(THEME_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

/**
 * The theme on screen: a choice pins it, whether or not it equals the system's (kept until changed,
 * so a later system change does not undo it); otherwise the system's.
 */
export const resolveTheme = (pinned: Theme | null, systemDark: boolean): Theme => pinned ?? (systemDark ? 'dark' : 'light');

export const otherTheme = (theme: Theme): Theme => (theme === 'dark' ? 'light' : 'dark');

/** The theme button's accessible name: what a click does. */
export const themeButtonLabel = (theme: Theme): string => `Switch to ${otherTheme(theme)} theme`;

/** The theme pinned on the root by the inline script or the button, or null when it follows the system. */
export function pinnedTheme(root: Pick<HTMLElement, 'dataset'> | undefined): Theme | null {
  const value = root?.dataset.theme;
  return isTheme(value) ? value : null;
}

interface Doc {
  documentElement: Pick<HTMLElement, 'dataset'>;
  querySelectorAll: (selector: string) => Iterable<{ content: string; media: string }>;
}

/** Pins `theme` on the root and gives the browser's own UI (`theme-color`) the matching page colour. */
export function pinTheme(theme: Theme, doc: Doc): void {
  doc.documentElement.dataset.theme = theme;
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) meta.content = color('gray-1', theme);
}

/** Follows the system again: no pin, and each `theme-color` back to its own scheme's page colour. */
export function unpinTheme(doc: Doc): void {
  delete doc.documentElement.dataset.theme;
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) meta.content = color('gray-1', meta.media.includes('dark') ? 'dark' : 'light');
}

/**
 * Another tab changed the stored theme (a `storage` event, which never fires in the tab that wrote):
 * pin the new value, or follow the system when it was removed or storage was cleared (key null).
 * Returns whether the event was about the theme.
 */
export function applyStorageEvent(event: Pick<StorageEvent, 'key' | 'newValue'>, doc: Doc): boolean {
  if (event.key !== null && event.key !== THEME_KEY) return false;
  const value = event.key === null ? null : event.newValue;
  if (isTheme(value)) pinTheme(value, doc);
  else unpinTheme(doc);
  return true;
}

interface Win {
  document: Doc;
  matchMedia: (query: string) => {
    matches: boolean;
    addEventListener: (type: 'change', listener: () => void) => void;
    removeEventListener: (type: 'change', listener: () => void) => void;
  };
  addEventListener: (type: 'storage', listener: (event: StorageEvent) => void) => void;
  removeEventListener: (type: 'storage', listener: (event: StorageEvent) => void) => void;
}

/** The theme on screen in `win`: its pin, else its system's. */
export const currentTheme = (win: Win): Theme => resolveTheme(pinnedTheme(win.document.documentElement), win.matchMedia(DARK_QUERY).matches);

/** useSyncExternalStore's subscribe: a system change, or another tab's choice (applied first). */
export function subscribeTheme(win: Win, change: () => void): () => void {
  const media = win.matchMedia(DARK_QUERY);
  const onStorage = (event: StorageEvent) => applyStorageEvent(event, win.document) && change();
  media.addEventListener('change', change);
  win.addEventListener('storage', onStorage);
  return () => {
    media.removeEventListener('change', change);
    win.removeEventListener('storage', onStorage);
  };
}

/** The button's click: pin and remember the other theme; returns it. */
export function switchTheme(current: Theme, doc: Doc, storage: Writer | undefined): Theme {
  const next = otherTheme(current);
  pinTheme(next, doc);
  storeTheme(next, storage);
  return next;
}
