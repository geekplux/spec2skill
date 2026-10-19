# tool-atlas

Paste an MCP server URL or an OpenAPI spec URL (or pick a sample) and get an interactive atlas of everything it can do: every tool or endpoint as a node, grouped by resource, linked by shared schemas and by which outputs can feed which inputs. One click then generates an anatomy-grade agent skill that teaches a coding agent how to use that API well.

**Status:** planning

**Stack:** React + Vite + TypeScript, Vitest, oxlint; graph layout and rendering in SVG/Canvas 2D (no decorative 3D); parsers for MCP (`tools/list` over Streamable HTTP, via a Cloudflare Worker proxy) and OpenAPI 3.x / Swagger 2 (JSON/YAML); deterministic relationship inference first, lean Workers AI only for naming groups and drafting skill prose; generated skills packaged as a downloadable zip; built-in sample specs committed.

## How this repo is built

This repository is developed by a Claude Code main agent acting as product manager, delegating to the specialist sub-agents in `.claude/agents/`. See `CLAUDE.md` for the operating manual, `docs/KICKOFF.md` for the start prompt, `docs/PLAN.md` for the plan (once written), and `docs/STATUS.md` for live progress. Work lands as a stack of pull requests, one per phase; nothing is merged without review.
