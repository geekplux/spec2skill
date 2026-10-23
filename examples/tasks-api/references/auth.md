# Auth

How calls authenticate. `buildRequest` in `kit/client.mjs` reads the variables below and lists any unset one in `missingAuth` (sending a `$NAME` placeholder). Never print or commit their values. Back to [SKILL.md](../SKILL.md).

| Scheme | Type | Environment variables | Notes |
| --- | --- | --- | --- |
| `bearerAuth` | http bearer | `TASKS_API_TOKEN` | A personal access token, sent as 'Authorization: Bearer &lt;token&gt;'. |

Every operation needs auth.
