// The help dialog renders SHORTCUTS, so it lists a key exactly when this table does: every key the
// map, the file tree and the tabs handle must be in it (no drift).
import { beforeAll, describe, expect, it } from 'vitest';
import { buildGraph } from '../graph';
import { routeLayout } from '../layout/route';
import { getSample, sampleModel } from '../samples';
import { nextTab } from '../shell/Tabs';
import { treeKey, treeRows } from '../skillpane/tree';
import { type NavMap, type NavState, SHORTCUTS, edgesOf, keyAction, keyLabel, navOf, sourceFieldLoads } from './keyboard';

const NAMED = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'F1', 'Insert'];
const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
const KEYS = [...NAMED, ...PRINTABLE];
const listed = (where: string) => new Set(SHORTCUTS.filter((s) => s.where === where).flatMap((s) => s.keys));

let nav: NavMap, states: NavState[];
beforeAll(async () => {
  const model = await sampleModel(getSample('tasks')!);
  const graph = buildGraph(model);
  nav = navOf(routeLayout(model, graph), null);
  const edges = edgesOf(graph.edges, 'getTask');
  const focus = nav.nodes.find((n) => n.id === 'getTask');
  states = [{ focus, edges, edge: null }, { focus, edges, edge: 0 }, { focus: undefined, edges: [], edge: null }];
});

describe('shortcut help', () => {
  it('lists every key the map handles, and no key it does not (zoom and pan are gone, R4)', () => {
    const handled = KEYS.filter((key) => states.some((s) => keyAction(nav, s, key)));
    const known = new Set([...listed('Map'), ...listed('Anywhere outside a text field')]);
    expect(handled.length).toBeGreaterThan(10);
    expect(handled.filter((k) => !known.has(k))).toEqual([]);
    expect([...listed('Map')].filter((k) => !handled.includes(k))).toEqual([]);
  });

  it('lists every key the skill file tree and the tabs handle', () => {
    const rows = treeRows(['SKILL.md', 'kit/a.mjs', 'references/x.md'], new Set(['kit/']));
    const tree = KEYS.filter((key) => rows.some((_, i) => treeKey(rows, i, key)));
    const tabs = KEYS.filter((key) => nextTab(key, 1, 3) !== undefined);
    expect(tree.filter((k) => !listed('Skill files').has(k))).toEqual([]);
    expect(tabs.filter((k) => !listed('Tabs').has(k))).toEqual([]);
    expect(tree.length + tabs.length).toBeGreaterThan(8);
  });

  it('lists the source field\'s Enter (loads) and Shift+Enter (new line)', () => {
    const loads = KEYS.filter((key) => sourceFieldLoads(key, false));
    expect(loads).toEqual(['Enter']);
    expect(KEYS.some((key) => sourceFieldLoads(key, true))).toBe(false);
    expect(listed('Source field')).toEqual(new Set(['Enter', 'Shift+Enter']));
    expect(keyLabel('Shift+Enter')).toBe('Shift + Enter');
  });

  it('documents search keys and prints keys readably', () => {
    expect(listed('Anywhere outside a text field')).toEqual(new Set(['/', '?']));
    expect(listed('Search box').has('Escape')).toBe(true);
    expect(SHORTCUTS.every((s) => s.keys.length > 0 && s.what.length > 0)).toBe(true);
    expect([keyLabel('ArrowLeft'), keyLabel('Shift+ArrowUp'), keyLabel('+'), keyLabel(' '), keyLabel('Escape')]).toEqual(['←', 'Shift + ↑', '+', 'Space', 'Esc']);
  });
});
