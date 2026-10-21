# Auth

How calls authenticate. `buildRequest` in `kit/client.mjs` reads the variables below and lists any unset one in `missingAuth` (sending a `$NAME` placeholder). Never print or commit their values. Back to [SKILL.md](../SKILL.md).

| Scheme | Type | Environment variables | Notes |
| --- | --- | --- | --- |
| `api_key` | apiKey in header as api_key | `SWAGGER_PETSTORE_API_KEY` |  |
| `petstore_auth` | oauth2 | `SWAGGER_PETSTORE_TOKEN` |  |

No auth needed: `createUser`, `createUsersWithArrayInput`, `createUsersWithListInput`, `loginUser`, `logoutUser`, `getUserByName`, `updateUser`, `deleteUser`.
