// Redesign R2 (docs/redesign/PLAN.md): the page shell. Runs the DESIGN.md section 8 checks 1-4
// (sizes {12, 14, 20, 48}) on the home page at 1440 light and dark and 390 light, check 6 (the grid)
// at 1440 (scripts/browser/redesign-checks.mjs), and the shell's behaviour: the frame 16 px clear of
// the window, the one-line placeholder and uncut samples from 640 to 1440, header links scroll to their
// sections without touching the URL, the phone menu (Escape, outside tap), the footer's Keyboard
// shortcuts, the hero at 390 (input over a full-width Generate, the samples on one line). Saves full-page WebP shots in
// docs/screenshots/redesign-r2/.
//   pnpm build && pnpm check:browser -- --phase 21 --flow redesign-r2 --capture redesign-r2
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
async function webp(page, name, dir) {
  const png = (await page.screenshot({ fullPage: true })).toString('base64');
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
  name: 'redesign-r2',
  phase: 21,
  async run({ page, origin, axe, outDir, capture }) {
    // Committed shots only with --capture redesign-r2; otherwise into this run's folder (never over an earlier phase's).
    const dir = capture ? OUT : outDir;
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
      await webp(page, `home-${width}-${scheme}`, dir);
    }

    // The grid stays fluid below 1136: the hero halves and How it works quarters share edges (the hero
    // itself stacks below 960).
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 1024, height: 900 });
    await ready(page, origin);
    const fluid = await page.evaluate(() => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping
      const x = (sel) => document.querySelector(sel).getBoundingClientRect();
      const steps = [...document.querySelectorAll('.how > li')].map((li) => li.getBoundingClientRect());
      return { h1: x('.hero h1').left, field: x('.source-field').left, cli: x('.cli').left, how3: steps[2].left, how1: steps[0].left, scroll: document.documentElement.scrollWidth, inner: innerWidth };
    });
    expect(Math.abs(fluid.field - fluid.cli) <= 1 && Math.abs(fluid.field - fluid.how3) <= 1 && Math.abs(fluid.h1 - fluid.how1) <= 1 && fluid.scroll <= fluid.inner, `1024 px: the fluid grid is off ${JSON.stringify(fluid)}`);

    // Between 640 and 1440: the frame keeps at least 16 px from the window while its contents stay on
    // the column's left edge; the field's placeholder stays on one line; no sample label is cut.
    for (const width of [640, 700, 900, 960, 1024, 1136, 1168, 1180, 1199, 1200, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(() => document.querySelector('.hero h1'));
      const m = await page.evaluate(() => {
        const frame = document.querySelector('#result');
        const r = frame.getBoundingClientRect();
        const input = document.querySelector('#source-field');
        return {
          column: document.querySelector('.wrap').getBoundingClientRect().width - 2 * parseFloat(getComputedStyle(document.querySelector('.wrap')).paddingLeft),
          left: r.left, right: innerWidth - r.right, contents: r.left + parseFloat(getComputedStyle(frame).paddingLeft), h1: document.querySelector('.hero h1').getBoundingClientRect().left,
          placeholder: input.scrollHeight <= input.clientHeight + 1 && input.clientHeight <= 40, inputWidth: input.clientWidth,
          cut: [...document.querySelectorAll('.seg-item')].filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent),
          seg: (() => { const seg = document.querySelector('.samples .seg'); return seg.scrollWidth <= seg.clientWidth && seg.getBoundingClientRect().right <= document.querySelector('.samples').getBoundingClientRect().right + 0.5; })(),
        };
      });
      expect(Math.abs(m.column - Math.min(1072, width - 96)) <= 1 || (width >= 1200 && Math.abs(m.column - 1072) <= 1), `${width}: the content column is ${m.column} px (1072 until the window must shrink it)`);
      expect(m.left >= 16 && m.right >= 16 && Math.abs(m.contents - m.h1) <= 1, `${width}: frame ${Math.round(m.left)}/${Math.round(m.right)} px from the window, contents at ${m.contents} vs column ${m.h1}`);
      expect(m.placeholder && m.inputWidth >= 240, `${width}: the placeholder wraps or the field is ${m.inputWidth} px`);
      expect(m.cut.length === 0 && m.seg, `${width}: sample labels cut ${JSON.stringify(m.cut)} or the control overflows`);
    }

    // Section details: the command-line description wraps at 44ch; Made by rows are 72 px; the Open file
    // button's focus ring stays clear of Generate.
    await page.setViewportSize({ width: 1440, height: 900 });
    await ready(page, origin);
    const details = await page.evaluate(() => ({
      desc: getComputedStyle(document.querySelector('#cli h2 + p')).maxWidth,
      rows: [...document.querySelectorAll('.projects a')].slice(1).map((a) => a.getBoundingClientRect().height),
      gap: document.querySelector('.hero .generate').getBoundingClientRect().left - document.querySelector('.open-file').getBoundingClientRect().right,
    }));
    expect(details.desc.endsWith('px') && parseFloat(details.desc) < 492 && details.rows.every((h) => Math.abs(h - 72) <= 0.5), `section details ${JSON.stringify(details)}`);
    await page.locator('.open-file').focus();
    const ring = await page.locator('.open-file').evaluate((el) => { const s = getComputedStyle(el); return parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset); });
    expect(details.gap - ring >= 2, `the Open file focus ring (${ring} px) touches Generate (${details.gap} px away)`);

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
    // Escape closes the menu and returns focus to Menu; so does a tap outside the header (no focus move).
    await menu.click();
    await page.keyboard.press('Escape');
    expect((await menu.getAttribute('aria-expanded')) === 'false' && (await menu.evaluate((el) => el === document.activeElement)), '390: Escape does not close the menu or return focus');
    await menu.click();
    await page.mouse.click(195, 600);
    expect((await menu.getAttribute('aria-expanded')) === 'false' && !(await page.locator('header nav').isVisible()), '390: an outside tap does not close the menu');
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
        rule: [r('#result').left, r('#result').width], title: r('.title h2').left,
      };
    });
    expect(phone.generate.top >= phone.input.bottom - 1 && Math.abs(phone.generate.width - (phone.field.width - 8)) <= 1, `390: Generate is not a full-width row under the input ${JSON.stringify(phone)}`);
    expect(phone.oneLine && phone.seg, '390: the samples do not fit one line');
    expect(phone.frame === '0px' && phone.h1 === '48px', `390: frame radius ${phone.frame}, h1 ${phone.h1}`);
    expect(phone.rule[0] === 0 && phone.rule[1] === 390 && Math.abs(phone.title - 16) <= 1, `390: the rule above the result is not full width, or the title left the gutter ${JSON.stringify(phone)}`);

    expect(problems.length === 0, `DESIGN.md section 8 checks failed:\n${problems.join('\n')}`);
  },
};
