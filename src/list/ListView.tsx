// The list view (F12, A3): the whole map as text. One table per cluster, every operation a row,
// every edge in words with its kind and label; obeys search and filters; rows open the same
// detail panel as the map. Spec strings are React text only (S3).
import { CRUD_LETTER, CRUD_ORDER, type AtlasGraph, type Edge } from '../graph';
import { DetailPanel } from '../detail/DetailPanel';
import { edgeText, edgesOf } from '../map/keyboard';
import type { ApiModel, Operation } from '../model/types';

/** A path or file name that may wrap after each `/`, never inside a segment. */
const breakable = (s: string) => s.split(/(?<=\/)/).flatMap((part, i) => (i ? [<wbr key={i} />, part] : [part]));

/** Text flags, so state never relies on colour. */
function flags(op: Operation): string[] {
  const out: string[] = [];
  if (op.deprecated) out.push('deprecated');
  if (op.kind === 'tool' && op.hints.readOnly) out.push('read-only');
  if (op.kind === 'tool' && op.hints.destructive) out.push('destructive');
  return out;
}

interface ListViewProps {
  model: ApiModel;
  graph: AtlasGraph;
  match: Set<string> | null;
  /** The edges search and filters leave shown. */
  edges: Edge[];
  selected?: string;
  onSelect: (id: string | undefined) => void;
  skillFile?: (id: string) => string | undefined;
  onSkillFile: (path: string) => void;
  announce: (text: string) => void;
}

export function ListView({ model, graph, match, edges, selected, onSelect, skillFile, onSkillFile, announce }: ListViewProps) {
  const ops = new Map(model.operations.map((op) => [op.id, op]));
  const noun = model.source.kind === 'mcp' ? 'tools' : 'operations';
  const groups = graph.clusters.map((c) => ({ c, ids: c.operationIds.filter((id) => !match || match.has(id)) })).filter((g) => g.ids.length);
  const count = (kind: string) => edges.filter((e) => e.kind === kind).length;
  const op = selected ? ops.get(selected) : undefined;
  const open = (id: string) => {
    onSelect(id);
    announce(`Details for ${id} open after the list.`);
  };
  const close = () => {
    onSelect(undefined);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`tr[data-op="${CSS.escape(selected!)}"] th button`)?.focus());
  };
  return (
    <div className="atlas-wrap" data-panel={op ? 'open' : undefined}>
      {/* One Tab stop scrolls the tables sideways on narrow screens (axe scrollable-region-focusable). */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex, jsx-a11y/prefer-tag-over-role -- a labelled scroller */}
      <div className="list" data-testid="list-view" role="region" aria-label={`${model.source.title} as text`} tabIndex={0}>
        <p className="list-summary">
          {match ? `${match.size} of ${model.operations.length}` : model.operations.length} {noun} in {groups.length} clusters; {edges.length} relationships shown: {count('feeds')} feeds, {count('sub-path')} sub-path, {count('shared-schema')} shared schema.
          {graph.hubSchemas.length > 0 && ` Hub schemas (badges on the map, not edges): ${graph.hubSchemas.map((h) => `${h.name} on ${h.usedBy} operations`).join(', ')}.`}
        </p>
        {groups.length === 0 && <p className="list-empty">No {noun} match. Clear the search or show all filters.</p>}
        {groups.map(({ c, ids }) => (
          <table key={c.id} data-cluster={c.id}>
            <caption>
              {c.name} <span className="crud-summary">· {ids.length < c.operationIds.length && `${ids.length} of `}{c.operationIds.length} {noun} · {CRUD_ORDER.filter((k) => ids.some((id) => graph.crud[id] === k)).map((k) => `${CRUD_LETTER[k]} ${k}`).join(', ')}</span>
            </caption>
            <thead>
              <tr><th scope="col">Operation</th><th scope="col">Method</th><th scope="col">{model.source.kind === 'mcp' ? 'Tool' : 'Path'}</th><th scope="col">Summary</th><th scope="col">Relationships</th><th scope="col">In the skill</th></tr>
            </thead>
            <tbody>
              {ids.map((id) => {
                const o = ops.get(id)!;
                const file = skillFile?.(id);
                const rel = edgesOf(edges, id);
                return (
                  <tr key={id} data-op={id} data-open={id === selected || undefined}>
                    <th scope="row"><button type="button" className="link" aria-label={`${id}, details`} onClick={() => open(id)}>{id}</button></th>
                    <td><span className="method" data-method={o.method ?? 'tool'}>{o.method?.toUpperCase() ?? 'TOOL'}</span></td>
                    <td><code>{breakable(o.path ?? o.id)}</code></td>
                    <td>{o.title !== o.id && o.title}{flags(o).map((f) => <span className="flag" key={f}>{f}</span>)}</td>
                    <td>{rel.length === 0 ? 'none' : <ul>{rel.map((e) => <li key={e.id} data-edge={e.id}>{edgeText(e, id)}</li>)}</ul>}</td>
                    <td>{file && <button type="button" className="link" onClick={() => onSkillFile(file)}><code>{breakable(file)}</code></button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </div>
      {op && <DetailPanel model={model} graph={graph} op={op} onGo={open} onClose={close} announce={announce} inSkill={skillFile?.(op.id)} onInSkill={onSkillFile} />}
    </div>
  );
}
