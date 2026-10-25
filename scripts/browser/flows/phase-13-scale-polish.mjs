// Phase 13 (map parts rewritten for the route map in redesign R4): edge-noise trims and bundles on
// the samples' maps, the pinned operation card floating over (not shrinking) the map, map focus
// following back/forward, theme following OS changes (A10), the mobile hero (since redesign R2: the
// field over Generate, the samples on one line), the map scrolling natively on phones (two-pointer
// pinch-zoom, F9, went with zoom in R4), the skill browser's preview taking the wide column (R5; was the
// pane's 40/60 split), the list at 640 px, and the
// synthetic large-spec fixture staying out of the production bundle (P4).
import { settled } from '../redesign-checks.mjs';
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
const paneReady = (page) => page.locator('.skill-browser[data-ready="true"]').waitFor();
const activeOp = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-op') ?? document.activeElement?.tagName);
/** The rest links' bundles: [from, to card, edges]. */
const bundlesOf = (page) => page.locator('.route .links .ln[data-link="bundle"]').evaluateAll((els) => els.map((el) => [el.dataset.from, el.dataset.to, el.dataset.edges.split(' ')]));
/** The graph edges drawn at rest (links and bundles) and, while a row is hot, its links. */
const drawnEdges = (page) => page.evaluate(() => [
  ...[...document.querySelectorAll('.route .links .ln[data-edges]')].flatMap((el) => el.dataset.edges.split(' ')),
  ...[...document.querySelectorAll('.route .links .ln-hot')].map((el) => el.dataset.edge),
]);

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
    const trimmed = ['feeds:getTask->createTask', 'feeds:getTask->updateProject', 'feeds:getProject->removeMember'];
    for (const op of [null, 'getTask', 'getProject']) {
      if (op) await page.locator(`.op[data-op="${op}"]`).hover();
      const drawn = await drawnEdges(page);
      const back = trimmed.filter((id) => drawn.includes(id));
      expect(back.length === 0, `trimmed edges drawn${op ? ` on hover of ${op}` : ''}: ${back}`);
    }
    await page.mouse.move(5, 5);
    // One source feeding four Members operations: one curve to the card's head, not four.
    // Three feeds from Projects into Tasks (across a column) rest as one card-to-card curve (D54).
    const all = await bundlesOf(page);
    const bundles = all.filter(([, to]) => to === 'cluster-members');
    expect(bundles.length === 2 && bundles.every(([, , edges]) => edges.length === 4 && edges.every((e) => e.startsWith(`feeds:`))), `bundles: ${JSON.stringify(all)}`);
    const cards = all.filter(([from]) => from.startsWith('cluster-'));
    expect(all.length === 3 && cards.length === 1 && cards[0][0] === 'cluster-projects' && cards[0][1] === 'cluster-tasks' && cards[0][2].length === 3, `card bundles: ${JSON.stringify(all)}`);
    // Rest links are drawn at full opacity (gray-9 is 3:1 on gray-1); card names are 14 px at every width (no zoom).
    const fades = await page.locator('.route .links .ln, .route .links').evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity));
    expect(fades.every((o) => o === '1'), `rest link opacity: ${fades}`);
    const names = await page.locator('.rc-name').evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).fontSize))]);
    expect(names.join() === '14px', `card names ${names}`);
    await screenshot('trimmed-tasks-map');

    // Hovering the source swaps its bundle for the four links it stands for.
    const [source, , members] = bundles[0];
    await page.locator(`.op[data-op="${source}"]`).hover();
    const hot = await page.locator('.ln-hot').evaluateAll((els) => els.map((el) => el.dataset.edge));
    expect(members.every((e) => hot.includes(e)), `hover ${source}: ${hot} lacks the bundle's ${members}`);
    expect((await page.locator(`.ln[data-link="bundle"][data-from="${source}"]:not([data-faded])`).count()) === 0, `hover ${source}: its bundle stays drawn over the links`);
    // Hovering a Projects row that feeds Tasks fades the card bundle and draws that row's own links.
    const [, , ribbon] = cards[0];
    const feeder = ribbon[0].slice('feeds:'.length).split('->')[0];
    await page.locator(`.op[data-op="${feeder}"]`).hover();
    const own = await page.locator('.ln-hot').evaluateAll((els) => els.map((el) => el.dataset.edge));
    expect(ribbon.filter((e) => e.startsWith(`feeds:${feeder}->`)).every((e) => own.includes(e)), `hover ${feeder}: ${own} lacks its links into Tasks`);
    expect((await page.locator('.ln[data-link="bundle"][data-from="cluster-projects"]:not([data-faded])').count()) === 0, `hover ${feeder}: the card bundle stays drawn`);
    await page.locator(`.op[data-op="${source}"]`).hover();
    await screenshot('bundled-edge');
    await axe('tasks bundles hover');
    await page.mouse.move(5, 5);

    // 2. The pinned operation card floats over the map, so the map keeps its size; Back/Forward move focus with #op.
    const before = await atlas(page).boundingBox();
    await page.locator('.op[data-op="getTask"]').focus();
    await page.keyboard.press('Enter');
    await page.getByTestId('op-card').waitFor(); await settled(page);
    const after = await atlas(page).boundingBox();
    expect(Math.abs(after.width - before.width) < 1 && Math.abs(after.height - before.height) < 1, `map resized with the card: ${JSON.stringify([before, after])}`);
    await page.getByTestId('op-card').getByRole('button', { name: 'Close details' }).focus();
    await page.evaluate(() => history.back());
    await page.getByTestId('op-card').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-op') === 'getTask');
    await page.evaluate(() => document.activeElement.blur());
    await page.evaluate(() => history.forward());
    await page.getByTestId('op-card').waitFor(); await settled(page);
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-op') === 'getTask').catch(async () => expect(false, `focus after forward: ${await activeOp(page)}`));
    await page.keyboard.press('Escape');

    // 3. Filesystem: list_allowed_directories feeds directory tools and search only; two path bundles.
    await page.goto(`${origin}/?sample=filesystem&view=map`);
    await mapReady(page);
    const paths = await bundlesOf(page);
    expect(paths.length === 2 && paths.every(([, to, edges]) => to === 'cluster-file' && edges.length === 6), `filesystem bundles: ${JSON.stringify(paths)}`);
    await page.locator('.op[data-op="list_allowed_directories"]').hover();
    const fed = await page.locator('.ln-hot[data-edge^="feeds:list_allowed_directories->"]').evaluateAll((els) => els.map((el) => el.dataset.edge.split('->')[1]));
    expect(fed.join() === 'list_directory,list_directory_with_sizes,directory_tree,search_files', `list_allowed_directories feeds ${fed}`);
    await screenshot('filesystem-trimmed');
    await page.mouse.move(5, 5);

    // 4. Skill browser at 1280 x 800: the open file gets the wide column (492 of 202 / 492 / 202) and at
    // most 392 px, scrolling inside.
    await page.goto(`${origin}/?sample=tasks`);
    await paneReady(page);
    const [tree, preview] = [await page.locator('.tree').boundingBox(), await page.locator('#skill-preview').boundingBox()];
    const scrolls = await page.locator('#skill-preview').evaluate((el) => el.scrollHeight > el.clientHeight);
    console.log(`  skill browser: files ${Math.round(tree.width)} px wide, preview ${Math.round(preview.width)} x ${Math.round(preview.height)} px`);
    expect(preview.width > 2 * tree.width - 30 && preview.height >= 180 && preview.height <= 392.5 && scrolls, `preview ${JSON.stringify(preview)}, files ${JSON.stringify(tree)}`);
    await page.locator('#skill-preview').scrollIntoViewIfNeeded();
    await screenshot('skill-pane-split');

    // 5. The theme follows the OS live (A10) while nothing is pinned, and so does the theme button's
    // name (R8, D82: it says what a click does).
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.emulateMedia({ colorScheme: 'dark' });
    expect((await background()) === 'rgb(17, 17, 17)', `dark OS: background ${await background()}`);
    await page.locator('header').getByRole('button', { name: 'Switch to light theme', exact: true }).waitFor();
    await screenshot('theme-follows-os');
    await page.emulateMedia({ colorScheme: 'light' });
    expect((await background()) === 'rgb(252, 252, 252)', `light OS: background ${await background()}`);
    expect(!(await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))), 'the theme is pinned on <html>');
    await page.locator('header').getByRole('button', { name: 'Switch to dark theme', exact: true }).waitFor();

    // 6. Mobile (updated in redesign R2): the hero stacks in DOM order (the field, then Generate at full
    // width under it, then Samples); the three samples fit one line, so nothing scrolls or hides
    // (replaces the chip row's "More samples" hint and its scroll-into-view helper).
    await page.setViewportSize(viewports.mobile);
    await page.goto(`${origin}/?sample=filesystem`);
    await paneReady(page);
    const [logo, input, generate, seg] = await Promise.all(['header .brand', '#source-field', '.hero .generate', '.samples .seg'].map((s) => page.locator(s).boundingBox()));
    const field = await page.locator('.source-field').boundingBox();
    expect(input.y >= logo.y + logo.height - 1 && generate.y >= input.y + input.height - 1 && seg.y >= generate.y + generate.height - 1, `hero rows: ${JSON.stringify({ logo, input, generate, seg })}`);
    expect(Math.abs(generate.width - (field.width - 8)) <= 1, `Generate is not full width: ${generate.width} in a ${field.width} field`);
    const items = await page.locator('.seg-item').evaluateAll((els) => els.map((el) => { const b = el.getBoundingClientRect(); return { top: b.top, left: b.left, right: b.right, over: el.scrollWidth > el.clientWidth }; }));
    const row = await page.locator('.samples .seg').evaluate((el) => ({ over: el.scrollWidth > el.clientWidth, right: el.getBoundingClientRect().right }));
    expect(items.length === 3 && items.every((b) => Math.abs(b.top - items[0].top) < 1 && !b.over && b.right <= row.right + 0.5) && !row.over, `samples do not fit one line at 390 px: ${JSON.stringify({ items, row })}`);
    expect(await page.locator('.seg-item[data-sample="filesystem"]:has(input:checked)').isVisible(), '?sample=filesystem is not shown selected');
    await axe('mobile hero');
    await screenshot('mobile-hero');

    // 7. Phones: no zoom and no pinch (F9 went with zoom in R4); the map scrolls sideways natively in
    // its region (touch panning left to the browser) and the page itself never does.
    await page.locator('#tab-map').click();
    await mapReady(page);
    const region = page.getByRole('region', { name: 'Map, scrolls sideways' });
    const native = await region.evaluate((el) => ({ x: getComputedStyle(el).overflowX, touch: getComputedStyle(el).touchAction, wider: el.scrollWidth > el.clientWidth }));
    expect(native.x === 'auto' && native.touch === 'auto' && native.wider, `phone map scroll region ${JSON.stringify(native)}`);
    await region.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    const moved = await page.evaluate(() => [document.querySelector('.map-scroll').scrollLeft, window.scrollX, document.documentElement.scrollWidth <= innerWidth]);
    expect(moved[0] > 0 && moved[1] === 0 && moved[2], `the map did not scroll on its own: ${moved}`);
    expect((await page.locator('.camera, [aria-label="Zoom in"]').count()) === 0, 'zoom is back');
    await screenshot('map-scrolled-mobile');

    // 8. List at 640 px: rows fit without sideways scrolling; each row's relationships are a list named
    // by their count for screen readers (R5: the folded "13 relationships" disclosure became that list).
    await page.setViewportSize({ width: 640, height: 800 });
    await page.goto(`${origin}/?sample=tasks&view=list`);
    await page.getByTestId('list-view').waitFor();
    const fit = await page.getByTestId('list-view').evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(fit[0] <= fit[1], `list scrolls sideways at 640 px: ${fit}`);
    const tallest = await page.locator('.lrow').evaluateAll((rows) => Math.max(...rows.map((r) => r.getBoundingClientRect().height)));
    console.log(`  list at 640 px: tallest row ${Math.round(tallest)} px`);
    expect(tallest < 80, `tallest list row ${tallest} px`);
    expect((await page.locator('.lrow[data-op="getTask"] + ul').getAttribute('aria-label')) === '13 relationships', 'getTask relationships not listed');
    await axe('list 640');
    await screenshot('list-compact-640');
    await page.setViewportSize(viewports.desktop);

    // 9. The synthetic 1000-operation fixture is test-only (P4 checks it in Vitest).
    const leaked = readdirSync(join(DIST, 'assets')).filter((f) => /getFacet|syntheticSpec/.test(readFileSync(join(DIST, 'assets', f), 'latin1')));
    expect(leaked.length === 0, `synthetic fixture in the bundle: ${leaked}`);
  },
};
