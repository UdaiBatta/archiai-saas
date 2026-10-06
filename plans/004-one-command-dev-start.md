# 004 — One command to start (and restart) the local stack, plus a status check

- **Written against:** commit `8c0837e` (main).
- **Effort:** S–M · **Risk:** low · **Priority:** 4 · **Depends on:** nothing (003 is nice to land first, since it removes the `vite.config.js` shadow that this script would otherwise silently use).

## Why

Starting the app locally today means typing three long commands by hand, in the right order, on Windows:
- Postgres via `pg_ctl` with a data dir and port;
- the backend via `.venv\Scripts\python -m uvicorn app.main:app --port 8000 --reload --reload-dir app`, with shell env vars **unset** so `backend/.env` wins (`backend/app/config/settings.py:69` reads `.env`, but real env vars override it);
- the frontend via `npx vite --port 5173 --strictPort` with `VITE_API_URL` set.

Observed failures this caused:
- A uvicorn `--reload` worker from a previous run kept holding port 8000 and **served old code** (new routes 404'd) until the stray processes were killed by hand.
- Servers started from a terminal or agent session **died when that session ended**. Twice a "running" app was found with the database and backend down.

There is no Makefile, root `package.json`, `scripts/` folder or launch config (verified). `docker-compose.yml` exists but bind-mounts `./backend` with `--reload`, which has the same Windows reload issue, and requires Docker Desktop.

## Current state (verified)

- `frontend/package.json` scripts: `dev`, `build`, `preview`, `test` only.
- `README.md` "## Run Locally" (line ~67) documents Docker Compose. Its native-Python instructions use a hard-coded `..\.venv311\Scripts\python.exe` (README ~lines 195–199) and say "Sprint 12 adds migration `011`" (the head is now `017`).
- Backend venv lives at `backend/.venv` (gitignored).
- The backend reads `backend/.env` (gitignored). The script must **never print or copy** its contents.

## Scope

In scope: new `scripts/dev.ps1` (repo root), new `scripts/README.md` (5–10 lines), the "Run Locally" and "Database Migrations" sections of `README.md`, one line in `CLAUDE.md` pointing to the script.
Out of scope: `docker-compose.yml`, CI, backend/frontend source code, `backend/.env`.

## Design (implement exactly this; no extra options)

`scripts/dev.ps1` with a single `-Action` parameter: `start` (default), `stop`, `status`.

- **Common:** `$Root = Split-Path -Parent $PSScriptRoot`. Paths: `$Backend = Join-Path $Root 'backend'`, `$Frontend = Join-Path $Root 'frontend'`, `$Py = Join-Path $Backend '.venv\Scripts\python.exe'`.
- **Postgres (optional):** if env var `ARCHIAI_PGDATA` is set, run `pg_ctl status -D $env:ARCHIAI_PGDATA`; if not running, start it **detached** with `Start-Process pg_ctl -ArgumentList '-D',$env:ARCHIAI_PGDATA,'-l',(Join-Path $env:ARCHIAI_PGDATA 'server.log'),'start' -WindowStyle Hidden` (port comes from the data dir's own config or `ARCHIAI_PGPORT` passed as `-o "-p <port>"` when set). If `pg_ctl` is not on PATH and `ARCHIAI_PGBIN` is set, use `Join-Path $env:ARCHIAI_PGBIN 'pg_ctl.exe'`. If `ARCHIAI_PGDATA` is unset, print "Using the database in backend/.env (start it yourself or via docker compose up db)" and continue.
- **stop:** kill every `python.exe` whose command line contains `uvicorn app.main` **or** whose parent is one of those (the `multiprocessing.spawn` reload workers). Use `Get-CimInstance Win32_Process` and match on `ParentProcessId`. Then kill whatever listens on 5173 (`Get-NetTCPConnection -LocalPort 5173 -State Listen`). Do not touch Postgres on stop.
- **start:** first run the `stop` logic (this is what prevents a stale worker serving old code). Then:
  - run migrations once, synchronously: `& $Py -m alembic upgrade head` in `$Backend`. If it fails, print the error and exit 1.
  - start the backend **detached**: `Start-Process powershell -WindowStyle Minimized -ArgumentList '-NoExit','-Command', <cmd>`, where `<cmd>` does `Set-Location $Backend`, clears `DATABASE_URL, SECRET_KEY, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_TIMEOUT_S, LLM_REASONING_EFFORT` with `[Environment]::SetEnvironmentVariable($n, $null, 'Process')`, then runs `& '<Py>' -m uvicorn app.main:app --port 8000 --reload --reload-dir app`. (Clearing them makes `backend/.env` the single source; document this in the script's comment header.)
  - start the frontend **detached** the same way: `Set-Location $Frontend; $env:VITE_API_URL='http://localhost:8000'; npx vite --port 5173 --strictPort`.
  - poll up to 60 s for `http://localhost:8000/openapi.json` and `http://localhost:5173` (`Invoke-WebRequest -UseBasicParsing -TimeoutSec 2` in a loop with 2 s sleeps), then print `Backend  http://localhost:8000  OK|DOWN` and `Frontend http://localhost:5173  OK|DOWN`; exit 1 if either is DOWN.
- **status:** print the same two lines plus `Postgres running|stopped|unmanaged` without starting anything.

Use only built-in PowerShell 5.1 cmdlets (no `&&`, no `?:`), matching Windows PowerShell 5.1, the shell on the maintainer's machine.

## Steps

1. Write `scripts/dev.ps1` per the design. Verify syntax: `powershell -NoProfile -Command "$null = [scriptblock]::Create((Get-Content -Raw scripts/dev.ps1)); 'ok'"` → `ok`.
2. `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 -Action status` → prints three status lines and exits 0 (whatever the state).
3. `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1` → ends with `Backend ... OK` and `Frontend ... OK`. Then `curl -s http://localhost:8000/api/projects/x/comments` → a JSON `401` "Not authenticated" body (a 404 here means a stale worker is still serving old code: STOP and report).
4. Run step 3 a **second time** immediately → still both OK, and `Get-CimInstance Win32_Process -Filter "Name='python.exe'" | ? { $_.CommandLine -like '*uvicorn app.main*' }` shows exactly one reloader process (the previous ones were stopped).
5. `scripts/dev.ps1 -Action stop` → both URLs stop answering within 10 s.
6. Docs:
   - In `README.md` "## Run Locally", add a short "Native (Windows) quick start" subsection *above* the Docker instructions: create `backend/.venv`, `pip install -r backend/requirements.txt`, `npm ci` in `frontend/`, copy `.env.example` → `backend/.env`, optionally set `ARCHIAI_PGDATA`, then `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1`.
   - In "## Database Migrations" replace the `..\.venv311\Scripts\python.exe` paths with `.venv\Scripts\python.exe`, and replace the "Sprint 12 adds migration `011`" sentence with "The current head is `017` (comments)."
   - `CLAUDE.md`, "## Rules" section: add one bullet: "Start/restart the local stack with `scripts/dev.ps1` (`-Action status|stop`); it stops stale reload workers first."
   - `scripts/README.md`: what each action does, plus the env vars `ARCHIAI_PGDATA`, `ARCHIAI_PGPORT`, `ARCHIAI_PGBIN`.

## Done criteria

- Steps 2–5 behave as stated (record the console output in the PR description).
- `grep -n "venv311" README.md` → no matches; `grep -n "scripts/dev.ps1" README.md CLAUDE.md` → ≥1 match each.
- No change under `backend/app`, `frontend/src`, `.github/`.

## Maintenance notes

- If ports change, update the three constants at the top of the script, not inline literals.
- A macOS/Linux `scripts/dev.sh` equivalent is deliberately not included; add it when a non-Windows developer needs it.

## Escape hatches

- If `alembic upgrade head` fails against the configured database, STOP and report the error; do not edit migrations.
- Never print `backend/.env` values or the database URL; if you need to show which DB is used, print only the host and port.
