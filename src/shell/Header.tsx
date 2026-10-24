import { type MouseEvent, useState } from 'react';
import { Wordmark } from '../design/Logo';

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

/** Wordmark left; How it works, Command line, GitHub right (behind a Menu button on phones). No other buttons. */
export function Header() {
  const [open, setOpen] = useState(false);
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    setOpen(false);
    onInPage(e);
  };
  return (
    <header className="hdr">
      <div className="wrap hdr-in">
        <a href="/" className="brand"><Wordmark /></a>
        <button type="button" className="menu" aria-label="Menu" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" aria-hidden="true"><path d="M3.5 7h13M3.5 13h13" /></svg>
        </button>
        <nav id="site-nav" className="nav" aria-label="Site" data-open={open || undefined}>
          <a href="#how" onClick={go}>How it works</a>
          <a href="#cli" onClick={go}>Command line</a>
          <a href={REPO}>GitHub</a>
        </nav>
      </div>
    </header>
  );
}
