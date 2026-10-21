// Phase 8: the rename to spec2skill. Title, meta description, logo names, the pitch line (shown
// from 1280 px), the outlined wordmark rendering identically with the font blocked, the pre-rename
// theme key honoured once, and no old name anywhere a user can read it.
const PITCH = 'Turn any OpenAPI spec or MCP server into an agent skill in one click.';
const OLD_NAME = /tool[ -]?atlas/i;

const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

async function load(page, origin) {
  await page.goto(`${origin}/?sample=tasks`, { waitUntil: 'load' });
  await page.locator('.skill-pane').waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
}

const header = async (page) => ({ clip: await page.locator('header').boundingBox() });

export default {
  name: 'phase-8-rename',
  phase: 8,
  async run({ page, context, origin, viewports, screenshot, cvd }) {
    await page.setViewportSize(viewports.desktop);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(origin, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await load(page, origin);

    const title = await page.title();
    expect(title === 'spec2skill: turn any OpenAPI spec or MCP server into an agent skill', `title: ${title}`);
    const meta = await page.locator('meta[name="description"]').getAttribute('content');
    expect(meta?.startsWith(PITCH), `meta description: ${meta}`);
    const og = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(og === 'spec2skill', `og:title: ${og}`);
    const logo = page.locator('header').getByRole('img', { name: 'spec2skill', exact: true });
    expect((await logo.count()) === 1, 'header wordmark is not one image named spec2skill');
    expect((await logo.locator('text').count()) === 0, 'wordmark uses <text>');
    for (const file of ['logo.svg', 'favicon.svg']) {
      const svg = await (await page.request.get(`${origin}/${file}`)).text();
      expect(svg.includes('<title>spec2skill</title>'), `${file} has no spec2skill title`);
    }
    const text = await page.evaluate(() => `${document.title}\n${document.body.innerText}`);
    expect(!OLD_NAME.test(text), 'old name still visible on the page');

    // The pitch line: visible at 1280 px, hidden below.
    expect(await page.getByText(PITCH).isVisible(), 'pitch line hidden at 1280 px');
    await screenshot('header-light-desktop', await header(page));
    if (cvd) {
      await cvd('deuteranopia');
      await screenshot('header-deuteranopia', await header(page));
      await cvd(null);
    }
    await page.setViewportSize({ width: 1024, height: 800 });
    expect(!(await page.getByText(PITCH).isVisible()), 'pitch line visible at 1024 px');
    await page.setViewportSize(viewports.desktop);

    // The wordmark is outlined: with the display font blocked it renders pixel-identically.
    const withFont = await logo.screenshot();
    // Answered with an empty font rather than aborted: an aborted request logs a console error.
    await page.route('**/*.woff2', (route) => route.fulfill({ status: 200, contentType: 'font/woff2', body: '' }), { times: 1 });
    await load(page, origin);
    const noFont = await page.evaluate(() => document.fonts.check('700 36px "Bricolage Grotesque Variable"'));
    expect(!noFont, 'font still loaded although the request was blocked');
    expect((await logo.screenshot()).equals(withFont), 'wordmark differs without the font');
    await load(page, origin);

    // A choice stored under the pre-rename key is honoured once and moved to the new key.
    await page.evaluate(() => (localStorage.clear(), localStorage.setItem('tool-atlas:theme', 'dark')));
    await load(page, origin);
    const theme = await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('spec2skill:theme'), localStorage.getItem('tool-atlas:theme')]);
    expect(theme.join() === 'dark,dark,', `old theme key not migrated: ${theme}`);
    await screenshot('header-dark-desktop', await header(page));

    // The wordmark at device scale factor 2 (its own context, same offline guard), for kerning.
    const hiDpi = await context.browser().newContext({ viewport: viewports.desktop, deviceScaleFactor: 2 });
    await hiDpi.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));
    const sharp = await hiDpi.newPage();
    await load(sharp, origin);
    const box = await sharp.locator('header .logo').boundingBox();
    await screenshot('wordmark-2x', { page: sharp, clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 } });
    await hiDpi.close();

    await page.setViewportSize(viewports.mobile);
    await load(page, origin);
    await screenshot('header-mobile', await header(page));
  },
};
