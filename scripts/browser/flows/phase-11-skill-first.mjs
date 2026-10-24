// Phase 11: the skill pane leads the first view beside the map (D21). Ready times (P3), sample
// switching, tree keyboard model, "In the skill" from the detail panel, Generate skill, the zip
// download (unzipped and audited in Node, identical bytes when regenerated offline, O1), mobile tabs.
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';

const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
const pane = (page) => page.locator('.skill-pane');
const paneReady = (page) => page.locator('.skill-pane[data-ready="true"]').waitFor();
const mapReady = (page) => page.locator('[data-testid="atlas"][data-ready="true"]').waitFor();
// The preview is a region named by the file line above it ("SKILL.md 42 lines").
const previewOf = (page) => page.locator('#skill-preview').evaluate((el) => document.getElementById(el.getAttribute('aria-labelledby'))?.textContent ?? '');
const focused = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-path') ?? document.activeElement?.id ?? '');
const box = (page, selector) => page.locator(selector).first().boundingBox();

async function noHorizontalScroll(page, label) {
  const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll <= inner, `${label}: horizontal scroll (${scroll} > ${inner})`);
}

/** Clicks Download .zip, unzips the file in Node and runs the skill's own audit and tests. */
async function downloadAndAudit(page, slug, dir) {
  const [download] = await Promise.all([page.waitForEvent('download'), pane(page).getByRole('button', { name: 'Download .zip' }).click()]);
  expect(download.suggestedFilename() === `${slug}-skill.zip`, `download named ${download.suggestedFilename()}`);
  const zip = join(dir, download.suggestedFilename());
  await download.saveAs(zip);
  const bytes = readFileSync(zip);
  await pane(page).locator('.copied', { hasText: 'Downloaded' }).waitFor();
  await page.getByTestId('announcer').filter({ hasText: `Downloaded ${slug}-skill.zip.` }).waitFor();
  const out = mkdtempSync(join(dir, 'unzipped-'));
  const files = unzipSync(bytes);
  for (const [name, data] of Object.entries(files)) {
    expect(name.startsWith(`${slug}/`) && !name.includes('..'), `unsafe zip entry ${name}`);
    mkdirSync(dirname(join(out, name)), { recursive: true });
    writeFileSync(join(out, name), data);
  }
  const root = join(out, slug);
  const audit = execFileSync(process.execPath, ['scripts/audit.mjs', '.'], { cwd: root, encoding: 'utf8' }).trim().split('\n').at(-1);
  expect(audit === 'audit passed', `downloaded ${slug}: audit printed "${audit}"`);
  execSync('node --test scripts/*.test.mjs', { cwd: root, stdio: 'ignore' });
  console.log(`  ${download.suggestedFilename()}: ${Object.keys(files).length} entries, audit passed, tests passed`);
  return bytes;
}

export default {
  name: 'phase-11-skill-first',
  phase: 11,
  async run({ page, context, origin, viewports, screenshot, axe, cvd }) {
    const dir = mkdtempSync(join(tmpdir(), 'spec2skill-download-'));
    try {
      // 1. The first view: skill pane and map side by side, both ready fast (AC1, AC6).
      await page.setViewportSize(viewports.desktop);
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(origin);
      await page.evaluate(() => localStorage.clear());
      await page.goto(origin);
      const at = await page.waitForFunction(() => {
        const p = document.querySelector('.skill-pane[data-ready="true"]');
        const m = document.querySelector('[data-testid="atlas"][data-ready="true"]');
        window.readyAt ??= {};
        if (p && !window.readyAt.pane) window.readyAt.pane = performance.now();
        if (m && !window.readyAt.map) window.readyAt.map = performance.now();
        return p && m && window.readyAt;
      }, null, { polling: 'raf' }).then((h) => h.jsonValue());
      console.log(`  skill pane ready after ${Math.round(at.pane)} ms, map after ${Math.round(at.map)} ms`);
      expect(at.pane < 2000 && at.map < 1500, `ready too late: pane ${at.pane} ms, map ${at.map} ms`);
      const [p, m] = [await box(page, '.skill-pane'), await box(page, '.map')];
      expect(p.x + p.width <= m.x && p.y < 800 && m.y < 800, `panes overlap or are off screen: ${JSON.stringify({ p, m })}`);
      expect((await pane(page).getByRole('heading', { level: 2 }).textContent()) === 'tasks-api skill', 'pane heading');
      const checks = await pane(page).locator('.audit li .status').allTextContents();
      expect(checks.length >= 9 && checks.every((c) => c === 'passed'), `audit checks: ${checks}`);
      expect((await previewOf(page)).startsWith('SKILL.md '), 'SKILL.md is not previewed by default');
      await page.evaluate(() => document.fonts.ready);
      await axe('desktop two panes');
      await screenshot('first-view-desktop');
      // A stale skill (sample switched, next one still writing) keeps every text at full contrast.
      await page.locator('.skill-body').evaluate((el) => el.setAttribute('data-stale', 'true'));
      expect(await page.locator('.skill-body').evaluate((el) => getComputedStyle(el).opacity === '1' && getComputedStyle(el).boxShadow.includes('0.5px')), 'stale skill is faded or unframed');
      await axe('stale skill');
      await page.locator('.skill-body').evaluate((el) => el.removeAttribute('data-stale'));
      await screenshot('audit-checklist', { clip: await box(page, '.audit') });
      if (cvd) {
        for (const type of ['protanopia', 'deuteranopia', 'tritanopia']) {
          await cvd(type);
          await screenshot(`first-view-${type}`);
        }
        await cvd(null);
      }

      // 2. Each sample chip updates the skill and the map (AC2).
      for (const [id, slug] of [['petstore', 'petstore-api'], ['filesystem', 'filesystem-mcp'], ['tasks', 'tasks-api']]) {
        await page.locator(`[data-sample="${id}"]`).click();
        await page.getByRole('heading', { level: 2, name: `${slug} skill` }).waitFor();
        await paneReady(page);
        await mapReady(page);
        expect((await page.getByTestId('atlas').getAttribute('aria-label')).includes(id === 'filesystem' ? 'tools' : 'operations'), `${id}: map not updated`);
      }

      await page.mouse.move(5, 5); // no chip hover in the screenshots below
      await page.waitForTimeout(200);

      // 3. Tree keyboard model: arrows to references/, Right opens it, Down to tasks.md, Enter shows it.
      await page.locator('[role="treeitem"][data-path="SKILL.md"]').focus();
      for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown');
      expect((await focused(page)) === 'references/', `ArrowDown x2 focused ${await focused(page)}`);
      await page.keyboard.press('ArrowRight');
      expect((await page.locator('[data-path="references/"]').getAttribute('aria-expanded')) === 'true', 'ArrowRight did not open references/');
      for (let i = 0; i < 12 && (await focused(page)) !== 'references/tasks.md'; i++) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      expect((await previewOf(page)).startsWith('references/tasks.md '), `Enter showed ${await previewOf(page)}`);
      await screenshot('skill-references-file');
      await page.keyboard.press('Home');
      expect((await focused(page)) === 'SKILL.md', 'Home did not focus the first item');
      await page.keyboard.press('Enter');

      // 4. "In the skill" in the detail panel selects the operation's reference page.
      await page.locator('.hit[data-op="getTask"]').focus();
      await page.keyboard.press('Enter');
      const link = page.getByRole('button', { name: 'Show references/tasks.md in the skill' });
      expect((await link.textContent()) === 'references/tasks.md', `In the skill: ${await link.textContent()}`);
      await screenshot('detail-in-the-skill');
      await link.click();
      expect((await previewOf(page)).startsWith('references/tasks.md '), 'In the skill did not select the file');
      expect((await page.locator('[data-path="references/tasks.md"]').getAttribute('aria-selected')) === 'true', 'tree selection');

      // 5. Generate skill writes it again, announces the audit and focuses the pane heading.
      await page.getByRole('button', { name: 'Generate skill' }).click();
      await page.getByTestId('announcer').filter({ hasText: /Skill written: audit passed, (\d+) of \1 checks\./ }).waitFor();
      expect((await focused(page)) === 'skill-title', `Generate skill focused ${await focused(page)}`);

      // 6. Download, unzip, audit; then again offline, byte for byte (AC3, AC4).
      const first = await downloadAndAudit(page, 'tasks-api', dir);
      await screenshot('download-done');
      const icon = await (await page.request.get(`${origin}/favicon.svg`)).body();
      await page.route('**/favicon.svg', (route) => route.fulfill({ body: icon, contentType: 'image/svg+xml' }));
      await context.setOffline(true);
      await page.locator('[data-sample="petstore"]').click();
      await page.getByRole('heading', { level: 2, name: 'petstore-api skill' }).waitFor();
      await paneReady(page);
      await downloadAndAudit(page, 'petstore-api', dir);
      await page.locator('[data-sample="tasks"]').click();
      await page.getByRole('heading', { level: 2, name: 'tasks-api skill' }).waitFor();
      await page.getByRole('button', { name: 'Generate skill' }).click();
      await paneReady(page);
      expect(Buffer.compare(first, await downloadAndAudit(page, 'tasks-api', dir)) === 0, 'zip bytes differ between generations');
      await context.setOffline(false);
      await page.unroute('**/favicon.svg');

      // 7. Dark theme.
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(origin);
      await paneReady(page);
      await mapReady(page);
      await page.evaluate(() => document.fonts.ready);
      await axe('dark desktop');
      await screenshot('first-view-dark');
      await page.emulateMedia({ colorScheme: 'light' });

      // 8. Mobile: Skill tab first; arrows move to Map and List (AC1, AC7, A9).
      await page.setViewportSize(viewports.mobile);
      await page.goto(origin);
      await paneReady(page);
      const tabs = page.getByRole('tablist', { name: 'View' }).getByRole('tab');
      expect((await tabs.allTextContents()).join('|') === 'Skill|Map|List', `tabs: ${await tabs.allTextContents()}`);
      expect((await page.locator('#tab-skill').getAttribute('aria-selected')) === 'true', 'Skill tab not selected by default');
      await noHorizontalScroll(page, '390 px skill');
      await axe('mobile skill tab');
      await screenshot('first-view-mobile-skill');
      await page.locator('#tab-skill').focus();
      await page.keyboard.press('ArrowRight');
      expect((await focused(page)) === 'tab-map', 'ArrowRight did not move to the Map tab');
      await mapReady(page);
      expect(await pane(page).isHidden(), 'skill pane still shown on the Map tab');
      await axe('mobile map tab');
      await screenshot('first-view-mobile-map');
      await page.keyboard.press('ArrowRight');
      await page.getByTestId('list-view').waitFor();
      expect((await page.getByTestId('atlas').count()) === 0, 'List tab still shows the map');
      await axe('mobile list tab');
      await page.keyboard.press('Home');
      await paneReady(page);
      expect(await pane(page).isVisible(), 'Home did not return to the Skill tab');
      await page.locator('#tab-map').click();
      await page.getByRole('button', { name: 'Generate skill' }).click();
      await paneReady(page);
      expect((await page.locator('#tab-skill').getAttribute('aria-selected')) === 'true', 'Generate skill did not select the Skill tab');
      expect((await focused(page)) === 'skill-title', `mobile Generate skill focused ${await focused(page)}`);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
      await page.goto(origin);
      await paneReady(page);
      await noHorizontalScroll(page, '200 % zoom');
      await cdp.send('Emulation.clearDeviceMetricsOverride');
      await cdp.detach();
      await page.setViewportSize(viewports.desktop);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};
