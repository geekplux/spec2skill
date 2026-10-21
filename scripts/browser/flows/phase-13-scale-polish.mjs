// Phase 13: edge-noise trims and bundles on the samples' maps, the detail panel overlaying (not
// shrinking) the map, map focus following back/forward, theme following OS changes (A10), the mobile
// chip-row hint and header row, two-pointer pinch-zoom (F9), the skill pane's 40/60 split, the list
// at 640 px, and the synthetic large-spec fixture staying out of the production bundle (P4).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'dist');
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
const atlas = (page) => page.getByTestId('atlas');
const mapReady = async (page) => {
  const tab = page.locator('#tab-map');
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await page.locator('[data-testid="atlas"][data-ready="true"]').waitFor();
};
const paneReady = (page) => page.locator('.skill-pane[data-ready="true"]').waitFor();
const scale = (page) => page.locator('.camera').evaluate((g) => new DOMMatrix(getComputedStyle(g).transform).a);
const activeOp = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-op') ?? document.activeElement?.tagName);

/** Zoom (Ctrl + wheel) about the centre of an element on the map. */
async function zoomOn(page, locator, steps) {
  const b = await locator.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.keyboard.down('Control');
  for (let i = 0; i < steps; i++) await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await page.waitForTimeout(100);
}

export default {
  name: 'phase-13-scale-polish',
  phase: 13,
  async run({ page, origin, viewports, screenshot, axe }) {
    await page.setViewportSize(viewports.desktop);
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.goto(origin);
    await page.evaluate(() => localStorage.clear());

    // 1. Tasks: 78 edges (85 before the trims), no bare foreign key into a write, two projectId bundles.
    await page.goto(`${origin}/?sample=tasks&view=map`);
    await mapReady(page);
    await paneReady(page);
    await page.evaluate(() => document.fonts.ready);
    const label = await atlas(page).getAttribute('aria-label');
    expect(label === 'Tasks API: 22 operations in 5 clusters, 78 relationships', `map name: ${label}`);
    for (const id of ['feeds:getTask->createTask', 'feeds:getTask->updateProject', 'feeds:getProject->removeMember']) {
      expect((await page.locator(`.edge[data-edge="${id}"]`).count()) === 0, `trimmed edge ${id} still drawn`);
    }
    const bundles = await atlas(page).locator('.labels .map-link[data-link="bundle"]').evaluateAll((els) => els.map((el) => el.textContent));
    expect(bundles.length === 2 && bundles.every((t) => t === 'projectId -> 4 ops'), `bundles: ${bundles}`);
    const hidden = await page.locator('.edge[data-bundled]').evaluateAll((els) => els.filter((el) => getComputedStyle(el).display === 'none').length);
    expect(hidden === 8, `${hidden} of 8 bundled edges hidden until highlighted`);
    const territory = await page.locator('.territory-label').first().evaluate((t) => t.getBoundingClientRect().height);
    console.log(`  fit: cluster names ${territory.toFixed(1)} px tall on screen`);
    expect(territory >= 9, `cluster names ${territory} px tall at fit`);
    // Link labels keep full opacity (4.5:1 text); the large-spec cluster band is drawn at >= 0.9 (3:1).
    const fades = await atlas(page).locator('.labels .map-link').evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity));
    expect(fades.length > 0 && fades.every((o) => o === '1'), `link label opacity: ${fades}`);
    const band = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        for (const rule of sheet.cssRules) if (rule.selectorText?.replace(/["']/g, '') === '.map-link[data-link=clusters] .line') return Number(rule.style.strokeOpacity);
      }
      return null;
    });
    expect(band !== null && band >= 0.9, `cluster band stroke-opacity: ${band}`);
    await page.mouse.move(5, 5);
    await screenshot('trimmed-tasks-map');

    // Hovering the source swaps its bundle for the four edges it stands for, labels included.
    await page.locator('.node[data-op="listProjects"]').hover();
    const hot = await page.locator('.edge[data-hot][data-bundled]').evaluateAll((els) => els.filter((el) => getComputedStyle(el).display !== 'none').length);
    expect(hot === 4, `hover listProjects: ${hot} bundled edges shown`);
    const faded = await atlas(page).locator('.labels .map-link:not([data-hot]) .edge-label').evaluateAll((els) => els.filter((el) => getComputedStyle(el).visibility !== 'hidden').length);
    expect(faded === 0, `${faded} labels of links not highlighted still shown while a node is hot`);
    await page.mouse.move(5, 5);
    await zoomOn(page, atlas(page).locator('.map-link[data-link="bundle"] .edge-label').first(), 3);
    await page.mouse.move(5, 5);
    await screenshot('bundled-edge');
    await axe('tasks bundles');

    // 2. The detail panel overlays the map, so the map keeps its size; Back/Forward move focus with #op.
    await page.getByRole('button', { name: 'Fit to screen' }).click();
    const before = await atlas(page).boundingBox();
    await page.locator('.hit[data-op="getTask"]').focus();
    await page.keyboard.press('Enter');
    await page.getByTestId('detail').waitFor();
    const after = await atlas(page).boundingBox();
    expect(Math.abs(after.width - before.width) < 1 && Math.abs(after.height - before.height) < 1, `map resized with the panel: ${JSON.stringify([before, after])}`);
    await page.getByTestId('detail').getByRole('button', { name: 'Close details' }).focus();
    await page.evaluate(() => history.back());
    await page.getByTestId('detail').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-op') === 'getTask');
    await page.evaluate(() => document.activeElement.blur());
    await page.evaluate(() => history.forward());
    await page.getByTestId('detail').waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-op') === 'getTask').catch(async () => expect(false, `focus after forward: ${await activeOp(page)}`));
    await page.keyboard.press('Escape');

    // 3. Filesystem: list_allowed_directories feeds directory tools and search only; two path bundles.
    await page.goto(`${origin}/?sample=filesystem&view=map`);
    await mapReady(page);
    const fed = await page.locator('.edge[data-edge^="feeds:list_allowed_directories->"]').evaluateAll((els) => els.map((el) => el.dataset.edge.split('->')[1]));
    expect(fed.join() === 'list_directory,list_directory_with_sizes,directory_tree,search_files', `list_allowed_directories feeds ${fed}`);
    const paths = await atlas(page).locator('.labels .map-link[data-link="bundle"]').evaluateAll((els) => els.map((el) => el.textContent));
    expect(paths.join() === 'path -> 6 ops,path -> 6 ops', `filesystem bundles: ${paths}`);
    await page.locator('.node[data-op="list_allowed_directories"]').hover();
    await screenshot('filesystem-trimmed');
    await page.mouse.move(5, 5);

    // 4. Skill pane at 1280 x 800: the open file gets the larger share (40/60), long names hang.
    await page.goto(`${origin}/?sample=tasks`);
    await paneReady(page);
    const [tree, preview] = [await page.locator('.tree').boundingBox(), await page.locator('#skill-preview').boundingBox()];
    console.log(`  skill pane: files ${Math.round(tree.height)} px, preview ${Math.round(preview.height)} px (${Math.floor(preview.height / 18)} lines)`);
    expect(preview.height >= 180 && preview.height > tree.height, `preview ${preview.height} px, files ${tree.height} px`);
    await screenshot('skill-pane-split');

    // 5. Theme follows the OS while nothing is stored (A10), and stops once the user chooses.
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? null);
    const toggle = page.getByRole('button', { name: 'Dark theme' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    expect((await toggle.getAttribute('aria-pressed')) === 'true', 'toggle does not follow the OS');
    await screenshot('theme-follows-os');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await toggle.click(); // explicit: dark, stored
    await page.emulateMedia({ colorScheme: 'light' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForTimeout(100);
    expect((await theme()) === 'dark', `stored choice overridden by the OS: ${await theme()}`);
    await page.evaluate(() => localStorage.clear());

    // 6. Mobile: theme toggle on the wordmark row; "More samples" while the chips overflow.
    await page.setViewportSize(viewports.mobile);
    await page.goto(`${origin}/?sample=tasks`);
    await paneReady(page);
    const [logo, themeBtn, input] = await Promise.all(['.brand', '.theme', '.source'].map((s) => page.locator(s).boundingBox()));
    expect(Math.abs(logo.y + logo.height / 2 - (themeBtn.y + themeBtn.height / 2)) < 12 && input.y > themeBtn.y + themeBtn.height - 1, `header rows: ${JSON.stringify({ logo, themeBtn, input })}`);
    // Tab order follows the visual order: the theme button (wordmark row) comes before the URL field.
    const order = await page.evaluate(() => [...document.querySelectorAll('.header > *')].map((el) => el.className));
    expect(order.indexOf('btn theme') < order.indexOf('source'), `header DOM order: ${order}`);
    const hint = page.getByTestId('chips-more');
    await hint.waitFor();
    expect((await hint.textContent()).startsWith('More samples'), 'chip hint text');
    // A focused chip scrolls clear of the hint (scroll-padding), so the hint never covers it.
    const hintBox = await hint.boundingBox();
    const chips = page.locator('.chips .chip');
    for (let i = 0; i < (await chips.count()); i++) {
      await chips.nth(i).focus();
      await page.waitForTimeout(50);
      if (!(await hint.isVisible())) break;
      const b = await chips.nth(i).boundingBox();
      expect(b.x + b.width <= hintBox.x + 1, `focused chip ${i} under the hint: ${JSON.stringify([b, hintBox])}`);
    }
    await page.locator('.chips').evaluate((row) => row.scrollTo({ left: 0 }));
    await page.evaluate(() => document.activeElement.blur());
    await axe('mobile chip hint');
    await screenshot('mobile-chip-hint');
    await page.locator('.chips').evaluate((row) => row.scrollTo({ left: row.scrollWidth }));
    await hint.waitFor({ state: 'detached' });

    // 7. Pinch: two touch pointers spreading apart zoom the map; the page does not scroll.
    await page.locator('#tab-map').click();
    await mapReady(page);
    const k0 = await scale(page);
    const scrollY = await page.evaluate(() => window.scrollY);
    await atlas(page).evaluate((svg) => {
      const r = svg.getBoundingClientRect();
      const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
      const fire = (type, pointerId, x) =>
        svg.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: 'touch', isPrimary: pointerId === 1, clientX: x, clientY: cy, bubbles: true, cancelable: true }));
      fire('pointerdown', 1, cx - 30);
      fire('pointerdown', 2, cx + 30);
      for (let i = 1; i <= 5; i++) {
        fire('pointermove', 1, cx - 30 - 12 * i);
        fire('pointermove', 2, cx + 30 + 12 * i);
      }
      fire('pointerup', 1, cx - 90);
      fire('pointerup', 2, cx + 90);
    });
    await page.waitForTimeout(100);
    const k1 = await scale(page);
    console.log(`  pinch: zoom ${k0.toFixed(2)} -> ${k1.toFixed(2)}`);
    expect(k1 > k0 * 2.5, `pinch did not zoom: ${k0} -> ${k1}`);
    expect((await page.evaluate(() => window.scrollY)) === scrollY, 'pinch scrolled the page');
    expect((await page.getByTestId('detail').count()) === 0, 'pinch opened details');
    await screenshot('pinch-zoomed-mobile');

    // 8. List at 640 px: tables fit without sideways scrolling; long relationship lists fold.
    await page.setViewportSize({ width: 640, height: 800 });
    await page.goto(`${origin}/?sample=tasks&view=list`);
    await page.getByTestId('list-view').waitFor();
    const fit = await page.getByTestId('list-view').evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(fit[0] <= fit[1], `list scrolls sideways at 640 px: ${fit}`);
    const tallest = await page.locator('tbody tr').evaluateAll((rows) => Math.max(...rows.map((r) => r.getBoundingClientRect().height)));
    console.log(`  list at 640 px: tallest row ${Math.round(tallest)} px`);
    expect(tallest < 220, `tallest list row ${tallest} px`);
    expect((await page.locator('tr[data-op="getTask"] details.rels summary').textContent()).startsWith('13 relationships: '), 'getTask relationships not folded');
    await axe('list 640');
    await screenshot('list-compact-640');
    await page.setViewportSize(viewports.desktop);

    // 9. The synthetic 1000-operation fixture is test-only (P4 checks it in Vitest).
    const leaked = readdirSync(join(DIST, 'assets')).filter((f) => /getFacet|syntheticSpec/.test(readFileSync(join(DIST, 'assets', f), 'latin1')));
    expect(leaked.length === 0, `synthetic fixture in the bundle: ${leaked}`);
  },
};
