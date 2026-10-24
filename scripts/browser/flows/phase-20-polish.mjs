// Phase 20: the leftover polish, checked in the real app. The skill pane's Options lay out as
// label | field rows with a gap; the audit verdict "Audit passed:" stays on one line at 390 px; map
// edges rest in quiet gray-9 at full opacity (redesign R1) and get bolder (style, marker and label kept) for the focused
// node. Key shots (1440, light): the first view and the map with getTask focused.
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
const ready = async (page) => {
  await page.locator('.skill-pane[data-ready="true"]').waitFor({ state: 'attached' });
  await page.locator('[data-testid="atlas"][data-ready="true"]').waitFor({ state: 'attached' });
};
const opacity = (page, selector) => page.locator(selector).evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).opacity))]);

export default {
  name: 'phase-20-polish',
  phase: 20,
  async run({ page, origin, screenshot, axe }) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.goto(origin);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${origin}/?sample=tasks`);
    await ready(page);

    // Options: a real grid, the label clear of its field by the --space-3 gap, the help under the field.
    await page.locator('.options > summary').click();
    const box = async (sel) => page.locator(sel).evaluate((el) => el.getBoundingClientRect().toJSON());
    const [label, field, help] = [await box('label[for="opt-slug"]'), await box('#opt-slug'), await box('#opt-slug-help')];
    const gap = Math.round(field.left - label.right);
    console.log(`  options: label to field ${gap} px, help at x=${Math.round(help.left)} (field at ${Math.round(field.left)})`);
    expect(gap >= 16, `Options label touches its field: gap ${gap} px`);
    expect(Math.abs(help.left - field.left) <= 1, `Options help is not under its field: ${help.left} vs ${field.left}`);
    await axe('options open');
    await page.locator('.options > summary').click();

    // Edges at rest: quiet gray-9 at full opacity (3:1, redesign R1); the focused node's edges bolder with their labels, the rest fainter.
    await page.mouse.move(1, 1);
    const rest = await opacity(page, '.atlas .edge');
    expect(rest.length === 1 && Number(rest[0]) === 1, `edges at rest: opacity ${rest}`);
    await screenshot('first-view-1440');
    await page.locator('.hit[data-op="getTask"]').focus();
    await page.locator('.atlas[data-hot]').waitFor({ state: 'attached' });
    const hot = await opacity(page, '.atlas .edge[data-hot]');
    const cold = await opacity(page, '.atlas .edge:not([data-hot]):not([data-bundled])');
    const strokes = await page.locator('.atlas .edge[data-hot] .line').evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).strokeWidth))]);
    const labels = await page.locator('.atlas .edge-label[data-hot]').evaluateAll((els) => els.filter((el) => getComputedStyle(el).visibility === 'visible').length);
    console.log(`  getTask focused: hot edges ${hot} (stroke ${strokes}), others ${cold}, ${labels} labels shown`);
    expect(hot.length === 1 && hot[0] === '1', `focused edges not at full strength: ${hot}`);
    expect(strokes.every((w) => w === '2.5px'), `focused edge stroke widths: ${strokes}`);
    expect(cold.every((o) => Number(o) <= 0.12), `other edges not faded: ${cold}`);
    expect(labels > 0, 'focused edges lost their labels');
    const styled = await page.locator('.atlas .edge[data-hot] .line').evaluateAll((els) => els.every((el) => {
      const kind = el.getAttribute('data-kind');
      const cs = getComputedStyle(el);
      return kind === 'sub-path' ? el.getAttribute('marker-end') : kind === 'feeds' ? cs.strokeDasharray !== 'none' && el.getAttribute('marker-end') : cs.strokeDasharray !== 'none';
    }));
    expect(styled, 'a focused edge lost its line style or marker');
    await screenshot('map-focus-1440');

    // 390 px: "Audit passed:" on one line, nothing scrolls sideways in the audit box.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/?sample=tasks`);
    await page.locator('.skill-pane[data-ready="true"]').waitFor({ state: 'attached' });
    const verdict = await page.locator('.audit .verdict').evaluate((el) => {
      const audit = el.closest('.audit');
      // One line = every fragment on the same top (an inline box may report several rects on one line).
      return { lines: new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size, height: Math.round(el.getBoundingClientRect().height), overflow: audit.scrollWidth - audit.clientWidth, text: el.textContent };
    });
    console.log(`  390: verdict ${JSON.stringify(verdict)}`);
    expect(verdict.lines === 1 && verdict.height < 30, `390: "${verdict.text}" wraps: ${JSON.stringify(verdict)}`);
    expect(verdict.overflow <= 0, `390: the audit box scrolls sideways by ${verdict.overflow} px`);
    await axe('390 skill pane');
    await page.setViewportSize({ width: 1280, height: 800 });
  },
};
