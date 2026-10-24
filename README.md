<p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/wordmark-dark.svg">
    <img src="docs/media/wordmark.svg" alt="spec2skill" height="56">
  </picture>
</p>

**Turn any OpenAPI spec or MCP server into an agent skill in one click.**

Paste a spec URL, an MCP server URL or the spec text, or pick a built-in sample. spec2skill writes a complete skill directory that teaches a coding agent to call that API well, proves it with its own audit, and draws a map of every operation with it so you can check what it teaches.

**Live demo:** [spec2skill.geekplux.com](https://spec2skill.geekplux.com) (or [run it locally](#quick-start) with one command, or [deploy your own](docs/DEPLOY.md)). No account, no API key; the built-in samples work offline.

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/media/hero.png">
  <img src="docs/media/demo.gif" width="960" alt="A short recording of spec2skill on its built-in Tasks API sample. The route map loads: five resource cards rise column by column (Projects, then Members and Labels, then Tasks, then Comments), the links fade in, and the strongest workflow draws left to right as one indigo line with numbered stops listProjects, listTasks and getTask. The pointer rests on getTask: its feed links turn ink, everything else fades, and its operation card lists input, output, fed by, feeds, shares schema, sub-paths and In skill. The In skill link opens references/tasks.md in the skill browser below the map, beside Audit passed, 9 of 9. A still image is shown instead when reduced motion is preferred.">
</picture>

## What you get

One command (or one click on **Download .zip**) gives you this, for the built-in Tasks API sample:

```text
tasks-api/
├── SKILL.md                    when to use it, the strongest workflow first, the quality bar
├── kit/                        tested code the agent calls: operations.json, args.mjs, client.mjs, chains.mjs
├── references/                 one page per resource, plus auth, workflows, pagination-and-errors
├── examples/                   two worked call chains, each a dry run with one command
├── scripts/audit.mjs           proves the skill is complete, plus node:test regression tests
├── evals/evals.json            7 realistic prompts with concrete expected outputs
└── ci/github-workflow.yml      runs the tests, every example and the audit
```

```text
$ node scripts/audit.mjs .
ok    SKILL.md frontmatter: name, description with "Use when", license, compatibility
ok    SKILL.md body is at most 200 lines
ok    every operation in kit/operations.json appears in SKILL.md or references/
ok    every relative link in the Markdown files resolves
ok    every references/*.md is linked from SKILL.md
ok    kit code and regression tests are present
ok    at least 2 worked examples (examples/*/run.mjs)
ok    evals/evals.json: at least 5 well-formed evals naming known operations
ok    ci/github-workflow.yml runs the tests, every example and the audit
ok    every example runs as a dry run and writes a valid plan.json
audit passed
```

Browse three complete generated skills in the [examples gallery](examples/README.md).

## Quick start

**Web app.** Open the [live demo](https://spec2skill.geekplux.com), or run it locally with Node 22 and pnpm:

```sh
pnpm install && pnpm dev
```

Open the printed URL: the Tasks API sample's skill and map are already there. Pick another sample, paste a URL or spec text, then **Download .zip**.

To fetch URLs that block cross-origin requests and to read live MCP servers, run the app with its Cloudflare Worker proxy instead (serves the app and `/api/*` at `http://127.0.0.1:8787`):

```sh
pnpm build && pnpm dev:worker
```

**CLI.** Write the skill straight to disk and audit it, offline, with no key:

```sh
pnpm cli --sample tasks --out .claude/skills                       # a built-in sample
pnpm cli path/to/openapi.yaml --out .claude/skills                 # your spec file (JSON or YAML)
pnpm cli https://example.com/openapi.json --out .claude/skills     # a spec URL or an MCP server URL
```

Each writes `.claude/skills/<slug>/` and ends with the audit (`--force` overwrites an existing skill of the same name).

Once the CLI is published to npm this becomes `npx spec2skill <url|file> --out .claude/skills` (not published yet). `pnpm cli --help` lists every option.

**Deploy your own.** The app is one Cloudflare Worker with static assets and needs no secrets; Workers AI is optional. [docs/DEPLOY.md](docs/DEPLOY.md) covers the one-time setup, a dry run (`pnpm run check:deploy`), the deploy command, a post-deploy smoke and rollback.

## Why spec2skill

Other projects turn MCP servers into agent skills too. spec2skill aims to write the skill you would want to review and keep:

1. **OpenAPI and MCP, both.** OpenAPI 3.0 and 3.1, Swagger 2.0 (JSON or YAML) and MCP `tools/list` (live over Streamable HTTP, or pasted) become one model and the same kind of skill.
2. **Inferred workflows.** spec2skill works out deterministically which outputs feed which inputs (`listProjects -> listTasks (projectId) -> getTask (taskId)`), plus path hierarchy and shared schemas. The skill leads with the strongest workflow, its worked examples follow real chains, and `kit/chains.mjs` tells the agent what to call next.
3. **Skills that prove themselves.** Every generated skill ships audit scripts (`node scripts/audit.mjs .` ends in `audit passed`), `node:test` regression tests, at least 5 evals with concrete expected outputs including edge cases, dry-run worked examples and a CI workflow. The web app runs the same audit before you download.
4. **A map to check it.** A keyboard-operable route map of every operation and how they connect, with a list view as its text alternative, so you can understand the API and check what the skill teaches before you hand it to your agent.

## How it works

1. **Parse.** Detect the document by its shape (OpenAPI 3.x, Swagger 2.0 or MCP `tools/list`), read JSON or YAML, and resolve internal `$ref`s.
2. **Normalise.** One typed model for all sources: operations or tools, input and output schemas, auth, tags and resources.
3. **Relate, deterministically.** Path hierarchy (`/tasks` -> `/tasks/{taskId}`), shared schemas, output fields that match input parameters (`id -> taskId`), CRUD grouping and resources. Each link is either exact or inferred, and the skill's references mark the inferred ones.
4. **Write the skill and audit it.** `SKILL.md`, `kit/`, `references/`, `examples/`, `scripts/`, `evals/` and `ci/` are generated from the model, then audited; the audit result is shown before you download.
5. **A map to check it.** The same graph as a route map, drawn under the result's head and above the skill it describes:
   - **Columns by dependency.** Each resource is a card of its operations (method, then operation id), in list, create, read, update, delete order. A resource sits one column right of the resources that feed it, so calls read left to right; more than four columns scroll sideways inside the frame, and a card longer than eight rows ends in "N more".
   - **The main workflow line.** The strongest workflow (`listProjects -> listTasks -> getTask` in the sample) is one straight indigo line with numbered stops; its cards share one row, and the caption under the map spells it out with the field that carries each step (`id -> projectId`).
   - **Links.** A grey curve with an open arrowhead runs from an operation whose output feeds another's input; dashed when the match is inferred. Where one operation feeds many in another card, or three or more links run between two cards with a column between them, they rest as one line to the target card's head. Same-card, backward, sub-path and shared-schema links are not drawn at rest.
   - **Hover links and the operation card.** Hovering or focusing an operation draws each of its feed links in ink, fades everything unrelated, and opens its operation card: method and path, title, input, output, fed by, feeds, shared schemas, sub-paths and the skill file that documents it (In skill opens it in the skill browser). A click or Enter pins the card with Close; Escape closes it and returns focus to the operation.
   - **Destructive operations** (DELETE, or an MCP tool marked destructive) carry an amber warning mark and say "destructive" in their name. MCP tools show `read` or `write` where an HTTP operation shows its method.
   - **List view.** Map | List switches to the same operations grouped by resource, each with its path and, for screen readers, its relationships in words. Phones open on the list.
   - **Search.** `/` focuses it; matches stay ink, the rest fade, and the count is announced. The pinned operation, the search and the view are kept in the URL.

**Where AI is used, and where it is not.** Parsing, relationships, layout, the skill's code, references, examples, evals and the audit are all deterministic. When the app is deployed with Workers AI, it may suggest cluster names and a few sentences of skill prose for a spec you load yourself (by URL, pasted text or an opened file). The model sees only a small summary: the API title, operation ids, HTTP methods and paths, operation titles shortened to 120 characters, cluster names and their member operations, and up to 20 relationship labels; never descriptions or schemas. Its answer is checked against the spec and capped, results are cached by a hash of that summary, and the result's head tags the prose "AI-drafted prose". Without AI (the built-in samples, local dev without the AI binding, the CLI) everything works the same.

**Privacy.** Full spec text and opened files are parsed in your browser and never uploaded. URLs you paste are fetched directly by your browser, and through the Worker proxy only when that fails (CORS, network or timeout); MCP URLs always go through the proxy, which only asks for `tools/list` and never calls a tool. On a deployment with Workers AI, the small summary listed above (API title, operation ids, HTTP methods and paths, titles of at most 120 characters, cluster names and members, up to 20 relationship labels) of a spec you load yourself is sent to the Worker to suggest cluster names and skill prose, cached by hash. The built-in samples, local dev without the AI binding, and the CLI send nothing to any AI; the CLI talks only to the URL you give it.

## Accessibility

- **Keyboard.** Everything works without a pointer. The map is one Tab stop: arrow keys move to the nearest operation that way, Page Up and Page Down change resource, Home and End go to a resource's first and last operation, E cycles the focused operation's links and Enter pins its operation card (Escape closes it and returns focus). `/` focuses the search, `?` lists every shortcut, and the skill's files are a tree with the usual arrow keys.
- **Screen readers.** Each operation is a button named by what it shows, then its path, title, "destructive", its workflow step and its relationship count; moves and search results are announced. The list view is the map's full text alternative: every operation with its path and every relationship in words.
- **Never colour alone.** Methods are written out, destructive operations add a warning mark and the word "destructive", inferred links are dashed, the workflow's stops are numbered, related rows gain weight as well as ink on hover, and a failed audit check says "Failed" beside its `!`. The Radix gray, indigo and amber palette is checked under protanopia, deuteranopia and tritanopia simulation.
- **Contrast.** Text meets WCAG AA in the light and dark themes, which follow your system.
- **Reduced motion.** With `prefers-reduced-motion: reduce` nothing moves: the map, the workflow line and the audit appear in their end state, and the Generate spinner stands still.
- **Checked on every change.** axe, the type, colour, line and grid checks of [docs/DESIGN.md](docs/DESIGN.md) run in a real headless browser on every sample, in both themes, at desktop and phone widths, at rest, on hover, with the card pinned and in the list.

If something does not work for you, please [open an issue](https://github.com/geekplux/spec2skill/issues/new/choose).

## Roadmap

- MCP servers on the legacy HTTP+SSE transport, and MCP servers that need auth
- External `$ref` resolution across files and URLs
- OpenAPI webhooks and callbacks
- AsyncAPI and GraphQL sources
- Publishing the CLI to npm (`npx spec2skill`)

Ideas and small, scoped tasks for new contributors are in [docs/GOOD_FIRST_ISSUES.md](docs/GOOD_FIRST_ISSUES.md).

## Contributing

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md) to set up and run the checks, [docs/EXTENDING.md](docs/EXTENDING.md) to add a source format, a relationship rule or a skill section, and the [Code of Conduct](CODE_OF_CONDUCT.md). Changes are listed in the [CHANGELOG](CHANGELOG.md).

This repository is also developed by a Claude Code main agent acting as product manager and delegating to specialist sub-agents (`.claude/agents/`); [docs/PLAN.md](docs/PLAN.md) is the plan and [docs/STATUS.md](docs/STATUS.md) the live progress.

## Licence

[MIT](LICENSE) © spec2skill contributors. The built-in samples keep their own licences, listed in [samples/README.md](samples/README.md).
