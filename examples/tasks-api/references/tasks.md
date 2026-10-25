# Tasks

6 operations: list, create, read, update, delete, action. Back to [SKILL.md](../SKILL.md).

## `listTasks`

`GET /projects/{projectId}/tasks`: list, read-only, idempotent, paginated (cursor)

> List tasks in a project

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `projectId` | path | yes | string |  |
| `cursor` | query | no | string | The 'nextCursor' of the previous page. Omit for the first page. |
| `limit` | query | no | integer | Page size. |
| `status` | query | no | TaskStatus | one of todo, in_progress, done |
| `assigneeId` | query | no | string | Only tasks assigned to this member. |
| `labelId` | query | no | string | Only tasks with this label. |

Returns `TaskPage` with `data`, `nextCursor`.

Feeds: `getTask` (`id -> taskId`), `updateTask` (`id -> taskId`), `deleteTask` (`id -> taskId`), `listComments` (`id -> taskId`), `createComment` (`id -> taskId`), `completeTask` (`id -> taskId`).

Fed by: `listProjects` (`id -> projectId, ownerId -> assigneeId`), `createProject` (`id -> projectId`), `listLabels` (`id -> labelId`), `createLabel` (`id -> labelId`), `listMembers` (`id -> assigneeId`, inferred), `getTask` (`projectId -> projectId, assigneeId -> assigneeId`).

## `createTask`

`POST /projects/{projectId}/tasks`: create

> Create a task

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `projectId` | path | yes | string |  |
| `assigneeId` | body | no | string |  |
| `description` | body | no | string |  |
| `dueDate` | body | no | string (date) |  |
| `labelIds` | body | no | string\[\] |  |
| `title` | body | yes | string |  |

Returns `Task` with `assigneeId`, `createdAt`, `description`, `dueDate`, `id`, `labelIds`, `projectId`, `status`, `title`.

Feeds: `getTask` (`id -> taskId`), `updateTask` (`id -> taskId`), `deleteTask` (`id -> taskId`), `listComments` (`id -> taskId`), `createComment` (`id -> taskId`), `completeTask` (`id -> taskId`).

Fed by: `listProjects` (`id -> projectId`), `createProject` (`id -> projectId`).

## `getTask`

`GET /tasks/{taskId}`: read, read-only, idempotent

> Get a task

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `taskId` | path | yes | string |  |

Returns `Task` with `assigneeId`, `createdAt`, `description`, `dueDate`, `id`, `labelIds`, `projectId`, `status`, `title`.

Feeds: `getProject` (`projectId -> projectId`), `listLabels` (`projectId -> projectId`), `listMembers` (`projectId -> projectId`), `getMember` (`projectId -> projectId, assigneeId -> memberId`), `listTasks` (`projectId -> projectId, assigneeId -> assigneeId`).

Fed by: `listTasks` (`id -> taskId`), `createTask` (`id -> taskId`).

## `updateTask`

`PATCH /tasks/{taskId}`: update

> Update a task
>
> Change the title, status, assignee, labels or due date. Send only the fields to change.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `taskId` | path | yes | string |  |
| `assigneeId` | body | no | string |  |
| `description` | body | no | string |  |
| `dueDate` | body | no | string (date) |  |
| `labelIds` | body | no | string\[\] |  |
| `status` | body | no | TaskStatus | one of todo, in_progress, done |
| `title` | body | no | string |  |

Returns `Task` with `assigneeId`, `createdAt`, `description`, `dueDate`, `id`, `labelIds`, `projectId`, `status`, `title`.

Fed by: `listTasks` (`id -> taskId`), `createTask` (`id -> taskId`).

## `deleteTask`

`DELETE /tasks/{taskId}`: delete, destructive (confirm first), idempotent

> Delete a task

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `taskId` | path | yes | string |  |

Returns no documented body.

Fed by: `listTasks` (`id -> taskId`), `createTask` (`id -> taskId`).

## `completeTask`

`POST /tasks/{taskId}/complete`: action

> Mark a task as done

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `taskId` | path | yes | string |  |

Returns `Task` with `assigneeId`, `createdAt`, `description`, `dueDate`, `id`, `labelIds`, `projectId`, `status`, `title`.

Fed by: `listTasks` (`id -> taskId`), `createTask` (`id -> taskId`).
