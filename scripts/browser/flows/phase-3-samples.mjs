// Phase 3: three sample chips; each lists its normalised operations; ?sample= preselects;
// chips are keyboard operable (Tab to a chip, Enter or Space selects it).
const SAMPLES = [
  { label: 'Tasks API', heading: 'Tasks API (sample)', count: 22, item: ['POST', '/projects/{projectId}/tasks'] },
  { label: 'Petstore', heading: 'Swagger Petstore (sample)', count: 16, item: ['GET', '/pet/{petId}'] },
  { label: 'Filesystem MCP', heading: 'secure-filesystem-server (sample)', count: 14, item: ['TOOL', 'read_text_file'] },
];
const slug = (label) => label.split(' ')[0].toLowerCase();

async function expectSample(page, { heading, count, item }) {
  await page.getByRole('heading', { level: 1, name: heading }).waitFor();
  const items = await page.getByTestId('sample-list').locator('li').allTextContents();
  if (items.length !== count) throw new Error(`${heading}: expected ${count} operations, got ${items.length}`);
  if (!items.some((text) => text.startsWith(item[0]) && text.includes(item[1]))) {
    throw new Error(`${heading}: missing ${item.join(' ')}`);
  }
}

async function pressedChips(page) {
  return page.locator('.chip[aria-pressed="true"]').allTextContents();
}

export default {
  name: 'phase-3-samples',
  phase: 3,
  async run({ page, origin, viewports, screenshot }) {
    await page.setViewportSize(viewports.desktop);
    await page.goto(`${origin}/`, { waitUntil: 'load' });
    await expectSample(page, SAMPLES[0]); // tasks is the default
    const chips = page.locator('.chip');
    if ((await chips.count()) !== 3) throw new Error(`expected 3 sample chips, got ${await chips.count()}`);

    for (const sample of SAMPLES) {
      await page.getByRole('button', { name: sample.label }).click();
      await expectSample(page, sample);
      const pressed = await pressedChips(page);
      if (pressed.length !== 1 || !pressed[0].includes(sample.label)) throw new Error(`pressed chips: ${pressed}`);
      if (new URL(page.url()).searchParams.get('sample') !== slug(sample.label)) throw new Error(`URL not updated: ${page.url()}`);
      await screenshot(`sample-${slug(sample.label)}`);
    }
    if (!(await page.getByTestId('sample-list').innerText()).includes('deprecated')) {
      throw new Error('read_file is not flagged deprecated');
    }

    // ?sample=petstore preselects; an unknown id falls back to the default.
    await page.goto(`${origin}/?sample=petstore`, { waitUntil: 'load' });
    await expectSample(page, SAMPLES[1]);
    await page.goto(`${origin}/?sample=nope`, { waitUntil: 'load' });
    await expectSample(page, SAMPLES[0]);

    // Keyboard: chips are adjacent tab stops (after the phase-5 header); Enter and Space select.
    await page.locator('.chip').first().focus();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.textContent ?? '');
    if (!focused.includes('Petstore')) throw new Error(`Tab from the first chip focused "${focused}", expected the Petstore chip`);
    await page.keyboard.press('Enter');
    await expectSample(page, SAMPLES[1]);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await expectSample(page, SAMPLES[2]);
    if (!(await pressedChips(page))[0]?.includes('Filesystem MCP')) throw new Error('Space did not press the Filesystem chip');

    await page.setViewportSize(viewports.mobile);
    await page.goto(`${origin}/?sample=filesystem`, { waitUntil: 'load' });
    await expectSample(page, SAMPLES[2]);
    await screenshot('sample-filesystem-mobile');
  },
};
