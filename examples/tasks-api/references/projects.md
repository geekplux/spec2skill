# Projects

5 operations: list, create, read, update, delete. Back to [SKILL.md](../SKILL.md).

## `listProjects`

`GET /projects` · list · read-only · idempotent · paginated (cursor)

> List projects

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `cursor` | query | no | string | The 'nextCursor' of the previous page. Omit for the first page. |
| `limit` | query | no | integer | Page size. |
| `archived` | query | no | boolean | Include archived projects. |

Returns `ProjectPage` with `data`, `nextCursor`.

Feeds: `getProject` (`id -> projectId`), `updateProject` (`id -> projectId`), `deleteProject` (`id -> projectId`), `listLabels` (`id -> projectId`), `createLabel` (`id -> projectId`), `listMembers` (`id -> projectId`), `addMember` (`id -> projectId`), `getMember` (`id -> projectId, ownerId -> memberId`) and 3 more.

## `createProject`

`POST /projects` · create

> Create a project

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `description` | body | no | string |  |
| `name` | body | yes | string |  |

Returns `Project` with `archived`, `createdAt`, `description`, `id`, `name`, `ownerId`.

Feeds: `getProject` (`id -> projectId`), `updateProject` (`id -> projectId`), `deleteProject` (`id -> projectId`), `listLabels` (`id -> projectId`), `createLabel` (`id -> projectId`), `listMembers` (`id -> projectId`), `addMember` (`id -> projectId`), `getMember` (`id -> projectId`) and 3 more.

## `getProject`

`GET /projects/{projectId}` · read · read-only · idempotent

> Get a project

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `projectId` | path | yes | string |  |

Returns `Project` with `archived`, `createdAt`, `description`, `id`, `name`, `ownerId`.

Feeds: `getMember` (`ownerId -> memberId`, inferred), `removeMember` (`ownerId -> memberId`, inferred).

Fed by: `listProjects` (`id -> projectId`), `createProject` (`id -> projectId`), `getTask` (`projectId -> projectId`).

## `updateProject`

`PATCH /projects/{projectId}` · update

> Update a project

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `projectId` | path | yes | string |  |
| `archived` | body | no | boolean |  |
| `description` | body | no | string |  |
| `name` | body | no | string |  |

Returns `Project` with `archived`, `createdAt`, `description`, `id`, `name`, `ownerId`.

Fed by: `listProjects` (`id -> projectId`), `createProject` (`id -> projectId`), `getTask` (`projectId -> projectId`).

## `deleteProject`

`DELETE /projects/{projectId}` · delete · destructive: confirm first · idempotent

> Delete a project
>
> Deletes the project with all its tasks, comments and labels. This cannot be undone.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `projectId` | path | yes | string |  |

Returns no documented body.

Fed by: `listProjects` (`id -> projectId`), `createProject` (`id -> projectId`), `getTask` (`projectId -> projectId`).
