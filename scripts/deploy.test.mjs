// Deployment prep (phase 21): the Worker config, the dry-run script, cache headers and DEPLOY.md.
// Nothing here deploys; `pnpm run check:deploy` (a dry run) proves the bundle and bindings.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (path) => readFileSync(join(root, path), 'utf8');
/** wrangler.jsonc keeps every comment on its own line, so dropping those lines leaves plain JSON. */
const wrangler = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));

describe('wrangler.jsonc', () => {
  it('is one Worker with static assets, /api/* routed to the Worker first', () => {
    expect(wrangler).toMatchObject({
      name: 'spec2skill',
      main: 'worker/index.ts',
      assets: { directory: './dist', binding: 'ASSETS', not_found_handling: 'single-page-application', run_worker_first: ['/api/*'] },
    });
    expect(wrangler.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('binds AI, the SPEC_CACHE namespace, both rate limiters and AI_MODEL, with logs but no secrets', () => {
    expect(wrangler.ai).toEqual({ binding: 'AI' });
    expect(wrangler.kv_namespaces).toEqual([{ binding: 'SPEC_CACHE', id: expect.stringMatching(/^[0-9a-f]{32}$/) }]);
    expect(wrangler.ratelimits.map((r) => [r.name, r.simple.limit, r.simple.period])).toEqual([
      ['RATE_LIMITER', 30, 60],
      ['AI_RATE_LIMITER', 10, 60],
    ]);
    expect(Object.keys(wrangler.vars)).toEqual(['AI_MODEL']);
    expect(wrangler.observability).toEqual({ enabled: true, redact_query_string: true });
    // Local dev (`pnpm dev:worker`) has no AI binding, so it never needs a Cloudflare login.
    expect(wrangler.env.local.ai).toBeUndefined();
  });
});

describe('scripts', () => {
  const { scripts } = JSON.parse(read('package.json'));
  it('has the dry run exactly, and no script that deploys or publishes', () => {
    expect(scripts['check:deploy']).toBe('wrangler deploy --dry-run --outdir .wrangler/dry-run');
    expect(scripts.deploy).toBeUndefined();
    expect(scripts.publish).toBeUndefined();
    const publishing = /wrangler\s+(?:pages\s+)?deploy|wrangler\s+publish|npm\s+publish|pnpm\s+(?:run\s+)?deploy/;
    expect(Object.keys(scripts).filter((name) => name !== 'check:deploy' && publishing.test(scripts[name]))).toEqual([]);
  });
  it('keeps local Worker state and secrets out of git', () => {
    const ignored = read('.gitignore').split('\n');
    for (const entry of ['.wrangler/', '.dev.vars', '!.dev.vars.example']) expect(ignored).toContain(entry);
    expect(read('.dev.vars.example')).toMatch(/no secrets/);
    expect(read('.dev.vars.example')).not.toMatch(/^[A-Z_]+=/m);
  });
});

describe('public/_headers', () => {
  it('caches hashed assets for a year and revalidates the app shell', () => {
    const rules = {};
    let path = null;
    for (const line of read('public/_headers').split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      if (!/^\s/.test(line)) path = line.trim();
      else (rules[path] ??= []).push(line.trim());
    }
    expect(rules).toEqual({
      '/assets/*': ['Cache-Control: public, max-age=31536000, immutable'],
      '/': ['Cache-Control: no-cache'],
      '/index.html': ['Cache-Control: no-cache'],
    });
  });
});

describe('docs/DEPLOY.md', () => {
  const doc = read('docs/DEPLOY.md');
  it('gives the setup, dry run, the exact deploy command, smoke and rollback', () => {
    for (const text of [
      'pnpm exec wrangler login',
      'pnpm exec wrangler kv namespace create SPEC_CACHE',
      '00000000000000000000000000000000',
      'pnpm install --frozen-lockfile && pnpm build && pnpm run check:deploy',
      'pnpm build && pnpm exec wrangler deploy\n',
      '/api/health',
      'Download .zip',
      'audit passed',
      'pnpm exec wrangler rollback',
      'docs/social-preview.png',
    ]) {
      expect(doc).toContain(text);
    }
  });
  it('documents the placeholder id that wrangler.jsonc ships with', () => {
    expect(doc).toContain(wrangler.kv_namespaces[0].id);
  });
});
