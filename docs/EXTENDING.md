# Extending spec2skill

spec2skill is a pipeline of small, pure modules. Each stage takes plain data and returns plain data, so every extension point below is unit-testable without a browser:

```text
text or URL -> parseText() -> detect() -> normalise() -> ApiModel -> buildGraph() -> AtlasGraph -> generateSkill() -> FileTree -> auditTree()
                                                                                  \-> layout() -> the map
```

| Stage | Where | Main entry point |
| --- | --- | --- |
| Read JSON/YAML text | `src/parse/text.ts` | `parseText()` |
| Detect the source kind | `src/parse/detect.ts` | `detect()` |
| Normalise into one model | `src/model/normalise.ts`, `src/model/types.ts` | `normalise()` |
| Relationships and clusters | `src/graph/index.ts`, `src/graph/infer.ts`, `src/graph/cluster.ts`, `src/graph/crud.ts` | `buildGraph()` |
| Skill files | `src/skillgen/index.ts` | `generateSkill()` |
| Skill audit | `src/skillgen/assets/scripts/audit.mjs` | `auditTree()` |
| Zip download | `src/skillgen/zip.ts` | `zipSkill()` |
| CLI | `src/cli/main.ts`, `src/cli/load.ts` | `run()`, `loadModel()` |

Run `pnpm test` after every step; `pnpm test:docs` checks that the paths and function names in this file still exist.

## Adding a source parser

A new format (say, a future AsyncAPI reader) needs three things: detection, a normaliser and fixtures.

1. **Detect it by shape.** In `src/parse/detect.ts`, add a variant to the `Detection` union and a branch in `detect()`. Detection looks only at the document's keys and values, never at the URL or file name. Today an `asyncapi` key is reported as unsupported; that branch is where a new reader would start. Add cases to `src/parse/detect.test.ts`.
2. **Normalise it.** Write `src/model/<format>.ts` exporting a pure builder that returns the model body and an async `normalise<Format>()` that adds the spec hash, following `buildMcp()` and `normaliseMcp()` in `src/model/mcp.ts` or `buildOpenApi3()` and `normaliseOpenApi3()` in `src/model/openapi3.ts`. Map into the types in `src/model/types.ts` (`ApiModel`, `Operation`, `Param`, `SchemaRef`); use the helpers in `src/model/util.ts` (`cleanName()` and friends) for every string that comes from the spec, so hostile text stays plain. Record anything you drop as a warning instead of failing.
3. **Wire it up.** Add a `case` to `normalise()` in `src/model/normalise.ts`. The app, the CLI and the skill generator then work with no other change.
4. **Fixtures and tests.** Put small edge-case documents in `src/model/__fixtures__/` and test them in `src/model/<format>.test.ts`, as `src/model/mcp.test.ts` does for MCP. If you add a built-in sample, see [Adding a sample](#adding-a-sample).

## Adding a relationship rule

Edges are built by pure functions in `src/graph/infer.ts`: `subPathEdges()` (path hierarchy), `sharedSchemaEdges()` (shared `$ref` schemas, skipping hub schemas above `HUB_THRESHOLD`), `feedsEdges()` (outputs that fill inputs) and `bundleFeeds()` (one source feeding many operations of one cluster). `buildGraph()` in `src/graph/index.ts` combines and sorts them.

To add a rule:

1. Decide its **kind** (`EdgeKind` in `src/graph/types.ts`) and **confidence**: `exact` when the spec states the link (same field name and path parameter, a shared `$ref`), `inferred` when it is a naming guess. Inferred links are marked as such in the generated skill's references and ranked below exact ones when the skill picks its workflows.
2. Respect the **caps** that keep the map readable: at most `MAX_INCOMING_FEEDS` feeds edges into one operation, exact before inferred, and bundles above `BUNDLE_OVER`. A rule that fires on every operation of a large spec is noise; check it against `src/__fixtures__/synthetic.ts`.
3. Give every edge a short `label` (shown on the map, in the list view and in the skill) and an `evidence` string saying why the rule fired (kept in the graph and its snapshots, for review).
4. Add focused cases to `src/graph/rules.test.ts`, then review the golden snapshot changes in `src/graph/__snapshots__/` (`pnpm test -u` rewrites them; read the diff before committing). Layout snapshots in `src/layout/__snapshots__/` may move too.
5. New words for CRUD classification and MCP verbs live in `VERBS` in `src/graph/words.ts`, used by `classifyCrud()` in `src/graph/crud.ts`.

## Adding a skill section or reference file

`generateSkill()` in `src/skillgen/index.ts` assembles the skill from small writers, each a pure function of the `SkillContext`:

- `skillMd()` in `src/skillgen/skillmd.ts`: SKILL.md (frontmatter, the one idea, workflow, quality bar); keep its body under the audit's 200-line limit.
- `kitFiles()` in `src/skillgen/kit.ts`: `kit/operations.json` plus the tested kit modules copied from `src/skillgen/assets/kit/`.
- `referenceFiles()` in `src/skillgen/references.ts`: one page per cluster plus `auth.md`, `workflows.md` and `pagination-and-errors.md`.
- `exampleFiles()` in `src/skillgen/examples.ts`, `metaFiles()` in `src/skillgen/meta.ts` (README, scripts, CI) and `evalsJson()` in `src/skillgen/evals.ts`.

To add a reference page, return it from `referenceFiles()` (or a new writer spread into the file tree in `generateSkill()`) and link it from SKILL.md: the audit fails on a reference that SKILL.md does not link. Pass all spec text through the helpers in `src/skillgen/sanitize.ts`.

**Every new section needs an audit check.** `auditTree()` in `src/skillgen/assets/scripts/audit.mjs` is plain dependency-free ESM shipped inside every skill and also run by the web app and the CLI. Add a `check(id, label, problem)` line there, then a regression case in `src/skillgen/assets/scripts/audit-test.mjs` (copied into each skill as `<skill>/scripts/audit.test.mjs`) and in `src/skillgen/audit.test.mjs`. Update the skill snapshots in `src/skillgen/__snapshots__/` and the gallery with `pnpm gallery`.

## Adding a sample

1. Add the file to `samples/` (small, redistributable, nothing sensitive; nothing finance-related) and document its source, licence and changes in `samples/README.md`.
2. Register it in `SAMPLES` in `src/samples/index.ts` (`id`, `label`, `kind`, `load`); `sampleModel()` and `getSample()` pick it up, and so do the Samples control on the page and `spec2skill --sample <id>`.
3. Add it to `SAMPLES` in `scripts/build-gallery.mjs` with a one-line "what it shows", run `pnpm gallery`, and commit the new `examples/<slug>/`.
4. Add golden snapshots: the graph and layout tests iterate over the samples, so `pnpm test -u` writes `src/graph/__snapshots__/<id>.graph.json` and `src/layout/__snapshots__/<id>.layout.json`; review them.
5. Check the bundle budget with `pnpm build && pnpm check:size`: samples ship in the app.

## Using the generator from code

The CLI is the simplest way to use spec2skill outside the browser:

```sh
pnpm build:cli
node dist-cli/spec2skill.mjs ./openapi.yaml --out .claude/skills   # writes .claude/skills/<slug>/ and audits it
node dist-cli/spec2skill.mjs --sample filesystem --out /tmp/skills --quiet
```

`run()` in `src/cli/main.ts` takes the arguments plus injected `fetch`, working directory and output streams, so it is easy to test (`src/cli/cli.test.ts`). Exit codes: 0 ok, 1 audit failed, 2 usage error, 3 input, parse or fetch error.

As a module (TypeScript, inside this repo), the whole pipeline is four calls:

```ts
import { buildGraph } from './src/graph';
import { normalise } from './src/model/normalise';
import { parseText } from './src/parse/text';
import { auditTree, generateSkill, zipSkill } from './src/skillgen/skill';

const model = await normalise(parseText(specText).value);
const files = generateSkill(model, buildGraph(model), { slug: 'my-api', license: 'MIT' });
const audit = auditTree(files);            // { ok, checks: [{ id, label, ok, reason? }] }
const zip = zipSkill('my-api', files);     // Uint8Array, byte-for-byte reproducible
```

`scripts/write-skill.mjs` does the same through Vite's SSR loader without a build: `node scripts/write-skill.mjs <sample-id|spec-file> <outdir>`.
