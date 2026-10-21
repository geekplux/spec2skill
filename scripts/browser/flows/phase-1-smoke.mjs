// Phase 1: the built-in Petstore sample renders (no network beyond the app). Since phase 3 the
// default sample is Tasks, so this regression flow selects Petstore through ?sample=petstore.
export default {
  name: 'phase-1-smoke',
  phase: 1,
  async run({ page, origin, viewports, screenshot }) {
    for (const [label, size] of Object.entries(viewports)) {
      await page.setViewportSize(size);
      await page.goto(`${origin}/?sample=petstore`, { waitUntil: 'load' });
      const list = page.getByTestId('sample-list');
      await list.waitFor({ state: 'attached' });
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
