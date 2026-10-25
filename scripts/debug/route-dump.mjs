// Debug render of the route map layout (src/layout/route.ts, redesign R3): dumps each built-in
// sample's layout as a plain SVG (cards, rows with labels, rest links, the workflow in indigo) and,
// with --shots, screenshots them to WebP under docs/screenshots/redesign-r3/.
//   node scripts/debug/route-dump.mjs [outdir] [--shots] [--hover <sample>:<op>] [--synthetic]
// (--synthetic adds the 1000-operation spec; it is not committed: 30 columns wide).
// Loads the TypeScript layout through Vite's SSR loader (D16), like write-skill.mjs. Needs
// CHROME_PATH for --shots, and python3 with Pillow for the WebP conversion.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const shots = args.includes('--shots');
const hoverArg = args.includes('--hover') ? args[args.indexOf('--hover') + 1] : undefined;
const out = resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--hover') ?? 'docs/screenshots/redesign-r3');
mkdirSync(out, { recursive: true });

// Radix light values (DESIGN.md 2): the dump is a static file, so no CSS variables.
const C = { g1: '#fcfcfc', g3: '#f0f0f0', g6: '#d9d9d9', g7: '#cecece', g9: '#8d8d8d', g11: '#646464', g12: '#202020', i9: '#3e63dd', i11: '#3a5bc7', a11: '#ab6400' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const MONO = "font-family='IBM Plex Mono, ui-monospace, monospace'";
const SANS = "font-family='IBM Plex Sans, system-ui, sans-serif'";

function svg(layout, hover) {
  const pad = 48;
  const b = layout.bounds;
  const [x0, y0] = [Math.min(b.x, 0) - pad, Math.min(b.y, 0) - pad];
  const [w, h] = [Math.max(b.x + b.w, layout.width) - x0 + pad, Math.max(b.y + b.h, layout.height) - y0 + pad];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x0} ${y0} ${w} ${h}">
<defs>
<marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1.5 6.5 4 1 6.5" fill="none" stroke="${C.g9}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></marker>
<marker id="ahk" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1.5 6.5 4 1 6.5" fill="none" stroke="${C.g12}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></marker>
<marker id="ahr" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1 7 4 1 7z" fill="${C.i9}"/></marker>
</defs><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fff"/>`;
  const quiet = hover ? C.g6 : C.g9;
  for (const l of layout.links) {
    s += `<path d="${l.d}" fill="none" stroke="${quiet}" stroke-width="1"${l.inferred ? ' stroke-dasharray="3 3"' : ''}${hover ? '' : ' marker-end="url(#ah)"'}/>`;
  }
  if (hover) {
    for (const l of hover.links) {
      const arrow = l.kind === 'shared-schema' ? '' : ' marker-end="url(#ahk)"';
      s += `<path d="${l.d}" fill="none" stroke="${C.g12}" stroke-width="1.25"${l.inferred || l.kind !== 'feeds' ? ' stroke-dasharray="3 3"' : ''}${arrow}/>`;
    }
  } else if (layout.workflow) {
    for (const step of layout.workflow.steps) {
      s += `<path d="${step.d}" fill="none" stroke="${C.g1}" stroke-width="6" stroke-linecap="round"/>`;
      s += `<path d="${step.d}" fill="none" stroke="${C.i9}" stroke-width="2.5" stroke-linecap="round" marker-end="url(#ahr)"/>`;
    }
  }
  for (const c of layout.cards) {
    s += `<rect x="${c.x + 0.25}" y="${c.y + 0.25}" width="${c.w - 0.5}" height="${c.h - 0.5}" rx="8" fill="${C.g1}" stroke="${C.g7}" stroke-width=".5"/>`;
    s += `<text x="${c.x + 12}" y="${c.y + 23}" ${SANS} font-size="14" font-weight="600" fill="${C.g12}">${esc(c.name)}</text>`;
    s += `<text x="${c.x + c.w - 12}" y="${c.y + 23}" ${SANS} font-size="12" text-anchor="end" fill="${C.g11}">${c.count}</text>`;
    s += `<line x1="${c.x}" x2="${c.x + c.w}" y1="${c.y + 36}" y2="${c.y + 36}" stroke="${C.g6}" stroke-width=".5"/>`;
    for (const r of c.rows) {
      const near = !hover || hover.near.has(r.op);
      const op = near ? '' : ' opacity=".38"';
      if (hover?.op === r.op) s += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="6" fill="${C.g3}"/>`;
      const stop = !hover && r.stop;
      s += `<g${op}><text x="${r.x + 10}" y="${r.cy + 4}" ${MONO} font-size="12" fill="${r.destructive ? C.a11 : C.g11}">${esc(r.method)}</text>`;
      s += `<text x="${r.x + 60}" y="${r.cy + 5}" ${MONO} font-size="14"${stop ? ` font-weight="600" fill="${C.i11}"` : ` fill="${C.g12}"`} textLength="${Math.min(r.op.length * 8.4, stop ? 100 : 128)}" lengthAdjust="spacingAndGlyphs">${esc(r.op)}</text></g>`;
      if (stop) {
        const st = layout.workflow.stops.find((x) => x.op === r.op);
        s += `<circle cx="${st.cx}" cy="${st.cy}" r="9" fill="${C.i9}"/><text x="${st.cx}" y="${st.cy + 4}" ${SANS} font-size="12" font-weight="600" text-anchor="middle" fill="#fff">${st.n}</text>`;
      }
    }
    if (c.more) {
      s += `<text x="${c.more.x + 10}" y="${c.more.cy + 4}" ${SANS} font-size="12" fill="${C.g11}">${c.more.expanded ? 'Show fewer' : `${c.more.count} more`}</text>`;
    }
  }
  return `${s}</svg>\n`;
}

const server = await createServer({
  root: fileURLToPath(new URL('../..', import.meta.url)), configFile: false, appType: 'custom', logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] },
});
const files = [];
try {
  const load = (path) => server.ssrLoadModule(path);
  const [{ SAMPLES, sampleModel }, { buildGraph }, { routeLayout, hoverLinks }, { normalise }, { syntheticSpec }] = await Promise.all(
    ['/src/samples/index.ts', '/src/graph/index.ts', '/src/layout/route.ts', '/src/model/normalise.ts', '/src/__fixtures__/synthetic.ts'].map(load),
  );
  const names = { tasks: 'tasks', petstore: 'petstore', filesystem: 'filesystem-mcp' };
  const inputs = await Promise.all(SAMPLES.map(async (s) => ({ id: s.id, name: names[s.id] ?? s.id, model: await sampleModel(s) })));
  if (args.includes('--synthetic')) inputs.push({ id: 'synthetic', name: 'synthetic', model: await normalise(syntheticSpec(40)) });
  for (const { id, name, model } of inputs) {
    const graph = buildGraph(model);
    const layout = routeLayout(model, graph);
    const file = join(out, `${name}.svg`);
    writeFileSync(file, svg(layout));
    files.push(file);
    if (hoverArg?.startsWith(`${id}:`)) {
      const op = hoverArg.slice(id.length + 1);
      const links = hoverLinks(layout, graph, op);
      const near = new Set([op, ...links.flatMap((l) => [l.from, l.to])]);
      const hfile = join(out, `${name}-hover.svg`);
      writeFileSync(hfile, svg(layout, { op, links, near }));
      files.push(hfile);
    }
    console.log(`${name}: ${layout.cards.length} cards, ${layout.links.length} links, ${layout.width} x ${layout.height}, workflow ${layout.workflow?.steps.map((s) => s.shape).join(' ') ?? 'none'}`);
  }
} finally {
  await server.close();
}

if (shots) {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  try {
    const { readFileSync } = await import('node:fs');
    for (const file of files) {
      // WebP stops at 16383 px a side: wide maps are shot at 1x.
      const wide = Number(/width="([\d.]+)"/.exec(readFileSync(file, 'utf8'))?.[1] ?? 0) > 6000;
      const page = await browser.newPage({ deviceScaleFactor: wide ? 1 : 2 });
      await page.setContent(`<!doctype html><body style="margin:0;background:#fff">${readFileSync(file, 'utf8')}</body>`);
      const png = file.replace(/\.svg$/, '.png');
      await page.locator('svg').first().screenshot({ path: png });
      execFileSync('python3', ['-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2], quality=82)', png, png.replace(/\.png$/, '.webp')]);
      execFileSync('rm', [png, file]);
      console.log(`wrote ${png.replace(/\.png$/, '.webp')}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
