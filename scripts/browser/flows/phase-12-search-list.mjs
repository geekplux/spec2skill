// Phase 12 (updated for the route map in redesign R4): search (`/`, Esc, announced count, faded and
// skipped rows), relationship kinds (feed links drawn, sub-path and shared schema as text since the
// Filters menu went in R4), the list view as a complete text alternative (every operation and edge,
// per sample), URL state with back/forward, and the `?` shortcut help dialog (focus kept inside, Esc
// closes, focus returns). Since R5 the list is grouped rows (buttons named as on the map, each with its
// relationships in words for screen readers) and phones open on it.
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
const mapReady = (page) => page.locator('[data-testid="atlas"][data-ready="true"]').waitFor();
const paneReady = (page) => page.locator('.skill-browser[data-ready="true"]').waitFor();
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
/** The pinned operation card showing `path` ("GET /pet/{petId}"). */
const cardFor = (page, path) => page.getByTestId('op-card').locator('.oc-path').filter({ hasText: new RegExp(`^${path.replace(/[{}/]/g, '\\$&')}$`) }).waitFor();
/**
 * With the operation card open in the list: the card, its title and Close, and the open row are on
 * screen (the row not under the card), and the list keeps at least its tables' minimum width.
 */
async function listDetailInView(page, op, where) {
  await page.getByTestId('op-card').waitFor();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const r = await page.evaluate((id) => {
    const [vw, vh] = [innerWidth, innerHeight];
    const meets = (b) => b.bottom > 0 && b.top < vh && b.right > 0 && b.left < vw;
    const within = (b) => b.top >= 0 && b.bottom <= vh && b.left >= 0 && b.right <= vw;
    const panel = document.querySelector('[data-testid="op-card"]');
    const row = document.querySelector(`.lrow[data-op="${id}"]`);
    const button = row;
    const b = button.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    const close = [...panel.querySelectorAll('button')].find((el) => el.textContent.startsWith('Close'));
    const scroller = document.querySelector('[data-testid="list-view"]');

    return {
      panel: meets(panel.getBoundingClientRect()), row: meets(row.getBoundingClientRect()), rowShown: hit === button || button.contains(hit),
      heading: within(panel.querySelector('.oc-title').getBoundingClientRect()), close: within(close.getBoundingClientRect()),
      list: scroller.clientWidth, min: Math.round(row.getBoundingClientRect().width),
      rowHeight: Math.round(row.getBoundingClientRect().height), panelTop: Math.round(panel.getBoundingClientRect().top),
    };
  }, op);
  const say = `${where} ${op}: ${JSON.stringify(r)}`;
  expect(r.panel && r.heading && r.close, `details not on screen: ${say}`);
  expect(r.row && r.rowShown, `open row off screen or under the details: ${say}`);
  // Since R5 the list's box and its rows bleed 8 px each side of the column (D64).
  expect(Math.abs(r.list - r.min) <= 1, `the open row is not as wide as the list: ${say}`);
  console.log(`  ${where}: ${op} row ${r.rowHeight} px tall, details from y=${r.panelTop}, list ${r.list} px`);
}

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

    // 1. `/` focuses search; typing narrows, fades and announces; arrows skip faded rows (AC1).
    await page.locator('body').press('/');
    expect((await active(page)) === 'search-q', `/ focused ${await active(page)}`);
    await page.keyboard.type('member');
    await announced(page, /^\d+ of 22 operations match\.$/);
    const said = await page.getByTestId('announcer').textContent();
    const matching = Number(said.split(' ')[0]);
    expect(matching > 0 && matching < total, `matches: ${said}`);
    expect((await page.locator('.op[data-op][data-dim]').count()) === total - matching, 'faded row count');
    // Not lightness alone: matches also turn 600 (gray-12 against gray-11 is under 3:1, D47).
    const weights = await page.locator('.op[data-op]').evaluateAll((els) => els.map((el) => [el.hasAttribute('data-dim'), getComputedStyle(el.querySelector('.id')).fontWeight]));
    expect(weights.every(([dim, w]) => (dim ? w === '400' : w === '600')), `search matches differ only by lightness: ${JSON.stringify(weights)}`);
    await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'member');
    // The map's name and node degrees follow the search.
    const mapLabel = await page.getByTestId('atlas').getAttribute('aria-label');
    expect(new RegExp(`^Tasks API: ${matching} of 22 operations match, \\d+ of \\d+ relationships shown$`).test(mapLabel), `filtered map name: ${mapLabel}`);
    const dim = new Set(await page.locator('.op[data-dim]').evaluateAll((els) => els.map((el) => el.getAttribute('data-op'))));
    await page.locator('.op[tabindex="0"]').focus();
    const seen = new Set([await active(page)]);
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'PageDown', 'End', 'PageUp', 'Home', 'ArrowDown', 'PageDown', 'ArrowRight']) {
      await page.keyboard.press(key);
      seen.add(await active(page));
    }
    const skipped = [...seen].filter((id) => dim.has(id));
    expect(skipped.length === 0, `keyboard reached dimmed nodes: ${skipped}`);
    console.log(`  "member": ${matching} of ${total} match; keyboard visited ${[...seen].join(', ')}`);
    expect((await page.locator('#skill-preview').textContent()) === skillBefore, 'search changed the skill');
    expect((await page.locator('#skill-title').textContent()) === 'tasks-api/ skill', 'skill browser heading changed');
    await page.mouse.move(5, 5);
    await screenshot('search-member');
    await views(page).getByRole('tab', { name: 'List' }).click();
    expect((await list(page).locator('.lrow').count()) === matching, 'list view rows differ from the matches');
    // Esc clears.
    await search(page).focus();
    await page.keyboard.press('Escape');
    expect((await search(page).inputValue()) === '', 'Esc did not clear the search');
    await announced(page, 'Showing all 22 operations.');
    expect((await list(page).locator('.lrow').count()) === total, 'cleared list');

    // 2. Relationship kinds (AC2; the Filters menu is gone since R4): the map draws feed links (and
    // bundles of them) at rest; sub-path and shared-schema relations stay as text in the list and in
    // the operation card, and the map's E key still cycles all of them.
    const kinds = new Set((await list(page).locator('li[data-edge]').allTextContents()).map((t) => t.split(' ').slice(0, t.startsWith('has') || t.startsWith('sub') || t.startsWith('shares') || t.startsWith('fed') ? 2 : 1).join(' ')));
    expect(['feeds', 'fed by', 'has sub-path', 'sub-path of', 'shares schema'].every((k) => kinds.has(k)), `list relationship kinds: ${[...kinds]}`);
    await views(page).getByRole('tab', { name: 'Map' }).click();
    await mapReady(page);
    const drawn = new Set(await page.locator('.route .links .ln:not([data-faded])').evaluateAll((els) => els.map((el) => el.getAttribute('data-link'))));
    expect([...drawn].every((k) => k === 'feed' || k === 'bundle') && drawn.has('feed'), `links drawn at rest: ${[...drawn]}`);
    expect((await page.locator('.filters, [data-testid="filters"]').count()) === 0, 'the Filters menu is still rendered');
    await page.locator('.op[data-op="getTask"]').click();
    const pinnedText = await page.getByTestId('op-card').textContent();
    expect(pinnedText.includes('Shares schema') && pinnedText.includes('Sub-paths'), 'the card does not list sub-path and shared-schema relations');
    await page.keyboard.press('Escape');
    await page.getByTestId('op-card').waitFor({ state: 'detached' });
    await page.mouse.move(5, 5);
    await screenshot('relationship-kinds');

    // 3. The list view is the whole map as text, for every sample (AC3, A3, F12).
    await views(page).getByRole('tab', { name: 'List' }).click();
    for (const id of ['petstore', 'filesystem', 'tasks']) {
      await page.locator(`[data-sample="${id}"]`).click();
      await page.locator(`.seg-item[data-sample="${id}"]:has(input:checked)`).waitFor();
      await list(page).waitFor();
      await views(page).getByRole('tab', { name: 'Map' }).click();
      await mapReady(page);
      const [ops, edges] = await counts(page);
      await views(page).getByRole('tab', { name: 'List' }).click();
      const rows = await list(page).locator('.lrow').count();
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
    await page.getByRole('heading', { level: 3, name: 'petstore-api/ skill' }).waitFor();
    await list(page).waitFor();
    await cardFor(page, 'GET /pet/{petId}');
    expect((await page.locator('.lrow[data-open]').getAttribute('data-op')) === 'getPetById', 'open row not marked');
    await page.evaluate(() => document.fonts.ready);
    await listDetailInView(page, 'getPetById', 'desktop link');
    await axe('list with details');
    await page.mouse.move(5, 5);
    await screenshot('list-detail');
    await list(page).locator('.lrow[data-op="findPetsByStatus"]').click();
    await cardFor(page, 'GET /pet/findByStatus');
    await page.locator('[data-sample="tasks"]').click();
    await page.getByRole('heading', { level: 3, name: 'tasks-api/ skill' }).waitFor();
    expect(new URL(page.url()).hash === '' && (await page.getByTestId('op-card').count()) === 0, 'sample switch kept the old selection');
    await page.goBack();
    await cardFor(page, 'GET /pet/findByStatus');
    await page.getByRole('heading', { level: 3, name: 'petstore-api/ skill' }).waitFor();
    await page.goBack();
    await cardFor(page, 'GET /pet/{petId}');
    await page.goForward();
    await cardFor(page, 'GET /pet/findByStatus');
    await page.goForward();
    await page.getByRole('heading', { level: 3, name: 'tasks-api/ skill' }).waitFor();
    expect((await page.getByTestId('op-card').count()) === 0, 'forward to tasks reopened details');
    // Back/forward never drops focus to the page: it lands on the row of the selection.
    const rowButton = (op) => page.evaluate((o) => document.activeElement === document.querySelector(`.lrow[data-op="${o}"]`), op);
    await list(page).locator('.lrow[data-op="getTask"]').click();
    await page.getByTestId('op-card').getByRole('button', { name: 'Close details' }).focus();
    await page.evaluate(() => history.back());
    await page.getByTestId('op-card').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.closest('[data-op]')?.getAttribute('data-op') === 'getTask');
    expect(await rowButton('getTask'), `focus after back: ${await active(page)}`);
    await page.evaluate(() => document.activeElement.blur());
    await page.evaluate(() => history.forward());
    await page.getByTestId('op-card').waitFor();
    await page.waitForFunction(() => document.activeElement?.closest('[data-op]')?.getAttribute('data-op') === 'getTask');
    expect(await rowButton('getTask'), `focus after forward: ${await active(page)}`);
    await page.goBack();
    await page.getByTestId('op-card').waitFor({ state: 'detached' });
    // Map selections push entries too.
    await views(page).getByRole('tab', { name: 'Map' }).click();
    await mapReady(page);
    await page.locator('.op[data-op="getTask"]').focus();
    await page.keyboard.press('Enter');
    await page.getByTestId('op-card').waitFor();
    await page.keyboard.press('Escape');
    expect((await page.getByTestId('op-card').count()) === 0, 'Esc did not close details');
    await page.goBack();
    await cardFor(page, 'GET /tasks/{taskId}');
    await page.goForward();
    await page.getByTestId('op-card').waitFor({ state: 'detached' });

    // 5. `?` opens the shortcut help: modal, Esc closes, focus returns; also from the skill pane (AC5).
    await page.locator('.op[data-op="getTask"]').focus();
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await dialog.waitFor();
    expect(await dialog.evaluate((d) => d.open && d.matches(':modal')), 'help is not a modal dialog');
    const text = await dialog.innerText();
    for (const words of ['Page Up', 'Esc', 'Pin the operation card', 'Skill files', 'Switch between Map and List', 'Search operations']) {
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
    // The footer's button opens it (since redesign R2; the search row's button went in R4).
    expect((await page.locator('.search').getByRole('button', { name: 'Keyboard shortcuts' }).count()) === 0, 'the search row still has a Keyboard shortcuts button');
    for (const where of ['footer']) {
      await page.locator(where).getByRole('button', { name: 'Keyboard shortcuts' }).click();
      await dialog.waitFor();
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      expect(await page.evaluate((w) => document.activeElement?.textContent === 'Keyboard shortcuts' && !!document.activeElement.closest(w), where), `focus did not return to the ${where} button`);
    }

    // 5b. Details opened from the list show at once beside a full-width list, desktop and tablet;
    // Close returns focus to the row. Unknown sample/view parameters are rewritten.
    for (const [where, size] of [['desktop', viewports.desktop], ['900 px', { width: 900, height: 800 }]]) {
      await page.setViewportSize(size);
      await page.goto(`${origin}/?sample=tasks&view=list`);
      await list(page).waitFor();
      await list(page).locator('.lrow[data-op="getMember"]').click();
      await cardFor(page, 'GET /projects/{projectId}/members/{memberId}');
      await listDetailInView(page, 'getMember', `${where} click`);
      await page.getByTestId('op-card').getByRole('button', { name: 'Close details' }).click();
      await page.getByTestId('op-card').waitFor({ state: 'detached' });
      await page.waitForFunction(() => document.activeElement?.closest('[data-op]')?.getAttribute('data-op') === 'getMember');
      // Back/forward between two rows far apart: the browser's scroll restoration must not win over
      // the reveal, and focus leaves the other row for the selected one.
      const onRow = (op) => page.waitForFunction((o) => document.activeElement === document.querySelector(`.lrow[data-op="${o}"]`), op, { timeout: 3000 });
      await list(page).locator('.lrow[data-op="getTask"]').click();
      await cardFor(page, 'GET /tasks/{taskId}');
      await list(page).locator('.lrow[data-op="getMember"]').click();
      await cardFor(page, 'GET /projects/{projectId}/members/{memberId}');
      await page.goBack();
      await cardFor(page, 'GET /tasks/{taskId}');
      await onRow('getTask').catch(async () => expect(false, `${where} focus after back: ${await active(page)}`));
      await listDetailInView(page, 'getTask', `${where} back`);
      await page.goForward();
      await cardFor(page, 'GET /projects/{projectId}/members/{memberId}');
      await onRow('getMember').catch(async () => expect(false, `${where} focus after forward: ${await active(page)}`));
      await listDetailInView(page, 'getMember', `${where} forward`);
      await page.goto(`${origin}/?sample=petstore&view=list#op=getPetById`);
      await list(page).waitFor();
      await listDetailInView(page, 'getPetById', `${where} link`);
      await page.getByTestId('op-card').getByRole('button', { name: 'Close details' }).focus();
      await page.keyboard.press('Escape');
      await page.getByTestId('op-card').waitFor({ state: 'detached' });
      await page.waitForFunction(() => document.activeElement?.closest('[data-op]')?.getAttribute('data-op') === 'getPetById');
    }
    await page.goto(`${origin}/?sample=tasks&view=list#op=getMember`);
    await listDetailInView(page, 'getMember', '900 px link');
    await page.mouse.move(5, 5);
    await screenshot('list-detail-tablet');
    await page.setViewportSize(viewports.desktop);
    await page.goto(`${origin}/?sample=nope&view=bogus&q=task`);
    await paneReady(page);
    await page.waitForFunction(() => new URL(location.href).search === '?sample=tasks&q=task');
    expect((await page.locator('input[name="sample"]:checked').getAttribute('value')) === 'tasks', 'unknown sample did not fall back to tasks');

    // 6. Mobile (R5): the list is the default view; `/` focuses search; no sideways scroll at 390 px.
    await page.setViewportSize(viewports.mobile);
    await page.goto(`${origin}/?sample=tasks`);
    await paneReady(page);
    await list(page).waitFor();
    expect((await page.locator('#tab-list').getAttribute('aria-selected')) === 'true', 'List is not selected by default on phones');
    await page.locator('body').press('/');
    await page.waitForFunction(() => document.activeElement?.id === 'search-q', null, { timeout: 5000 })
      .catch(async () => expect(false, `mobile / focused ${await active(page)}`));
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll <= inner, `390 px list: horizontal scroll (${scroll} > ${inner})`);
    await axe('mobile list');
    await screenshot('list-tasks-mobile');
    await page.setViewportSize(viewports.desktop);
  },
};
