// The list view (F12, A3; docs/redesign/DESIGN.md 6, redesign R5): the map as text, grouped by
// resource. Each group is a 14/600 heading with its count (a disclosure: on phones only the groups on
// the strongest workflow start open, V2Phone); each operation a 44 px row with its method, id and
// path, the stop disc and the destructive mark as on the map. A row opens the same operation card,
// pinned and docked under the list; it lists every relationship in words, and the row's name counts
// them ("13 relationships"). Obeys search. Spec strings are React text only (S3).
import { useEffect, useMemo, useRef, useState } from 'react';
import { CHEVRON_ICON } from '../design/icons';
import { CRUD_LETTER, CRUD_ORDER, type AtlasGraph, type Edge } from '../graph';
import { counted } from '../graph/words';
import { methodOf } from '../layout/route';
import { columnsOf } from '../layout/route-columns';
import { edgesOf, nodeName } from '../map/keyboard';
import { OpCard } from '../map/OpCard';
import type { ApiModel } from '../model/types';
import type { Chain } from '../skillgen/types';

const rowButton = (id: string) => document.querySelector<HTMLElement>(`.list [data-op="${CSS.escape(id)}"]`);

/** A path that may wrap after each `/`, never inside a segment. */
const breakable = (s: string) => s.split(/(?<=\/)/).flatMap((part, i) => (i ? [<wbr key={i} />, part] : [part]));

interface ListViewProps {
  model: ApiModel;
  graph: AtlasGraph;
  match: Set<string> | null;
  /** The edges the search leaves shown. */
  edges: Edge[];
  /** The strongest workflow as the map draws it (stop discs). */
  workflow: Chain | null;
  selected?: string;
  onSelect: (id: string | undefined) => void;
  skillFile?: (id: string) => string | undefined;
  onSkillFile: (path: string) => void;
  announce: (text: string) => void;
  phone: boolean;
}

export function ListView({ model, graph, match, edges, workflow, selected, onSelect, skillFile, onSkillFile, announce, phone }: ListViewProps) {
  const ops = new Map(model.operations.map((op) => [op.id, op]));
  const noun = model.source.kind === 'mcp' ? 'tools' : 'operations';
  const stopOf = new Map(workflow?.ops.map((id, i) => [id, i + 1]) ?? []);
  // Groups in the map's column order (left to right; in a column biggest first, as the map stacks them); on phones the open ones first (V2Phone).
  const column = useMemo(() => {
    const home = new Map(graph.clusters.flatMap((c) => c.operationIds.map((id) => [id, c.id] as const)));
    return columnsOf(graph, [...new Set(workflow?.ops.map((id) => home.get(id)!) ?? [])]);
  }, [graph, workflow]);
  const groups = graph.clusters.map((c, i) => ({ c, i, ids: c.operationIds.filter((id) => !match || match.has(id)) }))
    .filter((g) => g.ids.length).toSorted((a, b) => (column.get(a.c.id) ?? 0) - (column.get(b.c.id) ?? 0) || b.c.operationIds.length - a.c.operationIds.length || a.i - b.i);
  const count = (kind: string) => edges.filter((e) => e.kind === kind).length;
  const op = selected ? ops.get(selected) : undefined;
  // Open groups: all on desktop; on phones the workflow's (the first two without one). A search or the
  // pinned operation opens its group; a toggle holds while the list is shown.
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const isOpen = (ids: string[], id: string, i: number) =>
    !!match || ids.includes(selected ?? '') || (toggled.get(id) ?? (!phone || (stopOf.size > 0 ? ids.some((o) => stopOf.has(o)) : i < 2)));
  const open = (id: string) => {
    onSelect(id);
    announce(`Operation card for ${id} open after the list.`);
  };
  // Back/forward opens or closes the card from outside; if that dropped focus (the card unmounted)
  // or left it on another row, it goes to the row of the selection, or of the one just closed.
  const previous = useRef(selected);
  useEffect(() => {
    const id = selected ?? previous.current;
    previous.current = selected;
    if (!id) return;
    const active = document.activeElement;
    const was = active?.closest('[data-op]');
    const lost = !active || active === document.body || !active.isConnected || (was && was.getAttribute('data-op') !== id);
    if (lost) rowButton(id)?.focus();
  }, [selected]);
  // The open row stays in view above the docked card (app.css pads the scroll for it); again when
  // the skill's file links arrive and once web fonts settle, as both reflow a list opened from a link.
  const linked = skillFile !== undefined;
  useEffect(() => {
    if (!selected) return;
    const reveal = () => rowButton(selected)?.scrollIntoView?.({ block: 'nearest' });
    reveal();
    let live = true;
    void document.fonts?.ready.then(() => live && reveal());
    return () => {
      live = false;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `linked` reflows the rows
  }, [selected, linked]);
  const close = () => {
    onSelect(undefined);
    requestAnimationFrame(() => rowButton(selected!)?.focus());
  };
  return (
    <div className="list-wrap" data-panel={op ? 'open' : undefined}>
      <div className="list" data-testid="list-view">
        {/* What the map's name says, for screen readers (the frame head shows the counts). */}
        <p className="visually-hidden list-summary">
          {match ? `${match.size} of ${model.operations.length}` : model.operations.length} {noun} in {counted(groups.length, 'resource')}; {counted(edges.length, 'relationship')} shown: {count('feeds')} feeds, {count('sub-path')} sub-path, {count('shared-schema')} shared schema.
          {graph.hubSchemas.length > 0 && ` Hub schemas (not drawn as links): ${graph.hubSchemas.map((h) => `${h.name} on ${h.usedBy} operations`).join(', ')}.`}
        </p>
        {groups.length === 0 && <p className="list-empty">No {noun} match. Clear the search.</p>}
        {groups.map((g, i) => ({ ...g, shown: isOpen(g.c.operationIds, g.c.id, i) })).toSorted((a, b) => (phone ? Number(b.shown) - Number(a.shown) : 0)).map(({ c, ids, shown }) => {
          const crud = CRUD_ORDER.filter((k) => ids.some((id) => graph.crud[id] === k)).map((k) => `${CRUD_LETTER[k]} ${k}`).join(', ');
          return (
            <section key={c.id} className="lgroup" data-cluster={c.id} data-open={shown || undefined}>
              <h3 className="lhead">
                <button type="button" aria-expanded={shown} aria-controls={`lg-${c.id}`} onClick={() => setToggled((t) => new Map(t).set(c.id, !shown))}>
                  <span className="lname">{c.name}</span>
                  <span className="lcount"><span className="visually-hidden">, </span>{ids.length < c.operationIds.length && `${ids.length} of `}{c.operationIds.length}<span className="visually-hidden"> {noun}: {crud}</span>{CHEVRON_ICON}</span>
                </button>
              </h3>
              <ul className="lrows" id={`lg-${c.id}`} hidden={!shown}>
                {ids.map((id) => {
                  const o = ops.get(id)!;
                  const row = { ...methodOf(o, graph.crud[id]), stop: stopOf.get(id) };
                  return (
                    <li key={id}>
                      {/* The stop disc is drawn from data-route by CSS (::after), as on the map. */}
                      <button type="button" className="lrow" data-op={id} data-open={id === selected || undefined} data-route={row.stop}
                        aria-haspopup="dialog" aria-expanded={id === selected}
                        aria-label={nodeName(o, row, c.name, edgesOf(edges, id).length)} onClick={() => open(id)}>
                        <span className="m" data-destructive={row.destructive || undefined}>{row.method}</span>
                        {' '}
                        <span className="lid"><span className="id">{id}</span>{o.kind !== 'tool' && <span className="path">{breakable(o.path!)}</span>}</span>
                        {row.destructive && <svg className="warn" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path className="warn-bg" d="M6 .9 11.6 10.9H.4Z" /><path className="warn-x" d="M6 4.6v2.9M6 9.1v.05" /></svg>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      {op && <OpCard model={model} graph={graph} op={op} pinned className="docked" onGo={open} onClose={close} announce={announce} inSkill={skillFile?.(op.id)} onInSkill={onSkillFile} />}
    </div>
  );
}
