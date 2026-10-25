// spec2skill redesign v1: generates the canvas boards (project/*.dc.html) and local previews (preview/*.html).
// Data: the real Tasks API sample, dumped from geekplux/spec2skill main @ 5e6fed7 (tasks.json).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const D = JSON.parse(readFileSync(new URL('./tasks.json', import.meta.url)));
const OUT = new URL('./', import.meta.url).pathname;
mkdirSync(OUT + 'project', { recursive: true });
mkdirSync(OUT + 'preview', { recursive: true });

// Radix Colors 3.0: gray, indigo, amber (light / dark), steps 1..12.
const R = {
  gray: ['#fcfcfc', '#f9f9f9', '#f0f0f0', '#e8e8e8', '#e0e0e0', '#d9d9d9', '#cecece', '#bbbbbb', '#8d8d8d', '#838383', '#646464', '#202020'],
  grayD: ['#111111', '#191919', '#222222', '#2a2a2a', '#313131', '#3a3a3a', '#484848', '#606060', '#6e6e6e', '#7b7b7b', '#b4b4b4', '#eeeeee'],
  indigo: ['#fdfdfe', '#f7f9ff', '#edf2fe', '#e1e9ff', '#d2deff', '#c1d0ff', '#abbdf9', '#8da4ef', '#3e63dd', '#3358d4', '#3a5bc7', '#1f2d5c'],
  indigoD: ['#11131f', '#141726', '#182449', '#1d2e62', '#253974', '#304384', '#3a4f97', '#435db1', '#3e63dd', '#5472e4', '#9eb1ff', '#d6e1ff'],
  amber: ['#fefdfb', '#fefbe9', '#fff7c2', '#ffee9c', '#fbe577', '#f3d673', '#e9c162', '#e2a336', '#ffc53d', '#ffba18', '#ab6400', '#4f3422'],
  amberD: ['#16120c', '#1d180f', '#302008', '#3f2700', '#4d3000', '#5c3d05', '#714f19', '#8f6424', '#ffc53d', '#ffd60a', '#ffca16', '#ffe7b3'],
};
const vars = (dark) =>
  ['gray', 'indigo', 'amber']
    .map((n) => R[dark ? n + 'D' : n].map((v, i) => `--${n}-${i + 1}:${v}`).join(';'))
    .join(';');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
body{margin:0}
.s2{font-family:'IBM Plex Sans',ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:20px;color:var(--gray-12);background:var(--gray-1);font-feature-settings:"tnum";-webkit-font-smoothing:antialiased}
.s2 *{box-sizing:border-box}
.s2 a{color:inherit;text-decoration:none}
.s2 button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer}
.s2 input{font:inherit;color:inherit}
.mono{font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace}
.muted{color:var(--gray-11)}
.wrap{max-width:1136px;margin:0 auto;padding:0 32px;width:100%}
.hdr{height:56px;border-bottom:.5px solid var(--gray-6);display:flex;align-items:center}
.hdr .wrap{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:8px;font-weight:600}
.nav{display:flex;gap:24px;color:var(--gray-11)}
.nav a:hover{color:var(--gray-12)}
.hero{padding:104px 0 64px}
.hero .wrap{display:grid;grid-template-columns:492px 492px;column-gap:88px;align-items:end}
h1{font-size:48px;line-height:52px;font-weight:600;letter-spacing:-.035em;margin:0 0 20px;text-wrap:balance}
.lede{font-size:20px;line-height:28px;color:var(--gray-11);margin:0;letter-spacing:-.01em;text-wrap:pretty}
.load{display:flex;flex-direction:column;gap:12px}
.field{display:flex;align-items:center;height:48px;padding:0 4px 0 16px;border-radius:10px;background:var(--gray-1);box-shadow:inset 0 0 0 .5px var(--gray-8)}
.field input{flex:1;border:0;background:none;outline:none;min-width:0}
.field input::placeholder{color:var(--gray-11)}
.btn{height:32px;padding:0 12px;border-radius:6px;display:inline-flex;align-items:center;gap:8px;font-weight:500;white-space:nowrap}
.btn.lg{height:40px;padding:0 16px}
.btn.pri{background:var(--indigo-9);color:#fff}
.btn.sec{box-shadow:inset 0 0 0 .5px var(--gray-8);background:var(--gray-1)}
.btn.ghost{color:var(--gray-11)}
.btn svg{flex:none}
.samples{display:flex;align-items:center;gap:16px}
.samples .seg{flex:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
.seg{display:inline-flex;padding:4px;border-radius:10px;background:var(--gray-3);gap:2px}
.seg button{height:32px;padding:0 12px;border-radius:6px;color:var(--gray-11)}
.seg button.on{background:var(--gray-1);color:var(--gray-12);font-weight:500;box-shadow:0 0 0 .5px var(--gray-7)}
.frame{margin:0 -32px;border-radius:16px;box-shadow:inset 0 0 0 .5px var(--gray-7);padding:32px}
.fhead{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:32px}
.ftitle{font-size:20px;line-height:28px;font-weight:600;letter-spacing:-.015em;margin:0 0 4px}
.meta{display:flex;flex-wrap:wrap;column-gap:20px;row-gap:4px;color:var(--gray-11);align-items:center}
.meta b{color:var(--gray-12);font-weight:500}
.tag{height:20px;padding:0 6px;border-radius:4px;background:var(--gray-3);color:var(--gray-11);font-size:12px;line-height:20px}
.actions{display:flex;gap:8px;flex:none}
.tools{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;gap:16px}
.tools-l{display:flex;gap:12px;align-items:center}
.search{height:40px;width:202px;border-radius:10px;box-shadow:inset 0 0 0 .5px var(--gray-7);display:flex;align-items:center;gap:8px;padding:0 12px;color:var(--gray-11)}
.kbd{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:12px;line-height:18px;min-width:20px;height:20px;text-align:center;border-radius:4px;box-shadow:inset 0 0 0 .5px var(--gray-7);color:var(--gray-11)}
.legend{display:flex;gap:20px;font-size:12px;color:var(--gray-11);align-items:center}
.legend span{display:inline-flex;align-items:center;gap:8px}
.map{position:relative}
.map svg.edges{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.cl{position:absolute;width:202px;border-radius:8px;background:var(--gray-1);box-shadow:inset 0 0 0 .5px var(--gray-7);padding-bottom:4px}
.cl h3{margin:0;height:36px;padding:0 12px;display:flex;align-items:center;justify-content:space-between;font-size:14px;font-weight:600;border-bottom:.5px solid var(--gray-6)}
.cl h3 small{font-size:12px;font-weight:400;color:var(--gray-11)}
.s2 .op{height:32px;display:flex;align-items:center;gap:6px;padding:0 6px 0 10px;margin:0 4px;border-radius:6px;width:calc(100% - 8px);text-align:left}
.op .m{font-size:12px;width:44px;color:var(--gray-11);flex:none}
.op .m.del{color:var(--amber-11)}
.op .id{font-size:14px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.op.route .id{color:var(--indigo-11);font-weight:600}
.op.hot{background:var(--gray-3)}
.op.dim{opacity:.38}
.stop{width:18px;height:18px;border-radius:50%;background:var(--indigo-9);color:#fff;font-size:12px;line-height:18px;text-align:center;font-weight:600;flex:none}
.caption{margin-top:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;color:var(--gray-11)}
.caption .chain{display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap;color:var(--gray-12)}
.caption code{font-size:12px;color:var(--gray-11)}
.split{border-top:.5px solid var(--gray-6);margin-top:40px;padding-top:32px;display:grid;grid-template-columns:202px 492px 202px;column-gap:88px}
.tree h4,.prev h4,.audit h4{margin:0 0 16px;font-size:14px;font-weight:600;height:20px;display:flex;justify-content:space-between;align-items:center}
.tree h4{font-family:'IBM Plex Mono',ui-monospace,monospace}
.row{height:28px;transition:background-color 250ms ease-out;display:flex;align-items:center;gap:8px;padding:0 8px;border-radius:6px;margin:0 -8px}
.row .n{flex:1;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:12px}
.row .c{font-size:12px;color:var(--gray-11)}
.row.on{background:var(--gray-3)}
.row svg{color:var(--gray-11);flex:none}
.s2 .edit{display:block;margin-top:16px;font-size:12px;color:var(--gray-11);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:.5px}
.code{max-height:392px;overflow-y:auto;border-radius:10px;background:var(--gray-2);box-shadow:inset 0 0 0 .5px var(--gray-6);padding:12px 0;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:12px;line-height:20px;overflow:hidden}
.code .l{display:flex;white-space:pre-wrap;padding-right:16px}
.code .l>span:last-child{flex:1;min-width:0;overflow-wrap:anywhere}
.code .ln{width:44px;text-align:right;padding-right:16px;color:var(--gray-11);flex:none}
.code .k{color:var(--gray-11)}
.code .h{font-weight:600}
.audit .ok{display:flex;align-items:center;gap:8px}
.chk{display:flex;gap:8px;padding:7px 0;border-top:.5px solid var(--gray-6);font-size:12px;line-height:16px}
.audit h4+.chk{border-top:0;padding-top:0}
.chk svg{flex:none;margin-top:1px;color:var(--indigo-11)}
.block{padding:96px 0 0}
.sec2{display:grid;grid-template-columns:492px 492px;column-gap:88px;align-items:start}
h2{font-size:20px;line-height:28px;font-weight:600;letter-spacing:-.015em;margin:0 0 8px}
.cli{border-radius:10px;background:var(--gray-2);box-shadow:inset 0 0 0 .5px var(--gray-6);padding:14px 16px;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:12px;line-height:20px;white-space:pre;position:relative}
.cli .p{color:var(--gray-11)}
.cli button{position:absolute;right:8px;top:8px;width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--gray-11)}
.steps{display:grid;grid-template-columns:repeat(4,202px);column-gap:88px;margin-top:24px}
.steps div{border-top:.5px solid var(--gray-7);padding-top:16px}
.steps b{display:block;font-weight:600;margin-bottom:4px}
.steps p{margin:0;color:var(--gray-11)}
.made{margin-top:96px}
.made .in{border-top:.5px solid var(--gray-6);padding-top:48px}
.made .sec2 p{margin:0 0 12px}
.s2 .ul{text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:.5px}
.links{display:flex;flex-direction:column}
.links a{display:grid;grid-template-columns:202px 202px;column-gap:88px;padding:14px 0;border-top:.5px solid var(--gray-6)}
.links a:first-child{border-top:0;padding-top:4px}
.links a>span{grid-column:2;grid-row:1 / span 2}
.links b{display:block;font-weight:500}
.links span{display:block;color:var(--gray-11)}
.links code{display:block;font-size:12px;color:var(--gray-11);margin-top:4px}
.foot{margin-top:64px}
.foot .in{border-top:.5px solid var(--gray-6);height:72px;display:flex;justify-content:space-between;align-items:center}
.tip{position:absolute;width:300px;border-radius:10px;background:var(--gray-1);box-shadow:0 0 0 .5px var(--gray-7),0 8px 24px rgba(0,0,0,.08);padding:16px;z-index:2}
.tip .t{font-weight:600;margin:4px 0 12px}
.tip dl{margin:0;display:grid;grid-template-columns:64px minmax(0,1fr);row-gap:8px;column-gap:12px;font-size:12px;line-height:16px}
.tip dt{color:var(--gray-11)}
.tip dd{margin:0}
.s2 .tip .ref{color:var(--indigo-11);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:.5px}

@keyframes s2fade{from{opacity:0}to{opacity:1}}
@keyframes s2rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes s2draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes s2pop{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:none}}
.anim .cl{animation:s2rise 250ms ease-out both;animation-delay:calc(var(--i) * 40ms)}
.anim .e{animation:s2fade 250ms ease-out 200ms both}
.anim .rt{stroke-dasharray:1 1;animation:s2draw 300ms ease-out both;animation-delay:calc(450ms + var(--i) * 300ms)}
.anim .op .stop{animation:s2pop 250ms ease-out both;animation-delay:calc(var(--i) * 300ms + 200ms)}
.anim .chk{animation:s2fade 250ms ease-out both;animation-delay:calc(900ms + var(--i) * 30ms)}
.tip{animation:s2rise 250ms ease-out both}
@media (prefers-reduced-motion:reduce){.s2 *{animation:none!important;transition:none!important}}
`;

// Icons: inline stroke SVG, 16px.
const I = {
  search: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14" stroke-linecap="round"/></svg>',
  dl: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/></svg>',
  copy: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/></svg>',
  folder: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.8l1.4 1.5h4.8A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z"/></svg>',
  file: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" aria-hidden="true"><path d="M4 2h5.5L12.5 5v8.5a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-11A.5.5 0 0 1 4 2z"/><path d="M9.5 2v3h3"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>',
  pass: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="var(--indigo-9)"/><path d="m5 8.2 2 2 4-4.4" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chev: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>',
  menu: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true"><path d="M3.5 7h13M3.5 13h13"/></svg>',
};

// Logo "overlap": the spec (indigo square) and the skill (amber circle); where they meet is ink.
let LID = 0;
const logo = (s = 20) => {
  const id = `lg${LID++}`;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><defs><clipPath id="${id}"><rect x="1.5" y="1.5" width="13.5" height="13.5" rx="3"/></clipPath></defs><rect x="1.5" y="1.5" width="13.5" height="13.5" rx="3" fill="var(--indigo-9)"/><circle cx="15.5" cy="15.5" r="7" fill="var(--amber-9)"/><circle cx="15.5" cy="15.5" r="7" fill="var(--gray-12)" clip-path="url(#${id})"/></svg>`;
};

// ---------- Map geometry ----------
const ops = Object.fromEntries(D.model.operations.map((o) => [o.id, o]));
const clusters = Object.fromEntries(D.graph.clusters.map((c) => [c.name, c]));
const COLW = 202, GAP = 88, HEAD = 36, ROW = 32;
const place = { Projects: [0, 152], Members: [1, 0], Labels: [1, 272], Tasks: [2, 152], Comments: [3, 152] };
const blocks = Object.entries(place).map(([name, [col, y]]) => ({ name, x: col * (COLW + GAP), y, ops: clusters[name].operationIds }));
const where = {};
for (const b of blocks) b.ops.forEach((id, i) => (where[id] = { b, x: b.x, y: b.y + HEAD + i * ROW + ROW / 2, col: b.x / (COLW + GAP) }));
const MAPH = 408;
const route = D.chains[0].ops; // listProjects -> listTasks -> getTask
const stopOf = Object.fromEntries(route.map((id, i) => [id, i + 1]));

const curve = (sx, sy, tx, ty) => {
  const dx = Math.max(24, (tx - sx) / 2);
  return `M${sx} ${sy}C${sx + dx} ${sy} ${tx - dx} ${ty} ${tx} ${ty}`;
};
// A same-column link: a loop out of the left edge.
const loopL = (x, y1, y2, out = 28) => `M${x} ${y1}C${x - out} ${y1} ${x - out} ${y2} ${x} ${y2}`;
const backCurve = (sx, sy, tx, ty) => {
  // from a left edge back to a right edge further left
  const dx = Math.max(24, (sx - tx) / 2);
  return `M${sx} ${sy}C${sx - dx} ${sy} ${tx + dx} ${ty} ${tx} ${ty}`;
};

function defaultEdges() {
  const feeds = D.graph.edges.filter((e) => e.kind === 'feeds');
  const out = [];
  const seenBundle = new Set();
  for (const e of feeds) {
    const a = where[e.from], b = where[e.to];
    if (b.col <= a.col) continue; // same-column and backward links show on hover
    if (e.bundledInto) {
      if (seenBundle.has(e.bundledInto)) continue;
      seenBundle.add(e.bundledInto);
      out.push({ d: curve(a.x + COLW, a.y, b.b.x, b.b.y + HEAD / 2), inferred: false, id: e.bundledInto });
      continue;
    }
    if (route.includes(e.from) && route.includes(e.to) && stopOf[e.to] === stopOf[e.from] + 1) continue;
    out.push({ d: curve(a.x + COLW, a.y, b.x, b.y), inferred: e.confidence === 'inferred', id: e.id });
  }
  return out;
}
function routePaths() {
  const [a, b, c] = route.map((id) => where[id]);
  return [curve(a.x + COLW, a.y, b.x, b.y), loopL(b.x, b.y, c.y, 32)];
}
function hoverEdges(focus) {
  const fe = D.graph.edges.filter((e) => e.kind === 'feeds' && (e.from === focus || e.to === focus));
  return fe.map((e) => {
    const a = where[e.from], b = where[e.to];
    let d;
    if (a.col === b.col && a.b === b.b) d = loopL(a.x, a.y, b.y, 20 + Math.abs(a.y - b.y) / 6);
    else if (b.col > a.col) d = curve(a.x + COLW, a.y, b.x, b.y);
    else if (b.col < a.col) d = backCurve(a.x, a.y, b.x + COLW, b.y);
    else d = curve(a.x + COLW, a.y, b.x + COLW, b.y);
    return { d, inferred: e.confidence === 'inferred', from: e.from, to: e.to };
  });
}

function mapSVG(state) {
  const W = 3 * (COLW + GAP) + COLW;
  let s = `<svg class="edges" width="${W}" height="${MAPH}" viewBox="0 0 ${W} ${MAPH}" aria-hidden="true"><defs>
<marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1.5 6.5 4 1 6.5" fill="none" stroke="var(--gray-9)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></marker>
<marker id="ahk" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1.5 6.5 4 1 6.5" fill="none" stroke="var(--gray-12)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></marker>
<marker id="ahr" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1 7 4 1 7z" fill="var(--indigo-9)"/></marker></defs>`;
  if (state.hover) {
    for (const e of defaultEdges()) s += `<path d="${e.d}" fill="none" stroke="var(--gray-6)" stroke-width="1"${e.inferred ? ' stroke-dasharray="3 3"' : ''}/>`;
    for (const e of hoverEdges(state.hover))
      s += `<path d="${e.d}" fill="none" stroke="var(--gray-12)" stroke-width="1.25"${e.inferred ? ' stroke-dasharray="3 3"' : ''} marker-end="url(#ahk)"/>`;
  } else {
    for (const e of defaultEdges()) s += `<path class="e" d="${e.d}" fill="none" stroke="var(--gray-9)" stroke-width="1"${e.inferred ? ' stroke-dasharray="3 3"' : ''} marker-end="url(#ah)"/>`;
    routePaths().forEach((d, i) => (s += `<path class="rt" style="--i:${i}" pathLength="1" d="${d}" fill="none" stroke="var(--gray-1)" stroke-width="6" stroke-linecap="round"/><path class="rt" style="--i:${i}" pathLength="1" d="${d}" fill="none" stroke="var(--indigo-9)" stroke-width="2.5" stroke-linecap="round" marker-end="url(#ahr)"/>`));
  }
  return s + '</svg>';
}

function mapHTML(state = {}) {
  const near = state.hover ? new Set([state.hover, ...hoverEdges(state.hover).flatMap((e) => [e.from, e.to])]) : null;
  let h = `<div class="map" style="height:${MAPH}px">${mapSVG(state)}`;
  for (const b of blocks) {
    h += `<section class="cl" style="left:${b.x}px;top:${b.y}px;--i:${b.x / (COLW + GAP)}" aria-label="${b.name}"><h3>${b.name}<small>${b.ops.length}</small></h3>`;
    for (const id of b.ops) {
      const o = ops[id];
      const m = (o.method || '').toUpperCase();
      const r = !state.hover && stopOf[id];
      const cls = ['op', r ? 'route' : '', state.hover === id ? 'hot' : '', near && !near.has(id) ? 'dim' : ''].join(' ').trim();
      h += `<button class="${cls}" type="button" aria-label="${m} ${o.path}, ${esc(o.title)}"><span class="m mono${m === 'DELETE' ? ' del' : ''}">${m}</span><span class="id mono">${id}</span>${r ? `<span class="stop" style="--i:${r}">${r}</span>` : ''}</button>`;
    }
    h += '</section>';
  }
  if (state.hover) h += tooltip(state.hover);
  return h + '</div>';
}

function tooltip(id) {
  const o = ops[id], w = where[id];
  const fe = D.graph.edges.filter((e) => e.kind === 'feeds');
  const feeds = fe.filter((e) => e.from === id).map((e) => e.to);
  const fedBy = fe.filter((e) => e.to === id).map((e) => e.from);
  const inp = o.inputs.map((i) => `<span class="mono">${i.name}</span> <span class="muted">${i.in}, ${i.type || 'string'}${i.required ? ', required' : ''}</span>`).join('<br>');
  return `<div class="tip" role="dialog" aria-label="${id}" style="left:${w.x + COLW + 16}px;top:${w.y - 40}px">
<div class="mono muted" style="font-size:12px">${(o.method || '').toUpperCase()} ${o.path}</div>
<div class="t">${esc(o.title)}</div>
<dl><dt>Input</dt><dd>${inp}</dd><dt>Output</dt><dd class="mono">Task</dd><dt>Fed by</dt><dd class="mono">${fedBy.join(', ')}</dd><dt>Feeds</dt><dd class="mono">${feeds.join(', ')}</dd><dt>In skill</dt><dd><a class="ref mono" href="#">references/tasks.md</a></dd></dl></div>`;
}

// ---------- Skill browser ----------
const tree = [
  ['file', 'SKILL.md', '', true], ['folder', 'kit', '4'], ['folder', 'references', '8'], ['folder', 'examples', '4'],
  ['folder', 'scripts', '3'], ['folder', 'evals', '1'], ['folder', 'ci', '1'], ['file', 'README.md', ''],
];
const skillLines = D.files['SKILL.md'].split('\n').slice(0, 14);
const shortChecks = [
  'Frontmatter has name, description, license and compatibility',
  'SKILL.md body is at most 200 lines',
  'Every operation appears in SKILL.md or a reference',
  'Every relative link resolves',
  'Every reference is linked from SKILL.md',
  'Kit code and regression tests are present',
  '2 worked examples run as dry runs',
  '7 evals name known operations',
  'CI runs the tests, the examples and the audit',
];
function codeLine(t, i) {
  let html;
  if (/^[a-z-]+:/.test(t) && i < 10) html = t.replace(/^(\s*[a-z-]+:)(.*)$/, (_, k, v) => `<span class="k">${esc(k)}</span>${esc(v)}`);
  else if (/^#/.test(t)) html = `<span class="h">${esc(t)}</span>`;
  else if (/^ {2}[a-z-]+:/.test(t)) html = t.replace(/^(\s*[a-z-]+:)(.*)$/, (_, k, v) => `<span class="k">${esc(k)}</span>${esc(v)}`);
  else html = esc(t);
  return `<div class="l"><span class="ln">${i + 1}</span><span>${html}</span></div>`;
}
function skillHTML() {
  return `<div class="split">
<nav class="tree" aria-label="Skill files"><h4>tasks-api/</h4>${tree
    .map(([k, n, c, on]) => `<a href="#" class="row${on ? ' on' : ''}"${on ? ' aria-current="true"' : ''}>${I[k]}<span class="n">${n}</span>${c ? `<span class="c">${c}</span>` : ''}</a>`)
    .join('')}<a href="#" class="edit">Edit name and licence</a></nav>
<div class="prev" style="min-width:0"><h4><span>SKILL.md <span class="muted" style="font-weight:400;font-size:12px;margin-left:8px">63 lines</span></span><button type="button" class="btn ghost" aria-label="Copy SKILL.md" style="height:20px;padding:0">${I.copy}</button></h4>
<div class="code">${skillLines.map(codeLine).join('')}</div></div>
<div class="audit"><h4><span class="ok">${I.pass}Audit passed</span><span class="muted" style="font-weight:400;font-size:12px">9 of 9</span></h4>
${shortChecks.map((c, i) => `<div class="chk" style="--i:${i}">${I.check}<span>${c}</span></div>`).join('')}</div>
</div>`;
}

// ---------- Page ----------
const W = 3 * (COLW + GAP) + COLW; // 1136
function page({ dark = false, hover = null, anim = false } = {}) {
  return `<div class="s2${dark ? ' dark' : ''}${anim ? ' anim' : ''}" style="${vars(dark)};color-scheme:${dark ? 'dark' : 'light'};min-height:100%">
<header class="hdr"><div class="wrap"><a href="#" class="brand">${logo(20)}spec2skill</a><nav class="nav"><a href="#how">How it works</a><a href="#cli">Command line</a><a href="#">GitHub</a></nav></div></header>
<main>
<section class="hero"><div class="wrap"><div><h1>Turn any API into an agent skill</h1><p class="lede">Paste an OpenAPI spec or an MCP server. Get a tested skill, and a map to check what it teaches.</p></div>
<div class="load"><label class="field"><span class="sr" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Spec or server URL, or the spec text</span><input placeholder="OpenAPI or MCP URL, or paste the spec"><button type="button" class="btn lg pri">Generate</button></label>
<div class="samples"><span class="muted">Samples</span><div class="seg" role="tablist"><button role="tab" aria-selected="true" class="on">Tasks API</button><button role="tab">Petstore</button><button role="tab">Filesystem MCP</button></div></div></div></div></section>
<div class="wrap"><section class="frame" aria-label="Tasks API skill">
<div class="fhead"><div><h2 class="ftitle">Tasks API</h2><div class="meta"><span>OpenAPI 3.1</span><span><b>22</b> operations</span><span><b>5</b> resources</span><span><b>78</b> links</span><span class="tag">Sample</span></div></div>
<div class="actions"><button type="button" class="btn lg sec">${I.copy}Install command</button><button type="button" class="btn lg pri">${I.dl}Download .zip</button></div></div>
<div class="tools"><div class="tools-l"><div class="seg" role="tablist"><button role="tab" aria-selected="true" class="on">Map</button><button role="tab">List</button></div><label class="search">${I.search}<span style="flex:1">Search</span><kbd class="kbd">/</kbd></label></div>
<div class="legend"><span><svg width="24" height="8" aria-hidden="true"><path d="M0 4h24" stroke="var(--gray-9)"/></svg>Output feeds input</span><span><svg width="24" height="8" aria-hidden="true"><path d="M0 4h24" stroke="var(--gray-9)" stroke-dasharray="3 3"/></svg>Inferred</span><span><svg width="24" height="8" aria-hidden="true"><path d="M1 4h22" stroke="var(--indigo-9)" stroke-width="2.5" stroke-linecap="round"/></svg>Strongest workflow</span></div></div>
${mapHTML({ hover })}
<div class="caption"><span>Strongest workflow</span><span class="chain"><span class="stop">1</span><span class="mono">listProjects</span><code>id → projectId</code><span class="stop">2</span><span class="mono">listTasks</span><code>id → taskId</code><span class="stop">3</span><span class="mono">getTask</span></span></div>
${skillHTML()}
</section></div>
<section class="block" id="cli"><div class="wrap sec2"><div><h2>Run it from the command line</h2><p class="muted" style="margin:0;max-width:44ch">Writes the skill to disk and ends with its audit. Works offline, with no key.</p></div>
<div class="cli"><span class="p">$ </span>git clone https://github.com/geekplux/spec2skill
<span class="p">$ </span>cd spec2skill &amp;&amp; pnpm install
<span class="p">$ </span>pnpm cli openapi.yaml --out .claude/skills<button type="button" aria-label="Copy commands">${I.copy}</button></div></div></section>
<section class="block" id="how"><div class="wrap"><h2>How it works</h2><div class="steps">
<div><b>Parse</b><p>OpenAPI 3.0 and 3.1, Swagger 2.0 and MCP tool lists become one model, in your browser.</p></div>
<div><b>Relate</b><p>Outputs that match inputs, nested paths and shared schemas become links, each exact or inferred.</p></div>
<div><b>Write and audit</b><p>SKILL.md, a tested kit, references, examples, evals and CI, audited before you download.</p></div>
<div><b>Check</b><p>The map shows every operation and link, so you can see what the skill teaches your agent.</p></div>
</div></div></section>
<section class="made"><div class="wrap"><div class="in sec2"><div><h2>Made by GeekPlux</h2><p class="muted">Writing, projects and data visualization</p><a class="mono ul" style="font-size:12px" href="https://geekplux.com">geekplux.com</a></div>
<div class="links"><a href="#"><b>Vert</b><span>Turn a GPX track into a terrain poster</span><code>vert.geekplux.org</code></a><a href="#"><b>Explorable</b><span>Turn a paper into an interactive essay</span><code>explorable.geekplux.com</code></a><a href="#"><b>Reasontrail</b><span>See how your coding agent got there</span><code>reasontrail.geekplux.com</code></a><a href="#"><b>markvis</b><span>Charts written in Markdown</span><code>github.com/geekplux/markvis</code></a></div></div></div></section>
</main>
<footer class="foot"><div class="wrap"><div class="in"><a href="#" class="brand">${logo(20)}spec2skill</a><nav class="nav"><a href="#how">How it works</a><a href="#">GitHub</a><a href="#">MIT licence</a></nav></div></div></footer>
</div>`;
}

// ---------- Phone ----------
const PCSS = `
.ph .wrap{padding:0 16px}
.ph .hero{padding:40px 0 32px}
.ph .hero .wrap{display:block}
.ph .lede{font-size:14px;line-height:20px;max-width:none}
.ph .load{width:auto;margin-top:24px}
.ph .field{height:auto;flex-direction:column;align-items:stretch;padding:4px;gap:4px}
.ph .field input{height:40px;padding:0 12px;flex:none}
.ph .field .btn{justify-content:center}
.ph .samples{flex-direction:column;align-items:stretch;gap:8px}
.ph .samples .seg{grid-template-columns:auto auto auto}
.ph .fx{padding:0 16px}
.ph .fhead{flex-direction:column;margin-bottom:24px}
.ph .actions{width:100%;flex-direction:column}
.ph .actions .btn{justify-content:center;width:100%}
.lst h3{margin:24px 0 4px;font-size:14px;font-weight:600;display:flex;justify-content:space-between;height:28px;align-items:center;border-bottom:.5px solid var(--gray-6)}
.lst h3 small{font-size:12px;font-weight:400;color:var(--gray-11)}
.lrow{display:flex;align-items:center;gap:8px;min-height:44px;border-bottom:.5px solid var(--gray-5)}
.lrow .m{font-size:12px;width:48px;color:var(--gray-11);flex:none}
.lrow .m.del{color:var(--amber-11)}
.lrow .id{flex:1;font-size:14px}
.lrow .id small{display:block;font-size:12px;color:var(--gray-11);line-height:16px}
.lrow.route .id>span{color:var(--indigo-11);font-weight:600}
.more{display:flex;justify-content:space-between;align-items:center;height:44px;border-bottom:.5px solid var(--gray-6);font-weight:600}
.more small{font-weight:400;color:var(--gray-11);font-size:12px;display:flex;gap:8px;align-items:center}
.ph .steps{grid-template-columns:minmax(0,1fr);gap:16px}
.ph .block{padding-top:64px}
.ph .sec2{grid-template-columns:minmax(0,1fr);gap:16px}
.ph .links a{grid-template-columns:minmax(0,1fr)}
.ph .links a>span{grid-column:1;grid-row:auto}
.ph .made{margin-top:64px;padding-top:40px}
.ph .cli{white-space:pre-wrap;word-break:break-all;padding-right:44px}
.ph .foot{height:auto;padding:24px 0}
.ph .foot .in{height:auto;padding:24px 0;flex-direction:column;align-items:flex-start;gap:16px}
.ph .nav{gap:20px}
`;
function phone() {
  const grp = (name, open) => {
    const c = clusters[name];
    if (!open) return `<a href="#" class="more">${name}<small>${c.operationIds.length} ${I.chev}</small></a>`;
    return `<h3>${name}<small>${c.operationIds.length}</small></h3>${c.operationIds
      .map((id) => {
        const o = ops[id], m = o.method.toUpperCase(), r = stopOf[id];
        return `<a href="#" class="lrow${r ? ' route' : ''}"><span class="m mono${m === 'DELETE' ? ' del' : ''}">${m}</span><span class="id"><span class="mono">${id}</span><small class="mono">${o.path}</small></span>${r ? `<span class="stop">${r}</span>` : ''}</a>`;
      })
      .join('')}`;
  };
  return `<div class="s2 ph" style="${vars(false)};width:390px">
<header class="hdr"><div class="wrap"><a href="#" class="brand">${logo(20)}spec2skill</a><button type="button" aria-label="Menu" style="width:44px;height:44px;display:flex;align-items:center;justify-content:flex-end">${I.menu}</button></div></header>
<section class="hero"><div class="wrap"><h1>Turn any API into an agent skill</h1><p class="lede">Paste an OpenAPI spec or an MCP server. Get a tested skill, and a map to check what it teaches.</p>
<div class="load"><label class="field"><input placeholder="OpenAPI or MCP URL, or paste the spec" aria-label="Spec or server URL, or the spec text"><button type="button" class="btn lg pri">Generate</button></label>
<div class="samples"><span class="muted">Samples</span><div class="seg"><button class="on">Tasks API</button><button>Petstore</button><button>Filesystem MCP</button></div></div></div></div></section>
<section class="fx" aria-label="Tasks API skill" style="border-top:.5px solid var(--gray-6);padding-top:32px">
<div class="fhead"><div><h2 class="ftitle">Tasks API</h2><div class="meta"><span>OpenAPI 3.1</span><span><b>22</b> operations</span><span><b>5</b> resources</span><span><b>78</b> links</span><span class="tag">Sample</span></div></div>
<div class="actions"><button class="btn lg pri">${I.dl}Download .zip</button><button class="btn lg sec">${I.copy}Install command</button></div></div>
<div class="tools"><div class="seg"><button>Map</button><button class="on">List</button></div><label class="search" style="width:auto;flex:1">${I.search}<span>Search</span></label></div>
<div class="caption" style="margin:0 0 8px"><span class="chain"><span class="stop">1</span><span class="mono">listProjects</span><span class="stop">2</span><span class="mono">listTasks</span><span class="stop">3</span><span class="mono">getTask</span></span></div>
<div class="lst">${grp('Projects', true)}${grp('Tasks', true)}<div style="margin-top:16px">${grp('Members')}${grp('Labels')}${grp('Comments')}</div></div>
<div style="margin-top:40px"><h4 class="mono" style="margin:0 0 8px;font-size:14px">tasks-api/</h4>${tree.map(([k, n, c, on]) => `<a href="#" class="row${on ? ' on' : ''}" style="height:44px">${I[k]}<span class="n" style="font-size:14px">${n}</span>${c ? `<span class="c">${c}</span>` : I.chev}</a>`).join('')}</div>
<a href="#" class="more" style="margin-top:24px;border-top:.5px solid var(--gray-6)"><span class="ok" style="display:flex;gap:8px;align-items:center">${I.pass}Audit passed</span><small>9 of 9 ${I.chev}</small></a>
</section>
<section class="block" id="cli"><div class="wrap sec2"><div><h2>Run it from the command line</h2><p class="muted" style="margin:0">Writes the skill to disk and ends with its audit. Works offline, with no key.</p></div>
<div class="cli"><span class="p">$ </span>git clone https://github.com/geekplux/spec2skill
<span class="p">$ </span>cd spec2skill &amp;&amp; pnpm install
<span class="p">$ </span>pnpm cli openapi.yaml --out .claude/skills<button aria-label="Copy commands">${I.copy}</button></div></div></section>
<section class="made"><div class="wrap"><div class="in sec2"><div><h2>Made by GeekPlux</h2><p class="muted" style="margin:0 0 8px">Writing, projects and data visualization</p><a class="mono ul" style="font-size:12px" href="#">geekplux.com</a></div>
<div class="links"><a href="#"><b>Vert</b><span>Turn a GPX track into a terrain poster</span><code>vert.geekplux.org</code></a><a href="#"><b>Explorable</b><span>Turn a paper into an interactive essay</span><code>explorable.geekplux.com</code></a><a href="#"><b>Reasontrail</b><span>See how your coding agent got there</span><code>reasontrail.geekplux.com</code></a><a href="#"><b>markvis</b><span>Charts written in Markdown</span><code>github.com/geekplux/markvis</code></a></div></div></div></section>
<footer class="foot"><div class="wrap"><div class="in"><a href="#" class="brand">${logo(20)}spec2skill</a><nav class="nav"><a href="#">How it works</a><a href="#">GitHub</a><a href="#">MIT licence</a></nav></div></div></footer>
</div>`;
}

// ---------- System board ----------
function system() {
  const sw = (n, dark) => `<div style="display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:2px">${R[dark ? n + 'D' : n].map((v, i) => `<div style="height:28px;background:${v};border-radius:2px" title="${n}-${i + 1} ${v}"></div>`).join('')}</div>`;
  const scale = (n, label) => `<div style="display:grid;grid-template-columns:80px minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:center"><span>${label}</span>${sw(n, false)}${sw(n, true)}</div>`;
  return `<div class="s2" style="${vars(false)};width:960px;padding:48px">
<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:40px"><h2 style="margin:0;font-size:20px">spec2skill design system, v2</h2><span class="muted">Radix Colors, IBM Plex, 0.5px lines, a 4-column grid of 202 px with 88 px gaps</span></div>
<h2>Colour</h2><div style="display:grid;grid-template-columns:80px minmax(0,1fr) minmax(0,1fr);gap:16px;margin:16px 0 8px" class="muted"><span></span><span style="font-size:12px">Light, steps 1 to 12</span><span style="font-size:12px">Dark</span></div>
<div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px">${scale('gray', 'Gray')}${scale('indigo', 'Indigo')}${scale('amber', 'Amber')}</div>
<p class="muted" style="margin:0 0 40px;max-width:72ch">Gray carries the page: 1 to 2 grounds, 3 to 5 fills, 6 to 8 lines, 11 to 12 text. Indigo is the one accent: the strongest workflow, the primary button, the audit. Amber marks destructive operations and the logo's skill. Indigo and amber differ in lightness as well as hue, and each also has a shape or a word, never colour alone.</p>
<h2>Type</h2><div style="display:flex;flex-direction:column;gap:16px;margin:16px 0 40px">
<div style="display:flex;gap:24px;align-items:baseline"><span class="muted" style="width:120px;font-size:12px">48 / 600</span><span style="font-size:48px;line-height:52px;font-weight:600;letter-spacing:-.035em">Turn any API into an agent skill</span></div>
<div style="display:flex;gap:24px;align-items:baseline"><span class="muted" style="width:120px;font-size:12px">20 / 400, 600</span><span style="font-size:20px;line-height:28px;letter-spacing:-.01em">Paste an OpenAPI spec <b style="font-weight:600">Tasks API</b></span></div>
<div style="display:flex;gap:24px;align-items:baseline"><span class="muted" style="width:120px;font-size:12px">14 / 400, 500, 600</span><span>Body, controls, operation ids <span class="mono">listProjects</span></span></div>
<div style="display:flex;gap:24px;align-items:baseline"><span class="muted" style="width:120px;font-size:12px">12 / 400</span><span style="font-size:12px">Meta, methods, paths, code <span class="mono">GET /tasks/{taskId}</span></span></div></div>
<h2>Map encoding</h2><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;margin:16px 0 40px">
<div><svg width="80" height="16" aria-hidden="true"><path d="M0 8h72" stroke="var(--gray-9)"/><path d="M68 5.5 73 8 68 10.5" fill="none" stroke="var(--gray-9)" stroke-width="1.2"/></svg><b style="display:block;margin-top:8px;font-weight:600">Output feeds input</b><span class="muted">Exact match, solid</span></div>
<div><svg width="80" height="16" aria-hidden="true"><path d="M0 8h72" stroke="var(--gray-9)" stroke-dasharray="3 3"/></svg><b style="display:block;margin-top:8px;font-weight:600">Inferred</b><span class="muted">Dashed, marked in references</span></div>
<div><svg width="80" height="16" aria-hidden="true"><path d="M2 8h50" stroke="var(--indigo-9)" stroke-width="2.5" stroke-linecap="round"/><circle cx="66" cy="8" r="7" fill="var(--indigo-9)"/><text x="66" y="12" text-anchor="middle" font-size="12" fill="#fff" font-weight="600">1</text></svg><b style="display:block;margin-top:8px;font-weight:600">Strongest workflow</b><span class="muted">Thick, numbered stops</span></div>
<div><div style="display:flex;gap:12px;font-size:12px" class="mono"><span class="muted">GET</span><span style="color:var(--amber-11)">DELETE</span></div><b style="display:block;margin-top:8px;font-weight:600">Method as text</b><span class="muted">Destructive in amber</span></div></div>
<h2>Logo</h2><div style="display:flex;gap:32px;align-items:center;margin-top:16px">
<div style="display:flex;gap:24px;align-items:center;padding:24px;border-radius:12px;box-shadow:inset 0 0 0 .5px var(--gray-7)">${logo(16)}${logo(24)}${logo(48)}<span style="display:flex;gap:8px;align-items:center;font-weight:600">${logo(20)}spec2skill</span></div>
<div style="display:flex;gap:24px;align-items:center;padding:24px;border-radius:12px;${vars(true)};background:var(--gray-1);color:var(--gray-12)">${logo(16)}${logo(24)}${logo(48)}<span style="display:flex;gap:8px;align-items:center;font-weight:600">${logo(20)}spec2skill</span></div>
<p class="muted" style="margin:0;max-width:26ch">The spec and the skill; where they meet is the part your agent uses.</p></div>
</div>`;
}


// ---------- Motion board ----------
function motion() {
  const rows = [
    ['Load or switch sample', 'Resource columns rise 4 px and fade in, left to right, 40 ms apart', '250 ms'],
    ['', 'Links fade in once the columns are placed', '250 ms'],
    ['', 'The strongest workflow draws left to right; each stop appears as the line reaches it', '300 ms a segment'],
    ['', 'Audit checks fade in, top to bottom, 30 ms apart', '250 ms'],
    ['Hover or focus an operation', 'Unrelated rows and links fade to 38%; its links turn ink; the card rises 4 px', '250 ms'],
    ['Generate', 'The button names the stage: Parsing, Relating, Writing, Auditing; then the result swaps in', '250 ms a swap'],
    ['Download, copy', 'The label becomes Downloaded or Copied with a check, then returns after 2 s', '250 ms'],
    ['Reduced motion', 'Nothing moves; every state appears at once', '0 ms'],
  ];
  const spin = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" class="spin"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.5"/><path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  return `<div class="s2" style="${vars(false)};width:1072px;padding:48px">
<h2 style="margin:0 0 4px">Motion</h2><p class="muted" style="margin:0 0 32px">Ease-out everywhere, 250 ms base. Motion explains the map; it never decorates.</p>
<div class="demo"><svg width="976" height="120" viewBox="0 0 976 120" aria-hidden="true">
<rect class="d1" x="0.25" y="20.25" width="202" height="80" rx="8" fill="var(--gray-1)" stroke="var(--gray-7)" stroke-width=".5"/>
<rect class="d2" x="387.25" y="20.25" width="202" height="80" rx="8" fill="var(--gray-1)" stroke="var(--gray-7)" stroke-width=".5"/>
<rect class="d3" x="774.25" y="20.25" width="202" height="80" rx="8" fill="var(--gray-1)" stroke="var(--gray-7)" stroke-width=".5"/>
<text x="16" y="66" font-size="14" font-family="IBM Plex Mono" fill="var(--gray-12)" class="d1">listProjects</text>
<text x="403" y="66" font-size="14" font-family="IBM Plex Mono" fill="var(--gray-12)" class="d2">listTasks</text>
<text x="790" y="66" font-size="14" font-family="IBM Plex Mono" fill="var(--gray-12)" class="d3">getTask</text>
<path class="dl" pathLength="1" d="M202 60H387M589 60H774" fill="none" stroke="var(--indigo-9)" stroke-width="2.5" stroke-linecap="round"/>
<g class="ds" style="--i:0"><circle cx="186" cy="60" r="9" fill="var(--indigo-9)"/><text x="186" y="64" text-anchor="middle" font-size="12" font-weight="600" fill="#fff">1</text></g>
<g class="ds" style="--i:1"><circle cx="573" cy="60" r="9" fill="var(--indigo-9)"/><text x="573" y="64" text-anchor="middle" font-size="12" font-weight="600" fill="#fff">2</text></g>
<g class="ds" style="--i:2"><circle cx="960" cy="60" r="9" fill="var(--indigo-9)"/><text x="960" y="64" text-anchor="middle" font-size="12" font-weight="600" fill="#fff">3</text></g>
</svg><p class="muted" style="margin:8px 0 0;font-size:12px">Live, looping every 3 s: the first-load sequence of the map.</p></div>
<table class="mt"><thead><tr><th>Moment</th><th>What moves</th><th>Duration</th></tr></thead><tbody>${rows.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td class="mono">${c}</td></tr>`).join('')}</tbody></table>
<h2 style="margin:40px 0 16px">Button states</h2>
<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
<button class="btn lg pri">Generate</button><span class="muted">${I.chev}</span>
<button class="btn lg pri" style="opacity:.9">${spin}Parsing</button><button class="btn lg pri" style="opacity:.9">${spin}Relating</button><button class="btn lg pri" style="opacity:.9">${spin}Writing</button><button class="btn lg pri" style="opacity:.9">${spin}Auditing</button>
</div>
<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:16px">
<button class="btn lg pri">${I.dl}Download .zip</button><span class="muted">${I.chev}</span><button class="btn lg pri">${I.check}Downloaded</button>
<span style="width:40px"></span>
<button class="btn lg sec">${I.copy}Install command</button><span class="muted">${I.chev}</span><button class="btn lg sec">${I.check}Copied</button>
</div></div>`;
}
const MCSS = `
.mt{width:100%;border-collapse:collapse;margin-top:32px}
.mt th{text-align:left;font-weight:600;padding:0 16px 8px 0;border-bottom:.5px solid var(--gray-7)}
.mt td{padding:10px 16px 10px 0;border-bottom:.5px solid var(--gray-6);vertical-align:top}
.mt td:first-child{width:202px;font-weight:500}
.mt td:last-child{width:140px;color:var(--gray-11);font-size:12px}
@keyframes s2loopd{0%,8%{stroke-dashoffset:1}38%,90%{stroke-dashoffset:0}100%{stroke-dashoffset:0;opacity:0}}
@keyframes s2loopb{0%{opacity:0;transform:translateY(4px)}8%,90%{opacity:1;transform:none}100%{opacity:0}}
.demo .d1,.demo .d2,.demo .d3{animation:s2loopb 3s ease-out infinite}
.demo .d2{animation-delay:40ms}.demo .d3{animation-delay:80ms}
.demo .dl{stroke-dasharray:1 1;animation:s2loopd 3s ease-out infinite}
.demo .ds{transform-box:fill-box;transform-origin:center;animation:s2loopb 3s ease-out infinite;animation-delay:calc(var(--i) * 300ms)}
@keyframes s2spin{to{transform:rotate(360deg)}}
.spin{animation:s2spin 800ms linear infinite}
@media (prefers-reduced-motion:reduce){.demo *,.spin{animation:none!important}}
`;

// ---------- Write ----------
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&amp;family=IBM+Plex+Sans:wght@400;500;600&amp;display=swap">';
function emit(name, title, body, w, h, extraCss = '') {
  const css = CSS + extraCss;
  writeFileSync(`${OUT}preview/${name}.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${FONTS}<style>${css}</style></head><body>${body}</body></html>`);
  writeFileSync(
    `${OUT}project/${name}.dc.html`,
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
${FONTS}
<style>${css}</style>
</helmet>
${body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${w},"height":${h}}}'>
class Component extends DCLogic { renderVals() { return {}; } }
</script>
</body>
</html>
`,
  );
}
const H = Number(process.env.HOME_H || 3000), PH = Number(process.env.PHONE_H || 3600), HV = Number(process.env.HOVER_H || 1250), SH = Number(process.env.SYS_H || 1100), MH = Number(process.env.MOTION_H || 900);
emit('V2Home', 'spec2skill v2 home', page({ anim: true }), 1440, H);
emit('V2HomeDark', 'spec2skill v2 home, dark', page({ dark: true, anim: true }), 1440, H);
emit('V2Hover', 'spec2skill v2 map, hovering getTask', `<div style="height:${HV}px;overflow:hidden">${page({ hover: 'getTask' })}</div>`, 1440, HV);
emit('V2Phone', 'spec2skill v2 phone', phone(), 390, PH, PCSS);
emit('V2System', 'spec2skill v2 design system', system(), 960, SH);
emit('V2Motion', 'spec2skill v2 motion', motion(), 1072, MH, MCSS);
console.log('ok');
