# Good first issues

Small, scoped tasks for a first contribution. Each names the files to start from and what "done" looks like. Comment on the matching issue (or open one with the "Feature request" form) before you start, so two people do not pick the same task. [CONTRIBUTING.md](../CONTRIBUTING.md) explains setup and the checks; [EXTENDING.md](EXTENDING.md) explains the pipeline.

## 1. Collapse an expanded cluster again

On large specs (over 400 operations) clusters start as summary cards and Enter expands one, but nothing folds it back. Add a "Collapse" control on an expanded cluster's label and a key (for example `Shift+Enter` on a node) that re-adds the cluster to the collapsed set.
- Start from: `expand()` in `src/map/Map.tsx`, `startCollapsed()` in `src/layout/collapse.ts`, shortcuts in `src/map/ShortcutHelp.tsx`.
- Done when: the control is keyboard-operable with a text label, focus lands on the summary card, the shortcut dialog lists the key, and the phase 13 browser flow covers it.

## 2. Name the source on bundle labels

A bundled feeds edge reads `projectId -> 4 ops in Members`. When several bundles stack on one cluster you cannot tell which operation feeds each. Include the source operation in the label, or show it on focus.
- Start from: `bundleFeeds()` in `src/graph/infer.ts`, the bundle drawing in `src/map/Edge.tsx`.
- Done when: the label or its accessible name names the source, the graph snapshots in `src/graph/__snapshots__/` are updated and reviewed, and long labels still fit.

## 3. NFKC-normalise text before the AI injection checks

The AI output checks match patterns such as "ignore previous instructions" on the raw text, so full-width or compatibility characters can slip past. Normalise with `String.prototype.normalize('NFKC')` before matching, and widen the override patterns a little (for example `rm --recursive --force`).
- Start from: `checkOutput()` and `INJECTION` in `src/ai/contract.ts`; tests in `src/ai/contract.test.ts`.
- Done when: new tests with full-width and long-option variants are rejected and every existing test passes.

## 4. Swagger 2 `collectionFormat` in examples

Swagger 2 array parameters can be `csv`, `ssv`, `tsv`, `pipes` or `multi`. The generated curl examples and the kit's request builder should encode arrays the way the spec says.
- Start from: `upgradeSwagger2()` in `src/model/swagger2.ts` (where the parameter is read), `curlExample()` in `src/model/examples.ts`, and the edge-case fixture `src/model/__fixtures__/swagger2-edge.yaml`.
- Done when: a `multi` array becomes repeated query parameters and `pipes` joins with `|`, with tests.

## 5. A high-contrast theme

Add a third theme beside "Chart paper" and "Night survey" for `prefers-contrast: more` and as a toggle choice: pure ink on white, thicker edges and focus outlines.
- Start from: `src/design/tokens.css`, `src/design/tokens.ts`, `src/design/theme.ts`, the header toggle in `src/shell/Header.tsx`.
- Done when: `src/design/contrast.test.ts` checks every new pair at 7:1 for text, the CVD tests still pass, and the browser check has a screenshot.

## 6. Export the map as SVG

Let users save the current map as a standalone SVG file (for docs or a design review).
- Start from: the map's `<svg>` in `src/map/Map.tsx` and the toolbar in `src/map/Toolbar.tsx`; inline the computed colours from `src/design/tokens.css` so the file renders on its own.
- Done when: an "Export SVG" button with a text label downloads a file that opens correctly in a browser, keeps the edge line styles and labels, and contains no script.

## 7. More MCP verb prefixes

MCP tool names use many verbs (`query_`, `lookup_`, `insert_`, `patch_`, `drop_`...). Each recognised verb improves CRUD grouping and the inferred workflows.
- Start from: `VERB_TABLE` and `VERBS` in `src/graph/words.ts`, `classifyCrud()` in `src/graph/crud.ts`, tests in `src/graph/rules.test.ts`.
- Done when: the new verbs are classified with tests, and the filesystem sample's snapshots are unchanged or the changes are explained.

## 8. A resizable splitter between the skill pane and the map

The split is fixed at 40/60 on wide screens. Add a splitter the user can drag or move with the arrow keys (`role="separator"` with `aria-valuenow`), kept within the pane's minimum and maximum widths.
- Start from: `src/shell/Layout.tsx` and the pane widths in `src/app.css`.
- Done when: it works by pointer and keyboard, respects reduced motion, and the layout stays one focal point per view ([DESIGN.md](DESIGN.md)).

## 9. `--json` audit output for the CLI

Scripts and CI want the audit as data. Add `--json` to print `{ "dir", "files", "audit": { "ok", "checks" } }` instead of the text lines, with the same exit codes.
- Start from: `run()` and `USAGE` in `src/cli/main.ts`, `auditTree()` in `src/skillgen/assets/scripts/audit.mjs`, tests in `src/cli/cli.test.ts`.
- Done when: the output parses with `JSON.parse`, `--json --quiet` is rejected or defined, and `--help` documents it.

