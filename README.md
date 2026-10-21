# spec2skill

**Turn any OpenAPI spec or MCP server into an agent skill in one click.**

You get a skill directory a coding agent can load (`SKILL.md`, a tested `kit/`, focused `references/`, worked `examples/`, audit `scripts/` and `evals/`), ready to download. Right beside it sits a map of every operation and how they connect, so you can see and check what the skill teaches before you hand it to your agent.

**Status:** in development. The built-in samples and the map work today; the skill generator, URL input and the deployed demo are on the way (see `docs/PLAN.md`).

## What makes the skill good

- **OpenAPI and MCP, both.** OpenAPI 3.0/3.1, Swagger 2.0 (JSON or YAML) and MCP `tools/list` responses become one model and the same kind of skill.
- **Inferred workflows.** spec2skill works out which outputs feed which inputs (`listProjects -> listTasks (projectId) -> getTask (taskId)`), plus path hierarchy and shared schemas, so the skill leads with real call chains and tells the agent what to call next.
- **Self-proving skills.** Every generated skill ships audit scripts (`node scripts/audit.mjs .` ends in `audit passed`), regression tests, at least 5 evals with concrete expected outputs, and a CI workflow.
- **The visual map.** A keyboard-operable map of every operation and relationship, with a list view as a text alternative, so you can understand the API and check the skill against it.

## How this repo is built

This repository is developed by a Claude Code main agent acting as product manager, delegating to the specialist sub-agents in `.claude/agents/`. See `CLAUDE.md` for the operating manual, `docs/KICKOFF.md` for the start prompt, `docs/PLAN.md` for the plan, and `docs/STATUS.md` for live progress. Work lands as a stack of pull requests, one per phase; nothing is merged without review.
