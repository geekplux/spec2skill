import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkSpacing } from './check-spacing.mjs';

const FIXTURE = `/* a comment with margin: 99px is ignored */
.a { margin: 13px; color: red; }
@media (max-width: 639px) {
  .b { padding: var(--space-2) 1.5rem; gap: 0; }
}
.c { top: 0; inset-inline: var(--space-3); height: 40px; border-width: 2px; padding-left: 1.2em; }
`;

describe('check-spacing', () => {
  it('fails raw px and rem in spacing declarations, with file, line and selector', () => {
    expect(checkSpacing(FIXTURE, 'x.css', [])).toEqual([
      'x.css:2: .a { margin: 13px } uses 13px; use var(--space-*)',
      'x.css:4: .b { padding: var(--space-2) 1.5rem } uses 1.5rem; use var(--space-*)',
    ]);
  });

  it('passes tokens, zero, em and non-spacing properties, and honours the allow-list', () => {
    expect(checkSpacing('.c { top: 0; margin: var(--space-1) 0; padding-left: 1.2em; height: 40px; }', 'y.css', [])).toEqual([]);
    expect(checkSpacing('.skip { top: -100px; }', 'y.css', [['y.css', '.skip', 'top']])).toEqual([]);
    expect(checkSpacing('.skip { top: -100px; }', 'z.css', [['y.css', '.skip', 'top']])).toHaveLength(1);
  });

  it('exits 1 on a stylesheet with margin: 13px, and 0 on the app', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spacing-'));
    try {
      writeFileSync(join(dir, 'bad.css'), '.x { margin: 13px; }\n');
      expect(() => execFileSync(process.execPath, ['scripts/check-spacing.mjs', join(dir, 'bad.css')], { stdio: 'pipe' })).toThrow(/margin: 13px/);
      expect(execFileSync(process.execPath, ['scripts/check-spacing.mjs'], { encoding: 'utf8' })).toMatch(/spacing check passed/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
