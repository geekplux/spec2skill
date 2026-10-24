// DESIGN.md rule 1 and check 8.4: no middle dot as a separator in UI copy, titles or aria-labels.
// Scans the app's source and index.html. src/skillgen writes the generated skill's own files (its
// references use the dot in their Markdown), which are output, not UI copy.
import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';

const DOT = '·';
const sources = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../skillgen/**', '!./copy.test.ts'], { query: '?raw', import: 'default', eager: true });

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
