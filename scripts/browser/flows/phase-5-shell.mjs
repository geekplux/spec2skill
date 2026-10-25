// Phase 5: design system and app shell (Route map tokens since redesign R1). The theme follows the
// system until the header's theme button pins one (R8, D82: remembered, pinned before the first paint,
// applied live in other tabs, print always light, blocked storage survived), self-hosted IBM Plex (Sans and Mono, tabular
// figures), favicon and the Overlap logo, reduced motion, focus style, axe in both themes, CVD
// screenshots, and no horizontal scroll at 390 px and at 200 % zoom.
const DARK_PAGE = 'rgb(17, 17, 17)'; // gray-1 dark
const LIGHT_PAGE = 'rgb(252, 252, 252)'; // gray-1 light

const THEME_KEY = 'spec2skill:theme';

const bodyBg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
/** The page's theme as drawn: the pin on <html>, the root's color-scheme, the page colour. */
const drawn = (page) => page.evaluate(() => ({
  pin: document.documentElement.dataset.theme ?? null,
  scheme: getComputedStyle(document.documentElement).colorScheme,
  bg: getComputedStyle(document.body).backgroundColor,
}));
const themeButton = (page, to) => page.locator('header').getByRole('button', { name: `Switch to ${to} theme`, exact: true });

/**
 * Runs before any page script (page.addInitScript): what the page shows before React mounts. At
 * readyState "interactive" the parser is done and the app's module has not run; the first animation
 * frame comes just before the first paint (rendering waits for the stylesheet).
 */
function recordFirstPaint() {
  // addInitScript serialises this one function, so the helper stays inside.
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const snap = () => ({
    pin: document.documentElement.dataset.theme ?? null,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    bg: document.body ? getComputedStyle(document.body).backgroundColor : null,
    mounted: !!document.getElementById('root')?.firstChild,
  });
  document.addEventListener('readystatechange', () => {
    if (document.readyState === 'interactive') window.themeBeforeApp = snap();
  });
  requestAnimationFrame(() => (window.themeFirstFrame = snap()));
}
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

async function load(page, origin) {
  await page.goto(`${origin}/?sample=tasks`, { waitUntil: 'load' });
  await page.locator('.skill-browser').waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
}

async function expectNoHorizontalScroll(page, label) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth <= innerWidth, `${label}: horizontal scroll (${scrollWidth} > ${innerWidth})`);
}

export default {
  name: 'phase-5-shell',
  phase: 5,
  async run({ page, context, origin, viewports, screenshot, axe, cvd }) {
    const fonts = [];
    page.on('response', (r) => r.url().endsWith('.woff2') && fonts.push(`${r.status()} ${r.url()}`));
    await page.setViewportSize(viewports.desktop);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(origin, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await load(page, origin);

    // Shell controls are real, labelled controls; the header's one button is the theme button (D82).
    expect((await themeButton(page, 'dark').count()) === 1, 'no "Switch to dark theme" button on a light system');
    // Since redesign R2, Generate sits in the hero's source field (no header button).
    const generate = page.getByRole('button', { name: 'Generate', exact: true });
    expect((await generate.count()) === 1 && (await generate.getAttribute('aria-disabled')) === null && !(await generate.isDisabled()), 'Generate is not one real button');
    const headerButtons = await page.locator('header button:visible').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    expect(headerButtons.join() === 'Switch to dark theme', `the header's buttons at desktop width: ${headerButtons}`);
    await page.getByRole('tablist', { name: 'View' }).getByRole('tab', { name: 'List' }).waitFor();
    expect((await page.locator('header .wordmark').textContent()) === 'spec2skill', 'header wordmark text');

    // IBM Plex from our own origin, used by the headings and the body.
    const h1Font = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily);
    expect(h1Font.startsWith('"IBM Plex Sans"'), `h1 font is ${h1Font}`);
    expect(await page.evaluate(() => document.fonts.check('600 20px "IBM Plex Sans"')), 'font not loaded');
    expect(fonts.length > 0 && fonts.every((f) => f.startsWith(`200 ${origin}/assets/`)), `font responses: ${fonts}`);
    // Moved from the retired redesign-r1 flow (R7): IBM Plex Mono too, tabular figures on the root, and
    // the header's Overlap mark (the skill's circle clipped by the spec's square) beside live text.
    const plex = await page.evaluate(() => ({
      mono: document.fonts.check('400 12px "IBM Plex Mono"'), body: getComputedStyle(document.body).fontFamily,
      tnum: getComputedStyle(document.documentElement).fontFeatureSettings, mark: !!document.querySelector('header .wordmark svg.logo [clip-path]'),
    }));
    expect(plex.mono && plex.body.startsWith('"IBM Plex Sans"') && plex.tnum.includes('tnum') && plex.mark, `type and logo: ${JSON.stringify(plex)}`);

    // Favicon and logo are served and small.
    const icon = await page.locator('link[rel="icon"]').getAttribute('href');
    expect((await page.request.get(`${origin}${icon}`)).status() === 200, `favicon ${icon} not served`);
    const logo = await page.request.get(`${origin}/logo.svg`);
    expect(logo.status() === 200 && (await logo.body()).length <= 1536, 'logo.svg missing or over 1.5 KB');

    // Reduced motion zeroes the motion tokens.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const motion = await page.evaluate(() => ['--motion-map', '--motion-draw'].map((t) => `${t}: ${getComputedStyle(document.documentElement).getPropertyValue(t).trim()}`));
    expect(motion.every((m) => /: 0m?s$/.test(m)), `reduced motion: ${motion.join(', ')}`);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await axe('light desktop');
    await screenshot('shell-light-desktop');
    if (cvd) {
      for (const type of ['protanopia', 'deuteranopia', 'tritanopia']) {
        await cvd(type);
        await screenshot(`shell-${type}`);
      }
      await cvd(null);
    }

    // Focus style: 2 px ink (gray-12) outline, no halo.
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement);
      return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`;
    });
    await page.evaluate(() => document.activeElement.blur());
    expect(outline.startsWith('solid 2px') && outline.endsWith('none'), `focus style: ${outline}`);
    expect((await bodyBg(page)) === LIGHT_PAGE, `light background is ${await bodyBg(page)}`);

    // The theme follows prefers-color-scheme, live and on load, until the button pins one; the
    // button's name says what a click does and follows the system too. Nothing is pinned or stored.
    await page.emulateMedia({ colorScheme: 'dark' });
    expect((await bodyBg(page)) === DARK_PAGE, `dark system preference not followed live: ${await bodyBg(page)}`);
    await themeButton(page, 'light').waitFor();
    await load(page, origin);
    const systemDark = await drawn(page);
    expect(systemDark.bg === DARK_PAGE && systemDark.pin === null, `dark system on load: ${JSON.stringify(systemDark)}`);
    await axe('dark desktop');
    await screenshot('shell-dark-desktop');
    await page.emulateMedia({ colorScheme: 'light' });
    await themeButton(page, 'dark').waitFor();
    expect((await bodyBg(page)) === LIGHT_PAGE && (await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)) === null, 'light system: not light, or a theme was stored');

    // A click pins the other theme (only color-scheme on the root, so every token follows) and stores it.
    await themeButton(page, 'dark').click();
    const clicked = await drawn(page);
    expect(clicked.pin === 'dark' && clicked.scheme === 'dark' && clicked.bg === DARK_PAGE, `the button did not switch to dark: ${JSON.stringify(clicked)}`);
    expect((await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)) === 'dark', 'the choice was not stored');
    const named = page.locator('header .theme-btn');
    expect((await named.getAttribute('aria-label')) === 'Switch to light theme' && (await named.evaluate((el) => el === document.activeElement)), 'after a click the button is not "Switch to light theme" with focus');
    await axe('dark by the button');
    // Kept across a reload and whatever the system says, also when the system agrees with it.
    for (const system of ['light', 'dark', 'light']) {
      await page.emulateMedia({ colorScheme: system });
      await load(page, origin);
      const kept = await drawn(page);
      expect(kept.pin === 'dark' && kept.bg === DARK_PAGE && (await themeButton(page, 'light').count()) === 1, `stored dark not kept on a ${system} system: ${JSON.stringify(kept)}`);
    }
    // Print is light whatever the button chose.
    await page.emulateMedia({ media: 'print' });
    const printed = await drawn(page);
    expect(printed.scheme === 'light' && printed.bg === LIGHT_PAGE, `print with dark chosen: ${JSON.stringify(printed)}`);
    await page.emulateMedia({ media: 'screen' });
    expect((await bodyBg(page)) === DARK_PAGE, 'dark not back after print');

    // No flash: before the app mounts, and in the first frame painted, the stored theme is already on,
    // both ways round (dark stored on a light system, light stored on a dark one).
    for (const [stored, system, bg] of [['dark', 'light', DARK_PAGE], ['light', 'dark', LIGHT_PAGE]]) {
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), [THEME_KEY, stored]);
      const fresh = await context.newPage();
      await fresh.emulateMedia({ colorScheme: system });
      await fresh.addInitScript(recordFirstPaint);
      await fresh.goto(`${origin}/?sample=tasks`, { waitUntil: 'load' });
      await fresh.waitForFunction(() => window.themeFirstFrame && window.themeBeforeApp);
      const [before, frame] = await fresh.evaluate(() => [window.themeBeforeApp, window.themeFirstFrame]);
      await fresh.close();
      console.log(`  no flash (${stored} on a ${system} system): before the app ${JSON.stringify(before)}, first frame ${JSON.stringify(frame)}`);
      expect(before.pin === stored && !before.mounted, `the stored ${stored} is not pinned before the app runs: ${JSON.stringify(before)}`);
      expect(frame.pin === stored && frame.scheme === stored && frame.bg === bg, `the first frame is not ${stored}: ${JSON.stringify(frame)}`);
    }

    // Back to light by the button; it stays light on a dark system.
    await page.evaluate((k) => localStorage.setItem(k, 'dark'), THEME_KEY);
    await load(page, origin);
    await themeButton(page, 'light').click();
    await page.emulateMedia({ colorScheme: 'dark' });
    await load(page, origin);
    const back = await drawn(page);
    expect(back.pin === 'light' && back.bg === LIGHT_PAGE && (await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)) === 'light', `light by the button not kept on a dark system: ${JSON.stringify(back)}`);
    await axe('light by the button on a dark system');
    await page.emulateMedia({ colorScheme: 'light' });

    // Another tab follows live: a click here pins it there; removing the choice here lets it follow the system.
    await page.evaluate((k) => localStorage.removeItem(k), THEME_KEY);
    await load(page, origin);
    const other = await context.newPage();
    await other.emulateMedia({ colorScheme: 'light' });
    await load(other, origin);
    await themeButton(page, 'dark').click();
    await themeButton(other, 'light').waitFor({ timeout: 2000 });
    const synced = await drawn(other);
    await page.evaluate((k) => localStorage.removeItem(k), THEME_KEY);
    await themeButton(other, 'dark').waitFor({ timeout: 2000 });
    const unsynced = await drawn(other);
    await other.close();
    expect(synced.pin === 'dark' && synced.bg === DARK_PAGE && unsynced.pin === null && unsynced.bg === LIGHT_PAGE, `another tab: ${JSON.stringify({ synced, unsynced })}`);

    // Blocked storage (every localStorage access throws): the page follows the system, nothing breaks,
    // and the button still switches for the visit.
    const blocked = await context.newPage();
    const errors = [];
    blocked.on('pageerror', (e) => errors.push(e.message));
    await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }));
    await blocked.emulateMedia({ colorScheme: 'dark' });
    await load(blocked, origin);
    const before = await drawn(blocked);
    await themeButton(blocked, 'light').click();
    const after = await drawn(blocked);
    await blocked.close();
    expect(before.pin === null && before.bg === DARK_PAGE && after.pin === 'light' && after.bg === LIGHT_PAGE && errors.length === 0, `blocked storage: ${JSON.stringify({ before, after, errors })}`);
    await page.evaluate((k) => localStorage.removeItem(k), THEME_KEY);

    // Mobile, then 200 % zoom (640 px CSS viewport at device scale factor 2).
    await page.setViewportSize(viewports.mobile);
    await load(page, origin);
    await expectNoHorizontalScroll(page, '390 px');
    // On phones the theme button follows Menu in the header, a 44 px target whose glyph ends on the gutter.
    const phoneHeader = await page.locator('header button:visible').evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      const glyph = el.querySelector('svg').getBoundingClientRect();
      return { name: el.getAttribute('aria-label'), w: r.width, h: r.height, glyphRight: glyph.right };
    }));
    expect(phoneHeader.map((b) => b.name).join() === 'Menu,Switch to dark theme' && phoneHeader.every((b) => b.w === 44 && b.h === 44) && Math.abs(phoneHeader[1].glyphRight - (390 - 16)) <= 0.5, `390 header buttons: ${JSON.stringify(phoneHeader)}`);
    await axe('mobile');
    await screenshot('shell-mobile');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await load(page, origin);
    await expectNoHorizontalScroll(page, '200 % zoom');
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await cdp.detach();

    // The mark alone, rendered at 96 px on the light page colour.
    await page.setViewportSize({ width: 160, height: 160 });
    await page.setContent(
      `<html lang="en"><title>spec2skill logo</title><body style="margin:0;display:grid;place-items:center;height:100vh;background:#fcfcfc"><img src="${origin}/logo.svg" width="96" height="96" alt="spec2skill"></body>`,
    );
    await page.locator('img').evaluate((img) => img.decode());
    await screenshot('logo');
  },
};
