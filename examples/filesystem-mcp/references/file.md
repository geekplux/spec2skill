# File

9 tools: list, create, read, update. Back to [SKILL.md](../SKILL.md).

## `search_files`

MCP tool `search_files` · list · read-only

> Search Files
>
> Recursively search for files and directories matching a pattern. The patterns should be glob-style patterns that match paths relative to the working directory. Use pattern like '\*.ext' to match files in current directory, and '\*\*/\*.ext' to match files in all subdirectories. Returns full paths to all matching items. Great for finding files when you don't know their exact location. Only searches within allowed directories.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `excludePatterns` | argument | no | string\[\] |  |
| `path` | argument | yes | string |  |
| `pattern` | argument | yes | string |  |

Returns `object` with `content`.

Feeds: `read_file` (`listed path`, inferred), `read_text_file` (`listed path`, inferred), `read_media_file` (`listed path`, inferred), `edit_file` (`listed path`, inferred), `list_directory` (`listed path`, inferred), `list_directory_with_sizes` (`listed path`, inferred), `directory_tree` (`listed path`, inferred), `get_file_info` (`listed path`, inferred).

Fed by: `list_directory` (`listed path`, inferred), `list_directory_with_sizes` (`listed path`, inferred), `list_allowed_directories` (`listed path`, inferred).

## `write_file`

MCP tool `write_file` · create · destructive: confirm first · idempotent

> Write File
>
> Create a new file or completely overwrite an existing file with new content. Use with caution as it will overwrite existing files without warning. Handles text content with proper encoding. Only works within allowed directories.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `content` | argument | yes | string |  |
| `path` | argument | yes | string |  |

Returns `object` with `content`.

## `read_file`

MCP tool `read_file` · read · read-only · deprecated

> Read File (Deprecated)
>
> Read the complete contents of a file as text. DEPRECATED: Use read_text_file instead.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `head` | argument | no | number | If provided, returns only the first N lines of the file |
| `path` | argument | yes | string |  |
| `tail` | argument | no | number | If provided, returns only the last N lines of the file |

Returns `object` with `content`.

Fed by: `list_directory` (`listed path`, inferred), `list_directory_with_sizes` (`listed path`, inferred), `search_files` (`listed path`, inferred).

## `read_text_file`

MCP tool `read_text_file` · read · read-only

> Read Text File
>
> Read the complete contents of a file from the file system as text. Handles various text encodings and provides detailed error messages if the file cannot be read. Use this tool when you need to examine the contents of a single file. Use the 'head' parameter to read only the first N lines of a file, or the 'tail' parameter to read only the last N lines of a file. Operates on the file as text regardless of extension. Only works within allowed directories.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `head` | argument | no | number | If provided, returns only the first N lines of the file |
| `path` | argument | yes | string |  |
| `tail` | argument | no | number | If provided, returns only the last N lines of the file |

Returns `object` with `content`.

Fed by: `list_directory` (`listed path`, inferred), `list_directory_with_sizes` (`listed path`, inferred), `search_files` (`listed path`, inferred).

## `read_media_file`

MCP tool `read_media_file` · read · read-only

> Read Media File
>
> Read a file and return it as a base64-encoded content block with its MIME type. Image and audio files are returned as image/audio content; any other file type is returned as an embedded resource. Only works within allowed directories.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `path` | argument | yes | string |  |

Returns `object` with `content`.

Fed by: `list_directory` (`listed path`, inferred), `list_directory_with_sizes` (`listed path`, inferred), `search_files` (`listed path`, inferred).

## `read_multiple_files`

MCP tool `read_multiple_files` · read · read-only

> Read Multiple Files
>
> Read the contents of multiple files simultaneously. This is more efficient than reading files one by one when you need to analyze or compare multiple files. Each file's content is returned with its path as a reference. Failed reads for individual files won't stop the entire operation. Only works within allowed directories.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `paths` | argument | yes | string\[\] | Array of file paths to read. Each path must be a string pointing to a valid file within allowed directories. |

Returns `object` with `content`.

## `get_file_info`

MCP tool `get_file_info` · read · read-only

> Get File Info
>
> Retrieve detailed metadata about a file or directory. Returns comprehensive information including size, creation time, last modified time, permissions, and type. This tool is perfect for understanding file characteristics without reading the actual content. Only works within allowed directories.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `path` | argument | yes | string |  |

Returns `object` with `content`.

Fed by: `list_directory` (`listed path`, inferred), `list_directory_with_sizes` (`listed path`, inferred), `search_files` (`listed path`, inferred).

## `edit_file`

MCP tool `edit_file` · update · destructive: confirm first

> Edit File
>
> Make line-based edits to a text file. Each edit replaces exact line sequences with new content. Returns a git-style diff showing the changes made. Only works within allowed directories.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `dryRun` | argument | no | boolean | Preview changes using git-style diff format |
| `edits` | argument | yes | object\[\] |  |
| `path` | argument | yes | string |  |

Returns `object` with `content`.

Fed by: `list_directory` (`listed path`, inferred), `list_directory_with_sizes` (`listed path`, inferred), `search_files` (`listed path`, inferred).

## `move_file`

MCP tool `move_file` · update · destructive: confirm first

> Move File
>
> Move or rename files and directories. Can move files between directories and rename them in a single operation. If the destination exists, the operation will fail. Works across different directories and can be used for simple renaming within the same directory. Both source and destination must be within allowed directories.

| Param | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
| `destination` | argument | yes | string |  |
| `source` | argument | yes | string |  |

Returns `object` with `content`.
