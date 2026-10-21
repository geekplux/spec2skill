// The CLI (D24): one dependency-free ESM file, `dist-cli/spec2skill.mjs`, for Node 20+.
// `ssr.noExternal: true` bundles js-yaml and the `?raw` skill templates; only `node:*` stays external.
import { chmodSync } from 'node:fs';
import { type Plugin, defineConfig } from 'vite';

const GUARD = "import.meta.url.startsWith('file:')";

/** Inside the bundle, the audit script's "run as a script" check would match the CLI itself: switch it off. */
const auditAsLibrary = (): Plugin => ({
  name: 'spec2skill:audit-as-library',
  transform(code, id) {
    if (!id.endsWith('skillgen/assets/scripts/audit.mjs')) return null;
    if (!code.includes(GUARD)) throw new Error('audit.mjs main guard not found; update vite.config.cli.ts');
    return code.replace(GUARD, 'false');
  },
  writeBundle: ({ dir }) => chmodSync(`${dir}/spec2skill.mjs`, 0o755),
});

export default defineConfig({
  publicDir: false,
  plugins: [auditAsLibrary()],
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: 'src/cli/index.ts',
    outDir: 'dist-cli',
    emptyOutDir: true,
    target: 'node20',
    sourcemap: false,
    rollupOptions: { output: { entryFileNames: 'spec2skill.mjs', banner: '#!/usr/bin/env node', codeSplitting: false } },
  },
});
