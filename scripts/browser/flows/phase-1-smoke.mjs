// Phase 1: the landing page renders the built-in Petstore sample (no network beyond the app).
export default {
  name: 'phase-1-smoke',
  phase: 1,
  async run({ page, origin, viewports, screenshot }) {
    for (const [label, size] of Object.entries(viewports)) {
      await page.setViewportSize(size);
      await page.goto(`${origin}/`, { waitUntil: 'load' });
      const list = page.getByTestId('sample-list');
      await list.waitFor();
      const heading = (await page.getByRole('heading', { level: 1 }).textContent())?.trim();
      if (heading !== 'Swagger Petstore (sample)') throw new Error(`unexpected heading: ${heading}`);
      const items = await list.locator('li').allTextContents();
      if (!items.some((text) => text.startsWith('GET') && text.includes('/pet/{petId}'))) {
        throw new Error('GET /pet/{petId} is missing from the sample list');
      }
      if (items.some((text) => text.includes('/store'))) throw new Error('sample list contains /store operations');
      await screenshot(`landing-${label}`);
    }
  },
};
