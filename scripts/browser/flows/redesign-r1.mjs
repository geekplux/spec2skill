// Redesign R1 (docs/redesign/PLAN.md): Radix tokens, IBM Plex, the Overlap logo, the theme following
// the system. Runs the DESIGN.md section 8 checks 1-4 (scripts/browser/redesign-checks.mjs) on the
// first view at 1440 and 390 and on the list view, a keyboard-focused map row and the pinned
// operation card at 1440, all in light and dark (sizes 12/14/20/48: the hero h1 is 48 since R2); check 7
// under reduced motion; saves the 1440 light and dark
// first view as WebP in docs/screenshots/redesign-r1/.
//   pnpm build && pnpm check:browser -- --phase 21 --flow redesign-r1 --capture redesign-r1
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { designChecks, radixColours } from '../redesign-checks.mjs';
import { ROOT } from '../session.mjs';

const OUT = join(ROOT, 'docs', 'screenshots', 'redesign-r1');
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];

const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

async function ready(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('.skill-browser[data-ready="true"]').waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
}

/** The viewport as WebP (quality 0.82), encoded by the browser itself from a PNG screenshot. */
async function webp(page, name, dir) {
  const png = (await page.screenshot()).toString('base64');
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

export default {
  name: 'redesign-r1',
  phase: 21,
  async run({ page, origin, axe, outDir, capture }) {
    // Committed shots only with --capture redesign-r1; otherwise into this run's folder (never over an earlier phase's).
    const dir = capture ? OUT : outDir;
    const problems = [];
    const radix = radixColours();
    for (const scheme of ['light', 'dark']) {
      for (const viewport of VIEWPORTS) {
        const label = `first view ${viewport.width} ${scheme}`;
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' });
        await ready(page, origin);

        // The theme follows the system: the page is gray-1 of that scheme, nothing pins it, no toggle.
        const state = await page.evaluate(() => ({
          bg: getComputedStyle(document.body).backgroundColor,
          pinned: document.documentElement.hasAttribute('data-theme'),
          toggle: [...document.querySelectorAll('button')].some((b) => /dark theme/i.test(b.textContent)),
          fonts: ['400 14px "IBM Plex Sans"', '600 14px "IBM Plex Sans"', '400 12px "IBM Plex Mono"'].map((f) => document.fonts.check(f)),
          family: getComputedStyle(document.body).fontFamily,
          tnum: getComputedStyle(document.documentElement).fontFeatureSettings,
          logo: !!document.querySelector('header .wordmark svg.logo [clip-path]') && document.querySelector('header .wordmark')?.textContent.trim(),
        }));
        expect(radix[scheme][state.bg] === 'gray-1', `${label}: body background ${state.bg} is not gray-1`);
        expect(!state.pinned && !state.toggle, `${label}: the theme is pinned or a theme toggle is still there`);
        expect(state.fonts.every(Boolean) && state.family.startsWith('"IBM Plex Sans"'), `${label}: IBM Plex not in use (${state.family}, ${state.fonts})`);
        expect(state.tnum.includes('tnum'), `${label}: no tnum on the root (${state.tnum})`);
        expect(state.logo === 'spec2skill', `${label}: header wordmark is not the Overlap mark + "spec2skill" (${state.logo})`);

        const found = await designChecks(page, { theme: scheme, label, checks: ['type', 'colour', 'lines', 'dot'] });
        console.log(`  ${label}: ${found.length} problem(s)`);
        problems.push(...found);
        if (viewport.width === 1440) await webp(page, `first-view-1440-${scheme}`, dir);
        await axe(label);
      }
    }

    // The other states of the current UI at 1440, light and dark: the list view, a keyboard-focused
    // map row (its links highlighted) and the pinned operation card (the detail panel until R4).
    await page.setViewportSize(VIEWPORTS[0]);
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' });
      const states = [
        ['list view', '/?sample=tasks&view=list', () => page.getByTestId('list-view').waitFor()],
        ['focused map row', '/?sample=tasks', async () => {
          await page.locator('[data-testid="atlas"][data-ready="true"]').waitFor({ state: 'attached' });
          await page.locator('.op[data-op="listTasks"]').focus();
          await page.keyboard.press('ArrowDown');
          await page.locator('.route[data-hot]').waitFor({ state: 'attached' });
          expect(await page.evaluate(() => document.activeElement?.matches('.op:focus-visible')), 'no keyboard-focused map row');
          await page.waitForTimeout(300); // the fade
        }],
        ['operation card', '/?sample=tasks#op=deleteTask', async () => {
          await page.getByTestId('op-card').waitFor();
          await page.mouse.move(0, 0);
          await page.waitForTimeout(300); // the fade
        }],
      ];
      for (const [name, path, open] of states) {
        const label = `${name} 1440 ${scheme}`;
        await ready(page, `${origin}${path}`);
        await open();
        const found = await designChecks(page, { theme: scheme, label, checks: ['type', 'colour', 'lines', 'dot'] });
        console.log(`  ${label}: ${found.length} problem(s)`);
        problems.push(...found);
        await axe(label);
      }
    }

    // Check 7: with reduced motion nothing runs and nothing would.
    await page.setViewportSize(VIEWPORTS[0]);
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await ready(page, origin);
    const motion = await designChecks(page, { theme: 'light', label: 'first view reduced motion', checks: ['motion'] });
    console.log(`  reduced motion: ${motion.length} problem(s)`);
    problems.push(...motion);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    expect(problems.length === 0, `DESIGN.md section 8 checks failed:\n${problems.join('\n')}`);
  },
};
