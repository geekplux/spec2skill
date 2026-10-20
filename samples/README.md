# Built-in samples

These files are bundled into the app so the samples render offline, with no API key.

## `petstore-swagger2.json`

- **Source:** the public Swagger Petstore example, `https://petstore.swagger.io/v2/swagger.json` (Swagger 2.0, API version 1.0.7), downloaded 2026-10-19 (upstream SHA-256 `bb116730d391e330119c691f9b124d07b9afdea61b5a252345b577e9a4c2f98b`).
- **Licence:** Apache-2.0 (as declared in the spec's `info.license`), by the Swagger / OpenAPI Initiative contributors.
- **Modifications (trimmed to the `pet` and `user` tags):**
  - removed the `store` tag and every `/store/*` path (`/store/inventory`, `/store/order`, `/store/order/{orderId}`);
  - removed the `Order` definition;
  - changed the `user` tag's `externalDocs.description` from "Find out more about our store" to "Find out more";
  - re-indented with 2 spaces.
- Kept: 16 operations, `uploadFile` (multipart), the `api_key` and `petstore_auth` (OAuth2) security schemes.

## `tasks-openapi31.yaml`

- **Source:** hand-written for tool-atlas (OpenAPI 3.1, YAML), 2026-10-19.
- **Licence:** MIT, same as this repository.
- **What it exercises:** 21 operations over projects, tasks, comments, labels and members; cursor pagination
  (`cursor` + `limit`, `nextCursor` via an `allOf` page schema); bearer auth; path-level parameters;
  shared `components/parameters` and `components/responses`; 3.1 type arrays (`[string, 'null']`); and
  `projectId` / `assigneeId` / `authorId` / `ownerId` fields that later phases link output-to-input.
