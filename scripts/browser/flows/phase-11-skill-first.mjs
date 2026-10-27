// Phase 11: the skill pane leads the first view beside the map (D21). Ready times, sample
// switching, tree keyboard model, "In skill" from the operation card (the detail panel until R4), Generate (an empty field), the zip
// download (unzipped and audited in Node, identical bytes when regenerated offline), mobile tabs.
// Since R5 the skill browser (files, preview, audit) sits under the map in one scroll at every width:
// Download .zip is in the frame head, and phones have no Skill tab (the browser follows the list).
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';

const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
const pane = (page) => page.locator('.skill-browser');
const paneReady = (page) => page.locator('.skill-browser[data-ready="true"]').waitFor();
const mapReady = (page) => page.locator('[data-testid="atlas"][data-ready="true"]').waitFor();
// The preview is a region named by the file line above it ("SKILL.md, 42 lines").
const previewOf = (page) => page.locator('#skill-preview').evaluate((el) => document.getElementById(el.getAttribute('aria-labelledby'))?.textContent ?? '');
const focused = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-path') ?? document.activeElement?.id ?? '');
const box = (page, selector) => page.locator(selector).first().boundingBox();

async function noHorizontalScroll(page, label) {
  const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll <= inner, `${label}: horizontal scroll (${scroll} > ${inner})`);
}

/** Clicks Download .zip, unzips the file in Node and runs the skill's own audit and tests. */
async function downloadAndAudit(page, slug, dir) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#result .fhead').getByRole('button', { name: 'Download .zip' }).click()]);
  expect(download.suggestedFilename() === `${slug}-skill.zip`, `download named ${download.suggestedFilename()}`);
  const zip = join(dir, download.suggestedFilename());
  await download.saveAs(zip);
  const bytes = readFileSync(zip);
  await page.locator('#result .fhead').getByRole('button', { name: 'Downloaded' }).waitFor();
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
      // 1. The first view: skill pane and map side by side, both ready fast.
      await page.setViewportSize(viewports.desktop);
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(origin);
      await page.evaluate(() => localStorage.clear());
      await page.goto(origin);
      const at = await page.waitForFunction(() => {
        const p = document.querySelector('.skill-browser[data-ready="true"]');
        const m = document.querySelector('[data-testid="atlas"][data-ready="true"]');
        window.readyAt ??= {};
        if (p && !window.readyAt.pane) window.readyAt.pane = performance.now();
        if (m && !window.readyAt.map) window.readyAt.map = performance.now();
        return p && m && window.readyAt;
      }, null, { polling: 'raf' }).then((h) => h.jsonValue());
      console.log(`  skill pane ready after ${Math.round(at.pane)} ms, map after ${Math.round(at.map)} ms`);
      expect(at.pane < 2000 && at.map < 1500, `ready too late: pane ${at.pane} ms, map ${at.map} ms`);
      // Since R4 the skill browser sits under the map in the result frame (DESIGN.md 4.3), which starts on the first screen.
      const [p, m] = [await box(page, '.skill-browser'), await box(page, '#panel-map')];
      expect(m.y + m.height <= p.y && m.y < 800, `panes overlap or the map starts off screen: ${JSON.stringify({ p, m })}`);
      expect((await page.locator('#skill-title').textContent()) === 'tasks-api/ skill', 'skill browser heading');
      const checks = await pane(page).locator('.sb-audit .checks li').evaluateAll((els) => els.map((el) => [el.dataset.ok, el.textContent.startsWith('Passed: ')]));
      expect(checks.length >= 9 && checks.every(([ok, said]) => ok === 'true' && said), `audit checks: ${JSON.stringify(checks)}`);
      expect((await previewOf(page)).startsWith('SKILL.md, '), 'SKILL.md is not previewed by default');
      await page.evaluate(() => document.fonts.ready);
      await axe('desktop two panes');
      await screenshot('first-view-desktop');
      // A stale skill (sample switched, next one still writing) keeps every text at full contrast.
      await page.locator('.sb-preview').evaluate((el) => el.setAttribute('data-stale', 'true'));
      expect(await page.locator('.sb-preview .code').evaluate((el) => getComputedStyle(el.parentElement).opacity === '1' && getComputedStyle(el).opacity === '1' && getComputedStyle(el).boxShadow.includes('0.5px')), 'stale skill is faded or unframed');
      await axe('stale skill');
      await page.locator('.sb-preview').evaluate((el) => el.removeAttribute('data-stale'));
      await page.locator('.sb-audit').scrollIntoViewIfNeeded(); // under the map since R4
      await screenshot('audit-checklist', { clip: await box(page, '.sb-audit') });
      if (cvd) {
        for (const type of ['protanopia', 'deuteranopia', 'tritanopia']) {
          await cvd(type);
          await screenshot(`first-view-${type}`);
        }
        await cvd(null);
      }

      // 2. Each sample (the hero's Samples control since R2) updates the skill and the map.
      for (const [id, slug] of [['petstore', 'petstore-api'], ['filesystem', 'filesystem-mcp'], ['tasks', 'tasks-api']]) {
        await page.locator(`[data-sample="${id}"]`).click();
        await page.getByRole('heading', { level: 3, name: `${slug}/ skill` }).waitFor();
        await paneReady(page);
        await mapReady(page);
        expect((await page.getByTestId('atlas').getAttribute('aria-label')).includes(id === 'filesystem' ? 'tools' : 'operations'), `${id}: map not updated`);
      }

      await page.mouse.move(5, 5); // no sample hover in the screenshots below
      await page.waitForTimeout(200);

      // 3. Tree keyboard model: arrows to references/, Right opens it, Down to tasks.md, Enter shows it.
      await page.locator('[role="treeitem"][data-path="SKILL.md"]').focus();
      for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown');
      expect((await focused(page)) === 'references/', `ArrowDown x2 focused ${await focused(page)}`);
      await page.keyboard.press('ArrowRight');
      expect((await page.locator('[data-path="references/"]').getAttribute('aria-expanded')) === 'true', 'ArrowRight did not open references/');
      for (let i = 0; i < 12 && (await focused(page)) !== 'references/tasks.md'; i++) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      expect((await previewOf(page)).startsWith('references/tasks.md, '), `Enter showed ${await previewOf(page)}`);
      await screenshot('skill-references-file');
      await page.keyboard.press('Home');
      expect((await focused(page)) === 'SKILL.md', 'Home did not focus the first item');
      await page.keyboard.press('Enter');

      // 4. "In skill" in the pinned operation card selects the operation's reference page.
      await page.locator('.op[data-op="getTask"]').focus();
      await page.keyboard.press('Enter');
      const link = page.getByRole('button', { name: 'Show references/tasks.md in the skill' });
      expect((await link.textContent()) === 'references/tasks.md', `In the skill: ${await link.textContent()}`);
      await screenshot('op-card-in-the-skill');
      await link.click();
      expect((await previewOf(page)).startsWith('references/tasks.md, '), 'In the skill did not select the file');
      expect((await page.locator('[data-path="references/tasks.md"]').getAttribute('aria-selected')) === 'true', 'tree selection');

      // 5. Generate with an empty field writes it again, announces the audit and focuses the pane heading.
      await page.getByRole('button', { name: 'Generate', exact: true }).click();
      await page.getByTestId('announcer').filter({ hasText: /Skill written: audit passed, (\d+) of \1 checks\./ }).waitFor();
      expect((await focused(page)) === 'skill-title', `Generate skill focused ${await focused(page)}`);

      // 6. Download, unzip, audit; then again offline, byte for byte.
      const first = await downloadAndAudit(page, 'tasks-api', dir);
      await screenshot('download-done');
      const icon = await (await page.request.get(`${origin}/favicon.svg`)).body();
      await page.route('**/favicon.svg', (route) => route.fulfill({ body: icon, contentType: 'image/svg+xml' }));
      await context.setOffline(true);
      await page.locator('[data-sample="petstore"]').click();
      await page.getByRole('heading', { level: 3, name: 'petstore-api/ skill' }).waitFor();
      await paneReady(page);
      await downloadAndAudit(page, 'petstore-api', dir);
      await page.locator('[data-sample="tasks"]').click();
      await page.getByRole('heading', { level: 3, name: 'tasks-api/ skill' }).waitFor();
      await page.getByRole('button', { name: 'Generate', exact: true }).click();
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

      // 8. Mobile (R5): one scroll, no Skill tab; Map | List with List first, then the skill browser;
      // Generate focuses the files heading in place.
      await page.setViewportSize(viewports.mobile);
      await page.goto(origin);
      await paneReady(page);
      const tabs = page.getByRole('tablist', { name: 'View' }).getByRole('tab');
      expect((await tabs.allTextContents()).join('|') === 'Map|List', `tabs: ${await tabs.allTextContents()}`);
      expect((await page.locator('#tab-list').getAttribute('aria-selected')) === 'true', 'List tab not selected by default on phones');
      expect((await page.locator('#tab-skill').count()) === 0, 'the Skill tab is back');
      const [l, sb] = [await box(page, '[data-testid="list-view"]'), await box(page, '.skill-browser')];
      expect(l.y + l.height <= sb.y, 'the skill browser is not under the list');
      await noHorizontalScroll(page, '390 px');
      await axe('mobile single scroll');
      await screenshot('first-view-mobile');
      await page.locator('#tab-list').focus();
      await page.keyboard.press('ArrowLeft');
      expect((await focused(page)) === 'tab-map', 'ArrowLeft did not move to the Map tab');
      await mapReady(page);
      expect(await pane(page).isVisible(), 'skill browser hidden on the Map tab');
      await axe('mobile map tab');
      await screenshot('first-view-mobile-map');
      await page.getByRole('button', { name: 'Generate', exact: true }).click();
      await paneReady(page);
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
