// The calm-layout audit (phase 18, docs/DESIGN.md "Calm polish audit"): visits every view once per
// viewport and saves `<view>-<width>.png`, so a `before` and an `after` run compare pair by pair.
// Run by `pnpm check:browser -- --phase 18 --audit --viewports 1440x900,390x844 --label <name>`.
// It only drives the UI with stable names (roles, ids, test ids), so it runs on the UI before and
// after the polish. Offline: the fake spec host and /api/* are fulfilled here from fixtures.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOST = 'https://specs.example.test';
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
const EMPTY = 'openapi: 3.1.0\ninfo: {title: Quiet API, version: "1"}\npaths: {}\n';
const WARNED = `openapi: 3.0.3
info: {title: Shelf API, version: "1"}
paths:
  /shelves:
    get:
      responses: {"200": {description: ok, content: {application/json: {schema: {$ref: "https://elsewhere.example.test/shelf.json#/Shelf"}}}}}
  /shelves/{shelfId}:
    get:
      parameters: [{name: shelfId, in: path, required: true, schema: {type: string}}]
      responses: {"200": {description: ok}}
`;
// Untagged, so the AI fixture below may rename its clusters (as in the phase 17 flow).
const ok = { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, folderId: { type: 'string' } } } } } } };
const idParam = (name) => ({ name, in: 'path', required: true, schema: { type: 'string' } });
const NOTES = {
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
const describe = (summary) => ({
  clusters: summary.clusters.map((c) => ({ id: c.id, name: NAMES[c.id] ?? `${c.name} Area`, description: `Everything about ${c.name.toLowerCase()} in one place` })),
  prose: { summary: 'Keeps field notes in folders for a coding agent', idea: 'Every note lives in a folder: take folderId from listFolders, then read or file notes with it. Never guess an id.' },
  cached: false, model: '@cf/test/fixture-model',
});
const blocked = JSON.stringify({ error: { code: 'blocked-host', message: 'Private address.' } });

/** Every audited view, in order (docs/DESIGN.md "Calm polish audit" has one row per view). */
export const VIEWS = [
  'first-view', 'skill-file', 'audit-expanded', 'options', 'download-done', 'map-focus', 'detail', 'search', 'list-filter',
  'shortcut-help', 'first-view-dark', 'loading', 'error', 'empty-spec', 'warnings', 'ai-labels',
];

export default {
  name: 'calm-audit',
  // The error view fails a request on purpose; Chrome logs it.
  allowConsole: [/^Failed to load resource: (the server responded with a status of \d{3}|net::ERR_(ACCESS_DENIED|ABORTED|FAILED))/],
  async run({ page, origin, viewport, screenshot, axe, cvd }) {
    const { width } = viewport;
    const wide = width >= 1024;
    let ai = false;
    let hold;
    await page.route(`${HOST}/**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/hang.yaml') return new Promise((done) => (hold = done));
      if (path === '/notes.json') return route.fulfill({ body: JSON.stringify(NOTES), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
      return route.abort('accessdenied');
    });
    await page.route('http://10.0.0.8/**', (route) => route.abort('accessdenied'));
    await page.route(`${origin}/api/**`, (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/api/health') return route.fulfill({ json: ai ? { ok: true, ai: true, model: '@cf/test/fixture-model' } : { ok: true, ai: false } });
      if (pathname === '/api/ai/describe') return route.fulfill({ json: describe(JSON.parse(route.request().postData()).summary) });
      return route.fulfill({ status: 403, body: blocked, headers: { 'content-type': 'application/json' } });
    });

    const shot = async (view) => {
      expect(VIEWS.includes(view) || view.startsWith('first-view-'), `unknown audit view ${view}`);
      await page.mouse.move(1, 1);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      await screenshot(`${view}-${width}`);
      await axe(`${view} ${width}`);
    };
    const ready = async () => {
      await page.locator('.skill-pane[data-ready="true"]').waitFor({ state: 'attached' });
      await page.locator('[data-testid="atlas"][data-ready="true"]').waitFor({ state: 'attached' });
    };
    const openSample = async () => {
      await page.goto(`${origin}/?sample=tasks`);
      await ready();
    };
    const tab = async (id) => !wide && page.locator(`#tab-${id}`).click();
    const view = (id) => page.locator(`#tab-${id}`).click();
    const field = page.locator('#source-field');
    const submit = async (value) => {
      await field.fill(value);
      await field.press('Enter');
    };
    /** Opens the native disclosure `selector` if it is closed. */
    const disclose = async (selector) => {
      const details = page.locator(selector).first();
      if (!(await details.evaluate((d) => d.open))) await details.locator(':scope > summary').click();
      await details.scrollIntoViewIfNeeded();
    };

    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.goto(origin);
    await page.evaluate(() => localStorage.clear());
    await openSample();

    // The skill: first view, another file, the audit rows, the options, a finished download.
    await shot('first-view');
    if (cvd && wide) {
      for (const type of ['protanopia', 'deuteranopia', 'tritanopia']) {
        await cvd(type);
        await screenshot(`first-view-${type}-${width}`);
      }
      await cvd(null);
    }
    await page.locator('[role="treeitem"][data-path="references/"]').click();
    await page.locator('[role="treeitem"][data-path="references/tasks.md"]').click();
    await page.locator('#skill-preview').scrollIntoViewIfNeeded();
    await shot('skill-file');
    await page.locator('[role="treeitem"][data-path="SKILL.md"]').click();
    await disclose('.audit');
    await shot('audit-expanded');
    await page.locator('.audit > summary').click(); // as the user found it: close what was opened
    await disclose('.options');
    await shot('options');
    await page.locator('.options > summary').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .zip' }).click()]);
    expect(download.suggestedFilename() === 'tasks-api-skill.zip', `download ${download.suggestedFilename()}`);
    await shot('download-done');

    // The map: a focused node and its edges, its details, search results, the list with a filter.
    await tab('map');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.hit[data-op="getTask"]').focus();
    await page.waitForTimeout(300); // the camera follows focus
    await shot('map-focus');
    await page.keyboard.press('Enter');
    await page.getByTestId('detail').waitFor();
    await shot('detail');
    await page.keyboard.press('Escape');
    await page.getByTestId('detail').waitFor({ state: 'detached' });
    await page.locator('#search-q').fill('member');
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot('search');
    await page.locator('#search-q').fill('');
    await view('list');
    await disclose('.filters');
    await page.locator('.filters label', { hasText: /^\s*DELETE$/ }).locator('input').uncheck();
    await shot('list-filter');
    await page.getByRole('button', { name: 'Show all' }).click();
    await page.locator('.filters > summary').click();
    await view('map');
    await page.locator('main').focus();
    await page.keyboard.press('?');
    await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor();
    await shot('shortcut-help');
    await page.keyboard.press('Escape');

    // The dark theme of the first view (following the system, nothing stored).
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await openSample();
    await shot('first-view-dark');
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await openSample();

    // The user's own source: loading, an error (blocked host), an empty spec, a spec with warnings.
    await submit(`${HOST}/hang.yaml`);
    await page.getByTestId('loading').waitFor();
    await shot('loading');
    await page.getByRole('button', { name: 'Cancel' }).click();
    hold?.();
    await submit('http://10.0.0.8/openapi.json');
    await page.locator('.source-status.error[data-code="blocked-host"]').waitFor();
    await shot('error');
    await page.getByRole('button', { name: 'Try a sample' }).click();
    await ready();
    await submit(EMPTY);
    await page.getByTestId('empty-chart').waitFor({ state: 'attached' });
    await shot('empty-spec');
    await submit(WARNED);
    await page.locator('.title h1', { hasText: 'Shelf API' }).waitFor();
    await ready();
    await disclose('.warnings');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot('warnings');

    // AI provenance labels (phase 17): a fresh page, so the client asks /api/health again, now with AI.
    ai = true;
    await openSample();
    await submit(`${HOST}/notes.json`);
    await page.getByTestId('names-provenance').filter({ hasText: 'AI-drafted' }).waitFor({ state: 'attached' });
    await tab('skill');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot('ai-labels');
    ai = false;
  },
};
