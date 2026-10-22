# Launch kit

> **Do not post anywhere; Sean decides.** Everything below is a draft. Nothing in this repository posts, sends or uploads anything; `scripts/capture-demo.mjs` talks only to its own preview server on `127.0.0.1`.

The headline is the generated skill: **turn any OpenAPI spec or MCP server into an agent skill in one click.** The map is how you understand and check what the skill teaches; it comes second in every draft.

Every number below comes from the built-in samples and can be checked offline with the commands given (counts as of 2026-10-21).

## Show HN draft

**Title** (77 characters):

> Show HN: spec2skill – turn any OpenAPI spec or MCP server into an agent skill

**URL:** the live demo (not deployed yet; see the checklist).

**First comment:**

> Hi HN. Coding agents get much better at an API when they have a skill for it: a SKILL.md that says when to use it, the right call order, auth, pagination, and code they can run. Writing one by hand for every API takes hours, and nothing tells you whether it is complete.
>
> spec2skill writes it for you. Paste an OpenAPI 3.x or Swagger 2.0 URL (JSON or YAML), an MCP server URL, or the spec text, or pick one of three built-in samples, and you get a skill directory: SKILL.md, a tested `kit/` (operations, argument checks, a small client, call chains), one reference page per resource plus auth, workflows and errors, two worked examples, audit scripts, `evals/evals.json` and a CI workflow. Download it as a zip, or use the CLI to write it straight into `.claude/skills/`.
>
> The skill proves itself. `node scripts/audit.mjs .` checks the frontmatter, that every operation is covered, that every link resolves, that the examples run as dry runs, that the evals are well formed, and ends in `audit passed`. The kit has its own `node:test` tests, and there are at least 5 evals with concrete expected outputs, including edge cases (a missing parameter, a destructive call that needs confirmation, a request the API cannot do). The web app runs the same audit before you download.
>
> Next to the skill is a map of every operation, grouped by resource and linked by which outputs feed which inputs (`listProjects -> listTasks -> getTask`), path hierarchy and shared schemas. That is how you check what the skill teaches before you give it to your agent. It is keyboard-operable and has a list view as its text alternative.
>
> Deterministic vs AI: parsing, `$ref` resolution, the relationships, the layout, the skill's code, references, examples, evals and the audit are all plain code. The built-in samples and the CLI never call a model. A deployment with Workers AI may suggest cluster names and a few sentences of prose for a spec you load yourself, from a small summary (ids, methods, paths, short titles, never descriptions or schemas); the answer is validated, cached by hash, and labelled "AI-drafted".
>
> Not supported yet: MCP servers on the legacy HTTP+SSE transport or behind auth, external `$ref`s across files, OpenAPI webhooks and callbacks, AsyncAPI and GraphQL. The CLI is not on npm yet (run it from the repo with `pnpm cli`). It is MIT licensed; feedback on the generated skills is the most useful thing you can give me.

## X thread draft

Each post is at most 280 characters (the longest is 252, counted with the bracketed image placeholders; recount after any edit).

1. spec2skill: turn any OpenAPI spec or MCP server into an agent skill in one click. SKILL.md, a tested kit, references, worked examples, evals and an audit that ends in "audit passed". Free, open source, no account, no key. [demo GIF]
   - *Alt text:* "Screen recording of spec2skill. The Filesystem MCP sample opens with its generated skill (file tree, SKILL.md preview, Audit passed: 9 of 9 checks) beside a map of 14 tools; Download .zip; a terminal runs the downloaded skill's audit and prints audit passed. Then the Tasks API workflows page, the map with getTask focused, and the Petstore list view and evals."
2. What you get for the Tasks API sample: 22 operations become SKILL.md, kit/ (operations, client, chains), 8 reference pages, 2 dry-run examples, 7 evals and a CI workflow. `node scripts/audit.mjs .` checks it all. [hero image]
   - *Alt text:* "The tasks-api skill in spec2skill: file tree, SKILL.md preview, Audit passed: 9 of 9 checks and Download .zip on the left; on the right the map of 22 operations in 5 clusters with GET /tasks/{taskId} focused and its details open."
3. The skill leads with real workflows. spec2skill infers which outputs feed which inputs (id -> taskId), so the skill says: listProjects -> listTasks -> getTask, and its examples follow that chain. All deterministic: no model involved. [workflows image]
   - *Alt text:* "The skill pane showing references/workflows.md for the Tasks API: numbered call chains such as listProjects -> listTasks -> getTask, each step naming the output field and the input it fills."
4. Check what it teaches: the map beside the skill shows every operation and relationship. Arrow keys move between nodes, E steps through a node's edges, Enter follows one. Edge kinds differ by line style, marker and label, never colour alone. [map image]
   - *Alt text:* "The spec2skill map with getTask focused: its edges drawn at full strength with labels such as id -> taskId, dashed with arrows for feeds and solid with chevrons for sub-paths; all other edges faded."
5. OpenAPI 3.x, Swagger 2.0 and MCP tools/list all become the same kind of skill. Prefer the terminal? `pnpm cli --sample tasks --out .claude/skills` writes the skill and runs its audit, offline.
6. MIT, built with React, Vite and a Cloudflare Worker. Try the 3 built-in samples, read the 3 example skills in the repo, and tell me what your agent still gets wrong. [repo link]

## Demo scenarios

All three run offline on the built-in samples, with no account and no key. Start the app once:

```sh
pnpm install && pnpm build && pnpm preview      # http://127.0.0.1:4173 (or `pnpm dev`)
```

`node scripts/capture-demo.mjs` (after `pnpm build`) drives all three in headless Chrome and writes the frames to `docs/media/demo/<scenario>/` and the GIF to `docs/media/demo.gif`; scenario 1 also unzips the real download and runs its audit.

### 1. "Teach my agent this MCP server" (Filesystem MCP)

1. Open `http://127.0.0.1:4173/?sample=filesystem` (or click the **Filesystem** sample chip).
2. The first view is the `filesystem-mcp` skill: its file tree, the SKILL.md preview and **Audit passed: 9 of 9 checks**; the map of 14 tools in 2 clusters (File, Directory) with 28 feeds relationships sits beside it.
3. Click **Audit passed** to see the nine checks, then **Download .zip** (`filesystem-mcp-skill.zip`).
4. In a terminal:
   ```sh
   unzip filesystem-mcp-skill.zip -d .claude/skills/
   cd .claude/skills/filesystem-mcp && node scripts/audit.mjs .
   ```
   Expect ten `ok` lines (the CLI audit adds "every example runs as a dry run") and `audit passed`.
5. Or skip the browser: `pnpm cli --sample filesystem --out .claude/skills` writes the same directory and ends with the same audit. The committed copy is in [examples/filesystem-mcp](../examples/filesystem-mcp/SKILL.md).

### 2. "Check what the skill teaches" (Tasks API)

1. Open `http://127.0.0.1:4173/?sample=tasks` (the default sample): 22 operations in 5 clusters, 78 relationships (53 feeds, 14 sub-path, 11 shared schema).
2. In the skill's file tree, open `references/` and select `workflows.md`. The first workflow is `listProjects` -> `listTasks` (`id -> projectId, ownerId -> assigneeId`) -> `getTask` (`id -> taskId`).
3. Check it on the map: Tab to the map, move with the arrow keys to **GET /tasks/{taskId}** (`getTask`) and press Enter to open its details (or open `?sample=tasks#op=getTask`). The details link to `references/tasks.md` under "In the skill".
4. With focus on `getTask`, press **E** to highlight its first edge, **E** again for the next, and **Enter** to follow the highlighted edge to the operation at its other end. Every highlighted edge keeps its line style, marker and label (`id -> taskId`).
5. Press `?` for every shortcut.

### 3. "Review a spec" (Swagger Petstore)

1. Open `http://127.0.0.1:4173/?sample=petstore&view=list`: the list view, 16 operations in 2 clusters (Pet, User), 41 relationships (8 feeds, 13 sub-path, 20 shared schema), every relationship in words.
2. Open **Filters** and untick **GET**: 10 of 16 operations remain, in the list and on the map; the skill still covers all 16. Click **Show all**.
3. Search `findPetsByTags`: its row is flagged "deprecated" (the spec marks it so). The Petstore sample has no spec warnings, so no warnings pill appears; a spec with problems (for example an external `$ref`) shows an "N warnings" pill beside its title.
4. In the skill's file tree open `evals/evals.json`: 6 evals (`main-chain`, `single-call`, `missing-param`, `destructive-confirm`, `missing-auth`, `unsupported-capability`), each with a prompt and a concrete expected output.
5. The committed copy is in [examples/petstore-api](../examples/petstore-api/SKILL.md); `node examples/petstore-api/scripts/audit.mjs examples/petstore-api` ends in `audit passed`.

## Why spec2skill

1. **OpenAPI and MCP, both.** OpenAPI 3.0 and 3.1, Swagger 2.0 (JSON or YAML) and MCP `tools/list` become one model and the same kind of skill.
2. **Inferred workflows.** Which outputs feed which inputs is worked out deterministically, so the skill leads with real call chains, its examples follow them, and `kit/chains.mjs` tells the agent what to call next.
3. **Skills that prove themselves.** Audit scripts, `node:test` regression tests, at least 5 evals with edge cases, dry-run examples and a CI workflow ship inside every generated skill.
4. **A map to check it.** A keyboard-operable map of every operation and relationship, with a list view as its text alternative, right beside the skill.

## How it compares, by category

By category of tool, not by project; each category has good tools and this is a general description, not a review of any of them. As of 2026-10-21.

| Category | OpenAPI input | MCP input | Inferred workflows | Audit, tests and evals in the output | Visual map | Try-it console | Where this category is better |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hand-written skills or prompts | by hand | by hand | by hand | only if the author writes them | no | no | Domain judgement: an expert knows which calls matter, the business rules and the pitfalls no spec states. Use spec2skill's output as a starting point and add that knowledge. |
| MCP-to-skill converters | usually no | yes | usually no | usually no | usually no | no | Small and focused on one job, quick to adopt when MCP is all you use; some run inside the agent's own tooling. |
| API documentation renderers | yes | usually no | no | no (they produce docs, not skills) | some show a navigation tree | often yes | Full reference documentation for people, rich schema and example rendering, and try-it consoles that make real calls. |
| MCP inspectors | no | yes | no | no | no | yes (call tools live) | Calling tools live against a running server, seeing real responses and debugging the transport. |
| spec2skill | yes (3.x, Swagger 2.0) | yes (`tools/list`) | yes, deterministic | yes (audit, `node:test`, at least 5 evals, CI) | yes, keyboard-operable, with a list view | no (examples are dry runs) | One click from a spec to a skill an agent can use, and proof that it is complete. |

spec2skill does not call your API or your MCP tools: worked examples are dry runs that write a plan, and the MCP proxy only asks for `tools/list`.

## Launch checklist

- [ ] Deployment approved by Sean and done (phase 21 prepares it and stops for approval).
- [ ] Demo link live: replace "coming soon" in the README with the deployed URL and check the three scenarios on it.
- [ ] Social preview set in the repository settings (upload `docs/social-preview.png`).
- [ ] CLI publish decided: publish `spec2skill` to npm (then `npx spec2skill` in the README) or keep `pnpm cli`.
- [ ] `CODE_OF_CONDUCT.md` contact filled in (it still says "[INSERT CONTACT METHOD]").
- [ ] Demo GIF regenerated from the final build (`pnpm build && node scripts/capture-demo.mjs`) and the README hero checked.
- [ ] Drafts above re-read against the deployed app (numbers, commands, character counts).
- [ ] Sean decides whether, where and when to post. Nothing is posted by any script or agent.
