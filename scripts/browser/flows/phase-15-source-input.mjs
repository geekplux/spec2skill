// Phase 15 (updated in redesign R2): the user's own source in the hero's field. Paste a URL (direct
// fetch, then the /api/fetch-spec proxy; MCP via /api/mcp/tools, and any URL that is not a spec tried as
// an MCP server), paste text, open a file, drop a file; loading steps with Cancel; every error state with
// its two recovery actions; ?url= and back; Generate with an empty field; the empty spec, warnings and a
// 1000-operation paste; the hero's focus order against its visual order. Offline: the fake hosts
// and /api/* are fulfilled here by page.route from fixtures, so nothing leaves the machine.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sample = (name) => readFileSync(join(ROOT, 'samples', name), 'utf8');
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

const HOST = 'https://specs.example.test';
const NOTES_30 = {
  openapi: '3.0.3',
  info: { title: 'Notes API', version: '1.0.0' },
  servers: [{ url: 'https://notes.example.test/v1' }],
  paths: {
    '/notes': {
      get: { operationId: 'listNotes', tags: ['notes'], summary: 'List notes', responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Note' } } } } } } },
      post: { operationId: 'createNote', tags: ['notes'], summary: 'Create a note', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Note' } } } }, responses: { 201: { description: 'made', content: { 'application/json': { schema: { $ref: '#/components/schemas/Note' } } } } } },
    },
    '/notes/{noteId}': {
      parameters: [{ name: 'noteId', in: 'path', required: true, schema: { type: 'string' } }],
      get: { operationId: 'getNote', tags: ['notes'], summary: 'Get a note', responses: { 200: { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Note' } } } } } },
      delete: { operationId: 'deleteNote', tags: ['notes'], summary: 'Delete a note', responses: { 204: { description: 'gone' } } },
    },
  },
  components: { schemas: { Note: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } } } } },
};
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
const EMPTY = 'openapi: 3.1.0\ninfo: {title: Quiet API, version: "1"}\npaths: {}\n';
const filesystem = JSON.parse(sample('mcp-filesystem.tools-list.json'));
const TOOLS = { ...filesystem, protocolVersion: '2025-06-18', serverInfo: { name: 'secure-filesystem-server', version: '2.0.0' }, truncated: false };

/** Direct answers from the fake host (with CORS); a missing path fails like a CORS refusal. */
const DIRECT = {
  '/tasks.yaml': { body: sample('tasks-openapi31.yaml'), type: 'application/yaml' },
  '/notes.json': { body: JSON.stringify(NOTES_30), type: 'application/json' },
  '/missing.json': { status: 404, body: 'not here', type: 'text/plain' },
  '/docs': { body: '<!doctype html><title>API docs</title>', type: 'text/html' },
  '/server': { body: '<!doctype html><title>An MCP server</title>', type: 'text/html' }, // an MCP endpoint that answers GET with a page
};
/** What the proxy answers for a URL: [status, body, headers]. */
const err = (status, code, message) => [status, JSON.stringify({ error: { code, message } }), { 'content-type': 'application/json' }];
const PROXY = {
  [`${HOST}/petstore.json`]: [200, sample('petstore-swagger2.json'), { 'content-type': 'text/plain', 'x-spec-content-type': 'application/json', 'x-spec-url': `${HOST}/petstore.json` }],
  'http://10.0.0.8/openapi.json': err(403, 'blocked-host', 'Private address.'),
  [`${HOST}/slow.json`]: err(504, 'timeout', 'The server took too long to answer.'),
  [`${HOST}/huge.json`]: err(413, 'too-large', 'The response is larger than 5 MB.'),
  [`${HOST}/busy.json`]: err(429, 'rate-limited', 'Too many requests; try again in a minute.'),
};
const MCP = {
  'https://tools.example.test/mcp': [200, JSON.stringify(TOOLS), { 'content-type': 'application/json' }],
  'https://locked.example.test/mcp': err(401, 'needs-auth', 'The MCP server answered 401: it needs credentials.'),
  'https://old.example.test/sse': err(502, 'legacy-transport', 'The server does not speak Streamable HTTP.'),
  [`${HOST}/server`]: [200, JSON.stringify(TOOLS), { 'content-type': 'application/json' }],
};

export default {
  name: 'phase-15-source-input',
  phase: 15,
  // The error states fail requests on purpose; Chrome logs each one. Off-origin requests are still refused by the check.
  allowConsole: [/^Failed to load resource: (the server responded with a status of \d{3}|net::ERR_(ACCESS_DENIED|ABORTED|FAILED))/],
  async run({ page, origin, viewports, screenshot, axe }) {
    const api = [];
    let proxyDown = false;
    let hold; // a direct request left hanging until the page aborts it
    await page.route(`${HOST}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/hang.yaml') return new Promise((done) => (hold = { route, done }));
      const hit = DIRECT[path];
      if (!hit) return route.abort('accessdenied'); // as the browser reports a CORS refusal
      return route.fulfill({ status: hit.status ?? 200, body: hit.body, headers: { 'content-type': hit.type, 'access-control-allow-origin': '*' } });
    });
    await page.route('http://10.0.0.8/**', (route) => route.abort('accessdenied'));
    await page.route(`${origin}/api/**`, (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/api/health') return route.fallback(); // phase 17: the check's default answer, ai: false
      const target = JSON.parse(route.request().postData() ?? '{}').url;
      api.push(`${pathname} ${target}`);
      if (proxyDown) return route.fulfill({ status: 404, body: '<!doctype html><p>Not found</p>', headers: { 'content-type': 'text/html' } });
      const [status, body, headers] = (pathname === '/api/mcp/tools' ? MCP : PROXY)[target] ?? err(502, 'http-error', 'The server answered 404.');
      return route.fulfill({ status, body, headers });
    });

    const field = page.locator('#source-field');
    const title = page.locator('#result-title'); // R5: the API title alone; a Sample tag marks the samples
    const frame = page.locator('#result');
    const ready = async () => {
      await page.locator('.skill-browser[data-ready="true"]').waitFor();
      // Phones open on the List (R5); elsewhere the map.
      await page.locator('[data-testid="atlas"][data-ready="true"], [data-testid="list-view"]').first().waitFor({ state: 'attached' });
    };
    const auditPassed = async (label) => {
      const text = await page.locator('.sb-audit .verdict').textContent();
      expect(text.includes('Audit passed'), `${label}: audit says "${text}"`);
    };
    const submit = async (value) => {
      await field.fill(value);
      await field.press('Enter');
    };
    /** Loads `value` and waits for the new title, the skill (audit passed) and the map. */
    const loadOk = async (value, heading, label) => {
      await submit(value);
      // The load ends (R6: the Generate button names its stages until then); the title may already be
      // the same as before (tasks.yaml over the Tasks API sample).
      await page.locator('.generate[data-stage]').waitFor({ state: 'detached', timeout: 15_000 });
      await title.filter({ hasText: new RegExp(`^${heading}$`) }).waitFor();
      await ready();
      await auditPassed(label);
      expect((await page.locator('.meta .tag', { hasText: 'Sample' }).count()) === 0, `${label}: still says sample`);
    };
    const openSample = async (id = 'tasks') => {
      await page.goto(`${origin}/?sample=${id}`);
      await ready();
    };
    const zipHash = async () => {
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .zip' }).click()]);
      return createHash('sha256').update(readFileSync(await download.path())).digest('hex');
    };
    const tree = () => page.locator('[role="treeitem"]').evaluateAll((items) => items.map((i) => i.getAttribute('data-path') ?? i.textContent));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await openSample();

    // The hero's focus order equals its visual order at 1440, 1024 and 390: the field, Open file,
    // Generate, then the samples (one Tab stop; arrows move inside it).
    const heroOrder = async (label) => {
      await page.locator('#source-field').focus();
      await page.keyboard.press('Shift+Tab');
      const seen = [];
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        const at = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el?.closest('.hero')) return null;
          const shown = el.classList.contains('visually-hidden') ? el.parentElement : el;
          const b = shown.getBoundingClientRect();
          return { name: el.id || el.getAttribute('aria-label') || el.textContent.trim() || el.value || el.tagName, top: b.top, bottom: b.bottom, left: b.left };
        });
        if (!at) break;
        seen.push(at);
      }
      for (let i = 1; i < seen.length; i++) {
        const [a, b] = [seen[i - 1], seen[i]];
        const sameRow = b.top < a.bottom - 2 && a.top < b.bottom - 2;
        expect(sameRow ? b.left > a.left : b.top >= a.bottom - 2, `${label}: focus goes ${a.name} -> ${b.name}, against the visual order`);
      }
      console.log(`  ${label}: ${seen.map((s) => s.name).join(' > ')}`);
      return seen.map((s) => s.name);
    };
    for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]]) {
      await page.setViewportSize({ width, height });
      const order = await heroOrder(`hero ${width}`);
      expect(order.join(' > ') === 'source-field > Open a spec file > Generate > tasks', `hero ${width}: ${order}`);
      const box = await page.locator('.hero').boundingBox();
      await screenshot(`hero-${width}`, { clip: { x: 0, y: 0, width, height: box.y + box.height } });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    // The kind of source is detected: no selector, no More options (D37).
    expect((await page.locator('select').count()) === 0 && (await page.getByRole('button', { name: 'More options' }).count()) === 0, 'a source selector or More options is still there');

    // The multi-line field explains Enter/Shift+Enter to assistive tech, and the shortcut help lists them.
    expect((await field.getAttribute('aria-describedby')) === 'source-hint', 'field not described by #source-hint');
    expect((await page.locator('#source-hint').textContent()) === 'Enter loads. Shift+Enter adds a new line. You can also drop a spec file here.', 'source hint text');
    await page.locator('main').focus();
    await page.keyboard.press('?');
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await help.waitFor();
    const sourceRows = await help.locator('table', { has: page.locator('caption', { hasText: 'Source field' }) }).textContent();
    expect(sourceRows.includes('Enter') && sourceRows.includes('Shift + Enter') && /new line/.test(sourceRows), `help lacks the source field keys: ${sourceRows}`);
    await page.keyboard.press('Escape');
    await help.waitFor({ state: 'hidden' });

    // OpenAPI 3.1 YAML (direct), 3.0 JSON (direct), Swagger 2 JSON (proxy), MCP (proxy only).
    await loadOk(`${HOST}/tasks.yaml`, 'Tasks API', 'tasks.yaml');
    expect(new URL(page.url()).searchParams.get('url') === `${HOST}/tasks.yaml`, `?url= written: ${page.url()}`);
    expect(api.length === 0, `direct fetch used the proxy: ${api}`);
    expect((await page.locator('input[name="sample"]:checked').count()) === 0, 'a sample stays selected once a source is loaded');
    await page.mouse.move(5, 5);
    await screenshot('skill-from-url');
    await page.goBack();
    await title.filter({ hasText: /^Tasks API$/ }).waitFor();
    await page.goForward();
    await title.filter({ hasText: /^Tasks API$/ }).waitFor();
    await loadOk(`${HOST}/notes.json`, 'Notes API', 'notes.json (OpenAPI 3.0)');
    await loadOk(`${HOST}/petstore.json`, 'Swagger Petstore', 'petstore via proxy');
    expect(api.at(-1) === `/api/fetch-spec ${HOST}/petstore.json`, `petstore via the proxy: ${api}`);
    await loadOk('https://tools.example.test/mcp', 'secure-filesystem-server', 'MCP');
    expect(api.at(-1) === '/api/mcp/tools https://tools.example.test/mcp', `MCP via /api/mcp/tools: ${api}`);
    expect(!api.some((a) => a.startsWith('/api/fetch-spec https://tools')), 'MCP URL never fetched as a spec');
    await screenshot('skill-from-mcp');

    // ?url= opens straight to that skill and map; back returns to the sample before it.
    await openSample('petstore');
    await page.goto(`${origin}/?url=${encodeURIComponent(`${HOST}/tasks.yaml`)}`);
    await title.filter({ hasText: /^Tasks API$/ }).waitFor();
    await ready();
    await page.goBack();
    await title.filter({ hasText: /^Swagger Petstore$/ }).waitFor();

    // Loading steps announced, Cancel aborts the request and restores the previous skill and map.
    await openSample('tasks');
    const aborted = page.waitForEvent('requestfailed', (r) => r.url() === `${HOST}/hang.yaml`);
    await submit(`${HOST}/hang.yaml`);
    await page.getByTestId('loading').waitFor();
    await page.getByTestId('announcer').filter({ hasText: 'Fetching spec (specs.example.test)' }).waitFor();
    expect((await frame.getAttribute('aria-busy')) === null, 'aria-busy is on the content, not on the frame (the steps and Cancel stay live)');
    expect((await page.locator('#result > .stage-content').getAttribute('aria-busy')) === 'true', 'content is busy while loading');
    expect((await frame.getAttribute('data-status')) === 'loading', 'the result frame says loading');
    // Generate with an empty field while loading does not rewrite the previous skill; the load goes on.
    const generate = page.locator('.hero .generate');
    await field.fill('');
    await generate.click();
    expect((await page.getByTestId('loading').count()) === 1 && (await page.locator('.skill-browser[data-ready="true"]').count()) === 1, 'empty Generate while loading changed the state');
    await page.mouse.move(5, 5);
    await screenshot('paste-url-loading');
    await axe('loading state');
    await page.getByRole('button', { name: 'Cancel' }).click();
    const failed = await aborted;
    expect(/ABORTED/i.test(failed.failure()?.errorText ?? ''), `hanging fetch was not aborted: ${failed.failure()?.errorText}`);
    hold?.done();
    expect((await page.getByTestId('loading').count()) === 0, 'loading state stays after Cancel');
    expect((await title.textContent()) === 'Tasks API' && (await page.locator('.meta .tag', { hasText: 'Sample' }).count()) === 1, 'Cancel keeps the previous skill and map');
    expect(await page.evaluate(() => document.activeElement?.id === 'source-field'), 'Cancel returns focus to the field');
    await page.getByTestId('announcer').filter({ hasText: 'Cancelled.' }).waitFor();

    // Every error state, with its title; focus on the title; both recovery actions.
    const errors = [
      ['ftp://specs.example.test/x', 'invalid-url', 'not a web address'],
      ['http://10.0.0.8/openapi.json', 'blocked-host', 'can only fetch public URLs', 'error-blocked-host'],
      [`${HOST}/slow.json`, 'timeout', 'took too long'],
      [`${HOST}/huge.json`, 'too-large', 'too large'],
      [`${HOST}/missing.json`, 'http-error', 'answered with an error'],
      [`${HOST}/busy.json`, 'rate-limited', 'Too many requests'],
      [`${HOST}/docs`, 'html-page', 'documentation page'],
      ['{ "not": json', 'not-a-spec', 'not JSON or YAML'],
      ['{"hello": 1, "world": 2}', 'unsupported', 'not an OpenAPI, Swagger or MCP', 'error-not-a-spec'],
      ['https://locked.example.test/mcp', 'needs-auth', 'needs credentials', 'error-needs-auth'],
      ['https://old.example.test/sse', 'legacy-transport', 'older HTTP+SSE'],
    ];
    for (const [value, code, words, shot] of errors) {
      await submit(value);
      const panel = page.locator(`.source-status.error[data-code="${code}"]`);
      await panel.waitFor();
      const heading = await panel.locator('h2').textContent();
      expect(heading.includes(words), `${code}: title "${heading}"`);
      expect(await page.evaluate(() => document.activeElement?.id === 'status-title'), `${code}: focus not on the error title`);
      for (const name of ['Paste spec text instead', 'Try a sample']) expect(await panel.getByRole('button', { name }).isVisible(), `${code}: no "${name}"`);
      if (shot) {
        await page.mouse.move(5, 5);
        await screenshot(shot);
      }
    }
    await axe('error state');
    // The error state (R5): it replaces the frame's body (the previous result is kept, not shown, until
    // a recovery action); the title at least the result title's size; Generate ready.
    expect((await frame.getAttribute('data-status')) === 'error', 'the result frame says error');
    expect(await page.locator('#result > .stage-content').evaluate((el) => getComputedStyle(el).display === 'none' && el.childElementCount > 0), 'the previous result shows under the error');
    const sizes = await page.evaluate(() => [document.querySelector('#status-title'), document.querySelector('#result-title')].map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(sizes[0] >= sizes[1], `error title ${sizes[0]}px is smaller than the result title ${sizes[1]}px`);
    expect(await generate.isEnabled(), 'Generate enabled under an error');
    proxyDown = true;
    await submit(`${HOST}/petstore.json`);
    await page.locator('.source-status.error[data-code="proxy-unavailable"]').filter({ hasText: 'pnpm dev:worker' }).waitFor();
    proxyDown = false;
    await page.getByRole('button', { name: 'Paste spec text instead' }).click();
    expect(await page.evaluate(() => document.activeElement?.id === 'source-field'), '"Paste spec text instead" focuses the field');
    await submit(`${HOST}/docs`);
    await page.getByRole('button', { name: 'Try a sample' }).click();
    await title.filter({ hasText: /^Tasks API$/ }).waitFor();
    await ready();
    expect((await page.locator('.source-status').count()) === 0, '"Try a sample" clears the error');
    await page.waitForFunction(() => document.activeElement?.id === 'result', null, { timeout: 2000 }).catch(() => {});
    expect(await page.evaluate(() => document.activeElement?.id === 'result'), `"Try a sample" left focus on ${await page.evaluate(() => document.activeElement?.tagName)}`);
    // No selector (D37): a URL that is a page or a 404 is tried as an MCP server too; when that fails,
    // the spec's own error is shown; an MCP server that answers GET with a page loads directly.
    const tries = api.length;
    await submit(`${HOST}/docs`);
    await page.locator('.source-status.error[data-code="html-page"]').waitFor();
    expect(api.slice(tries).join() === `/api/mcp/tools ${HOST}/docs`, `the docs page was not tried as MCP: ${api.slice(tries)}`);
    expect((await page.getByRole('button', { name: /MCP server/ }).count()) === 0, 'an error still offers a source-kind choice');
    await submit(`${HOST}/server`);
    await title.filter({ hasText: /^secure-filesystem-server$/ }).waitFor();
    await ready();
    expect(await page.evaluate(() => document.activeElement?.id === 'source-field'), `MCP load left focus on ${await page.evaluate(() => document.activeElement?.tagName)}`);

    // Generate with an empty field writes the current skill again and brings its heading into focus.
    await openSample('tasks');
    await field.fill('');
    await generate.click();
    await page.waitForFunction(() => document.activeElement?.id === 'skill-title');
    await ready();
    await auditPassed('empty Generate');

    // Pasted text and opened files give the built-in sample's skill, with no /api request.
    const tmp = mkdtempSync(join(tmpdir(), 'spec2skill-p15-'));
    try {
      for (const [id, file, heading] of [['tasks', 'tasks-openapi31.yaml', 'Tasks API'], ['petstore', 'petstore-swagger2.json', 'Swagger Petstore'], ['filesystem', 'mcp-filesystem.tools-list.json', 'MCP server']]) {
        await openSample(id);
        const [want, wantTree] = [await zipHash(), await tree()];
        const before = api.length;
        await loadOk(sample(file), heading, `${id} pasted`);
        const [gotPaste, pasteTree] = [await zipHash(), await tree()];
        await openSample(id);
        const open = page.getByRole('button', { name: 'Open a spec file' });
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
        await chooser.setFiles(join(ROOT, 'samples', file));
        await title.filter({ hasText: new RegExp(`^${heading}$`) }).waitFor();
        await ready();
        const at = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName);
        expect(at === 'Open a spec file', `${id}: after picking a file focus is on ${at}, not Open file`);
        const gotFile = await zipHash();
        // Drag and drop onto the field loads the same file.
        await openSample(id === 'tasks' ? 'petstore' : 'tasks');
        await page.locator('.source-field').evaluate((el, [name, text]) => {
          const data = new DataTransfer();
          data.items.add(new File([text], name, { type: 'application/json' }));
          for (const type of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }));
        }, [file, sample(file)]);
        await title.filter({ hasText: new RegExp(`^${heading}$`) }).waitFor();
        await ready();
        expect((await page.locator('.source-field[data-drop]').count()) === 0, `${id}: the drop state stays on`);
        const gotDrop = await zipHash();
        expect(api.length === before, `${id}: text/file made /api requests`);
        // The MCP recording has no serverInfo (that comes from initialize), so its name and slug differ: same files.
        if (id === 'filesystem') expect(JSON.stringify(pasteTree) === JSON.stringify(wantTree) && gotPaste === gotFile && gotFile === gotDrop, `${id}: tree differs`);
        else expect(gotPaste === want && gotFile === want && gotDrop === want, `${id}: pasted/opened/dropped zip differs from the sample's`);
      }

      // The empty spec, a spec with warnings, and the 1000-operation paste.
      await submit(EMPTY);
      await page.getByTestId('empty-chart').waitFor();
      await page.getByTestId('announcer').filter({ hasText: 'Quiet API: no operations. This spec has no paths, so there is no skill to write.' }).waitFor();
      expect(await page.getByText('No operations, so no skill to write').isVisible(), 'empty skill browser');
      // Nothing of the previous skill stays: no files, preview or audit (D61).
      expect((await page.locator('#skill-preview, .sb-preview, .sb-audit, .skill-browser [role="tree"]').count()) === 0, 'the empty spec shows the previous skill');
      expect(await page.getByRole('button', { name: 'Download .zip' }).isDisabled(), 'Download enabled for an empty spec');
      await screenshot('empty-spec');
      await submit(WARNED);
      await title.filter({ hasText: 'Shelf API' }).waitFor();
      await ready();
      await page.locator('.meta .tag-btn', { hasText: /^\d+ warnings?$/ }).click();
      expect(/external/i.test(await page.locator('ul.warnings:not([hidden])').textContent()), 'warnings list');
      await screenshot('warnings-list');
      const big = join(tmp, 'synthetic.json');
      writeFileSync(big, execFileSync(process.execPath, [join(ROOT, 'scripts', 'gen-synthetic-spec.mjs')], { maxBuffer: 16 * 1024 * 1024 }));
      const started = Date.now();
      await field.fill(readFileSync(big, 'utf8'));
      await field.press('Enter');
      await title.filter({ hasText: 'Synthetic' }).waitFor();
      await ready();
      console.log(`  1000-operation paste interactive in ${Date.now() - started} ms`);
      expect((await page.locator('.op.more').count()) > 0, 'large spec cards do not cap their rows ("N more")');
      await page.mouse.move(5, 5);
      await screenshot('collapsed-clusters');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }

    // Phones and the dark theme.
    await page.setViewportSize(viewports.mobile);
    await openSample();
    await loadOk(`${HOST}/tasks.yaml`, 'Tasks API', 'mobile');
    await screenshot('source-mobile');
    // The error state at 390 px: the help command wraps (no scroll region) and axe is clean.
    proxyDown = true;
    await submit(`${HOST}/petstore.json`);
    await page.locator('.source-status.error[data-code="proxy-unavailable"]').waitFor();
    proxyDown = false;
    const scrolls = await page.locator('.command').evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(!scrolls, 'the command scrolls sideways at 390 px');
    await page.mouse.move(5, 5);
    await screenshot('error-mobile');
    await axe('error state 390');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await submit('http://10.0.0.8/openapi.json');
    await page.locator('.source-status.error[data-code="blocked-host"]').waitFor();
    await page.mouse.move(5, 5);
    await screenshot('error-dark');
    await axe('error dark');
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  },
};
