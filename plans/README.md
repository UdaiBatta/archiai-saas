# Improvement plans

Written 2026-10-06 against commit `8c0837e` (main) by an advisor audit (editor-first usability + dev workflow, light pass). Each plan is self-contained; executors update the Status column.

## Order

| # | Plan | Area | Effort | Depends on | Status |
|---|------|------|--------|------------|--------|
| 003 | [Stop stale `vite.config.js` / ignore local artefacts](003-stop-stale-build-artefacts.md) | DX | S | — | TODO |
| 001 | [Room use picker for hand-placed rooms](001-room-use-picker.md) | Usability | M | — | TODO |
| 002 | [Explain problems in place; fix misleading "Create a 3D model" CTA](002-explain-problems-in-place.md) | Usability | S–M | 001 (soft) | TODO |
| 004 | [One-command local dev start/stop/status](004-one-command-dev-start.md) | DX | S–M | 003 (soft) | TODO |

003 first because it is tiny and removes a silent "old config" trap that 004's script would otherwise inherit. 001 before 002 because 002's help text sends users to the room-use picker.

## Findings not planned (yet)

- Docs describe the old brief-first product (`CLAUDE.md:8-33`, `docs/ARCHITECTURE.md:3-10,87`, README product/API sections); ARCHITECTURE says migration head `016` (actual `017`). Effort S. Plan 004 fixes only the run/migration sections.
- CI never runs `alembic upgrade/downgrade` against Postgres; no lint/format tooling; no browser e2e of the editor-first loop. Effort M each.
- 17 non-test source files exceed the repo's ~400-line rule (largest: `layout_engine/engine.py` 1517, `store/canvasStore.ts` 1333, `pages/Project/index.tsx` 984). Effort L; split only alongside feature work.
- The only seed/demo script is brief-first (`backend/scripts/seed_workflow_demo.py`); no editor-first demo project.

## Considered and rejected

- "Vite config files differ": verified on 2026-10-06 that `vite.config.js` and `vite.config.ts` are currently equivalent; the finding is the *latent* shadowing risk (plan 003), not a present bug.
