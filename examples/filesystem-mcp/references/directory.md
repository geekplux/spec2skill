# Directory

5 tools: list, create, read. Back to [SKILL.md](../SKILL.md).

## `list_directory`

MCP tool `list_directory`: list, read-only

> List Directory
>
> Get a detailed listing of all files and directories in a specified path. Results clearly distinguish between files and directories with \[FILE\] and \[DIR\] prefixes. This tool is essential for understanding directory structure and finding specific files within a directory. Only works within allowed directories.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `path` | argument | yes | string |  |

Returns `object` with `content`.

Feeds: `read_file` (`listed path`, inferred), `read_text_file` (`listed path`, inferred), `read_media_file` (`listed path`, inferred), `edit_file` (`listed path`, inferred), `list_directory_with_sizes` (`listed path`, inferred), `directory_tree` (`listed path`, inferred), `search_files` (`listed path`, inferred), `get_file_info` (`listed path`, inferred).

Fed by: `list_directory_with_sizes` (`listed path`, inferred), `search_files` (`listed path`, inferred), `list_allowed_directories` (`listed path`, inferred).

## `list_directory_with_sizes`

MCP tool `list_directory_with_sizes`: list, read-only

> List Directory with Sizes
>
> Get a detailed listing of all files and directories in a specified path, including sizes. Results clearly distinguish between files and directories with \[FILE\] and \[DIR\] prefixes. This tool is useful for understanding directory structure and finding specific files within a directory. Only works within allowed directories.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `path` | argument | yes | string |  |
| `sortBy` | argument | no | string | one of name, size. Sort entries by name or size |

Returns `object` with `content`.

Feeds: `read_file` (`listed path`, inferred), `read_text_file` (`listed path`, inferred), `read_media_file` (`listed path`, inferred), `edit_file` (`listed path`, inferred), `list_directory` (`listed path`, inferred), `directory_tree` (`listed path`, inferred), `search_files` (`listed path`, inferred), `get_file_info` (`listed path`, inferred).

Fed by: `list_directory` (`listed path`, inferred), `search_files` (`listed path`, inferred), `list_allowed_directories` (`listed path`, inferred).

## `list_allowed_directories`

MCP tool `list_allowed_directories`: list, read-only

> List Allowed Directories
>
> Returns the list of directories that this server is allowed to access. Subdirectories within these allowed directories are also accessible. Use this to understand which directories and their nested paths are available before trying to access files.

Takes no arguments.

Returns `object` with `content`.

Feeds: `list_directory` (`listed path`, inferred), `list_directory_with_sizes` (`listed path`, inferred), `directory_tree` (`listed path`, inferred), `search_files` (`listed path`, inferred).

## `create_directory`

MCP tool `create_directory`: create, idempotent

> Create Directory
>
> Create a new directory or ensure a directory exists. Can create multiple nested directories in one operation. If the directory already exists, this operation will succeed silently. Perfect for setting up directory structures for projects or ensuring required paths exist. Only works within allowed directories.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `path` | argument | yes | string |  |

Returns `object` with `content`.

## `directory_tree`

MCP tool `directory_tree`: read, read-only

> Directory Tree
>
> Get a recursive tree view of files and directories as a JSON structure. Each entry includes 'name', 'type' (file/directory), and 'children' for directories. Files have no children array, while directories always have a children array (which may be empty). The output is formatted with 2-space indentation for readability. Only works within allowed directories.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `excludePatterns` | argument | no | string\[\] |  |
| `path` | argument | yes | string |  |

Returns `object` with `content`.

Fed by: `list_directory` (`listed path`, inferred), `list_directory_with_sizes` (`listed path`, inferred), `search_files` (`listed path`, inferred), `list_allowed_directories` (`listed path`, inferred).
