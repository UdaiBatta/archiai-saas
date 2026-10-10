# scripts

`dev.ps1` starts, stops and checks the local stack (Windows PowerShell 5.1).

| Command | Does |
|---|---|
| `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1` | Stops any previous backend/frontend, runs `alembic upgrade head`, opens the backend (:8000) and frontend (:5173) in their own minimized windows, and waits until both answer. Exits 1 if either is down. |
| `... -Action status` | Prints whether the backend, frontend and Postgres are up. Starts nothing. |
| `... -Action stop` | Stops the backend (including uvicorn reload workers) and frontend. Leaves Postgres alone. |

The backend window clears `DATABASE_URL`, `SECRET_KEY` and the `LLM_*` variables so `backend/.env` is the only source of settings.

Optional, to let the script start a local Postgres with `pg_ctl`:

| Variable | Meaning |
|---|---|
| `ARCHIAI_PGDATA` | Postgres data directory; started if not running |
| `ARCHIAI_PGPORT` | Port passed as `-o "-p <port>"` |
| `ARCHIAI_PGBIN` | Folder with `pg_ctl.exe` when it is not on PATH |

Without `ARCHIAI_PGDATA` the script uses whatever database `backend/.env` points at (for example `docker compose up -d db`).
