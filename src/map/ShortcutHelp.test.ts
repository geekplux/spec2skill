// The help dialog renders SHORTCUTS, so it lists a key exactly when this table does: every key the
// map, the file tree and the tabs handle must be in it (no drift).
import { beforeAll, describe, expect, it } from 'vitest';
import { buildGraph } from '../graph';
import { type AtlasLayout, layout } from '../layout/layout';
import { getSample, sampleModel } from '../samples';
import { nextTab } from '../shell/Tabs';
import { treeKey, treeRows } from '../skillpane/tree';
import { type NavState, SHORTCUTS, edgesOf, keyAction, keyLabel } from './keyboard';

const NAMED = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'F1', 'Insert'];
const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
const KEYS = [...NAMED, ...PRINTABLE];
const listed = (where: string) => new Set(SHORTCUTS.filter((s) => s.where === where).flatMap((s) => s.keys));

let atlas: AtlasLayout, states: NavState[];
beforeAll(async () => {
  const model = await sampleModel(getSample('tasks')!);
  const graph = buildGraph(model);
  atlas = layout(model, graph);
  const edges = edgesOf(graph.edges, 'getTask');
  const focus = atlas.nodes.find((n) => n.id === 'getTask');
  states = [{ focus, edges, edge: null }, { focus, edges, edge: 0 }, { focus: undefined, edges: [], edge: null }];
});

describe('shortcut help', () => {
  it('lists every key the map handles (with and without Shift)', () => {
    const handled = KEYS.flatMap((key) =>
      [false, true].flatMap((shift) => {
        const action = states.map((s) => keyAction(atlas, s, key, shift)).find(Boolean);
        return action ? [shift && action.type === 'pan' ? `Shift+${key}` : key] : [];
      }),
    );
    const known = new Set([...listed('Map'), ...listed('Anywhere outside a text field')]);
    expect(handled.length).toBeGreaterThan(20);
    expect(handled.filter((k) => !known.has(k))).toEqual([]);
  });

  it('lists every key the skill file tree and the tabs handle', () => {
    const rows = treeRows(['SKILL.md', 'kit/a.mjs', 'references/x.md'], new Set(['kit/']));
    const tree = KEYS.filter((key) => rows.some((_, i) => treeKey(rows, i, key)));
    const tabs = KEYS.filter((key) => nextTab(key, 1, 3) !== undefined);
    expect(tree.filter((k) => !listed('Skill files').has(k))).toEqual([]);
    expect(tabs.filter((k) => !listed('Tabs').has(k))).toEqual([]);
    expect(tree.length + tabs.length).toBeGreaterThan(8);
  });

  it('documents search keys and prints keys readably', () => {
    expect(listed('Anywhere outside a text field')).toEqual(new Set(['/', '?']));
    expect(listed('Search box').has('Escape')).toBe(true);
    expect(SHORTCUTS.every((s) => s.keys.length > 0 && s.what.length > 0)).toBe(true);
    expect([keyLabel('ArrowLeft'), keyLabel('Shift+ArrowUp'), keyLabel('+'), keyLabel(' '), keyLabel('Escape')]).toEqual(['←', 'Shift + ↑', '+', 'Space', 'Esc']);
  });
});
