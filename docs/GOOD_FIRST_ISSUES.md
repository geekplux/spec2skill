# Good first issues

Small, scoped tasks for a first contribution. Each names the files to start from and what "done" looks like. Comment on the matching issue (or open one with the "Feature request" form) before you start, so two people do not pick the same task. [CONTRIBUTING.md](../CONTRIBUTING.md) explains setup and the checks; [EXTENDING.md](EXTENDING.md) explains the pipeline.

## 1. Keep expanded cards in the URL

On large specs a resource card shows 8 operations and a "N more" row that opens it in place. A shared link forgets which cards were open. Keep them in the URL (for example `?open=r1s,r7s`) so a link reopens them, and back/forward restore them.
- Start from: `toggle()` and the `expanded` state in `src/map/RouteMap.tsx`, `readUrl()` and `writeUrl()` in `src/state/url.ts` (tests in `src/state/url.test.ts`).
- Done when: unknown card ids are dropped from the URL, the URL tests cover it, and a browser flow opens a link with two cards expanded.

## 2. Say what a bundle stands for

One source feeding the same input into many operations of a resource is drawn as one curve to the card's head (`projectId -> 4 ops in Members` in the graph). Nothing on the map says which input it fills. Name the bundle's input and its operations in the source's operation card (and in its row's accessible name).
- Start from: `bundleFeeds()` in `src/graph/infer.ts`, `restLinks()` in `src/layout/route.ts` and the operation card in `src/map/OpCard.tsx`.
- Done when: the card lists the bundle (input and count), `src/map/OpCard.test.ts` covers it, and long lists still fit the 300 px card.

## 3. NFKC-normalise text before the AI injection checks

The AI output checks match patterns such as "ignore previous instructions" on the raw text, so full-width or compatibility characters can slip past. Normalise with `String.prototype.normalize('NFKC')` before matching, and widen the override patterns a little (for example `rm --recursive --force`).
- Start from: `checkOutput()` and `INJECTION` in `src/ai/contract.ts`; tests in `src/ai/contract.test.ts`.
- Done when: new tests with full-width and long-option variants are rejected and every existing test passes.

## 4. Swagger 2 `collectionFormat` in examples

Swagger 2 array parameters can be `csv`, `ssv`, `tsv`, `pipes` or `multi`. The generated curl examples and the kit's request builder should encode arrays the way the spec says.
- Start from: `upgradeSwagger2()` in `src/model/swagger2.ts` (where the parameter is read), `curlExample()` in `src/model/examples.ts`, and the edge-case fixture `src/model/__fixtures__/swagger2-edge.yaml`.
- Done when: a `multi` array becomes repeated query parameters and `pipes` joins with `|`, with tests.

## 5. A high-contrast theme

Follow `prefers-contrast: more` on top of the light and dark themes (which follow the system): ink text where the UI uses muted text, stronger rules and focus outlines, still from the Radix gray, indigo and amber steps.
- Start from: `src/design/tokens.css`, `src/design/tokens.ts`.
- Done when: `src/design/contrast.test.ts` checks every new pair at 7:1 for text, the CVD tests still pass, and the browser check has a screenshot.

## 6. Export the map as SVG

Let users save the current map as a standalone SVG file (for docs or a design review).
- Start from: `routeLayout()` in `src/layout/route.ts` (the debug render `scripts/debug/route-dump.mjs` already writes one SVG from it) and the tools row in `src/App.tsx`; take the colours from `src/design/tokens.css` so the file renders on its own.
- Done when: an "Export SVG" button with a text label downloads a file that opens correctly in a browser, keeps the line styles of the legend, and contains no script.

## 7. More MCP verb prefixes

MCP tool names use many verbs (`query_`, `lookup_`, `insert_`, `patch_`, `drop_`...). Each recognised verb improves CRUD grouping and the inferred workflows.
- Start from: `VERB_TABLE` and `VERBS` in `src/graph/words.ts`, `classifyCrud()` in `src/graph/crud.ts`, tests in `src/graph/rules.test.ts`.
- Done when: the new verbs are classified with tests, and the filesystem sample's snapshots are unchanged or the changes are explained.

## 8. Keep the open skill file in the URL

The skill browser opens SKILL.md on every load, so a link cannot point at `references/tasks.md`. Keep the open file in the URL (for example `?file=references/tasks.md`) so a shared link opens it, and back/forward restore it.
- Start from: `readUrl()` and `writeUrl()` in `src/state/url.ts` (tests in `src/state/url.test.ts`) and the selected file in `src/skillpane/SkillBrowser.tsx`.
- Done when: a path the skill does not have falls back to SKILL.md and leaves the URL, the URL tests cover it, and the design checks of [DESIGN.md](DESIGN.md) section 8 still pass.

## 9. `--json` audit output for the CLI

Scripts and CI want the audit as data. Add `--json` to print `{ "dir", "files", "audit": { "ok", "checks" } }` instead of the text lines, with the same exit codes.
- Start from: `run()` and `USAGE` in `src/cli/main.ts`, `auditTree()` in `src/skillgen/assets/scripts/audit.mjs`, tests in `src/cli/cli.test.ts`.
- Done when: the output parses with `JSON.parse`, `--json --quiet` is rejected or defined, and `--help` documents it.

