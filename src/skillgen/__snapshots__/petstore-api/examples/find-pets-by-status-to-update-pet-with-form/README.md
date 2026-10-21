# Example: `findPetsByStatus` -> `updatePetWithForm`

`findPetsByStatus` -> `updatePetWithForm` (`id -> petId`). Back to [SKILL.md](../../SKILL.md).

```sh
node examples/find-pets-by-status-to-update-pet-with-form/run.mjs          # dry run: writes examples/find-pets-by-status-to-update-pet-with-form/plan.json, calls nothing
PETSTORE_API_TOKEN=... PETSTORE_API_BASE_URL=<optional> node examples/find-pets-by-status-to-update-pet-with-form/run.mjs --live   # makes the calls
```

Add `--set name=value` for an argument the chain does not fill and `--yes` to allow a destructive step (ask the user first).
`plan.json` lists each step: the request (credentials shown as REDACTED), its placeholder arguments and `fedBy`, the earlier output each fed argument comes from.

Generated for Swagger Petstore by spec2skill.
