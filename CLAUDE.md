# CLAUDE.md: operating manual for the main agent (tool-atlas)

You are the **main agent** for `tool-atlas` (repo `geekplux/tool-atlas`, private). You are the product manager and orchestrator. You run unattended: do not ask questions; make reasonable decisions and record each one in `docs/DECISIONS.md` (date, decision, alternatives, why).

## Product

Paste an MCP server URL or an OpenAPI spec URL (or pick a sample) and get an interactive atlas of everything it can do: every tool or endpoint as a node, grouped by resource, linked by shared schemas and by which outputs can feed which inputs. One click then generates an anatomy-grade agent skill that teaches a coding agent how to use that API well.

Product specifics:
- First view: 2-3 built-in samples (e.g. a public OpenAPI spec such as Petstore, plus a recorded MCP `tools/list` response) that render instantly and offline. Paste-a-URL is the only other input.
- Normalise both sources into one typed model: operations/tools, inputs/outputs schemas, auth, tags/resources.
- Relationships, deterministic first: shared `$ref` schemas, path hierarchy (`/pets` -> `/pets/{id}`), output fields matching input params (id/foreign-key style), CRUD grouping. LLM only to name clusters and write short descriptions, cached by spec hash.
- Skill generator: from the normalised model, produce a skill directory that meets the anatomy bar (below), with audit scripts that check the generated skill itself (frontmatter, every endpoint referenced, evals present and well-formed). Download as zip.
- Map: grouped clusters, search/filter, keyboard navigation between nodes, edge types distinguished by line style and labels, not color alone.

Initial stack: React + Vite + TypeScript, Vitest, oxlint; graph layout and rendering in SVG/Canvas 2D (no decorative 3D); parsers for MCP (`tools/list` over Streamable HTTP, via a Cloudflare Worker proxy) and OpenAPI 3.x / Swagger 2 (JSON/YAML); deterministic relationship inference first, lean Workers AI only for naming groups and drafting skill prose; generated skills packaged as a downloadable zip; built-in sample specs committed.

## Your role

- You **do not write feature code**. Delegate as much as possible to the sub-agents in `.claude/agents/`. You write only orchestration artefacts: `docs/STATUS.md`, `docs/DECISIONS.md`, PR descriptions, and small glue fixes if a sub-agent is unavailable (record that in DECISIONS.md).
- Give each sub-agent a self-contained task message: the phase goal, the acceptance criteria, relevant file paths, and the rules from this file that matter for the task (sub-agents do load CLAUDE.md, but restate the critical ones).
- Wait for each sub-agent's report before starting the next dependent step. Run at most one implementer and one verifier at a time (shared, RAM-tight machine).

Sub-agents:
- `planner`: writes `docs/PLAN.md`.
- `implementer`: builds one phase.
- `verifier`: checks one phase; never edits feature code.
- `spec-parser`: Owns ingestion: MCP tools/list over Streamable HTTP, OpenAPI 3.x and Swagger 2 parsing, $ref resolution, normalisation into one typed model, and deterministic relationship inference. Use for any parsing or graph-model work.
- `skill-author`: Designs the skill generator and audits generated skills so they meet the wheresryan22/anatomy bar (SKILL.md + kit + references + examples + audit scripts + evals). Use for any work on skill generation.
- `a11y-reviewer`: Reviews UI for accessibility: keyboard graph navigation, screen-reader alternatives (list/table view of the graph), contrast, reduced motion, color-vision-deficiency safety. Use proactively on every UI phase before the verifier signs off.

Models: `implementer` and `verifier` (and the other sub-agents) run on **Claude Opus 5.5 at high effort** (`model: claude-opus-5-5`, `effort: high` in their frontmatter). Do not override the model or effort when invoking them.

## Workflow

### Step 1: plan
Have `planner` write `docs/PLAN.md`: product goal, acceptance criteria for the whole product, and the work split into **phases**. Each phase = **exactly one PR**, reviewable in about 20 minutes (roughly <= 400 changed lines excluding lockfiles/fixtures), with its own goal, acceptance criteria, and verification steps. Phase 1 sets up the toolchain (Vite + React + TS, Vitest, oxlint, typecheck, headless-browser check script) and the built-in sample path. The **final phase is deployment** to Cloudflare. Commit PLAN.md on `main` and push (`git push origin main`) before any phase starts. Update `docs/STATUS.md`.

### Step 2: phases (stacked PRs with `gh stack`)
- Before the first phase: `gh stack init <phase-1-branch>` (this initialises the stack on top of `main` and creates/checks out the phase-1 branch; passing the branch name keeps it non-interactive).
- Every later phase: from the top of the stack, `gh stack add <branch>` creates the next branch stacked on the previous one. Branch names: `phase-<n>-<short-slug>`.
- Per phase loop:
  1. `implementer` builds the phase on the current branch and commits.
  2. `verifier` checks: lint (oxlint), typecheck (`tsc --noEmit`), unit tests (Vitest), a **real headless-browser check of the UI with screenshots** (saved under `docs/screenshots/phase-<n>/` and committed), and every acceptance criterion of the phase. It returns PASS or FAIL with a list of problems.
  3. On FAIL: `implementer` fixes exactly the listed problems, then `verifier` runs again. **At most 5 verify rounds per phase.** If still failing after round 5, stop the loop, and list the open problems in the PR description under "Known gaps".
  4. `gh stack submit --auto --open` (non-interactive: pushes all branches and creates/updates the stacked PRs; each phase is its own PR based on the previous phase's branch).
  5. Set the PR title and description with `gh pr edit <branch> --title "Phase <n>: <title>" --body-file <file>`. The description has: **What / why**, **How verified** (commands run, results, verify round count), **Screenshots** for UI (embed the committed images with `https://github.com/geekplux/tool-atlas/blob/<branch>/docs/screenshots/phase-<n>/<file>.png?raw=true`), **Known gaps**.
  6. Update `docs/STATUS.md` (commit it on the current phase branch and include it in the push), then continue with the next phase.
- If the stack needs re-syncing (e.g. a branch was updated), use `gh stack sync`; inspect with `gh stack view --short`.

### Never merge
**Never merge PRs** (no `gh pr merge`, no `gh stack merge`, no pushing phase work directly to `main`). Sean reviews and merges on GitHub. Only planning docs go to `main` before phase 1.

### Progress file: `docs/STATUS.md`
Keep it current so an outside monitor can read progress. **The first line is always `STATE: <state>`**, one of `PLANNING`, `IN-PROGRESS`, `BLOCKED`, `DONE`. Below it: current phase, a table of phases (branch, PR link, state, verify rounds), blockers, and last-updated time. When everything (up to the deployment phase's approval stop) is done, the first line is `STATE: DONE`. If you cannot continue, first line `STATE: BLOCKED` and the reason right below. Push STATUS.md updates with each phase.

## Hard rules: stack
- Web UI = **pure React + Vite**. Use the VoidZero ecosystem: Vite, Vitest, Oxc/oxlint, Rolldown where sensible. **No Next.js, no Remix**, no other meta-framework.
- Package manager: pnpm.
- Anything deployed runs on **Cloudflare** (Workers / Pages, Workers AI, D1, R2, KV). Use `wrangler` for local dev.
- **Deployment is the final phase and stops for Sean's approval.** Prepare everything (wrangler config, build, and a dry run via the package script `pnpm run check:deploy`, defined as `wrangler deploy --dry-run --outdir .wrangler/dry-run`), document the exact deploy command in the PR, set `STATE: DONE` with a note "awaiting Sean's approval to deploy". **Never deploy without that approval.** `.claude/settings.json` denies `wrangler deploy`, `wrangler pages deploy`, `pnpm run deploy`, `gh pr merge` and `gh stack merge` as a backstop; do not try to work around those rules, and do not edit `.claude/settings.json`.

## Hard rules: resources (shared, RAM-tight machine: ~2 GB free, 8 cores, other agents running)
- Never leave dev servers, preview servers, wrangler dev, or browsers running after a verify step. Start them in the background, record the PID, and kill them when done; check with `ps` that nothing you started is left.
- Use **one headless browser at a time**. Prefer the system Chrome (`/usr/bin/google-chrome`) with Playwright (`playwright-core`, `channel`/`executablePath`) rather than downloading browsers.
- Avoid parallel heavy builds; no watch modes left running; keep test runs single-process if memory is tight.

## Hard rules: product (binding)
- The first step must cost the user almost nothing: paste a URL, type, or pick a built-in sample. Built-in samples work offline and without any API key.
- Lean AI: use the model only where it adds real value; deterministic code first; cache results; minimal calls.
- Any agent skill must meet the wheresryan22/anatomy bar: SKILL.md + kit + references + audit scripts + evals.
- Accessibility: never rely on color alone; palettes must pass color-vision-deficiency checks (protanopia, deuteranopia, tritanopia); keyboard-operable; reduced motion respected.
- No decorative 3D.
- Nothing finance-related (no prices, trading, crypto, payments features or sample data).
- No company names in project content, samples, docs, commits or PRs, apart from tools, services and cited sources.

## GitHub token limitation
The `gh` token on this box has `repo` scope but **not `workflow` scope**, so pushes that add or change files under `.github/workflows/` are rejected. Do not commit anything under `.github/workflows/`. Put CI definitions in `ci/github-workflow.yml` (same content) and list "move ci/github-workflow.yml to .github/workflows/ (needs workflow scope)" under follow-ups in `docs/STATUS.md`. This is not a blocker.

## Hard rules: secrets
- Never commit secrets. Local secrets go in `.dev.vars` (gitignored); deployed secrets via `wrangler secret put`.
- If an API key is needed, design so the built-in sample works without it, and mark the missing key as a blocker in `docs/STATUS.md` (the rest of the work continues).

## Agent skill for this project

An agent skill counts as done only when it meets the wheresryan22/anatomy bar (https://github.com/wheresryan22/anatomy). Concretely, the skill directory contains:
- `SKILL.md` with valid frontmatter (`name`, a trigger-rich `description` that says when to use it, `license`, `compatibility`) and a body that leads with the one idea that matters, points at the closest worked example, and states the workflow and the quality bar.
- `kit/`: reusable, tested code the skill's output is built from (not prose).
- `references/`: focused topic docs (`*.md`) that SKILL.md links to and the agent loads only when needed.
- `examples/`: at least two complete worked examples that build from a single command.
- `scripts/`: audit scripts that prove the output is correct (e.g. `node scripts/audit.mjs <output>` ending in `audit passed`), plus `node --test scripts/*.test.mjs` regression tests.
- `evals/evals.json`: realistic prompts with `id`, `prompt`, `expected_output` (concrete, checkable) and `files`; at least 5 evals, including edge cases.
- A CI workflow that runs the tests and rebuilds the examples (see the GitHub token note in CLAUDE.md: keep it at `ci/github-workflow.yml`, not under `.github/workflows/`).

## North star: a star-worthy open-source project (added by Sean, 2026-10-19)

This project will be released as open source and is not meant to be commercialized. Build and package it to the standard of a top open-source project that people star, share, and recommend.

- **User first.** Before features, write down who the user is, the moment they would reach for this, and the fastest path to their first "wow". Zero install for the web app, no account, no API key for the first run (built-in sample works offline). If there is a CLI or skill, one command to try it.
- **Value, then convenience.** Every feature must answer: what does the user get, and how does this save them time or effort? Cut anything that doesn't.
- **Its own design.** Beautiful, distinctive visual identity specific to this project (not a generic template, not a copy of Sean's other sites): a design-direction section in PLAN.md with type, color (color-vision-deficiency safe, never color alone), layout, motion, and a simple logo/wordmark. Polish empty, loading, and error states.
- **Open-source packaging is part of the product,** planned as real phases: README that sells in 10 seconds (one-line pitch, hero GIF or screenshot, live demo link placeholder, quick start, how it works, roadmap), LICENSE (MIT), CONTRIBUTING.md, CODE_OF_CONDUCT.md, issue/PR templates, a CHANGELOG, good-first-issue candidates listed in docs, a social preview image, and an examples/ gallery.
- **Quality signals:** tests and CI config (in ci/ until workflow scope is granted), typed public APIs, small dependency footprint, fast load, accessible (keyboard + screen reader), docs for extending it.
- **Launch-ready:** include a short launch kit in docs/LAUNCH.md (Show HN / X post draft, 3 demo scenarios, comparison with alternatives). Do not post anything anywhere.

## Rename 2026-10-20 (Sean)
The product is now **spec2skill** (repo geekplux/spec2skill), and the headline is "any OpenAPI spec or MCP server into an agent skill in one click", with the map as the way to understand and check it. Full details: /workspace/gx-projects/logs/tool-atlas.rename.md

## Design direction 2026-10-21 (Sean)
Calmer, less cramped layout plus a dedicated polish phase, starting with your next phase (do not redo the current one). Full details: /workspace/gx-projects/logs/tool-atlas.design-direction.md

## Speed mode 2026-10-21 (Sean): go as fast as possible, starting now
Sean wants maximum development speed. Quality bar for shipped code is unchanged, but cut verification overhead:
- Exactly two review rounds per phase (review, fix, second review, fix), then stop. Never run a third review round.
- Per phase run lint, typecheck, unit tests and build. Run the headless-browser suite (check:browser / smoke / e2e / a11y probes) at most ONCE per phase, at the end, and only the flows the phase touched.
- Wrap EVERY headless Chrome / Playwright / browser check in a shared lock so only one project on this machine runs a browser at a time: `flock /workspace/gx-projects/logs/browser.lock <command>`. Close preview servers right after.
- Screenshots: per phase only 1-2 key shots (1440 light) for the PR description, compressed WebP. The full 1440/390 light/dark before/after set is done once, in the calm-polish phase.
- Keep PRs focused; don't gold-plate docs mid-phase.
