// The automated acceptance checks of docs/redesign/DESIGN.md section 8, for any page a flow has
// open (reused by every redesign phase):
//   1 type    every element with direct text uses one of the allowed font sizes (default 12/14/20/48)
//   2 colour  every computed colour is a Radix step of the page's theme (src/design/tokens.css),
//             #fff only as text on indigo-9, transparent, or the operation card's 8 % black shadow
//   3 lines   no CSS border on a visible element (a 0.5 px border computes to 1 px in Chrome, so
//             lines are box-shadows); every box-shadow ring or one-side rule is 0.5 px; an outline
//             only on the focused element (focus outlines are allowed)
//   4 dot     no middle dot in rendered text, aria-labels, titles, alt or placeholder text
//   7 motion  under reducedMotion 'reduce': no running animation or transition, and no element
//             with a non-zero animation or transition duration
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
    for (let at = el; at && at.nodeType === 1; at = at.parentElement) {
      const bg = getComputedStyle(at).backgroundColor;
      if (!/rgba\(.*,\s*0\)$/.test(bg) && bg !== 'transparent') {
        under = bg;
        break;
      }
    }
    records.push({
      el: describe(el), svg, shape: svg && SHAPES.has(el.tagName.toLowerCase()), text: ownText || control,
      fontSize: s.fontSize, color: s.color, background: s.backgroundColor, under, sides,
      outline: { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor },
      focus: el === focused || el.matches(':focus, :focus-visible') || (focused && el.contains(focused) && el.matches(':has(:focus-visible)')),
      shadow: s.boxShadow, fill: s.fill, stroke: s.stroke,
      decoration: ownText && s.textDecorationLine !== 'none' ? s.textDecorationColor : null,
      placeholder: control && el.placeholder ? getComputedStyle(el, '::placeholder').color : null,
      animation: { name: s.animationName, duration: s.animationDuration }, transition: s.transitionDuration,
    });
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
      for (const [prop, value] of colours) {
        if (transparent(value) || radix(value)) continue;
        if (value === WHITE && (prop === 'color' || (r.shape && prop === 'fill')) && r.under === indigo9) continue; // #fff on indigo-9
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
 * Runs the checks on `page` as it is now. theme: 'light' | 'dark' (the emulated colour scheme);
 * the motion check needs the page in reducedMotion 'reduce'. Returns a list of problems.
 */
export async function designChecks(page, { theme, label = page.url(), checks = CHECKS, sizes = SIZES, ignore = [] } = {}) {
  if (!['light', 'dark'].includes(theme)) throw new Error(`designChecks: theme must be light or dark, got ${theme}`);
  const unknown = checks.filter((c) => !CHECKS.includes(c));
  if (unknown.length) throw new Error(`designChecks: unknown checks ${unknown.join(', ')}`);
  const allowed = radixColours()[theme];
  const data = await page.evaluate(collect, { ignore });
  return evaluate(data, { theme, allowed, checks, sizes, label });
}
