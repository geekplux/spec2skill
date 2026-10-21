// Phase 6: the SVG atlas. Every sample renders all nodes/edges in cluster cards; edges keep line
// style + marker + label; camera (buttons, keys, Ctrl + wheel, no plain-wheel trap, drag, fit); data-ready timing (P3);
// reduced motion; 390 px and 200 % zoom; offline sample switching; CVD screenshots.
const SAMPLES = {
  tasks: { chip: 'Tasks API', nodes: 22, edges: 85, clusters: 5 },
  petstore: { chip: 'Petstore', nodes: 16, edges: 41, clusters: 2 },
  filesystem: { chip: 'Filesystem MCP', nodes: 14, edges: 33, clusters: 2 },
};
const DASH = { feeds: '6px, 4px', 'sub-path': 'none', 'shared-schema': '1px, 4px' };

const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
const atlas = (page) => page.getByTestId('atlas');
const transform = (page) => page.locator('.camera').evaluate((g) => getComputedStyle(g).transform);
const ready = (page) => page.locator('[data-testid="atlas"][data-ready="true"]').waitFor();

async function expectAtlas(page, id) {
  const want = SAMPLES[id];
  await ready(page);
  const got = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="atlas"]');
    const edges = [...svg.querySelectorAll('.edge')];
    return {
      nodes: svg.querySelectorAll('.node').length,
      clusters: svg.querySelectorAll('.cluster').length,
      edges: edges.length,
      labels: [...svg.querySelectorAll('.edge-label')].filter((t) => t.textContent.trim()).length,
      // Every edge: its dash pattern, plus an arrow/chevron marker or the shared-schema diamond.
      styles: edges.map((g) => {
        const line = g.querySelector('.line');
        const mark = line.getAttribute('marker-end') ?? (g.querySelector('.diamond') ? 'diamond' : 'none');
        return `${g.dataset.kind}|${getComputedStyle(line).strokeDasharray}|${mark}`;
      }),
    };
  });
  expect(got.nodes === want.nodes, `${id}: ${got.nodes} nodes, expected ${want.nodes}`);
  expect(got.edges === want.edges && got.labels === want.edges, `${id}: ${got.edges} edges / ${got.labels} labels, expected ${want.edges}`);
  expect(got.clusters === want.clusters, `${id}: ${got.clusters} cluster cards, expected ${want.clusters}`);
  for (const style of new Set(got.styles)) {
    const [kind, dash, mark] = style.split('|');
    const marker = kind === 'shared-schema' ? 'diamond' : `url(#mk-${kind})`;
    expect(dash === DASH[kind] && mark === marker, `${id}: edge style ${style}`);
  }
}

/** Every cluster card lies inside the visible map. */
async function expectFitted(page, label) {
  const outside = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="atlas"]').getBoundingClientRect();
    return [...document.querySelectorAll('.cluster .card')].filter((card) => {
      const r = card.getBoundingClientRect();
      return r.left < box.left - 1 || r.top < box.top - 1 || r.right > box.right + 1 || r.bottom > box.bottom + 1;
    }).length;
  });
  expect(outside === 0, `${label}: ${outside} cluster cards outside the map after fit`);
}

async function expectNoHorizontalScroll(page, label) {
  const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll <= inner, `${label}: horizontal scroll (${scroll} > ${inner})`);
}

export default {
  name: 'phase-6-map',
  phase: 6,
  async run({ page, context, origin, viewports, screenshot, cvd }) {
    await page.setViewportSize(viewports.desktop);
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });

    // P3 + F1: `/` shows the Tasks atlas, ready within 1500 ms of navigation start.
    await page.goto(`${origin}/`, { waitUntil: 'commit' });
    const readyAt = await page.waitForFunction(
      () => document.querySelector('[data-testid="atlas"]')?.dataset.ready === 'true' && performance.now(),
      null,
      { polling: 'raf' },
    );
    const ms = await readyAt.jsonValue();
    console.log(`  data-ready after ${Math.round(ms)} ms`);
    expect(ms <= 1500, `data-ready after ${Math.round(ms)} ms (budget 1500 ms)`);
    await expectAtlas(page, 'tasks');
    await expectFitted(page, 'desktop');
    const label = await atlas(page).getAttribute('aria-label');
    expect(label.startsWith('Tasks API atlas: 22 operations in 5 clusters, 85 relationships'), `map name: ${label}`);
    await page.evaluate(() => document.fonts.ready);

    // Non-colour channels on nodes: MCP tools are notched with `fn`; destructive nodes have a hatched bar and `!`.
    const destructive = page.locator('.node[data-state="destructive"]').first();
    expect((await destructive.locator('.bar.hatched').count()) === 1 && (await destructive.locator('.bang').textContent()) === '!', 'destructive node lacks hatched bar or !');
    expect((await page.locator('.node[data-state="mutating"] .bar:not(.hatched)').count()) > 0, 'mutating nodes lack the solid bar');
    expect(/Error on \d+ ops$/.test(await page.locator('.cluster .hub').first().textContent()), 'hub schema badge missing');
    await screenshot('atlas-tasks-desktop');

    // Hovering a node reveals its edges' labels and dims the rest.
    await page.locator('.node[data-op="getTask"]').hover();
    const hotLabels = await page.locator('.edge-label[data-hot]').evaluateAll((ts) => ts.filter((t) => getComputedStyle(t).visibility === 'visible').length);
    const hotEdges = await page.locator('.edge[data-hot]').count();
    expect(hotEdges > 0 && hotLabels === hotEdges, `hover: ${hotLabels} visible labels for ${hotEdges} edges`);
    await screenshot('atlas-tasks-hover');
    await page.mouse.move(5, 5);

    // Camera: buttons, keys, wheel, drag, fit; transitions run at 250 ms without reduced motion.
    const before = await transform(page);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    const duration = await page.locator('.camera').evaluate((g) => getComputedStyle(g).transitionDuration);
    expect(duration === '0.25s', `camera transition is ${duration}, expected 0.25s`);
    await page.waitForTimeout(300);
    const zoomedIn = await transform(page);
    expect(zoomedIn !== before, 'Zoom in did not change the camera');
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.waitForTimeout(300);
    expect((await transform(page)) !== zoomedIn, 'Zoom out did not change the camera');
    await atlas(page).focus();
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await page.waitForTimeout(300);
    const keyed = await transform(page);
    expect(keyed !== before, '+ key did not zoom');
    let box = await atlas(page).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // A plain wheel is not trapped: the event's default (page scroll) is kept and the camera stays put.
    const plain = page.evaluate(() => new Promise((done) => window.addEventListener('wheel', (e) => setTimeout(() => done(e.defaultPrevented)), { once: true })));
    await page.mouse.wheel(0, 120);
    expect((await plain) === false, 'plain wheel was preventDefault-ed (scroll trap)');
    await page.waitForTimeout(50);
    expect((await transform(page)) === keyed, 'plain wheel zoomed the map');
    expect(await page.getByText('Ctrl + scroll to zoom').isVisible(), 'legend does not explain Ctrl + scroll');
    await page.evaluate(() => window.scrollTo(0, 0));
    box = await atlas(page).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('Control');
    await page.waitForTimeout(50);
    const wheeled = await transform(page);
    expect(wheeled !== keyed, 'Ctrl + wheel did not zoom');
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 60, { steps: 4 });
    await page.mouse.up();
    expect((await transform(page)) !== wheeled, 'drag did not pan');
    await screenshot('atlas-tasks-zoomed');
    await atlas(page).focus();
    await page.keyboard.press('0');
    await page.waitForTimeout(300);
    await expectFitted(page, 'fit (0 key)');

    // A7: reduced motion makes camera moves instant.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Zoom in' }).click();
    const reduced = await page.locator('.camera').evaluate((g) => getComputedStyle(g).transitionDuration);
    expect(reduced === '0s', `reduced motion: camera transition is ${reduced}`);
    await page.getByRole('button', { name: 'Fit to screen' }).click();
    await expectFitted(page, 'fit button (reduced motion, no wait)');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // F2: each chip switches the atlas (click, then Enter).
    for (const id of ['petstore', 'filesystem']) {
      await page.getByRole('button', { name: SAMPLES[id].chip }).click();
      await page.getByRole('heading', { level: 1 }).filter({ hasText: id === 'petstore' ? 'Petstore' : 'filesystem' }).waitFor();
      await expectAtlas(page, id);
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(5, 5);
      await page.waitForTimeout(200); // let the chip colour transition settle
      await screenshot(`atlas-${id}-desktop`);
    }
    await page.getByRole('button', { name: SAMPLES.tasks.chip }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { level: 1, name: 'Tasks API (sample)' }).waitFor();
    await expectAtlas(page, 'tasks');

    // Map | List: List hides the map and keeps the text atlas; Map brings it back.
    const views = page.getByRole('group', { name: 'View' });
    await views.getByRole('button', { name: 'List' }).click();
    expect((await atlas(page).count()) === 0 && (await page.getByTestId('sample-list').count()) === 1, 'List view');
    await views.getByRole('button', { name: 'Map' }).click();
    await expectAtlas(page, 'tasks');

    if (cvd) {
      for (const type of ['protanopia', 'deuteranopia', 'tritanopia']) {
        await cvd(type);
        await screenshot(`atlas-tasks-${type}`);
      }
      await cvd(null);
    }

    // Dark theme.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${origin}/?sample=tasks`);
    await expectAtlas(page, 'tasks');
    await page.evaluate(() => document.fonts.ready);
    await screenshot('atlas-tasks-dark');
    await page.emulateMedia({ colorScheme: 'light' });

    // O1: offline after the first load, every sample still switches.
    // Chrome refetches the favicon on history.replaceState; a real browser serves it from the
    // HTTP cache, which Playwright disables while routing, so this route stands in for that cache.
    const icon = await (await page.request.get(`${origin}/favicon.svg`)).body();
    await page.route('**/favicon.svg', (route) => route.fulfill({ body: icon, contentType: 'image/svg+xml' }));
    await context.setOffline(true);
    for (const id of ['petstore', 'filesystem', 'tasks']) {
      await page.getByRole('button', { name: SAMPLES[id].chip }).click();
      await page.locator(`.chip[aria-pressed="true"][data-sample="${id}"]`).waitFor();
      await expectAtlas(page, id);
    }
    await context.setOffline(false);
    await page.unroute('**/favicon.svg');

    // A9 and fit on small screens: 390 px, then 200 % zoom (640 px at device scale factor 2).
    await page.setViewportSize(viewports.mobile);
    await page.goto(`${origin}/?sample=tasks`);
    await expectAtlas(page, 'tasks');
    await expectFitted(page, '390 px');
    await expectNoHorizontalScroll(page, '390 px');
    await atlas(page).scrollIntoViewIfNeeded();
    await screenshot('atlas-tasks-mobile');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await page.goto(`${origin}/?sample=tasks`);
    await expectAtlas(page, 'tasks');
    await expectNoHorizontalScroll(page, '200 % zoom');
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await cdp.detach();
    await page.setViewportSize(viewports.desktop);
  },
};
