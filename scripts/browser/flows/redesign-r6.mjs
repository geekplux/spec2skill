// Redesign R6: motion and button states, DESIGN.md section 7 (V2Motion).
// Checks the load sequence on a sample switch in real time (cards hidden or rising at t = 0, the
// workflow's dash offset running from 1 to 0, the end state by 2 s after the map's mount: nothing
// running, every card, link, segment, arrowhead and stop disc in place) and records it as three frames
// (the animations paused and sought to 150 and 600 ms, then the end); that it plays again for Generate
// and a sample switch but not for a hover, a search, a view toggle, "N more" or a resize; the hover
// timing (rows and links fade, the hot links and the card fade in, the card rising 4 px, 250 ms) and
// that a theme change or a search alone snaps; Generate on a slow URL (the synthetic 1000-operation
// spec behind an 800 ms answer, the CPU throttled 4x): the button names Fetching, Parsing and then the
// later stages it shows, in pipeline order, with a spinner, at one width, each announced, the previous
// result greyscale meanwhile, then the new result with the load sequence; no stage label on sample
// switches; Copied (Install command, the command-line box) and Downloaded fading in and back after
// 2 s; the list on phones (groups rise, the audit row fades in); the synthetic map's sequence
// (one animation per card, links as one layer); and under reducedMotion 'reduce' nothing at all
// (no running animation or transition at t = 0, the end state at once, a still spinner), with the
// DESIGN.md section 8 motion check. Saves WebP shots in docs/screenshots/redesign-r6/.
//   pnpm build && pnpm check:browser -- --phase 21 --flow redesign-r6 --capture redesign-r6
/* oxlint-disable unicorn/consistent-function-scoping -- page.evaluate callbacks are serialised: their helpers stay inside */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { designChecks, settled } from '../redesign-checks.mjs';
import { ROOT } from '../session.mjs';

const OUT = join(ROOT, 'docs', 'screenshots', 'redesign-r6');
const SLOW = 'https://specs.example.test/synthetic.json';
const STAGES = ['Fetching', 'Parsing', 'Relating', 'Writing', 'Auditing'];

const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

async function ready(page, url) {
  if (url) await page.goto(url, { waitUntil: 'load' });
  await page.locator('.skill-browser[data-ready="true"]').waitFor();
  await page.locator('[data-testid="atlas"][data-ready="true"], [data-testid="list-view"]').first().waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
}
/** The sequence is over: `data-enter` is gone and nothing one-shot runs. */
async function rest(page) {
  await page.waitForFunction(() => !document.querySelector('[data-enter]'), null, { timeout: 5000 });
  await settled(page);
}

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

/** Runs in the page: what animates now, and the state of the map's moving parts. */
function snapshot() {
  const describe = (el) => {
    if (!el) return '?';
    const cls = typeof el.className === 'string' ? el.className : el.className?.baseVal ?? '';
    return `${el.tagName.toLowerCase()}${cls ? `.${cls.trim().split(/\s+/).join('.')}` : ''}`;
  };
  const anims = document.getAnimations().map((a) => ({
    kind: a.constructor.name, name: a.animationName ?? a.transitionProperty, state: a.playState, time: a.currentTime,
    target: describe(a.effect?.target) + (a.effect?.pseudoElement ?? ''), duration: a.effect?.getTiming().duration, iterations: a.effect?.getTiming().iterations,
  }));
  const num = (v) => parseFloat(v);
  const cards = [...document.querySelectorAll('.rc')].map((c) => ({ column: Number(c.dataset.column), opacity: num(getComputedStyle(c).opacity), transform: getComputedStyle(c).transform }));
  const wf = [...document.querySelectorAll('.wf')].map((p) => ({ offset: num(getComputedStyle(p).strokeDashoffset), opacity: num(getComputedStyle(p).opacity), marker: getComputedStyle(p).markerEnd }));
  const discs = [...document.querySelectorAll('.op[data-route]')].map((b) => ({ stop: Number(b.dataset.route), opacity: num(getComputedStyle(b, '::after').opacity), transform: getComputedStyle(b, '::after').transform }));
  const links = num(getComputedStyle(document.querySelector('.links') ?? document.body).opacity);
  const checks = [...document.querySelectorAll('.checks li')].map((li) => num(getComputedStyle(li).opacity));
  return { enter: !!document.querySelector('[data-enter]'), anims, cards, wf, discs, links, checks };
}
/** No transform: none, or the identity a filling animation leaves. */
const flat = (t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
const running = (snap) => snap.anims.filter((a) => a.state === 'running' || a.state === 'pending');
const ofSequence = (a) => /^s2-(rise|draw|pop|nomark)$/.test(a.name) && !/op-card/.test(a.target) || (a.name === 's2-fade' && /links|checks|li|audit-row/.test(a.target));

export default {
  name: 'redesign-r6',
  phase: 21,
  async run({ page, context, origin, outDir, capture }) {
    const dir = capture ? OUT : outDir;
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    const sample = (name) => page.getByRole('radiogroup', { name: 'Samples' }).getByText(name, { exact: true });
    const title = page.locator('#result-title');

    // 1. The first view plays the sequence too, then rests.
    await ready(page, `${origin}/?sample=tasks`);
    await rest(page);
    await page.mouse.move(0, 0);

    // 2. A sample switch, in real time: at t = 0 the far cards are hidden or rising and the line is not drawn.
    await sample('Petstore').click();
    await title.filter({ hasText: /^Swagger Petstore$/ }).waitFor();
    await rest(page);
    const offsets = page.evaluate(() => new Promise((done) => {
      // The first segment's dash offset each frame, from the new map's mount for 1.5 s.
      const seen = [];
      const start = performance.now();
      const tick = () => {
        const p = document.querySelector('.sheet[data-enter] .wf');
        if (p) seen.push([Math.round(performance.now() - start), Math.round(parseFloat(getComputedStyle(p).strokeDashoffset) * 100) / 100]);
        if (performance.now() - start < 1500) requestAnimationFrame(tick);
        else done(seen);
      };
      requestAnimationFrame(tick);
    }));
    await sample('Tasks API').click();
    await title.filter({ hasText: /^Tasks API$/ }).waitFor();
    const t0 = await page.evaluate(snapshot);
    const far = t0.cards.filter((c) => c.column >= 2);
    expect(t0.enter && far.length > 0 && far.every((c) => c.opacity < 1 || !flat(c.transform)), `t = 0: far cards already in place ${JSON.stringify(t0.cards)}`);
    expect(t0.wf.length === 2 && t0.wf.every((w) => w.offset > 0.5 && w.marker === 'none'), `t = 0: the workflow is already drawn ${JSON.stringify(t0.wf)}`);
    expect(t0.discs.every((d) => d.opacity < 1), `t = 0: stop discs already shown ${JSON.stringify(t0.discs)}`);
    const names = new Set(running(t0).map((a) => a.name));
    expect(['s2-rise', 's2-fade', 's2-draw', 's2-pop'].every((n) => names.has(n)), `t = 0: the sequence is not running (${[...names]})`);
    // Every card rises in 250 ms, column by column 40 ms apart; one animation for the whole link layer.
    // (Animations that already ended still fill, so they are listed too.)
    const rises = t0.anims.filter((a) => a.name === 's2-rise' && a.target.startsWith('div.rc'));
    expect(rises.length === t0.cards.length && rises.every((a) => a.duration === 250), `card rises ${JSON.stringify(rises)}`);
    expect(t0.anims.filter((a) => a.target.startsWith('svg.links')).length === 1, 'the links do not fade in as one layer');
    const drawn = await offsets;
    const values = drawn.map(([, v]) => v);
    expect(values.length > 5 && values[0] >= 0.99 && values.at(-1) === 0 && values.some((v) => v > 0.05 && v < 0.95), `the first segment does not draw: ${JSON.stringify(drawn)}`);
    expect(values.every((v, i) => i === 0 || v <= values[i - 1] + 1e-9), `the dash offset goes back: ${JSON.stringify(drawn)}`);
    const startAt = drawn.find(([, v]) => v < 0.99)?.[0];
    console.log(`  first segment starts drawing at ${startAt} ms, done at ${drawn.find(([, v]) => v === 0)?.[0]} ms`);
    // Timed from the map's mount (when the first column's rise starts on document.timeline): every one-shot
    // animation is planned to end by 2 s (the last disc pops by 1.3 s, the last audit row by 1.4 s) and has finished by then.
    const timing = await page.evaluate(async () => {
      const mount = document.querySelector('.rc[data-column="0"]').getAnimations()[0].startTime;
      const list = document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity);
      const planned = Math.max(...list.map((a) => a.startTime + a.effect.getComputedTiming().endTime)) - mount;
      const left = Math.max(0, mount + 2000 - document.timeline.currentTime);
      const done = await Promise.race([
        Promise.all(list.map((a) => a.finished.catch(() => {}))).then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), left + 50)),
      ]);
      return { planned: Math.round(planned), done, at: Math.round(document.timeline.currentTime - mount) };
    });
    console.log(`  the sequence is planned to end ${timing.planned} ms after mount; all finished by ${timing.at} ms`);
    expect(timing.planned <= 2000 && timing.done, `the sequence does not end by 2 s after mount: ${JSON.stringify(timing)}`);
    const end = await page.evaluate(snapshot);
    expect(running(end).length === 0, `end: still running ${JSON.stringify(running(end))}`);
    expect(end.cards.every((c) => c.opacity === 1 && flat(c.transform)) && end.links === 1, `end: cards or links not in place ${JSON.stringify(end.cards)}`);
    expect(end.wf.every((w) => w.offset === 0 && w.opacity === 1 && w.marker.startsWith('url(')) && end.discs.length === 3 && end.discs.every((d) => d.opacity === 1 && flat(d.transform)), `end: workflow ${JSON.stringify(end.wf)} ${JSON.stringify(end.discs)}`);
    expect(end.checks.length === 9 && end.checks.every((o) => o === 1), `end: audit rows ${JSON.stringify(end.checks)}`);
    await rest(page);

    // 3. Three frames of the sequence (V2Motion): every animation paused and sought to the same time.
    const box = await page.evaluate(() => {
      const f = document.querySelector('#result').getBoundingClientRect();
      const map = (document.querySelector('.caption') ?? document.querySelector('.sheet')).getBoundingClientRect();
      return { x: Math.max(0, f.left - 24), y: f.top + window.scrollY - 24, width: f.width + 48, height: map.bottom - f.top + 56 };
    });
    const shot = { clip: box, fullPage: true };
    await sample('Petstore').click();
    await title.filter({ hasText: /^Swagger Petstore$/ }).waitFor();
    await rest(page);
    await sample('Tasks API').click();
    await title.filter({ hasText: /^Tasks API$/ }).waitFor();
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
    for (const ms of [150, 600]) {
      const at = await page.evaluate((time) => {
        const list = document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity);
        for (const a of list) a.currentTime = time;
        return list.length;
      }, ms);
      const s = await page.evaluate(snapshot);
      const col = (n) => s.cards.find((c) => c.column === n).opacity;
      // 150 ms: the first column nearly in, the last still rising, no links, no line yet.
      if (ms === 150) expect(col(0) > col(3) && col(3) < 1 && s.links === 0 && s.wf.every((w) => w.offset === 1), `150 ms: ${JSON.stringify(s.cards)} links ${s.links} ${JSON.stringify(s.wf)}`);
      // 600 ms: cards and links in, the first segment half drawn, the first disc popping, the second segment waiting.
      else expect(s.cards.every((c) => c.opacity === 1) && s.links === 1 && s.wf[0].offset > 0 && s.wf[0].offset < 1 && s.wf[1].offset === 1 && s.discs.find((d) => d.stop === 1).opacity > 0.5 && s.discs.find((d) => d.stop === 2).opacity === 0, `600 ms: links ${s.links} ${JSON.stringify(s.wf)} ${JSON.stringify(s.discs)}`);
      console.log(`  frame at ${ms} ms (${at} animations sought)`);
      await webp(page, `load-${String(ms).padStart(4, '0')}ms-1440-light`, dir, shot);
    }
    await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
    await rest(page);
    await webp(page, 'load-end-1440-light', dir, shot);

    // 4. Played once: not on hover, search, view toggle, resize; again for Generate.
    const replayed = async (label, act) => {
      await act();
      await page.waitForTimeout(60);
      const s = await page.evaluate(snapshot);
      expect(!s.enter && !running(s).some(ofSequence), `${label} replays the load sequence: ${JSON.stringify(running(s).filter(ofSequence))}`);
    };
    await replayed('hover', () => page.locator('.op[data-op="getTask"]').hover());
    // Hover or focus (250 ms): rows and links fade, the hot links and the card fade in, the card rises 4 px.
    const hover = await page.evaluate(snapshot);
    const hot = running(hover);
    expect(hot.some((a) => a.name === 's2-rise' && /op-card/.test(a.target) && a.duration === 250), `hover: the card does not rise ${JSON.stringify(hot)}`);
    expect(hot.some((a) => a.name === 's2-fade' && a.target.startsWith('path.ln-hot') && a.duration === 250), `hover: the hot links do not fade in ${JSON.stringify(hot)}`);
    const fades = await page.evaluate(() => [getComputedStyle(document.querySelector('.op .id')).transition, getComputedStyle(document.querySelector('.ln')).transition, getComputedStyle(document.querySelector('.op')).transition]);
    expect(fades.every((t) => /0\.25s ease-out/.test(t)), `hover fades: ${fades}`);
    await page.mouse.move(0, 0);
    await rest(page);
    // The hover has ended (it lingers 150 ms) and its fade back is over.
    await page.waitForFunction(() => !document.querySelector('.route:is([data-hot], [data-fading])'), null, { timeout: 1000 });
    await settled(page);
    // Only the hover moment fades (D67): a theme change and a search's dimming snap.
    const transitions = () => page.evaluate(() => document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => `${a.transitionProperty} on ${a.effect?.target?.tagName.toLowerCase()}.${a.effect?.target?.getAttribute('class') ?? ''}`));
    await page.emulateMedia({ colorScheme: 'dark' });
    const themed = await transitions();
    await page.emulateMedia({ colorScheme: 'light' });
    expect(themed.length === 0 && (await transitions()).length === 0, `a theme change fades: ${themed}`);
    await replayed('search', async () => {
      await page.locator('#search-q').fill('task');
      await page.locator('.op[data-dim]').first().waitFor({ state: 'attached' });
      const dimmed = await transitions();
      expect(dimmed.length === 0, `the search's dimming fades: ${dimmed}`);
      await page.waitForTimeout(500);
    });
    await page.locator('#search-q').fill('');
    await rest(page);
    const view = (name) => page.getByRole('tablist', { name: 'View' }).getByRole('tab', { name });
    await replayed('the List view', () => view('List').click());
    // A list row's grey fades in on hover and back out after it, like the map's rows; at rest a theme change snaps.
    const rowFades = () => page.evaluate(() => document.getAnimations().filter((a) => a instanceof CSSTransition && a.effect?.target?.classList.contains('lrow')).map((a) => a.transitionProperty));
    await page.locator('.lrow').nth(1).hover();
    await page.waitForTimeout(60);
    const rowIn = await rowFades();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(60);
    const rowOut = await rowFades();
    expect(rowIn.includes('background-color') && rowOut.includes('background-color'), `a list row's grey does not fade both ways: in ${rowIn}, out ${rowOut}`);
    await page.waitForFunction(() => !document.querySelector('.list:is([data-hover], [data-fading])'), null, { timeout: 1000 });
    await settled(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    const listThemed = await transitions();
    await page.emulateMedia({ colorScheme: 'light' });
    expect(listThemed.length === 0, `a theme change fades in the list: ${listThemed}`);
    await replayed('the Map view', () => view('Map').click());
    await replayed('a resize', () => page.setViewportSize({ width: 1280, height: 1000 }));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await rest(page);
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.sheet[data-enter]'));
    expect(running(await page.evaluate(snapshot)).some((a) => a.name === 's2-rise'), 'Generate does not play the load sequence');
    await rest(page);

    // 5. Generate on a slow URL: the real stages in order, each announced, with a spinner; the previous
    //    result greyscale meanwhile; then the new result with the load sequence.
    const big = execFileSync(process.execPath, [join(ROOT, 'scripts', 'gen-synthetic-spec.mjs')], { maxBuffer: 16 * 1024 * 1024 }).toString();
    await page.route(SLOW, async (route) => {
      await new Promise((done) => setTimeout(done, 800));
      await route.fulfill({ body: big, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } }).catch(() => {});
    });
    // A machine 4x slower, so the stages that take a while on a slow laptop show here too.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const restWidth = await page.locator('.generate').evaluate((el) => el.getBoundingClientRect().width);
    await page.evaluate(() => {
      window.r6log = [];
      const start = performance.now();
      const log = (kind, text, width) => window.r6log.push({ t: Math.round(performance.now() - start), kind, text, width });
      const btn = document.querySelector('.generate');
      new MutationObserver(() => log('label', btn.textContent, btn.getBoundingClientRect().width)).observe(btn, { subtree: true, childList: true, characterData: true });
      const say = document.querySelector('[data-testid="announcer"]');
      new MutationObserver(() => say.textContent && log('said', say.textContent)).observe(say, { subtree: true, childList: true, characterData: true });
    });
    await page.locator('#source-field').fill(SLOW);
    await page.locator('#source-field').press('Enter');
    await page.locator('.generate[data-stage="Fetching"]').waitFor();
    const busy = await page.evaluate(() => ({
      spinner: getComputedStyle(document.querySelector('.generate .spinner')).animationName,
      size: document.querySelector('.generate .spinner').getAttribute('width'),
      grey: getComputedStyle(document.querySelector('#result > .stage-content')).filter,
    }));
    expect(busy.spinner === 's2-spin' && busy.size === '16' && busy.grey === 'grayscale(1)', `loading: ${JSON.stringify(busy)}`);
    await settled(page); // the label has faded in (the spinner keeps turning)
    await webp(page, 'generate-fetching-1440-light', dir, { clip: await page.evaluate(() => {
      const b = document.querySelector('.load').getBoundingClientRect();
      return { x: b.left - 24, y: b.top - 24, width: b.width + 48, height: b.height + 48 };
    }) });
    await title.filter({ hasText: /^Synthetic/ }).waitFor({ timeout: 40_000 });
    expect(await page.evaluate(() => !!document.querySelector('.sheet[data-enter]')), 'the new result does not play the load sequence');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
    await rest(page);
    const log = await page.evaluate(() => window.r6log);
    const changes = log.filter((e) => e.kind === 'label');
    const labels = changes.map((e) => e.text).filter((t, i, all) => t !== all[i - 1]);
    console.log(`  Generate labels (CPU 4x slower): ${changes.map((e) => `${e.text}@${e.t}`).join(', ')}`);
    // Fetching, then Parsing (the parse of 1000 operations always takes over 100 ms), then whichever later
    // stages lasted past the 100 ms floor, in pipeline order, and back to Generate.
    expect(labels[0] === 'Fetching' && labels[1] === 'Parsing' && labels.at(-1) === 'Generate', `labels ${labels}`);
    const stages = labels.slice(0, -1);
    expect(stages.every((s, i) => STAGES.includes(s) && (i === 0 || STAGES.indexOf(s) > STAGES.indexOf(stages[i - 1]))), `stages not in order: ${stages}`);
    // The button keeps its resting width through every stage, so the field beside it holds still.
    expect(changes.every((e) => Math.abs(e.width - restWidth) < 0.5), `Generate changes width: rest ${restWidth}, ${changes.map((e) => `${e.text} ${e.width}`).join(', ')}`);
    // From about 1007 px (a field content box of 396 px) Generate is 112 px at rest and through every
    // stage; from 960 to there it is 91 px at rest and 112 px through the stages, changing once each way.
    const generateWidths = async (width) => {
      await page.setViewportSize({ width, height: 900 });
      await rest(page);
      const before = await page.locator('.generate').evaluate((el) => el.getBoundingClientRect().width);
      await page.evaluate(() => {
        const btn = document.querySelector('.generate');
        window.r6widths = [];
        window.r6watch = new MutationObserver(() => window.r6widths.push({ stage: btn.dataset.stage ?? '', width: btn.getBoundingClientRect().width }));
        window.r6watch.observe(btn, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-stage'] });
      });
      await page.locator('#source-field').fill(SLOW);
      await page.locator('#source-field').press('Enter');
      await page.locator('.generate[data-stage]').waitFor();
      await page.locator('.generate[data-stage]').waitFor({ state: 'detached', timeout: 40_000 });
      const seen = await page.evaluate(() => (window.r6watch.disconnect(), window.r6widths));
      const staged = seen.filter((e) => e.stage);
      const after = await page.locator('.generate').evaluate((el) => el.getBoundingClientRect().width);
      console.log(`  Generate at ${width} px: ${Math.round(before * 100) / 100} at rest, ${[...new Set(staged.map((e) => `${e.stage} ${Math.round(e.width * 100) / 100}`))].join(', ')}`);
      expect(staged.length >= 2 && staged.every((e) => Math.abs(e.width - 112) < 0.5) && Math.abs(after - before) < 0.5, `${width}: Generate changes width through the stages: rest ${before}, ${JSON.stringify(seen)}, after ${after}`);
      return before;
    };
    const wide = await generateWidths(1024);
    expect(Math.abs(wide - 112) < 0.5, `1024: Generate is ${wide} px at rest, not the stages' 112`);
    const narrow = await generateWidths(980);
    expect(narrow < 100, `980: Generate is ${narrow} px at rest, which leaves the URL under 240 px`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await rest(page);
    for (const s of stages) expect(log.some((e) => e.kind === 'said' && e.text.startsWith(s) && e.text.endsWith('…')), `stage ${s} not announced: ${JSON.stringify(log.filter((e) => e.kind === 'said'))}`);
    // No stage label for a sample switch.
    await page.evaluate(() => (window.r6log = []));
    for (const name of ['Petstore', 'Filesystem MCP', 'Tasks API']) {
      await sample(name).click();
      await ready(page);
    }
    const flicker = await page.evaluate(() => window.r6log.filter((e) => e.kind === 'label'));
    expect(flicker.length === 0, `sample switches change the Generate label: ${JSON.stringify(flicker)}`);
    await rest(page);

    // 6. Copied and Downloaded: the new label fades in (250 ms), and back after 2 s.
    const swapOf = (btn) => btn.evaluate((el) => {
      const label = el.querySelector('.label');
      const a = label?.getAnimations()[0];
      return { text: el.textContent, swap: label?.classList.contains('swap'), name: a?.animationName, duration: a?.effect.getTiming().duration, check: !!el.querySelector('svg.i-check') };
    });
    const install = page.locator('.fhead-actions .btn').first();
    await install.click();
    await page.locator('.fhead-actions .btn', { hasText: /^Copied$/ }).waitFor({ timeout: 1500 });
    let swap = await swapOf(install);
    expect(swap.text === 'Copied' && swap.check && swap.swap && swap.name === 's2-fade' && swap.duration === 250, `Copied: ${JSON.stringify(swap)}`);
    await page.locator('.fhead-actions .btn', { hasText: /^Install command$/ }).waitFor({ timeout: 2600 });
    swap = await swapOf(install);
    expect(swap.swap && swap.name === 's2-fade', `back to Install command without the swap: ${JSON.stringify(swap)}`);
    const download = page.locator('.fhead-actions .btn.primary');
    await Promise.all([page.waitForEvent('download'), download.click()]);
    await page.locator('.fhead-actions .btn.primary', { hasText: /^Downloaded$/ }).waitFor();
    swap = await swapOf(download);
    expect(swap.text === 'Downloaded' && swap.check && swap.name === 's2-fade' && swap.duration === 250, `Downloaded: ${JSON.stringify(swap)}`);
    const back = Date.now();
    await page.locator('.fhead-actions .btn.primary', { hasText: /^Download \.zip$/ }).waitFor({ timeout: 2600 });
    expect(Date.now() - back > 1500, 'Downloaded went back too soon');
    await rest(page);
    // The command-line box's copy button: a check for 2 s, named "Commands copied", fading in.
    const cli = page.locator('#cli .cli .icon-btn');
    await cli.scrollIntoViewIfNeeded();
    await cli.click();
    await page.locator('#cli .icon-btn[aria-label="Commands copied"]').waitFor({ timeout: 1500 });
    swap = await swapOf(cli);
    const pasted = await page.evaluate(() => navigator.clipboard.readText());
    expect(swap.check && swap.swap && swap.name === 's2-fade' && swap.duration === 250 && pasted.split('\n').length === 3, `Commands copied: ${JSON.stringify(swap)} ${JSON.stringify(pasted)}`);
    const cliBack = Date.now();
    await page.locator('#cli .icon-btn[aria-label="Copy commands"]').waitFor({ timeout: 2600 });
    swap = await swapOf(cli);
    expect(Date.now() - cliBack > 1500 && !swap.check && swap.name === 's2-fade', `back to Copy commands: ${JSON.stringify(swap)}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await rest(page);

    // 7. Phones open on the list: its groups rise, 40 ms apart, and the audit row fades in.
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page, `${origin}/?sample=tasks`);
    await rest(page);
    await sample('Petstore').click();
    await title.filter({ hasText: /^Swagger Petstore$/ }).waitFor();
    const phone = await page.evaluate(snapshot);
    const groups = phone.anims.filter((a) => a.name === 's2-rise' && a.target.startsWith('section.lgroup'));
    expect(groups.length === 2 && !phone.anims.some((a) => a.target.startsWith('div.rc')), `phone sequence ${JSON.stringify(phone.anims)}`);
    await ready(page);
    const auditRow = await page.evaluate(snapshot);
    expect(auditRow.enter && auditRow.anims.some((a) => a.name === 's2-fade' && a.target.startsWith('button.audit-row')), `phone audit row ${JSON.stringify(auditRow.anims)}`);
    await rest(page);

    // 8. The synthetic spec: one rise per card (no per-row animation), the links one layer; it settles.
    await page.setViewportSize({ width: 1440, height: 900 });
    await ready(page, `${origin}/?sample=tasks`);
    await rest(page);
    await page.locator('#source-field').fill(big);
    await page.locator('#source-field').press('Enter');
    await title.filter({ hasText: /^Synthetic/ }).waitFor({ timeout: 20_000 });
    const syn = await page.evaluate(snapshot);
    console.log(`  synthetic: ${syn.cards.length} cards, ${syn.anims.length} animations in the sequence`);
    expect(syn.anims.filter((a) => a.name === 's2-rise').length === syn.cards.length && syn.anims.filter((a) => a.target.startsWith('svg.links')).length === 1, `synthetic: ${JSON.stringify(syn.anims.slice(0, 10))}`);
    await rest(page);
    await replayed('"N more"', () => page.locator('.op.more').first().click());

    // 9. Reduced motion: nothing animates, every state at once, a still spinner.
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await ready(page, `${origin}/?sample=petstore`);
    await sample('Tasks API').click();
    await title.filter({ hasText: /^Tasks API$/ }).waitFor();
    const still = await page.evaluate(snapshot);
    expect(running(still).length === 0, `reduced motion: running ${JSON.stringify(running(still))}`);
    expect(still.cards.every((c) => c.opacity === 1 && flat(c.transform)) && still.links === 1 && still.wf.every((w) => w.offset === 0 && w.marker.startsWith('url(')) && still.discs.every((d) => d.opacity === 1), `reduced motion: not in the end state at t = 0 ${JSON.stringify(still)}`);
    await page.locator('.op[data-op="getTask"]').hover();
    await page.getByTestId('op-preview').waitFor();
    expect(running(await page.evaluate(snapshot)).length === 0, 'reduced motion: hover animates');
    await page.mouse.move(0, 0);
    await install.click();
    await page.locator('.fhead-actions .btn', { hasText: /^Copied$/ }).waitFor({ timeout: 1500 });
    expect((await swapOf(install)).name === undefined, 'reduced motion: Copied fades');
    await page.locator('#source-field').fill(SLOW);
    await page.locator('#source-field').press('Enter');
    await page.locator('.generate[data-stage]').waitFor();
    const spin = await page.evaluate(() => ({ name: getComputedStyle(document.querySelector('.generate .spinner')).animationName, running: document.getAnimations().length }));
    expect(spin.name === 'none' && spin.running === 0, `reduced motion: the spinner turns ${JSON.stringify(spin)}`);
    await title.filter({ hasText: /^Synthetic/ }).waitFor({ timeout: 20_000 });
    const problems = await designChecks(page, { theme: 'light', label: 'reduced motion after Generate', checks: ['motion'] });
    expect(problems.length === 0, `DESIGN.md section 8 check 7:\n${problems.join('\n')}`);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.unroute(SLOW);
  },
};
