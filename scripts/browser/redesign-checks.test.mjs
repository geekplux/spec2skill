import { describe, expect, it } from 'vitest';
import { CHECKS, SIZES, evaluate, parseShadows, radixColours } from './redesign-checks.mjs';

const allowed = radixColours().light;
const GRAY1 = 'rgb(252, 252, 252)';
const GRAY12 = 'rgb(32, 32, 32)';
const INDIGO9 = 'rgb(62, 99, 221)';
const none = { width: '0px', style: 'none', color: GRAY12 };
const record = (over = {}) => ({
  el: 'p.x', svg: false, shape: false, text: true, fontSize: '14px', color: GRAY12, background: 'rgba(0, 0, 0, 0)', under: GRAY1,
  sides: ['top', 'right', 'bottom', 'left'].map((side) => ({ side, ...none })), outline: { width: '0px', style: 'none', color: GRAY12 },
  focus: false, shadow: 'none', fill: 'rgb(0, 0, 0)', stroke: 'none', decoration: null, placeholder: null,
  animation: { name: 'none', duration: '0s' }, transition: '0s', ...over,
});
const run = (records, { dots = [], running = [], checks = CHECKS } = {}) =>
  evaluate({ records, dots, running }, { theme: 'light', allowed, checks, sizes: SIZES, label: 't' });

describe('redesign checks (DESIGN.md section 8)', () => {
  it('reads the 36 Radix values of each theme from tokens.css', () => {
    const themes = radixColours();
    expect(themes.light[GRAY1]).toBe('gray-1');
    expect(themes.light[INDIGO9]).toBe('indigo-9');
    expect(themes.dark['rgb(17, 17, 17)']).toBe('gray-1');
    expect(new Set(Object.values(themes.light)).size).toBe(36);
  });

  it('parses computed box-shadows', () => {
    expect(parseShadows('rgb(206, 206, 206) 0px 0px 0px 0.5px inset, rgba(0, 0, 0, 0.08) 0px 8px 24px 0px')).toEqual([
      { color: 'rgb(206, 206, 206)', x: 0, y: 0, blur: 0, spread: 0.5, inset: true },
      { color: 'rgba(0, 0, 0, 0.08)', x: 0, y: 8, blur: 24, spread: 0, inset: false },
    ]);
    expect(parseShadows('none')).toEqual([]);
  });

  it('passes a page drawn only with the tokens', () => {
    expect(run([
      record(),
      record({ el: 'button.primary', background: INDIGO9, under: INDIGO9, color: 'rgb(255, 255, 255)', shadow: 'rgb(187, 187, 187) 0px 0px 0px 0.5px inset' }),
      record({ el: 'header', text: false, shadow: 'rgb(217, 217, 217) 0px -0.5px 0px 0px inset' }),
      record({ el: 'rect.card', svg: true, shape: true, text: false, fill: 'rgb(249, 249, 249)', stroke: 'rgb(206, 206, 206)' }),
      record({ el: 'a:focus', focus: true, outline: { width: '2px', style: 'solid', color: GRAY12 } }),
    ])).toEqual([]);
  });

  it('1: flags a font size outside the allowed set', () => {
    expect(run([record({ fontSize: '13px' })], { checks: ['type'] })).toEqual(['[t] type: font-size 13px (allowed 12/14/20/48) on p.x']);
    expect(run([record({ fontSize: '13px', text: false })], { checks: ['type'] })).toEqual([]);
  });

  it('2: flags a colour that is not a Radix value, and #fff off indigo-9', () => {
    expect(run([record({ color: 'rgb(28, 36, 48)' })], { checks: ['colour'] })).toHaveLength(1);
    expect(run([record({ color: 'rgb(255, 255, 255)' })], { checks: ['colour'] })).toHaveLength(1);
    expect(run([record({ shadow: 'rgba(0, 0, 0, 0.2) 0px 2px 4px 0px' })], { checks: ['colour'] })).toHaveLength(1);
    expect(run([record({ svg: true, shape: true, text: false, fill: 'rgb(0, 0, 0)' })], { checks: ['colour'] })).toHaveLength(1);
    expect(run([record({ svg: true, shape: true, text: false, fill: 'url("#grid")' })], { checks: ['colour'] })).toEqual([]);
  });

  it('3: flags CSS borders, thick rings and rules, stray shadows and outlines without focus', () => {
    const border = record({ sides: [{ side: 'top', width: '1px', style: 'solid', color: GRAY12 }, ...record().sides.slice(1)] });
    expect(run([border], { checks: ['lines'] })).toEqual(['[t] lines: border-top 1px solid on p.x (draw lines as 0.5 px box-shadows)']);
    expect(run([record({ shadow: 'rgb(32, 32, 32) 0px 0px 0px 1px' })], { checks: ['lines'] })).toHaveLength(1);
    expect(run([record({ shadow: 'rgb(32, 32, 32) 3px 0px 0px 0px inset' })], { checks: ['lines'] })).toHaveLength(1);
    expect(run([record({ shadow: 'rgba(0, 0, 0, 0.08) 0px 4px 12px 0px' })], { checks: ['lines'] })).toHaveLength(1);
    expect(run([record({ outline: { width: '2px', style: 'solid', color: GRAY12 } })], { checks: ['lines'] })).toHaveLength(1);
  });

  it('4: reports every middle dot found', () => {
    expect(run([], { dots: ['p: text "a · b"'], checks: ['dot'] })).toEqual(['[t] dot: middle dot in p: text "a · b"']);
  });

  it('7: flags running animations and non-zero durations', () => {
    expect(run([record({ transition: '0s, 0.15s' })], { checks: ['motion'] })).toHaveLength(1);
    expect(run([record({ animation: { name: 'rise', duration: '0.25s' } })], { checks: ['motion'] })).toHaveLength(1);
    expect(run([], { running: ['CSSTransition opacity on g.edge'], checks: ['motion'] })).toEqual(['[t] motion: running CSSTransition opacity on g.edge']);
    expect(run([record()], { checks: ['motion'] })).toEqual([]);
  });
});
