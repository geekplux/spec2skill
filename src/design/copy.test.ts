// DESIGN.md rule 1 and check 8.4: no middle dot as a separator in UI copy, titles or aria-labels.
// Scans the app's source and index.html, and the generated skill's files (the skill generator and its
// snapshots): the skill browser shows them, so rule 1 covers them too (R5, D58).
import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';

const DOT = '·';
const sources = import.meta.glob<string>(['../**/*.{ts,tsx,mjs}', '../skillgen/__snapshots__/**/*.{md,json}', '!./copy.test.ts'], { query: '?raw', import: 'default', eager: true });

describe('UI copy', () => {
  it('scans the app source', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });

  it.each(Object.keys(sources))('%s has no middle dot', (file) => {
    const lines = sources[file]!.split('\n').flatMap((line, i) => (line.includes(DOT) ? [`${i + 1}: ${line.trim()}`] : []));
    expect(lines).toEqual([]);
  });

  it('index.html has no middle dot', () => {
    expect(indexHtml.includes(DOT)).toBe(false);
  });
});
