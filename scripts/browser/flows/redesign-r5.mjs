// Redesign R5 (docs/redesign/PLAN.md): the result frame's head, the workflow caption, the skill
// browser, the list view and the phone single scroll (V2Home, V2Phone). Checks the head (title 20/600,
// the meta line and its numbers, tags, Install command then Download .zip, the old head, Install and
// Options disclosures gone), Copied and Downloaded for 2 s, the downloaded zip unzipped and audited,
// the caption under the map (absent without a chain), the skill browser (rule, 202 / 492 / 202,
// 28 px file rows, folders, "Edit name and licence", the preview's code box, keyboard scroll and copy,
// the audit always open), "In skill" opening the file, the pinned card clear of the skill browser for
// every row, the list view, 900 px (files and preview over the audit), the phone scroll at 390 (a rule,
// not a frame; Download first; List by default; the compact chain; 44 px file rows opening a full-width
// preview; the audit row), the command line box not breaking words at 390, and axe on the docked
// card, warnings, the phone preview and 320 px. DESIGN.md section 8 on home, list and phone (with the
// grid's skill browser columns) runs in redesign-acceptance (R7). Saves WebP shots in docs/screenshots/redesign-r5/.
//   pnpm build && pnpm check:browser -- --phase 21 --flow redesign-r5 --capture redesign-r5
/* oxlint-disable unicorn/consistent-function-scoping -- page.evaluate callbacks are serialised: their helpers stay inside */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { settled } from '../redesign-checks.mjs';
import { ROOT } from '../session.mjs';

const OUT = join(ROOT, 'docs', 'screenshots', 'redesign-r5');
const COMMANDS = 'mkdir -p .claude/skills && unzip tasks-api-skill.zip -d .claude/skills/ && node .claude/skills/tasks-api/scripts/audit.mjs .claude/skills/tasks-api';
// One operation (no workflow) whose response points outside the document (a warning).
const SINGLE = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Ping API', version: '1' },
  paths: { '/ping': { get: { operationId: 'ping', responses: { 200: { description: 'ok', content: { 'application/json': { schema: { $ref: 'https://elsewhere.example.test/pong.json#/Pong' } } } } } } } },
});

const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
const close = (a, b, tolerance = 0.6) => Math.abs(a - b) <= tolerance;
const frames = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const said = async (page) => (await frames(page), page.getByTestId('announcer').textContent());

async function ready(page, url) {
  if (url) await page.goto(url, { waitUntil: 'load' });
  await page.locator('.skill-browser[data-ready="true"]').waitFor();
  await page.locator('[data-testid="atlas"][data-ready="true"], [data-testid="list-view"]').first().waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
}

/** Lets running transitions (Download .zip enabling as the skill lands) and the load sequence (R6) finish before measuring. */
const settle = (page) => settled(page);

/** A WebP (quality 0.82) encoded by the browser from a PNG screenshot; `options` go to page.screenshot. */
async function webp(page, name, dir, options = {}) {
  const png = (await page.screenshot(options)).toString('base64');
  const data = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: img.naturalWidth, height: img.naturalHeight });
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/webp', 0.82).split(',')[1];
  }, png);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.webp`);
  writeFileSync(path, Buffer.from(data, 'base64'));
  console.log(`  screenshot ${path.slice(ROOT.length + 1)}`);
}

/** The result frame in page coordinates, for a full-page clip. */
const frameClip = (page) => page.evaluate(() => {
  const b = document.querySelector('#result').getBoundingClientRect();
  return { x: Math.max(0, b.left - 24), y: b.top + window.scrollY - 24, width: Math.min(window.innerWidth, b.width + 48), height: b.height + 48 };
});

/** Runs in the page: the head, caption and skill browser as computed styles, with the tokens to compare against. */
function measure() {
  const probe = document.createElement('i');
  document.body.append(probe);
  const token = (name) => ((probe.style.color = `var(${name})`), getComputedStyle(probe).color);
  const t = Object.fromEntries(['--gray-2', '--gray-3', '--gray-6', '--gray-11', '--gray-12', '--indigo-9', '--indigo-11', '--amber-11', '--destructive'].map((n) => [n, token(n)]));
  probe.remove();
  const q = (sel) => document.querySelector(sel);
  const s = (el) => getComputedStyle(el);
  const box = (el) => el.getBoundingClientRect();
  const title = q('#result-title');
  const meta = q('.fhead .meta');
  const parts = [...meta.children].map(box);
  const gaps = parts.slice(1).map((b, i) => (Math.abs(b.top - parts[i].top) < 2 ? Math.round(b.left - parts[i].right) : null)).filter((g) => g !== null);
  const browser = q('.skill-browser');
  const cols = ['.sb-files', '.sb-preview', '.sb-audit'].map((sel) => q(sel) && box(q(sel)));
  const rows = [...document.querySelectorAll('.skill-browser [role="treeitem"]')];
  const selected = q('.skill-browser [role="treeitem"][aria-selected="true"]');
  const folder = rows.find((r) => r.hasAttribute('aria-expanded'));
  const code = q('#skill-preview');
  const verdict = q('.sb-audit .i-verdict');
  const checks = [...document.querySelectorAll('#audit-checks li')];
  const map = q('#panel-map');
  const caption = q('[data-testid="workflow-caption"]');
  return {
    t,
    title: { tag: title.tagName, size: s(title).fontSize, weight: s(title).fontWeight, text: title.textContent },
    meta: { size: s(meta).fontSize, color: s(meta).color, text: meta.textContent, numbers: [...meta.querySelectorAll('b')].map((b) => [s(b).color, s(b).fontWeight]), gaps },
    buttons: [...document.querySelectorAll('.fhead-actions .btn')].map((b) => ({ text: b.textContent, h: box(b).height, bg: s(b).backgroundColor, title: b.title })),
    caption: caption && { gap: box(caption).top - box(map).bottom, text: caption.textContent, stops: [...caption.querySelectorAll('.stop')].map((n) => n.textContent), ids: [...caption.querySelectorAll('.chain .mono')].map((n) => n.textContent), via: [...caption.querySelectorAll('.via')].map((n) => n.textContent) },
    browser: { rule: s(browser).boxShadow, marginTop: s(browser).marginTop, paddingTop: s(browser).paddingTop, top: box(browser).top - (caption ? box(caption).bottom : box(map).bottom), cols: cols.map((c) => c && Math.round(c.width)) },
    head: { text: q('#skill-title').textContent, font: s(q('#skill-title')).fontFamily, size: s(q('#skill-title')).fontSize, weight: s(q('#skill-title')).fontWeight },
    rows: rows.map((r) => Math.round(box(r).height)),
    row: { icon: box(rows[0].querySelector('svg')).width, name: [s(rows[0].querySelector('.n')).fontFamily, s(rows[0].querySelector('.n')).fontSize], selected: s(selected).backgroundColor, radius: s(selected).borderRadius },
    count: folder && [s(folder.querySelector('.count')).fontSize, s(folder.querySelector('.count')).color],
    preview: code && {
      bg: s(code).backgroundColor, radius: s(code).borderRadius, font: [s(code).fontFamily, s(code).fontSize, s(code).lineHeight], maxH: s(code).maxHeight, h: box(code).height,
      scrolls: code.scrollHeight > code.clientHeight, wraps: s(code.querySelector('.l')).whiteSpace, n: [getComputedStyle(code.querySelector('.l'), '::before').content, getComputedStyle(code.querySelector('.l'), '::before').color],
      name: [s(q('.sb-preview .fname')).fontSize, s(q('.sb-preview .fname')).fontWeight, q('.sb-preview .fname').textContent], lines: q('.sb-preview .lines').textContent, count: code.querySelectorAll('.l').length,
    },
    audit: {
      open: !q('#audit-checks').hidden && q('#audit-checks').checkVisibility(), verdict: q('.sb-audit .verdict').textContent, tally: q('.sb-audit .tally').textContent,
      glyph: [box(verdict).width, s(verdict.querySelector('circle')).fill], checks: checks.map((li) => [li.dataset.ok, s(li.querySelector('svg')).color, s(li).fontSize, s(li).boxShadow]),
    },
  };
}

export default {
  name: 'redesign-r5',
  phase: 21,
  async run({ page, context, origin, axe: runAxe, outDir, capture }) {
    // Theme switches start colour transitions: axe reads colours at rest.
    const axe = async (label) => (await settle(page), runAxe(label));
    // Committed shots only with --capture redesign-r5; otherwise into this run's folder.
    const dir = capture ? OUT : outDir;
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    await ready(page, `${origin}/?sample=tasks`);
    await page.mouse.move(0, 0);

    // The frame head (DESIGN.md 4.3): title, meta line, tags, the two buttons; the old head is gone.
    let m = await page.evaluate(measure);
    const { t } = m;
    expect(m.title.tag === 'H2' && m.title.size === '20px' && m.title.weight === '600' && m.title.text === 'Tasks API', `title ${JSON.stringify(m.title)}`);
    expect(m.meta.text === 'OpenAPI 3.1, 22 operations, 5 resources, 78 links, Sample', `meta "${m.meta.text}"`);
    expect(m.meta.size === '14px' && m.meta.color === t['--gray-11'], `meta type ${m.meta.size} ${m.meta.color}`);
    expect(m.meta.numbers.length === 3 && m.meta.numbers.every(([c, w]) => c === t['--gray-12'] && w === '500'), `meta numbers ${JSON.stringify(m.meta.numbers)}`);
    expect(m.meta.gaps.length >= 3 && m.meta.gaps.every((g) => g === 20), `meta gaps ${m.meta.gaps}`);
    expect(m.buttons.map((b) => b.text).join() === 'Install command,Download .zip' && m.buttons.every((b) => b.h === 40), `buttons ${JSON.stringify(m.buttons)}`);
    expect(m.buttons[1].bg === t['--indigo-9'] && m.buttons[0].title === COMMANDS, `Download primary, Install titled: ${JSON.stringify(m.buttons)}`);
    const old = await page.evaluate(() => ({
      gone: document.querySelectorAll('#tab-skill, details.install, details.options, .kicker, .result-head').length,
      text: /\(sample\)|Prose:/.test(document.querySelector('#result').textContent),
    }));
    expect(old.gone === 0 && !old.text, `old head, tabs or disclosures still rendered ${JSON.stringify(old)}`);

    // Install command: copies both commands, says so, shows Copied with a check for 2 s.
    const install = page.locator('.fhead-actions .btn').first();
    await install.click();
    await page.locator('.fhead-actions .btn', { hasText: /^Copied$/ }).waitFor({ timeout: 1500 }); // after the clipboard answers
    expect((await install.textContent()) === 'Copied' && (await install.locator('svg.i-check').count()) === 1, 'Install command: no Copied state');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip === COMMANDS, `Install command: clipboard "${clip}"`);
    expect((await said(page)) === `Install command copied: ${COMMANDS}`, `Install command: announced "${await said(page)}"`);
    await page.waitForTimeout(2300);
    expect((await install.textContent()) === 'Install command', 'Install command: Copied did not return after 2 s');
    // Without the clipboard the commands show under the head to select by hand, with Close.
    await page.evaluate(() => {
      window.realWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
    });
    await install.click();
    const fallback = page.locator('.install-cmds');
    await fallback.waitFor();
    expect((await fallback.locator('code').textContent()) === COMMANDS, 'clipboard fallback: commands');
    await fallback.getByRole('button', { name: 'Close install command' }).click();
    await fallback.waitFor({ state: 'detached' });
    expect(await install.evaluate((el) => el === document.activeElement), 'Close did not return focus to Install command');
    await page.evaluate(() => {
      navigator.clipboard.writeText = window.realWrite;
    });

    // Download .zip, then Downloaded for 2 s; the copied Install command, run as is in a fresh empty
    // folder holding only the zip, installs the skill and prints "audit passed".
    const tmp = mkdtempSync(join(tmpdir(), 'spec2skill-r5-'));
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .zip' }).click()]);
    expect(download.suggestedFilename() === 'tasks-api-skill.zip', `download named ${download.suggestedFilename()}`);
    await download.saveAs(join(tmp, 'tasks-api-skill.zip'));
    expect((await page.locator('.fhead-actions .btn.primary').textContent()) === 'Downloaded', 'Download: no Downloaded state');
    const files = unzipSync(readFileSync(join(tmp, 'tasks-api-skill.zip')));
    expect(Object.keys(files).every((name) => name.startsWith('tasks-api/') && !name.includes('..')), 'unsafe zip entry');
    const audit = execFileSync('/bin/sh', ['-c', clip], { cwd: tmp, encoding: 'utf8' }).trim().split('\n').at(-1);
    expect(audit === 'audit passed', `the copied Install command printed "${audit}"`);
    console.log(`  tasks-api-skill.zip: ${Object.keys(files).length} entries; the copied Install command printed "audit passed"`);
    await page.waitForTimeout(2300);
    expect((await page.locator('.fhead-actions .btn.primary').textContent()) === 'Download .zip', 'Downloaded did not return after 2 s');

    // The workflow caption, 16 under the map: stops, ids and the ids they pass.
    expect(m.caption && close(m.caption.gap, 16, 1), `caption gap ${m.caption?.gap}`);
    expect(m.caption.stops.join() === '1,2,3' && m.caption.ids.join() === 'listProjects,listTasks,getTask' && m.caption.via.join('|') === ', passing id → projectId|, passing id → taskId', `caption ${JSON.stringify(m.caption)}`);
    expect(m.caption.text.startsWith('Strongest workflow'), `caption label: ${m.caption.text}`);

    // The skill browser: a 0.5 px gray-6 rule 40 under the caption, 32 above its contents, 202 / 492 / 202.
    expect(m.browser.rule.includes(t['--gray-6']) && m.browser.rule.includes('0.5px') && m.browser.marginTop === '40px' && m.browser.paddingTop === '32px', `skill browser rule ${JSON.stringify(m.browser)}`);
    expect(close(m.browser.top, 40, 1), `skill browser starts ${m.browser.top} px under the caption`);
    expect(m.browser.cols.join() === '202,492,202', `skill browser columns ${m.browser.cols}`);
    expect(m.head.text === 'tasks-api/ skill' && /Plex Mono/.test(m.head.font) && m.head.size === '14px' && m.head.weight === '600', `files heading ${JSON.stringify(m.head)}`);
    expect(m.rows.every((h) => h === 28), `file rows ${m.rows}`);
    expect(m.row.icon === 14 && /Plex Mono/.test(m.row.name[0]) && m.row.name[1] === '12px' && m.row.selected === t['--gray-3'] && m.row.radius === '6px', `file row ${JSON.stringify(m.row)}`);
    expect(m.count && m.count[0] === '12px' && m.count[1] === t['--gray-11'], `folder count ${m.count}`);
    // The preview: name 14/600, "N lines", the code box gray-2, radius 10, mono 12/20, wraps, at most 392 and scrolls.
    const p = m.preview;
    expect(p.name.join() === '14px,600,SKILL.md' && p.lines === `${p.count} lines`, `preview head ${JSON.stringify(p.name)} ${p.lines}`);
    expect(p.bg === t['--gray-2'] && p.radius === '10px' && /Plex Mono/.test(p.font[0]) && p.font[1] === '12px' && p.font[2] === '20px', `code box ${JSON.stringify(p)}`);
    expect(p.maxH === '392px' && p.h <= 392 && p.scrolls && p.wraps === 'pre-wrap', `code box size ${JSON.stringify(p)}`);
    expect(p.n[0].startsWith('"1"') && p.n[1] === t['--gray-11'], `line numbers ${p.n}`);
    // The audit, always open: a 16 px indigo-9 glyph, "Audit passed", "9 of 9", rows with indigo-11 ticks and gray-6 rules.
    const a = m.audit;
    expect(a.open && a.verdict === 'Audit passed' && a.tally === '9 of 9', `audit ${JSON.stringify(a)}`);
    expect(a.glyph[0] === 16 && a.glyph[1] === t['--indigo-9'], `audit glyph ${a.glyph}`);
    expect(a.checks.length === 9 && a.checks.every(([ok, c, size], i) => ok === 'true' && c === t['--indigo-11'] && size === '12px' && (i === 0 || a.checks[i][3].includes(t['--gray-6']))), `audit rows ${JSON.stringify(a.checks)}`);

    // Folders open and close; a file opens in the preview; the preview scrolls from the keyboard; Copy.
    const refs = page.locator('.skill-browser [role="treeitem"][data-path="references/"]');
    await refs.click();
    expect((await refs.getAttribute('aria-expanded')) === 'true' && (await page.locator('[role="treeitem"][data-path^="references/"][aria-level="2"]').count()) > 0, 'references/ did not open');
    await page.locator('[role="treeitem"][data-path="references/tasks.md"]').click();
    expect((await page.locator('.sb-preview .fname').textContent()) === 'references/tasks.md', 'a file row did not open its file');
    await refs.click();
    expect((await refs.getAttribute('aria-expanded')) === 'false', 'references/ did not close');
    await page.locator('[role="treeitem"][data-path="SKILL.md"]').click();
    const code = page.locator('#skill-preview');
    await code.focus();
    await page.keyboard.press('PageDown');
    // Keyboard scrolling may animate: wait up to 1 s for it to move.
    const moved = await page.waitForFunction(() => document.querySelector('#skill-preview').scrollTop > 0, null, { timeout: 1000 }).then(() => true, () => false);
    expect(moved, 'the preview does not scroll from the keyboard');
    await page.getByRole('button', { name: 'Copy SKILL.md' }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.startsWith('---\nname: tasks-api\n') && !/^\d/.test(copied), 'Copy SKILL.md: the clipboard holds the file without line numbers');
    await page.getByRole('button', { name: 'SKILL.md copied' }).waitFor();

    // Edit name and licence: a toggle that opens the fields; a new name renames the heading and the commands.
    const edit = page.getByRole('button', { name: 'Edit name and licence' });
    expect((await edit.getAttribute('aria-expanded')) === 'false' && (await page.locator('#skill-options').count()) === 0, 'options open by default');
    await edit.click();
    await page.locator('#opt-slug').fill('my-tasks');
    await page.locator('#skill-title', { hasText: 'my-tasks/' }).waitFor();
    expect((await install.getAttribute('title')).includes('my-tasks-skill.zip'), 'install command ignores the new name');
    await page.locator('#opt-slug').fill('tasks-api');
    await page.locator('#skill-title', { hasText: 'tasks-api/' }).waitFor();
    await edit.click();
    await page.locator('.skill-browser[data-ready="true"]').waitFor();

    // In skill: the pinned card's file opens in the preview, which takes focus.
    const getTask = page.locator('.op[data-op="getTask"]');
    await getTask.click();
    const pinned = page.getByTestId('op-card');
    await pinned.waitFor(); await settled(page);
    const inSkill = await pinned.locator('.oc-ref').textContent();
    await pinned.locator('.oc-ref').click();
    await frames(page);
    expect((await page.locator('.sb-preview .fname').textContent()) === inSkill, `In skill opened ${await page.locator('.sb-preview .fname').textContent()}, not ${inSkill}`);
    expect(await page.evaluate(() => document.activeElement?.id === 'skill-preview'), 'In skill did not focus the preview');
    await page.locator('[role="treeitem"][data-path="SKILL.md"]').click();

    // The pinned card never reaches the skill browser (its height is capped above it; it scrolls inside).
    const ids = await page.locator('.op[data-op]').evaluateAll((els) => els.map((el) => el.dataset.op));
    const covered = [];
    await page.mouse.move(0, 0);
    for (const id of ids) {
      // From the keyboard, so no hover preview from the last row stands in the way.
      await page.locator(`.op[data-op="${id}"]`).focus();
      await page.keyboard.press('Enter');
      await pinned.waitFor(); await settled(page);
      const [card, browser] = await page.evaluate(() => [document.querySelector('[data-testid="op-card"]').getBoundingClientRect().bottom, document.querySelector('.skill-browser').getBoundingClientRect().top]);
      if (card > browser) covered.push(`${id} (${Math.round(card - browser)} px)`);
      await page.keyboard.press('Escape');
      await pinned.waitFor({ state: 'detached' });
    }
    expect(covered.length === 0, `pinned card covers the skill browser: ${covered.join(', ')}`);
    console.log(`  pinned card clear of the skill browser for all ${ids.length} rows`);

    // Section 8 at 1440 light and dark: checks 1-4, the grid with the skill browser's columns, axe.
    // (At rest: a fresh load, nothing hovered, focused or opened.)
    await ready(page, `${origin}/?sample=tasks`);
    await page.mouse.move(0, 0);
    await webp(page, 'home-1440-light', dir, { fullPage: true, clip: await frameClip(page) });
    await page.emulateMedia({ colorScheme: 'dark' });
    m = await page.evaluate(measure);
    expect(m.audit.glyph[1] === m.t['--indigo-9'] && m.preview.bg === m.t['--gray-2'], 'dark: audit glyph or code box off token');
    await webp(page, 'home-1440-dark', dir, { fullPage: true, clip: await frameClip(page) });
    await page.emulateMedia({ colorScheme: 'light' });

    // The list view (DESIGN.md 6): the chain heads it; groups in column order; 44 px rows; the docked card.
    await page.getByRole('tab', { name: 'List' }).click();
    await page.getByTestId('list-view').waitFor();
    const list = await page.evaluate(() => {
      const s = (el) => getComputedStyle(el);
      const box = (el) => el.getBoundingClientRect();
      const caption = document.querySelector('[data-testid="workflow-caption"]');
      const row = document.querySelector('.lrow[data-op="getTask"]');
      const del = document.querySelector('.lrow[data-op="deleteTask"]');
      const probe = document.createElement('i');
      document.body.append(probe);
      const token = (n) => ((probe.style.color = `var(${n})`), getComputedStyle(probe).color);
      const tk = { indigo9: token('--indigo-9'), destructive: token('--destructive') };
      probe.remove();
      return {
        captionAbove: caption && box(caption).bottom <= box(document.querySelector('.list')).top, groups: [...document.querySelectorAll('.lname')].map((n) => n.textContent),
        heads: [...document.querySelectorAll('.lhead button')].map((b) => [s(b).fontSize, s(b).fontWeight]),
        rows: [...document.querySelectorAll('.lrow')].map((r) => box(r).height), method: box(row.querySelector('.m')).width, path: row.querySelector('.path').textContent,
        disc: [getComputedStyle(row, '::after').content, getComputedStyle(row, '::after').backgroundColor, tk.indigo9], del: [s(del.querySelector('.m')).color, tk.destructive, !!del.querySelector('svg.warn')],
        relations: row.nextElementSibling?.getAttribute('aria-label'),
      };
    });
    expect(list.captionAbove && list.groups.join() === 'Projects,Members,Labels,Tasks,Comments', `list groups ${JSON.stringify(list)}`);
    expect(list.heads.every(([size, weight]) => size === '14px' && weight === '600'), `group heads ${JSON.stringify(list.heads)}`);
    expect(list.rows.length === 22 && list.rows.every((h) => h >= 44), `list rows ${list.rows}`);
    expect(list.method === 48 && list.path === '/tasks/{taskId}', `list row ${list.method} ${list.path}`);
    expect(list.disc[0] === '"3"' && list.disc[1] === list.disc[2], `stop disc ${list.disc}`);
    expect(list.del[0] === list.del[1] && list.del[2], `destructive row ${list.del}`);
    expect(list.relations === '13 relationships', `getTask relationships ${list.relations}`);
    await webp(page, 'list-1440-light', dir, { fullPage: true, clip: await frameClip(page) });
    await page.locator('.lrow[data-op="getTask"]').click();
    await pinned.waitFor(); await settled(page);
    expect(await pinned.evaluate((el) => el.classList.contains('docked')), 'the list opens the docked card');
    await axe('list docked card 1440 light');
    await page.keyboard.press('Escape');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.emulateMedia({ colorScheme: 'light' });

    // A spec without a workflow has no caption; one operation reads "1 operation"; a warning opens from its tag.
    await page.goto(`${origin}/?sample=tasks&view=map`);
    await ready(page);
    await page.locator('#source-field').fill(SINGLE);
    await page.locator('#source-field').press('Enter');
    await page.locator('#result-title', { hasText: /^Ping API$/ }).waitFor();
    await ready(page);
    expect((await page.getByTestId('workflow-caption').count()) === 0, 'a spec without a workflow shows a caption');
    const legend = await page.getByRole('list', { name: 'Legend' }).textContent();
    expect(!legend.includes('Strongest workflow'), `the legend names a workflow the map does not draw: ${legend}`);
    const meta = await page.locator('.fhead .meta').textContent();
    expect(/^OpenAPI 3\.0, 1 operation, 1 resource, 0 links\b/.test(meta) && !meta.includes('Sample'), `single-operation meta "${meta}"`);
    const warn = page.locator('.meta .tag-btn');
    expect(/^\d+ warnings?$/.test(await warn.textContent()) && (await warn.getAttribute('aria-expanded')) === 'false', 'no warnings tag');
    await warn.click();
    expect((await warn.getAttribute('aria-expanded')) === 'true' && (await page.locator('ul.warnings:not([hidden])').isVisible()), 'warnings did not open');
    await axe('single operation with warnings');

    // 900 px: files and preview side by side, the audit under them across the browser.
    await page.setViewportSize({ width: 900, height: 900 });
    await ready(page, `${origin}/?sample=tasks`);
    const mid = await page.evaluate(() => {
      const b = (sel) => document.querySelector(sel).getBoundingClientRect();
      return { files: b('.sb-files'), preview: b('.sb-preview'), audit: b('.sb-audit'), browser: b('.skill-browser'), scroll: document.documentElement.scrollWidth - window.innerWidth };
    });
    expect(close(mid.files.top, mid.preview.top, 1) && mid.preview.left > mid.files.right && mid.audit.top >= Math.max(mid.files.bottom, mid.preview.bottom) && close(mid.audit.width, mid.browser.width, 1), `900 px skill browser ${JSON.stringify(mid)}`);
    expect(mid.scroll <= 0, `900 px: horizontal page scroll ${mid.scroll}`);

    // Phones (V2Phone): one scroll, a rule not a frame, Download first, the List by default.
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page, `${origin}/?sample=tasks`);
    const phone = await page.evaluate(() => {
      const s = (el) => getComputedStyle(el);
      const b = (el) => el.getBoundingClientRect();
      const frame = document.querySelector('#result');
      const caption = document.querySelector('[data-testid="workflow-caption"]');
      const buttons = [...document.querySelectorAll('.fhead-actions .btn')];
      return {
        frame: [s(frame).borderRadius, s(frame).boxShadow, b(frame).width, window.innerWidth],
        buttons: buttons.map((x) => [x.textContent, Math.round(b(x).width), Math.round(b(x).height)]), head: Math.round(b(document.querySelector('.fhead')).width),
        tabs: [...document.querySelectorAll('[role="tab"]')].map((x) => `${x.textContent}:${x.getAttribute('aria-selected')}`),
        caption: caption && { compact: caption.dataset.compact, h: b(caption).height, above: b(caption).bottom <= b(document.querySelector('.list')).top, hidden: [...caption.querySelectorAll('.via')].length },
        meta: document.querySelector('.fhead .meta').scrollWidth - document.querySelector('.fhead .meta').clientWidth,
        rows: [...document.querySelectorAll('.skill-browser [role="treeitem"]')].map((r) => Math.round(b(r).height)),
        preview: document.querySelectorAll('.sb-preview').length, scroll: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(phone.frame[0] === '0px' && !phone.frame[1].includes('inset 0px 0px 0px') && phone.frame[2] === phone.frame[3], `390: the result is framed ${JSON.stringify(phone.frame)}`);
    expect(phone.buttons.map(([x]) => x).join() === 'Download .zip,Install command' && phone.buttons.every(([, w, h]) => w === phone.head && h === 40), `390 buttons ${JSON.stringify(phone.buttons)} head ${phone.head}`);
    expect(phone.tabs.join() === 'Map:false,List:true', `390 tabs ${phone.tabs}`);
    expect(phone.caption && phone.caption.compact === 'true' && phone.caption.h <= 28 && phone.caption.above && phone.caption.hidden === 0, `390 caption ${JSON.stringify(phone.caption)}`);
    expect(phone.meta <= 0 && phone.scroll <= 0, `390: meta or page scrolls sideways (${phone.meta}, ${phone.scroll})`);
    expect(phone.rows.length > 0 && phone.rows.every((h) => h >= 44) && phone.preview === 0, `390 file rows ${phone.rows}, preview ${phone.preview}`);
    // List rows: the grey and the focus ring bleed 8 px past the column; the rule stays on it.
    const bleed = await page.evaluate(() => {
      const row = document.querySelector('.lrow[data-op="listProjects"]');
      const [r, method, li, head] = [row, row.querySelector('.m'), row.parentElement, document.querySelector('.lhead button')].map((el) => el.getBoundingClientRect());
      return [method.left - r.left, head.left - r.left, li.left - head.left, getComputedStyle(row.parentElement).boxShadow];
    });
    expect(bleed[0] === 8 && bleed[1] === 8 && bleed[2] === 0 && bleed[3].includes('0.5px'), `390 list row bleed ${bleed}`);
    await webp(page, 'phone-390-light', dir, { fullPage: true });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.emulateMedia({ colorScheme: 'light' });

    // A file row opens a full-width preview with Close; Close returns to the row.
    await page.locator('[role="treeitem"][data-path="SKILL.md"]').click();
    await page.locator('.sb-preview').waitFor();
    const open = await page.evaluate(() => [document.querySelector('.sb-preview').getBoundingClientRect().width, document.querySelector('.skill-browser').getBoundingClientRect().width]);
    expect(close(open[0], open[1], 1), `390 preview not full width ${open}`);
    await axe('phone preview 390 light');
    await webp(page, 'phone-390-preview-light', dir);
    await page.getByRole('button', { name: 'Close SKILL.md' }).click();
    await page.locator('.sb-preview').waitFor({ state: 'detached' });
    // SkillBrowser focuses the row in the frame after the preview closes, so wait for that frame
    // (up to 2 s) rather than reading focus as the preview detaches; a timeout still fails.
    const refocused = await page.waitForFunction(() => document.activeElement?.dataset.path === 'SKILL.md', null, { timeout: 2000 }).then(() => true, () => false);
    expect(refocused, 'Close did not return focus to the file row');
    // The audit is one row that expands its checks.
    const row = page.locator('.audit-row');
    expect((await row.getAttribute('aria-expanded')) === 'false' && !(await page.locator('#audit-checks').isVisible()), '390: the audit checks show before the row is opened');
    expect((await row.textContent()).replaceAll(/\s/g, '') === 'Auditpassed,9of9', `390 audit row "${await row.textContent()}"`);
    await row.click();
    expect((await row.getAttribute('aria-expanded')) === 'true' && (await page.locator('#audit-checks li').count()) === 9 && (await page.locator('#audit-checks').isVisible()), '390: the audit row did not open');

    // 390: the command line box wraps between words, never inside one.
    const broken = await page.evaluate(() => {
      const out = [];
      for (const line of document.querySelectorAll('.cli-line')) {
        const width = line.getBoundingClientRect().width;
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          for (const w of n.textContent.matchAll(/\S+/g)) {
            const r = document.createRange();
            r.setStart(n, w.index);
            r.setEnd(n, w.index + w[0].length);
            const lines = new Set([...r.getClientRects()].map((c) => Math.round(c.top)));
            if (lines.size > 1 && r.getBoundingClientRect().width < width) out.push(w[0]);
          }
        }
      }
      return out;
    });
    expect(broken.length === 0, `390: the command line breaks inside ${broken.join(', ')}`);
    // A wrapped command hangs under its text (after "$ "), so it never reads as a new command.
    const hang = await page.evaluate(() => [...document.querySelectorAll('.cli-line')].flatMap((line) => {
      const r = document.createRange();
      r.selectNodeContents(line);
      const rects = [...r.getClientRects()].filter((c) => c.width > 0);
      const first = rects[0];
      const text = line.querySelector('.cli-p').nextSibling;
      const start = document.createRange();
      start.setStart(text, 0);
      start.setEnd(text, 1);
      const indent = start.getBoundingClientRect().left;
      return rects.filter((c) => Math.round(c.top) > Math.round(first.top) + 2).map((c) => Math.round(c.left - indent));
    }));
    expect(hang.length > 0 && hang.every((d) => Math.abs(d) <= 1), `390: wrapped command lines do not hang under their text (${hang})`);

    // 320 px: no sideways page scroll in the List, the Map or an open preview.
    await page.setViewportSize({ width: 320, height: 720 });
    await ready(page, `${origin}/?sample=tasks`);
    const sideways = async (label) => {
      const [w, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(w <= inner, `320 ${label}: horizontal page scroll (${w} > ${inner})`);
    };
    await sideways('list');
    // The phone's workflow line wraps whole stops rather than clipping one.
    const clipped = await page.evaluate(() => {
      const cap = document.querySelector('[data-testid="workflow-caption"]').getBoundingClientRect();
      const cut = [...document.querySelectorAll('[data-testid="workflow-caption"] .chain li')].filter((li) => li.getBoundingClientRect().right > cap.right + 0.5);
      const scrolls = [...document.querySelectorAll('[data-testid="workflow-caption"], [data-testid="workflow-caption"] *')].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible' && !el.closest('.visually-hidden'));
      return [...cut, ...scrolls].map((el) => el.textContent);
    });
    expect(clipped.length === 0, `320: the workflow line clips ${clipped.join(', ')}`);
    await page.locator('[role="treeitem"][data-path="SKILL.md"]').click();
    await page.locator('.sb-preview').waitFor();
    await sideways('preview');
    await page.getByRole('tab', { name: 'Map' }).click();
    await page.locator('[data-testid="atlas"][data-ready="true"]').waitFor();
    await sideways('map');
    await axe('map 320 light');
  },
};
