// Phase 18: calm polish, nothing lost (docs/DESIGN.md "Calm polish audit"). On first load nothing that
// DESIGN.md folds is open, the accent marks the primary buttons, and the focal point (since redesign R2
// the hero) is on screen at 1440 and 390. More options and the folded sample chips are gone in R2.
// Then every folded item is reached by keyboard only: Tab to its toggle, Enter or Space opens it,
// focus moves inside (or, for text-only content, the text is in the accessibility tree); each toggle
// has a name and an expanded state (read from Chrome's accessibility tree); under reduced motion
// nothing animates. The map's screen-reader summary and the list view are still in the tree.
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
const HOST = 'https://specs.example.test';
const WARNED = `openapi: 3.0.3
info: {title: Shelf API, version: "1"}
paths:
  /shelves:
    get:
      responses: {"200": {description: ok, content: {application/json: {schema: {$ref: "https://elsewhere.example.test/shelf.json#/Shelf"}}}}}
  /shelves/{shelfId}:
    get:
      parameters: [{name: shelfId, in: path, required: true, schema: {type: string}}]
      responses: {"200": {description: ok}}
`;

/**
 * The folded items (DESIGN.md audit table; the Filters and Legend disclosures went in redesign R4:
 * search replaces the filters, and the legend is always shown in the tools row, checked below): the toggle, its expected name, the content it reveals,
 * the control Tab reaches inside (null: text only), and what must be on screen first.
 */
const FOLDED = [
  { name: /^Options$/, toggle: '.options > summary', content: '#opt-slug', inside: '#opt-slug', pane: true },
  { name: /^Audit passed: 9 of 9 checks$/, toggle: '.audit > summary', content: '.audit ul', inside: null, text: 'Every operation: passed', pane: true },
  { name: /^Install command$/, toggle: '.install > summary', content: '.install pre', inside: '.install button', text: 'unzip tasks-api-skill.zip', pane: true },
  { name: /^\d+ relationships: /, toggle: '.rels > summary', content: '.rels ul', inside: null, text: 'feeds', tab: 'list' },
];
/** Folded only once a user source is loaded. */
const LOADED = [
  { name: /^\d+ warnings?$/, toggle: '.warnings > summary', content: '.warnings ul', inside: null, text: 'external' },
];

export default {
  name: 'phase-18-calm',
  phase: 18,
  async run({ page, origin, screenshot, axe }) {
    await page.route(`${HOST}/**`, (route) => route.abort('accessdenied'));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Accessibility.enable');
    /** Chrome's accessibility node for the first element matching `selector`: role, name, expanded, ignored. */
    const ax = async (selector) => {
      const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      expect(nodeId, `no element ${selector}`);
      const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
      const n = nodes[0];
      const prop = (p) => n.properties?.find((x) => x.name === p)?.value.value;
      return { role: n.role?.value, name: (n.name?.value ?? '').replace(/\s+/g, ' ').trim(), expanded: prop('expanded'), ignored: n.ignored };
    };
    const ready = async () => {
      await page.locator('.skill-pane[data-ready="true"]').waitFor({ state: 'attached' });
      await page.locator('[data-testid="atlas"][data-ready="true"]').waitFor({ state: 'attached' });
    };
    const isActive = (selector) => page.evaluate((s) => !!document.activeElement?.matches(s), selector);
    /** Tab from the top of the page until `selector` has focus (keyboard only). */
    const tabTo = async (selector, label) => {
      await page.locator('.skip').focus();
      for (let i = 0; i < 160; i++) {
        if (await isActive(selector)) return;
        await page.keyboard.press('Tab');
      }
      throw new Error(`${label}: Tab never reached ${selector}`);
    };
    /** Select the `id` tab by keyboard (arrows on the tablist), as a keyboard user would. */
    const tabKey = async (id) => {
      if ((await page.locator(`#tab-${id}`).getAttribute('aria-selected')) === 'true') return;
      await tabTo('[role="tab"][aria-selected="true"]', `tab ${id}`);
      for (let i = 0; i < 3 && (await page.locator(`#tab-${id}`).getAttribute('aria-selected')) !== 'true'; i++) await page.keyboard.press('ArrowRight');
      expect((await page.locator(`#tab-${id}`).getAttribute('aria-selected')) === 'true', `could not select the ${id} tab by keyboard`);
    };
    const walk = async (items, width) => {
      for (const [i, item] of items.entries()) {
        const label = `${width}: ${item.name}`;
        const tab = item.tab ?? (item.pane && width < 1024 ? 'skill' : undefined);
        if (tab) await tabKey(tab);
        await tabTo(item.toggle, label);
        const closed = await ax(item.toggle);
        expect(item.name.test(closed.name), `${label}: toggle named "${closed.name}"`);
        expect(closed.expanded === false, `${label}: toggle does not expose a collapsed state (${JSON.stringify(closed)})`);
        expect(!(await page.locator(item.content).first().isVisible()), `${label}: content visible before opening`);
        await page.keyboard.press(i % 2 ? 'Space' : 'Enter');
        const opened = await ax(item.toggle);
        expect(opened.expanded === true, `${label}: toggle not expanded after ${i % 2 ? 'Space' : 'Enter'}`);
        expect(await page.locator(item.content).first().isVisible(), `${label}: content not visible after opening`);
        expect(await page.evaluate(() => document.getAnimations().length === 0), `${label}: something animates under reduced motion`);
        if (item.inside) {
          await page.keyboard.press('Tab');
          expect(await isActive(item.inside), `${label}: Tab from the toggle went to ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))}`);
          await page.keyboard.press('Shift+Tab');
        }
        if (item.text) {
          const tree = await page.locator(item.content).first().ariaSnapshot();
          expect(tree.toLowerCase().includes(item.text.toLowerCase()), `${label}: "${item.text}" not in the accessibility tree: ${tree.slice(0, 200)}`);
        }
        expect(await isActive(item.toggle), `${label}: focus not back on the toggle`);
        await page.keyboard.press('Enter'); // closed again, as found
        expect((await ax(item.toggle)).expanded === false, `${label}: toggle did not close`);
        console.log(`  ${label}: reached, named, opened, closed`);
      }
    };
    const accentFills = () => page.evaluate(() => {
      const probe = document.createElement('i');
      probe.style.color = 'var(--indigo-9)';
      document.body.append(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      return [...document.querySelectorAll('button, summary, a')]
        .filter((el) => el.checkVisibility() && getComputedStyle(el).backgroundColor === accent)
        .map((el) => el.textContent.trim());
    });

    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${origin}/?sample=tasks`);
      await ready();
      await page.evaluate(() => document.fonts.ready);

      // First load: nothing DESIGN.md folds is open, one accent fill, the focal point on screen.
      const open = await page.evaluate(() => [...document.querySelectorAll('details[open]')].map((d) => d.className));
      expect(open.length === 0, `${width}: disclosures open on first load: ${open}`);
      // Since redesign R2 the primary buttons share the accent: Generate in the hero, Download .zip.
      const fills = await accentFills();
      expect(fills.join() === 'Generate,Download .zip', `${width}: accent fills ${JSON.stringify(fills)}`);
      // The focal point is the hero (R2): headline, field, Generate and the samples on screen; at
      // desktop width the result frame and its first view start on screen too (since R4 the map,
      // with the skill browser under it).
      const box = async (selector) => page.locator(selector).first().boundingBox();
      const [h1, field, samples, frame, map] = [await box('.hero h1'), await box('.source-field'), await box('.samples'), await box('#result'), await box('.tools')];
      expect([h1, field, samples].every((b) => b.y >= 0 && b.y + b.height <= height), `${width}: the hero is not on screen: ${JSON.stringify({ h1, field, samples })}`);
      if (width >= 1024) expect(frame.y < height && map.y + map.height <= height, `${width}: the result starts below the fold: ${JSON.stringify({ frame, map })}`);
      expect((await page.locator('.audit > summary').textContent()).includes('Audit passed'), `${width}: audit line`);

      // The map's screen-reader summary and the list view are still in the accessibility tree.
      if (width < 1024) await tabKey('map');
      const atlas = await ax('[data-testid="atlas"]');
      expect(!atlas.ignored && /22 operations in 5 clusters/.test(atlas.name), `${width}: map summary ${JSON.stringify(atlas)}`);
      const help = await page.getByTestId('atlas').getAttribute('aria-describedby');
      expect((await page.locator(`[id="${help}"]`).textContent()).includes('The List view shows the same map as text'), `${width}: map description`);
      // The legend is not folded any more (R4): a list of the three line styles, in the tree, no disclosures.
      const legend = await page.getByRole('list', { name: 'Legend' }).ariaSnapshot();
      expect(['Output feeds input', 'Inferred', 'Strongest workflow'].every((t) => legend.includes(t)), `${width}: legend ${legend}`);
      expect((await page.locator('.filters, details.legend').count()) === 0, `${width}: a Filters or Legend disclosure is back`);
      const listTab = await ax('#tab-list');
      expect(listTab.role === 'tab' && listTab.name === 'List' && !listTab.ignored, `${width}: list tab ${JSON.stringify(listTab)}`);
      await tabKey('list');
      const list = await ax('[data-testid="list-view"]');
      expect(!list.ignored && list.name === 'Tasks API as text', `${width}: list view ${JSON.stringify(list)}`);
      await tabKey(width < 1024 ? 'skill' : 'map');

      await walk(FOLDED, width);
      await axe(`folded items ${width}`);

      // A loaded source's warnings stay one step away.
      await tabKey(width < 1024 ? 'skill' : 'map');
      await page.locator('#source-field').fill(WARNED);
      await page.locator('#source-field').press('Enter');
      await page.locator('.title h2', { hasText: 'Shelf API' }).waitFor();
      await ready();
      await walk(LOADED, width);
      await screenshot(`folded-items-${width}`);
    }
  },
};
