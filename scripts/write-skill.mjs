// Writes the generated skill for a built-in sample or a spec file to a directory:
//   node scripts/write-skill.mjs <tasks|petstore|filesystem|path/to/spec> <outdir>
// Loads the TypeScript generator through Vite's SSR loader (D16), so `?raw` assets work without a build.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const [source, out] = process.argv.slice(2);
if (!source || !out) {
  console.error('usage: node scripts/write-skill.mjs <sample-id|spec-file> <outdir>');
  process.exit(2);
}
if (existsSync(out) && readdirSync(out).length) {
  console.error(`write-skill: ${out} is not empty; pick a new directory`);
  process.exit(2);
}

const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const load = (path) => server.ssrLoadModule(path);
  const [{ SAMPLES, sampleModel }, { buildGraph }, { generateSkill }, { normalise }, { parseText }] = await Promise.all(
    ['/src/samples/index.ts', '/src/graph/index.ts', '/src/skillgen/index.ts', '/src/model/normalise.ts', '/src/parse/text.ts'].map(load),
  );
  const sample = SAMPLES.find((s) => s.id === source);
  const model = sample ? await sampleModel(sample) : await normalise(parseText(readFileSync(source, 'utf8')).value);
  const tree = generateSkill(model, buildGraph(model));
  for (const [path, text] of Object.entries(tree)) {
    const file = join(resolve(out), path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  console.log(`wrote ${Object.keys(tree).length} files to ${out}`);
} finally {
  await server.close();
}
