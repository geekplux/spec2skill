# Example: `listProjects` -> `listTasks` -> `getTask`

`listProjects` -> `listTasks` (`id -> projectId, ownerId -> assigneeId`) -> `getTask` (`id -> taskId`). Back to [SKILL.md](../../SKILL.md).

```sh
node examples/list-projects-to-get-task/run.mjs          # dry run: writes examples/list-projects-to-get-task/plan.json, calls nothing
TASKS_API_TOKEN=... TASKS_API_BASE_URL=<optional> node examples/list-projects-to-get-task/run.mjs --live   # makes the calls
```

Add `--set name=value` for an argument the chain does not fill and `--yes` to allow a destructive step (ask the user first).
`plan.json` lists each step: the request (credentials shown as REDACTED), its placeholder arguments and `fedBy`, the earlier output each fed argument comes from.

Generated for Tasks API by spec2skill.
