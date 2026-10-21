import type { ReactNode } from 'react';

const ITEMS: { swatch: ReactNode; text: ReactNode }[] = [
  { swatch: <path className="line" data-kind="feeds" d="M2 9H40" markerEnd="url(#mk-feeds)" />, text: <><b>feeds</b>: an output field fills an input (<code>id -&gt; taskId</code>)</> },
  { swatch: <path className="line" data-kind="sub-path" d="M2 9H40" markerEnd="url(#mk-sub-path)" />, text: <><b>sub-path</b>: a path nested under another</> },
  { swatch: <><path className="line" data-kind="shared-schema" d="M2 9H42" /><path className="diamond" d="M22 4.5l4.5 4.5l-4.5 4.5l-4.5-4.5z" /></>, text: <><b>shared schema</b>: same request or response schema (label: its name)</> },
  { swatch: <><rect className="legend-node" x={1} y={2} width={42} height={14} rx={3} /><text className="legend-glyph" x={6} y={12.5}>GET</text></>, text: <>endpoint, with its HTTP method</> },
  { swatch: <><path className="legend-node" d="M1 2H37L43 8V16H1Z" /><text className="legend-glyph" x={6} y={12.5}>fn</text></>, text: <>MCP tool (clipped corner)</> },
  { swatch: <><rect className="legend-node" x={1} y={2} width={42} height={14} rx={3} /><rect className="bar" x={2} y={3} width={3} height={12} /></>, text: <>solid bar: changes data</> },
  { swatch: <><rect className="legend-node" x={1} y={2} width={42} height={14} rx={3} /><rect className="bar hatched" x={2} y={3} width={6} height={12} /><text className="legend-glyph" x={12} y={13}>!</text></>, text: <>hatched bar and <b>!</b>: destructive</> },
  { swatch: <g className="crud" transform="translate(14 1)"><rect width={16} height={16} rx={3} /><text x={8} y={12}>R</text></g>, text: <><b>L C R U D A</b>: list / create / read / update / delete / action</> },
  { swatch: <text className="hub" x={22} y={13} textAnchor="middle">on N</text>, text: <><b>Schema on N ops</b>: shared so widely it is a badge, not edges</> },
];

/** The key to the map: every edge style and node shape, drawn and named. Starts closed on small screens. */
export function Legend() {
  const wide = typeof window === 'undefined' || window.matchMedia('(min-width: 640px)').matches;
  return (
    <details className="legend" open={wide}>
      <summary>Legend</summary>
      <ul>
        {ITEMS.map(({ swatch, text }, i) => (
          <li key={i}>
            <svg width={44} height={18} viewBox="0 0 44 18" aria-hidden="true">{swatch}</svg> <span>{text}</span>
          </li>
        ))}
      </ul>
      <p>Labels hide when zoomed out, crowded or repeated; point at or focus a node to show all of its edges and labels; on the map, arrow keys move, Page Up/Down change cluster, Home/End jump, <kbd>E</kbd> cycles edges and Enter opens details. <b>Ctrl + scroll to zoom</b> (or pinch, or + and -); plain scrolling moves the page.</p>
    </details>
  );
}
