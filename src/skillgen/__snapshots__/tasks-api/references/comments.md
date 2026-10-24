# Comments

4 operations: list, create, update, delete. Back to [SKILL.md](../SKILL.md).

## `listComments`

`GET /tasks/{taskId}/comments`: list, read-only, idempotent, paginated (cursor)

> List comments on a task

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `taskId` | path | yes | string |  |
| `cursor` | query | no | string | The 'nextCursor' of the previous page. Omit for the first page. |
| `limit` | query | no | integer | Page size. |

Returns `CommentPage` with `data`, `nextCursor`.

Feeds: `updateComment` (`id -> commentId`), `deleteComment` (`id -> commentId`).

Fed by: `listTasks` (`id -> taskId`), `createTask` (`id -> taskId`).

## `createComment`

`POST /tasks/{taskId}/comments`: create

> Comment on a task

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `taskId` | path | yes | string |  |
| `body` | body | yes | string |  |

Returns `Comment` with `authorId`, `body`, `createdAt`, `editedAt`, `id`, `taskId`.

Feeds: `updateComment` (`id -> commentId`), `deleteComment` (`id -> commentId`).

Fed by: `listTasks` (`id -> taskId`), `createTask` (`id -> taskId`).

## `updateComment`

`PATCH /comments/{commentId}`: update

> Edit a comment

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `commentId` | path | yes | string |  |
| `body` | body | yes | string |  |

Returns `Comment` with `authorId`, `body`, `createdAt`, `editedAt`, `id`, `taskId`.

Fed by: `listComments` (`id -> commentId`), `createComment` (`id -> commentId`).

## `deleteComment`

`DELETE /comments/{commentId}`: delete, destructive (confirm first), idempotent

> Delete a comment

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `commentId` | path | yes | string |  |

Returns no documented body.

Fed by: `listComments` (`id -> commentId`), `createComment` (`id -> commentId`).
