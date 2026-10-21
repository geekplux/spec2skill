# Auth

How calls authenticate. Back to [SKILL.md](../SKILL.md).

The source declares no auth. If calls are refused, ask the user how the server authenticates; never guess a credential.

No auth needed: `read_file`, `read_text_file`, `read_media_file`, `read_multiple_files`, `write_file`, `edit_file`, `create_directory`, `list_directory`, `list_directory_with_sizes`, `directory_tree`, `move_file`, `search_files`, `get_file_info`, `list_allowed_directories`.
