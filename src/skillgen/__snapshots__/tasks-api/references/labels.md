# Labels

3 operations: list, create, delete. Back to [SKILL.md](../SKILL.md).

## `listLabels`

`GET /projects/{projectId}/labels` · list · read-only · idempotent · paginated (cursor)

> List labels in a project

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `projectId` | path | yes | string |  |
| `cursor` | query | no | string | The 'nextCursor' of the previous page. Omit for the first page. |
| `limit` | query | no | integer | Page size. |

Returns `LabelPage` with `data`, `nextCursor`.

Feeds: `deleteLabel` (`id -> labelId`), `listTasks` (`id -> labelId`).

Fed by: `listProjects` (`id -> projectId`), `createProject` (`id -> projectId`), `getTask` (`projectId -> projectId`).

## `createLabel`

`POST /projects/{projectId}/labels` · create

> Create a label

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `projectId` | path | yes | string |  |
| `color` | body | no | string |  |
| `name` | body | yes | string |  |

Returns `Label` with `color`, `id`, `name`, `projectId`.

Feeds: `deleteLabel` (`id -> labelId`), `listTasks` (`id -> labelId`).

Fed by: `listProjects` (`id -> projectId`), `createProject` (`id -> projectId`).

## `deleteLabel`

`DELETE /labels/{labelId}` · delete · destructive: confirm first · idempotent

> Delete a label
>
> Deletes the label and removes it from every task.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `labelId` | path | yes | string |  |

Returns no documented body.

Fed by: `listLabels` (`id -> labelId`), `createLabel` (`id -> labelId`).
