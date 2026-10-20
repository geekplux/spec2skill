// Phase 5: Survey design system and app shell. Themes (toggle, persistence, system default),
// self-hosted display font, favicon and logo, reduced motion, focus style, axe in both
// themes, CVD screenshots, and no horizontal scroll at 390 px and at 200 % zoom.
const DARK_PAPER = 'rgb(14, 22, 33)';
const LIGHT_PAPER = 'rgb(247, 243, 234)';

const bodyBg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

async function load(page, origin) {
  await page.goto(`${origin}/?sample=tasks`, { waitUntil: 'load' });
  await page.getByTestId('sample-list').waitFor();
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

    // Shell controls are real, labelled controls.
    const toggle = page.getByRole('button', { name: 'Dark theme' });
    expect((await toggle.getAttribute('aria-pressed')) === 'false', 'light system: toggle should not be pressed');
    const generate = page.getByRole('button', { name: /Generate skill/ });
    expect((await generate.getAttribute('aria-disabled')) === 'true', 'Generate skill should be aria-disabled');
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'List' }).waitFor();
    await page.getByRole('img', { name: 'tool atlas' }).first().waitFor();

    // Display font from our own origin, used by the headings.
    const h1Font = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily);
    expect(h1Font.includes('Bricolage Grotesque'), `h1 font is ${h1Font}`);
    expect(await page.evaluate(() => document.fonts.check('700 36px "Bricolage Grotesque Variable"')), 'font not loaded');
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

    // Focus style: 2 px ink outline (with the marker halo).
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement);
      return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`;
    });
    await page.evaluate(() => document.activeElement.blur());
    expect(outline.startsWith('solid 2px') && outline.includes('rgb(242, 194, 48)'), `focus style: ${outline}`);

    // Toggle to dark; the choice persists across reloads.
    await toggle.click();
    expect((await toggle.getAttribute('aria-pressed')) === 'true', 'toggle not pressed after click');
    expect((await bodyBg(page)) === DARK_PAPER, `dark background is ${await bodyBg(page)}`);
    await load(page, origin);
    expect((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark theme not persisted');
    await axe('dark desktop');
    await screenshot('shell-dark-desktop');
    await toggle.click();
    await load(page, origin);
    expect((await bodyBg(page)) === LIGHT_PAPER, 'light theme not persisted');

    // With no stored choice, the theme follows prefers-color-scheme.
    await page.evaluate(() => localStorage.clear());
    await page.emulateMedia({ colorScheme: 'dark' });
    await load(page, origin);
    expect((await bodyBg(page)) === DARK_PAPER, 'dark system preference not followed');
    expect((await toggle.getAttribute('aria-pressed')) === 'true', 'toggle should reflect the dark system theme');
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

    // The mark alone, rendered at 96 px on chart paper.
    await page.setViewportSize({ width: 160, height: 160 });
    await page.setContent(
      `<html lang="en"><title>tool atlas logo</title><body style="margin:0;display:grid;place-items:center;height:100vh;background:#F7F3EA"><img src="${origin}/logo.svg" width="96" height="96" alt="tool atlas"></body>`,
    );
    await page.locator('img').evaluate((img) => img.decode());
    await screenshot('logo');
  },
};
