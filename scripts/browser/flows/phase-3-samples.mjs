// Phase 3 (updated in redesign R2): three samples; each lists its normalised operations; ?sample=
// preselects. Since R2 the samples are a segmented control of native radios ("Samples"): one Tab stop,
// arrow keys move and select. Since phase 12 the operations are read from the list view (?view=list),
// which switching samples keeps. Since R5 the title has no "(sample)" (a Sample tag says it), list rows
// are buttons, and MCP tools show read or write in the method column (D41).
const SAMPLES = [
  { label: 'Tasks API', heading: 'Tasks API', count: 22, item: ['POST', '/projects/{projectId}/tasks'] },
  { label: 'Petstore', heading: 'Swagger Petstore', count: 16, item: ['GET', '/pet/{petId}'] },
  { label: 'Filesystem MCP', heading: 'secure-filesystem-server', count: 14, item: ['read', 'read_text_file'] },
];
const slug = (label) => label.split(' ')[0].toLowerCase();

async function expectSample(page, { heading, count, item }) {
  await page.getByRole('heading', { level: 2, name: heading, exact: true }).waitFor();
  const items = await page.getByTestId('list-view').locator('.lrow').allTextContents();
  if (items.length !== count) throw new Error(`${heading}: expected ${count} operations, got ${items.length}`);
  if (!items.some((text) => text.includes(item[0]) && text.includes(item[1]))) {
    throw new Error(`${heading}: missing ${item.join(' ')}`);
  }
}

async function checked(page) {
  return page.locator('.seg-item:has(input:checked)').allTextContents();
}

export default {
  name: 'phase-3-samples',
  phase: 3,
  async run({ page, origin, viewports, screenshot }) {
    await page.setViewportSize(viewports.desktop);
    await page.goto(`${origin}/?view=list`, { waitUntil: 'load' });
    await expectSample(page, SAMPLES[0]); // tasks is the default
    const group = page.getByRole('radiogroup', { name: 'Samples' });
    if ((await group.getByRole('radio').count()) !== 3) throw new Error(`expected 3 samples, got ${await group.getByRole('radio').count()}`);

    for (const sample of SAMPLES) {
      await group.getByText(sample.label, { exact: true }).click();
      await expectSample(page, sample);
      const on = await checked(page);
      if (on.length !== 1 || on[0] !== sample.label) throw new Error(`selected samples: ${on}`);
      if (new URL(page.url()).searchParams.get('sample') !== slug(sample.label)) throw new Error(`URL not updated: ${page.url()}`);
      await screenshot(`sample-${slug(sample.label)}`);
    }
    if (!(await page.locator('.lrow[data-op="read_file"]').getAttribute('aria-label')).includes('deprecated')) {
      throw new Error('read_file is not flagged deprecated');
    }

    // ?sample=petstore preselects; an unknown id falls back to the default.
    await page.goto(`${origin}/?sample=petstore&view=list`, { waitUntil: 'load' });
    await expectSample(page, SAMPLES[1]);
    await page.goto(`${origin}/?sample=nope&view=list`, { waitUntil: 'load' });
    await expectSample(page, SAMPLES[0]);

    // Keyboard: the group is one Tab stop after Generate (on the selected sample); arrows move and select.
    await page.locator('.hero .generate').focus();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.value ?? '');
    if (focused !== 'tasks') throw new Error(`Tab from Generate focused "${focused}", expected the selected Tasks API radio`);
    await page.keyboard.press('ArrowRight');
    await expectSample(page, SAMPLES[1]);
    await page.keyboard.press('ArrowRight');
    await expectSample(page, SAMPLES[2]);
    if ((await checked(page))[0] !== 'Filesystem MCP') throw new Error('ArrowRight did not select Filesystem MCP');
    await page.keyboard.press('ArrowRight'); // wraps
    await expectSample(page, SAMPLES[0]);
    await page.keyboard.press('ArrowLeft');
    await expectSample(page, SAMPLES[2]);
    await page.keyboard.press('Tab');
    const after = await page.evaluate(() => document.activeElement?.closest('.samples') ? 'inside' : 'outside');
    if (after !== 'outside') throw new Error('Tab stays inside the samples group (more than one Tab stop)');

    await page.setViewportSize(viewports.mobile);
    await page.goto(`${origin}/?sample=filesystem&view=list`, { waitUntil: 'load' });
    await expectSample(page, SAMPLES[2]);
    await screenshot('sample-filesystem-mobile');
  },
};
