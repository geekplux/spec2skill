# CLAUDE.md

A guide for maintainers and coding agents working on spec2skill (live at https://spec2skill.geekplux.com).

spec2skill turns an OpenAPI 3.x or Swagger 2.0 spec, or an MCP server's `tools/list`, into an agent skill: `SKILL.md`, a tested kit, references, worked examples, audit scripts, evals and a CI workflow. It also draws a route map of every operation, so you can check what the skill teaches. It ships as a React app on one Cloudflare Worker and as a CLI.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first: the modules, the relationship rules and the decision IDs (D12, D47, ...) that code comments cite. [docs/DESIGN.md](docs/DESIGN.md) is the interface spec, [docs/EXTENDING.md](docs/EXTENDING.md) the extension guide and [CONTRIBUTING.md](CONTRIBUTING.md) the setup.

## Stack and commands

React 19, Vite, TypeScript, Vitest and oxlint; pnpm 9, with Node 22 pinned in `.npmrc`. The Worker (`worker/`, `wrangler.jsonc`) serves the static app and `/api/*`, with KV, rate limits and optional Workers AI.

```sh
pnpm dev                            # the app on Vite (samples, paste and files work without the Worker)
pnpm build && pnpm dev:worker       # the built app behind the Worker at http://127.0.0.1:8787
pnpm lint                           # oxlint (warnings fail) and the spacing-token check
pnpm typecheck                      # tsc --noEmit for the app, the Worker and the CLI
pnpm test                           # Vitest, one file at a time, including the docs link check
pnpm build && pnpm check:size       # production build, then the gzip budgets
pnpm cli --sample tasks --out /tmp  # build the CLI, then write and audit a sample skill
pnpm gallery --check                # fail if examples/ drifts from the generator (pnpm gallery rewrites it)
pnpm check:browser -- --phase 21    # every headless-browser flow on the system Chrome (after pnpm build)
pnpm run check:deploy               # wrangler deploy --dry-run --outdir .wrangler/dry-run
```

Also `pnpm preview`, `pnpm smoke:worker`, `pnpm types:worker`, `pnpm test:docs`, `pnpm capture:readme` and `pnpm capture:demo`.

## Rules

- **Toolchain.** Pure React + Vite with the VoidZero tools: Vite, Vitest, Oxc/oxlint, Rolldown where sensible. No Next.js, no Remix, no other meta-framework. pnpm only. Keep the dependency list small.
- **Cloudflare.** Anything deployed runs on Cloudflare (Workers, Workers AI, KV). Use `wrangler` for local dev.
- **Deploys.** Workers Builds deploys `main` on every merge ([docs/DEPLOY.md](docs/DEPLOY.md)). Never run `wrangler deploy`; the dry run `pnpm run check:deploy` is fine and should pass before every PR. `.claude/settings.json` denies `wrangler deploy`, `wrangler pages deploy`, `pnpm run deploy`, `gh pr merge`, `gh stack merge` and force-pushes to `main` as a backstop. Do not work around it, and do not edit it.
- **Never merge PRs.** The maintainer reviews and merges on GitHub, and a merge is a deploy.
- **Secrets.** Never commit one. Local values go in `.dev.vars` (gitignored, see `.dev.vars.example`), deployed ones through `wrangler secret put`. The app needs none today.
- **Offline first.** The built-in samples work offline, with no key and no account. A feature that needs a key must keep them working without it.
- **Lean AI.** Deterministic code first. Workers AI only names clusters and drafts skill prose for specs the user loads: one batched call, cached by hash, under the site-wide `DAILY_AI_CAP` (`worker/budget.ts`). Samples and the CLI never call it.
- **Accessibility.** Never rely on colour alone. Palettes must pass protanopia, deuteranopia and tritanopia checks (`src/design/cvd.test.ts`). Everything is keyboard-operable with visible focus, and `prefers-reduced-motion` is respected. UI changes follow docs/DESIGN.md and its section 8 checks.
- **No decorative 3D.** Nothing finance-related: no prices, trading, crypto, payments features or sample data.
- **No company names** in project content, samples, docs, commits or PRs, apart from tools, services and cited sources.
- **Generated skills** must pass their own audit and tests. With any generator change, update the snapshots in `src/skillgen/__snapshots__/` and run `pnpm gallery`.
- **CI** (`.github/workflows/ci.yml`) runs on every push to `main` and every pull request: lint, typecheck, tests, build, size, the browser flows, the CLI, the gallery check and each example skill's tests and audit. Keep it in step with the checks contributors run locally.
