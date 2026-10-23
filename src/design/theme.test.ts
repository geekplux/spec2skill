import { describe, expect, it } from 'vitest';
import { LEGACY_THEME_KEY, THEME_KEY, applyTheme, followSystem, initialTheme, migrateTheme, storedTheme } from './theme';

const memory = (value: string | null, legacy?: string) => {
  const data = new Map<string, string>(value === null ? [] : [[THEME_KEY, value]]);
  if (legacy !== undefined) data.set(LEGACY_THEME_KEY, legacy);
  const removeItem = (k: string) => void data.delete(k);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem, data };
};
const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('theme', () => {
  it('follows the system preference when nothing is stored', () => {
    expect(initialTheme(memory(null), true)).toBe('dark');
    expect(initialTheme(memory(null), false)).toBe('light');
    expect(initialTheme(undefined, true)).toBe('dark');
  });

  it('prefers an explicit stored choice and ignores junk', () => {
    expect(initialTheme(memory('light'), true)).toBe('light');
    expect(initialTheme(memory('dark'), false)).toBe('dark');
    expect(storedTheme(memory('sepia'))).toBeNull();
    expect(storedTheme(throwing)).toBeNull();
  });

  it('pins the theme on the root and stores it', () => {
    const root = { dataset: {} as DOMStringMap } as HTMLElement;
    const storage = memory(null);
    applyTheme('dark', root, storage);
    expect(root.dataset.theme).toBe('dark');
    expect(storage.data.get(THEME_KEY)).toBe('dark');
    expect(() => applyTheme('light', root, throwing)).not.toThrow();
    expect(root.dataset.theme).toBe('light');
  });

  it('moves a pre-rename choice to the new key once, without overriding a newer choice', () => {
    expect(THEME_KEY).toBe('spec2skill:theme');
    expect(LEGACY_THEME_KEY).toBe('tool-atlas:theme');
    const old = memory(null, 'dark');
    migrateTheme(old);
    expect([...old.data]).toEqual([[THEME_KEY, 'dark']]);
    const both = memory('light', 'dark');
    migrateTheme(both);
    expect([...both.data]).toEqual([[THEME_KEY, 'light']]);
    const junk = memory(null, 'sepia');
    migrateTheme(junk);
    expect(junk.data.size).toBe(0);
    expect(() => migrateTheme(throwing)).not.toThrow();
    expect(() => migrateTheme(undefined)).not.toThrow();
  });

  it('follows OS scheme changes only while no choice is stored (A10)', () => {
    expect(followSystem(memory(null), true)).toBe('dark');
    expect(followSystem(memory(null), false)).toBe('light');
    expect(followSystem(undefined, true)).toBe('dark');
    expect(followSystem(memory('light'), true)).toBeNull();
    expect(followSystem(memory('dark'), false)).toBeNull();
    expect(followSystem(throwing, true)).toBe('dark'); // blocked storage: nothing stored
  });
});
