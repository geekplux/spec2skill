// Phase 8: the rename to spec2skill. Title, meta description, logo names, the hero headline (since
// redesign R2 it replaces the header's pitch line, at every width), the wordmark (since redesign R1 the Overlap mark plus live text, readable with the
// font blocked), stored theme keys ignored (the theme follows the system), and no old name anywhere
// a user can read it.
const PITCH = 'Turn any OpenAPI spec or MCP server into an agent skill in one click.'; // the meta description
const HEADLINE = 'Turn any API into an agent skill';
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
    const logo = page.locator('header .wordmark');
    expect((await logo.count()) === 1 && (await logo.textContent()) === 'spec2skill', 'header wordmark is not the mark plus "spec2skill"');
    expect((await logo.locator('svg[aria-hidden="true"]').count()) === 1, 'the mark is not decorative (the text names the wordmark)');
    for (const file of ['logo.svg', 'favicon.svg']) {
      const svg = await (await page.request.get(`${origin}/${file}`)).text();
      expect(svg.includes('<title>spec2skill</title>'), `${file} has no spec2skill title`);
    }
    const text = await page.evaluate(() => `${document.title}\n${document.body.innerText}`);
    expect(!OLD_NAME.test(text), 'old name still visible on the page');

    // The hero headline says what it does at every width; the header has no pitch line.
    const headline = page.getByRole('heading', { level: 1, name: HEADLINE });
    expect(await headline.isVisible(), 'hero headline hidden at 1280 px');
    expect((await page.locator('header').getByText(PITCH).count()) === 0, 'the header still has the pitch line');
    await screenshot('header-light-desktop', await header(page));
    if (cvd) {
      await cvd('deuteranopia');
      await screenshot('header-deuteranopia', await header(page));
      await cvd(null);
    }
    await page.setViewportSize({ width: 1024, height: 800 });
    expect(await headline.isVisible(), 'hero headline hidden at 1024 px');
    await page.setViewportSize(viewports.desktop);

    // With the fonts blocked the wordmark still reads (font-display: swap, a system fallback).
    // Answered with an empty font rather than aborted: an aborted request logs a console error.
    await page.route('**/*.woff2', (route) => route.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
    await load(page, origin);
    const noFont = await page.evaluate(() => document.fonts.check('600 14px "IBM Plex Sans"'));
    expect(!noFont, 'font still loaded although the request was blocked');
    expect((await logo.isVisible()) && (await logo.textContent()) === 'spec2skill', 'wordmark unreadable without the font');
    await page.unroute('**/*.woff2');
    await load(page, origin);

    // A choice stored by the old theme toggle (either key) is ignored: the theme follows the system.
    await page.evaluate(() => (localStorage.clear(), localStorage.setItem('tool-atlas:theme', 'dark'), localStorage.setItem('spec2skill:theme', 'dark')));
    await load(page, origin);
    const theme = await page.evaluate(() => [document.documentElement.hasAttribute('data-theme'), getComputedStyle(document.body).backgroundColor]);
    expect(theme.join() === 'false,rgb(252, 252, 252)', `a stored theme still applies: ${theme}`);
    await page.evaluate(() => localStorage.clear());
    await page.emulateMedia({ colorScheme: 'dark' });
    await screenshot('header-dark-desktop', await header(page));
    await page.emulateMedia({ colorScheme: 'light' });

    // The wordmark at device scale factor 2 (its own context, same offline guard), for kerning.
    const hiDpi = await context.browser().newContext({ viewport: viewports.desktop, deviceScaleFactor: 2 });
    await hiDpi.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));
    const sharp = await hiDpi.newPage();
    await load(sharp, origin);
    const box = await sharp.locator('header .wordmark').boundingBox();
    await screenshot('wordmark-2x', { page: sharp, clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 } });
    await hiDpi.close();

    await page.setViewportSize(viewports.mobile);
    await load(page, origin);
    expect(await headline.isVisible(), 'hero headline hidden at 390 px');
    await screenshot('header-mobile', await header(page));
  },
};
