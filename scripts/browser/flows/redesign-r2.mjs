// Redesign R2 (docs/redesign/PLAN.md): the page shell. Runs the DESIGN.md section 8 checks 1-4
// (sizes {12, 14, 20, 48}) on the home page at 1440 light and dark and 390 light, check 6 (the grid)
// at 1440 (scripts/browser/redesign-checks.mjs), and the shell's behaviour: header links scroll to
// their sections without touching the URL, the phone menu, the footer's Keyboard shortcuts, the hero
// at 390 (input over a full-width Generate, the samples on one line). Saves full-page WebP shots in
// docs/screenshots/redesign-r2/.
//   pnpm build && pnpm check:browser -- --phase 21 --flow redesign-r2
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { designChecks, gridCheck } from '../redesign-checks.mjs';
import { ROOT } from '../session.mjs';

const OUT = join(ROOT, 'docs', 'screenshots', 'redesign-r2');
const VIEWS = [
  { width: 1440, height: 900, scheme: 'light' },
  { width: 1440, height: 900, scheme: 'dark' },
  { width: 390, height: 844, scheme: 'light' },
];

const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

async function ready(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('.skill-pane[data-ready="true"]').waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
}

/** The full page as WebP (quality 0.82), encoded by the browser itself from a PNG screenshot. */
async function webp(page, name) {
  const png = (await page.screenshot({ fullPage: true })).toString('base64');
  const data = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: img.naturalWidth, height: img.naturalHeight });
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/webp', 0.82).split(',')[1];
  }, png);
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `${name}.webp`);
  writeFileSync(path, Buffer.from(data, 'base64'));
  console.log(`  screenshot ${path.slice(ROOT.length + 1)}`);
}

export default {
  name: 'redesign-r2',
  phase: 21,
  async run({ page, origin, axe }) {
    const problems = [];
    for (const { width, height, scheme } of VIEWS) {
      const label = `home ${width} ${scheme}`;
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' });
      await ready(page, origin);
      const found = await designChecks(page, { theme: scheme, label, checks: ['type', 'colour', 'lines', 'dot'] });
      console.log(`  ${label}: ${found.length} problem(s)`);
      problems.push(...found);
      if (width === 1440) {
        const grid = await gridCheck(page, { label: `grid ${width} ${scheme}` });
        console.log(`  grid ${width} ${scheme}: ${grid.length} problem(s)`);
        problems.push(...grid);
      }
      const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(scroll <= inner, `${label}: horizontal scroll (${scroll} > ${inner})`);
      await axe(label);
      await page.mouse.move(0, 0);
      await webp(page, `home-${width}-${scheme}`);
    }

    // The grid stays fluid between 640 and 1136: the hero halves and How it works quarters share edges.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 900, height: 900 });
    await ready(page, origin);
    const fluid = await page.evaluate(() => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping
      const x = (sel) => document.querySelector(sel).getBoundingClientRect();
      const steps = [...document.querySelectorAll('.how > li')].map((li) => li.getBoundingClientRect());
      return { h1: x('.hero h1').left, field: x('.source-field').left, cli: x('.cli').left, how3: steps[2].left, how1: steps[0].left, scroll: document.documentElement.scrollWidth, inner: innerWidth };
    });
    expect(Math.abs(fluid.field - fluid.cli) <= 1 && Math.abs(fluid.field - fluid.how3) <= 1 && Math.abs(fluid.h1 - fluid.how1) <= 1 && fluid.scroll <= fluid.inner, `900 px: the fluid grid is off ${JSON.stringify(fluid)}`);

    // Header links scroll to their sections and move focus there; the URL (whose hash is #op=) stays.
    await page.setViewportSize({ width: 1440, height: 900 });
    await ready(page, `${origin}/?sample=tasks`);
    const before = page.url();
    for (const [name, id] of [['How it works', 'how'], ['Command line', 'cli']]) {
      await page.locator('header').getByRole('link', { name }).click();
      await page.waitForFunction((target) => document.activeElement?.id === target, id);
      const [top, bottom] = await page.locator(`#${id}`).evaluate((el) => [el.getBoundingClientRect().top, Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight]);
      expect(Math.abs(top) <= 1 || (bottom && top >= 0 && top < 900), `${name}: section top at ${top}px after the click`);
      expect(page.url() === before, `${name}: the URL changed to ${page.url()}`);
    }
    // The footer's Keyboard shortcuts opens the existing dialog; Escape returns focus to it.
    const shortcuts = page.locator('footer').getByRole('button', { name: 'Keyboard shortcuts' });
    await shortcuts.click();
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    expect(await shortcuts.evaluate((el) => el === document.activeElement), 'focus did not return to the footer button');
    const links = await page.locator('footer a, .projects a, .made a.ul').evaluateAll((els) => els.map((a) => a.getAttribute('href')));
    expect(links.includes('https://github.com/geekplux/spec2skill/blob/main/LICENSE') && links.includes('https://geekplux.com') && links.includes('https://vert.geekplux.org'), `footer and Made by links: ${links}`);

    // Phones: the nav is behind Menu; the hero field is input over a full-width Generate; the
    // samples fit one line; the result is not a framed card (a rule above it).
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page, origin);
    const menu = page.getByRole('button', { name: 'Menu' });
    expect(!(await page.locator('header nav').isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false', '390: the nav shows without Menu');
    await menu.click();
    expect((await menu.getAttribute('aria-expanded')) === 'true' && (await page.locator('header nav').isVisible()), '390: Menu does not open the nav');
    await axe('390 menu open');
    await page.locator('header').getByRole('link', { name: 'How it works' }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'how');
    expect(!(await page.locator('header nav').isVisible()), '390: the nav stays open after a link');
    await ready(page, origin);
    const phone = await page.evaluate(() => {
      // Runs in the page (serialised), so the helper stays inside.
      // oxlint-disable-next-line unicorn/consistent-function-scoping
      const r = (sel) => document.querySelector(sel).getBoundingClientRect();
      const items = [...document.querySelectorAll('.seg-item')].map((el) => el.getBoundingClientRect().top);
      return {
        input: r('#source-field'), generate: r('.hero .generate'), field: r('.source-field'),
        oneLine: items.every((t) => Math.abs(t - items[0]) < 1), seg: document.querySelector('.samples .seg').scrollWidth <= document.querySelector('.samples .seg').clientWidth,
        frame: getComputedStyle(document.querySelector('#result')).borderRadius, h1: getComputedStyle(document.querySelector('.hero h1')).fontSize,
      };
    });
    expect(phone.generate.top >= phone.input.bottom - 1 && Math.abs(phone.generate.width - (phone.field.width - 8)) <= 1, `390: Generate is not a full-width row under the input ${JSON.stringify(phone)}`);
    expect(phone.oneLine && phone.seg, '390: the samples do not fit one line');
    expect(phone.frame === '0px' && phone.h1 === '48px', `390: frame radius ${phone.frame}, h1 ${phone.h1}`);

    expect(problems.length === 0, `DESIGN.md section 8 checks failed:\n${problems.join('\n')}`);
  },
};
