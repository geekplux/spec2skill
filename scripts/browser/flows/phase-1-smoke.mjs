// Phase 1: the built-in Petstore sample renders (no network beyond the app). Since phase 3 the
// default sample is Tasks, so this regression flow selects Petstore through ?sample=petstore
// (since phase 12 the operations are read from the list view, ?view=list; its rows since R5).
export default {
  name: 'phase-1-smoke',
  phase: 1,
  async run({ page, origin, viewports, screenshot }) {
    for (const [label, size] of Object.entries(viewports)) {
      await page.setViewportSize(size);
      await page.goto(`${origin}/?sample=petstore&view=list`, { waitUntil: 'load' });
      const list = page.getByTestId('list-view');
      await list.waitFor({ state: 'attached' });
      // Since redesign R2 the h1 is the hero's headline; the result title is the frame's h2 (R5: "Sample" is a tag).
      const heading = (await page.locator('#result-title').textContent())?.trim();
      if (heading !== 'Swagger Petstore') throw new Error(`unexpected heading: ${heading}`);
      if (!(await page.locator('.meta .tag', { hasText: 'Sample' }).isVisible())) throw new Error('no Sample tag');
      const items = await list.locator('.lrow').allTextContents();
      if (!items.some((text) => text.includes('GET') && text.includes('/pet/{petId}'))) {
        throw new Error('GET /pet/{petId} is missing from the sample list');
      }
      if (items.some((text) => text.includes('/store'))) throw new Error('sample list contains /store operations');
      await screenshot(`landing-${label}`);
    }
  },
};
