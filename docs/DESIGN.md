# spec2skill design rules

The identity ("Survey chart": type, palette, logo, motion) is in [PLAN.md section 3](PLAN.md#3-design-direction-survey-chart). This file holds the rules reviewers apply to screenshots and the DOM. Every rule below is checkable from a screenshot at 1440 px and 390 px, or from the DOM.

## Calm layout

Binding from phase 15 on (Sean's direction of 2026-10-21, PLAN.md 3.7). The product's focal point is **the generated skill** (file tree, SKILL.md preview, the "Audit passed" line). The map sits beside it as the quiet way to check it. Phase 18 brought the views built in phases 5-14 into line (the "Calm polish audit" below); every view added or changed must pass the checklist at the end of this section.

### 1. One focal point per view

Each view has exactly one focal point. Everything else is visibly secondary: smaller, in a neutral colour, or one step away behind a disclosure.

| View | The one focal point | Visibly secondary |
|---|---|---|
| First view (desktop: skill pane + map; phones: Skill tab) | The skill pane: file tree, SKILL.md preview, the "Audit passed" summary line, and **Download .zip** | The map pane (beside it, no accent fill), the title block, the sample chips |
| Map (pane or tab) | The focused/selected node and its edges (the only accent-weight strokes) | Toolbar, search, cluster labels, other nodes and edges at normal weight |
| List view | The operations table (cluster captions + rows) | Search, filters, the summary line above the table |
| Detail panel | The operation's name, method + path, and its "In the skill" link | Inputs, outputs, auth, related operations, Copy example |
| Loading | The ordered step list (Fetching, Parsing, Mapping, Writing skill) | Cancel (a neutral button); the previous skill and map, shown greyscale (not faded) behind it |
| Error | The error title and its two recovery actions ("Paste spec text instead", "Try a sample") | The reason sentence, any help (a command to run), the previous skill and map below, shown greyscale as in Loading; the error title is at least the page title's size |
| Empty spec (zero operations) | The empty chart and its sentence "This spec has no paths..." | The warnings disclosure; the skill pane's "No operations, so no skill to write" |

### 2. What sits behind disclosure on first load

Each item is reachable in one step by a labelled control with a visible text label (never an icon alone). "Closed" means closed on first load at every width unless a width is named.

| Content | Revealed by | State exposed |
|---|---|---|
| Source selector (Auto / OpenAPI-Swagger / MCP) and **Open file** | "More options" button right of the URL field | `aria-expanded` on the button, `aria-controls` names the panel |
| Map legend | "Legend" summary under the map, closed at every width | native `<details>` |
| Filters and edge-kind toggles, and the note "Search and filters apply to the map and list; the skill always covers every operation" | "Filters" summary in the map toolbar row | native `<details>` |
| Skill slug and licence (and "Use deterministic text" once AI text exists) | "Options" summary in the skill pane head | native `<details>` |
| Spec metadata (version, servers, auth) | the detail panel / list row, never the first view (the title's one lede line names only the source kind and format version) | - |
| Install commands and **Copy install command** | "Install command" summary under Download .zip; not rendered when there is nothing to download (empty spec) | native `<details>` |
| Per-check audit rows and the CLI note | the "Audit passed: N of N checks" summary line | native `<details>` |
| Spec warnings | the "N warnings" pill beside the title | native `<details>` |
| "Read as text" summaries (relationships per row) | "N relationships" summary in the list view | native `<details>` |
| Built-in sample chips, once a user source is loaded | "Try a built-in sample" summary | native `<details>` |

Accessibility of disclosed content (all mandatory):
- The toggle is a native `<summary>` or a `<button>` with `aria-expanded`; it has a text name.
- The toggle's name says what is inside ("3 warnings", "More options"), so a closed disclosure is never a dead end for a screen-reader user.
- Opening moves nothing and steals no focus; Tab from the toggle reaches the first control inside.
- Nothing is removed for keyboard or screen-reader users: everything a pointer user can reach is reachable by Tab and named.
- When a disclosure closes or a status panel unmounts while it holds focus, focus moves to its toggle or to the field (never to `<body>`).
- Non-obvious keys are explained to assistive tech (e.g. `aria-describedby`: Enter loads, Shift+Enter new line) and listed in Keyboard shortcuts.

### 3. Spacing scale

One scale, as tokens in `src/design/tokens.css` (mirrored in `tokens.ts`, checked by `tokens.test.ts`):

| Token | Value | Use |
|---|---|---|
| `--space-1` | 4px | inside a control: glyph to text, chip padding, dense rows (tree, tables) |
| `--space-2` | 8px | between related controls in one group |
| `--space-3` | 16px | between groups in one block; page gutter on phones |
| `--space-4` | 24px | between blocks; page gutter on desktop |
| `--space-5` | 40px | around the focal point; between the two panes; between sections |
| `--space-6` | 64px | page-level breathing room (empty and error states; room for the phone's fixed bottom bar) |

Rules:
- Layout CSS (margin, padding, gap, inset, top/right/bottom/left) uses only `--space-*` tokens (or 0, or `em` for type-relative indents). `scripts/check-spacing.mjs` enforces this in `pnpm lint`; its allow-list holds the off-screen skip link and the 1 px overlap of joined tabs, each with its reason. Raw `px`/`rem` stay allowed outside those properties: hairlines (1-3 px borders), focus outlines, control min-heights/widths, SVG geometry.
- Phase 18 moved every view onto this scale and renamed it from `--calm-*` to `--space-*`; the old 4/8/12/16/24/32/48 values are gone (12 became 8 or 16, 32 and 48 became 40).
- Borders and frames are allowed only for: form fields, buttons and chips, the map frame, the detail panel edge, the skill preview's ruled sheet, tables' row rules, the single left rule of the loading and error states, the header's double rule, the dialog, and the one hairline on top of the phone's sticky Download bar (content scrolls under it). Everything else is grouped by space and alignment, not boxes or cards: the skill pane and the map pane have no card, and the survey grid paper is drawn inside the map only.
- Disclosure toggles look alike and are quiet: graphite underlined text with the native marker (`<summary>`), or a link-styled button with `aria-expanded` ("More options"); never the accent.

### 4. One accent

- `meridian` at accent weight (filled button, bold coloured text, thick stroke) marks **one** thing per view: first view = **Download .zip**; map = the focused node and its highlighted edges; loading = the active step's marker; error = none (the title is the focal point by size and position; the error glyph uses `brick` with a `!` shape and a visually hidden "Could not load:" prefix on the title).
- The header's **Generate skill** is neutral (ink border, bold text) at every width and in every state, and disabled while loading; on phones it is the fixed bottom bar of the Map and List tabs.
- Kickers (small uppercase labels such as "Agent skill · Prose: deterministic") and the skill's slug are `graphite`/`ink`, not `meridian`. Links stay `meridian` underlined text at normal weight (not accent weight).
- Map edges are quiet at rest (phase 20), so the map reads as the secondary pane beside the skill: edges are drawn at 0.45 opacity and feed bundles at 0.55; the large-spec cluster bands keep 0.85 (they are the overview when zoomed out). Fading never removes meaning: each edge keeps its line style (dashed feeds, solid sub-path, dotted shared schema), its end marker or midpoint diamond, and its text label at full text contrast. The focused or hovered node's edges come up to full opacity and 2.5 px (every edge hue is >= 3:1 on both surfaces, `contrast.test.ts`) while all other edges drop to 0.12.
- Method/kind hues (`fir`, `ochre`, `brick`, `plum`, `meridian` on GET) appear only as small badges with their text label, never as fills of large areas.
- Everything else uses neutrals: `ink` for text and primary borders, `graphite` for secondary text and quiet borders, `rule` for dividers, `paper`/`vellum` for surfaces.
- Chips and badges are quiet: neutral border (`graphite` for chips, `rule` for method badges), no fill except the selected chip (`ink` fill plus a check glyph), text at 0.75-0.93em; method badges keep their hue on the text label only.

### 5. Hierarchy

Title, then the focal point, then supporting text, then controls. The page title block is the `h1` (a sample adds a quiet "(sample)"), one lede line ("OpenAPI 3.1.0 · 22 operations in 5 clusters, 78 relationships.") and, when there are any, the warnings pill; nothing else (no kicker, no banner that repeats the "(sample)" note or the field's placeholder). In the header: wordmark, the URL field (the one prominent control), the theme toggle, then Generate skill. The header's DOM order equals its visual order at every width: no CSS `order`, no absolute positioning that reorders focus. At 1024 px and wider the header is one row (wordmark, URL field, Load, More options, theme, Generate skill); below 640 px it is three rows: wordmark; the URL field; Load, More options and the theme toggle; below 640 px Generate skill is the fixed bottom bar, last in DOM order. The theme toggle sits after the field on phones too, because one DOM order cannot put it after the field on desktop and before it on phones without reordering.

### Unchanged constraints

CVD-safe palette (PLAN 3.2), never colour alone (shape, glyph, line style, text or position as well), keyboard operable with the 2 px ink outline + marker halo, `prefers-reduced-motion` respected (no moving indicators at all in loading states), no decorative 3D. Dimming never lowers text below WCAG AA: "dimmed" content is shown in greyscale with a text note, not with opacity.

### Crowding checklist (verifier and a11y-reviewer, per view, at 1440 and 390 px)

A view is **crowded** (a design FAIL; the report names the view, the competing elements and the rule) when any of these is true:

1. More than one element at accent weight (`meridian` fill, bold `meridian` text, or thick `meridian` stroke) is visible, other than the ones section 4 names for that view.
2. Content that section 2 lists as behind disclosure is visible on first load (except where section 2 names a width or a later phase).
3. New layout CSS uses spacing outside the `--space-*` scale (grep the phase's CSS diff for raw `px`/`rem` in margin/padding/gap/inset/top/right/bottom/left).
4. A new frame, card or box border appears that section 3 does not allow.
5. The focal point named in section 1 is not the largest or highest-contrast element of its region, or is pushed below the fold at 1440x900 by secondary content.
6. A disclosure toggle has no visible text label, no `aria-expanded`/native state, or hides content that keyboard users cannot reach.
7. Two error, loading or empty messages are visible at once.

## Calm polish audit (phase 18)

Every view at 1440x900 and 390x844, before and after: `docs/screenshots/phase-18/before/<view>-<width>.png` and `after/<view>-<width>.png` (same names), produced by `pnpm check:browser -- --phase 18 --audit --viewports 1440x900,390x844 --label <before|after>` (`scripts/browser/audit.mjs`). The phase 18 flow (`scripts/browser/flows/phase-18-calm.mjs`) reaches every folded item below by keyboard only and checks its name and expanded state in Chrome's accessibility tree.

Applies to every view (the shared chrome): "Generate skill" made neutral (it was a second meridian fill beside Download .zip); the meridian kickers ("Surveyed from ...", "Agent skill · ...", the detail panel's) and the meridian slug made graphite/ink; the card frames with the double neatline around both panes, the grid paper behind the whole page, the double rules in the pane head and above the actions, the rule under the samples row and the audit's side rule removed (grouped by space instead; the grid stays inside the map); the sample banner removed (it repeated the h1's "(sample)" and the field's placeholder), the source kind and version moved from the kicker into the lede line; chips 32 px high at 0.93em; disclosure toggles quiet; spacing on the 4/8/16/24/40/64 scale.

| View (file name) | Focal point | What competed with it (before) | Action (after) |
|---|---|---|---|
| First view (`first-view`) | Skill pane: tree, SKILL.md preview, "Audit passed", Download .zip | Two meridian fills (Generate skill, Download .zip); meridian kickers and slug; banner with a meridian rule; framed cards; the open audit rows (8 lines); the install hint line and Copy install command at button weight; the open legend under the map; the filter note under the panes | Generate neutral; kickers graphite; banner removed; cards removed; audit rows folded behind the "Audit passed" line; install hint and Copy behind "Install command"; legend closed; filter note moved into Filters. Tree, preview and "Audit passed" fit above the fold at 1440 and above the sticky Download at 390 |
| Another file (`skill-file`) | The preview of `references/tasks.md` | At 390 the open audit rows pushed the preview off screen; the preview sat on the same paper as the page | Audit rows folded; the preview is the pane's one framed, ruled sheet (vellum) |
| Audit rows (`audit-expanded`) | The per-check rows, once asked for | The rule beside the audit; rows always open | Rows behind their summary (one step away), summary in ink with the tally underlined as the cue to open it |
| Options (`options`) | The slug and licence fields | The meridian "Options" link | Quiet graphite toggle |
| Download done (`download-done`) | Download .zip and its "Downloaded" note | Copy install command at the same weight; the install line | Install commands and Copy behind "Install command" |
| Map, focused node (`map-focus`) | The focused node and its edges | The meridian bottom bar at 390 (Generate skill); the card frame around the map's own frame; the framed toolbar box; the open legend | Generate neutral; one frame (the map's); toolbar buttons without the extra box; legend closed |
| Detail panel (`detail`) | Name, method + path, "In the skill" | Meridian kicker; a rule under every section heading | Kicker graphite; section headings separated by space |
| Search (`search`) | The matching nodes and the count | Bold "Search operations" label; meridian Filters link | Label graphite regular; Filters quiet |
| List with a filter (`list-filter`) | The operations tables | The boxed filter panel; hue-bordered method badges; meridian relationship summaries; the filter note | Filter panel unboxed (space); badges with a neutral border, hue on the text only, 0.75rem; relationship summaries quiet; the note inside Filters |
| Shortcut help (`shortcut-help`) | The dialog's tables | Nothing (modal) | Row padding on the scale only |
| Dark theme (`first-view-dark`) | As the first view | As the first view | As the first view |
| Loading (`loading`) | The step list | Framed greyscale cards below the steps | Cards removed: the greyscale skill and map below are plain |
| Error, blocked host (`error`) | Error title and its two recovery actions | Framed greyscale cards below; (not-a-spec errors) raw backticks in the reason | Cards removed; detection messages quote keys with "..." instead of backticks |
| Empty spec (`empty-spec`) | The empty chart and its sentence | A 680 px empty skill card; disabled Download and Copy install command; an install hint for a zip that cannot exist; the filter note | No card; no install disclosure or Copy when empty; the chart's sentence and the pane's "No operations" sentence at 1.15rem ink |
| Warnings (`warnings`) | The warnings list, once opened | As the first view | As the first view; the pill is unchanged (already quiet) |
| AI provenance (`ai-labels`) | Skill pane with "Prose: AI-drafted" | As the first view; the meridian kicker carried the provenance | Provenance kept as quiet graphite text (kicker and the map's credit line) |

Folded items reached by keyboard in the phase 18 flow (both widths): More options, Options, Audit passed (rows), Install command, Filters, Legend, a list row's "N relationships", N warnings, Try a built-in sample.

