# spec2skill redesign: plan

Goal: ship the approved "Route map" redesign (`docs/redesign/DESIGN.md`, boards in `docs/redesign/target/`) without losing any function: built-in samples offline, paste URL or spec text, open file, MCP via the Worker, CLI, lean AI, skill generation and audit, zip download, keyboard and screen-reader use, URL state.

## How we work (Sean's build process)

- The main agent (orchestrator) plans, creates branches, pushes, opens the PRs and links them as a native GitHub PR stack. It does not write feature code.
- Each phase: an **implementer** builds it on the checked-out branch and commits; a **verifier** checks it and returns PASS or FAIL with a list; the implementer fixes exactly that list; the verifier checks again. **At least two and at most four verify rounds.** Sub-agents run on Opus 5.5 at high effort.
- Every phase runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and once at the end the browser checks for the flows it touched, plus the acceptance checks of DESIGN.md section 8 that apply.
- One PR per phase, each based on the previous phase's branch: what / why, how verified (commands, results, verify rounds), before and after screenshots (1440 light, plus 390 where the phase changes phones), known gaps.
- Old browser flows (`scripts/browser/flows/phase-*.mjs`) that assert the old UI are updated in the phase that changes that UI; a flow that no longer has a subject is retired in that phase with a note in the PR. Unit tests move with the code they test; never skip or delete a test to get green without replacing what it checked.
- Decisions go to `docs/DECISIONS.md` (date, decision, alternatives, why), numbered after the last entry.
- Never merge, never deploy (merging to `main` deploys via Workers Builds; Sean merges).

## Phases

| # | Branch | Title |
|---|---|---|
| R1 | `claude/project-thread-8i40wr` | Tokens, type and logo |
| R2 | `claude/project-thread-8i40wr-r2-page` | Page shell: header, hero, sections, footer, grid |
| R3 | `claude/project-thread-8i40wr-r3-route-layout` | Route-map layout engine |
| R4 | `claude/project-thread-8i40wr-r4-map` | Route map: rendering, hover, operation card |
| R5 | `claude/project-thread-8i40wr-r5-skill` | Result head, skill browser, list view, phones |
| R6 | `claude/project-thread-8i40wr-r6-motion` | Motion and button states |
| R7 | `claude/project-thread-8i40wr-r7-polish` | Polish, acceptance suite, docs and media |

### R1: tokens, type and logo

Goal: the new visual foundation, applied to the existing UI without changing layout.

- Radix gray, indigo, amber tokens (DESIGN.md section 2) in `src/design/tokens.css` and `tokens.ts`; theme follows the system; remove the theme toggle, its storage and `[data-theme]` pinning (update `theme.ts` and its tests; keep `followSystem` only if still needed).
- Map every existing use of the old palette to the new roles (ink to `gray-12`, graphite to `gray-11`, rule to `gray-6`, paper to `gray-1`, vellum to `gray-2`, meridian to `indigo-9`/`indigo-11`; method hues collapse to text plus `amber-11` for destructive). Lines 0.5 px.
- IBM Plex Sans and Mono self-hosted; remove Bricolage. Type scale 12/14/20/48 tokens (existing views may only use 12/14/20 in this phase).
- New logo (DESIGN.md section 3): `Logo.tsx`, favicon, `docs/media/wordmark*.svg`; update `logo.test.ts`.
- `contrast.test.ts`, `cvd.test.ts`, `tokens.test.ts` rewritten for the new tokens.
- Add `scripts/browser/flows/redesign-checks.mjs` (or a helper used by flows) implementing DESIGN.md section 8 checks 1-4 and 7 so later phases reuse it; in R1 run the colour, line and middle-dot checks on the current views.

Acceptance: every colour in `src/**/*.css` is a Radix token; no Bricolage, no old palette names in `src`; lint, typecheck, tests, build, size budget pass; screenshots 1440 light and dark of the first view show the new colours, type and logo.

### R2: page shell

Goal: DESIGN.md section 4 items 1, 2, 4-7 and the grid; the result frame as a container (its contents arrive in R4/R5).

- Header (wordmark, How it works, Command line, GitHub). Hero grid with h1 48, lede, the source field with inset Generate and the Open file icon button, drag and drop, "Samples" segmented control. Remove More options (auto detection; record it) and the old header Generate skill (Generate in the field replaces it: with an empty field it rewrites the current skill as today).
- The result frame wrapper (radius 16, hangs 32 px), holding today's skill pane and map unchanged for now.
- Command line, How it works, Made by GeekPlux, footer (with Keyboard shortcuts).
- The 4 x 202 / 88 grid and its fluid and phone fallbacks.
- Grid acceptance check (DESIGN.md 8.6) for the parts that exist.

Acceptance: matches `V2Home` above the frame and below it; phone hero matches `V2Phone`; source input flows (paste URL, paste text, open file, errors) still pass after updating `phase-15-source-input.mjs`.

### R3: route-map layout engine

Goal: a pure, deterministic layout for DESIGN.md section 5 (columns by dependency, aligned main line, stacking with clearance, CRUD order, 8-row cap with "N more", horizontal overflow), producing positions for cards, rows, feed links, bundles, the workflow path and hover-only links.

- New module (e.g. `src/layout/route.ts`) with unit tests and snapshots for Tasks API, Petstore, Filesystem MCP and the synthetic large spec. The Tasks API snapshot must reproduce the target: columns Projects | Members, Labels | Tasks | Comments, the workflow straight.
- Keep the old layout until R4 switches the renderer (or delete it in R4).

Acceptance: tests and snapshots; a debug render (screenshot of an SVG dump of the three samples, committed under `docs/screenshots/redesign-r3/`) shows no card overlaps, no link crossing a card, and the straight main line.

### R4: route map rendering and interaction

Goal: the map of DESIGN.md section 5 inside the frame: cards, rows, links, workflow, legend, tools row (Map | List, search with `/`), hover/focus highlight, the operation card (hover preview; pinned on click/Enter with Close), keyboard navigation, search fade, URL state. Remove the detail panel, zoom controls, Filters disclosure and Legend disclosure; move or rewrite their tests.

Acceptance: matches `V2Home` (map part) and `V2Hover`; keyboard flow (`phase-7-keyboard.mjs`) and search flow (`phase-12-search-list.mjs`) updated and passing; axe clean on rest, hover and pinned card states.

### R5: result head, skill browser, list view, phones

Goal: the frame head (title, meta, tags, Install command copy, Download .zip), the workflow caption, the 202 / 492 / 202 skill browser with the audit always open and "Edit name and licence", the restyled list view, the loading/error/empty states inside the frame, and the phone single scroll (List default, file rows, audit row) replacing the Skill | Map | List tabs.

Acceptance: matches `V2Home` (frame head, caption, skill browser) and `V2Phone`; skill-first and calm flows updated; download still produces the audited zip.

### R6: motion and button states

Goal: DESIGN.md section 7: the load sequence, hover transitions, Generate stage labels with spinner, Downloaded / Copied states; all off under reduced motion.

Acceptance: a flow records the load sequence (2-3 frames) and checks that with `reducedMotion: 'reduce'` nothing animates; no motion outside the table.

### R7: polish, acceptance suite, docs and media

Goal: run DESIGN.md section 8 in full at 1440 and 390, light and dark; fix what fails; full before/after screenshot set (`docs/screenshots/redesign/`); retire any remaining dead flows; README hero, `docs/media/demo.gif`/`hero.png`, social preview and examples gallery recaptured; README "Accessibility" and "How it works" updated to the new encoding; `docs/DESIGN.md` rewritten from `docs/redesign/DESIGN.md`; PLAN.md section 3 replaced by a pointer.

Acceptance: every section 8 check passes; README renders with the new media; `pnpm test:docs` passes.
