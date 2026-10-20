// Phase 4: the sample page lists the inferred clusters and edge counts as plain text.
const EXPECTED = {
  tasks: { clusters: ['Comments', 'Labels', 'Projects', 'Members', 'Tasks'], hub: 'Error on 20 operations' },
  petstore: { clusters: ['Pet', 'User'] },
  filesystem: { clusters: ['File', 'Directory'] },
};

async function expectGraph(page, id) {
  const summary = page.getByTestId('graph-summary');
  await summary.getByRole('heading', { level: 2, name: 'Clusters and relationships' }).waitFor();
  const names = await summary.locator('li strong').allTextContents();
  if (names.join() !== EXPECTED[id].clusters.join()) throw new Error(`${id}: clusters ${names.join()}`);
  const text = await summary.innerText();
  if (!/\d+ feeds edges \(\d+ inferred\), \d+ sub-path edges, \d+ shared-schema edges\./.test(text)) {
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
      await page.goto(`${origin}/?sample=${id}`, { waitUntil: 'load' });
      await expectGraph(page, id);
    }
    await page.goto(`${origin}/?sample=tasks`, { waitUntil: 'load' });
    await expectGraph(page, 'tasks');
    await screenshot('graph-text-tasks');
  },
};
