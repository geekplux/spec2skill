// Phase 17: lean AI. Samples never ask; a user-loaded spec asks /api/ai/describe once, after its
// deterministic skill and map are on screen; the answer swaps in cluster names and skill prose (the
// audit still passes, also on the downloaded zip in Node); slug changes, the "Use deterministic text"
// toggle and a reload make no further call (localStorage); with ai: false everything stays deterministic.
// Offline: the spec host, /api/health and /api/ai/describe are fulfilled here from fixtures (no real AI).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';

const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
const HOST = 'https://specs.example.test';
const MODEL = '@cf/test/fixture-model';
const ok = { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, folderId: { type: 'string' } } } } } } };
const idParam = (name) => ({ name, in: 'path', required: true, schema: { type: 'string' } });
// No tags, so the clusters are named from path segments and the AI may rename them.
const SPEC = {
  openapi: '3.0.3',
  info: { title: 'Field Notes API', version: '1.0.0' },
  servers: [{ url: 'https://notes.example.test/v1' }],
  paths: {
    '/folders': { get: { operationId: 'listFolders', summary: 'List folders', responses: ok } },
    '/folders/{folderId}': { get: { operationId: 'getFolder', summary: 'Get a folder', parameters: [idParam('folderId')], responses: ok } },
    '/notes': { get: { operationId: 'listNotes', summary: 'List notes', responses: ok }, post: { operationId: 'createNote', summary: 'Create a note', responses: ok } },
    '/notes/{noteId}': { get: { operationId: 'getNote', summary: 'Get a note', parameters: [idParam('noteId')], responses: ok } },
  },
};
const NAMES = { 'cluster-folders': 'Notebooks', 'cluster-notes': 'Jotted Notes' };
const IDEA = 'Every note lives in a folder: take folderId from listFolders, then read or file notes with it. Never guess an id.';
/** The fixture answer for the summary the app sent (its own cluster ids, so the answer is valid). */
const answer = (summary) => ({
  clusters: summary.clusters.map((c) => ({ id: c.id, name: NAMES[c.id] ?? `${c.name} Area`, description: `Everything about ${c.name.toLowerCase()} in one place` })),
  prose: { summary: 'Keeps field notes in folders for a coding agent', idea: IDEA },
  cached: false, model: MODEL,
});

export default {
  name: 'phase-17-lean-ai',
  phase: 17,
  async run({ page, origin, viewports, screenshot, axe }) {
    const api = [];
    let aiOn = true;
    let release;
    let held = new Promise((done) => (release = done));
    await page.route(`${HOST}/**`, (route) => route.fulfill({ body: JSON.stringify(SPEC), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } }));
    await page.route(`${origin}/api/**`, async (route) => {
      const { pathname } = new URL(route.request().url());
      api.push(pathname);
      if (pathname === '/api/health') return route.fulfill({ json: aiOn ? { ok: true, ai: true, model: MODEL } : { ok: true, ai: false } });
      if (pathname !== '/api/ai/describe') return route.fulfill({ status: 404, json: { error: { code: 'bad-request', message: 'Unknown API route.' } } });
      await held;
      return route.fulfill({ json: answer(JSON.parse(route.request().postData()).summary) });
    });
    const describes = () => api.filter((p) => p.startsWith('/api/ai/')).length;
    const ready = async () => {
      await page.locator('.skill-browser[data-ready="true"]').waitFor();
      await page.locator('[data-testid="atlas"][data-ready="true"]').waitFor();
    };
    const names = page.getByTestId('names-provenance');
    // Since R5 the frame head tags AI-drafted prose ("AI-drafted prose"); deterministic prose has no tag.
    const prose = page.getByTestId('prose-ai');
    const deterministicProse = async () => (await prose.count()) === 0;
    const labels = async () => (await page.locator('.rc-name').allTextContents()).toSorted();
    // The map credits AI-drafted names only (since R4); deterministic names carry no credit line.
    const deterministicNames = async () => (await names.count()) === 0;
    // One element per line since R5 (line numbers are generated content): join them back into the file.
    const preview = () => page.locator('#skill-preview .l').evaluateAll((ls) => `${ls.map((l) => l.textContent).join('\n')}\n`);
    const auditPassed = async (label) => {
      const text = await page.locator('.sb-audit .verdict').textContent();
      expect(text.includes('Audit passed'), `${label}: audit says "${text}"`);
    };

    // AC2: every built-in sample, zero /api requests of any kind.
    await page.setViewportSize(viewports.desktop);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(origin);
    await page.evaluate(() => localStorage.clear());
    for (const chip of await page.locator('.samples .seg-item').all()) {
      await chip.click();
      await ready();
      expect(await deterministicNames(), `sample: ${await names.textContent().catch(() => '')}`);
    }
    await page.waitForTimeout(300);
    expect(api.length === 0, `samples made /api requests: ${api}`);

    // AC3: a URL spec shows its deterministic skill and map while the one describe call is held.
    await page.locator('#source-field').fill(`${HOST}/notes.json`);
    await page.locator('#source-field').press('Enter');
    await page.locator('#result-title', { hasText: /^Field Notes API$/ }).waitFor();
    await ready();
    for (let i = 0; i < 50 && describes() === 0; i++) await page.waitForTimeout(100);
    expect(describes() === 1, `describe calls while held: ${describes()} (${api})`);
    expect((await deterministicProse()) && (await deterministicNames()), 'deterministic labels before the answer');
    expect((await labels()).join() === 'Folders,Notes', `deterministic cluster labels: ${await labels()}`);
    await auditPassed('deterministic');
    const before = await page.locator('[data-testid="atlas"] .rc').evaluateAll((els) => els.map((el) => el.getAttribute('style')));

    // The answer swaps in names and prose in place: same layout, audit re-run and announced once.
    release();
    await names.filter({ hasText: 'Names: AI-drafted' }).waitFor();
    await prose.filter({ hasText: 'AI-drafted prose' }).waitFor();
    await page.getByTestId('announcer').filter({ hasText: /^Skill updated with AI-drafted names and prose: audit passed, \d+ of \d+ checks\.$/ }).waitFor();
    expect((await labels()).join() === 'Jotted Notes,Notebooks', `AI cluster labels: ${await labels()}`);
    const after = await page.locator('[data-testid="atlas"] .rc').evaluateAll((els) => els.map((el) => el.getAttribute('style')));
    expect(JSON.stringify(before) === JSON.stringify(after), `layout moved: ${before} -> ${after}`);
    const md = await preview();
    expect(md.includes('  prose: ai\n') && md.includes(IDEA.slice(0, 40)) && md.includes('Keeps field notes in folders'), 'SKILL.md carries the AI prose and metadata.prose: ai');
    await auditPassed('AI prose');
    await screenshot('ai-names-on');
    await page.locator('.skill-browser').evaluate((el) => el.scrollIntoView({ block: 'start' })); // under the map since R5
    await screenshot('skill-pane-ai-prose', { clip: await page.locator('.skill-browser').boundingBox() });
    await axe('AI names and prose');

    // AC5: the downloaded zip with AI prose passes its own audit in Node.
    const dir = mkdtempSync(join(tmpdir(), 'spec2skill-ai-'));
    try {
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .zip' }).click()]);
      const zip = join(dir, 'skill.zip');
      await download.saveAs(zip);
      const files = unzipSync(readFileSync(zip));
      for (const [name, data] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, name)), { recursive: true });
        writeFileSync(join(dir, name), data);
      }
      const slug = download.suggestedFilename().replace(/-skill\.zip$/, '');
      const out = execFileSync(process.execPath, ['scripts/audit.mjs', '.'], { cwd: join(dir, slug), encoding: 'utf8' }).trim().split('\n').at(-1);
      expect(out === 'audit passed', `AI-prose zip audit printed "${out}"`);
      console.log(`  ${download.suggestedFilename()} with AI prose: audit passed`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    // Slug changes and the "Use deterministic text" toggle regenerate without another call.
    await page.getByRole('button', { name: 'Edit name and licence' }).click();
    await page.locator('#opt-slug').fill('field-notes');
    await page.locator('#skill-title', { hasText: 'field-notes/' }).waitFor();
    await ready();
    const toggle = page.getByRole('checkbox', { name: /Use deterministic text/ });
    await toggle.check();
    await names.waitFor({ state: 'detached' });
    await prose.waitFor({ state: 'detached' });
    expect((await labels()).join() === 'Folders,Notes', `toggle: labels ${await labels()}`);
    expect((await preview()).includes('  prose: deterministic\n'), 'toggle: SKILL.md says prose: deterministic');
    // The downloaded zip follows the toggle: deterministic prose while it is on, AI prose again after.
    const zippedSkillMd = async () => {
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.fhead-actions .btn.primary').click()]); // may still say Downloaded
      const files = unzipSync(readFileSync(await download.path()));
      return Buffer.from(files['field-notes/SKILL.md']).toString('utf8');
    };
    const plainMd = await zippedSkillMd();
    expect(plainMd.includes('  prose: deterministic\n') && !plainMd.includes(IDEA.slice(0, 40)), 'toggle on: the zip still carries AI prose');
    await toggle.uncheck();
    await names.filter({ hasText: 'Names: AI-drafted' }).waitFor();
    await prose.filter({ hasText: 'AI-drafted prose' }).waitFor();
    await page.locator('.skill-browser[data-ready="true"]').waitFor();
    const aiMd = await zippedSkillMd();
    expect(aiMd.includes('  prose: ai\n') && aiMd.includes(IDEA.slice(0, 40)), 'toggle off: the zip lost the AI prose');
    console.log('  zip follows "Use deterministic text": prose: deterministic, then prose: ai');
    expect(describes() === 1, `slug/toggle made more describe calls: ${describes()}`);

    // A reload answers from localStorage: zero new describe calls.
    await page.reload();
    await ready();
    await names.filter({ hasText: 'Names: AI-drafted' }).waitFor();
    expect(describes() === 1, `reload made describe calls: ${describes()}`);

    // AC1: no AI (health says ai: false, as without the binding): deterministic, nothing asked.
    aiOn = false;
    held = Promise.resolve();
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await ready();
    await page.waitForTimeout(500);
    expect((await deterministicNames()) && (await deterministicProse()), 'ai: false keeps deterministic labels');
    expect(describes() === 1, `ai: false still asked: ${describes()}`);
    expect(!(await page.getByRole('checkbox', { name: /Use deterministic text/ }).count()), 'no toggle without AI text');
    await auditPassed('no AI');
    await screenshot('ai-names-deterministic');
    await axe('deterministic names');
  },
};
