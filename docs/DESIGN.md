# spec2skill design: the Route map

This is the current design of the web app, as built. It was approved by Sean on 2026-10-24 as the "Route map" redesign and built in phases R1 to R7; [docs/redesign/DESIGN.md](redesign/DESIGN.md) is the historical spec it was built from, and `docs/redesign/target/` holds the approved boards (V2Home, V2HomeDark, V2Hover, V2Phone, V2Motion, V2System). Where the build departs from that spec, this file says what was built and names the decision in [docs/DECISIONS.md](DECISIONS.md) (D30 to D74) that records why.

Every rule below is checked: `scripts/browser/flows/redesign-acceptance.mjs` runs section 8 on every sample, light and dark, at 1440 and 390 px, at rest, on hover, with the card pinned, in the list and on the phone; the unit tests guard tokens, contrast, colour vision, copy and motion.

## 1. The rules (Sean's 11, binding on every change)

1. Never use the middle dot as a separator in UI copy, titles, `aria-label`s, docs or generated skills (D58).
2. No redundant explanatory text in the UI.
3. Copy is clear and fit for developers: not colloquial, no filler, no coined words.
4. Every colour comes from Radix Colors 3.0 by its 12-step roles: 1-2 backgrounds, 3-5 component backgrounds, 6-8 borders, 9-10 solid fills, 11-12 text. Exception: `#fff` text and icons on `indigo-9`.
5. Optical alignment; nested corners concentric (outer radius = inner radius + padding).
6. Lines and borders are 0.5 px.
7. Minimal motion; ease-out; 250 ms base; only the moments of section 7.
8. Exactly four font sizes: 12, 14, 20, 48 px. Hierarchy by weight, colour and space.
9. Minimise decisions; put unavoidable choices where the user already intends to choose.
10. No casual radius or shadow; no card with a coloured left stripe. The operation card is the only element with a shadow (it floats).
11. No habitual eyebrows or overlines.

Also binding (CLAUDE.md): never colour alone; CVD-safe under protanopia, deuteranopia and tritanopia; keyboard operable; reduced motion respected; no decorative 3D; nothing finance-related.

## 2. Tokens (`src/design/tokens.css`, mirrored in `src/design/tokens.ts`)

### Colour

Radix gray, indigo and amber 3.0.0, copied as 36 `light-dark()` custom properties (D30). The theme follows the system through `color-scheme: light dark`; there is no theme toggle and nothing is stored (D31).

| Role | Token |
|---|---|
| Page | `gray-1` |
| Code and command boxes | `gray-2` fill, 0.5 px `gray-6` ring |
| Segmented track, selected file, tag, hovered row | `gray-3` |
| Faded links while a row is hot | `gray-5` (D47) |
| Soft rules (section dividers, list rows, audit rows) | `gray-6` |
| Frames, cards | `gray-7` ring; the source field `gray-8` |
| Links on the map at rest | `gray-9` (3.2:1 on `gray-1`) |
| Muted text | `gray-11` |
| Ink | `gray-12` |
| The one accent: strongest workflow, primary buttons, audit pass | `indigo-9` (fills, the route), `indigo-11` (text, check glyphs) |
| Destructive method text | `--destructive`: `amber-12` in light (amber-11 on gray-1 is 4.49:1, just under AA), `amber-11` in dark (D34) |
| Destructive warning mark, failed check `!` | `amber-11` (a graphic, over 3:1 in both themes) |
| The logo's skill | `amber-9` (logo only) |

### Type

IBM Plex Sans and IBM Plex Mono, 400, 500 and 600, Latin subset, self-hosted woff2 (D32); `font-feature-settings: "tnum"` on the root.

| Size / line | Use |
|---|---|
| 48 / 52 | the hero headline only (600, -0.035em, balanced) |
| 20 / 28 | hero lede (400, `gray-11`), result title, section titles (600, -0.015em) |
| 14 / 20 | body, controls, operation ids (mono), file names on phones |
| 12 / 16 | meta, methods, paths, code, counts, captions, the operation card's list |

No other sizes, no uppercase or letter-spaced labels.

### Lines, shape and space

- Lines are 0.5 px box-shadows (`0 0 0 var(--line)` rings, `inset 0 ±var(--line) 0` rules), never CSS borders, which Chrome renders 1 px at 0.5 (D33). Focus is a 2 px `gray-12` outline. Map strokes are SVG.
- Radii: frame 16, boxes and the source field 10 (its inset Generate 6, concentric at 4 px), cluster cards 8, rows and inner buttons 6, tags 4.
- One shadow, `--shadow-float` (`0 8px 24px rgba(0, 0, 0, 0.08)`), on `.op-card` only.
- Spacing tokens are named by value (`--space-16` is 16 px): 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48, 64, 88, 96, 104; `scripts/check-spacing.mjs` rejects raw lengths in spacing properties (D38, D51).

### One grid (D39)

`.wrap` is at most 1136 px with 32 px padding: a 1072 px column of four 202 px columns with 88 px gaps (grids use `minmax(0, 1fr)` columns and a `min(88px, 7.75vw)` gap, exact from 1136 px and fluid below). The left edges of the h1, the frame's contents, the first map column, the files column, the command-line title, How it works and Made by share one x; the hero field, the third map column, the command box and the Made by rows start 580 px in (checked to 1 px). The result frame hangs 32 px outside the column on each side; below 1200 px `.wrap` takes 48 px padding so the frame keeps at least 16 px from the window. The hero stacks below 960 px; under 640 px everything is one column with a 16 px gutter.

## 3. Logo

"Overlap": an `indigo-9` rounded square (the spec) and an `amber-9` circle (the skill), their overlap in `gray-12` so it flips in dark (`src/design/Logo.tsx`, a unique clip id per instance). Wordmark: the mark at 20 px and "spec2skill" 14/600, gap 8. The favicon and `docs/media/wordmark*.svg` carry fixed hex values.

## 4. The page (V2Home)

1. **Header**, 56 px, a 0.5 px `gray-6` rule under it: the wordmark; How it works, Command line, GitHub (14, `gray-11`). In-page links scroll to their section and move focus without touching the URL, whose hash is `#op=`. On phones the links sit behind a Menu button (Escape or a tap outside closes it) (D40).
2. **Hero**, 492 / 492, bottoms aligned: h1 "Turn any API into an agent skill" and the lede; the **source field** (48 px, "OpenAPI or MCP URL, or paste the spec") with an Open file icon button and the inset **Generate**; pasted text grows it into a textarea (Enter loads, Shift+Enter adds a line); a file can be dropped on it. There is no source selector: a URL is fetched as a spec and, when it is not one, tried as an MCP server (D37). Generate with an empty field writes the current skill again. Under it, "Samples" and a segmented control of native radios (Tasks API, Petstore, Filesystem MCP; one Tab stop, arrows select; none checked for the user's own source).
3. **Result frame** (radius 16, `gray-7` ring, padding 32):
   - **Head** (D56): the API title (h2, 20/600); a meta line of source kind and version ("OpenAPI 3.1", "Swagger 2.0", "MCP"), operations (tools for MCP), resources and links, with numbers in `gray-12` 500 and 20 px gaps; tags "Sample", "AI-drafted prose" (only when AI prose is in use) and "N warnings" (a button that discloses the parser's warnings). Right: **Install command** copies `mkdir -p .claude/skills && unzip <slug>-skill.zip -d .claude/skills/ && node .claude/skills/<slug>/scripts/audit.mjs .claude/skills/<slug>` (D63), shown in its title and announced, with a by-hand fallback if the clipboard refuses; **Download .zip** (primary). Each turns into "Copied" or "Downloaded" with a check for 2 s.
   - **Tools row**: Map | List (a tablist), the search field (202 x 40, "Search", a `/` hint), and the legend: Output feeds input, Inferred, Strongest workflow (the last only when the map draws one).
   - **Map** (section 5) or **List** (section 6).
   - **Workflow caption**: "Strongest workflow", then each stop's numbered disc and operation id with the carrying field between them (`id → projectId`). None when the spec has no chain.
   - **Skill browser** (D57), under a 0.5 px rule, on 202 / 492 / 202: the files (`<slug>/`, 28 px rows, folders with counts, "Edit name and licence" opening the name, licence and, when AI text exists, "Use deterministic text" in place); the preview (file name, line count, copy; the file in a `gray-2` code box with CSS line numbers, wrapping, scrolling inside at 392 px and keyboard scrollable); the audit, always open: "Audit passed" with its glyph and "N of N", then each check as a short true sentence ("2 worked examples are present", "7 evals name known operations"); a failing check shows an amber `!` and the word "Failed". From 640 to 1135 px files and preview sit over the audit.
4. **Run it from the command line** (`#cli`), 492 / 492: the title, "Writes the skill to disk and ends with its audit. Works offline, with no key.", and the command box with copy (a check and "Commands copied" for 2 s). Lines hang 2ch so a wrapped command never starts at the `$` column.
5. **How it works** (`#how`): Parse, Relate, Write and audit, Check, on four 202 px columns under 0.5 px rules.
6. **Made by GeekPlux**: the title, "Writing, projects and data visualization", geekplux.com; four project rows (Vert, Explorable, Reasontrail, markvis).
7. **Footer**: the wordmark; How it works, GitHub, Keyboard shortcuts (the `?` dialog), MIT licence.

**Loading, error and empty states** live in the frame (D61, D65). While loading, the previous result greys and Generate names the running step with a 16 px spinner: "Fetching" for a URL or "Reading" for a file or pasted text, then "Parsing", "Relating", "Writing", "Auditing". Each label is painted before its step's synchronous work and stays up at least 100 ms (`stageTimer` in `src/source/stages.ts`): a step that starts sooner is shown when the time is up if the thread is free, else skipped, so nothing waits for a label and a fast load shows one stage without flicker. The loading panel lists the same steps with Cancel, and the announcer reads each shown step once. Sample switches show no stage. Generate is at least 112 px wide (its widest label with the spinner) so the field holds still: from about 1007 px the field's content box (a container query at 396 px) gives it 112 at rest and while loading; from 960 to about 1007 px it rests at 91 px and widens to 112 once when a load starts and narrows once when it ends, so a URL keeps 240 px; on phones it is a full-width row. An error replaces the frame's contents with its title, reason and two recovery actions, "Paste spec text instead" and "Try a sample"; an empty spec keeps its note in the skill browser.

## 5. The map (`src/map/RouteMap.tsx`, layout in `src/layout/route.ts`)

| Element | Drawing |
|---|---|
| Resource | A card 202 wide: radius 8, `gray-1`, `gray-7` ring; a 36 px head (name 14/600, count 12 `gray-11`, a `gray-6` rule) |
| Operation | A 32 px row, a real `<button>`: the method (mono 12, `gray-11`, a 44 px column), the operation id (mono 14, ellipsis), the stop disc on workflow rows. MCP tools show `read` (read-only by hint or by name) or `write` (D41) |
| Destructive operation | DELETE and destructiveHint tools alike: method text in `--destructive` and a 12 px `amber-11` warning triangle at the row's right end, left of a stop disc; the row's name says "destructive" and the mark is `aria-hidden` (D41, D53). The method column stays 44 px so ids keep one x |
| Feed link (output feeds input) | A curve, 1 px `gray-9`, open arrowhead at the target, from the source row's right edge to the target row's left edge |
| Inferred link | The same, dashed 3 3 |
| Bundle | One source feeding many operations of one resource: one curve to the target card's head. Three or more feed links from one card to a card two or more columns to its right also rest as one line between the two heads (D54) |
| Strongest workflow (`topChains()[0]`) | 2.5 px `indigo-9` over a 6 px `gray-1` halo, a filled arrowhead; workflow ids `indigo-11` 600; an 18 px `indigo-9` disc with its white 12/600 number at the row's right end (CSS `::after`, so the number is not in the row's visible text); a same-card step loops out of the card's left edge |
| Same-card, same-column and backward links, sub-path and shared schema | Not drawn at rest |

**Layout** (pure and deterministic, snapshot-tested on the three samples and the synthetic 1000-operation spec):

1. Columns by dependency: the resource feed graph, cycles broken by the greedy feedback-arc order of Eades, Lin and Smyth (after dropping any pair that runs back against the strongest workflow), each resource at its longest-path depth (`src/layout/route-columns.ts`, D42). Tasks API: Projects | Members, Labels | Tasks | Comments. Resources with no feeds to or from another go to the shortest of the first four columns, biggest first (D43).
2. The main line: the workflow's cards sit so the line runs straight between columns; other cards of a column stack above and below, alternating, at least 32 px clear of the cards and of the line's row band (D44).
3. Operations keep CRUD order: list, create, read, update, delete, action.
4. Columns at x = 0, 290, 580, 870. More than four columns, or a map wider than the frame, scroll sideways inside the frame: a native scroller (`role="region"`, "Map, scrolls sideways", focusable), its box tight to what can be drawn, hover links included (D50). No zoom.
5. A card shows at most 8 rows (workflow stops always among them), then "N more" (focusable, `aria-expanded`), which expands it in place.
6. Links never cross a card: they curve only in the 88 px gaps and cross a column through the free corridor nearest the straight line, 8 px clear, 6 px apart when they share it; the workflow's row band blocks them like a card (D44).

**Interaction**

- **Hover or focus an operation** (D45, D47): its feed links appear, each its own 1.25 px `gray-12` curve with an arrowhead (sub-path and shared-schema relations are listed in the card and the list, not drawn). Rows are lit or faded by weight as well as colour: lit (the hot row, rows its links reach, search matches) id `gray-12` 600 and method 500; faded id and method `gray-11` 400; a card with no lit row fades its name to `gray-11` 500; rest links fade to `gray-5` without arrowheads and the workflow line and discs rest in `gray-5` until nothing is hot. Not opacity 0.38, which drops buttons to about 2.3:1.
- **The operation card** (D46, D60, D70, D76): 300 wide, radius 10, `gray-1`, `gray-7` ring and the float shadow, padding 16; method and path, title, then Input, Output, Fed by, Feeds, Shares schema, Sub-paths, Sub-path of, In skill (opens the reference file in the skill browser). It sits 16 px right of the row's card with its top 40 px above the row's centre, flips left of the card at the frame's or window's edge, and never covers the skill browser: any preview that would end more than 64 px under the map rises beside its row until it ends there, so it is never cut either (D76); only a preview taller than the map and those 64 px together starts at the map's top and passes the line (D70). The hover preview is `aria-hidden` (the row's name carries the essentials); a pointer has 150 ms to travel from the row to it.
- **Pinned** by click, Enter or Space: a non-modal dialog named by its title, after the map in the Tab order, with Close, the description, auth, related operations as buttons that move the pin, and the example request with Copy example. Escape closes it and returns focus to the row; `#op=` names the pinned row and back and forward move the pin. Its height is capped at the map's bottom plus 64 px and it scrolls inside, so it never covers the skill browser. On phones it is a bottom sheet (at most 50dvh) with the page padded so a focused row stays clear; in the list it docks under the groups.
- **Keyboard** (`src/map/keyboard.ts`, D48): the map is one Tab stop (roving tabindex); arrows move to the nearest row that way, Page Up and Page Down change card, Home and End go to a card's first and last row, E cycles the focused row's relationships (announced, the far row outlined), Enter or Space pins; `?` opens the shortcuts dialog anywhere outside a text field. A row's name starts with its visible text: "GET getTask, /tasks/{taskId}, Get a task, workflow step 3, cluster Tasks, 13 relationships".
- **Search**: `/` focuses it; matches stay lit, the rest fade, and the count is announced. URL state keeps `#op=`, `q=` and `view=` (`map` or `list`).

## 6. List view and phones

- **List** (D59): groups by resource in the map's column order, each a disclosure heading (14/600, count 12 `gray-11`) over 44 px rows: method (mono 12, a 48 px column), operation id (mono 14) over its path (mono 12 `gray-11`), the stop disc and the destructive mark as on the map. A row pins the same card, docked. After each row a visually hidden list gives its relationships in words, so the list is the map's full text alternative. Desktop opens every group; phones open the workflow's groups first; a search or a pin opens its group.
- **One scroll at every width** (D55): no Skill tab. Without `?view=` desktop opens the Map and phones (under 640 px) the List.
- **Phones** (V2Phone): one column, 16 px gutter; the hero's field over a full-width Generate; the samples on one line. The result is not a card: a full-width 0.5 px rule above it, the title, the meta (wrapping), a full-width Download .zip then Install command, Map | List with List selected, the workflow as one compact line above the list. Then the skill's files as 44 px rows (each opens a full-width preview with Close), and "Audit passed, 9 of 9" as one row that expands its checks. Nothing scrolls sideways at 320 px.

## 7. Motion (`src/design/motion.tsx`)

All ease-out, one-shot, `--motion-map` 250 ms and `--motion-draw` 300 ms, both 0 under `prefers-reduced-motion: reduce`, where every state appears at once and the spinner is a still arc. Every animation is declared only under `prefers-reduced-motion: no-preference`; `src/design/motion.test.ts` fails on any transition or animation not listed here (in any case, longhand or vendor-prefixed, in CSS, `index.html` or a script, `el.style['transition'] = …` included), on smooth scrolling and on unused keyframes.

| Moment | What moves | Timing |
|---|---|---|
| A new result (first view, load, sample switch, Generate) | Cards rise 4 px and fade in, column by column | 250 ms, 40 ms a column (the stagger stops at column 8) |
| | The links fade in as one layer | 250 ms from 200 ms |
| | Each workflow segment draws left to right (`pathLength="1"`, dash offset 1 to 0); its arrowhead appears when it is drawn | 300 ms a segment from 450 ms |
| | Stop disc k pops (scale 0.5 to 1, fade) as the line reaches it | at 450 + 300 (k - 1) ms, 250 ms |
| | Audit rows fade in, top to bottom | from 900 ms, 30 ms apart |
| | Phones and the list: groups rise like cards; the phone's audit row fades in | 40 ms apart; at 900 ms |
| Hover or focus an operation | Rows' grey and lit or faded text, links fading to `gray-5`, the hot links and the card fading in, the card rising 4 px | 250 ms, transitions declared only while a row is hot and 250 ms after, so a theme change or a search snaps (D67) |
| Generate | The stage label swaps; the spinner turns | 250 ms a swap; 800 ms a turn (the one loop) |
| Copy, download | The label becomes "Copied", "Downloaded" or "Commands copied" with a check, back after 2 s | 250 ms |

The sequence plays while the result carries `data-enter` (`useEnter`), cleared when the last disc has popped and at least 2 s after it started; nothing mounted later (a hover, a search, "N more", a resize) replays it (D66). The 1000-operation spec runs one animation per card and one for the links. No other motion: no hover lifts, no button transitions, no scroll effects. The V2Motion board pops each disc 250 ms earlier than this (at 200 + 300 i ms, before the line arrives); the product follows the table.

## 8. Acceptance checks

`pnpm build && pnpm check:browser -- --phase 21 --flow redesign-acceptance` runs all of them and prints each check's result for each state:

1. **Type**: the computed `font-size` of every element with text is 12, 14, 20 or 48.
2. **Colours**: every computed colour, background, border, outline, fill, stroke, decoration and placeholder colour is a Radix value of the page's theme, `#fff` on `indigo-9`, transparent, or the 8 % black float shadow; nothing sits at an opacity between 0 and 1 at rest (a faded colour is not a Radix step, so the shortcuts dialog's backdrop is opaque `gray-1`, D77). `::before` and `::after` with content (the workflow's stop discs, the line numbers) and an open modal dialog's `::backdrop` are read like elements.
3. **Lines**: no CSS border; every ring and rule is 0.5 px; an outline only on focus; the only blur is the operation card's float.
4. **Middle dot**: none in rendered text, names or titles, nor in `src` or `index.html` (also `src/design/copy.test.ts`).
5. **CVD and contrast**: `src/design/cvd.test.ts` and `contrast.test.ts` (text at AA, `indigo-9`, `amber-11` and `gray-12` distinguishable under the three simulations, `gray-9` links at 3:1).
6. **Grid**: at 1440 the left and 580 px edges of section 2, with the skill browser's columns and the map's four columns, to 1 px (`GRID_PARTS` in `scripts/browser/redesign-checks.mjs`; a map of fewer than three columns has no third column to measure).
7. **Reduced motion**: no running or declared animation or transition at rest, on hover, in the list and on the phone.
8. **Budgets and accessibility**: `pnpm check:size` passes; axe finds no violation of any impact.

The states: every sample (Tasks API, Petstore, Filesystem MCP) in light and dark, at 1440 (rest, hover, pinned, list) and 390 (phone list, phone map, phone pinned sheet), plus no sideways page scroll in each.
