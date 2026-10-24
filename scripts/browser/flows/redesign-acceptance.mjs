// Redesign R7: the acceptance suite of docs/redesign/DESIGN.md section 8, in full, in one place.
// On every sample (Tasks API, Petstore, Filesystem MCP), light and dark, it runs on each state at rest
// (after the load sequence, `settled`):
//   1440  home at rest, hover (the workflow's last stop, its preview card), pinned card, the next row
//         focused from the keyboard, a card pinned from the address (#op=), the shortcuts dialog, list view
//   390   phone (List, the default), phone map, phone pinned card (the bottom sheet)
//   check 1 type sizes, 2 colours, 3 lines, 4 middle dot in the rendered page (redesign-checks.mjs) and
//   axe (check 8); check 6, the grid, on home at 1440 (h1, frame contents, first map column, files
//   column, command-line title, How it works and Made by at one x; hero field, third map column,
//   command box and Made by rows at 580; with the skill browser's and the map's columns; 1 px); no
//   sideways page scroll; check 7 (reduced motion: no running animation or transition, none declared)
//   on home, hover and the list at 1440 and the phone at 390; no two pieces of text print over each
//   other on home at rest at 1440, 1024, 768, 640, 390 and 320 (page-wide, and in each Made by row).
// Then the source-level checks: 4 (no middle dot in src or index.html), 5 (the CVD and contrast unit
// tests, src/design/cvd.test.ts and contrast.test.ts) and 8 (pnpm check:size). It prints the result of
// every check for every state and fails on any problem. Other flows keep only checks this one does not
// make (D69).
//   pnpm build && pnpm check:browser -- --phase 21 --flow redesign-acceptance
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runAxe } from '../axe.mjs';
import { CHECKS, GRID_PARTS, designChecks, gridCheck, overlapCheck, settled } from '../redesign-checks.mjs';
import { ROOT } from '../session.mjs';

/**
 * The samples, each with the row hovered and pinned (the strongest workflow's last stop: it has the
 * most links) and the row pinned from the address (`#op=`, a row near the bottom of the map, D75).
 */
const SAMPLES = [
  { id: 'tasks', title: 'Tasks API', op: 'getTask', hash: 'deleteTask' },
  { id: 'petstore', title: 'Swagger Petstore', op: 'getPetById', hash: 'deleteUser' },
  { id: 'filesystem', title: 'secure-filesystem-server', op: 'read_text_file', hash: 'move_file' },
];
const THEMES = ['light', 'dark'];
const DESK = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const PAGE_CHECKS = CHECKS.filter((c) => c !== 'motion'); // type, colour, lines, dot
/** The widths the text-overlap check reads home at rest at (D75). */
const OVERLAP_WIDTHS = [1440, 1024, 768, 640, 390, 320];

const node = (args) => execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 120_000 });
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

async function ready(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('.skill-browser[data-ready="true"]').waitFor({ state: 'attached' });
  await page.locator('[data-testid="atlas"][data-ready="true"], [data-testid="list-view"]').first().waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  await settled(page);
}

/**
 * Runs in the page: in each Made by row, the boxes of the name, the line and the URL (their text, so a
 * URL overflowing its cell counts) must not cross each other or leave the row.
 */
function madeByRows() {
  // page.evaluate serialises this one function, so the helper stays inside.
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const box = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    return rects.length ? {
      left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)),
      top: Math.min(...rects.map((r) => r.top)), bottom: Math.max(...rects.map((r) => r.bottom)),
    } : null;
  };
  const problems = [];
  for (const row of document.querySelectorAll('.projects a')) {
    const name = row.querySelector('b')?.textContent;
    const outer = row.getBoundingClientRect();
    const parts = [...row.children].map((el) => [el.tagName === 'B' ? 'name' : el.tagName === 'CODE' ? 'URL' : 'line', box(el)]).filter(([, b]) => b);
    for (const [part, b] of parts) {
      if (b.left < outer.left - 0.5 || b.right > outer.right + 0.5) problems.push(`Made by ${name}: the ${part} leaves the row (${Math.round(b.left - outer.left)} to ${Math.round(b.right - outer.left)} of ${Math.round(outer.width)} px)`);
    }
    parts.forEach(([pa, a], i) => parts.slice(i + 1).forEach(([pb, b]) => {
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (x > 0.5 && y > 0.5) problems.push(`Made by ${name}: the ${pa} and the ${pb} cross by ${Math.round(x)} x ${Math.round(y)} px`);
    }));
  }
  return problems;
}

/** The grid parts this sample's map has: a map of fewer than three columns has no third column to measure. */
async function gridParts(page) {
  const columns = await page.locator('.rc[data-column]').evaluateAll((els) => [...new Set(els.map((el) => Number(el.dataset.column)))]);
  if (columns.includes(2)) return { parts: GRID_PARTS, note: '' };
  const { 'third map column': _third, ...right } = GRID_PARTS.right;
  return { parts: { ...GRID_PARTS, right }, note: ` (map has columns ${columns.toSorted().join(', ')}: no third column)` };
}

export default {
  name: 'redesign-acceptance',
  phase: 21,
  async run({ page, origin }) {
    const problems = [];
    /** check -> state label -> 'pass' | number of problems */
    const results = new Map();
    const record = (check, label, found) => {
      if (!results.has(check)) results.set(check, []);
      results.get(check).push([label, found.length]);
      problems.push(...found);
    };
    // Check 8's axe: no violation of any impact (the run's own axe fails on serious and critical only).
    const axe = async (label) => record('8 axe', label, await runAxe(page, `redesign-acceptance: ${label}`, { all: true }));
    const pageChecks = async (label, theme) => {
      const found = await designChecks(page, { theme, label, checks: PAGE_CHECKS });
      for (const check of PAGE_CHECKS) {
        const name = { type: '1 type', colour: '2 colour', lines: '3 lines', dot: '4 dot' }[check];
        record(name, label, found.filter((p) => p.startsWith(`[${label}] ${check}:`)));
      }
      const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      record('no sideways scroll', label, scroll > inner ? [`[${label}] the page scrolls sideways (${scroll} > ${inner})`] : []);
      await axe(label);
    };
    const motion = async (label) => record('7 motion', label, await designChecks(page, { theme: 'light', label, checks: ['motion'] }));

    for (const { id, title, op, hash } of SAMPLES) {
      for (const theme of THEMES) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'no-preference' });

        // 1440: home at rest, with the grid.
        await page.setViewportSize(DESK);
        await ready(page, `${origin}/?sample=${id}`);
        expect((await page.locator('#result-title').textContent()) === title, `${id}: the title is not ${title}`);
        await page.mouse.move(0, 0);
        const rest = `${id} home 1440 ${theme}`;
        await pageChecks(rest, theme);
        const { parts, note } = await gridParts(page);
        record('6 grid', `${rest}${note}`, await gridCheck(page, { label: `grid ${rest}`, parts }));

        // Hover: the row's links, the faded rest and the preview card.
        const row = page.locator(`.op[data-op="${op}"]`);
        await row.scrollIntoViewIfNeeded();
        await row.hover();
        await page.locator('[data-testid="op-preview"]').waitFor();
        await settled(page);
        await pageChecks(`${id} hover ${op} 1440 ${theme}`, theme);

        // Pinned: click pins the card; the pointer leaves so only the pin is hot.
        await row.click();
        await page.getByTestId('op-card').waitFor();
        await page.mouse.move(0, 0);
        await settled(page);
        await pageChecks(`${id} pinned ${op} 1440 ${theme}`, theme);
        await page.keyboard.press('Escape');
        await page.getByTestId('op-card').waitFor({ state: 'detached' });

        // Keyboard: Escape left focus on the row; an arrow key moves it to the next row, which shows
        // its focus ring (focus-visible) and its preview.
        await page.keyboard.press('ArrowDown');
        const focused = await page.evaluate(() => document.activeElement?.matches('.op:focus-visible') && document.activeElement.dataset.op);
        expect(focused && focused !== op, `${id}: ArrowDown from ${op} did not move keyboard focus to another row (${focused})`);
        await settled(page);
        await pageChecks(`${id} keyboard ${focused} 1440 ${theme}`, theme);

        // Pinned from the address: #op= on load opens the card on a row near the map's bottom.
        await page.goto('about:blank');
        await ready(page, `${origin}/?sample=${id}#op=${hash}`);
        await page.getByTestId('op-card').waitFor();
        await page.mouse.move(0, 0);
        await settled(page);
        expect((await page.locator(`.op[data-op="${hash}"]`).getAttribute('aria-expanded')) === 'true', `${id}: #op=${hash} did not pin ${hash}`);
        await pageChecks(`${id} pinned #op=${hash} 1440 ${theme}`, theme);
        await page.getByTestId('op-card').locator('.oc-close').click();
        await page.getByTestId('op-card').waitFor({ state: 'detached' });

        // The shortcuts dialog (`?`), a native modal over an opaque backdrop (D77).
        await page.keyboard.press('?');
        await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor();
        await settled(page);
        await pageChecks(`${id} shortcuts 1440 ${theme}`, theme);
        await page.keyboard.press('Escape');
        await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor({ state: 'detached' });

        // The list view.
        await page.getByRole('tablist', { name: 'View' }).getByRole('tab', { name: 'List' }).click();
        await page.getByTestId('list-view').waitFor();
        await page.mouse.move(0, 0);
        await settled(page);
        await pageChecks(`${id} list 1440 ${theme}`, theme);

        // 390: the phone (List by default), its map, and the pinned card as a bottom sheet.
        await page.setViewportSize(PHONE);
        await ready(page, `${origin}/?sample=${id}`);
        expect((await page.locator('#tab-list').getAttribute('aria-selected')) === 'true', `${id} 390: the List is not the default`);
        await pageChecks(`${id} phone 390 ${theme}`, theme);
        await page.locator('#tab-map').click();
        await page.locator('[data-testid="atlas"][data-ready="true"]').waitFor();
        await settled(page);
        await pageChecks(`${id} phone map 390 ${theme}`, theme);
        await page.locator(`.op[data-op="${op}"]`).click();
        await page.getByTestId('op-card').waitFor();
        await settled(page);
        await pageChecks(`${id} phone pinned ${op} 390 ${theme}`, theme);
      }

      // Text overlap: no two pieces of text print over each other on home at rest, page-wide and in
      // the Made by rows, from 1440 down to 320.
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
      for (const width of OVERLAP_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await ready(page, `${origin}/?sample=${id}`);
        await page.mouse.move(0, 0);
        const label = `${id} home ${width}`;
        const made = (await page.evaluate(madeByRows)).map((p) => `[${label}] ${p}`);
        record('text overlap', label, [...(await overlapCheck(page, { label })), ...made]);
      }

      // Check 7: under reduced motion nothing runs and nothing would, at rest, on hover, in the list and on the phone.
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await page.setViewportSize(DESK);
      await ready(page, `${origin}/?sample=${id}`);
      await motion(`${id} home 1440 reduced motion`);
      const row = page.locator(`.op[data-op="${op}"]`);
      await row.scrollIntoViewIfNeeded();
      await row.hover();
      await page.locator('[data-testid="op-preview"]').waitFor();
      await motion(`${id} hover ${op} 1440 reduced motion`);
      await page.mouse.move(0, 0);
      await page.getByRole('tablist', { name: 'View' }).getByRole('tab', { name: 'List' }).click();
      await page.getByTestId('list-view').waitFor();
      await motion(`${id} list 1440 reduced motion`);
      await page.setViewportSize(PHONE);
      await ready(page, `${origin}/?sample=${id}`);
      await motion(`${id} phone 390 reduced motion`);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
    await page.setViewportSize(DESK);

    // Check 4 in the source: no middle dot in src (UI strings, the skill generator and its snapshots) or index.html.
    const dotted = [];
    const scan = (rel) => {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      text.split('\n').forEach((line, i) => line.includes('\u00b7') && dotted.push(`${rel}:${i + 1}`));
    };
    scan('index.html');
    for (const f of readdirSync(join(ROOT, 'src'), { recursive: true, encoding: 'utf8' })) {
      if (/\.(tsx?|css|mjs|md|json|html)$/.test(f) && !f.endsWith('copy.test.ts')) scan(join('src', f));
    }
    record('4 dot', 'src and index.html', dotted.map((at) => `check 4: middle dot at ${at}`));

    // Check 5: the CVD and contrast tests on the tokens; check 8: the size budget (dist is built).
    const run = (check, label, args) => {
      try {
        node(args);
        record(check, label, []);
      } catch (error) {
        record(check, label, [`check ${check}: ${label} failed\n${error.stdout ?? ''}${error.stderr ?? ''}`]);
      }
    };
    run('5 cvd and contrast', 'src/design/cvd.test.ts, contrast.test.ts', [join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', 'src/design/cvd.test.ts', 'src/design/contrast.test.ts']);
    run('8 size', 'pnpm check:size', [join(ROOT, 'scripts', 'check-size.mjs')]);

    // The table of results: every check, every state.
    for (const [check, rows] of [...results].toSorted(([a], [b]) => a.localeCompare(b))) {
      const failed = rows.filter(([, n]) => n > 0);
      console.log(`  ${check}: ${rows.length - failed.length} of ${rows.length} pass${failed.length ? `; failing: ${failed.map(([l, n]) => `${l} (${n})`).join(', ')}` : ''}`);
      for (const [label, n] of rows) console.log(`    ${n ? 'FAIL' : 'pass'}  ${label}${n ? ` (${n})` : ''}`);
    }
    expect(problems.length === 0, `DESIGN.md section 8 acceptance failed:\n${problems.join('\n')}`);
  },
};
