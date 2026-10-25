# Deploying spec2skill to Cloudflare

spec2skill deploys as **one Cloudflare Worker with static assets**: Vite builds the app into `dist/`, and the Worker (`worker/index.ts`) serves it and answers `/api/*` (the spec-fetching proxy, the MCP `tools/list` client and the optional AI route). Everything is configured in `wrangler.jsonc`. The app needs **no secrets and no API keys**.

This guide is for maintainers and for anyone who wants to run their own copy.

## 1. Prerequisites

- A Cloudflare account (the free plan is enough).
- pnpm 9 and git. pnpm fetches the pinned Node 22 by itself (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
- Log in once from the repo root; this opens a browser to authorise wrangler:

  ```sh
  pnpm install --frozen-lockfile
  pnpm exec wrangler login
  pnpm exec wrangler whoami   # shows the account you will deploy to
  ```

## 2. One-time setup: the KV namespace

The Worker caches AI results in a KV namespace bound as `SPEC_CACHE`. The production namespace already exists and its id (`b7d9422f1e0748e591bb18006fb87c38`) is set in `wrangler.jsonc`. If you ever recreate it (a deploy failing with `KV namespace '…' not found` means the id is wrong; the original placeholder was `00000000000000000000000000000000`), run:

```sh
pnpm exec wrangler kv namespace create SPEC_CACHE
```

Wrangler prints the new namespace's `id`. In `wrangler.jsonc`, replace the id in the top-level `kv_namespaces` line:

```jsonc
"kv_namespaces": [{ "binding": "SPEC_CACHE", "id": "<the id wrangler printed>" }],
```

Commit and push it to `main`. A namespace id is not a secret, so committing it is fine. Leave `wrangler.local.jsonc` alone: it is only used by `pnpm dev:worker`, where KV is simulated locally.

## 3. Optional: Workers AI

The `AI` binding is already in `wrangler.jsonc`, so a deployed Worker uses Workers AI (model in the `AI_MODEL` var) to suggest cluster names and short skill prose for specs a user loads themselves. Nothing else is needed: no key, no secret. Workers AI usage counts against your account's Workers AI allowance.

The app works fully without it. To deploy without AI, delete the `"ai": { "binding": "AI" }` line: `/api/health` then reports `"ai": false`, `/api/ai/describe` answers 501, and every name and sentence stays deterministic, exactly like the built-in samples and the CLI.

Rate limits (`RATE_LIMITER`: 30 requests per minute per IP for the proxy, `AI_RATE_LIMITER`: 10 per minute for AI) need no setup.

## 4. How the config is laid out

- **`wrangler.jsonc`, top level = production.** There are no named environments, so a bare `wrangler deploy` (what Workers Builds runs) deploys production and prints no "multiple environments" warning.
- **Custom domain.** `routes` declares `spec2skill.geekplux.com` as a custom domain (`custom_domain: true`). It was first attached in the dashboard; declaring it here means `wrangler deploy` keeps it instead of fighting the dashboard. The `workers.dev` URL stays on as well.
- **`previews` block.** Workers Builds runs `npx wrangler preview` for non-production branches, and Previews do not inherit top-level bindings. The block gives Previews the AI binding, `AI_MODEL` and their own rate-limit counters, and deliberately no `SPEC_CACHE` (the cache is optional), so Previews never touch production KV.
- **`wrangler.local.jsonc`** = local dev only (`pnpm dev:worker`, `pnpm smoke:worker`): the same Worker without AI, so it needs no Cloudflare login.

## 5. Build and dry run

```sh
pnpm install --frozen-lockfile && pnpm build && pnpm run check:deploy
```

`check:deploy` runs `wrangler deploy --dry-run --outdir .wrangler/dry-run`: it bundles the Worker, reads `dist/`, prints the bindings and stops without uploading anything. Expect this binding list, and no warnings:

```text
env.SPEC_CACHE (<your namespace id>)                            KV Namespace
env.AI                                                          AI
env.RATE_LIMITER (30 requests/60s)                              Rate Limit
env.AI_RATE_LIMITER (10 requests/60s)                           Rate Limit
env.ASSETS                                                      Assets
env.AI_MODEL ("@cf/meta/llama-3.1-8b-instruct-fp8")             Environment Variable
```

Optionally, run the final local smoke (the real Worker under `wrangler dev`, one headless Chrome; everything it starts is stopped again):

```sh
pnpm build && pnpm smoke:worker
```

It must end with `worker smoke passed`.

## 6. Deploy (Workers Builds)

Production deploys run in Cloudflare Workers Builds, connected to this GitHub repository (Workers & Pages, spec2skill, Settings, Builds):

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | `pnpm run build` |
| Deploy command | `npx wrangler deploy` |
| Preview command (non-production branches) | `npx wrangler preview` |
| Root directory | `/` |

Every push to `main` builds and deploys to **https://spec2skill.geekplux.com**. The repo deliberately has no `deploy` script. To deploy by hand instead (same result): `pnpm build && pnpm exec wrangler deploy`.

### Post-deploy smoke

Replace `<worker>` with `spec2skill.geekplux.com`.

1. `curl -s https://<worker>/api/health` returns `{"ok":true,"ai":true,"model":"@cf/meta/llama-3.1-8b-instruct-fp8"}` (or `{"ok":true,"ai":false}` without the AI binding).
2. `curl -s -X POST https://<worker>/api/fetch-spec -d '{"url":"http://127.0.0.1/"}'` returns a `blocked-host` error (the proxy refuses private addresses).
3. Open `https://<worker>/`: the Tasks API sample's route map, with the skill browser under it showing **Audit passed**. Switch to the Petstore and Filesystem samples.
4. Click **Download .zip**, unzip it and run `node scripts/audit.mjs .` inside the skill folder: it ends with `audit passed`.
5. Paste a public spec URL, for example `https://petstore3.swagger.io/api/v3/openapi.json`, and press **Generate**: the map and skill appear; with AI enabled the names are credited "AI-drafted" after a moment.
6. Open `https://<worker>/?sample=petstore` directly: the Petstore sample opens (shareable URL state), and an unknown path such as `https://<worker>/nope` still serves the app (single-page fallback).

## 7. Rollback

Every deploy creates a new version. To return to the previous one:

```sh
pnpm exec wrangler deployments list   # recent deployments and their versions
pnpm exec wrangler rollback           # roll back to the previous version (asks for confirmation)
```

`wrangler rollback <version-id>` targets a specific version. Rollback does not touch the KV namespace; cached AI results stay valid because their keys include the prompt version and model.

## 8. After the first deploy

- **README live demo.** `README.md` links to https://spec2skill.geekplux.com.
- **Social preview.** On GitHub, open the repository's Settings, General, Social preview, and upload `docs/social-preview.png` (1280 x 640).
- **Repository website.** The repository's "Website" field is https://spec2skill.geekplux.com.
- **Logs.** Workers Logs are on (`observability` in `wrangler.jsonc`): invocation metadata and console output only, with query strings redacted. The Worker never logs request bodies.

## Not covered here

- Publishing the CLI to npm (`npx spec2skill`) is a separate decision and not part of this deploy.
- Secrets: none are needed. If a future feature needs one, set it with `pnpm exec wrangler secret put <NAME>` for the deployed Worker and in `.dev.vars` (gitignored, see `.dev.vars.example`) locally; never commit it.
