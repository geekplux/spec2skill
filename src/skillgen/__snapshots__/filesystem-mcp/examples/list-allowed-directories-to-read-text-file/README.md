# Example: `list_allowed_directories` -> `search_files` -> `read_text_file`

`list_allowed_directories` -> `search_files` (`listed path`, inferred) -> `read_text_file` (`listed path`, inferred). Back to [SKILL.md](../../SKILL.md).

```sh
node examples/list-allowed-directories-to-read-text-file/run.mjs          # dry run: writes examples/list-allowed-directories-to-read-text-file/plan.json, calls nothing
FILESYSTEM_MCP_URL=<server endpoint> node examples/list-allowed-directories-to-read-text-file/run.mjs --live   # makes the calls
```

Add `--set name=value` for an argument the chain does not fill and `--yes` to allow a destructive step (ask the user first).
`plan.json` lists each step: the `tools/call` body, its placeholder arguments and `fedBy`, the earlier output each fed argument comes from.

Generated for secure-filesystem-server by spec2skill.
