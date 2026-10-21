# Pet

8 operations: list, create, read, update, delete, action. Back to [SKILL.md](../SKILL.md).

## `findPetsByStatus`

`GET /pet/findByStatus` · list · read-only · idempotent

> Finds Pets by status
>
> Multiple status values can be provided with comma separated strings

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `status` | query | yes | string\[\] | each one of available, pending, sold. Status values that need to be considered for filter |

Returns `Pet[]` with `category`, `id`, `name`, `photoUrls`, `status`, `tags`.

Feeds: `getPetById` (`id -> petId`), `updatePetWithForm` (`id -> petId`), `deletePet` (`id -> petId`), `uploadFile` (`id -> petId`).

## `findPetsByTags`

`GET /pet/findByTags` · list · read-only · idempotent · deprecated

> Finds Pets by tags
>
> Multiple tags can be provided with comma separated strings. Use tag1, tag2, tag3 for testing.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `tags` | query | yes | string\[\] | Tags to filter by |

Returns `Pet[]` with `category`, `id`, `name`, `photoUrls`, `status`, `tags`.

Feeds: `getPetById` (`id -> petId`), `updatePetWithForm` (`id -> petId`), `deletePet` (`id -> petId`), `uploadFile` (`id -> petId`).

## `addPet`

`POST /pet` · create

> Add a new pet to the store

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `category` | body | no | Category |  |
| `id` | body | no | integer (int64) |  |
| `name` | body | yes | string |  |
| `photoUrls` | body | yes | string\[\] |  |
| `status` | body | no | string | one of available, pending, sold. pet status in the store |
| `tags` | body | no | Tag\[\] |  |

Returns no documented body.

## `getPetById`

`GET /pet/{petId}` · read · read-only · idempotent

> Find pet by ID
>
> Returns a single pet

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `petId` | path | yes | integer (int64) | ID of pet to return |

Returns `Pet` with `category`, `id`, `name`, `photoUrls`, `status`, `tags`.

Fed by: `findPetsByStatus` (`id -> petId`), `findPetsByTags` (`id -> petId`).

## `updatePet`

`PUT /pet` · update · idempotent

> Update an existing pet

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `category` | body | no | Category |  |
| `id` | body | no | integer (int64) |  |
| `name` | body | yes | string |  |
| `photoUrls` | body | yes | string\[\] |  |
| `status` | body | no | string | one of available, pending, sold. pet status in the store |
| `tags` | body | no | Tag\[\] |  |

Returns no documented body.

## `deletePet`

`DELETE /pet/{petId}` · delete · destructive: confirm first · idempotent

> Deletes a pet

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `api_key` | header | no | string |  |
| `petId` | path | yes | integer (int64) | Pet id to delete |

Returns no documented body.

Fed by: `findPetsByStatus` (`id -> petId`), `findPetsByTags` (`id -> petId`).

## `updatePetWithForm`

`POST /pet/{petId}` · action

> Updates a pet in the store with form data

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `petId` | path | yes | integer (int64) | ID of pet that needs to be updated |
| `name` | body | no | string | Updated name of the pet |
| `status` | body | no | string | Updated status of the pet |

Returns no documented body.

Fed by: `findPetsByStatus` (`id -> petId`), `findPetsByTags` (`id -> petId`).

## `uploadFile`

`POST /pet/{petId}/uploadImage` · action

> uploads an image

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `petId` | path | yes | integer (int64) | ID of pet to update |
| `additionalMetadata` | body | no | string | Additional data to pass to server |
| `file` | body | no | string (binary) | file to upload |

Returns `ApiResponse` with `code`, `message`, `type`.

Fed by: `findPetsByStatus` (`id -> petId`), `findPetsByTags` (`id -> petId`).
