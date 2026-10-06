# ArchiAI — agent guide

Rules for any AI agent (Claude, Codex, …) working here. `AGENTS.md` points here;
keep this file the single source.

## What it is

Describe a space in plain language → structured requirements → a deterministic
floor plan → edit it in 2D/3D → save versions. Architecture and data flow:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). What is next: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind, Zustand, React Three Fiber, Vitest |
| Backend | Python 3.11+, FastAPI, SQLAlchemy async, Alembic, Pydantic v2, shapely, pytest |
| DB | PostgreSQL 16 (tests use in-memory SQLite) |

## One pipeline

There is exactly one generation path:

```
POST /api/extract   brief text -> RequirementsSpec     (services/extraction.py, LLM + fallback)
POST /api/generate  RequirementsSpec -> LayoutPlan     (services/layout_engine/, deterministic)
POST /api/validate  edited LayoutPlan -> walls/doors re-derived + quality report
```

`LayoutPlan` (`backend/app/schemas/layout_plan.py`) is the geometry contract.
Walls and doors are *derived* from rooms — never hand-maintained. Do not add a
second engine, a second contract, or an adapter between two of them; change the
one that exists.

## Rules

- Never commit secrets; `.env` is gitignored, document keys in `.env.example`.
- Start/restart the local stack with `scripts/dev.ps1` (`-Action status|stop`); it stops stale reload workers first.
- Never push to `main`; use a branch.
- A change that replaces something deletes the old thing in the same change.
- Tests alongside code. Both suites must stay green:
  - `cd backend && pytest` (needs `DATABASE_URL` and `SECRET_KEY` env vars; any values work, tests use SQLite)
  - `cd frontend && npx tsc --noEmit && npx vitest run`
- Schema changes to DB models need an Alembic migration with a working downgrade.
- UI colours come from the tokens in `frontend/tailwind.config.ts`; no new hex literals in components.
- Keep files small; split a module rather than growing it past ~400 lines.

## Local test note

On Python 3.14 (the project targets 3.11) pytest can print its result and then
hang on interpreter exit. Wrap local runs in `timeout`; CI is unaffected.
