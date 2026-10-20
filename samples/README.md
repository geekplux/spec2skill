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
