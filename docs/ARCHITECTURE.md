# Architecture

spec2skill reads an API description (OpenAPI 3.x, Swagger 2.0 or an MCP `tools/list` result) and writes an agent skill for it: `SKILL.md`, a tested kit, references, worked examples, an audit, evals and a CI workflow. It also draws the API as a route map, so a reader can check what the skill teaches. This page is for engineers reading the code. [EXTENDING.md](EXTENDING.md) shows how to add a source format, a rule, a skill section or a sample, and [DESIGN.md](DESIGN.md) specifies the interface.

## Modules and data flow

Everything from parsing to the zip runs in the browser, in pure TypeScript modules with no React and no DOM. The web app, the CLI and the gallery script call the same modules, so they write byte-identical skills for the same input.

```text
 input: a URL, pasted text, a file or a built-in sample
   |  src/source/   loadSource(): OpenAPI URLs are fetched directly, then through the Worker
   |                if that fails; MCP URLs always go through the Worker
   v
 src/parse/     detect() by shape, parseText() for JSON or YAML, local $ref resolution
   v
 src/model/     normalise() -> ApiModel: operations, inputs, outputs, auth, warnings, a SHA-256 hash
   v
 src/graph/     buildGraph() -> AtlasGraph: clusters, CRUD roles, edges   <- src/ai/ (optional names)
   |
   +-> src/skillgen/  generateSkill() -> FileTree -> auditTree(), zipSkill()
   |                  shown by src/skillpane/, written to disk by src/cli/
   +-> src/layout/    routeLayout() -> plain JSON geometry -> src/map/ (route map), src/list/ (list view)

 worker/   one Cloudflare Worker: dist/ as static assets, plus /api/fetch-spec (spec proxy),
           /api/mcp/tools (MCP tools/list), /api/ai/describe (optional AI) and /api/health
```

Around the pipeline, `src/App.tsx` owns the state and keeps it in the URL (`src/state/`). `src/shell/`, `src/source/`, `src/result/` and `src/skillpane/` make up the page, and `src/design/` holds the tokens, logo, icons and motion timings. `scripts/` holds the checks, the gallery builder and the media capture. `samples/` has the three built-in specs and `examples/` the skills generated from them.

The skill generator, the audit and fflate load as their own chunk, `src/skillgen/skill.ts`, preloaded with the first page (D22). The audit is one plain ESM file, `src/skillgen/assets/scripts/audit.mjs`: every generated skill ships it, the app runs it in memory and the CLI runs it on disk.

The Worker does only what a browser cannot: cross-origin fetches, a server-to-server MCP connection and Workers AI. Every fetch passes `checkUrl()` in `worker/ssrf.ts` and the size, time and redirect caps in `worker/limits.ts`; the upstream request is built from scratch, so no client header or cookie is forwarded. The MCP client can only list tools, never call one. The CLI imports the same MCP client and limits, and fetches from the user's own machine.

## Relationship rules

`buildGraph()` in `src/graph/index.ts` applies six deterministic rules. Comments in `src/graph/` cite them by number.

1. **Clusters**: an operation's first tag; else its first path segment that is not a parameter or a version (`v1`, `api`, `rest`); else the most common noun in the operation or tool name after its verb. Nouns are singular, so `files` and `file` merge. With more than 12 clusters, untagged clusters of one operation merge into Other.
2. **CRUD roles**: the HTTP method and path shape (a GET on an item is a read; a GET that returns an array or a page is a list); for MCP tools the verb prefix (`VERBS` in `src/graph/words.ts`), with `readOnlyHint` making a tool a list or a read.
3. **Sub-path**: `/a/{x}` hangs off its nearest existing ancestor path, through that path's GET.
4. **Shared schema**: operations that use the same named request or response schema. A schema on more than 8 operations is a hub badge, not an edge.
5. **Feeds**: an output field that can fill another operation's input. It is exact when the names match (`projectId` to `projectId`) or a record's own `id` meets an input that names its entity (`memberId`), and inferred when only the naming suggests it. At most 6 feeds come into one operation, exact first.
6. **Noise trims and bundles**: a bare foreign key never feeds a create, update or delete; a tool that lists roots feeds only directory and search tools; a source feeding the same input into more than 3 operations of another cluster becomes one bundle.

The strongest chain of feeds (`topChains()` in `src/skillgen/graph-chains.ts`) becomes the skill's opening idea, its worked examples and the map's workflow line.

## What shaped it

- **Deterministic first.** Parsing, relationships, layout, the skill and the audit are code, and the same input gives the same bytes; golden snapshots hold that. AI only names clusters and drafts a few sentences of prose for a spec the user loads: one call per spec (D23), checked against the spec, cached in KV and capped per day (D83). Samples and the CLI never call it.
- **Few dependencies.** At runtime: React, js-yaml (D4), fflate (D5) and two self-hosted font packages. There is no state or router library (D13), no graph layout library (D6, D7) and no Markdown renderer (D12).
- **Spec text is untrusted.** The UI renders it as React text, never as HTML (D12). Generated files take it through `src/skillgen/sanitize.ts`, which strips markup and control characters and caps lengths. The zip writer and `writeTree()` in `src/cli/fs.ts` re-check every path.
- **Offline and keyless.** The samples are bundled (`src/samples/index.ts`), so the first view, the skill and the zip need no network and no key.
- **Accessibility is tested.** Unit tests guard tokens, contrast, colour-vision simulation, copy and motion (`src/design/*.test.ts`). The browser check runs axe and the checks of [DESIGN.md](DESIGN.md) section 8.

## Extending it

[EXTENDING.md](EXTENDING.md) walks through each extension point: a source format (detection, a normaliser, fixtures), a relationship rule (kind, confidence, caps, snapshots), a skill section (a writer plus an audit check) and a sample. Keep each stage a pure function of plain data, and pass spec text through the helpers in `src/model/util.ts` and `src/skillgen/sanitize.ts`. Interface changes follow DESIGN.md and must keep its section 8 checks passing.

## Tests

- Unit tests sit next to the code (`*.test.ts`, `*.test.mjs`) in `src/`, `worker/` and `scripts/`. `pnpm test` runs them in Vitest, one file at a time (`vitest.config.ts`). Worker handlers take injected `fetch` and bindings, so they run in Node too (D3).
- Golden snapshots: `src/graph/__snapshots__/` (graphs), `src/layout/__snapshots__/` (route layouts) and `src/skillgen/__snapshots__/` (every generated file of each sample). Edge-case inputs live in `__fixtures__/` folders; `src/__fixtures__/synthetic.ts` builds a 1000-operation spec for the scale tests.
- `src/skillgen/audit.test.mjs` writes each sample's skill to a temporary folder, then runs its audit and its own `node --test` suite. `pnpm gallery --check` fails when `examples/` drifts from the generator.
- `scripts/*.test.mjs` cover the docs link check, the deploy config, the size budgets, the spacing check and the gallery; `scripts/browser/redesign-checks.test.mjs` covers the browser-check helpers.
- `pnpm check:browser` drives the built app in the system Chrome (`scripts/browser/flows/`), with axe and colour-vision simulation; `scripts/browser/flows/redesign-acceptance.mjs` runs every check of DESIGN.md section 8.

## Decisions

Comments in the code and in DESIGN.md cite these by ID. IDs that are missing recorded only the build process or were superseded.

### Platform and build

- **D1** One Worker serves the static app and `/api/*` (`run_worker_first`): one deployable instead of Pages plus Functions.
- **D2** Vite builds `dist/` and wrangler bundles `worker/` separately. The Cloudflare Vite plugin would run workerd inside the dev server and make `pnpm dev` much heavier.
- **D3** Worker handlers take `(request, env, deps)` and are tested in plain Vitest with injected fakes rather than in the Workers test pool, which is lighter; `pnpm smoke:worker` covers the real runtime.
- **D8** Browser checks use playwright-core with the system Chrome (`CHROME_PATH`), inject axe-core and simulate colour-vision deficiency with SVG `feColorMatrix` filters, so nothing downloads a browser.
- **D9** The repo needs Node 22 (current Vitest and wrangler require it), pinned through `use-node-version` in `.npmrc`. Generated skills are plain ESM for Node 20 and later.
- **D13** No state or router library: React state and the URL (`src/state/url.ts`) are enough, and the dependency list stays short.
- **D16** Node scripts (`scripts/write-skill.mjs`, the gallery and debug scripts) load the TypeScript sources through Vite's SSR loader, so `?raw` imports work without a build or `tsx`.
- **D24** The CLI is a Vite SSR build (`ssr.noExternal`) into one dependency-free file, `dist-cli/spec2skill.mjs`; unlike `tsc`, it honours the `?raw` template imports.

### Parsing and loading

- **D4** YAML is read with js-yaml's safe CORE_SCHEMA: a small library, and it builds plain data only.
- **D10** OpenAPI URLs are fetched from the browser first and through the Worker only after a CORS or network failure; MCP always goes through the Worker. That saves Worker calls, and `pnpm dev` works without the Worker.
- **D11** No MCP auth: a 401 explains how to paste a recorded `tools/list` instead, so user tokens never pass through the Worker.
- **D12** Spec text is shown as plain text only, never as Markdown or HTML: no XSS surface and no sanitiser dependency.
- **D18** External `$ref`s are not followed. They produce a warning and an unresolved node, which keeps parsing offline and bounded; resolving them is on the roadmap.
- **D37** There is no source-kind selector. A URL that is not a spec (an HTML page, or a GET answered 400, 404, 405, 406 or 5xx) is tried as an MCP server, and the error that fits is shown (`fallbackError` in `src/source/fetchSource.ts`, shared with the CLI). One extra proxy call saves the user a decision.

### Skill generator

- **D5** The zip is built with fflate: about 8 KB gzip, no dependencies, and fixed timestamps make the bytes reproducible.
- **D15** Generated skills default to the MIT licence, editable in the app, because the skill format needs a `license` field.
- **D21** The generated skill is part of the first view, not behind a button: generation is deterministic and fast enough to run on every load.
- **D22** The generator, the shared audit and fflate are one chunk, preloaded with the first load and under its own 40 KB gzip budget: the map paints first, and the skill still works offline.
- **D58** Generated skills use no middle dot either; `src/design/copy.test.ts` scans the generator and its snapshots.
- **D63** The Install command must work pasted into an empty project, so a skill's `audit.mjs` resolves its own folder before it runs the examples.

### Worker, AI and privacy

- **D19** Rate limits use the Workers rate limiting binding, so a request costs no KV write.
- **D23** At most one batched AI call per user-loaded spec, made after the deterministic skill and map are on screen; its answer swaps in names and prose. Never for samples or the CLI.
- **D83** Cost caps for the public Worker: `DAILY_AI_CAP` model calls per UTC day for the whole site (`takeBudget()` in `worker/budget.ts`, counted in KV; without KV the model is never called) and one shared `PROXY_LIMITER` for both proxies. Per-IP limits alone grow with the number of IPs.
- **D84** Analytics run only on the live site: one page view per load with the path alone, never a spec or MCP URL (`src/analytics.ts`). Self-hosted copies load none.

### Look and tokens (DESIGN.md section 2)

- **D30** Radix Colors 3.0 gray, indigo and amber are copied into `src/design/tokens.css` and `tokens.ts` (36 `light-dark()` values) rather than installed: the package would add six CSS files and a theming scheme the app does not use.
- **D31** The theme follows the system in CSS alone (`color-scheme: light dark` and `light-dark()` tokens). Amended by D82.
- **D32** IBM Plex Sans and Mono (400, 500, 600, Latin) are self-hosted woff2 with hand-written `@font-face` rules: they work offline and fit the size budget.
- **D33** Lines are 0.5 px box-shadow rings and rules, never CSS borders, because Chrome draws a 0.5 px border 1 px wide.
- **D34** Indigo is the one accent. Destructive method text uses `--destructive`: amber-12 in light, because amber-11 on gray-1 is 4.49:1, just under AA, and amber-11 in dark. Map links are gray-9 and keep their line style, marker and label.
- **D38** Spacing tokens are named by value (`--space-16` is 16 px), so a new step fits between two others; `scripts/check-spacing.mjs` rejects raw lengths.
- **D39** One grid: a 1072 px column of four 202 px tracks and 88 px gaps, written as `minmax(0, 1fr)` and `min(88px, 7.75vw)` so the same rule is exact from 1136 px and fluid below; one column under 640 px.
- **D51** `--shadow-float` is the one shadow (the operation card's), and fades use `--motion-map` (250 ms, 0 under reduced motion). Only AI-drafted names carry a credit line.
- **D79** Identifiers wrap only at word boundaries: `<Breakable>` (`src/design/breaks.tsx`) inserts `<wbr>`, which adds nothing to copied text or accessible names.
- **D82** The header's theme button pins light or dark: `data-theme` on `<html>` changes only `color-scheme`, the choice is stored under `spec2skill:theme`, and an inline script in `index.html` applies it before the first paint. Without a stored choice the theme follows the system.

### Route map and list (DESIGN.md sections 5 and 6)

- **D6, D7** The layout is custom, deterministic and drawn in SVG, not dagre, elkjs or a force layout: no dependency, stable snapshots and real focusable rows. Force layouts differ from run to run.
- **D41** The method column shows the HTTP method, or `read` or `write` for MCP tools (from `readOnlyHint`, else the tool's name); "delete" would misstate tools that overwrite. Destructive rows also get a mark (D53) and say "destructive" in their names.
- **D42** Columns: cycles in the resource feed graph are broken with the greedy feedback-arc order of Eades, Lin and Smyth, after dropping pairs that run against the strongest workflow, and each resource sits at its longest-path depth, so the workflow reads left to right.
- **D43** Resources with no feeds take the shortest of the first four columns, biggest first, instead of piling up in column 0.
- **D44** The workflow line stays straight, other cards stack above and below it with 32 px clearance, and links curve only in the 88 px gaps, crossing a column through the nearest free corridor 6 px apart, so no link crosses a card.
- **D45** Hover draws feed links only. Sub-path and shared-schema relations are listed in the operation card and the list view, since a fourth line style would need a fourth legend entry.
- **D46** The operation card is an `aria-hidden` preview on hover or focus and a non-modal dialog when pinned, after the map in the Tab order (a bottom sheet on phones). A speaking preview would repeat every row's name, and a modal would trap focus away from the map.
- **D47** Lit and faded rows differ in weight as well as colour (gray-12 at 600 or 500 against gray-11 at 400), never in opacity: at 0.38 opacity live buttons fall to about 2.3:1.
- **D48** Map rows are real buttons with a roving tabindex: one Tab stop, and arrows move to the nearest row that way. Each name starts with the visible text, method then id, for speech input (WCAG 2.5.3).
- **D50** A map with more than four columns, or wider than the frame, scrolls sideways in a native, focusable `role="region"` sized to everything hover can draw: keyboard, touch and assistive tech work as they are, and no hover link is clipped.
- **D53** Every destructive row has a 12 px amber warning triangle at its right end, `aria-hidden` because the name says "destructive". It gives light mode an amber cue the method text cannot carry, without widening the method column.
- **D54** Three or more feed links between two cards with a column or more between them rest as one card-to-card line, because 6 px apart they read as one band anyway. Hover still draws each link.
- **D59** The list view groups resources in the map's column order, and each row keeps its relationships as visually hidden text, so the list stays the map's full text alternative.
- **D60** Only the pinned card scrolls, capped at the map's bottom plus 64 px so it never covers the skill browser. A scrolling hover preview would be a focusable scroller that vanishes on blur.
- **D70** A hover preview is never cut: one taller than its room rises beside its row, and one taller than the map and caption together keeps its height and passes the limit. Amended by D80.
- **D76** Every hover preview that would end more than 64 px below the map rises beside its row until it ends there, so it never covers the skill browser.
- **D80** The hover preview lists at most four inputs and four operations per related group, then "and N more"; the pinned card lists them all. That way every sample's preview fits.

### Page, states and motion (DESIGN.md sections 4 and 7)

- **D40** The samples are native radio buttons, which give one Tab stop, arrow keys and an unselected state for a user's own source for free. In-page links move focus without touching the URL, whose hash is `#op=`.
- **D55** One scroll at every width: there is no Skill tab, `?view=` is `map` or `list`, and phones open on the list.
- **D56** The result's head holds the title, a meta line (source kind and version, counts), its tags, Install command and Download .zip; if the clipboard refuses, the commands appear to select by hand.
- **D57** The skill browser words each audit check as what it verifies, and draws line numbers as CSS generated content, so a copied preview is the file alone.
- **D61** Loading, error and empty states replace the frame's contents one at a time; an empty spec never shows the previous spec's skill.
- **D64** Buttons have no colour transition; list rows bleed 8 px each side inside a list that never scrolls sideways; a wrapped command line hangs 2ch.
- **D65** Generate names the running step: Fetching or Reading, then Parsing, Relating, Writing and Auditing. Each label is painted before its step's synchronous work and stays at least 100 ms (`stageTimer()` in `src/source/stages.ts`), but nothing waits for a label, and the button keeps one width so the field holds still.
- **D66** The load sequence plays once for each new result while `data-enter` is set, and nothing mounted later replays it. One CSS animation per card and one for the links keep it cheap on large specs.
- **D67** No motion beyond the table in DESIGN.md section 7. Every animation is declared under `prefers-reduced-motion: no-preference` only, and `src/design/motion.test.ts` fails on any other transition, animation or scripted motion.

### Checks (DESIGN.md section 8)

- **D69** Section 8 runs in full in one flow, `scripts/browser/flows/redesign-acceptance.mjs`, so each check runs once per state.
- **D75** A Made by row stacks its name, line and URL when its list is under 490 px wide (a container query), so no URL is cut or printed over its line; the suite checks for overlapping text at six widths.
- **D77** The colour check also reads `::before`, `::after` and `::backdrop`, and fails any partial opacity at rest, because a faded colour is not a Radix step. That is why the shortcuts dialog's backdrop is opaque.
