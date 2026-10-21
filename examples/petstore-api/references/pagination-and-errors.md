# Pagination and errors

How lists continue and calls fail. Back to [SKILL.md](../SKILL.md).

## Pagination

No operation declares pagination.

## Errors

The kit throws `ArgsError` before anything is sent: unknown operation, unknown or missing argument, wrong type, value outside the enum; the message names the operation and the argument. Report it, fix the arguments from an earlier output or the user, and never retry a 4xx with guessed arguments.

| Documented failure | Operations |
| --- | --- |
| 405 Invalid input | `addPet`, `updatePetWithForm` |
| 400 Invalid ID supplied | `updatePet`, `getPetById`, `deletePet` |
| 404 Pet not found | `updatePet`, `getPetById`, `deletePet` |
| 405 Validation exception | `updatePet` |
| 400 Invalid status value | `findPetsByStatus` |
| 400 Invalid tag value | `findPetsByTags` |
| default successful operation | `createUser`, `createUsersWithArrayInput`, `createUsersWithListInput`, `logoutUser` |
| 400 Invalid username/password supplied | `loginUser` |
| 400 Invalid username supplied | `getUserByName`, `deleteUser` |
| 404 User not found | `getUserByName`, `updateUser`, `deleteUser` |
| 400 Invalid user supplied | `updateUser` |

## Known gaps in the source spec

None reported.
