# Contributing to spec2skill

Thank you for helping. Bug reports, specs that do not map well, docs fixes and code are all welcome. No CLA or DCO sign-off is needed: by opening a pull request you agree to license your contribution under the [MIT licence](LICENSE). Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

New here? [docs/GOOD_FIRST_ISSUES.md](docs/GOOD_FIRST_ISSUES.md) lists small, scoped tasks with file pointers, and [docs/EXTENDING.md](docs/EXTENDING.md) explains how to add a source format, a relationship rule, a skill section or a sample.

## Setup

You need [pnpm](https://pnpm.io/installation) 9 and git. You do not need to install Node 22 yourself: `.npmrc` pins `use-node-version=22.23.3`, so pnpm downloads and uses that Node for every script (generated skills themselves run on Node 20+).

```sh
git clone https://github.com/geekplux/spec2skill.git
cd spec2skill
pnpm install
pnpm dev            # the app at http://localhost:5173 with the built-in samples
```

The built-in samples work offline and need no key. To try URL fetching and live MCP servers locally, run the Cloudflare Worker with the built app: `pnpm build && pnpm dev:worker` (http://127.0.0.1:8787). Workers AI is optional and stays off in local dev; nothing needs a secret. If you ever add one, it goes in `.dev.vars` (gitignored), never in git.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server for the app |
| `pnpm lint` | oxlint (warnings fail) and the spacing-token check |
| `pnpm typecheck` | `tsc --noEmit` for the app, the Worker and the CLI |
| `pnpm test` | Vitest, single process (unit tests, golden snapshots, docs checks) |
| `pnpm test:docs` | every relative link, image, repo path and function name in the docs resolves |
| `pnpm build` / `pnpm check:size` | production build, then the gzip size budgets in `scripts/size-budget.json` |
| `pnpm build:cli` / `pnpm cli --sample tasks` | build the CLI, then write and audit a sample skill |
| `pnpm check:browser -- --phase <n>` | the headless-browser flows up to phase n on the system Chrome, with axe and CVD screenshots (needs `pnpm build`) |
| `pnpm gallery` / `pnpm gallery --check` | regenerate `examples/` from the samples, or fail on any drift |
| `pnpm capture:readme` | recapture `docs/media/hero.png` from the real app and re-render `docs/social-preview.png` (needs `pnpm build`) |

Before you open a pull request, run `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm gallery --check`. If you changed the UI, also run the browser check and, when the first view changed, `pnpm capture:readme` so the README hero stays true.

## Keeping it light on memory

The checks are tuned for small machines:

- Vitest runs one file at a time in one worker (`vitest.config.ts`); run a single file with `pnpm test src/graph/graph.test.ts`.
- Do not leave `pnpm dev`, `vite preview` or `wrangler dev` running in the background. The browser check, `capture:readme` and the social preview start their own preview server and Chrome and always stop both, even on failure or Ctrl-C.
- Run one headless browser at a time. If port 4173 is taken, set `CHECK_PORT=4174`; on a slow machine raise `CHECK_TIMEOUT_MS`.
- Set `CHROME_PATH` if your Chrome is not at `/usr/bin/google-chrome`. The scripts never download a browser, and they block every request that is not to the local preview server.

## Branches and pull requests

- Branch from `main` with a short descriptive name, e.g. `fix-swagger-collection-format`.
- Keep a pull request to one change that can be reviewed in about 20 minutes (roughly 400 changed lines, excluding lockfiles and fixtures). Split bigger work.
- Write small commits with clear messages in the imperative ("Add collectionFormat to Swagger examples").
- Add or update tests with the code: parsing and graph rules get unit tests and, where output changes, updated golden snapshots (`src/graph/__snapshots__/`, `src/layout/__snapshots__/`); review snapshot diffs, do not just accept them.
- UI changes must stay keyboard-operable, never rely on colour alone, respect reduced motion and follow [docs/DESIGN.md](docs/DESIGN.md). Include a screenshot in the pull request.
- Do not commit anything under `.github/workflows/`: the CI definition lives in [ci/github-workflow.yml](ci/github-workflow.yml) for now.
- Fill in the pull request template; a maintainer reviews and merges.

## Adding a sample

Samples must be small, licensed for redistribution and free of anything sensitive. Put the file in `samples/`, document its source, licence and any changes in [samples/README.md](samples/README.md), register it in `src/samples/index.ts`, add it to `SAMPLES` in `scripts/build-gallery.mjs`, run `pnpm gallery`, and add the golden snapshots its tests produce. [docs/EXTENDING.md](docs/EXTENDING.md#adding-a-sample) has the details.

## Reporting a spec that does not map well

Use the "Spec not mapped well" issue form: a public spec URL or a minimal snippet, the type spec2skill detected, and what you expected to see. Never paste a private spec or credentials into an issue.
