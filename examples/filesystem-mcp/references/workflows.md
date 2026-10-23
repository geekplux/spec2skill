# Workflows

Chains where one call's output feeds the next call's input, strongest first. A step marked inferred matches by meaning, not by name: check the value before you rely on it. Each step names the output field and the input it fills, so you know where every required id comes from. `kit/chains.mjs` exports them as `chains`, with `nextSteps(id)` and `sources(id)` for single steps. Back to [SKILL.md](../SKILL.md).

## 1. `list_allowed_directories` -> `search_files` -> `read_text_file` (inferred)

`list_allowed_directories` -> `search_files` (`listed path`, inferred) -> `read_text_file` (`listed path`, inferred)

## 2. `list_directory` -> `search_files` -> `read_media_file` (inferred)

`list_directory` -> `search_files` (`listed path`, inferred) -> `read_media_file` (`listed path`, inferred)

## 3. `list_directory_with_sizes` -> `search_files` -> `get_file_info` (inferred)

`list_directory_with_sizes` -> `search_files` (`listed path`, inferred) -> `get_file_info` (`listed path`, inferred)

## 4. `search_files` -> `list_directory` -> `directory_tree` (inferred)

`search_files` -> `list_directory` (`listed path`, inferred) -> `directory_tree` (`listed path`, inferred)

## 5. `list_allowed_directories` -> `list_directory` -> `search_files` (inferred)

`list_allowed_directories` -> `list_directory` (`listed path`, inferred) -> `search_files` (`listed path`, inferred)

