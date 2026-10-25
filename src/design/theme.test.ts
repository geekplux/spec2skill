// The theme button's module and index.html's inline script (D82): storage read and written with
// storage blocked, the initial theme, the switch, and the pin before the first paint.
import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { THEME_KEY, otherTheme, pinTheme, pinnedTheme, resolveTheme, safeStorage, storeTheme, storedTheme, switchTheme, themeButtonLabel } from './theme';
import { color } from './tokens';

/** A Map-backed Storage, or one whose every access throws (blocked storage, privacy mode). */
function memory(entries: Record<string, string> = {}) {
  const data = new Map(Object.entries(entries));
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, String(v)) };
}
const blocked = {
  getItem: (): string | null => {
    throw new DOMException('blocked', 'SecurityError');
  },
  setItem: (): void => {
    throw new DOMException('blocked', 'SecurityError');
  },
};

/** A document with <html> and the two theme-color metas. */
function fakeDoc() {
  const metas = [{ content: '#fcfcfc' }, { content: '#111111' }];
  const documentElement = { dataset: {} as DOMStringMap };
  return { documentElement, metas, querySelectorAll: (sel: string) => (sel === 'meta[name="theme-color"]' ? metas : []) };
}

describe('stored theme', () => {
  it('reads light or dark under spec2skill:theme, and nothing else', () => {
    expect(THEME_KEY).toBe('spec2skill:theme');
    expect(storedTheme(memory({ [THEME_KEY]: 'dark' }))).toBe('dark');
    expect(storedTheme(memory({ [THEME_KEY]: 'light' }))).toBe('light');
    for (const value of ['', 'Dark', 'system', 'auto']) expect(storedTheme(memory({ [THEME_KEY]: value }))).toBeNull();
    expect(storedTheme(memory({ 'tool-atlas:theme': 'dark' }))).toBeNull(); // the pre-rename key is not read
    expect(storedTheme(memory())).toBeNull();
    expect(storedTheme(undefined)).toBeNull();
  });

  it('survives blocked storage: reads null, writes report false, nothing throws', () => {
    expect(storedTheme(blocked)).toBeNull();
    expect(storeTheme('dark', blocked)).toBe(false);
    expect(storeTheme('dark', undefined)).toBe(false);
    const store = memory();
    expect(storeTheme('dark', store)).toBe(true);
    expect(store.data.get(THEME_KEY)).toBe('dark');
  });

  it('safeStorage returns undefined when localStorage throws or is missing', () => {
    const own = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    try {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new DOMException('blocked', 'SecurityError'); } });
      expect(safeStorage()).toBeUndefined();
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
      expect(safeStorage()).toBeUndefined();
      const store = memory();
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: store });
      expect(safeStorage()).toBe(store);
    } finally {
      if (own) Object.defineProperty(globalThis, 'localStorage', own);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe('initial theme', () => {
  it('follows the system until a theme is pinned', () => {
    expect(resolveTheme(null, false)).toBe('light');
    expect(resolveTheme(null, true)).toBe('dark');
  });

  it('keeps a pinned theme whatever the system says, also when they are equal', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('reads the pin from <html> data-theme', () => {
    expect(pinnedTheme({ dataset: { theme: 'dark' } })).toBe('dark');
    expect(pinnedTheme({ dataset: {} })).toBeNull();
    expect(pinnedTheme({ dataset: { theme: 'sepia' } })).toBeNull();
    expect(pinnedTheme(undefined)).toBeNull();
  });
});

describe('switch', () => {
  it('names the button by what a click does', () => {
    expect(themeButtonLabel('light')).toBe('Switch to dark theme');
    expect(themeButtonLabel('dark')).toBe('Switch to light theme');
    expect([otherTheme('light'), otherTheme('dark')]).toEqual(['dark', 'light']);
  });

  it('pins and stores the other theme, and sets theme-color to its page colour', () => {
    const doc = fakeDoc();
    const store = memory();
    expect(switchTheme('light', doc, store)).toBe('dark');
    expect(doc.documentElement.dataset.theme).toBe('dark');
    expect(store.data.get(THEME_KEY)).toBe('dark');
    expect(doc.metas.map((m) => m.content)).toEqual([color('gray-1', 'dark'), color('gray-1', 'dark')]);
    expect(switchTheme('dark', doc, store)).toBe('light');
    expect([doc.documentElement.dataset.theme, store.data.get(THEME_KEY)]).toEqual(['light', 'light']);
    expect(doc.metas.map((m) => m.content)).toEqual(['#fcfcfc', '#fcfcfc']);
  });

  it('still switches for the visit when storage is blocked', () => {
    const doc = fakeDoc();
    expect(switchTheme('light', doc, blocked)).toBe('dark');
    expect(pinnedTheme(doc.documentElement)).toBe('dark');
    pinTheme('light', doc);
    expect(pinnedTheme(doc.documentElement)).toBe('light');
  });
});

describe("index.html's inline script", () => {
  const scripts = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
  const head = indexHtml.slice(0, indexHtml.indexOf('</head>'));
  /** Runs the inline script against `storage` (or a throwing localStorage) and a fake document. */
  const run = (storage: object) => {
    const doc = fakeDoc();
    // oxlint-disable-next-line no-new-func -- the inline script is the code under test
    new Function('localStorage', 'document', scripts[0]!)(storage, doc);
    return doc;
  };

  it('is one classic script in <head>, before the app module', () => {
    expect(scripts).toHaveLength(1);
    expect(head).toContain(scripts[0]);
    expect(scripts[0]).toContain(`'${THEME_KEY}'`);
  });

  it('pins a stored theme and its theme-color, like pinTheme', () => {
    for (const theme of ['light', 'dark'] as const) {
      const doc = run(memory({ [THEME_KEY]: theme }));
      const expected = fakeDoc();
      pinTheme(theme, expected);
      expect({ theme: doc.documentElement.dataset.theme, metas: doc.metas }).toEqual({ theme: expected.documentElement.dataset.theme, metas: expected.metas });
    }
  });

  it('pins nothing without a valid choice or with storage blocked', () => {
    for (const storage of [memory(), memory({ [THEME_KEY]: 'auto' }), memory({ 'tool-atlas:theme': 'dark' }), blocked]) {
      const doc = run(storage);
      expect(doc.documentElement.dataset.theme).toBeUndefined();
      expect(doc.metas.map((m) => m.content)).toEqual(['#fcfcfc', '#111111']);
    }
  });
});
