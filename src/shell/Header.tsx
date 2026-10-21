import { type ReactNode, useState } from 'react';
import { Logo } from '../design/Logo';
import { applyTheme, initialTheme, safeStorage } from '../design/theme';

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

/** A real, focusable control that announces why it does nothing yet. */
function Soon({ children, className = 'btn' }: { children: ReactNode; className?: string }) {
  return (
    <button type="button" className={className} aria-disabled="true" aria-describedby="soon-note" title="Coming soon">
      {children} <span className="soon">soon</span>
    </button>
  );
}

export type View = 'map' | 'list';

interface HeaderProps {
  source?: ReactNode;
  view: View;
  onView: (view: View) => void;
}

export function Header({ source, view, onView }: HeaderProps) {
  const [theme, setTheme] = useState(() => initialTheme(safeStorage(), prefersDark()));
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next, document.documentElement, safeStorage());
    setTheme(next);
  };
  return (
    <header className="header">
      <Logo />
      <div className="source">
        {source ?? (
          <input
            className="input"
            type="url"
            disabled
            aria-label="OpenAPI or MCP server URL (coming soon)"
            placeholder="Paste an OpenAPI or MCP server URL (soon)"
          />
        )}
      </div>
      <fieldset className="views">
        <legend className="visually-hidden">View</legend>
        {(['map', 'list'] as const).map((v) => (
          <button type="button" className="btn" key={v} aria-pressed={view === v} onClick={() => onView(v)}>
            {v === 'map' ? 'Map' : 'List'}
          </button>
        ))}
      </fieldset>
      <button type="button" className="btn theme" aria-pressed={theme === 'dark'} onClick={toggle}>
        <span aria-hidden="true">☾</span> Dark theme
      </button>
      <Soon className="btn primary generate">Generate skill</Soon>
      <span id="soon-note" hidden>
        Coming soon
      </span>
    </header>
  );
}
