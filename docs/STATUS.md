STATE: IN-PROGRESS

# Status

- Current phase: 20 (phase-20-launch-kit), starting; Speed mode active
- Plan: docs/PLAN.md (21 phases)
- Blockers: none

| Phase | Branch | PR | State | Verify rounds |
|---|---|---|---|---|
| 1 | phase-1-toolchain | [#1](https://github.com/geekplux/spec2skill/pull/1) | PR open (verified PASS) | 1 |
| 2 | phase-2-openapi3-model | [#2](https://github.com/geekplux/spec2skill/pull/2) | PR open (verified PASS) | 1 |
| 3 | phase-3-swagger2-mcp | [#4](https://github.com/geekplux/spec2skill/pull/4) | PR open (verified PASS) | 2 |
| 4 | phase-4-relationships | [#5](https://github.com/geekplux/spec2skill/pull/5) | PR open (verified PASS) | 1 |
| 5 | phase-5-design-system | [#6](https://github.com/geekplux/spec2skill/pull/6) | PR open (verified PASS, a11y PASS) | 1 |
| 6 | phase-6-layout-map | [#7](https://github.com/geekplux/spec2skill/pull/7) | PR open (verified PASS, a11y PASS) | 2 |
| 7 | phase-7-keyboard-detail | [#8](https://github.com/geekplux/spec2skill/pull/8) | PR open (verified PASS, a11y PASS) | 2 |
| 8 | phase-8-rename-spec2skill | [#9](https://github.com/geekplux/spec2skill/pull/9) | PR open (verified PASS, a11y PASS) | 1 |
| 9 | phase-9-skillgen-core | [#10](https://github.com/geekplux/spec2skill/pull/10) | PR open (verified PASS) | 1 |
| 10 | phase-10-skillgen-audit | [#11](https://github.com/geekplux/spec2skill/pull/11) | PR open (verified PASS) | 2 |
| 11 | phase-11-skill-first-view | [#12](https://github.com/geekplux/spec2skill/pull/12) | PR open (verified PASS, a11y PASS) | 1 |
| 12 | phase-12-search-list | [#13](https://github.com/geekplux/spec2skill/pull/13) | PR open (verified PASS, a11y PASS) | 3 |
| 13 | phase-13-scale-polish | [#14](https://github.com/geekplux/spec2skill/pull/14) | PR open (verified PASS, a11y PASS) | 1 |
| 14 | phase-14-worker-proxy | [#15](https://github.com/geekplux/spec2skill/pull/15) | PR open (verified PASS) | 2 |
| 15 | phase-15-source-input | [#16](https://github.com/geekplux/spec2skill/pull/16) | PR open (verified PASS, a11y PASS) | 1 |
| 16 | phase-16-cli | [#17](https://github.com/geekplux/spec2skill/pull/17) | PR open (verified PASS) | 1 |
| 17 | phase-17-lean-ai | [#18](https://github.com/geekplux/spec2skill/pull/18) | PR open (verified PASS) | 2 |
| 18 | phase-18-calm-polish | [#19](https://github.com/geekplux/spec2skill/pull/19) | PR open (verified PASS, a11y PASS + calm sign-off) | 1 |
| 19 | phase-19-oss-packaging | [#20](https://github.com/geekplux/spec2skill/pull/20) | PR open (review PASS) | 2 |
| 20 | phase-20-launch-kit | - | in progress | 0 |

## Follow-ups
- Move ci/github-workflow.yml to .github/workflows/ (needs workflow scope).
- Phase 18 calm polish: one accent per view (Generate skill vs Download .zip), raw backticks in the not-a-spec error, empty-spec view focal point and install hint, migrate older views to --calm-* tokens.
- Large specs: allow collapsing an expanded cluster again; name the source on stacked bundle labels.
- Before any npm publish: give the CLI package its own engines range (CLI targets Node 20; repo toolchain needs 22).
- AI hardening: NFKC-normalise before injection checks; widen override patterns; `rm --recursive --force`.
- Phase 20 polish: DESIGN.md token name, "1 relationships", Options label gap, 390 audit wrap, fade non-focused map edges, flaky audit.test.mjs under load.
- Maintainer: add a contact method in CODE_OF_CONDUCT.md; phase-12 mobile focus-after-/ timing race.

Last updated: 2026-10-22 01:36 UTC (phase 19 PR opened)
