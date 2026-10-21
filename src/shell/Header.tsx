import { type ReactNode, useEffect, useState } from 'react';
import { Logo } from '../design/Logo';
import { applyTheme, followSystem, initialTheme, safeStorage } from '../design/theme';

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

interface HeaderProps {
  /** The source input (paste a URL or spec text, More options). */
  source: ReactNode;
  /** Write the skill again and bring the skill pane into view. */
  onGenerate: () => void;
}

export function Header({ source, onGenerate }: HeaderProps) {
  const [theme, setTheme] = useState(() => initialTheme(safeStorage(), prefersDark()));
  // Until the user picks a theme, an OS change applies live (A10), without storing anything.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const change = (e: MediaQueryListEvent) => {
      const next = followSystem(safeStorage(), e.matches);
      if (!next) return;
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
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
      {/* DOM order is the visual order at every width (logo, source, theme, Generate): no CSS `order`. */}
      {source}
      <button type="button" className="btn theme" aria-pressed={theme === 'dark'} onClick={toggle}>
        <span aria-hidden="true">☾</span> Dark theme
      </button>
      <button type="button" className="btn primary generate" onClick={onGenerate}>
        Generate skill
      </button>
    </header>
  );
}
