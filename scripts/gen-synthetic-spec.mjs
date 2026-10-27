// Prints the synthetic large OpenAPI 3.1 spec as JSON (src/__fixtures__/synthetic.ts; 40 resources =
// 1000 operations), for the browser check's large-paste flow:
//   node scripts/gen-synthetic-spec.mjs [resources] > synthetic.json
// Loads the TypeScript fixture through Vite's SSR loader (D16), like write-skill.mjs.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const resources = Number(process.argv[2] ?? 40);
if (!Number.isInteger(resources) || resources < 1) {
  console.error('usage: node scripts/gen-synthetic-spec.mjs [resources]');
  process.exit(2);
}
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { syntheticSpec } = await server.ssrLoadModule('/src/__fixtures__/synthetic.ts');
  process.stdout.write(`${JSON.stringify(syntheticSpec(resources))}\n`);
} finally {
  await server.close();
}
