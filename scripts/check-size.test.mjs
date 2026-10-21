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

  it('checks each woff2 font against its own budget', () => {
    const fonts = { ...budget, initialTotalGzipKB: 100, fontWoff2KB: 1 };
    expect(evaluateSizes({ 'assets/a.woff2': 1024 }, fonts).failures).toEqual([]);
    expect(evaluateSizes({ 'assets/a.woff2': 1100 }, fonts).failures).toEqual(['font assets/a.woff2 1.1 KB > 1 KB']);
  });

  it('counts the skill chunk against its own budget, not the initial JS', () => {
    const skill = { ...budget, skillChunkGzipKB: 2 };
    const ok = evaluateSizes({ 'assets/index-a.js': 512, 'assets/skill-b.js': 1536 }, skill);
    expect([ok.failures, ok.jsKB, ok.skillKB]).toEqual([[], 0.5, 1.5]);
    expect(evaluateSizes({ 'assets/skill-b.js': 3072 }, skill).failures).toEqual(['skill chunk 3.0 KB gzip > 2 KB']);
    expect(evaluateSizes({ 'assets/index-a.js': 512 }, skill).failures).toEqual(['skill chunk (assets/skill-*.js) is not preloaded by index.html']);
  });
});
