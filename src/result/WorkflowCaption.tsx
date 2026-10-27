// The strongest workflow in words (docs/DESIGN.md 4.3): each stop's disc and operation id, and
// between them the mapping that carries the id (`id → projectId`). Under the map; on phones one line
// of stops above the list (V2Phone). Absent when the spec has no chain.
import type { Chain } from '../skillgen/types';
import { Breakable } from '../design/breaks';

/**
 * What to show of a step's label ("id -> projectId, ownerId -> assigneeId"): the mappings that fill a
 * required input of the next operation, else the first one; arrows as the map's card writes them.
 */
export function stepLabel(via: string, required: ReadonlySet<string>): string {
  const parts = via.split(', ');
  const fill = parts.filter((p) => required.has(p.split(' ').at(-1)!));
  return (fill.length ? fill : parts.slice(0, 1)).join(', ').replaceAll(' -> ', ' → ');
}

interface WorkflowCaptionProps {
  chain: Chain;
  /** Each operation's required inputs, to pick what a step's label shows. */
  required: (id: string) => ReadonlySet<string>;
  /** Phones above the list: the stops only, on one line, the label for screen readers only. */
  compact?: boolean;
}

export function WorkflowCaption({ chain, required, compact = false }: WorkflowCaptionProps) {
  return (
    <div className="caption" data-testid="workflow-caption" data-compact={compact || undefined}>
      <span id="workflow-label" className={compact ? 'visually-hidden' : undefined}>Strongest workflow</span>
      <ol className="chain" aria-labelledby="workflow-label">
        {chain.ops.map((id, i) => (
            <li key={id}>
              <span className="stop" aria-hidden="true">{i + 1}</span>
              <span className="mono"><Breakable text={id} /></span>
              {!compact && i < chain.via.length && <code className="via"><span className="visually-hidden">, passing </span>{stepLabel(chain.via[i]!, required(chain.ops[i + 1]!))}</code>}
            </li>
        ))}
      </ol>
    </div>
  );
}
