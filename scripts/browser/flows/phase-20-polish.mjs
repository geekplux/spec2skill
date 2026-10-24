// Phase 20: the leftover polish, checked in the real app. The skill browser's name and licence fields
// (R5: under "Edit name and licence", each label above its field, the help under it); the audit
// verdict "Audit passed" stays on one line at 390 px; map
// links rest in quiet gray-9 at full opacity (redesign R1) and, on the route map (R4), the focused
// row's links come in gray-12 (style and arrowheads kept) while the rest fade. Key shots (1440,
// light): the first view and the map with getTask focused.
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
const ready = async (page) => {
  await page.locator('.skill-browser[data-ready="true"]').waitFor({ state: 'attached' });
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

    // Name and licence: in the 202 px files column, each label above its field, clear of it, and the
    // help under the field, all inside the column.
    const edit = page.getByRole('button', { name: 'Edit name and licence' });
    await edit.click();
    const box = async (sel) => page.locator(sel).evaluate((el) => el.getBoundingClientRect().toJSON());
    const [label, field, help, column] = [await box('label[for="opt-slug"]'), await box('#opt-slug'), await box('#opt-slug-help'), await box('.sb-files')];
    const gap = Math.round(field.top - label.bottom);
    console.log(`  options: label to field ${gap} px, help at y=${Math.round(help.top)} (field ends at ${Math.round(field.bottom)})`);
    expect(gap >= 2 && help.top >= field.bottom && Math.abs(help.left - field.left) <= 1, `name field layout: ${JSON.stringify({ label, field, help })}`);
    expect(field.left >= column.left - 0.5 && field.right <= column.right + 0.5, `the name field leaves the files column: ${JSON.stringify({ field, column })}`);
    await axe('options open');
    await edit.click();

    // Links at rest: quiet gray-9 at full opacity (3:1, redesign R1); on focus (route map, R4) the
    // focused row's links come in gray-12 with arrowheads and a slightly heavier stroke, the rest fade
    // to gray-5 without arrowheads (D47), and inferred links keep their dashes.
    await page.mouse.move(1, 1);
    const rest = await opacity(page, '.route .links .ln');
    expect(rest.length === 1 && Number(rest[0]) === 1, `links at rest: opacity ${rest}`);
    await screenshot('first-view-1440');
    await page.locator('.op[data-op="getTask"]').focus();
    await page.locator('.route[data-hot]').waitFor({ state: 'attached' });
    const tone = (name) => page.evaluate((n) => { const i = document.createElement('i'); i.style.color = `var(${n})`; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; }, name);
    const [ink, faint] = [await tone('--gray-12'), await tone('--gray-5')];
    const hot = await page.locator('.route .links .ln-hot').evaluateAll((els) => els.map((el) => [getComputedStyle(el).stroke, getComputedStyle(el).strokeWidth, getComputedStyle(el).opacity, !!el.getAttribute('marker-end'), el.hasAttribute('data-inferred'), getComputedStyle(el).strokeDasharray]));
    const cold = await page.locator('.route .links .ln').evaluateAll((els) => els.map((el) => [getComputedStyle(el).stroke, !!el.getAttribute('marker-end')]));
    console.log(`  getTask focused: ${hot.length} links (stroke ${[...new Set(hot.map((h) => h[1]))]}), ${cold.length} others faded`);
    expect(hot.length > 0 && hot.every(([stroke, width, op, marker]) => stroke === ink && width === '1.25px' && op === '1' && marker), `focused links not at full strength: ${JSON.stringify(hot)}`);
    expect(hot.every(([, , , , inferred, dash]) => (inferred ? dash !== 'none' : dash === 'none')), `a focused link lost its line style: ${JSON.stringify(hot)}`);
    expect(cold.every(([stroke, marker]) => stroke === faint && !marker), `other links not faded: ${JSON.stringify(cold)}`);
    await screenshot('map-focus-1440');

    // 390 px: "Audit passed" on one line, nothing scrolls sideways in the audit row.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/?sample=tasks`);
    await page.locator('.skill-browser[data-ready="true"]').waitFor({ state: 'attached' });
    const verdict = await page.locator('.sb-audit .verdict').evaluate((el) => {
      const audit = el.closest('.sb-audit');
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
