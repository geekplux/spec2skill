import { describe, expect, it } from 'vitest';
import { THEME_KEY, applyTheme, initialTheme, storedTheme } from './theme';

const memory = (value: string | null) => {
  const data = new Map<string, string>(value === null ? [] : [[THEME_KEY, value]]);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};
const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
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
});
