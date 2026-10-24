# spec2skill redesign: the binding spec ("Route map", v2)

Approved by Sean on 2026-10-24 from the design canvas (https://claude.ai/artifact/STmbh9SHwSwrUt1JSgaDBK, row "v2").
This file replaces the "Survey chart" identity (PLAN.md section 3) and the old rules in `docs/DESIGN.md` wherever they disagree; the final phase rewrites `docs/DESIGN.md` from this file.

The target is drawn in `docs/redesign/target/`:

| File | What it shows |
|---|---|
| `V2Home.html` / `.webp` | Home at 1440, light, Tasks API sample, end state of the load animation |
| `V2HomeDark.html` / `.webp` | The same, dark |
| `V2Hover.html` / `.webp` | The map with `getTask` hovered: its links in ink, the rest faded, the operation card |
| `V2Phone.html` / `.webp` | 390 px, list view selected |
| `V2System.html` / `.webp` | Colour, type, map encoding, logo |
| `V2Motion.html` / `.webp` | Motion table and button states (the demo loops in the HTML) |
| `gen.mjs` + `tasks.json` | The generator of all boards. **Its `CSS`, `PCSS` and `MCSS` constants are the exact CSS**; copy values from there, not from screenshots. `node docs/redesign/target/gen.mjs` regenerates `preview/` and `project/` beside it (do not commit those). |

Open the HTML files in the headless browser or read their `<style>` block. The boards load IBM Plex from Google Fonts for convenience only; the product self-hosts (section 2).

## 1. Sean's UI rules (binding, check every phase)

1. Never use the middle dot "·" as a separator in UI copy, titles, `aria-label`s or docs written in this redesign. Remove existing ones in the UI you touch.
2. No redundant explanatory text in the UI.
3. Copy is clear and fit for developers: not colloquial, no filler, no coined words.
4. Every colour comes from Radix Colors 3.0, used by its 12-step roles: 1-2 backgrounds, 3-5 component backgrounds, 6-8 borders, 9-10 solid fills, 11-12 text. Exception: `#fff` text on `indigo-9` (solid fill text, as Radix documents for solid colours).
5. Optical alignment; nested corners concentric (outer radius = inner radius + padding).
6. Lines and borders are 0.5 px.
7. Minimal motion; ease-out; 250 ms base (section 7 lists every motion).
8. Exactly four font sizes: **12, 14, 20, 48 px**. 12 is the minimum. Hierarchy by weight, colour and space.
9. Minimise decisions; put unavoidable choices where the user already intends to choose.
10. No casual radius or shadow; no card with a coloured left stripe. A radius or shadow must fit its function (the operation card is the only element with a shadow: it floats).
11. No habitual eyebrows or overlines: no small uppercase label above a heading unless it adds what the heading lacks.

Also binding from `CLAUDE.md`: never colour alone, CVD-safe (protanopia, deuteranopia, tritanopia), keyboard operable, reduced motion respected, no decorative 3D, nothing finance-related, never mention Sean's employer.

## 2. Tokens

### Colour

Radix **gray**, **indigo** and **amber**, light and dark (`@radix-ui/colors` 3.0.0 values, or copied into `src/design/tokens.css`; record the choice in `docs/DECISIONS.md`). Expose `--gray-1` ... `--gray-12`, `--indigo-1` ... `--indigo-12`, `--amber-1` ... `--amber-12`, switching on `prefers-color-scheme` (light-dark() is fine).

```
light gray   #fcfcfc #f9f9f9 #f0f0f0 #e8e8e8 #e0e0e0 #d9d9d9 #cecece #bbbbbb #8d8d8d #838383 #646464 #202020
dark gray    #111111 #191919 #222222 #2a2a2a #313131 #3a3a3a #484848 #606060 #6e6e6e #7b7b7b #b4b4b4 #eeeeee
light indigo #fdfdfe #f7f9ff #edf2fe #e1e9ff #d2deff #c1d0ff #abbdf9 #8da4ef #3e63dd #3358d4 #3a5bc7 #1f2d5c
dark indigo  #11131f #141726 #182449 #1d2e62 #253974 #304384 #3a4f97 #435db1 #3e63dd #5472e4 #9eb1ff #d6e1ff
light amber  #fefdfb #fefbe9 #fff7c2 #ffee9c #fbe577 #f3d673 #e9c162 #e2a336 #ffc53d #ffba18 #ab6400 #4f3422
dark amber   #16120c #1d180f #302008 #3f2700 #4d3000 #5c3d05 #714f19 #8f6424 #ffc53d #ffd60a #ffca16 #ffe7b3
```

| Role | Token |
|---|---|
| Page background | `gray-1` |
| Code and command boxes | `gray-2` fill, 0.5 px `gray-6` ring |
| Segmented track, selected tree row, tag, hovered row | `gray-3` |
| Soft rules (section dividers, list rows) | `gray-6` |
| Frames, cards, fields | `gray-7` ring (field: `gray-8`) |
| Quiet edges on the map | `gray-9` |
| Muted text | `gray-11` |
| Ink | `gray-12` |
| The one accent: strongest workflow, primary buttons, audit pass | `indigo-9` (fills, route), `indigo-11` (accent text, check glyphs) |
| Destructive operations (method text), the logo's skill | `amber-11` (text), `amber-9` (logo only) |

The theme follows the system. **Remove the Dark theme toggle** and its storage (decision recorded). Remove the old palette (paper, vellum, ink, graphite, rule, meridian, fir, ochre, brick, plum, marker) and the Bricolage font.

### Type

- **IBM Plex Sans** (400, 500, 600) and **IBM Plex Mono** (400, 500, 600), self-hosted (`@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`, Latin subset only). Check the size budget (`pnpm check:size`) and adjust `scripts/size-budget.json` only with a recorded reason.
- `font-feature-settings: "tnum"` on the root.

| Size | Line height | Use |
|---|---|---|
| 48 | 52 | the hero headline only; 600, letter-spacing -0.035em, `text-wrap: balance` |
| 20 | 28 | hero lede (400, `gray-11`), result title, section titles (600, -0.015em) |
| 14 | 20 | body, controls, operation ids (mono), file names on phones |
| 12 | 16-20 | meta, methods, paths, code, counts, captions |

No other sizes, no uppercase labels, no letter-spaced labels (rule 11).

### Shape and space

- Lines 0.5 px. Radii: cards and boxes 10 (frame 16, cluster cards 8, rows and inner buttons 6, tags 4). Field 10 with a 4 px inset button of radius 6 (concentric).
- **One grid.** Content column 1072 px (`.wrap`: max-width 1136 with 32 px side padding), four columns of 202 px with 88 px gaps. The result frame hangs 32 px outside the column on each side (negative margin) so its contents share the column's left edge. Every block lands on the grid: hero (492 / 492), map columns (x = 0, 290, 580, 870), skill browser (202 / 492 / 202), command line and Made by (492 / 492, links as 202 / 202 rows), How it works (4 x 202).
- Spacing: keep the `--space-*` scale and `scripts/check-spacing.mjs`, but add the values the target needs (12, 32, 48, 64, 88, 96, 104) as tokens if the check requires tokens. Record it.
- Below 1136 px the grid becomes fluid (columns `minmax(0, 1fr)`), below 640 px one column with a 16 px gutter (phone board).

## 3. Logo

"Overlap": an indigo rounded square (the spec) and an amber circle (the skill); where they overlap is ink (`gray-12`, so it flips in dark).

```svg
<svg viewBox="0 0 24 24" aria-hidden="true">
  <defs><clipPath id="s2s-a"><rect x="1.5" y="1.5" width="13.5" height="13.5" rx="3"/></clipPath></defs>
  <rect x="1.5" y="1.5" width="13.5" height="13.5" rx="3" fill="var(--indigo-9)"/>
  <circle cx="15.5" cy="15.5" r="7" fill="var(--amber-9)"/>
  <circle cx="15.5" cy="15.5" r="7" fill="var(--gray-12)" clip-path="url(#s2s-a)"/>
</svg>
```

Use a unique clip id per instance (`useId`). Wordmark: logo 20 px + "spec2skill" 14/600, gap 8. Replace `src/design/Logo.tsx`, `public/` favicon (SVG with fixed hex values, since CSS variables do not reach a favicon), `docs/media/wordmark*.svg`.

## 4. Page (desktop, `V2Home`)

Top to bottom:

1. **Header**, 56 px, 0.5 px `gray-6` bottom rule: wordmark left; right: "How it works", "Command line" (in-page anchors), "GitHub" (14, `gray-11`, hover `gray-12`). No buttons.
2. **Hero** (padding 104 top, 64 bottom), grid 492 / 492, `align-items: end`:
   - Left: h1 "Turn any API into an agent skill" (48), lede "Paste an OpenAPI spec or an MCP server. Get a tested skill, and a map to check what it teaches." (20, `gray-11`).
   - Right: the **source field** (48 px tall, radius 10, `gray-8` ring) with the placeholder "OpenAPI or MCP URL, or paste the spec" and an inset **Generate** button (40 px, `indigo-9`). Pasted multi-line text keeps working (the field grows into a textarea as today; Enter loads, Shift+Enter new line). **Open file** stays reachable: an icon button (16 px icon, 32 px target, `aria-label="Open a spec file"`) inside the field left of Generate, plus drag and drop onto the field. The **More options** source selector is removed: detection is automatic (record it; keep the parser's detection).
   - Under the field: "Samples" (14, `gray-11`) and a segmented control filling the rest of the width: Tasks API, Petstore, Filesystem MCP. Selected tab: `gray-1` with a 0.5 px `gray-7` ring. When the user has loaded their own source, no tab is selected.
3. **Result frame** (radius 16, 0.5 px `gray-7` ring, padding 32, hangs 32 px outside the column):
   - **Head**: title = the API title (20/600). Meta line (14, `gray-11`, numbers `gray-12` 500, 20 px gaps): source kind and version ("OpenAPI 3.1", "Swagger 2.0", "MCP"), "N operations", "N resources", "N links", then tags: "Sample" for built-in samples, "AI-drafted prose" when AI text is in use, "N warnings" (opens the warnings disclosure) when there are any. Right: **Install command** (secondary button; copies the two commands at once, label becomes "Copied" with a check for 2 s; the commands themselves are shown in its `title` and announced) and **Download .zip** (primary). Remove the "Install command" disclosure.
   - **Tools row** (margin-bottom 24): left a Map | List segmented control and the search field (202 wide, 40 tall, search icon, placeholder "Search", a `/` key hint; `/` focuses it). Right the legend: "Output feeds input" (solid `gray-9`), "Inferred" (dashed), "Strongest workflow" (2.5 px `indigo-9`). Remove the Filters disclosure, the zoom buttons and the Keyboard shortcuts button (`?` still opens the shortcuts dialog; add "Keyboard shortcuts" to the footer).
   - **Map** (section 5) or **List** (section 6).
   - **Workflow caption** (margin-top 16): "Strongest workflow" (`gray-11`), then each stop disc with its operation id (mono 14) and the link label between them (`id → projectId`, mono 12 `gray-11`). Hidden when the spec has no chain.
   - **Skill browser** (0.5 px `gray-6` top rule, 40 margin, 32 padding), grid 202 / 492 / 202:
     - Files: heading `<slug>/` (mono 14/600); rows 28 px (icon 14, name mono 12, count 12 `gray-11`), selected row `gray-3` radius 6; "Edit name and licence" (12, `gray-11`, underlined 0.5 px) toggles the slug and licence fields (and "Use deterministic text" when AI text exists) in place below it.
     - Preview: heading = file name (14/600) + "N lines" (12 `gray-11`) + a copy icon button; the file in a code box (`gray-2`, radius 10, mono 12/20, line numbers `gray-11`, wraps, max-height 392 with its own scroll, keyboard scrollable).
     - Audit: heading with the pass glyph (16 px `indigo-9` circle with a white check) "Audit passed" and "N of N"; then every check as a row (check glyph `indigo-11`, 12/16 text, 0.5 px `gray-6` rules). A failing check uses an amber `!` glyph and the word "Failed" (never colour alone). The audit is always open (remove its disclosure).
4. **Command line** section (`#cli`, padding-top 96), grid 492 / 492: "Run it from the command line" (20) and "Writes the skill to disk and ends with its audit. Works offline, with no key." (`gray-11`); right the command box (`gray-2`, mono 12, `$` prompts `gray-11`, copy icon button) with the three commands from the README quick start.
5. **How it works** (`#how`, padding-top 96): title, then four 202 px columns, each with a 0.5 px `gray-7` top rule: Parse, Relate, Write and audit, Check (copy in the target).
6. **Made by GeekPlux** (margin-top 96, 0.5 px rule, padding-top 48), grid 492 / 492: left title, "Writing, projects and data visualization", `geekplux.com` (mono 12 underlined, https://geekplux.com). Right four rows (202 / 202): name (14/500) + URL (mono 12 `gray-11`) | one line (`gray-11`): Vert (https://vert.geekplux.org), Explorable (https://explorable.geekplux.com), Reasontrail (https://reasontrail.geekplux.com), markvis (https://github.com/geekplux/markvis).
7. **Footer**: 0.5 px rule, 72 px: wordmark left; right "How it works", "GitHub", "Keyboard shortcuts", "MIT licence".

Loading, error and empty states live inside the result frame and use the same tokens: while loading, the Generate button shows the current stage ("Fetching", "Parsing", "Relating", "Writing", "Auditing", with a 16 px spinner, `aria-live` announces it) and the previous result stays greyscale; the error replaces the frame body with the title (20/600), the reason (14 `gray-11`) and its two recovery actions; empty spec keeps its sentence. Keep their behaviour and tests; restyle only.

## 5. The map ("route map")

Encoding (see `V2Home`, `V2Hover`, `V2System`):

| Element | Drawing |
|---|---|
| Resource (cluster) | A card 202 wide: radius 8, `gray-1`, 0.5 px `gray-7` ring; head 36 px (name 14/600, count 12 `gray-11`, 0.5 px `gray-6` rule) |
| Operation | A 32 px row inside the card (a real `<button>`): method as text (mono 12, `gray-11`, 44 px column; DELETE or a destructive hint in `amber-11`), operation id (mono 14, ellipsis), stop disc if on the strongest workflow. MCP tools have no method: show "tool" in the method column, or the read-only/destructive hint word ("read", "write", "delete") — pick one and record it |
| Feed link (output feeds input), between columns | Cubic curve, 1 px `gray-9`, small open arrowhead at the target, from the source row's right edge to the target row's left edge |
| Inferred link | The same, dashed 3 3 |
| Bundle (one source feeding many operations of one resource) | One curve to the target card's head |
| Strongest workflow (`topChains()[0]`) | 2.5 px `indigo-9` with a 6 px `gray-1` halo underneath, filled arrowhead; the row ids in `indigo-11` 600 and an `indigo-9` disc (18 px, white 12/600 number) at the row's right end; a same-card step is a loop on the card's left edge |
| Same-card and backward links, sub-path and shared-schema links | Not drawn at rest. On hover or focus of an operation they appear (1.25 px `gray-12`, arrowheads), with its feed links; everything unrelated fades to opacity 0.38 (rows) or `gray-6` (links). Sub-path and shared-schema relations are listed as text in the operation card |

Layout (new pure module, e.g. `src/layout/route.ts`, unit-tested and snapshot-tested on the three samples and the synthetic large spec):

1. **Columns by dependency.** Build the resource-to-resource feed graph (cross-cluster feed edges only). Column = longest-path depth from the resources nobody feeds (break cycles by model order). Tasks API gives Projects (0), Members and Labels (1), Tasks (2), Comments (3).
2. **The main line.** The strongest workflow's resources form the main line: their cards' tops share one y, so the workflow is a straight horizontal line between columns (Projects, Tasks, Comments in the sample). Other resources in a column stack above and below the main line, alternating, with at least 32 px clearance from every main-line row they would cross.
3. Operations keep the cluster's CRUD order (list, create, read, update, delete, action).
4. Column spacing comes from the grid (x = 0, 290, 580, 870). With more than four columns, or a column wider than the frame, the map scrolls horizontally inside the frame (native scroll, a keyboard-focusable scroll region with a label); no zoom controls.
5. Large specs: a card shows at most 8 rows, then a "N more" row that expands it in place (focusable, `aria-expanded`). Keep the existing collapse logic where it helps; the synthetic spec must stay readable and within the existing performance budget.
6. Deterministic: same input, same layout (snapshot).

Interaction:

- Hover or keyboard focus on an operation row: highlight state above, and the **operation card** next to the row (300 wide, radius 10, `gray-1`, 0.5 px `gray-7` ring plus `0 8px 24px rgba(0,0,0,.08)` shadow, padding 16): method and path (mono 12 `gray-11`), title (14/600), then a definition list (12): Input (name mono, then "in, type, required"), Output, Fed by, Feeds, Shares schema, Sub-path, In skill (link to the reference file, opens it in the preview). The card flips to the left of the row when it would overflow.
- Click or Enter pins the card (it gets a Close button and keeps focus management of today's detail panel: Escape closes and returns focus to the row). This replaces the detail panel; keep its tests by moving them.
- Arrow-key navigation between rows and cards keeps working (`src/map/keyboard.ts`), now on the column layout; `?` shortcuts dialog stays.
- Search filters rows: matches stay ink, others fade (0.38); the count of matches is announced. URL state (`#op=`, `q=`, view) keeps working.

## 6. List view and phones

- List view (desktop and phones): grouped by resource, each group a 14/600 heading with the count; rows 44 px min: method (mono 12, 48 px column), operation id (mono 14) with the path under it (mono 12 `gray-11`), stop disc for workflow operations. A row opens the same operation card (pinned). Keep the "N relationships" text alternative for screen readers.
- Phones (`V2Phone`, below 640 px): one column, 16 px gutter. Hero stacks (the field becomes a column: input above a full-width Generate). Sample tabs fit one line. The result is not a framed card: a 0.5 px rule above it, title, meta (wraps), full-width **Download .zip** then **Install command**. Map | List with **List selected by default** on phones; the workflow chain as one line above the list. Below the list: the skill files as 44 px rows (each opens the file in a full-width preview), then "Audit passed  9 of 9" as one row that expands the checks. The Skill | Map | List tabs of today are replaced by this single scroll.
- 640 to 1136 px: the grid is fluid; the skill browser becomes files + preview over audit; the map scrolls horizontally if needed.

## 7. Motion

All ease-out, 250 ms base, one-shot, and none at all under `prefers-reduced-motion: reduce` (everything appears in its end state).

| Moment | What moves | Timing |
|---|---|---|
| Load or switch sample | Resource cards rise 4 px and fade in, column by column, 40 ms apart | 250 ms |
| | Feed links fade in after the cards | 250 ms, delay 200 ms |
| | The strongest workflow draws left to right (stroke-dashoffset with `pathLength="1"`); each stop disc pops (scale 0.5 to 1, fade) as the line reaches it | 300 ms a segment |
| | Audit check rows fade in, top to bottom, 30 ms apart | 250 ms |
| Hover or focus an operation | Unrelated rows and links fade; the related links appear; the operation card rises 4 px and fades in | 250 ms |
| Generate | The button label names the stage (Fetching, Parsing, Relating, Writing, Auditing) with a spinner; the new result replaces the old with the load sequence above | 250 ms per swap |
| Download, copy | The label becomes "Downloaded" or "Copied" with a check glyph, back after 2 s | 250 ms |

No other motion (no parallax, no scroll-triggered effects, no hover lifts on buttons).

## 8. Acceptance checks (automate; run in every UI phase)

1. **Type sizes.** A browser script collects the computed `font-size` of every element with direct text on home (1440, light and dark), hover state and phone (390). The set must be a subset of {12, 14, 20, 48}.
2. **Colours.** The same script collects computed `color`, `background-color`, `border-*-color`, `outline-color`, `fill`, `stroke`; every value must be a Radix value above (light or dark set as applicable), `#fff` on indigo-9, transparent, or the 8% black shadow.
3. **Lines.** Borders and rules are 0.5 px (box-shadow rings count).
4. **Middle dot.** `grep -rn "·" src index.html` finds nothing in UI strings.
5. **CVD and contrast.** `src/design/cvd.test.ts` and `contrast.test.ts` cover the new tokens: text pairs at AA (4.5:1; 3:1 for 20 px 600 and up), indigo-9 vs amber-11 vs gray-12 distinguishable under all three simulations, `gray-9` links at least 3:1 on `gray-1`.
6. **Grid.** At 1440, the left edges of the h1, the frame contents, the first map column, the files column, the command-line title, How it works and Made by are all at the same x; the right column's x (580 from the column edge) is shared by the hero field, the third map column, the command box and the Made by rows (tolerance 1 px).
7. **Reduced motion.** With `reducedMotion: 'reduce'` no element has a running animation or transition.
8. **Budgets and a11y.** `pnpm check:size` passes; axe finds no violations on home, hover/pinned card, list and phone in both themes.
