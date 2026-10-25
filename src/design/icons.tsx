// Stroke icons as drawn in docs/redesign/target/gen.mjs (`I`): 16 px controls, 14 px file rows and
// check glyphs, 12 px chevrons. Decorative: every one is aria-hidden next to its words.
const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.25, 'aria-hidden': true } as const;

export const COPY_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
  </svg>
);

export const DOWNLOAD_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" {...STROKE} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
  </svg>
);

/** The check of a passed audit row, and of "Copied" and "Downloaded" (14 px, or 16 in buttons). */
export const checkIcon = (size = 14) => (
  <svg className="i-check" width={size} height={size} viewBox="0 0 16 16" {...STROKE} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);

/** A failed audit row: an amber `!` (never colour alone: the row also says "Failed"). */
export const FAIL_ICON = (
  <svg className="i-fail" width="14" height="14" viewBox="0 0 16 16" {...STROKE} strokeWidth={1.75} strokeLinecap="round">
    <path d="M8 3v6.5M8 12.75v.25" />
  </svg>
);

/** The audit verdict: a 16 px indigo-9 disc with a white check, or an amber-11 disc with a `!` on failure. */
export const verdictIcon = (ok: boolean) => (
  <svg className="i-verdict" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" data-ok={ok}>
    <circle cx="8" cy="8" r="7" />
    {ok
      ? <path d="m5 8.2 2 2 4-4.4" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      : <path d="M8 4.5v4.25M8 11.25v.25" fill="none" strokeWidth="1.75" strokeLinecap="round" />}
  </svg>
);

export const FOLDER_ICON = (
  <svg width="14" height="14" viewBox="0 0 16 16" {...STROKE} strokeLinejoin="round">
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.8l1.4 1.5h4.8A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
  </svg>
);

export const FILE_ICON = (
  <svg width="14" height="14" viewBox="0 0 16 16" {...STROKE} strokeLinejoin="round">
    <path d="M4 2h5.5L12.5 5v8.5a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-11A.5.5 0 0 1 4 2z" />
    <path d="M9.5 2v3h3" />
  </svg>
);

export const CHEVRON_ICON = (
  <svg className="i-chev" width="12" height="12" viewBox="0 0 16 16" {...STROKE} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 4 4 4-4 4" />
  </svg>
);

/** The theme button (D82): a moon while light (a click goes dark), a sun while dark; 16 px like the controls. */
export const MOON_ICON = (
  <svg className="i-theme" width="16" height="16" viewBox="0 0 16 16" {...STROKE} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2a4 4 0 0 0 6 6 6 6 0 1 1-6-6z" />
  </svg>
);

export const SUN_ICON = (
  <svg className="i-theme" width="16" height="16" viewBox="0 0 16 16" {...STROKE} strokeLinecap="round">
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M12.6 3.4l-1.06 1.06M4.46 11.54 3.4 12.6" />
  </svg>
);
