# Pagination and errors

How lists continue and calls fail. Back to [SKILL.md](../SKILL.md).

## Pagination

| Operation | Style | Params |
| --- | --- | --- |
| `listProjects` | cursor | `cursor`, `limit` |
| `listLabels` | cursor | `cursor`, `limit` |
| `listMembers` | cursor | `cursor`, `limit` |
| `listTasks` | cursor | `cursor`, `limit` |
| `listComments` | cursor | `cursor`, `limit` |

Keep calling with the cursor, offset or page from the last response until it is empty or the page is short; say how many items you read.

## Errors

The kit throws `ArgsError` before anything is sent: unknown operation, unknown or missing argument, wrong type, value outside the enum; the message names the operation and the argument. Report it, fix the arguments from an earlier output or the user, and never retry a 4xx with guessed arguments.

| Documented failure | Operations |
| --- | --- |
| 404 No such resource, or you cannot see it. | `updateComment`, `deleteComment`, `deleteLabel`, `getProject`, `updateProject`, `deleteProject`, `getMember`, `removeMember`, `listTasks`, `createTask`, `getTask`, `updateTask`, `deleteTask`, `listComments`, `completeTask` |
| 401 Missing or invalid token. | `listProjects`, `createProject` |
| 400 The request body is invalid. | `createProject`, `createLabel`, `addMember`, `createTask`, `updateTask`, `createComment` |

## Known gaps in the source spec

None reported.
