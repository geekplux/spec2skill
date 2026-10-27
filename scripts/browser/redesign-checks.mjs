// The automated acceptance checks of docs/DESIGN.md section 8, for any page a flow has
// open (reused by every redesign phase):
//   1 type    every element with direct text uses one of the allowed font sizes (default 12/14/20/48)
//   2 colour  every computed colour is a Radix step of the page's theme (src/design/tokens.css),
//             #fff only as text or icons on indigo-9, transparent, or the operation card's 8 % black shadow;
//             no element at an opacity between 0 and 1 at rest; ::before and ::after with content and
//             an open modal dialog's ::backdrop are read like elements
//   3 lines   no CSS border on a visible element (a 0.5 px border computes to 1 px in Chrome, so
//             lines are box-shadows); every box-shadow ring or one-side rule is 0.5 px; an outline
//             only on the focused element (focus outlines are allowed)
//   4 dot     no middle dot in rendered text, aria-labels, titles, alt or placeholder text
//   7 motion  under reducedMotion 'reduce': no running animation or transition, and no element
//             with a non-zero animation or transition duration
//   6 grid    gridCheck(page): at 1440 the parts that sit on the column's left edge share one x, the
//             right-column parts start 580 px in, the How it works columns at 0/290/580/870 (1 px)
//
//   import { designChecks } from '../redesign-checks.mjs';
//   const problems = await designChecks(page, { theme: 'light', label: 'home 1440' });
//   // options: checks (default all five), sizes, ignore (CSS selectors whose subtree is skipped)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './session.mjs';

export const CHECKS = ['type', 'colour', 'lines', 'dot', 'motion'];
export const SIZES = [12, 14, 20, 48];

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

/**
 * The Radix values of each theme, read from tokens.css (`--gray-1: light-dark(#light, #dark);`), as
 * the `rgb(r, g, b)` strings getComputedStyle returns, mapped to their token names.
 */
export function radixColours(css = readFileSync(join(ROOT, 'src', 'design', 'tokens.css'), 'utf8')) {
  const themes = { light: {}, dark: {} };
  for (const m of css.matchAll(/--((?:gray|indigo|amber)-\d+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi)) {
    themes.light[rgb(m[2])] ??= m[1];
    themes.dark[rgb(m[3])] ??= m[1];
  }
  if (Object.keys(themes.light).length < 36) throw new Error('redesign-checks: could not read the Radix tokens from tokens.css');
  return themes;
}

/** Runs in the page: every visible element's computed styles that the checks need. */
function collect({ ignore }) {
  const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan']);
  const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  // Everything here runs in the page (page.evaluate serialises this one function), so helpers stay inside.
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const classes = el.getAttribute('class')?.trim();
    const cls = classes ? `.${classes.split(/\s+/).join('.')}` : '';
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };
  const ignored = (el) => ignore.some((sel) => el.closest(sel));
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const transparentBg = (bg) => bg === 'transparent' || /rgba\(.*,\s*0\)$/.test(bg);
  const focused = document.activeElement;
  const records = [];
  for (const el of document.querySelectorAll('body, body *')) {
    if (SKIP_TEXT.has(el.tagName) || ignored(el)) continue;
    const svg = el instanceof SVGElement;
    // Clip paths and masks are geometry, never painted; markers and patterns are painted through their users.
    if (svg && el.closest('clipPath, mask')) continue;
    const painted = svg && el.closest('marker, pattern');
    if (!painted && !el.checkVisibility({ visibilityProperty: true })) continue;
    const s = getComputedStyle(el);
    const ownText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    const control = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'file';
    const sides = ['top', 'right', 'bottom', 'left'].map((side) => ({
      side, width: s.getPropertyValue(`border-${side}-width`), style: s.getPropertyValue(`border-${side}-style`), color: s.getPropertyValue(`border-${side}-color`),
    }));
    // The nearest painted background, for the "#fff only on indigo-9" rule.
    let under = 'rgba(0, 0, 0, 0)';
    // In an icon a shape can sit on an earlier filled shape (the audit verdict's tick on its disc).
    const disc = el instanceof SVGElement && [...el.parentElement.children].slice(0, [...el.parentElement.children].indexOf(el))
      .map((sib) => getComputedStyle(sib).fill).findLast((f) => f && f !== 'none' && !f.startsWith('url('));
    for (let at = disc ? null : el; at && at.nodeType === 1; at = at.parentElement) {
      const bg = getComputedStyle(at).backgroundColor;
      if (!/rgba\(.*,\s*0\)$/.test(bg) && bg !== 'transparent') {
        under = bg;
        break;
      }
    }
    if (disc) under = disc;
    records.push({
      el: describe(el), svg, shape: svg && SHAPES.has(el.tagName.toLowerCase()), text: ownText || control,
      fontSize: s.fontSize, color: s.color, background: s.backgroundColor, under, sides,
      outline: { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor },
      focus: el === focused || el.matches(':focus, :focus-visible') || (focused && el.contains(focused) && el.matches(':has(:focus-visible)')),
      shadow: s.boxShadow, fill: s.fill, stroke: s.stroke,
      decoration: ownText && s.textDecorationLine !== 'none' ? s.textDecorationColor : null,
      placeholder: control && el.placeholder ? getComputedStyle(el, '::placeholder').color : null,
      animation: { name: s.animationName, duration: s.animationDuration }, transition: s.transitionDuration,
      opacity: parseFloat(s.opacity),
    });
    // Generated boxes: ::before and ::after with content (the workflow's stop discs, the line numbers),
    // and the backdrop of an open modal dialog.
    const pseudos = ['::before', '::after', ...(el.matches('dialog:modal') ? ['::backdrop'] : [])];
    for (const pseudo of pseudos) {
      const p = getComputedStyle(el, pseudo);
      if (pseudo !== '::backdrop' && (p.content === 'none' || p.content === 'normal')) continue;
      if (p.display === 'none' || p.visibility !== 'visible') continue;
      // Text when the content is not an empty string (attr(), a counter or a quoted string).
      const generated = pseudo !== '::backdrop' && !/^(""|'')(\s*\/.*)?$/.test(p.content.trim());
      const bg = p.backgroundColor;
      records.push({
        el: `${describe(el)}${pseudo}`, svg: false, shape: false, text: generated,
        fontSize: p.fontSize, color: p.color, background: bg, under: transparentBg(bg) ? under : bg,
        sides: ['top', 'right', 'bottom', 'left'].map((side) => ({
          side, width: p.getPropertyValue(`border-${side}-width`), style: p.getPropertyValue(`border-${side}-style`), color: p.getPropertyValue(`border-${side}-color`),
        })),
        outline: { width: p.outlineWidth, style: p.outlineStyle, color: p.outlineColor }, focus: false,
        shadow: p.boxShadow, fill: p.fill, stroke: p.stroke, decoration: null, placeholder: null,
        animation: { name: p.animationName, duration: p.animationDuration }, transition: p.transitionDuration,
        opacity: parseFloat(p.opacity),
      });
    }
  }
  // Middle dots: rendered text (any text node in the body) and the names and hints assistive tech reads.
  const DOT = '·';
  const dots = [];
  if (document.title.includes(DOT)) dots.push(`<title> "${document.title}"`);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || SKIP_TEXT.has(parent.tagName) || ignored(parent)) continue;
    if (node.textContent.includes(DOT)) dots.push(`${describe(parent)}: text "${node.textContent.trim().slice(0, 60)}"`);
  }
  for (const el of document.querySelectorAll('[aria-label], [aria-description], [aria-roledescription], [aria-valuetext], [title], [alt], [placeholder]')) {
    if (ignored(el)) continue;
    for (const attr of ['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'title', 'alt', 'placeholder']) {
      const value = el.getAttribute(attr);
      if (value?.includes(DOT)) dots.push(`${describe(el)}: ${attr}="${value.slice(0, 60)}"`);
    }
  }
  const running = document.getAnimations().filter((a) => a.playState === 'running' || a.pending)
    .map((a) => `${a.constructor.name} ${a.animationName ?? a.transitionProperty ?? ''} on ${a.effect?.target ? describe(a.effect.target) : '?'}`);
  return { records, dots, running };
}

const px = (v) => parseFloat(v) || 0;
const transparent = (c) => c === 'transparent' || /^rgba\(\d+, \d+, \d+, 0\)$/.test(c);

/** Splits a computed box-shadow into { color, x, y, blur, spread, inset }. */
export function parseShadows(value) {
  if (!value || value === 'none') return [];
  return value.split(/,(?![^(]*\))/).map((part) => {
    const color = /rgba?\([^)]*\)/.exec(part)?.[0] ?? '';
    const [x = 0, y = 0, blur = 0, spread = 0] = (part.replace(color, '').match(/-?[\d.]+px|\b0\b/g) ?? []).map(px);
    return { color, x, y, blur, spread, inset: /\binset\b/.test(part) };
  });
}

const SHADOW = 'rgba(0, 0, 0, 0.08)'; // the operation card's float (0 8px 24px), the one shadow allowed
const WHITE = 'rgb(255, 255, 255)';

/** Problems for one collected page state; `allowed` is the theme's rgb -> token map. */
export function evaluate({ records, dots, running }, { theme, allowed, checks, sizes, label }) {
  const problems = [];
  const report = (check, message) => problems.push(`[${label}] ${check}: ${message}`);
  const once = new Set();
  const add = (check, key, message) => {
    if (once.has(`${check}|${key}`)) return;
    once.add(`${check}|${key}`);
    report(check, message);
  };
  const indigo9 = Object.entries(allowed).find(([, t]) => t === 'indigo-9')?.[0];
  const radix = (c) => c in allowed;

  for (const r of records) {
    if (checks.includes('type') && r.text && !sizes.includes(px(r.fontSize))) {
      add('type', `${r.fontSize}|${r.el}`, `font-size ${r.fontSize} (allowed ${sizes.join('/')}) on ${r.el}`);
    }
    if (checks.includes('colour')) {
      const colours = [];
      if (r.text && !r.svg) colours.push(['color', r.color]);
      if (!transparent(r.background)) colours.push(['background-color', r.background]);
      for (const side of r.sides) if (side.style !== 'none' && px(side.width) > 0) colours.push([`border-${side.side}-color`, side.color]);
      if (r.outline.style !== 'none' && px(r.outline.width) > 0) colours.push(['outline-color', r.outline.color]);
      if (r.decoration) colours.push(['text-decoration-color', r.decoration]);
      if (r.placeholder) colours.push(['::placeholder color', r.placeholder]);
      if (r.shape) {
        for (const [prop, value] of [['fill', r.fill], ['stroke', r.stroke]]) if (value !== 'none' && !value.startsWith('url(')) colours.push([prop, value]);
      }
      for (const s of parseShadows(r.shadow)) if (s.color !== SHADOW) colours.push(['box-shadow', s.color]);
      // A part-transparent element mixes its colours with what is under it: not a Radix step (at rest;
      // the motion of DESIGN.md 7 fades through opacity and has finished when the checks read the page).
      if (r.opacity > 0 && r.opacity < 1) add('colour', `opacity|${r.el}`, `opacity ${r.opacity} on ${r.el} (a faded colour is not a Radix ${theme} value)`);
      for (const [prop, value] of colours) {
        if (transparent(value) || radix(value)) continue;
        if (value === WHITE && (prop === 'color' || (r.shape && (prop === 'fill' || prop === 'stroke'))) && r.under === indigo9) continue; // #fff on indigo-9 (text and icons)
        add('colour', `${prop}|${value}|${r.el}`, `${prop} ${value} is not a Radix ${theme} value, on ${r.el}`);
      }
    }
    if (checks.includes('lines') && !r.svg) {
      for (const side of r.sides) {
        if (side.style !== 'none' && px(side.width) > 0) add('lines', `border|${r.el}`, `border-${side.side} ${side.width} ${side.style} on ${r.el} (draw lines as 0.5 px box-shadows)`);
      }
      if (r.outline.style !== 'none' && px(r.outline.width) > 0 && !r.focus) add('lines', `outline|${r.el}`, `outline ${r.outline.width} on ${r.el} without focus`);
      for (const s of parseShadows(r.shadow)) {
        if (s.blur > 0) {
          if (!(s.color === SHADOW && s.x === 0 && s.y === 8 && s.blur === 24 && s.spread === 0)) add('lines', `blur|${r.el}`, `shadow ${r.shadow} on ${r.el} (only the operation card floats)`);
        } else if (s.x === 0 && s.y === 0) {
          if (s.spread !== 0.5 && s.spread !== 0) add('lines', `ring|${r.el}`, `ring ${s.spread}px on ${r.el} (lines are 0.5 px)`);
        } else if (s.spread !== 0 || (s.x !== 0 && s.y !== 0) || Math.abs(s.x || s.y) !== 0.5) {
          add('lines', `rule|${r.el}`, `rule shadow ${s.x}px ${s.y}px (spread ${s.spread}px) on ${r.el} (lines are 0.5 px)`);
        }
      }
    }
    if (checks.includes('motion')) {
      const long = (list) => list.split(',').some((d) => px(d) > 0);
      if (r.animation.name !== 'none' && long(r.animation.duration)) add('motion', `anim|${r.el}`, `animation ${r.animation.name} ${r.animation.duration} on ${r.el}`);
      if (long(r.transition)) add('motion', `transition|${r.el}`, `transition-duration ${r.transition} on ${r.el}`);
    }
  }
  if (checks.includes('dot')) for (const d of dots) report('dot', `middle dot in ${d}`);
  if (checks.includes('motion')) for (const a of running) report('motion', `running ${a}`);
  return problems;
}

/**
 * Waits (at most `ms`) until every running CSS transition and one-shot animation has finished: the
 * page at rest, as the checks and axe read it (the load sequence of DESIGN.md 7 takes up to about 2 s).
 */
export const settled = (page, ms = 4000) => page.evaluate((limit) => Promise.race([
  Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))),
  new Promise((done) => setTimeout(done, limit)),
]), ms);

/**
 * Runs the checks on `page` as it is now. theme: 'light' | 'dark' (the emulated colour scheme);
 * the motion check needs the page in reducedMotion 'reduce'. Returns a list of problems.
 */
export async function designChecks(page, { theme, label = page.url(), checks = CHECKS, sizes = SIZES, ignore = [] } = {}) {
  if (!['light', 'dark'].includes(theme)) throw new Error(`designChecks: theme must be light or dark, got ${theme}`);
  const unknown = checks.filter((c) => !CHECKS.includes(c));
  if (unknown.length) throw new Error(`designChecks: unknown checks ${unknown.join(', ')}`);
  const allowed = radixColours()[theme];
  // Colours are read at rest: let transitions and one-shot animations under way finish (a button
  // enabling as the skill lands, the load sequence, a label swap would otherwise be read between two
  // values). Endless animations (the Generate spinner) are left running.
  await settled(page);
  const data = await page.evaluate(collect, { ignore });
  return evaluate(data, { theme, allowed, checks, sizes, label });
}

// ---------- Check 6: the grid ----------

/** The grid of DESIGN.md 2: a 1072 px column, four 202 px columns with 88 px gaps. */
export const GRID = { width: 1072, col: 202, gap: 88, right: 580 };

/**
 * What sits on the grid, as CSS selectors (the first match is measured; `content: true` measures the
 * box inside its padding). Later phases add the map and skill browser columns; parts missing from the
 * page are reported, so a flow names only what its phase has built.
 */
export const GRID_PARTS = {
  left: {
    'h1': { sel: '.hero h1' },
    'frame contents': { sel: '.frame', content: true },
    'first map column': { sel: '.rc[data-column="0"]', all: true },
    'files column': { sel: '.sb-files' },
    'command-line title': { sel: '#cli h2' },
    'How it works title': { sel: '#how h2' },
    'Made by title': { sel: '.made h2' },
  },
  right: {
    'hero field': { sel: '.source-field' },
    'third map column': { sel: '.rc[data-column="2"]', all: true },
    'command box': { sel: '.cli' },
    'Made by rows': { sel: '.projects a', all: true },
  },
  /** The skill browser's 202 / 492 / 202 (R5): the preview starts at the second column, the audit at the fourth. */
  second: { 'skill preview': { sel: '.sb-preview' } },
  fourth: { 'audit column': { sel: '.sb-audit' } },
  /** Each match starts one column further: 0, 290, 580, 870 (`distinct`: each different x, left to right). */
  columns: {
    'How it works columns': { sel: '.how > li', all: true },
    'map columns': { sel: '.rc[data-column="0"], .rc[data-column="1"], .rc[data-column="2"], .rc[data-column="3"]', all: true, distinct: true },
  },
  /** Right edges at the column's right edge (1072 in). */
  end: {
    'hero field right': { sel: '.source-field', edge: 'right' },
    'frame contents right': { sel: '.frame', content: true, edge: 'right' },
    'command box right': { sel: '.cli', edge: 'right' },
    'audit column right': { sel: '.sb-audit', edge: 'right' },
  },
  /** Right edges at the third column's right edge (782 in): the preview spans two columns. */
  thirdEnd: { 'skill preview right': { sel: '.sb-preview', edge: 'right' } },
};

/** Runs in the page: the left (or right) x of each part's boxes. */
function measure(parts) {
  const out = {};
  for (const [group, entries] of Object.entries(parts)) {
    out[group] = {};
    for (const [name, { sel, all, content, distinct, edge = 'left' }] of Object.entries(entries)) {
      const els = all ? [...document.querySelectorAll(sel)] : [document.querySelector(sel)].filter(Boolean);
      const xs = els.map((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        const inset = content ? parseFloat(edge === 'left' ? s.paddingLeft : s.paddingRight) : 0;
        return edge === 'left' ? r.left + inset : r.right - inset;
      });
      // distinct: one x per column (several boxes stack in one), left to right.
      out[group][name] = distinct ? [...new Set(xs.map((x) => Math.round(x * 10) / 10))].toSorted((a, b) => a - b) : xs;
    }
  }
  return out;
}

const at = (x) => Math.round(x * 10) / 10;

/** Problems for measured positions: everything relative to the h1's x (the column's left edge). */
export function gridProblems(measured, { label = 'grid', tolerance = 1, grid = GRID } = {}) {
  const problems = [];
  const origin = measured.left?.h1?.[0];
  if (origin === undefined) return [`[${label}] grid: no h1 to measure the column from`];
  const want = (name, xs, target) => {
    if (xs.length === 0) problems.push(`[${label}] grid: ${name} not found`);
    xs.forEach((x, i) => {
      if (Math.abs(x - target) > tolerance) problems.push(`[${label}] grid: ${name}${xs.length > 1 ? ` #${i + 1}` : ''} at x=${at(x - origin)} from the column edge, expected ${at(target - origin)}`);
    });
  };
  for (const [name, xs] of Object.entries(measured.left ?? {})) want(name, xs, origin);
  for (const [name, xs] of Object.entries(measured.right ?? {})) want(name, xs, origin + grid.right);
  for (const [name, xs] of Object.entries(measured.end ?? {})) want(name, xs, origin + grid.width);
  const step = grid.col + grid.gap;
  for (const [name, xs] of Object.entries(measured.second ?? {})) want(name, xs, origin + step);
  for (const [name, xs] of Object.entries(measured.fourth ?? {})) want(name, xs, origin + 3 * step);
  for (const [name, xs] of Object.entries(measured.thirdEnd ?? {})) want(name, xs, origin + 2 * step + grid.col);
  for (const [name, xs] of Object.entries(measured.columns ?? {})) {
    if (xs.length === 0) problems.push(`[${label}] grid: ${name} not found`);
    xs.forEach((x, i) => want(`${name} #${i + 1}`, [x], origin + i * (grid.col + grid.gap)));
  }
  return problems;
}

/** Check 6 on `page` as it is now (meant for a 1440 px viewport); `parts` defaults to GRID_PARTS. */
export async function gridCheck(page, { label = 'grid', parts = GRID_PARTS, tolerance = 1 } = {}) {
  return gridProblems(await page.evaluate(measure, parts), { label, tolerance });
}

// ---------- Text overlap ----------

/**
 * Runs in the page: one box per rendered line of every visible text node under `scope` (Range client
 * rects), clipped by every ancestor that clips its overflow, and narrowed to the em box (font size tall,
 * centred on the line): the glyphs, not the line box, so lines of one paragraph never touch. Visually
 * hidden text clips to nothing and drops out.
 */
function textBoxes({ scope, ignore }) {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'OPTION']);
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const describe = (el) => {
    const cls = el.getAttribute('class')?.trim();
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls.split(/\s+/).join('.')}` : ''}`;
  };
  const root = document.querySelector(scope);
  if (!root) return [];
  const boxes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let index = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !node.textContent.trim() || SKIP.has(parent.tagName) || ignore.some((sel) => parent.closest(sel))) continue;
    if (!parent.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    index += 1;
    // The clip: the intersection of every ancestor box whose overflow is not visible.
    let clip = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    for (let up = parent; up && up !== document.documentElement; up = up.parentElement) {
      const s = getComputedStyle(up);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.clipPath !== 'none' || (s.clip && s.clip !== 'auto')) {
        const r = up.getBoundingClientRect();
        clip = { left: Math.max(clip.left, r.left), top: Math.max(clip.top, r.top), right: Math.min(clip.right, r.right), bottom: Math.min(clip.bottom, r.bottom) };
      }
    }
    const size = parseFloat(getComputedStyle(parent).fontSize) || 0;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      const mid = (r.top + r.bottom) / 2;
      const box = {
        left: Math.max(r.left, clip.left), right: Math.min(r.right, clip.right),
        top: Math.max(mid - size / 2, clip.top), bottom: Math.min(mid + size / 2, clip.bottom),
      };
      if (box.right - box.left < 1 || box.bottom - box.top < 1) continue;
      boxes.push({ node: index, el: describe(parent), text: node.textContent.trim().replace(/\s+/g, ' ').slice(0, 40), ...box });
    }
  }
  return boxes;
}

/**
 * Problems for text boxes from textBoxes(): two boxes of different text nodes that cross by more than
 * `min` px on both axes print over each other.
 */
export function overlapProblems(boxes, { label = 'overlap', min = 2 } = {}) {
  const problems = [];
  const seen = new Set();
  const sorted = boxes.toSorted((a, b) => a.top - b.top);
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length && sorted[j].top < a.bottom - min; j += 1) {
      const b = sorted[j];
      if (a.node === b.node) continue;
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const key = [a.node, b.node].toSorted().join('|');
      if (x > min && y > min && !seen.has(key)) {
        seen.add(key);
        problems.push(`[${label}] overlap: "${a.text}" (${a.el}) and "${b.text}" (${b.el}) cross by ${Math.round(x)} x ${Math.round(y)} px`);
      }
    }
  }
  return problems;
}

/** No two pieces of text under `scope` print over each other, on `page` as it is now. */
export async function overlapCheck(page, { label = 'overlap', scope = 'body', ignore = [], min = 2 } = {}) {
  return overlapProblems(await page.evaluate(textBoxes, { scope, ignore }), { label, min });
}
