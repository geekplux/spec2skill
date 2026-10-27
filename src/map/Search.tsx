// Search above the map and the list (redesign R4): 202 x 40 with a search icon and a `/` key
// hint; `/` focuses it, Esc clears it. Matches stay ink and the rest fade; the count is announced
// (and is the field's description), not shown.
import { type Ref, useEffect, useRef } from 'react';
import { useAnnounce } from '../a11y/Announcer';

interface SearchProps {
  q: string;
  onQ: (q: string) => void;
  /** Matching operations, or null when nothing narrows the view. */
  count: number | null;
  total: number;
  noun: string;
  input: Ref<HTMLInputElement>;
}

export function Search({ q, onQ, count, total, noun, input }: SearchProps) {
  const status = count === null ? `${total} ${noun}` : `${count} of ${total} ${noun} match`;
  const announce = useAnnounce();
  const last = useRef<number | null>(null);
  // Announced once typing pauses; not on load or a sample switch (the skill's announcement has the news).
  useEffect(() => {
    const quiet = last.current !== total;
    last.current = total;
    if (quiet) return;
    const t = setTimeout(() => announce(count === null ? `Showing all ${status}.` : `${status}.`), 500);
    return () => clearTimeout(t);
  }, [announce, status, count, total]);
  return (
    <search className="search">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
      <input id="search-q" ref={input} type="search" value={q} spellCheck={false} aria-label={`Search ${noun}`} aria-keyshortcuts="/" aria-describedby="search-count"
        placeholder="Search" onChange={(e) => onQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && q && (e.preventDefault(), onQ(''))} />
      <kbd aria-hidden="true">/</kbd>
      <p id="search-count" className="visually-hidden">{status}</p>
    </search>
  );
}
