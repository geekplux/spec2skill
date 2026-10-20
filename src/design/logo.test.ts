import { describe, expect, it } from 'vitest';
import favicon from '../../public/favicon.svg?raw';
import logo from '../../public/logo.svg?raw';

const FILES: Record<string, string> = { 'logo.svg': logo, 'favicon.svg': favicon };
const bytes = (text: string) => new TextEncoder().encode(text).length;

describe('logo assets', () => {
  it.each(['logo.svg', 'favicon.svg'])('%s is a small, self-contained SVG', (name) => {
    const text = FILES[name]!;
    expect(bytes(text)).toBeLessThanOrEqual(1536);
    expect(text).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24"/);
    expect(text.trim().endsWith('</svg>')).toBe(true);
    expect(text).not.toMatch(/<(script|image|text)\b|href=/); // no scripts, no external refs, no font text
  });

  it('logo.svg is labelled and uses only ink and meridian', () => {
    const text = logo;
    expect(text).toContain('<title>tool atlas</title>');
    expect(new Set(text.match(/#[0-9A-F]{6}/gi))).toEqual(new Set(['#1C2430', '#1F5FAD']));
  });
});
