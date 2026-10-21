// Phase 12: search (`/`, Esc, announced count, dimmed and skipped nodes), edge-kind filter, the
// list view as a complete text alternative (every operation and edge, per sample), URL state with
// back/forward, and the `?` shortcut help dialog (focus kept inside, Esc closes, focus returns).
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
const mapReady = (page) => page.locator('[data-testid="atlas"][data-ready="true"]').waitFor();
const paneReady = (page) => page.locator('.skill-pane[data-ready="true"]').waitFor();
const active = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-op') ?? document.activeElement?.id ?? document.activeElement?.tagName);
const search = (page) => page.getByLabel(/^Search (operations|tools)$/);
const announced = (page, text) => page.getByTestId('announcer').filter({ hasText: text }).waitFor();
/** "Tasks API: 22 operations in 5 clusters, 18 relationships" -> [22, 18]. */
async function counts(page) {
  const label = await page.getByTestId('atlas').getAttribute('aria-label');
  const m = /: (\d+) (?:operations|tools) in \d+ clusters, (\d+) relationships$/.exec(label);
  expect(m, `atlas label: ${label}`);
  return [Number(m[1]), Number(m[2])];
}
const views = (page) => page.getByRole('tablist', { name: 'View' });
const list = (page) => page.getByTestId('list-view');

export default {
  name: 'phase-12-search-list',
  phase: 12,
  async run({ page, origin, viewports, screenshot, axe, cvd }) {
    await page.setViewportSize(viewports.desktop);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(origin);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${origin}/?sample=tasks`);
    await mapReady(page);
    await paneReady(page);
    const [total] = await counts(page);
    const skillBefore = await page.locator('#skill-preview').textContent();

    // 1. `/` focuses search; typing narrows, dims and announces; arrows skip dimmed nodes (AC1).
    await page.locator('body').press('/');
    expect((await active(page)) === 'search-q', `/ focused ${await active(page)}`);
    await page.keyboard.type('member');
    await announced(page, /^\d+ of 22 operations match\.$/);
    const said = await page.getByTestId('announcer').textContent();
    const matching = Number(said.split(' ')[0]);
    expect(matching > 0 && matching < total, `matches: ${said}`);
    expect((await page.locator('.node[data-dim]').count()) === total - matching, 'dimmed node count');
    expect((await page.locator('.node[data-dim] .shape').first().evaluate((el) => getComputedStyle(el).strokeDasharray)) !== 'none', 'dimmed nodes have no dashed outline');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'member');
    const dim = new Set(await page.locator('.node[data-dim]').evaluateAll((els) => els.map((el) => el.getAttribute('data-op'))));
    await page.locator('.hit[tabindex="0"]').focus();
    const seen = new Set([await active(page)]);
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'PageDown', 'End', 'PageUp', 'Home', 'ArrowDown', 'PageDown', 'ArrowRight']) {
      await page.keyboard.press(key);
      seen.add(await active(page));
    }
    const skipped = [...seen].filter((id) => dim.has(id));
    expect(skipped.length === 0, `keyboard reached dimmed nodes: ${skipped}`);
    console.log(`  "member": ${matching} of ${total} match; keyboard visited ${[...seen].join(', ')}`);
    expect((await page.locator('#skill-preview').textContent()) === skillBefore, 'search changed the skill');
    expect((await page.locator('.skill-pane h2').textContent()) === 'tasks-api skill', 'skill pane heading changed');
    await page.mouse.move(5, 5);
    await screenshot('search-member');
    await views(page).getByRole('tab', { name: 'List' }).click();
    expect((await list(page).locator('tbody tr').count()) === matching, 'list view rows differ from the matches');
    // Esc clears.
    await search(page).focus();
    await page.keyboard.press('Escape');
    expect((await search(page).inputValue()) === '', 'Esc did not clear the search');
    await announced(page, 'Showing all 22 operations.');
    expect((await list(page).locator('tbody tr').count()) === total, 'cleared list');

    // 2. Feeds only: sub-path and shared-schema edges leave the map and the list text (AC2).
    await page.locator('.filters summary').click();
    for (const name of ['sub path', 'shared schema']) await page.getByRole('group', { name: 'Edges' }).getByLabel(name).uncheck();
    expect((await page.locator('.filters summary').textContent()) === 'Filters (2 off)', 'filter summary');
    const kinds = new Set((await list(page).locator('li[data-edge]').allTextContents()).map((t) => t.split(' ')[0] + (t.startsWith('fed') ? ' by' : '')));
    expect([...kinds].every((k) => k === 'feeds' || k === 'fed by') && kinds.size > 0, `list edges with feeds only: ${[...kinds]}`);
    await axe('list feeds only');
    await views(page).getByRole('tab', { name: 'Map' }).click();
    await mapReady(page);
    const drawn = new Set(await page.locator('.edge').evaluateAll((els) => els.map((el) => el.getAttribute('data-kind'))));
    expect(drawn.size === 1 && drawn.has('feeds'), `map edges with feeds only: ${[...drawn]}`);
    await page.mouse.move(5, 5);
    await screenshot('filter-feeds');
    await page.getByRole('button', { name: 'Show all' }).click();
    await page.locator('.filters summary').click();

    // 3. The list view is the whole map as text, for every sample (AC3, A3, F12).
    await views(page).getByRole('tab', { name: 'List' }).click();
    for (const id of ['petstore', 'filesystem', 'tasks']) {
      await page.locator(`[data-sample="${id}"]`).click();
      await page.locator(`.chip[aria-pressed="true"][data-sample="${id}"]`).waitFor();
      await list(page).waitFor();
      await views(page).getByRole('tab', { name: 'Map' }).click();
      await mapReady(page);
      const [ops, edges] = await counts(page);
      await views(page).getByRole('tab', { name: 'List' }).click();
      const rows = await list(page).locator('tbody tr').count();
      const items = await list(page).locator('li[data-edge]').evaluateAll((els) => els.map((el) => [el.getAttribute('data-edge'), el.textContent]));
      const unique = new Set(items.map(([edge]) => edge));
      expect(rows === ops, `${id}: ${rows} rows for ${ops} operations`);
      expect(unique.size === edges && items.length === 2 * edges, `${id}: ${unique.size} edges listed (${items.length} mentions) for ${edges}`);
      const words = /^(feeds \S+ via .+|fed by \S+ via .+|sub-path of \S+|has sub-path \S+|shares schema .+ with \S+)$/;
      expect(items.every(([, text]) => words.test(text)), `${id}: an edge without its kind and label`);
      console.log(`  ${id}: ${rows} rows, ${unique.size} edges as text`);
      await axe(`list ${id}`);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(5, 5);
    await screenshot('list-tasks-desktop');
    if (cvd) {
      await cvd('tritanopia');
      await screenshot('list-tritanopia');
      await cvd(null);
    }
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(400); // let colour transitions finish
    await axe('list dark');
    await screenshot('list-dark');
    await page.emulateMedia({ colorScheme: 'light' });

    // 4. URL state: a shared link opens sample, view and details; back/forward walk selections and samples (AC4).
    await page.goto(`${origin}/?sample=petstore&view=list#op=getPetById`);
    await page.getByRole('heading', { level: 2, name: 'petstore-api skill' }).waitFor();
    await list(page).waitFor();
    await page.getByTestId('detail').getByRole('heading', { name: 'GET /pet/{petId}' }).waitFor();
    expect((await page.locator('tr[data-open]').getAttribute('data-op')) === 'getPetById', 'open row not marked');
    await page.evaluate(() => document.fonts.ready);
    await axe('list with details');
    await screenshot('list-detail');
    await list(page).getByRole('button', { name: 'findPetsByStatus, details' }).click();
    await page.getByTestId('detail').getByRole('heading', { name: 'GET /pet/findByStatus' }).waitFor();
    await page.locator('[data-sample="tasks"]').click();
    await page.getByRole('heading', { level: 2, name: 'tasks-api skill' }).waitFor();
    expect(new URL(page.url()).hash === '' && (await page.getByTestId('detail').count()) === 0, 'sample switch kept the old selection');
    await page.goBack();
    await page.getByTestId('detail').getByRole('heading', { name: 'GET /pet/findByStatus' }).waitFor();
    await page.getByRole('heading', { level: 2, name: 'petstore-api skill' }).waitFor();
    await page.goBack();
    await page.getByTestId('detail').getByRole('heading', { name: 'GET /pet/{petId}' }).waitFor();
    await page.goForward();
    await page.getByTestId('detail').getByRole('heading', { name: 'GET /pet/findByStatus' }).waitFor();
    await page.goForward();
    await page.getByRole('heading', { level: 2, name: 'tasks-api skill' }).waitFor();
    expect((await page.getByTestId('detail').count()) === 0, 'forward to tasks reopened details');
    // Map selections push entries too.
    await views(page).getByRole('tab', { name: 'Map' }).click();
    await mapReady(page);
    await page.locator('.hit[data-op="getTask"]').focus();
    await page.keyboard.press('Enter');
    await page.getByTestId('detail').waitFor();
    await page.keyboard.press('Escape');
    expect((await page.getByTestId('detail').count()) === 0, 'Esc did not close details');
    await page.goBack();
    await page.getByTestId('detail').getByRole('heading', { name: 'GET /tasks/{taskId}' }).waitFor();
    await page.goForward();
    await page.getByTestId('detail').waitFor({ state: 'detached' });

    // 5. `?` opens the shortcut help: modal, Esc closes, focus returns; also from the skill pane (AC5).
    await page.locator('.hit[data-op="getTask"]').focus();
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await dialog.waitFor();
    expect(await dialog.evaluate((d) => d.open && d.matches(':modal')), 'help is not a modal dialog');
    const text = await dialog.innerText();
    for (const words of ['Page Up', 'Shift + ←', 'Esc', 'Fit the map', 'Skill files', 'Switch between Skill, Map and List', 'Search operations']) {
      expect(text.includes(words), `help dialog lacks "${words}"`);
    }
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !document.activeElement || document.activeElement === document.body || !!document.activeElement.closest('dialog')), 'Tab left the dialog');
    }
    await axe('shortcut help');
    await screenshot('shortcut-help');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    expect((await active(page)) === 'getTask', `focus after Esc: ${await active(page)}`);
    await page.locator('[role="treeitem"][data-path="SKILL.md"]').focus();
    await page.keyboard.press('?');
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await dialog.waitFor({ state: 'detached' });
    expect((await active(page)) === 'SKILL.md' || (await page.evaluate(() => document.activeElement?.getAttribute('data-path'))) === 'SKILL.md', 'focus did not return to the tree');
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    expect((await page.evaluate(() => document.activeElement?.textContent)) === 'Keyboard shortcuts', 'focus did not return to the button');

    // 6. Mobile: `/` from the Skill tab opens the Map tab with search focused; list view at 390 px.
    await page.setViewportSize(viewports.mobile);
    await page.goto(`${origin}/?sample=tasks`);
    await paneReady(page);
    await page.locator('body').press('/');
    expect((await active(page)) === 'search-q', `mobile / focused ${await active(page)}`);
    expect((await page.locator('#tab-map').getAttribute('aria-selected')) === 'true', '/ did not open the Map tab');
    await page.locator('#tab-list').click();
    await list(page).waitFor();
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll <= inner, `390 px list: horizontal scroll (${scroll} > ${inner})`);
    await axe('mobile list');
    await screenshot('list-tasks-mobile');
    await page.setViewportSize(viewports.desktop);
  },
};
