# User

8 operations: create, read, update, delete, action. Back to [SKILL.md](../SKILL.md).

## `createUser`

`POST /user`: create

> Create user
>
> This can only be done by the logged in user.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `email` | body | no | string |  |
| `firstName` | body | no | string |  |
| `id` | body | no | integer (int64) |  |
| `lastName` | body | no | string |  |
| `password` | body | no | string |  |
| `phone` | body | no | string |  |
| `userStatus` | body | no | integer (int32) | User Status |
| `username` | body | no | string |  |

Returns no documented body.

## `createUsersWithArrayInput`

`POST /user/createWithArray`: create

> Creates list of users with given input array

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `body` | body | yes | User\[\] |  |

Returns no documented body.

## `createUsersWithListInput`

`POST /user/createWithList`: create

> Creates list of users with given input array

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `body` | body | yes | User\[\] |  |

Returns no documented body.

## `getUserByName`

`GET /user/{username}`: read, read-only, idempotent

> Get user by user name

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `username` | path | yes | string | The name that needs to be fetched. Use user1 for testing. |

Returns `User` with `email`, `firstName`, `id`, `lastName`, `password`, `phone`, `userStatus`, `username`.

## `updateUser`

`PUT /user/{username}`: update, idempotent

> Updated user
>
> This can only be done by the logged in user.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `username` | path | yes | string | name that need to be updated |
| `email` | body | no | string |  |
| `firstName` | body | no | string |  |
| `id` | body | no | integer (int64) |  |
| `lastName` | body | no | string |  |
| `password` | body | no | string |  |
| `phone` | body | no | string |  |
| `userStatus` | body | no | integer (int32) | User Status |
| `username` | body | no | string |  |

Returns no documented body.

## `deleteUser`

`DELETE /user/{username}`: delete, destructive (confirm first), idempotent

> Delete user
>
> This can only be done by the logged in user.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `username` | path | yes | string | The name that needs to be deleted |

Returns no documented body.

## `loginUser`

`GET /user/login`: action, read-only, idempotent

> Logs user into the system

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `username` | query | yes | string | The user name for login |
| `password` | query | yes | string | The password for login in clear text |

Returns `string`.

## `logoutUser`

`GET /user/logout`: action, read-only, idempotent

> Logs out current logged in user session

Takes no arguments.

Returns no documented body.
