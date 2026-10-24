// No motion outside DESIGN.md 7's table (redesign R6, D67): every transition and animation in the app's
// CSS is one of the listed moments, ease-out at 250 ms (a workflow segment 300), every animation is
// declared only under prefers-reduced-motion: no-preference, nothing scrolls smoothly, and no script
// animates or sets a transition. The checks are functions, proven on fixture strings, then run on every
// CSS file under src, index.html's <style> and style attributes, and every .ts and .tsx under src.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import appCss from '../app.css?raw';
import tokensCss from './tokens.css?raw';
import { TIMING, enterMs } from './motion';

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const NO_PREFERENCE = '@media (prefers-reduced-motion: no-preference)';

/** The bodies of every `@media (prefers-reduced-motion: no-preference) {` block, matched by braces, and the source without them. */
function split(css: string): { body: string; rest: string } {
  let rest = css;
  let body = '';
  for (let start = rest.indexOf(NO_PREFERENCE); start >= 0; start = rest.indexOf(NO_PREFERENCE)) {
    const open = rest.indexOf('{', start);
    let depth = 0;
    let end = -1;
    for (let i = open; i < rest.length && end < 0; i++) {
      if (rest[i] === '{') depth++;
      else if (rest[i] === '}' && --depth === 0) end = i;
    }
    if (end < 0) throw new Error('unclosed no-preference block');
    body += rest.slice(open + 1, end);
    rest = rest.slice(0, start) + rest.slice(end + 1);
  }
  return { body, rest };
}

/** Every declaration whose property matches `prop` (a regex source), with its rule's selector (@media wrappers dropped, @keyframes skipped). */
function declarations(css: string, prop: string): { selector: string; prop: string; value: string }[] {
  const flat = css.replace(/@(?:-[a-z]+-)?keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/@media[^{]*\{/g, '');
  const out: { selector: string; prop: string; value: string }[] = [];
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const d of m[2]!.matchAll(new RegExp(`(?:^|;)\\s*(${prop})\\s*:\\s*([^;]+)`, 'g'))) out.push({ selector: m[1]!.trim(), prop: d[1]!, value: d[2]!.trim() });
  }
  return out;
}

/** The hover-or-focus moment (D67): rows and links fade while a map row (or the pointer on a list row) is hot and 250 ms after. */
const TRANSITIONS = [
  '.route:is([data-hot], [data-fading]) .ln | transition: stroke var(--motion-map) ease-out',
  '.route:is([data-hot], [data-fading]) .op | transition: background-color var(--motion-map) ease-out',
  '.route:is([data-hot], [data-fading]) :is(.op .m, .op .id, .rc-name) | transition: color var(--motion-map) ease-out',
  '.lrow:hover, .list:is([data-hover], [data-fading]) .lrow | transition: background-color var(--motion-map) ease-out',
];
/** The table's moments: the load sequence (map and list), the hover's links and card, the label swaps, the spinner. */
const ANIMATIONS = [
  '[data-enter] .rc', '[data-enter] .links', '[data-enter] :is(.halo, .wf)', '[data-enter] .wf', '[data-enter] .op[data-route]::after',
  '[data-enter] .checks li', '[data-enter] .lgroup', '[data-enter] .audit-row', '.ln-hot', '.op-card', '.swap', '.spinner',
];

/** An optional vendor prefix on a property (`-webkit-transition`). */
const PREFIX = '(?:-(?:webkit|moz|ms|o)-)?';

/** Everything in `css` that moves outside DESIGN.md 7's table, as readable problems. */
function cssMotionProblems(source: string): string[] {
  const css = strip(source);
  const { body, rest } = split(css);
  const problems: string[] = [];
  for (const d of declarations(rest, `${PREFIX}transition(?:-[\\w-]+)?`)) {
    const line = `${d.selector} | ${d.prop}: ${d.value}`;
    if (!TRANSITIONS.includes(line)) problems.push(`transition not in the table: ${line}`);
  }
  for (const d of declarations(rest, `${PREFIX}animation(?:-[\\w-]+)?`)) problems.push(`animation outside ${NO_PREFERENCE}: ${d.selector} | ${d.prop}`);
  for (const d of declarations(body, `${PREFIX}transition(?:-[\\w-]+)?`)) problems.push(`transition not in the table: ${d.selector} | ${d.prop}: ${d.value}`);
  for (const d of declarations(body, `${PREFIX}animation(?:-[\\w-]+)?`)) {
    if (d.prop !== 'animation') {
      problems.push(`animation longhand: ${d.selector} | ${d.prop}`);
      continue;
    }
    if (!ANIMATIONS.includes(d.selector)) problems.push(`animation not in the table: ${d.selector}`);
    for (const one of d.value.split(/,(?![^(]*\))/)) {
      const [name, duration, easing] = one.trim().split(/\s+/);
      const want = name === 's2-spin' ? ['800ms', 'linear'] : name === 's2-nomark' ? ['0s', 'linear'] : [name === 's2-draw' ? 'var(--motion-draw)' : 'var(--motion-map)', 'ease-out'];
      if (duration !== want[0] || easing !== want[1]) problems.push(`${d.selector}: ${name} ${duration} ${easing}, want ${want.join(' ')}`);
      if (one.includes('infinite') !== (name === 's2-spin')) problems.push(`${d.selector}: ${name} loops (only the spinner may)`);
    }
  }
  if (/scroll-behavior\s*:\s*smooth/.test(css)) problems.push('scroll-behavior: smooth');
  const defined = [...css.matchAll(/@(?:-[a-z]+-)?keyframes ([\w-]+)/g)].map((m) => m[1]!);
  const used = new Set([...body.matchAll(/\b(s2-[\w-]+)/g)].map((m) => m[1]!));
  for (const k of defined) if (!used.has(k)) problems.push(`unused keyframes ${k}`);
  for (const k of used) if (!defined.includes(k)) problems.push(`undefined keyframes ${k}`);
  return problems;
}

/** Scripts that move things: element.animate(), smooth scrolling, a transition or animation set from code. */
function scriptMotionProblems(files: Record<string, string>): string[] {
  const problems: string[] = [];
  const rules: [RegExp, string][] = [
    [/\.animate\(/, 'element.animate()'],
    [/KeyframeEffect|new Animation\(/, 'a Web Animation built in code'],
    [/<animate/, 'an SVG <animate>'],
    [/[bB]ehavior\s*:\s*['"]smooth/, 'smooth scrolling'],
    [/setProperty\(\s*['"](?:-(?:webkit|moz|ms|o)-)?(?:transition|animation)/, 'a transition or animation set with setProperty'],
    [/\.style\.(?:webkit|Webkit|moz|Moz|ms)?(?:[tT]ransition|[aA]nimation)\w*\s*=(?!=)/, 'a transition or animation assigned to .style'],
    [/(?:cssText\s*=|setAttribute\(\s*['"]style['"]).*(?:transition|animation)/, 'a transition or animation in a style string'],
    [/(?:^|[{,\s])['"]?(?:(?:-(?:webkit|moz|ms|o)-)?(?:transition|animation)|(?:Webkit|Moz|ms|O|webkit)(?:Transition|Animation))(?:[A-Z]\w*|-[\w-]+)?['"]?\s*:/m, 'a transition or animation style key'],
  ];
  for (const [path, source] of Object.entries(files)) {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const [re, what] of rules) if (re.test(code)) problems.push(`${path}: ${what}`);
  }
  return problems;
}

/** Every CSS file (by path) and index.html's <style> blocks and style attributes, each checked on its own. */
function sheetProblems(sheets: Record<string, string>, html: string): string[] {
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]!).join('\n');
  const attrs = [...html.matchAll(/\sstyle\s*=\s*(["'])([^"']*)\1/gi)].filter((m) => /(?:transition|animation|scroll-behavior)/.test(m[2]!)).map((m) => `index.html: a style attribute moves: ${m[2]}`);
  return [
    ...Object.entries({ ...sheets, 'index.html <style>': inline }).flatMap(([path, css]) => cssMotionProblems(css).map((p) => `${path}: ${p}`)),
    ...attrs,
  ];
}

describe('the motion guard catches what DESIGN.md 7 does not list', () => {
  const ok = `.ln-hot { stroke: red; }\n${NO_PREFERENCE} { .swap { animation: s2-fade var(--motion-map) ease-out both; } }\n@keyframes s2-fade { from { opacity: 0; } }`;
  it('passes a clean fixture', () => expect(cssMotionProblems(ok)).toEqual([]));
  it.each([
    ['a longhand transition', '.btn { transition-property: color; transition-duration: 250ms; }', /transition not in the table: \.btn \| transition-property/],
    ['a transition not in the list', '.btn { transition: color var(--motion-map) ease-out; }', /transition not in the table: \.btn/],
    ['a vendor-prefixed transition', '.btn { -webkit-transition: color 250ms ease-out; }', /transition not in the table: \.btn \| -webkit-transition/],
    ['a vendor-prefixed animation', `${NO_PREFERENCE} { .swap { -webkit-animation: s2-fade var(--motion-map) ease-out both; } }`, /animation longhand: \.swap \| -webkit-animation/],
    ['a transition inside the no-preference block', `${NO_PREFERENCE} { .btn { transition: color 250ms ease-out; } }`, /transition not in the table: \.btn/],
    ['smooth scrolling', 'html { scroll-behavior: smooth; }', /scroll-behavior: smooth/],
    ['an animation outside the no-preference block', '.swap { animation: s2-fade var(--motion-map) ease-out both; }', /animation outside/],
    ['an animation not in the table', `${NO_PREFERENCE} { .btn { animation: s2-fade var(--motion-map) ease-out both; } }`, /animation not in the table: \.btn/],
    ['an animation longhand', `${NO_PREFERENCE} { .swap { animation-delay: 1s; } }`, /animation longhand/],
    ['a loop', `${NO_PREFERENCE} { .swap { animation: s2-fade var(--motion-map) ease-out infinite; } }`, /loops/],
    ['a linear easing', `${NO_PREFERENCE} { .swap { animation: s2-fade var(--motion-map) linear both; } }`, /want var\(--motion-map\) ease-out/],
    ['an unused keyframe', '@keyframes s2-wobble { to { opacity: 0; } }', /unused keyframes s2-wobble/],
  ])('fails %s', (_label, extra, problem) => {
    expect(cssMotionProblems(`${ok}\n${extra}`).join('\n')).toMatch(problem);
  });
  it.each([
    ['element.animate()', 'el.animate([{ opacity: 0 }], 250);', /element\.animate/],
    ['smooth scrollIntoView', "el.scrollIntoView({ behavior: 'smooth' });", /smooth scrolling/],
    ['setProperty transition', "el.style.setProperty('transition', 'opacity 1s');", /setProperty/],
    ['a transition style key (.tsx)', "<div style={{ transition: 'opacity 1s' }} />", /style key/],
    ['an animation style key (.ts)', "const s = { animationDuration: '1s' };", /style key/],
    ['a vendor-prefixed style key', "<div style={{ WebkitTransition: 'opacity 1s' }} />", /style key/],
    ['.style.transition assigned', "el.style.transition = 'opacity 1s';", /assigned to \.style/],
    ['.style.animationName assigned', "el.style.animationName = 'x';", /assigned to \.style/],
    ['cssText with a transition', "el.style.cssText = 'transition: opacity 1s';", /style string/],
    ['an SVG <animate>', '<circle><animate attributeName="r" dur="1s" /></circle>', /SVG <animate>/],
    ['new Animation(new KeyframeEffect(...))', 'new Animation(new KeyframeEffect(el, [{ opacity: 0 }], 250)).play();', /Web Animation/],
    ['smooth scrolling as a style key', "<div style={{ scrollBehavior: 'smooth' }} />", /smooth scrolling/],
  ])('fails %s in a script', (_label, code, problem) => {
    expect(scriptMotionProblems({ 'x.tsx': code }).join('\n')).toMatch(problem);
  });
  it.each([
    ['a transition in tokens.css', { 'design/tokens.css': ':root { --x: 1px; }\n.a { transition: color 1s; }' }, '', /design\/tokens\.css: transition not in the table: \.a/],
    ['a new .css file under src', { 'map/new.css': '.b { animation: s2-x 1s; }\n@keyframes s2-x { to { opacity: 0; } }' }, '', /map\/new\.css: animation outside/],
    ["a <style> in index.html", {}, '<html><head><style>body { transition: background 1s; }</style></head></html>', /index\.html <style>: transition not in the table: body/],
    ['a style attribute in index.html', {}, '<body style="animation: x 1s"></body>', /index\.html: a style attribute moves/],
  ])('fails %s', (_label, sheets, html, problem) => {
    expect(sheetProblems(sheets, html).join('\n')).toMatch(problem);
  });
  it('ignores the words in comments', () => expect(scriptMotionProblems({ 'x.ts': '// transition: none\n/* animation: x */ const a = 1;' })).toEqual([]));
});

describe('motion (DESIGN.md 7)', () => {
  it('every CSS file under src and index.html move only as the table says', () => {
    const root = join(__dirname, '..');
    const sheets = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.css'));
    expect(sheets).toEqual(expect.arrayContaining(['app.css', join('design', 'tokens.css')]));
    const html = readFileSync(join(root, '..', 'index.html'), 'utf8');
    expect(sheetProblems(Object.fromEntries(sheets.map((f) => [f, readFileSync(join(root, f), 'utf8')])), html)).toEqual([]);
    expect(cssMotionProblems(appCss)).toEqual([]);
  });

  it('no script animates, scrolls smoothly or sets a transition', () => {
    const root = join(__dirname, '..');
    const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.startsWith('skillgen/assets'));
    expect(scriptMotionProblems(Object.fromEntries(files.map((f) => [f, readFileSync(join(root, f), 'utf8')])))).toEqual([]);
  });

  it("uses TIMING's delays in the CSS: 40 ms a column, links at 200, the route at 450, a segment 300, audit rows at 900 and 30 apart", () => {
    const { body } = split(strip(appCss));
    const anim = (selector: string) => declarations(body, 'animation').find((d) => d.selector === selector)?.value ?? '';
    expect(anim('[data-enter] .rc')).toContain(`calc(min(var(--col, 0), 8) * ${TIMING.column}ms)`);
    expect(anim('[data-enter] .lgroup')).toContain(`calc(min(var(--g, 0), 8) * ${TIMING.column}ms)`);
    expect(anim('[data-enter] .links')).toContain(` ${TIMING.links}ms both`);
    expect(anim('[data-enter] .wf')).toContain(`calc(${TIMING.route}ms + var(--i, 0) * var(--motion-draw))`);
    expect(anim('[data-enter] .op[data-route]::after')).toContain(`calc(${TIMING.route}ms + (var(--stop, 1) - 1) * var(--motion-draw))`);
    expect(anim('[data-enter] .checks li')).toContain(`calc(${TIMING.audit}ms + var(--i, 0) * ${TIMING.check}ms)`);
    expect(anim('[data-enter] .audit-row')).toContain(` ${TIMING.audit}ms both`);
  });

  it('uses the 250 ms base and 300 ms segment, both 0 ms under reduced motion', () => {
    expect(tokensCss).toMatch(/--motion-map: 250ms; --motion-draw: 300ms;/);
    const reduce = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(strip(tokensCss))?.[1] ?? '';
    expect(reduce).toMatch(/--motion-map: 0ms; --motion-draw: 0ms;/);
    expect([TIMING.base, TIMING.segment]).toEqual([250, 300]);
  });

  it('keeps data-enter until the last stop disc has popped, and at least 2 s', () => {
    expect(enterMs(0)).toBe(2000);
    expect(enterMs(3)).toBe(2000); // 450 + 900 + 250 + 200 = 1800
    expect(enterMs(6)).toBe(450 + 6 * 300 + 250 + 200);
  });
});
