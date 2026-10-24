import type { ReactNode } from 'react';
import { Wordmark } from '../design/Logo';

interface HeaderProps {
  /** The source input (paste a URL or spec text, More options). */
  source: ReactNode;
  /** Write the skill again and bring the skill pane into view. */
  onGenerate: () => void;
  /** A load is in progress: writing the skill again now would rewrite the previous one. */
  disabled?: boolean;
}

/** The theme follows the system (prefers-color-scheme); there is no toggle (docs/DECISIONS.md). */
export function Header({ source, onGenerate, disabled }: HeaderProps) {
  return (
    <header className="header">
      <div className="brand">
        <Wordmark />
        <p className="pitch">Turn any OpenAPI spec or MCP server into an agent skill in one click.</p>
      </div>
      {/* DOM order is the visual order at every width (wordmark, source, Generate): no CSS `order`. */}
      {source}
      {/* Neutral: the skill pane's Download .zip is the view's one accent (docs/DESIGN.md 4). */}
      <button type="button" className="btn generate" disabled={disabled} onClick={onGenerate}>
        Generate skill
      </button>
    </header>
  );
}
