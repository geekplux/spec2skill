import { type MouseEvent, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { MOON_ICON, SUN_ICON } from '../design/icons';
import { Wordmark } from '../design/Logo';
import { currentTheme, safeStorage, subscribeTheme, switchTheme, themeButtonLabel } from '../design/theme';

export const REPO = 'https://github.com/geekplux/spec2skill';

/**
 * An in-page link (#how, #cli) scrolls to its section and moves focus there without touching the URL:
 * the hash belongs to the open operation (`#op=`, src/state/url.ts).
 */
export function onInPage(e: MouseEvent<HTMLAnchorElement>) {
  const target = document.getElementById(e.currentTarget.hash.slice(1));
  if (!target || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  target.scrollIntoView({ block: 'start' });
  target.focus({ preventScroll: true });
}

const subscribe = (change: () => void) => subscribeTheme(window, change);
const snapshot = () => currentTheme(window);

/**
 * The theme button (D82): it says what a click does ("Switch to dark theme") and shows that theme's
 * glyph. Until it is used the page follows the system, live, and so does its name; a click pins the
 * other theme (kept even when it equals the system's) and remembers it; another tab's choice applies
 * live. The theme is read from <html>, where index.html's inline script pinned a stored choice. The
 * swap is instant.
 */
function ThemeButton() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => 'light' as const);
  // A click changes <html> in this tab, which no event reports: re-render to read it.
  const [, clicked] = useReducer((n: number) => n + 1, 0);
  const onClick = () => {
    switchTheme(theme, document, safeStorage());
    clicked();
  };
  return (
    <button type="button" className="theme-btn" aria-label={themeButtonLabel(theme)} onClick={onClick}>
      {theme === 'dark' ? SUN_ICON : MOON_ICON}
    </button>
  );
}

/**
 * Wordmark left; How it works, Command line, GitHub (behind a Menu button on phones), then the theme
 * button, always the last item on the right. DOM order is the visual order at every width.
 */
export function Header() {
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  // The phone menu closes on Escape (focus back on Menu) and on a click or tap outside the header.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      menu.current?.focus();
    };
    const onDown = (e: PointerEvent) => !header.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    setOpen(false);
    onInPage(e);
  };
  return (
    <header className="hdr" ref={header}>
      <div className="wrap hdr-in">
        <a href="/" className="brand"><Wordmark /></a>
        <div className="hdr-end">
          <button type="button" ref={menu} className="menu" aria-label="Menu" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" aria-hidden="true"><path d="M3.5 7h13M3.5 13h13" /></svg>
          </button>
          <nav id="site-nav" className="nav" aria-label="Site" data-open={open || undefined}>
            <a href="#how" onClick={go}>How it works</a>
            <a href="#cli" onClick={go}>Command line</a>
            <a href={REPO}>GitHub</a>
          </nav>
          <ThemeButton />
        </div>
      </div>
    </header>
  );
}
