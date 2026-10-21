import type { LayoutEdge, LayoutLink } from '../layout/layout';

const marker = { viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 9, markerHeight: 9, markerUnits: 'userSpaceOnUse', orient: 'auto' } as const;

/** Markers and the destructive hatch, shared by the map and the legend (PLAN 3.2). */
export const MapDefs = () => (
  <defs>
    <marker id="mk-feeds" {...marker}><path className="mk-feeds" d="M0 0L10 5L0 10Z" /></marker>
    <marker id="mk-sub-path" {...marker}><path className="mk-sub-path" d="M1 1L9 5L1 9" /></marker>
    <pattern id="hatch" width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect className="hatch" width={2} height={4} /></pattern>
  </defs>
);

/** Feeds: dashed + filled arrow; sub-path: solid + open chevron; shared schema: dotted + midpoint diamond. */
export function EdgeLine({ edge, hot, cycled, bundled }: { edge: LayoutEdge; hot: boolean; cycled: boolean; bundled: boolean }) {
  const { x, y } = edge.mid;
  return (
    <g className="edge" data-edge={edge.id} data-kind={edge.kind} data-hot={hot || undefined} data-cycled={cycled || undefined} data-bundled={bundled || undefined}>
      <path className="line" data-kind={edge.kind} d={edge.d} markerEnd={edge.kind === 'shared-schema' ? undefined : `url(#mk-${edge.kind})`} />
      {edge.kind === 'shared-schema' && <path className="diamond" d={`M${x} ${y - 4.5}l4.5 4.5l-4.5 4.5l-4.5-4.5z`} />}
    </g>
  );
}

/** Drawn above the nodes with a paper halo; hidden when zoomed out, crowded or repeated, unless highlighted. */
export const EdgeLabel = ({ edge, hot }: { edge: LayoutEdge; hot: boolean }) => (
  <text className="edge-label" data-kind={edge.kind} data-shown={edge.label.shown} data-hot={hot || undefined}
    x={edge.label.x} y={edge.label.y} textAnchor="middle" dominantBaseline="central">
    {edge.label.text}
  </text>
);

/** A bundle (feeds style, arrow at the fed cluster, `projectId -> 4 ops`) or a thick band of counted
 *  links between two clusters (`12 links`, large specs); both always carry their text label. */
export const LinkLine = ({ link, hot }: { link: LayoutLink; hot: boolean }) => (
  <g className="link" data-link={link.kind} data-kind={link.kind === 'bundle' ? 'feeds' : undefined} data-hot={hot || undefined}>
    <path className="line" data-kind={link.kind === 'bundle' ? 'feeds' : undefined} d={link.d} markerEnd={link.kind === 'bundle' ? 'url(#mk-feeds)' : undefined} />
    <text className="edge-label" x={link.label.x} y={link.label.y} textAnchor="middle" dominantBaseline="central">{link.label.text}</text>
  </g>
);
