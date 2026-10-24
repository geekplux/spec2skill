// Phase 5: design system and app shell (Route map tokens since redesign R1). The theme follows the
// system (no toggle, nothing stored or pinned), self-hosted IBM Plex, favicon and logo, reduced
// motion, focus style, axe in both themes, CVD screenshots, and no horizontal scroll at 390 px and
// at 200 % zoom.
const DARK_PAGE = 'rgb(17, 17, 17)'; // gray-1 dark
const LIGHT_PAGE = 'rgb(252, 252, 252)'; // gray-1 light

const bodyBg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
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
  async run({ page, origin, viewports, screenshot, axe, cvd }) {
    const fonts = [];
    page.on('response', (r) => r.url().endsWith('.woff2') && fonts.push(`${r.status()} ${r.url()}`));
    await page.setViewportSize(viewports.desktop);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(origin, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await load(page, origin);

    // Shell controls are real, labelled controls; there is no theme toggle.
    expect((await page.getByRole('button', { name: 'Dark theme' }).count()) === 0, 'a theme toggle is back');
    // Since redesign R2, Generate sits in the hero's source field (no header button).
    const generate = page.getByRole('button', { name: 'Generate', exact: true });
    expect((await generate.count()) === 1 && (await generate.getAttribute('aria-disabled')) === null && !(await generate.isDisabled()), 'Generate is not one real button');
    expect((await page.locator('header button:visible').count()) === 0, 'the header has buttons at desktop width');
    await page.getByRole('tablist', { name: 'View' }).getByRole('tab', { name: 'List' }).waitFor();
    expect((await page.locator('header .wordmark').textContent()) === 'spec2skill', 'header wordmark text');

    // IBM Plex from our own origin, used by the headings and the body.
    const h1Font = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily);
    expect(h1Font.startsWith('"IBM Plex Sans"'), `h1 font is ${h1Font}`);
    expect(await page.evaluate(() => document.fonts.check('600 20px "IBM Plex Sans"')), 'font not loaded');
    expect(fonts.length > 0 && fonts.every((f) => f.startsWith(`200 ${origin}/assets/`)), `font responses: ${fonts}`);

    // Favicon and logo are served and small.
    const icon = await page.locator('link[rel="icon"]').getAttribute('href');
    expect((await page.request.get(`${origin}${icon}`)).status() === 200, `favicon ${icon} not served`);
    const logo = await page.request.get(`${origin}/logo.svg`);
    expect(logo.status() === 200 && (await logo.body()).length <= 1536, 'logo.svg missing or over 1.5 KB');

    // Reduced motion zeroes the motion tokens.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const motion = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--motion-fast'));
    expect(/^0m?s$/.test(motion.trim()), `reduced motion: --motion-fast is ${motion}`);
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

    // The theme follows prefers-color-scheme, live and on load; a choice stored by the old toggle is ignored.
    await page.evaluate(() => localStorage.setItem('spec2skill:theme', 'light'));
    await page.emulateMedia({ colorScheme: 'dark' });
    expect((await bodyBg(page)) === DARK_PAGE, `dark system preference not followed live: ${await bodyBg(page)}`);
    await load(page, origin);
    expect((await bodyBg(page)) === DARK_PAGE, 'dark system preference not followed on load');
    expect(!(await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))), 'the theme is pinned on <html>');
    await axe('dark desktop');
    await screenshot('shell-dark-desktop');
    await page.evaluate(() => localStorage.clear());
    await page.emulateMedia({ colorScheme: 'light' });

    // Mobile, then 200 % zoom (640 px CSS viewport at device scale factor 2).
    await page.setViewportSize(viewports.mobile);
    await load(page, origin);
    await expectNoHorizontalScroll(page, '390 px');
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
