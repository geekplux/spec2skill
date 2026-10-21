# Workflows

Chains where one call's output feeds the next call's input, strongest first (exact name matches before inferred ones). `kit/chains.mjs` exports them as `chains`, with `nextSteps(id)` and `sources(id)` for single steps. Back to [SKILL.md](../SKILL.md).

## 1. `listProjects` -> `listTasks` -> `getTask` -> `getMember`

`listProjects` -> `listTasks` (`id -> projectId, ownerId -> assigneeId`) -> `getTask` (`id -> taskId`) -> `getMember` (`projectId -> projectId, assigneeId -> memberId`)

## 2. `listProjects` -> `listLabels` -> `listTasks` -> `getTask`

`listProjects` -> `listLabels` (`id -> projectId`) -> `listTasks` (`id -> labelId`) -> `getTask` (`id -> taskId`)

## 3. `listProjects` -> `listMembers` -> `listTasks` -> `listComments`

`listProjects` -> `listMembers` (`id -> projectId`) -> `listTasks` (`id -> assigneeId`) -> `listComments` (`id -> taskId`)

## 4. `createProject` -> `listTasks` -> `getTask` -> `listLabels`

`createProject` -> `listTasks` (`id -> projectId`) -> `getTask` (`id -> taskId`) -> `listLabels` (`projectId -> projectId`)

## 5. `listLabels` -> `listTasks` -> `getTask` -> `getProject`

`listLabels` -> `listTasks` (`id -> labelId`) -> `getTask` (`id -> taskId`) -> `getProject` (`projectId -> projectId`)

