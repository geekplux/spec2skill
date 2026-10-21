import { CRUD_LETTER } from '../graph';
import { type LayoutNode, NODE_H as H, NODE_W as W } from '../layout/layout';
import type { Crud, Operation } from '../model/types';

/** Keep the end of a path (the specific part), or the start of a sentence. */
const tail = (s: string, n: number) => (s.length > n ? `…${s.slice(s.length - n + 1)}` : s);
const head = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

interface NodeProps { node: LayoutNode; op: Operation; crud: Crud | undefined; hot: boolean; onHover: (id: string | null) => void }

/** One operation: rounded rect + method (endpoint) or notched rect + `fn` (MCP tool); a solid bar
 *  marks writes, a hatched bar + `!` destructive ones; struck-through name + text for deprecated. */
export function Node({ node, op, crud, hot, onHover }: NodeProps) {
  const tool = op.kind === 'tool';
  const name = op.path ?? op.id;
  const sub = op.title !== op.id && op.title !== op.path ? op.title : (op.description ?? '');
  return (
    <g className="node" data-op={op.id} data-state={node.state} data-hot={hot || undefined} transform={`translate(${node.x} ${node.y})`}
      onPointerEnter={() => onHover(op.id)} onPointerLeave={() => onHover(null)}>
      <title>{`${tool ? 'Tool' : op.method!.toUpperCase()} ${name}: ${op.title}${op.deprecated ? ' (deprecated)' : ''}`}</title>
      {tool ? <path className="shape" d={`M0 0H${W - 10}L${W} 10V${H}H0Z`} /> : <rect className="shape" width={W} height={H} rx={6} />}
      {node.state !== 'read' && <rect className={`bar ${node.state === 'destructive' ? 'hatched' : ''}`} x={1} y={1} width={node.state === 'destructive' ? 6 : 3} height={H - 2} />}
      <text className="n-method" data-method={op.method ?? 'tool'} x={12} y={17}>{tool ? 'fn' : op.method!.toUpperCase()}</text>
      {node.state === 'destructive' && <text className="bang" x={12} y={33}>!</text>}
      <text className="name" data-deprecated={op.deprecated || undefined} x={58} y={17}>
        {/* Path parameters `{petId}` in italic as well as colour (PLAN 3.1). */}
        {tail(name, 20).split(/(\{[^}]*\}?)/).map((part, i) => (part.startsWith('{') ? <tspan key={i} className="param">{part}</tspan> : part))}
      </text>
      <text className="sub" x={58} y={32}>{head(op.deprecated ? `deprecated · ${sub}` : sub, 29)}</text>
      {crud && (
        <g className="crud" transform={`translate(${W - 22} 12)`}>
          <rect width={16} height={16} rx={3} />
          <text x={8} y={12}>{CRUD_LETTER[crud]}</text>
        </g>
      )}
    </g>
  );
}
