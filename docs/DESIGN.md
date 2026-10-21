# spec2skill design rules

The identity ("Survey chart": type, palette, logo, motion) is in [PLAN.md section 3](PLAN.md#3-design-direction-survey-chart). This file holds the rules reviewers apply to screenshots and the DOM. Every rule below is checkable from a screenshot at 1440 px and 390 px, or from the DOM.

## Calm layout

Binding from phase 15 on (Sean's direction of 2026-10-21, PLAN.md 3.7). The product's focal point is **the generated skill** (file tree, SKILL.md preview, the "Audit passed" line). The map sits beside it as the quiet way to check it. Views built in phases 5-14 are brought into line in phase 18; every view added or changed from phase 15 on must pass the checklist at the end of this section.

### 1. One focal point per view

Each view has exactly one focal point. Everything else is visibly secondary: smaller, in a neutral colour, or one step away behind a disclosure.

| View | The one focal point | Visibly secondary |
|---|---|---|
| First view (desktop: skill pane + map; phones: Skill tab) | The skill pane: file tree, SKILL.md preview, the "Audit passed" summary line, and **Download .zip** | The map pane (beside it, no accent fill), the title block, the sample chips |
| Map (pane or tab) | The focused/selected node and its edges (the only accent-weight strokes) | Toolbar, search, cluster labels, other nodes and edges at normal weight |
| List view | The operations table (cluster captions + rows) | Search, filters, the summary line above the table |
| Detail panel | The operation's name, method + path, and its "In the skill" link | Inputs, outputs, auth, related operations, Copy example |
| Loading | The ordered step list (Fetching, Parsing, Mapping, Writing skill) | Cancel (a neutral button); the previous skill and map, shown greyscale (not faded) behind it |
| Error | The error title and its two recovery actions ("Paste spec text instead", "Try a sample") | The reason sentence, any help (a command to run), the previous skill and map below |
| Empty spec (zero operations) | The empty chart and its sentence "This spec has no paths..." | The warnings disclosure; the skill pane's "No operations, so no skill to write" |

### 2. What sits behind disclosure on first load

Each item is reachable in one step by a labelled control with a visible text label (never an icon alone). "Closed" means closed on first load at every width unless a width is named.

| Content | Revealed by | State exposed |
|---|---|---|
| Source selector (Auto / OpenAPI-Swagger / MCP) and **Open file** | "More options" button right of the URL field | `aria-expanded` on the button, `aria-controls` names the panel |
| Map legend | "Legend" summary under the map (open at >= 640 px until phase 18 closes it) | native `<details>` |
| Filters and edge-kind toggles | "Filters" summary in the map toolbar row | native `<details>` |
| Skill slug and licence | "Options" summary in the skill pane head | native `<details>` |
| Spec metadata (version, servers, auth) | the detail panel / list row, never the first view | - |
| Copy-install hint | "Copy install command" button (the hint line moves behind it in phase 18) | - |
| Per-check audit rows | the "Audit passed: N of N checks" summary line (open in v1; phase 18 closes it) | native `<details>` |
| Spec warnings | the "N warnings" pill beside the title | native `<details>` |
| "Read as text" summaries (relationships per row) | "N relationships" summary in the list view | native `<details>` |
| Built-in sample chips, once a user source is loaded | "Try a built-in sample" summary | native `<details>` |

Accessibility of disclosed content (all mandatory):
- The toggle is a native `<summary>` or a `<button>` with `aria-expanded`; it has a text name.
- The toggle's name says what is inside ("3 warnings", "More options"), so a closed disclosure is never a dead end for a screen-reader user.
- Opening moves nothing and steals no focus; Tab from the toggle reaches the first control inside.
- Nothing is removed for keyboard or screen-reader users: everything a pointer user can reach is reachable by Tab and named.

### 3. Spacing scale

One scale, as tokens in `src/design/tokens.css` (mirrored in `tokens.ts`, checked by `tokens.test.ts`):

| Token | Value | Use |
|---|---|---|
| `--calm-1` | 4px | inside a control: glyph to text, chip padding |
| `--calm-2` | 8px | between related controls in one group |
| `--calm-3` | 16px | between groups in one block; panel padding on phones |
| `--calm-4` | 24px | between blocks; panel padding on desktop; page gutter |
| `--calm-5` | 40px | around the focal point; between sections |
| `--calm-6` | 64px | page-level breathing room (empty and error states) |

Rules:
- New layout CSS (margin, padding, gap, inset, top/right/bottom/left) uses only `--calm-*` tokens. Raw `px`/`rem` values are allowed only for hairlines (1-3 px borders), focus outlines, control min-heights/widths and SVG geometry.
- The tokens are named `--calm-*` because the older `--space-*` family (4/8/12/16/24/32/48) is still used by the views built in phases 5-14. Phase 18 moves those views to the calm scale, then renames `--calm-*` to `--space-*` and deletes the old values.
- Borders and frames are allowed only for: form fields, buttons and chips, the map frame, the detail panel edge, the skill preview's ruled sheet, tables' row rules, and the single left rule of the loading and error states. Everything else is grouped by space and alignment, not boxes or cards.

### 4. One accent

- `meridian` at accent weight (filled button, bold coloured text, thick stroke) marks **one** thing per view: first view = **Download .zip** (phase 18 makes "Generate skill" neutral when the pane is on screen); map = the focused node and its highlighted edges; loading = the active step's marker; error = none (the title is the focal point by size and position; the error glyph uses `brick` with a `!` shape and the word "Couldn't").
- Method/kind hues (`fir`, `ochre`, `brick`, `plum`, `meridian` on GET) appear only as small badges with their text label, never as fills of large areas.
- Everything else uses neutrals: `ink` for text and primary borders, `graphite` for secondary text and quiet borders, `rule` for dividers, `paper`/`vellum` for surfaces.
- Chips and badges are quiet: neutral border (`graphite`), no fill except the selected chip (`ink` fill plus a check glyph), text at 0.8-1em.

### 5. Hierarchy

Title, then the focal point, then supporting text, then controls. In the header: wordmark, the URL field (the one prominent control), the theme toggle, then Generate skill. The header's DOM order equals its visual order at every width: no CSS `order`, no absolute positioning that reorders focus. At 1024 px and wider the header is one row (wordmark, URL field, Load, More options, theme, Generate skill); below 640 px it is three rows: wordmark; the URL field; Load, More options and the theme toggle. The theme toggle sits after the field on phones too, because one DOM order cannot put it after the field on desktop and before it on phones without reordering.

### Unchanged constraints

CVD-safe palette (PLAN 3.2), never colour alone (shape, glyph, line style, text or position as well), keyboard operable with the 2 px ink outline + marker halo, `prefers-reduced-motion` respected (no moving indicators at all in loading states), no decorative 3D. Dimming never lowers text below WCAG AA: "dimmed" content is shown in greyscale with a text note, not with opacity.

### Crowding checklist (verifier and a11y-reviewer, per view, at 1440 and 390 px)

A view is **crowded** (a design FAIL; the report names the view, the competing elements and the rule) when any of these is true:

1. More than one element at accent weight (`meridian` fill, bold `meridian` text, or thick `meridian` stroke) is visible, other than the ones section 4 names for that view.
2. Content that section 2 lists as behind disclosure is visible on first load (except where section 2 names a width or a later phase).
3. New layout CSS uses spacing outside the `--calm-*` scale (grep the phase's CSS diff for raw `px`/`rem` in margin/padding/gap/inset/top/right/bottom/left).
4. A new frame, card or box border appears that section 3 does not allow.
5. The focal point named in section 1 is not the largest or highest-contrast element of its region, or is pushed below the fold at 1440x900 by secondary content.
6. A disclosure toggle has no visible text label, no `aria-expanded`/native state, or hides content that keyboard users cannot reach.
7. Two error, loading or empty messages are visible at once.
