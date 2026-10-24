// Phase 7 (rewritten for the route map in redesign R4): keyboard-only map (A1), screen-reader names
// and live announcements (A2), the pinned operation card (F10, which replaced the detail panel) with
// Copy example, #op=<id> on load, the bottom sheet at 390 px, focus never hidden by the card (2.4.11)
// (the shortcut help dialog is checked in phase 12).
const GET_TASK = 'GET getTask, /tasks/{taskId}, Get a task, workflow step 3, cluster Tasks, 13 relationships';
const CURL = `curl 'https://tasks.example.com/v1/tasks/<taskId>' \\\n  -H "Authorization: Bearer $TASKS_API_TOKEN"`;

const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
// Below 1024 px the map sits behind the Map tab (phase 11): select it before waiting for the map.
const ready = async (page) => {
  const tab = page.locator('#tab-map');
  await tab.waitFor();
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await page.locator('[data-testid="atlas"][data-ready="true"]').waitFor();
};
const active = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-op') ?? document.activeElement?.textContent?.trim() ?? null);
// The announcer clears, then sets the message on the next frame: read it two frames later.
const frames = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const said = async (page) => (await frames(page), page.getByTestId('announcer').textContent());

async function press(page, key, op) {
  await page.keyboard.press(key);
  if (op) expect((await active(page)) === op, `${key}: focus on ${await active(page)}, expected ${op}`);
}

async function clipboard(page) {
  await page.getByRole('button', { name: 'Copy example' }).click();
  await page.getByTestId('announcer').filter({ hasText: 'Example copied' }).waitFor();
  await page.locator('.copied', { hasText: 'Copied' }).waitFor();
  return page.evaluate(() => navigator.clipboard.readText());
}

/** The focused row lies fully outside the pinned card and inside the window (WCAG 2.4.11). */
async function clearOfCard(page, label) {
  await frames(page);
  const [n, p] = [await page.locator('.op:focus').boundingBox(), await page.getByTestId('op-card').boundingBox()];
  const overlap = n.x < p.x + p.width && p.x < n.x + n.width && n.y < p.y + p.height && p.y < n.y + n.height;
  const inView = n.y >= 0 && n.y + n.height <= page.viewportSize().height;
  expect(!overlap && inView, `${label}: focused row ${JSON.stringify(n)} hidden by the card ${JSON.stringify(p)}`);
}

export default {
  name: 'phase-7-keyboard',
  phase: 7,
  async run({ page, context, origin, viewports, screenshot, axe, cvd }) {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await page.setViewportSize(viewports.desktop);
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });

    // The first Tab after a fresh load lands on the skip link, whatever sample is preselected
    // (selecting the sample must not move the sequential-focus starting point).
    for (const id of ['tasks', 'petstore', 'filesystem']) {
      await page.goto(`${origin}/?sample=${id}`);
      await ready(page);
      await page.keyboard.press('Tab');
      const first = await active(page);
      expect(first === 'Skip to content', `?sample=${id}: first Tab focused "${first}", expected the skip link`);
    }

    await page.goto(`${origin}/?sample=tasks`);
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(1, 1);

    // A1: Tab reaches the map after the tools row (Map | List, search), the map is one Tab stop, then Tab leaves it.
    const stops = [];
    for (let i = 0; i < 40 && !(await page.evaluate(() => document.activeElement?.matches('.op'))); i++) {
      await page.keyboard.press('Tab');
      stops.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim()));
    }
    expect((await active(page)) === 'listProjects', `Tab did not reach the map (stops: ${stops.join(' | ')})`);
    expect(stops.at(-2) === 'Search operations', `the search should precede the map, got ${stops.at(-2)}`);
    // Focus (redesign R1): a 2 px gray-12 outline on the row, in both themes; none on other rows.
    const ringOf = () => page.locator('.op[data-op="listProjects"]').evaluate((r) => [getComputedStyle(r).outlineColor, getComputedStyle(r).outlineWidth, getComputedStyle(r).outlineStyle]);
    const ring = await ringOf();
    expect(ring.join() === 'rgb(32, 32, 32),2px,solid', `focused row has no gray-12 ring in light (${ring})`);
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await ringOf();
    expect(dark.join() === 'rgb(238, 238, 238),2px,solid', `focused row has no gray-12 ring in dark (${dark})`);
    await page.emulateMedia({ colorScheme: 'light' });
    const unfocused = await page.locator('.op[data-op="createProject"]').evaluate((r) => getComputedStyle(r).outlineStyle);
    expect(unfocused === 'none', `unfocused row draws an outline (${unfocused})`);
    await page.keyboard.press('Tab');
    expect(!(await page.evaluate(() => document.activeElement?.matches('.op'))), 'Tab moved to a second row: the map must be one Tab stop');
    await page.keyboard.press('Shift+Tab');

    // Arrows (spatial, on the columns), A2 row name, live region, focus highlights like hover.
    await press(page, 'PageUp', 'listComments'); // wraps from Projects to the last card
    await press(page, 'PageUp', 'listTasks');
    await press(page, 'ArrowDown', 'createTask');
    await press(page, 'ArrowDown', 'getTask');
    expect((await page.locator('.op[data-op="getTask"]').getAttribute('aria-label')) === GET_TASK, `getTask accessible name: ${await page.locator('.op[data-op="getTask"]').getAttribute('aria-label')}`);
    expect((await said(page)) === 'Tasks cluster, 3 of 6.', `announcer after a move: ${await said(page)}`);
    const hot = await page.locator('.ln-hot').count();
    expect(hot === 7 && (await page.locator('[data-testid="op-preview"]').count()) === 1, `focus highlight: ${hot} links (feeds of getTask: 7)`);
    await press(page, 'ArrowRight', 'updateComment'); // the row level with it in the next column
    await press(page, 'ArrowLeft', 'getTask');
    await screenshot('focus-row-desktop');

    // E cycles every relationship (announced), the far row is outlined dashed, Enter follows, Esc clears.
    await press(page, 'e', 'getTask');
    expect((await said(page)) === 'Edge 1 of 13: has sub-path listComments. Enter follows it.', `announcer after E: ${await said(page)}`);
    expect((await page.locator('.op[data-target]').getAttribute('data-op')) === 'listComments', 'cycled target');
    expect((await page.locator('.op[data-target]').evaluate((el) => getComputedStyle(el).outlineStyle)) === 'dashed', 'the cycled target is not outlined');
    await press(page, 'e');
    expect((await said(page)).startsWith('Edge 2 of 13: '), 'second E');
    await screenshot('edge-cycle-desktop');
    await press(page, 'Escape');
    expect((await page.locator('.op[data-target]').count()) === 0, 'Esc did not clear the edge highlight');
    await press(page, 'e');
    await press(page, 'Enter', 'listComments');

    // Cards and ends. Card order: Projects, Members, Labels, Tasks, Comments (columns, then top down).
    await press(page, 'End', 'deleteComment');
    await press(page, 'Home', 'listComments');
    await press(page, 'PageDown', 'listProjects');
    await press(page, 'PageDown', 'listMembers');
    await press(page, 'PageDown', 'listLabels');
    await press(page, 'PageDown', 'listTasks');
    await press(page, 'ArrowDown', 'createTask');
    await press(page, 'ArrowDown', 'getTask');

    // F10: Enter pins the card; Fed by lists listTasks; a related button moves focus; the hash names the row.
    await press(page, 'Enter', 'getTask');
    const card = page.getByTestId('op-card');
    await card.waitFor();
    expect(new URL(page.url()).hash === '#op=getTask', `hash after open: ${page.url()}`);
    for (const text of ['taskId', 'Output', 'assigneeId', 'bearerAuth', 'Fed by', 'Copy example']) {
      expect((await card.textContent()).includes(text), `operation card lacks "${text}"`);
    }
    const fedBy = card.locator('dt:text-is("Fed by") + dd');
    expect((await card.getByRole('region').count()) === 0, 'related groups must not be landmarks');
    expect((await fedBy.getByRole('button', { name: 'listTasks' }).count()) === 1, 'Fed by lacks listTasks');
    await page.keyboard.press('Tab');
    expect((await active(page)) === 'Close details', `Tab from the row should enter the card, got ${await active(page)}`);
    await page.waitForTimeout(300);
    await screenshot('op-card-desktop');
    await axe('operation card pinned');
    await fedBy.getByRole('button', { name: 'listTasks' }).focus();
    await press(page, 'Enter', 'listTasks');
    expect((await card.locator('.oc-path').textContent()) === 'GET /projects/{projectId}/tasks', 'the card did not follow focus');

    // Esc in the card closes it and returns focus to the row; Esc on the map closes too.
    await card.getByRole('button', { name: 'Copy example' }).focus();
    await press(page, 'Escape', 'listTasks');
    expect((await card.count()) === 0 && new URL(page.url()).hash === '', 'Esc did not close the card / clear the hash');
    await press(page, 'Enter');
    await card.waitFor();
    await press(page, 'Escape', 'listTasks');
    expect((await card.count()) === 0, 'Esc on the map did not close the card');

    // Reduced motion: the fades are instant.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await press(page, 'ArrowDown', 'createTask');
    const motion = await page.locator('.op[data-op="createTask"]').evaluate((el) => [getComputedStyle(el).transitionDuration, getComputedStyle(el.querySelector('.id')).transitionDuration]);
    expect(motion.every((d) => d === '0s'), `reduced motion: row transitions ${motion}`);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // Visible text inside the map is hidden from assistive tech; rows carry full names.
    const tree = await page.getByTestId('atlas').ariaSnapshot();
    expect(tree.includes(`button "${GET_TASK}"`), 'accessibility tree lacks the getTask button');
    expect(!tree.includes('id -> taskId') && !/\b(img|graphics)\b/.test(tree), 'link drawing leaks into the accessibility tree');

    // #op=<id> on load pins the card; Copy example writes curl (Tasks) and tools/call JSON (filesystem).
    await page.goto(`${origin}/?sample=tasks#op=getTask`);
    await ready(page);
    await card.waitFor();
    expect((await clipboard(page)) === CURL, 'Tasks curl on the clipboard');
    expect((await clipboard(page)) === CURL, 'a second copy is announced again');
    await page.goto(`${origin}/?sample=filesystem#op=read_text_file`);
    await ready(page);
    const call = JSON.parse(await clipboard(page));
    expect(call.method === 'tools/call' && call.params.name === 'read_text_file' && call.params.arguments.path === '<path>', 'filesystem tools/call on the clipboard');

    // Dark theme and CVD with the card pinned.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${origin}/?sample=tasks#op=getTask`);
    await ready(page);
    await card.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await screenshot('op-card-dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload();
    await ready(page);
    await card.waitFor();
    if (cvd) {
      await cvd('deuteranopia');
      await screenshot('op-card-deuteranopia');
      await cvd(null);
    }

    // 390 px: a bottom sheet that closes with Esc and with its Close button.
    await page.setViewportSize(viewports.mobile);
    await page.goto(`${origin}/?sample=tasks#op=getTask`);
    await ready(page);
    await card.waitFor();
    const sheet = await card.evaluate((el) => ({ position: getComputedStyle(el).position, bottom: Math.round(el.getBoundingClientRect().bottom) }));
    expect(sheet.position === 'fixed' && sheet.bottom === 844, `mobile card is not a bottom sheet: ${JSON.stringify(sheet)}`);
    await screenshot('op-card-sheet-mobile');
    await card.getByRole('button', { name: 'Close details' }).focus();
    await press(page, 'Escape', 'getTask');
    expect((await card.count()) === 0, 'Esc did not close the bottom sheet');
    await press(page, 'Enter');
    await card.getByRole('button', { name: 'Close details' }).click();
    expect((await card.count()) === 0, 'Close did not close the bottom sheet');
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll <= inner, `390 px: horizontal scroll (${scroll} > ${inner})`);

    // 390 px: the preselected sample is shown selected inside the samples row (all three fit since
    // redesign R2), and Tab still starts at the skip link.
    for (const id of ['filesystem', 'tasks']) {
      await page.goto(`${origin}/?sample=${id}`);
      await page.locator('.skill-pane[data-ready="true"]').waitFor(); // the Skill tab, no click
      const [row, chip] = [await page.locator('.samples .seg').boundingBox(), await page.locator(`.seg-item[data-sample="${id}"]:has(input:checked)`).boundingBox()];
      expect(chip.x >= row.x - 1 && chip.x + chip.width <= row.x + row.width + 1, `390 px: ?sample=${id} ${JSON.stringify(chip)} outside the row ${JSON.stringify(row)}`);
      await page.keyboard.press('Tab');
      expect((await active(page)) === 'Skip to content', `390 px ?sample=${id}: first Tab focused "${await active(page)}"`);
    }

    // Focus not obscured (2.4.11): with the card pinned, every PageDown keeps the focused row clear of it.
    for (const [size, label] of [[viewports.mobile, '390 px'], [{ width: 820, height: 1180 }, '820 px']]) {
      await page.setViewportSize(size);
      await page.goto(`${origin}/?sample=tasks`);
      await ready(page);
      await page.locator('.op[data-op="listTasks"]').focus();
      await press(page, 'Enter');
      await card.waitFor();
      await clearOfCard(page, `${label} after Enter`);
      for (let i = 0; i < 4; i++) {
        await press(page, 'PageDown');
        await clearOfCard(page, `${label} PageDown ${i + 1}`);
      }
      if (label === '390 px') await screenshot('op-card-sheet-focus-mobile');
    }
    await page.setViewportSize(viewports.desktop);

    // A sample switch is announced by the persistent live region.
    await page.goto(`${origin}/?sample=tasks`);
    await ready(page);
    await page.locator('[data-sample="filesystem"]').click();
    await page.getByTestId('announcer').filter({ hasText: /: \d+ tools in \d+ clusters, \d+ relationships\. Skill written: audit passed, (\d+) of \1 checks\.$/ }).waitFor();
  },
};
