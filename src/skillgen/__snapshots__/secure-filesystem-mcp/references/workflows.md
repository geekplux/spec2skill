# Workflows

Chains where one call's output feeds the next call's input, strongest first (exact name matches before inferred ones). `kit/chains.mjs` exports them as `chains`, with `nextSteps(id)` and `sources(id)` for single steps. Back to [SKILL.md](../SKILL.md).

## 1. `list_allowed_directories` -> `list_directory` -> `search_files` -> `read_text_file`

`list_allowed_directories` -> `list_directory` (`listed path`) -> `search_files` (`listed path`) -> `read_text_file` (`listed path`)

## 2. `list_allowed_directories` -> `list_directory_with_sizes` -> `search_files` -> `read_media_file`

`list_allowed_directories` -> `list_directory_with_sizes` (`listed path`) -> `search_files` (`listed path`) -> `read_media_file` (`listed path`)

## 3. `list_allowed_directories` -> `search_files` -> `list_directory` -> `directory_tree`

`list_allowed_directories` -> `search_files` (`listed path`) -> `list_directory` (`listed path`) -> `directory_tree` (`listed path`)

## 4. `list_directory` -> `list_directory_with_sizes` -> `search_files` -> `get_file_info`

`list_directory` -> `list_directory_with_sizes` (`listed path`) -> `search_files` (`listed path`) -> `get_file_info` (`listed path`)

## 5. `list_directory_with_sizes` -> `list_directory` -> `search_files` -> `edit_file`

`list_directory_with_sizes` -> `list_directory` (`listed path`) -> `search_files` (`listed path`) -> `edit_file` (`listed path`)

