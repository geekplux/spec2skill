# Members

4 operations: list, create, read, delete. Back to [SKILL.md](../SKILL.md).

## `listMembers`

`GET /projects/{projectId}/members` · list · read-only · idempotent · paginated (cursor)

> List project members

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `projectId` | path | yes | string |  |
| `cursor` | query | no | string | The 'nextCursor' of the previous page. Omit for the first page. |
| `limit` | query | no | integer | Page size. |

Returns `MemberPage` with `data`, `nextCursor`.

Feeds: `getMember` (`id -> memberId`), `removeMember` (`id -> memberId`), `listTasks` (`id -> assigneeId`, inferred).

Fed by: `listProjects` (`id -> projectId`), `createProject` (`id -> projectId`), `getTask` (`projectId -> projectId`).

## `addMember`

`POST /projects/{projectId}/members` · create

> Invite a member to a project

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `projectId` | path | yes | string |  |
| `email` | body | yes | string (email) |  |
| `role` | body | no | Role | one of owner, editor, viewer. Defaults to editor. |

Returns `Member` with `email`, `id`, `name`, `projectId`, `role`.

Feeds: `getMember` (`id -> memberId`), `removeMember` (`id -> memberId`).

Fed by: `listProjects` (`id -> projectId`), `createProject` (`id -> projectId`).

## `getMember`

`GET /projects/{projectId}/members/{memberId}` · read · read-only · idempotent

> Get a member of a project

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `projectId` | path | yes | string |  |
| `memberId` | path | yes | string |  |

Returns `Member` with `email`, `id`, `name`, `projectId`, `role`.

Fed by: `listProjects` (`id -> projectId, ownerId -> memberId`), `createProject` (`id -> projectId`), `getProject` (`ownerId -> memberId`, inferred), `listMembers` (`id -> memberId`), `addMember` (`id -> memberId`), `getTask` (`projectId -> projectId, assigneeId -> memberId`).

## `removeMember`

`DELETE /projects/{projectId}/members/{memberId}` · delete · destructive: confirm first · idempotent

> Remove a member from a project
>
> Their tasks in this project become unassigned.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `projectId` | path | yes | string |  |
| `memberId` | path | yes | string |  |

Returns no documented body.

Fed by: `listProjects` (`id -> projectId, ownerId -> memberId`), `createProject` (`id -> projectId`), `listMembers` (`id -> memberId`), `addMember` (`id -> memberId`).
