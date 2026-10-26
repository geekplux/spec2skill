# Security policy

## Reporting a vulnerability

Please report privately, not in a public issue: open the repository's **Security** tab and choose **Report a vulnerability**. That starts a private GitHub security advisory with the maintainers. Include the input that triggers the problem (a spec URL, an MCP server URL or a spec snippet), what happened and what you expected. Never include real credentials or a private spec.

We aim to acknowledge a report within 7 days, and to agree on a fix and a disclosure date with you before anything is published. Fixes land on `main`; there are no separately maintained release branches yet.

## Scope

The parts of spec2skill that take untrusted input:

| Area | Code | What it must guarantee |
|---|---|---|
| Fetch proxies | `worker/fetchSpec.ts`, `worker/mcpClient.ts`, `worker/ssrf.ts`, `worker/limits.ts` | `/api/fetch-spec` and `/api/mcp/tools` fetch only public `http(s)` URLs. Loopback, private, link-local, CGNAT and metadata addresses (in any IPv4 notation) and local host names are refused, on the pasted URL and on every redirect. At most 3 redirects and 5 MB per request. |
| Spec parsing | `src/parse/` | OpenAPI and Swagger documents (JSON or YAML) and `tools/list` replies are parsed as data, never executed. |
| Generated skills | `src/skillgen/` | Text from a spec reaches the generated files only through `src/skillgen/sanitize.ts`: one capped line with no HTML, no control characters and nothing Markdown acts on. |
| AI descriptions | `worker/ai.ts`, `worker/budget.ts` | `/api/ai/describe` only names clusters and drafts short prose. The site makes at most `DAILY_AI_CAP` model calls per UTC day; a deployment without KV makes none. |

Out of scope: the cost of Workers AI calls on your own deployment (tune `DAILY_AI_CAP` and `PROXY_LIMITER` in `wrangler.jsonc` for yours), and findings that need a malicious local `.dev.vars` or a modified build.

A known limit: a host name that resolves to a private address through DNS cannot be checked before the fetch inside a Worker. In production, the Workers runtime itself refuses private destinations.
