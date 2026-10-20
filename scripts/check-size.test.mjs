import { describe, expect, it } from 'vitest';
import { evaluateSizes, initialAssets } from './check-size.mjs';

const budget = { initialJsGzipKB: 1, initialTotalGzipKB: 2 };

describe('check-size', () => {
  it('finds the scripts, styles and preloads index.html loads', () => {
    const html =
      '<script type="module" crossorigin src="/assets/index-a.js"></script>' +
      '<link rel="modulepreload" href="/assets/vendor-b.js"><link rel="stylesheet" href="/assets/index-c.css">' +
      '<link rel="icon" href="data:,">';
    expect(initialAssets(html)).toEqual(['assets/index-a.js', 'assets/index-c.css', 'assets/vendor-b.js']);
  });

  it('passes within budget and reports each exceeded budget', () => {
    expect(evaluateSizes({ 'a.js': 512, 'b.css': 512 }, budget).failures).toEqual([]);
    const over = evaluateSizes({ 'a.js': 1536, 'b.css': 1024 }, budget);
    expect(over.failures).toHaveLength(2);
    expect(over.failures[0]).toMatch(/^initial JS 1\.5 KB/);
  });
});
