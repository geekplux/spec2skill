// Phase 7: keyboard-only atlas (A1), screen-reader names and live announcements (A2), the detail
// panel (F10) with Copy example, #op=<id> on load, bottom sheet at 390 px, shortcut help dialog (deferred to phase 8).
const GET_TASK = 'GET /tasks/{taskId}, Get a task, cluster Tasks, 19 relationships';
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
const transform = (page) => page.locator('.camera').evaluate((g) => getComputedStyle(g).transform);
const settle = (page) => page.waitForTimeout(300);

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

/** The focused node's box lies fully outside the detail panel's box (WCAG 2.4.11). */
async function clearOfPanel(page, label) {
  await page.waitForTimeout(400); // camera transition
  const [n, p] = [await page.locator('.node:has(.hit:focus) .shape').boundingBox(), await page.getByTestId('detail').boundingBox()];
  const overlap = n.x < p.x + p.width && p.x < n.x + n.width && n.y < p.y + p.height && p.y < n.y + n.height;
  const inView = n.y >= 0 && n.y + n.height <= page.viewportSize().height;
  expect(!overlap && inView, `${label}: focused node ${JSON.stringify(n)} hidden by the panel ${JSON.stringify(p)}`);
}

export default {
  name: 'phase-7-keyboard',
  phase: 7,
  async run({ page, context, origin, viewports, screenshot, axe, cvd }) {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await page.setViewportSize(viewports.desktop);
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });

    // The first Tab after a fresh load lands on the skip link, whatever sample is preselected
    // (revealing the selected chip must not move the sequential-focus starting point).
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

    // A1: Tab reaches the map after the toolbar, the map is one Tab stop, then Tab leaves it.
    const stops = [];
    for (let i = 0; i < 40 && !(await page.evaluate(() => document.activeElement?.matches('.hit'))); i++) {
      await page.keyboard.press('Tab');
      stops.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim()));
    }
    expect((await active(page)) === 'listTasks', `Tab did not reach the map (stops: ${stops.join(' | ')})`);
    expect(stops.at(-2) === 'Fit to screen', `the toolbar should precede the map, got ${stops.at(-2)}`);
    const halo = await page.locator('.hit[data-op="listTasks"]').evaluate((r) => getComputedStyle(r).stroke);
    expect(halo === 'rgb(242, 194, 48)', `focused node has no marker halo (${halo})`);
    const ring = await page.locator('.node[data-op="listTasks"] .ring').evaluate((r) => [getComputedStyle(r).stroke, getComputedStyle(r).strokeWidth]);
    expect(ring[0] === 'rgb(28, 36, 48)' && ring[1] === '2px', `focused node has no ink ring (${ring})`);
    const unfocused = await page.locator('.node[data-op="createTask"] .ring').evaluate((r) => getComputedStyle(r).stroke);
    expect(unfocused === 'none', `unfocused node draws a ring (${unfocused})`);
    await page.keyboard.press('Tab');
    expect(!(await page.evaluate(() => document.activeElement?.matches('.hit'))), 'Tab moved to a second node: the map must be one Tab stop');
    await page.keyboard.press('Shift+Tab');

    // Arrows, A2 node name, live region, focus highlights like hover.
    await press(page, 'ArrowDown', 'createTask');
    await press(page, 'ArrowDown', 'getTask');
    expect((await page.locator('.hit[data-op="getTask"]').getAttribute('aria-label')) === GET_TASK, 'getTask accessible name');
    expect((await said(page)) === 'Tasks cluster, 3 of 6.', `announcer after a move: ${await said(page)}`);
    const hot = await page.locator('.edge[data-hot]').count();
    const shown = await page.locator('.edge-label[data-hot]').evaluateAll((ts) => ts.filter((t) => getComputedStyle(t).visibility === 'visible').length);
    expect(hot === 19 && shown === 19, `focus highlight: ${hot} edges, ${shown} labels`);
    await press(page, 'ArrowRight', 'getProject');
    await press(page, 'ArrowLeft', 'getTask');
    await screenshot('focus-node-desktop');

    // E cycles edges (announced), Enter follows, Esc clears.
    await press(page, 'e', 'getTask');
    expect((await said(page)) === 'Edge 1 of 19: has sub-path listComments. Enter follows it.', `announcer after E: ${await said(page)}`);
    expect((await page.locator('.edge[data-cycled]').count()) === 1 && (await page.locator('.node[data-target]').getAttribute('data-op')) === 'listComments', 'cycled edge / target');
    await press(page, 'e');
    expect((await said(page)).startsWith('Edge 2 of 19: '), 'second E');
    await screenshot('edge-cycle-desktop');
    await press(page, 'Escape');
    expect((await page.locator('.edge[data-cycled]').count()) === 0, 'Esc did not clear the edge highlight');
    await press(page, 'e');
    await press(page, 'Enter', 'listComments');

    // Clusters and ends.
    await press(page, 'End', 'deleteComment');
    await press(page, 'Home', 'listComments');
    await press(page, 'PageUp', 'listProjects');
    await press(page, 'PageDown', 'listComments');
    await press(page, 'PageUp', 'listProjects');
    await press(page, 'PageUp', 'listTasks');
    await press(page, 'ArrowDown', 'createTask');
    await press(page, 'ArrowDown', 'getTask');

    // F10: Enter opens details; Fed by lists listTasks; a related button moves focus; hash names the node.
    await press(page, 'Enter', 'getTask');
    const panel = page.getByTestId('detail');
    await panel.waitFor();
    expect(new URL(page.url()).hash === '#op=getTask', `hash after open: ${page.url()}`);
    for (const text of ['taskId', 'Output Task', 'assigneeId', 'bearerAuth', 'Fed by', 'Copy example']) {
      expect((await panel.textContent()).includes(text), `detail panel lacks "${text}"`);
    }
    const fedBy = panel.getByRole('group', { name: 'Fed by' });
    expect((await panel.getByRole('region').count()) === 0, 'related groups must not be landmarks');
    expect((await fedBy.getByRole('button', { name: 'GET /projects/{projectId}/tasks' }).count()) === 1, 'Fed by lacks listTasks');
    await page.keyboard.press('Tab');
    expect((await active(page)) === 'Close details', `Tab from the node should enter the panel, got ${await active(page)}`);
    await page.waitForTimeout(200);
    await screenshot('detail-panel-desktop');
    await panel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await screenshot('detail-panel-related');
    await panel.evaluate((el) => el.scrollTo(0, 0));
    await axe('detail panel open');
    await fedBy.getByRole('button', { name: 'GET /projects/{projectId}/tasks' }).focus();
    await press(page, 'Enter', 'listTasks');
    expect((await panel.getByRole('heading', { level: 2 }).textContent()) === 'GET /projects/{projectId}/tasks', 'panel did not follow focus');

    // Esc in the panel closes it and returns focus to the node; Esc on the map closes too.
    await panel.getByRole('button', { name: 'Copy example' }).focus();
    await press(page, 'Escape', 'listTasks');
    expect((await panel.count()) === 0 && new URL(page.url()).hash === '', 'Esc did not close the panel / clear the hash');
    await press(page, 'Enter');
    await panel.waitFor();
    await press(page, 'Escape', 'listTasks');
    expect((await panel.count()) === 0, 'Esc on the map did not close the panel');

    // + / - / 0 and Shift+arrow pan; the camera follows focus to an off-screen node.
    await press(page, '0');
    await settle(page);
    const fitted = await transform(page);
    for (const key of ['+', '+', '+', '+']) await press(page, key);
    await settle(page);
    const zoomed = await transform(page);
    expect(zoomed !== fitted, '+ did not zoom');
    await press(page, 'Shift+ArrowRight');
    await settle(page);
    expect((await transform(page)) !== zoomed, 'Shift+ArrowRight did not pan');
    await press(page, 'PageDown', 'listProjects');
    await press(page, 'PageDown', 'listComments');
    await settle(page);
    const [node, map] = [await page.locator('.node[data-op="listComments"]').boundingBox(), await page.getByTestId('atlas').boundingBox()];
    expect(node.x >= map.x && node.y >= map.y && node.x + node.width <= map.x + map.width && node.y + node.height <= map.y + map.height, 'camera did not follow focus');
    await press(page, '-');
    await press(page, '0');
    await settle(page);
    expect((await transform(page)) === fitted, '0 did not fit');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await press(page, 'ArrowDown', 'createComment');
    expect((await page.locator('.camera').evaluate((g) => getComputedStyle(g).transitionDuration)) === '0s', 'reduced motion: camera transition');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // Visible text inside the map is hidden from assistive tech; nodes carry full names.
    const tree = await page.getByTestId('atlas').ariaSnapshot();
    expect(tree.includes(`button "${GET_TASK}"`), 'accessibility tree lacks the getTask button');
    expect(!tree.includes('Error on') && !tree.includes('id -> taskId'), 'hub badge or edge label text leaks into the accessibility tree');

    // #op=<id> on load opens the node; Copy example writes curl (Tasks) and tools/call JSON (filesystem).
    await page.goto(`${origin}/?sample=tasks#op=getTask`);
    await ready(page);
    await panel.waitFor();
    expect((await clipboard(page)) === CURL, 'Tasks curl on the clipboard');
    expect((await clipboard(page)) === CURL, 'a second copy is announced again');
    await page.goto(`${origin}/?sample=filesystem#op=read_text_file`);
    await ready(page);
    const call = JSON.parse(await clipboard(page));
    expect(call.method === 'tools/call' && call.params.name === 'read_text_file' && call.params.arguments.path === '<path>', 'filesystem tools/call on the clipboard');

    // Dark theme and CVD with the panel open.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${origin}/?sample=tasks#op=getTask`);
    await ready(page);
    await panel.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await screenshot('detail-panel-dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload(); // the theme toggle reads the system scheme on load
    await ready(page);
    await panel.waitFor();
    if (cvd) {
      await cvd('deuteranopia');
      await screenshot('detail-panel-deuteranopia');
      await cvd(null);
    }

    // 390 px: a bottom sheet that closes with Esc and with its Close button.
    await page.setViewportSize(viewports.mobile);
    await page.goto(`${origin}/?sample=tasks#op=getTask`);
    await ready(page);
    await panel.waitFor();
    const sheet = await panel.evaluate((el) => ({ position: getComputedStyle(el).position, bottom: Math.round(el.getBoundingClientRect().bottom) }));
    expect(sheet.position === 'fixed' && sheet.bottom === 844, `mobile panel is not a bottom sheet: ${JSON.stringify(sheet)}`);
    await screenshot('detail-sheet-mobile');
    await panel.getByRole('button', { name: 'Close details' }).focus();
    await press(page, 'Escape', 'getTask');
    expect((await panel.count()) === 0, 'Esc did not close the bottom sheet');
    await press(page, 'Enter');
    await panel.getByRole('button', { name: 'Close details' }).click();
    expect((await panel.count()) === 0, 'Close did not close the bottom sheet');
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll <= inner, `390 px: horizontal scroll (${scroll} > ${inner})`);

    // 390 px: the preselected chip is scrolled into view inside the chip row, and Tab still starts at the skip link.
    for (const id of ['filesystem', 'tasks']) {
      await page.goto(`${origin}/?sample=${id}`);
      await page.locator('.skill-pane[data-ready="true"]').waitFor(); // the Skill tab, no click
      const [row, chip] = [await page.locator('.chips').boundingBox(), await page.locator(`[data-sample="${id}"]`).boundingBox()];
      expect(chip.x >= row.x - 1 && chip.x + chip.width <= row.x + row.width + 1, `390 px: ?sample=${id} chip ${JSON.stringify(chip)} outside the row ${JSON.stringify(row)}`);
      await page.keyboard.press('Tab');
      expect((await active(page)) === 'Skip to content', `390 px ?sample=${id}: first Tab focused "${await active(page)}"`);
    }

    // Focus not obscured (2.4.11): with the panel open, every PageDown keeps the focused node clear of it.
    for (const [size, label] of [[viewports.mobile, '390 px'], [{ width: 820, height: 1180 }, '820 px']]) {
      await page.setViewportSize(size);
      await page.goto(`${origin}/?sample=tasks`);
      await ready(page);
      await page.locator('.hit[data-op="listTasks"]').focus();
      await press(page, 'Enter');
      await panel.waitFor();
      await clearOfPanel(page, `${label} after Enter`);
      for (let i = 0; i < 4; i++) {
        await press(page, 'PageDown');
        await clearOfPanel(page, `${label} PageDown ${i + 1}`);
      }
      if (label === '390 px') await screenshot('detail-sheet-focus-mobile');
    }
    await page.setViewportSize(viewports.desktop);

    // A sample switch is announced by the persistent live region.
    await page.goto(`${origin}/?sample=tasks`);
    await ready(page);
    await page.locator('[data-sample="filesystem"]').click();
    await page.getByTestId('announcer').filter({ hasText: /: \d+ tools in \d+ clusters, \d+ relationships\. Skill written: audit passed, (\d+) of \1 checks\.$/ }).waitFor();
  },
};
