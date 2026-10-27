# Changelog

All notable changes to spec2skill are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

The first release. Development started under an earlier working name; the project was renamed to spec2skill (repository, package, wordmark and generated skills) while 0.1.0 was being built.

### Added

- Page-view counts on spec2skill.geekplux.com with Google Analytics: the path only, never a spec or MCP URL. Self-hosted copies load no analytics.
- **Toolchain**: React + Vite + TypeScript, Vitest, oxlint, a typecheck across app, Worker and CLI, and a headless-browser check (`pnpm check:browser`) on the system Chrome with axe and colour-vision-deficiency screenshots.
- **One model for every source**: OpenAPI 3.0/3.1 and Swagger 2.0 (JSON or YAML) and MCP `tools/list` responses normalise into one typed model, with internal `$ref` resolution, cycle handling and source detection by shape. Three built-in samples (Tasks API, Swagger Petstore, a recorded filesystem MCP server) work offline.
- **Deterministic relationships**: path hierarchy, shared schemas, output-to-input "feeds" links with exact or inferred confidence, CRUD grouping and clusters, with golden snapshots per sample.
- **Design system and the map**: the "Survey chart" identity (palette checked for contrast and colour-vision deficiency, logo and wordmark, light and dark themes), a deterministic SVG layout, keyboard navigation between nodes and edges, and a detail panel per operation.
- **The rename**: spec2skill, with the generated skill as the headline and the map beside it.
- **Skill generator**: `SKILL.md`, a tested `kit/` (operations, argument validation, request builder, call chains), `references/`, two worked examples, audit scripts, regression tests, evals and a CI workflow for every skill; the same audit runs in the app before download.
- **Skill-first first view**: the skill pane (file tree, preview, audit, **Download .zip**) beside the map, and the `examples/` gallery kept in sync by `pnpm gallery --check`.
- **Search, filters and a list view**: the list view as the map's text alternative, URL state and a keyboard shortcut dialog.
- **Large specs**: collapsed clusters, bundled feeds edges and trimmed edge noise.
- **Worker proxy**: a Cloudflare Worker that fetches public spec URLs and MCP `tools/list` over Streamable HTTP, with SSRF protection, size and time limits and rate limiting.
- **Source input**: paste a URL or spec text or open a file, with a loading step list and plain-language errors that each offer a way forward.
- **CLI**: `spec2skill <url|file>` and `spec2skill --sample <id>` write the skill directory and audit it, offline and without a key.
- **Lean AI**: optional Workers AI names clusters and drafts skill prose for user-loaded specs, validated, capped, cached by spec hash and labelled; everything works without it.
- **Calm polish**: one focal point and one accent per view, quiet disclosures and a single spacing scale.
- **Open-source packaging**: this README, licence, contributing guide, code of conduct, issue and pull request templates, extension guide, good first issues, social preview, a docs link check and the CI workflow.
- **Demo GIF and quieter edges**: a demo GIF captured from the real app by `pnpm capture:demo`, quieter map edges at rest, and singular counts ("1 relationship").
- **Deployment, prepared**: `wrangler.jsonc` finalised (Worker with static assets, `AI`, `SPEC_CACHE` KV, rate limits, Workers Logs with redacted query strings), cache headers in `public/_headers`, a dry run (`pnpm run check:deploy`), a local Worker smoke (`pnpm smoke:worker`) and [docs/DEPLOY.md](docs/DEPLOY.md).
- **Deploy config for Workers Builds**: `wrangler.jsonc` is production only (local dev moved to `wrangler.local.jsonc`, so a bare `wrangler deploy` prints no environments warning), declares the custom domain `spec2skill.geekplux.com`, and adds a `previews` block for branch previews (AI and separate rate limiters, no production KV). The SPEC_CACHE namespace id is the one value left to fill in ([docs/DEPLOY.md](docs/DEPLOY.md), step 2).
- **The Route map redesign** ([docs/DESIGN.md](docs/DESIGN.md)): Radix gray, indigo and amber tokens with the theme following the system, IBM Plex and the Overlap logo; one page on one grid (hero with the source field and samples, the result frame, command line, how it works); the route map (resources in columns by dependency, the strongest workflow as one straight line, feed links on hover, the operation card in place of the detail panel, no zoom or filters); the frame head with Install command and Download .zip, the skill browser with the audit always open, the list view and one scroll on phones; the load sequence and Generate's stage labels, all off under reduced motion; and an acceptance suite that checks type sizes, colours, lines, the grid, motion and axe on every sample in both themes at 1440 and 390 px.
- **Theme button**: a light/dark button in the header, after GitHub (after Menu on phones). The theme follows the system until it is used; the choice is remembered, applied before the first paint, and print stays light.
