// Redesign R4 (docs/redesign/PLAN.md): the route map of DESIGN.md section 5 inside the result frame.
// Checks the drawing (cards, rows, links, the workflow and its draw order), the tools row (Map | List,
// search with `/`, the legend) and that the old controls are gone; hover on getTask (related links,
// fades, the operation card beside the row, flipped at the right edge); the pinned card (click or
// Enter, Close, Escape back to the row, #op=); the keyboard (one Tab stop, arrows, `?`); search (fades,
// announced count, q=); "N more" (filesystem); the sideways scroll region with hover links inside it;
// and, moved from the retired phase-6-map flow, data-ready within 1500 ms (P3), sample switching
// online and offline, Map | List, no page scroll at 390 and 200 %, CVD shots. Runs DESIGN.md section 8
// checks 1-4 (and 7 under reduced motion), the grid (check 6) and axe on rest, hover and pinned, light
// and dark. Saves viewport WebP shots in docs/screenshots/redesign-r4/.
//   pnpm build && pnpm check:browser -- --phase 21 --flow redesign-r4 --capture redesign-r4
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { designChecks, gridCheck } from '../redesign-checks.mjs';
import { ROOT } from '../session.mjs';

const OUT = join(ROOT, 'docs', 'screenshots', 'redesign-r4');
const SAMPLES = {
  tasks: { chip: 'Tasks API', heading: 'Tasks API (sample)', label: 'Tasks API: 22 operations in 5 clusters, 78 relationships', rows: 22, cards: 5 },
  petstore: { chip: 'Petstore', heading: 'Swagger Petstore (sample)', label: 'Swagger Petstore: 16 operations in 2 clusters, 41 relationships', rows: 16, cards: 2 },
  filesystem: { chip: 'Filesystem MCP', heading: 'secure-filesystem-server (sample)', label: 'secure-filesystem-server: 14 tools in 2 clusters, 28 relationships', rows: 13, cards: 2 },
};

const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
const close = (a, b, tolerance = 0.6) => Math.abs(a - b) <= tolerance;
// The announcer clears, then sets the message on the next frame: read it two frames later.
const frames = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const said = async (page) => (await frames(page), page.getByTestId('announcer').textContent());
const active = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-nav') ?? document.activeElement?.textContent?.trim() ?? null);

async function ready(page, url) {
  if (url) await page.goto(url, { waitUntil: 'load' });
  await page.locator('[data-testid="atlas"][data-ready="true"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
}

/** The result frame at the top of the window (the hero comes first since R2). */
const toMap = (page) => page.evaluate(() => document.querySelector('#result').scrollIntoView({ block: 'start' }));

/** The viewport as WebP (quality 0.82), encoded by the browser itself from a PNG screenshot. */
async function webp(page, name, dir) {
  const png = (await page.screenshot()).toString('base64');
  const data = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: img.naturalWidth, height: img.naturalHeight });
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/webp', 0.82).split(',')[1];
  }, png);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.webp`);
  writeFileSync(path, Buffer.from(data, 'base64'));
  console.log(`  screenshot ${path.slice(ROOT.length + 1)}`);
}

/** Runs in the page (serialised, so its helpers stay inside): the drawing as computed styles, colours resolved against the token they should be. */
/* oxlint-disable unicorn/consistent-function-scoping */
function drawing() {
  const probe = document.createElement('i');
  document.body.append(probe);
  const token = (name) => ((probe.style.color = `var(${name})`), getComputedStyle(probe).color);
  const t = Object.fromEntries(['--gray-1', '--gray-6', '--gray-7', '--gray-9', '--gray-11', '--gray-12', '--indigo-9', '--indigo-11', '--destructive'].map((n) => [n, token(n)]));
  probe.remove();
  const box = (el) => el.getBoundingClientRect();
  const s = (el) => getComputedStyle(el);
  const svg = document.querySelector('.route .links');
  const order = [...svg.querySelectorAll(':scope > path')].map((p) => p.getAttribute('class'));
  const cards = [...document.querySelectorAll('.rc')];
  const rows = [...document.querySelectorAll('.rc .op')];
  const head = cards[0].querySelector('.rc-head');
  const del = document.querySelector('.op .m[data-destructive]');
  const stop = document.querySelector('.op[data-route]');
  const routeRow = document.querySelector('.op[data-route]');
  const ln = svg.querySelector('.ln:not([data-faded])');
  const inferred = svg.querySelector('.ln[data-inferred]');
  return {
    t,
    order,
    cards: cards.map((c) => ({ w: box(c).width, radius: s(c).borderRadius, bg: s(c).backgroundColor, ring: s(c).boxShadow, role: c.getAttribute('role'), named: !!c.getAttribute('aria-labelledby') })),
    head: { h: box(head).height, tag: head.tagName, name: [s(head.querySelector('.rc-name')).fontSize, s(head.querySelector('.rc-name')).fontWeight], count: [s(head.querySelector('.rc-count')).fontSize, s(head.querySelector('.rc-count')).color], rule: s(head).boxShadow },
    rows: rows.map((r) => ({ tag: r.tagName, h: box(r).height })),
    method: (() => { const m = rows[0].querySelector('.m'); return { w: box(m).width, font: s(m).fontFamily, size: s(m).fontSize, color: s(m).color }; })(),
    id: (() => { const i = rows[0].querySelector('.id'); return { font: s(i).fontFamily, size: s(i).fontSize, overflow: s(i).textOverflow, ws: s(i).whiteSpace }; })(),
    del: del ? { text: del.textContent, color: s(del).color } : null,
    stop: stop ? (() => { const a = getComputedStyle(stop, '::after'); return { n: a.content, w: parseFloat(a.width), h: parseFloat(a.height), bg: a.backgroundColor, color: a.color, size: a.fontSize, weight: a.fontWeight, radius: a.borderRadius }; })() : null,
    routeId: routeRow ? [s(routeRow.querySelector('.id')).color, s(routeRow.querySelector('.id')).fontWeight] : null,
    ln: ln ? { stroke: s(ln).stroke, width: s(ln).strokeWidth, dash: s(ln).strokeDasharray, marker: ln.getAttribute('marker-end'), head: s(svg.querySelector('marker path.ah')).stroke, fill: s(svg.querySelector('marker path.ah')).fill } : null,
    inferred: inferred ? s(inferred).strokeDasharray : null,
    wf: [...svg.querySelectorAll('.wf')].map((p) => ({ stroke: s(p).stroke, width: s(p).strokeWidth, marker: p.getAttribute('marker-end') })),
    halo: [...svg.querySelectorAll('.halo')].map((p) => ({ stroke: s(p).stroke, width: s(p).strokeWidth })),
    ahr: s(svg.querySelector('marker path.ahr')).fill,
    bundles: svg.querySelectorAll('.ln[data-link="bundle"]').length,
  };
}
/* oxlint-enable unicorn/consistent-function-scoping */

export default {
  name: 'redesign-r4',
  phase: 21,
  async run({ page, context, origin, viewports, axe, cvd, screenshot, outDir, capture }) {
    // Committed shots only with --capture redesign-r4; otherwise into this run's folder.
    const dir = capture ? OUT : outDir;
    const problems = [];
    const checks = async (label, theme, list = ['type', 'colour', 'lines', 'dot']) => {
      const found = await designChecks(page, { theme, label, checks: list });
      console.log(`  ${label}: ${found.length} problem(s)${found.length ? `\n    ${found.join('\n    ')}` : ''}`);
      problems.push(...found);
    };
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });

    // P3 + F1: `/` shows the Tasks map, ready within 1500 ms of navigation start (from phase-6-map).
    await page.goto(`${origin}/`, { waitUntil: 'commit' });
    const readyAt = await page.waitForFunction(() => document.querySelector('[data-testid="atlas"]')?.dataset.ready === 'true' && performance.now(), null, { polling: 'raf' });
    const ms = await readyAt.jsonValue();
    console.log(`  data-ready after ${Math.round(ms)} ms`);
    expect(ms <= 1500, `data-ready after ${Math.round(ms)} ms (budget 1500 ms)`);

    // 1. Rest, 1440 light: the drawing.
    await ready(page, `${origin}/?sample=tasks`);
    const atlas = page.getByTestId('atlas');
    expect((await atlas.getAttribute('aria-label')) === SAMPLES.tasks.label, `map name: ${await atlas.getAttribute('aria-label')}`);
    const help = await atlas.evaluate((el) => document.getElementById(el.getAttribute('aria-describedby'))?.textContent ?? '');
    expect(help.startsWith('Arrow keys move between operations'), `map description: ${help}`);
    const d = await page.evaluate(drawing);
    const { t } = d;
    expect(d.cards.length === 5 && d.cards.every((c) => close(c.w, 202) && c.radius === '8px' && c.bg === t['--gray-1'] && c.ring.includes(t['--gray-7']) && c.ring.includes('0.5px') && c.role === 'group' && c.named), `cards ${JSON.stringify(d.cards)}`);
    expect(close(d.head.h, 36) && d.head.tag === 'H3' && d.head.name.join() === '14px,600' && d.head.count[0] === '12px' && d.head.count[1] === t['--gray-11'] && d.head.rule.includes(t['--gray-6']) && d.head.rule.includes('0.5px'), `card head ${JSON.stringify(d.head)}`);
    expect(d.rows.length === 22 && d.rows.every((r) => r.tag === 'BUTTON' && close(r.h, 32)), `rows ${JSON.stringify(d.rows)}`);
    expect(close(d.method.w, 44) && d.method.font.includes('Mono') && d.method.size === '12px' && d.method.color === t['--gray-11'], `method column ${JSON.stringify(d.method)}`);
    expect(d.id.font.includes('Mono') && d.id.size === '14px' && d.id.overflow === 'ellipsis' && d.id.ws === 'nowrap', `operation id ${JSON.stringify(d.id)}`);
    expect(d.del?.text === 'DELETE' && d.del.color === t['--destructive'], `DELETE ${JSON.stringify(d.del)}`);
    expect(d.stop && close(d.stop.w, 18) && close(d.stop.h, 18) && d.stop.bg === t['--indigo-9'] && d.stop.color === 'rgb(255, 255, 255)' && d.stop.size === '12px' && d.stop.weight === '600' && d.stop.radius === '50%', `stop disc ${JSON.stringify(d.stop)}`);
    expect(d.routeId?.[0] === t['--indigo-11'] && d.routeId[1] === '600', `workflow row id ${JSON.stringify(d.routeId)}`);
    expect(d.ln && d.ln.stroke === t['--gray-9'] && d.ln.width === '1px' && d.ln.dash === 'none' && d.ln.marker && d.ln.head === t['--gray-9'] && d.ln.fill === 'none', `feed link ${JSON.stringify(d.ln)}`);
    expect(d.bundles > 0, 'no bundle drawn to a card head');
    expect(d.wf.length === 2 && d.wf.every((w) => w.stroke === t['--indigo-9'] && w.width === '2.5px' && w.marker), `workflow ${JSON.stringify(d.wf)}`);
    expect(d.halo.length === 2 && d.halo.every((h) => h.stroke === t['--gray-1'] && h.width === '6px') && d.ahr === t['--indigo-9'], `halo ${JSON.stringify(d.halo)} arrowhead ${d.ahr}`);
    const last = (cls) => d.order.lastIndexOf(cls);
    const first = (cls) => d.order.indexOf(cls);
    expect(last('ln') < first('halo') && last('halo') < first('wf'), `draw order ${d.order.join(' ')}: links, then halo, then line`);
    // Bundles end at the target card's head: the path's last point is inside a head.
    const heads = await page.evaluate(() => {
      const svg = document.querySelector('.route .links');
      const m = svg.getScreenCTM();
      return [...svg.querySelectorAll('.ln[data-link="bundle"]')].map((p) => {
        const end = p.getPointAtLength(p.getTotalLength());
        const x = end.x * m.a + m.e;
        const y = end.y * m.d + m.f;
        return [...document.querySelectorAll('.rc-head')].some((h) => { const r = h.getBoundingClientRect(); return x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 1 && y <= r.bottom + 1; });
      });
    });
    expect(heads.every(Boolean), `bundles not ending at a card head: ${heads}`);
    // Inferred links are dashed 3 3 (the samples' inferred feeds; the legend shows the style either way).
    if (d.inferred) expect(d.inferred === '3px, 3px', `inferred link dash ${d.inferred}`);
    const legend = await page.evaluate(() => [...document.querySelectorAll('.legend li')].map((li) => { const p = getComputedStyle(li.querySelector('path')); return [li.textContent.trim(), p.stroke, p.strokeWidth, p.strokeDasharray]; }));
    expect(legend.map((l) => l[0]).join('|') === 'Output feeds input|Inferred|Strongest workflow', `legend ${JSON.stringify(legend)}`);
    expect(legend[0].slice(1).join() === `${t['--gray-9']},1px,none` && legend[1].slice(1).join() === `${t['--gray-9']},1px,3px, 3px` && legend[2].slice(1).join() === `${t['--indigo-9']},2.5px,none`, `legend lines ${JSON.stringify(legend)}`);

    // The tools row: Map | List, search with `/`, the legend; the old controls are gone.
    const tabs = page.getByRole('tablist', { name: 'View' });
    expect((await tabs.getByRole('tab').allTextContents()).join('|') === 'Map|List', 'Map | List control');
    expect((await page.locator('#search-q').getAttribute('aria-keyshortcuts')) === '/' && (await page.locator('#search-q').getAttribute('placeholder')) === 'Search', 'search field');
    const sw = await page.locator('.search').boundingBox();
    expect(close(sw.width, 202) && close(sw.height, 40), `search field ${sw.width} x ${sw.height}, expected 202 x 40`);
    for (const name of [/zoom in/i, /zoom out/i, /fit to screen/i, /^keyboard shortcuts$/i]) {
      const n = await page.locator('#result').getByRole('button', { name }).count();
      expect(n === 0, `the result frame still has a ${name} button`);
    }
    expect((await page.locator('details.filters, details.legend, [data-testid="detail"], .toolbar, .camera').count()) === 0, 'Filters, Legend disclosure, detail panel or zoom camera still rendered');
    await checks('rest 1440 light', 'light');
    problems.push(...(await gridCheck(page, { label: 'grid rest 1440 light' })));
    await axe('rest 1440 light');
    await page.mouse.move(0, 0);
    await toMap(page);
    await webp(page, 'rest-1440-light', dir);

    // 2. Hover getTask: its links appear (1.25 px gray-12 with arrowheads); unrelated rows fade to
    // 0.38 and links to gray-6; the workflow rests; the card previews beside the row (V2Hover).
    const getTask = page.locator('.op[data-op="getTask"]');
    await getTask.hover();
    await page.locator('[data-testid="op-preview"]').waitFor();
    await page.waitForTimeout(300); // the 250 ms fade
    const h = await page.evaluate(() => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping
      const s = (el) => getComputedStyle(el);
      const hot = [...document.querySelectorAll('.ln-hot')];
      const rows = [...document.querySelectorAll('.op[data-op]')];
      const card = document.querySelector('[data-testid="op-preview"]');
      const row = document.querySelector('.op[data-op="getTask"]').getBoundingClientRect();
      const rc = document.querySelector('.op[data-op="getTask"]').closest('.rc').getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const frame = document.querySelector('#result').getBoundingClientRect();
      return {
        hot: hot.map((p) => [s(p).stroke, s(p).strokeWidth, !!p.getAttribute('marker-end')]),
        ahk: s(document.querySelector('marker path.ahk')).stroke,
        dim: rows.filter((r) => r.hasAttribute('data-dim')).map((r) => [s(r).opacity, s(r.querySelector('.id')).color, s(r.querySelector('.m')).color].join()),
        lit: rows.filter((r) => !r.hasAttribute('data-dim')).map((r) => r.dataset.op),
        faded: [...document.querySelectorAll('.ln[data-faded]')].map((p) => [s(p).stroke, !!p.getAttribute('marker-end')]),
        wf: document.querySelectorAll('.wf, .halo, .op[data-route]').length,
        card: { left: c.left - rc.right, top: c.top - (row.top + row.height / 2), w: c.width, radius: s(card).borderRadius, bg: s(card).backgroundColor, shadow: s(card).boxShadow, pad: s(card).paddingTop, inFrame: c.right <= frame.right, hidden: card.getAttribute('aria-hidden') },
        dl: [...card.querySelectorAll('dt')].map((dt) => dt.textContent),
        text: card.textContent,
      };
    });
    const { t: tl } = d;
    expect(h.hot.length >= 5 && h.hot.every(([stroke, width, marker]) => stroke === tl['--gray-12'] && width === '1.25px' && marker) && h.ahk === tl['--gray-12'], `hover links ${JSON.stringify(h.hot)} ${h.ahk}`);
    // Faded rows take gray-11, the lightest AA ink, rather than opacity 0.38 (D46).
    expect(h.dim.length > 0 && h.dim.every((o) => o === `1,${tl['--gray-11']},${tl['--gray-11']}`) && h.lit.includes('getTask') && h.lit.includes('listTasks'), `hover fades ${JSON.stringify(h.dim)} lit ${h.lit}`);
    expect(h.faded.length > 0 && h.faded.every(([stroke, marker]) => stroke === tl['--gray-6'] && !marker), `faded links ${JSON.stringify(h.faded)}`);
    expect(h.wf === 0, 'the workflow line and its discs stay drawn while a row is hot');
    expect(close(h.card.left, 16, 1) && close(h.card.top, -40, 1) && close(h.card.w, 300) && h.card.radius === '10px' && h.card.bg === tl['--gray-1'] && h.card.shadow.includes(tl['--gray-7']) && h.card.shadow.includes('0px 8px 24px') && h.card.pad === '16px' && h.card.inFrame && h.card.hidden === 'true', `operation card ${JSON.stringify(h.card)}`);
    expect(h.text.startsWith('GET /tasks/{taskId}') && h.text.includes('Get a task') && h.dl.join('|') === 'Input|Output|Fed by|Feeds|Shares schema|Sub-paths|In skill', `card contents ${h.dl} ${h.text.slice(0, 60)}`);
    await checks('hover getTask 1440 light', 'light');
    await axe('hover getTask 1440 light');
    await webp(page, 'hover-gettask-1440-light', dir);
    // The pointer can travel from the row to the card without losing it (150 ms grace).
    const preview = await page.locator('[data-testid="op-preview"]').boundingBox();
    await page.mouse.move(preview.x + 20, preview.y + 60, { steps: 3 });
    await page.waitForTimeout(250);
    expect((await page.locator('[data-testid="op-preview"]').count()) === 1, 'the preview closed on the way from the row to the card');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
    expect((await page.locator('[data-testid="op-preview"]').count()) === 0 && (await page.locator('.op[data-dim]').count()) === 0, 'the hover state outlives the pointer');

    // The card flips to the left of the row at the frame's right edge (Comments, the last column).
    const comment = page.locator('.op[data-op="listComments"]');
    await comment.hover();
    await page.locator('[data-testid="op-preview"]').waitFor();
    const flip = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="op-preview"]');
      const rc = document.querySelector('.op[data-op="listComments"]').closest('.rc').getBoundingClientRect();
      return { flip: c.classList.contains('flip'), gap: rc.left - c.getBoundingClientRect().right, right: c.getBoundingClientRect().right, frame: document.querySelector('#result').getBoundingClientRect().right };
    });
    expect(flip.flip && close(flip.gap, 16, 1) && flip.right <= flip.frame, `the card does not flip at the right edge ${JSON.stringify(flip)}`);
    await page.mouse.move(0, 0);

    // 3. Pinned: click pins (#op=, Close, the extra contents); Escape closes and returns focus to the row.
    await getTask.click();
    const pinned = page.getByTestId('op-card');
    await pinned.waitFor();
    expect(new URL(page.url()).hash === '#op=getTask', `hash after a click: ${page.url()}`);
    expect((await said(page)) === 'Operation card open after the map; Tab to read it.', `announcer after pin: ${await said(page)}`);
    expect((await getTask.getAttribute('aria-expanded')) === 'true' && (await getTask.getAttribute('aria-haspopup')) === 'dialog', 'pinned row state');
    const text = await pinned.textContent();
    for (const want of ['taskId', 'path, string, required', 'Output', 'assigneeId', 'bearerAuth', 'Fed by', 'Feeds', 'Shares schema', 'Sub-paths', 'Copy example']) expect(text.includes(want), `pinned card lacks "${want}"`);
    expect((await page.getByRole('dialog', { name: /Get a task/ }).count()) === 1, 'pinned card is not a dialog named by its title');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300); // the row's hover background fades out
    await checks('pinned getTask 1440 light', 'light');
    await axe('pinned getTask 1440 light');
    await screenshot('r4-pinned-gettask');
    await page.keyboard.press('Tab');
    expect((await active(page)) === 'Close details', `Tab from the pinned row goes to ${await active(page)}, expected Close`);
    await page.keyboard.press('Escape');
    await pinned.waitFor({ state: 'detached' });
    expect((await active(page)) === 'getTask' && new URL(page.url()).hash === '', `Escape: focus on ${await active(page)}, hash ${new URL(page.url()).hash}`);
    // Enter pins from the keyboard; Close closes and returns focus too; a related operation moves the pin.
    await page.keyboard.press('Enter');
    await pinned.waitFor();
    await pinned.getByRole('button', { name: 'listTasks' }).first().click();
    await page.waitForFunction(() => location.hash === '#op=listTasks');
    expect((await active(page)) === 'listTasks' && (await pinned.locator('.oc-path').textContent()) === 'GET /projects/{projectId}/tasks', 'a related operation did not move the pin and focus');
    await pinned.getByRole('button', { name: 'Close details' }).click();
    await pinned.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-nav') === 'listTasks');
    // Copy example still writes the request (the detail panel's test, moved here and to phase 7).
    await page.goto(`${origin}/?sample=tasks#op=getTask`);
    await pinned.waitFor();
    await pinned.getByRole('button', { name: 'Copy example' }).click();
    await page.getByTestId('announcer').filter({ hasText: 'Example copied' }).waitFor();
    expect((await page.evaluate(() => navigator.clipboard.readText())).startsWith("curl 'https://tasks.example.com/v1/tasks/<taskId>'"), 'Copy example');

    // 4. Keyboard: View tabs, search, then the map as one Tab stop; arrows move; `?` opens the shortcuts.
    await ready(page, `${origin}/?sample=tasks`);
    await page.locator('#search-q').focus();
    await page.keyboard.press('Tab');
    expect((await active(page)) === 'listProjects', `Tab from search lands on ${await active(page)}, expected the first row`);
    await page.keyboard.press('Tab');
    expect(!(await page.evaluate(() => document.activeElement?.closest('.route'))), 'the map is more than one Tab stop');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('ArrowRight');
    expect((await active(page)) === 'removeMember', `ArrowRight from listProjects: ${await active(page)}`);
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect((await active(page)) === 'getTask' && (await said(page)) === 'Tasks cluster, 3 of 6.', `keyboard to getTask: ${await active(page)}, "${await said(page)}"`);
    await page.waitForTimeout(300); // the fade
    // Focus shows the same highlight and preview as hover.
    expect((await page.locator('.ln-hot').count()) >= 5 && (await page.locator('[data-testid="op-preview"]').count()) === 1, 'focus does not highlight like hover');
    await page.mouse.move(0, 0);
    await checks('focus getTask 1440 light', 'light');
    await page.keyboard.press('?');
    const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await shortcuts.waitFor();
    await page.keyboard.press('Escape');
    await shortcuts.waitFor({ state: 'detached' });
    expect((await active(page)) === 'getTask', 'focus did not return to the row after the shortcuts dialog');

    // 5. Search: `/` focuses it; matches stay ink, others fade to 0.38; the count is announced; q= in the URL.
    await page.keyboard.press('/');
    expect(await page.locator('#search-q').evaluate((el) => el === document.activeElement), '`/` does not focus the search');
    await page.keyboard.type('comment');
    await page.getByTestId('announcer').filter({ hasText: /^\d+ of 22 operations match\.?$/ }).waitFor();
    const s = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.op[data-op]')];
      return { dim: rows.filter((r) => r.hasAttribute('data-dim')).map((r) => getComputedStyle(r.querySelector('.id')).color), ink: rows.filter((r) => !r.hasAttribute('data-dim')).map((r) => [r.dataset.op, getComputedStyle(r.querySelector('.id')).color]), url: location.search };
    });
    expect(s.ink.length > 0 && s.ink.every(([id, color]) => /comment/i.test(id) && [t['--gray-12'], t['--indigo-11']].includes(color)) && s.dim.length === 22 - s.ink.length && s.dim.every((c) => c === t['--gray-11']) && s.url.includes('q=comment'), `search fade ${JSON.stringify(s)}`);
    await checks('search 1440 light', 'light');
    await axe('search 1440 light');
    // Tab from the search lands on the first match.
    await page.keyboard.press('Tab');
    expect(/comment/i.test(await active(page)), `Tab from a search goes to ${await active(page)}, not a match`);
    await page.locator('#search-q').focus();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !location.search.includes('q='));
    expect((await page.locator('#search-q').inputValue()) === '' && (await page.locator('.op[data-dim]').count()) === 0, 'Escape did not clear the search');
    // q= and #op= survive a reload, and the view= List.
    await ready(page, `${origin}/?sample=tasks&q=task#op=getTask`);
    await pinned.waitFor();
    expect((await page.locator('#search-q').inputValue()) === 'task', 'q= on load');

    // Map | List: List hides the map and keeps the text alternative; Map brings it back.
    await ready(page, `${origin}/?sample=tasks`);
    await tabs.getByRole('tab', { name: 'List' }).click();
    expect((await atlas.count()) === 0 && (await page.getByTestId('list-view').count()) === 1, 'List view');
    expect((await page.locator('.legend').count()) === 0, 'the legend shows in the List view');
    await tabs.getByRole('tab', { name: 'Map' }).click();
    await ready(page);

    // 6. Dark rest.
    await page.emulateMedia({ colorScheme: 'dark' });
    await ready(page, `${origin}/?sample=tasks`);
    const dd = await page.evaluate(drawing);
    expect(dd.del?.color === dd.t['--destructive'] && dd.ln.stroke === dd.t['--gray-9'] && dd.wf.every((w) => w.stroke === dd.t['--indigo-9']), `dark drawing ${JSON.stringify([dd.del, dd.ln, dd.wf])}`);
    await checks('rest 1440 dark', 'dark');
    problems.push(...(await gridCheck(page, { label: 'grid rest 1440 dark' })));
    await axe('rest 1440 dark');
    await page.mouse.move(0, 0);
    await toMap(page);
    await webp(page, 'rest-1440-dark', dir);
    await getTask.hover();
    await page.locator('[data-testid="op-preview"]').waitFor();
    await page.waitForTimeout(300);
    await checks('hover getTask 1440 dark', 'dark');
    await axe('hover getTask 1440 dark');
    await screenshot('r4-hover-dark');
    await getTask.click();
    await pinned.waitFor();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await checks('pinned getTask 1440 dark', 'dark');
    await axe('pinned getTask 1440 dark');
    await page.emulateMedia({ colorScheme: 'light' });

    // 7. "N more" (filesystem's File card holds 9 tools): focusable, aria-expanded, expands in place;
    // destructive tools carry the `!` glyph and "destructive" in their names (D41).
    await ready(page, `${origin}/?sample=filesystem`);
    const more = page.locator('.op.more');
    expect((await more.count()) === 1 && (await more.getAttribute('aria-expanded')) === 'false' && (await more.textContent()) === '1 more', `"N more" row: ${await more.count()} ${await more.textContent()}`);
    const bangs = await page.locator('.op:has(.bang)').evaluateAll((els) => els.map((el) => [el.dataset.op, el.getAttribute('aria-label'), el.querySelector('.m').hasAttribute('data-destructive')]));
    expect(bangs.length >= 2 && bangs.every(([, name, flag]) => name.includes('destructive') && flag), `destructive tools ${JSON.stringify(bangs)}`);
    await more.focus();
    await page.keyboard.press('Enter');
    const opened = [await more.getAttribute('aria-expanded'), await page.locator('.op[data-op]').count(), await said(page), await active(page)];
    expect(opened[0] === 'true' && opened[1] === 14 && opened[2].endsWith('all 9 tools shown.') && opened[3].startsWith('more:'), `Enter did not expand the card in place ${JSON.stringify(opened)}`);
    await axe('filesystem expanded');
    await more.click();
    expect((await more.getAttribute('aria-expanded')) === 'false' && (await page.locator('.op[data-op]').count()) === 13, 'a click did not collapse the card');
    // A pinned operation behind "N more" opens its card on load.
    const hidden = await page.evaluate(() => {
      const shown = new Set([...document.querySelectorAll('.op[data-op]')].map((el) => el.dataset.op));
      return ['read_text_file', 'read_media_file', 'read_multiple_files', 'write_file', 'edit_file', 'create_directory', 'list_directory', 'list_directory_with_sizes', 'directory_tree', 'move_file', 'search_files', 'get_file_info', 'list_allowed_directories'].find((id) => !shown.has(id));
    });
    if (hidden) {
      await ready(page, `${origin}/?sample=filesystem#op=${hidden}`);
      await pinned.waitFor();
      expect((await more.getAttribute('aria-expanded')) === 'true', `#op=${hidden} did not open its card`);
    }

    // 8. Narrower than the map: a native, focusable, labelled scroll region; hover links stay inside it.
    await page.setViewportSize({ width: 1024, height: 900 });
    await ready(page, `${origin}/?sample=tasks`);
    const region = page.getByRole('region', { name: 'Map, scrolls sideways' });
    const r = await region.evaluate((el) => ({ tab: el.tabIndex, scrolls: el.scrollWidth > el.clientWidth, x: getComputedStyle(el).overflowX }));
    expect(r.tab === 0 && r.scrolls && r.x === 'auto', `scroll region ${JSON.stringify(r)}`);
    expect((await page.getByRole('button', { name: /zoom/i }).count()) === 0, 'zoom controls');
    for (const id of ['getTask', 'listProjects', 'deleteComment', 'listLabels']) {
      await region.evaluate((el, op) => el.querySelector(`[data-op="${op}"]`).scrollIntoView({ block: 'nearest', inline: 'nearest' }), id);
      await page.locator(`.op[data-op="${id}"]`).hover();
      await page.waitForTimeout(50);
      const outside = await page.evaluate(() => {
        const box = document.querySelector('.route').getBoundingClientRect();
        const scroll = document.querySelector('.map-scroll');
        const left = box.left;
        return [...document.querySelectorAll('.ln-hot')].map((p) => p.getBoundingClientRect()).filter((b) => b.left < left - 0.5 || b.right > left + scroll.scrollWidth + 0.5 || b.top < box.top - 0.5 || b.bottom > box.bottom + 0.5).length;
      });
      expect(outside === 0, `${id}: ${outside} hover links outside the scroll region`);
    }
    await page.mouse.move(0, 0);
    await region.focus();
    await page.keyboard.press('ArrowRight'); // native scroll: the region is the focus, not a row
    await page.waitForFunction(() => document.querySelector('.map-scroll').scrollLeft > 0);
    await axe('scroll region 1024');
    // Keyboard focus on a row past the edge scrolls it into view.
    await region.evaluate((el) => el.scrollTo(0, 0));
    await page.locator('.op[data-op="listComments"]').focus();
    const seen = await page.evaluate(() => {
      const row = document.querySelector('.op[data-op="listComments"]').getBoundingClientRect();
      const box = document.querySelector('.map-scroll').getBoundingClientRect();
      return row.left >= box.left - 0.5 && row.right <= box.right + 0.5;
    });
    expect(seen, 'a focused row past the edge stays hidden');

    // 9. The 1000-operation synthetic spec pasted as text: interactive, 8-row cards with "N more".
    await page.setViewportSize({ width: 1440, height: 900 });
    await ready(page, `${origin}/?sample=tasks`);
    const big = execFileSync(process.execPath, [join(ROOT, 'scripts', 'gen-synthetic-spec.mjs')], { maxBuffer: 16 * 1024 * 1024 }).toString();
    const started = Date.now();
    await page.locator('#source-field').fill(big);
    await page.locator('#source-field').press('Enter');
    await page.locator('.title h2').filter({ hasText: 'Synthetic' }).waitFor();
    await ready(page);
    const took = Date.now() - started;
    console.log(`  1000-operation paste interactive in ${took} ms`);
    const syn = await page.evaluate(() => ({ cards: document.querySelectorAll('.rc').length, more: document.querySelectorAll('.op.more').length, maxRows: Math.max(...[...document.querySelectorAll('.rc')].map((c) => c.querySelectorAll('.op[data-op]').length)), region: !!document.querySelector('.map-scroll') }));
    expect(syn.cards > 4 && syn.more > 0 && syn.maxRows <= 8 && syn.region, `synthetic map ${JSON.stringify(syn)}`);
    const hoverAt = Date.now();
    await page.locator('.op[data-op]').first().hover();
    await page.locator('[data-testid="op-preview"]').waitFor();
    console.log(`  synthetic hover preview in ${Date.now() - hoverAt} ms`);
    expect(Date.now() - hoverAt < 1000, 'hover on the synthetic map takes over a second');
    await page.mouse.move(0, 0);

    // 10. Samples switch (click, then the Samples arrow keys), online and offline (from phase-6-map).
    await ready(page, `${origin}/?sample=tasks`);
    const sample = (id) => page.getByRole('radiogroup', { name: 'Samples' }).getByText(SAMPLES[id].chip, { exact: true });
    const expectMap = async (id) => {
      await page.getByRole('heading', { level: 2, name: SAMPLES[id].heading }).waitFor();
      await ready(page);
      const got = await page.evaluate(() => ({ label: document.querySelector('[data-testid="atlas"]').getAttribute('aria-label'), rows: document.querySelectorAll('.op[data-op]').length, cards: document.querySelectorAll('.rc').length }));
      expect(got.label === SAMPLES[id].label && got.rows === SAMPLES[id].rows && got.cards === SAMPLES[id].cards, `${id}: ${JSON.stringify(got)}`);
    };
    for (const id of ['petstore', 'filesystem']) {
      await sample(id).click();
      await expectMap(id);
    }
    await page.locator('input[name="sample"][value="filesystem"]').focus();
    await page.keyboard.press('ArrowRight'); // wraps to Tasks API
    await expectMap('tasks');
    // Chrome refetches the favicon on history.replaceState; routing disables the HTTP cache, so this stands in for it.
    const icon = await (await page.request.get(`${origin}/favicon.svg`)).body();
    await page.route('**/favicon.svg', (route) => route.fulfill({ body: icon, contentType: 'image/svg+xml' }));
    await context.setOffline(true);
    for (const id of ['petstore', 'filesystem', 'tasks']) {
      await sample(id).click();
      await expectMap(id);
    }
    await context.setOffline(false);
    await page.unroute('**/favicon.svg');

    // 11. Reduced motion: nothing animates (check 7) at rest or on hover.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page, `${origin}/?sample=tasks`);
    await getTask.hover();
    await page.locator('[data-testid="op-preview"]').waitFor();
    await checks('reduced motion hover', 'light', ['motion']);
    await page.mouse.move(0, 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // 12. Phones and 200 %: no page scroll sideways; the map scrolls in its region (R5 brings the phone list).
    await page.setViewportSize(viewports.mobile);
    await page.goto(`${origin}/?sample=tasks`);
    await page.locator('[data-testid="atlas"][data-ready="true"]').waitFor({ state: 'attached' }); // behind the Map tab
    const tab = page.locator('#tab-map');
    if ((await tab.count()) && (await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
    await ready(page);
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll <= inner, `390 px: horizontal page scroll (${scroll} > ${inner})`);
    await checks('rest 390 light', 'light');
    await axe('rest 390 light');
    await page.mouse.move(0, 0);
    await toMap(page);
    await webp(page, 'rest-390-light', dir);
    await getTask.click();
    await pinned.waitFor();
    const sheet = await pinned.evaluate((el) => ({ position: getComputedStyle(el).position, bottom: Math.round(el.getBoundingClientRect().bottom) }));
    expect(sheet.position === 'fixed' && sheet.bottom === 844, `390 px: the pinned card is not a bottom sheet ${JSON.stringify(sheet)}`);
    expect((await page.locator('[data-testid="op-preview"]').count()) === 0, '390 px: a preview shows beside the sheet');
    await axe('pinned 390 light');
    await page.keyboard.press('Escape');
    await pinned.waitFor({ state: 'detached' });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await page.goto(`${origin}/?sample=tasks`);
    await page.locator('.skill-pane[data-ready="true"]').waitFor();
    const [scroll2, inner2] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll2 <= inner2, `200 % zoom: horizontal page scroll (${scroll2} > ${inner2})`);
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await cdp.detach();

    if (cvd) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await ready(page, `${origin}/?sample=tasks`);
      await toMap(page);
      await getTask.hover();
      await page.locator('[data-testid="op-preview"]').waitFor();
      for (const type of ['protanopia', 'deuteranopia', 'tritanopia']) {
        await cvd(type);
        await screenshot(`r4-hover-${type}`);
      }
      await cvd(null);
    }
    await page.setViewportSize(viewports.desktop);

    expect(problems.length === 0, `DESIGN.md section 8 checks failed:\n${problems.join('\n')}`);
  },
};
