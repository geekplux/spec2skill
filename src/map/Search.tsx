// Search and filters above the map and the list (F11): `/` focuses the box, Esc clears it, the
// result count is shown and announced; filters are native checkboxes in a disclosure.
import { type Ref, useEffect, useRef } from 'react';
import { useAnnounce } from '../a11y/Announcer';
import { EDGE_KINDS, type Hidden, SHOW_ALL, hiddenCount, toggle } from '../state/filter';

interface SearchProps {
  q: string;
  onQ: (q: string) => void;
  hidden: Hidden;
  onHidden: (h: Hidden) => void;
  facets: { methods: string[]; clusters: { id: string; name: string }[] };
  /** Matching operations, or null when nothing narrows the view. */
  count: number | null;
  total: number;
  noun: string;
  onHelp: () => void;
  input: Ref<HTMLInputElement>;
}

export function Search({ q, onQ, hidden, onHidden, facets, count, total, noun, onHelp, input }: SearchProps) {
  const off = hiddenCount(hidden);
  const status = count === null ? `${total} ${noun}` : `${count} of ${total} ${noun} match`;
  const announce = useAnnounce();
  const first = useRef(true);
  // Announced once typing pauses, not per keystroke (and not on load).
  useEffect(() => {
    if (first.current) return void (first.current = false);
    const t = setTimeout(() => announce(count === null ? `Showing all ${status}.` : `${status}.`), 500);
    return () => clearTimeout(t);
  }, [announce, status, count]);
  const group = <K extends keyof Hidden>(key: K, legend: string, items: { id: Hidden[K][number]; name: string }[]) => (
    <fieldset>
      <legend>{legend}</legend>
      {items.map(({ id, name }) => (
        <label key={id}>
          <input type="checkbox" checked={!(hidden[key] as string[]).includes(id)} onChange={() => onHidden({ ...hidden, [key]: toggle(hidden[key] as string[], id) })} /> {name}
        </label>
      ))}
    </fieldset>
  );
  return (
    <search className="search">
      <label htmlFor="search-q">Search {noun}</label>
      <input id="search-q" ref={input} className="field" type="search" value={q} spellCheck={false} aria-keyshortcuts="/" aria-describedby="search-count"
        placeholder="name, path or parameter" onChange={(e) => onQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && q && (e.preventDefault(), onQ(''))} />
      <p id="search-count" className="search-count">{status}</p>
      <details className="filters">
        <summary>Filters{off > 0 && ` (${off} off)`}</summary>
        {group('edges', 'Edges', EDGE_KINDS.map((k) => ({ id: k, name: k.replace('-', ' ') })))}
        {group('methods', 'Method or kind', facets.methods.map((m) => ({ id: m, name: m === 'tool' ? 'MCP tool' : m.toUpperCase() })))}
        {group('clusters', 'Cluster', facets.clusters)}
        <button type="button" className="btn" disabled={off === 0} onClick={() => onHidden(SHOW_ALL)}>Show all</button>
      </details>
      <button type="button" className="btn" aria-keyshortcuts="?" onClick={onHelp}>Keyboard shortcuts</button>
    </search>
  );
}
