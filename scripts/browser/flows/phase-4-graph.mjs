// Phase 4: the sample page lists the inferred clusters and edge counts as plain text (since
// phase 12 in the list view: a group per cluster and a summary line; since R5 the groups follow the
// map's column order and the summary is for screen readers).
const EXPECTED = {
  tasks: { clusters: ['Projects', 'Members', 'Labels', 'Tasks', 'Comments'], hub: 'Error on 20 operations' },
  petstore: { clusters: ['Pet', 'User'] },
  filesystem: { clusters: ['Directory', 'File'] }, // Directory feeds File: column order
};

async function expectGraph(page, id) {
  const summary = page.getByTestId('list-view');
  await summary.waitFor();
  const names = await summary.locator('.lgroup .lname').allTextContents();
  if (names.join() !== EXPECTED[id].clusters.join()) throw new Error(`${id}: clusters ${names.join()}`);
  const text = await summary.locator('.list-summary').textContent();
  if (!/\d+ relationships shown: \d+ feeds, \d+ sub-path, \d+ shared schema\./.test(text)) {
    throw new Error(`${id}: edge counts missing in "${text}"`);
  }
  if (EXPECTED[id].hub && !text.includes(EXPECTED[id].hub)) throw new Error(`${id}: hub badge text missing`);
}

export default {
  name: 'phase-4-graph',
  phase: 4,
  async run({ page, origin, viewports, screenshot }) {
    await page.setViewportSize(viewports.desktop);
    for (const id of Object.keys(EXPECTED)) {
      await page.goto(`${origin}/?sample=${id}&view=list`, { waitUntil: 'load' });
      await expectGraph(page, id);
    }
    await page.goto(`${origin}/?sample=tasks&view=list`, { waitUntil: 'load' });
    await expectGraph(page, 'tasks');
    await screenshot('graph-text-tasks');
  },
};
