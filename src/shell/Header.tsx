import { type ReactNode, useState } from 'react';
import { Logo } from '../design/Logo';
import { applyTheme, initialTheme, safeStorage } from '../design/theme';

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

interface HeaderProps {
  source?: ReactNode;
  /** Write the skill again and bring the skill pane into view. */
  onGenerate: () => void;
}

export function Header({ source, onGenerate }: HeaderProps) {
  const [theme, setTheme] = useState(() => initialTheme(safeStorage(), prefersDark()));
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next, document.documentElement, safeStorage());
    setTheme(next);
  };
  return (
    <header className="header">
      <div className="brand">
        <Logo />
        <p className="pitch">Turn any OpenAPI spec or MCP server into an agent skill in one click.</p>
      </div>
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
      <button type="button" className="btn theme" aria-pressed={theme === 'dark'} onClick={toggle}>
        <span aria-hidden="true">☾</span> Dark theme
      </button>
      <button type="button" className="btn primary generate" onClick={onGenerate}>
        Generate skill
      </button>
    </header>
  );
}
