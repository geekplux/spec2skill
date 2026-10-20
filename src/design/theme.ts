// Theme choice: an explicit choice is stored; otherwise follow prefers-color-scheme.
import type { Theme } from './tokens';

export const THEME_KEY = 'tool-atlas:theme';

/** window.localStorage, or undefined where touching it throws (blocked storage). */
export function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function storedTheme(storage: Pick<Storage, 'getItem'> | undefined): Theme | null {
  try {
    const value = storage?.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null; // storage blocked (privacy mode): fall back to the system preference
  }
}

export function initialTheme(storage: Pick<Storage, 'getItem'> | undefined, prefersDark: boolean): Theme {
  return storedTheme(storage) ?? (prefersDark ? 'dark' : 'light');
}

/** Pins the theme on <html> and remembers it. */
export function applyTheme(theme: Theme, root: HTMLElement, storage?: Pick<Storage, 'setItem'>): void {
  root.dataset.theme = theme;
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    // not persisted; the toggle still works for this visit
  }
}
