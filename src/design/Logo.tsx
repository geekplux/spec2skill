// The "Overlap" mark (docs/redesign/DESIGN.md 3): an indigo rounded square (the spec) and an amber
// circle (the skill); where they overlap is ink (gray-12, so it flips in dark). Fills live in app.css.
// The clip path id is unique per instance (useId), so two marks on one page never share a clip.
// public/favicon.svg, public/logo.svg and docs/media/wordmark*.svg draw the same shapes in fixed hex.
import { useId } from 'react';

export function Logo({ size = 20 }: { size?: number }) {
  const clip = `s2s-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className="logo" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <rect x="1.5" y="1.5" width="13.5" height="13.5" rx="3" />
        </clipPath>
      </defs>
      <rect x="1.5" y="1.5" width="13.5" height="13.5" rx="3" className="logo-spec" />
      <circle cx="15.5" cy="15.5" r="7" className="logo-skill" />
      <circle cx="15.5" cy="15.5" r="7" className="logo-both" clipPath={`url(#${clip})`} />
    </svg>
  );
}

/** The wordmark: the mark at 20 px and "spec2skill" in 14/600, 8 px apart; the text names it. */
export function Wordmark() {
  return (
    <span className="wordmark">
      <Logo />
      spec2skill
    </span>
  );
}
