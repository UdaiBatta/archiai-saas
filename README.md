# ArchiAI

**Design it. We check it.**

ArchiAI is a browser-based planning tool for early-stage residential design. You set out a plot, draw the site and massing, plan every floor room by room, and export DXF and IFC files that open in AutoCAD and Revit. Every rule is checked as you work. AI is there when you ask for it: it reviews a plan, explains a rule or suggests a change. You keep control, though: the assistant doesn't produce the plan for you, and nothing it suggests moves until you preview and apply it.

> ArchiAI started as "describe a space in plain language, get a 3D layout". The product is now **editor-first**: a new project opens on its plot, and you draw the rooms yourself. Generating a whole plan from a written brief is still available (**Edit ▸ Edit brief…**), as one option among others rather than the way in.

## How It Works

```
plot ──► site + massing ──► draw rooms (Top plan or 3D) ──► walls, doors, windows build themselves
                                      │                                   │
                                      │                     /api/validate: rules checked on every edit
                                      ▼
                  furniture & details ──► versions, options, comments ──► DXF · IFC · GLB · OBJ · SVG · PDF
```

1. **Set out the plot.** *New project* asks for a name, the plot size and the road (entrance) side, then opens the editor on an empty plot.
2. **Site and massing** (optional). Draw the site boundary, or import it from GeoJSON or DXF. Set its rules (setbacks, height, coverage, FAR) and pull in neighbouring buildings from OpenStreetMap. Push masses, give each floor a use, fill a mass with flats and see the yield, and compare design options side by side.
3. **Plan the rooms.** Add rooms and drag, resize or reshape them, in the Top plan or in 3D:
   - Shape a room with up to 12 points: drag an edge's midpoint to add a point, drag a point to move it, double-click it to remove it.
   - Choose how any two rooms meet (**Wall**, **Door** or **Open**), and slide a door along its wall.
   - Walls, doors and windows are *derived* from the rooms. They rebuild after every edit, and your choices about how rooms meet carry through.
   - Drag or type the plot's width and depth on the plot boundary.
4. **Checked as you draw.** After each edit the server re-derives the geometry and returns a quality report. It flags:
   - overlapping rooms, rooms outside the plot, and rooms below their minimum size
   - unreachable rooms, and rooms reachable only through a bedroom
   - a broken "must connect" from the brief
   - a balcony, terrace or front door with no outside wall

   Rooms with a problem are highlighted, and the **Zoning** and **Room Graph** lenses show how each zone is entered and how you walk from the entrance to every room.
5. **Furniture & details.** The model stage shows the white model with real walls and openings. Furnish rooms automatically or place pieces by hand, and check clearances.
6. **Study.** Sun position and shadows at any time of day, a sun-hours analysis, and saved camera views.
7. **Save, share, hand off.** Auto-save, named versions, design options, comments pinned to the model, read-only share links, and exports for CAD and BIM.

### The editor

- **One plan, both views.** The Top plan and the 3D views (Perspective, Axonometric) are the same drawing in the same look:
  - a dark ground
  - each room a see-through volume in its room type's colour
  - a thin border between neighbouring rooms
  - furniture visible inside the rooms

  The same handles edit a room in either view.
- **Switching views is one motion.** Going between 3D and Top swings the camera over the plan while the rooms lift apart and settle back. It takes under two seconds and is skipped if your system asks for reduced motion.
- **Multi-storey.** Add floors above or below; every storey shares the plot. Other floors can be ghosted for context.
- **Undo everything.** Every edit, including an applied AI suggestion, is one step in the history.

## How AI Is Used

AI is optional and narrowly scoped. The plan geometry is always produced by deterministic code.

| Where | What the model does | What stays deterministic |
|---|---|---|
| **Assistant** (AI tool in the editor) | Turns an instruction such as "make the kitchen brighter" into a short list of plan-edit commands, or answers a question about the plan | Applying the commands, re-deriving walls and doors, and re-checking every rule. You see a preview with the quality result and choose **Apply** or **Discard**. |
| **Edit ▸ Edit brief…** | Turns a written brief into structured requirements (rooms, adjacencies, plot, facing) | The layout engine. It lays out the plan with archetype bands and subdivision, picks the best of 64 candidates, and returns only plans that pass every hard rule. |

Both features run through any OpenAI-compatible provider: a local model in LM Studio by default, or a hosted one (AWS Bedrock, Groq, Gemini, OpenRouter) by setting `LLM_API_KEY`. Without a provider the editor works fully, and brief extraction falls back to built-in parsing rules. See [AI Provider](#ai-provider).

Exports are concept-stage handoffs. The DXF and IFC files open in AutoCAD, Revit and similar tools, but they are not construction documents or a complete BIM model, and the design checks are not regulatory certification. See [Export And Share Behavior](#export-and-share-behavior).

## Features At A Glance

- Accounts with JWT authentication; personal and workspace projects with team members and roles.
- Plot-first new projects. A plan can also be generated from a brief, and the engine offers alternative layouts as options.
- Room editing in Top and 3D: add, move, resize, shape (up to 12 points), duplicate, delete, connect (wall, door or open).
- Plot boundary with draggable and typed dimensions.
- Live rule checking, a quality score, highlighted problem rooms, and the Zoning and Room Graph lenses.
- Site, zoning rules, massing, floor uses, housing fill, OpenStreetMap surroundings, and option comparison.
- Sun and shadow study, sun-hours analysis, saved views.
- Furniture: automatic furnishing and hand-placed pieces.
- Auto-save drafts, named versions, revision-safe saving across tabs (see [Saving And Conflicts](#saving-and-conflicts)).
- Comments pinned to the model; revocable read-only share links.
- Export: PNG, PDF summary, DXF (AutoCAD), IFC4 (Revit / BIM), GLB, OBJ, SVG.
- Plans and quotas: the free Starter plan allows 3 projects. Paid plans are not on sale yet.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router, Zustand, React Three Fiber (three.js, drei) |
| Backend | Python 3.11+, FastAPI, SQLAlchemy async, Alembic, Pydantic v2, shapely |
| Database | PostgreSQL 16 (tests use in-memory SQLite) |
| Auth | JWT (HS256), bcrypt |
| Testing | Pytest, Vitest, React Testing Library, Playwright |
| Development | Docker and Docker Compose, or `scripts/dev.ps1` on Windows |

Architecture and data flow: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). What is next: [docs/ROADMAP.md](docs/ROADMAP.md). Rules for contributors and AI agents: [CLAUDE.md](CLAUDE.md).

## Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL 16, or Docker Desktop with Docker Compose and the WSL 2 backend
- Git
- Optional, for the assistant and brief extraction, either:
  - a hosted provider API key (AWS Bedrock, Groq, Gemini or OpenRouter); see [AI Provider](#ai-provider)
  - LM Studio with `qwen/qwen3.5-9b` loaded locally

## Environment Setup

Copy the documented example and replace all placeholder credentials:

```powershell
Copy-Item .env.example .env
```

| Variable | Purpose |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Database credentials (Docker Compose creates the database) |
| `DATABASE_URL` | `postgresql+asyncpg://user:password@db:5432/dbname` (use `localhost` outside Docker) |
| `SECRET_KEY` | Long random string for signing JWTs |
| `ENV`, `ALLOWED_ORIGINS` | Environment name and the CORS origins allowed with credentials; production adds security headers |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_TIMEOUT_S`, `LLM_REASONING_EFFORT` | AI provider (optional) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Payments; leave blank until paid plans launch |
| `VITE_API_URL` | Where the frontend finds the API, normally `http://localhost:8000` |

Never commit `.env` or real credentials. Keep Jev's `TYPESAFE_API_KEY` in `backend/.env` for local project tooling, and export it into the process environment when running Jev directly.

## Run Locally

### Quick start (Windows)

One-time setup:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item ..\.env.example .env   # then fill in DATABASE_URL and SECRET_KEY
cd ..\frontend
npm ci
```

Then, from the repository root, start (or restart) everything:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1
```

What the script does:
- Stops any previous backend and frontend. A leftover reload worker otherwise keeps serving old code.
- Runs migrations.
- Opens the backend (http://localhost:8000) and the frontend (http://localhost:5173) in their own windows.

`-Action status` and `-Action stop` check or stop them. To let it start a local Postgres too, set `ARCHIAI_PGDATA` (see [scripts/README.md](scripts/README.md)). The steps below do the same by hand.

### 1. Start PostgreSQL

Use an existing local PostgreSQL server on `localhost:5432`, or start only the Docker database:

```powershell
docker compose up -d db
```

The committed `docker-compose.override.yml` publishes the Docker database on host port `5433` to avoid conflicting with a local PostgreSQL installation. If the backend runs on your host while using the Docker database, set:

```dotenv
DATABASE_URL=postgresql+asyncpg://your_postgres_user:your_postgres_password@localhost:5433/your_database_name
```

### 2. Start the backend with Uvicorn

From the repository root:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item ..\.env.example .env
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Verify:

- Health: http://localhost:8000/api/health
- API docs: http://localhost:8000/docs

When `backend/.env` contains a Docker hostname such as `@db:5432` but `db` is not resolvable, local settings fall back to `@localhost:5432`. Use an explicit `localhost:5433` URL when connecting a host-run backend to the Docker database.

### 3. Start the frontend

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173, register, and choose **New project**.

## AI Provider

The assistant and brief extraction run through any OpenAI-compatible chat-completions endpoint. Pick one by editing `.env`; no code changes are needed:

| Provider | LLM_BASE_URL | LLM_MODEL example | Cost |
|---|---|---|---|
| LM Studio (default, local) | `http://localhost:1234/v1` | *(blank, auto-detected)* | Free, uses your GPU |
| AWS Bedrock | `https://bedrock-runtime.<region>.amazonaws.com/openai/v1` | `amazon.nova-micro-v1:0` | Pay per token (fractions of a cent per request) |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | Free tier (~1k requests/day) |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.6-flash` | Free tier |
| OpenRouter | `https://openrouter.ai/api/v1` | `meta-llama/llama-3.3-70b-instruct` | Free models / pay per token |

Set `LLM_API_KEY` to the provider's bearer key and restart the backend.
- With a key set and `LLM_MODEL` explicit, the backend skips local-model discovery and allows concurrent requests.
- Bedrock API keys come from the AWS Bedrock console. Short- and long-term bearer keys both work; no SigV4 signing is needed.
- For Gemini also set `LLM_REASONING_EFFORT=none`. Its default thinking otherwise uses up the output budget, and the JSON arrives cut off.

The plan geometry never calls the provider.

## Run Everything With Docker Compose

### Windows startup checklist

Docker Compose starts ArchiAI's database, backend and frontend. LM Studio, if you use it, runs separately on the Windows host so it can use the GPU directly. If you configured a hosted provider with `LLM_API_KEY`, or don't need AI, skip the LM Studio steps.

1. Start **Docker Desktop** from the Windows Start menu. Keep the WSL 2 engine enabled and wait until Docker Desktop reports that the engine is running.

2. Confirm that the Docker daemon and Compose are available:

```powershell
docker version
docker info
docker compose version
```

`docker compose ps` only reports container status; it does not start the application.

3. Optional: start **LM Studio** and load `qwen/qwen3.5-9b`. The Q4_K_M quantization is suitable for an 8 GB RTX 4060. Set the context length to `4096` and use maximum GPU offload. In LM Studio's Developer/Local Server screen:

   - use port `1234`;
   - enable **Serve on Local Network** so Docker can reach the host;
   - start the local server and keep LM Studio open.

   Verify it from PowerShell; the response should list `qwen/qwen3.5-9b`:

```powershell
Invoke-RestMethod http://127.0.0.1:1234/v1/models | ConvertTo-Json -Depth 4
```

4. From the repository root, create `.env` once, replace its placeholder database credentials and `SECRET_KEY`, then start the stack:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose config
docker compose up -d --build
```

Compose starts PostgreSQL, runs Alembic migrations, starts Uvicorn on port `8000`, and starts Vite on port `5173`. The first build can take several minutes.

5. Check container and application health:

```powershell
docker compose ps
Invoke-RestMethod http://localhost:8000/api/health
```

The health response should contain `"db": "ok"`, and `"llm": "ok"` when a provider is configured. The app is then available at http://localhost:5173 and the API documentation at http://localhost:8000/docs.

Useful commands:

```powershell
docker compose ps
docker compose logs -f backend frontend
docker compose exec backend alembic current
docker compose restart backend frontend
docker compose down
```

The frontend container runs the Vite development server. A production deployment should serve the `npm run build` output through a production web server, and provide HTTPS, secure secrets, database backups and deployment-specific CORS configuration.

## Database Migrations

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic heads
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic upgrade head
```

The current head is `018` (design revisions for conflict-safe saving).

## Run Checks

All three suites run in CI (backend pytest, frontend tests and build, end-to-end) and must stay green.

Backend (any `DATABASE_URL` and `SECRET_KEY` values work; the tests use SQLite):

```powershell
cd backend
pytest
```

On Python 3.14 (the project targets 3.11), pytest can print its result and then hang on interpreter exit. Wrap local runs in a timeout; CI is unaffected.

Frontend:

```powershell
cd frontend
npx tsc --noEmit
npx vitest run
npm run build
npm audit --omit=dev
```

End-to-end (Playwright) tests drive the real frontend, backend and a real PostgreSQL database in a browser. They cover:
- opening a plan
- editing, autosave and reload
- undo and redo
- door and wall editing
- the assistant's preview and apply
- revision conflicts between two tabs
- every export format

Only the LLM is replaced, by a small fake server (`frontend/e2e/fake-llm.mjs`), so runs are deterministic and cost nothing. The app starts on its own ports (frontend 5175, backend 8001), so your dev stack can keep running.

```powershell
# a throwaway database used only by these tests
$env:E2E_DATABASE_URL = "postgresql+asyncpg://USER:PASSWORD@localhost:5432/archiai_e2e"
# python with backend/requirements.txt installed (default: python)
$env:E2E_PYTHON = "backend\.venv\Scripts\python.exe"
# optional: use an installed browser instead of Playwright's Chromium
$env:E2E_CHANNEL = "chrome"
cd frontend
npx playwright install chromium   # once, unless E2E_CHANNEL is set
npm run test:e2e
```

Docker:

```powershell
docker compose config
docker compose build backend frontend
```

## Saving And Conflicts

Every write to a design bumps the design's `revision`: a named save, an autosave draft, or a generated plan. The editor loads a design with its revision and sends it back as `baseRevision` on each save. The check and the write are one atomic database update, so of two simultaneous saves exactly one wins.

If the design changed since the editor loaded it (in another tab, or by a collaborator), the save is refused with HTTP 409 (`code: REVISION_CONFLICT`, with `currentRevision`) and nothing is written. The editor keeps your edits on screen, stops autosaving over the newer copy, and offers three choices:

- **Compare**: what differs between this tab and the saved copy.
- **Save as new version**: saves this tab's copy as a new named version on top of the current revision. The other copy stays in the version history.
- **Reload**: takes the saved copy and drops this tab's edits (asks first).

A request without `baseRevision` is an unconditional write, used by older clients and server-side generation. It still bumps the revision, so open editors find out that something changed. Conflicts are detected per design: regenerating a project's plan in one tab creates a new design, which another tab's saves do not see.

## Export And Share Behavior

- PNG and PDF files are generated in the browser and downloaded locally.
- DXF, IFC, GLB, OBJ and SVG files are generated by the backend from the plan currently in the editor (including unsaved edits) and downloaded. Each export needs a plan, and exports are rate limited to 20 per minute.
- The backend records an export audit entry for every export, but does not store the generated files.
- PDF export is a lightweight project summary containing the current canvas image and the available layout metadata.

| Format | Opens in | Contents |
|---|---|---|
| PNG | any image viewer | the current canvas image |
| PDF | any PDF viewer | the canvas image plus layout metadata (a summary, not a drawing set) |
| DXF | AutoCAD, BricsCAD, DraftSight, LibreCAD, Revit (as a link) | AutoCAD 2013 format in millimetres, one drawing per storey side by side, AIA layers (`A-WALL`, `A-DOOR`, `A-GLAZ`, `A-AREA-IDEN`, `A-ANNO-TITL`, `C-PROP-LINE`) |
| IFC | Revit, ArchiCAD, Vectorworks, Allplan, BricsCAD BIM | IFC4 in metres: project > site > building > one storey per floor, walls with openings cut through them, doors and windows, rooms as spaces with name and net floor area, floor slabs |
| GLB | 3D viewers, Blender, game engines | the 3D model in one file |
| OBJ | most 3D tools | the 3D model as a zip |
| SVG | browsers, Illustrator, Inkscape | the plan as a vector drawing |

Limits: these are concept-stage exports. Dimensions, schedules and sections are not exported, and the DXF and IFC files have not yet been checked by reopening them in an independent reader.

Share links:
- Share links use possession-based public tokens and expose only the project title, description and latest saved layout.
- Public links never expose drafts, versions, activity, users, workspace membership or editor controls.
- Revoking a link makes the public token unavailable.

Treat share links as sensitive. Passwords, expiry dates, link analytics and cloud file storage are not supported yet.

## API Highlights

All routes are under `/api`. Interactive documentation is at http://localhost:8000/docs.

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | Register or log in and receive a JWT |
| POST | `/api/auth/refresh`, `/api/auth/logout` | Refresh or end a session |
| GET / PATCH | `/api/auth/me` | Load or update the current user |
| POST / GET | `/api/projects`, `/api/projects/{id}` | Create, list and load projects |
| POST | `/api/projects/{id}/duplicate` | Duplicate a project |
| POST | `/api/projects/{id}/versions` | Save a plan as a new version (used by *New project* for the empty plot) |
| POST | `/api/validate` | Re-derive walls, doors and windows for an edited plan and return the quality report |
| POST | `/api/assistant/plan-edits` | Assistant: an instruction or a question about the plan, returned as previewable edit commands or an answer |
| POST | `/api/extract` | Brief text to structured requirements (LLM, with rule fallback) |
| POST | `/api/generate` | Generate and save a plan from requirements |
| POST | `/api/options` | Alternative layouts for the same requirements |
| POST | `/api/furnish` | Furniture proxies for the rooms of a plan |
| POST | `/api/housing/fill` | Fill a mass with flats and report the yield |
| POST / GET | `/api/site/import-dxf`, `/api/site/context` | Import a site boundary from DXF; surrounding buildings from OpenStreetMap |
| PUT | `/api/design/{id}` | Manual save that creates a named version (`baseRevision`; 409 if stale) |
| PUT / GET | `/api/design/{id}/draft` | Save or load the separate auto-save draft (`baseRevision`; 409 if stale) |
| GET | `/api/projects/{id}/versions`, `/api/design/version/{version_id}` | Version history |
| GET / POST / PATCH / DELETE | `/api/projects/{id}/comments` | Comments pinned to the model |
| POST | `/api/projects/{id}/export/{format}` | Download the posted plan as `dxf`, `ifc`, `glb`, `obj` or `svg` |
| POST | `/api/projects/{id}/export/image`, `/api/projects/{id}/export/pdf` | Record a browser-side export |
| POST / DELETE | `/api/projects/{id}/share`, `/api/projects/{id}/share/{share_id}` | Create or revoke a read-only share link |
| GET | `/api/share/{token}` | Public latest-saved-layout response |
| GET / POST | `/api/workspaces`, `/api/workspaces/{id}/members` | Workspaces and team members |
| GET | `/api/billing/plans`, `/api/billing/subscription` | Plans and the current subscription |

Authenticated errors use:

```json
{ "error": "Human-readable message", "code": "MACHINE_CODE", "status": 404 }
```

## Common Troubleshooting

**Docker reports `dockerDesktopLinuxEngine` or cannot connect to the Docker API**

- Docker Desktop is not running, or its WSL 2 engine did not start. Open Docker Desktop and wait for the engine-running status before retrying Compose.
- Run `docker info`. If it cannot connect, Compose cannot start any ArchiAI container.
- If Docker Desktop is open but the named-pipe error remains, run `wsl --shutdown`, fully quit Docker Desktop, reopen it, and wait for the engine to start.
- Then retry `docker compose up -d --build` followed by `docker compose ps`.

**`scripts/dev.ps1` says "Migrations failed … the database system is starting up"**

- Postgres is replaying its log after an unclean shutdown (a restart or sleep while it was running).
- Wait until `pg_isready -h 127.0.0.1 -p <port>` reports "accepting connections", then run the script again.

**Backend health reports `"llm": "unreachable"`**

- The editor still works; only the assistant and brief extraction need a provider.
- Local mode: confirm LM Studio is open and `qwen/qwen3.5-9b` is loaded.
- Hosted mode: confirm `LLM_API_KEY` (and `LLM_BASE_URL`/`LLM_MODEL`) are set correctly in `.env`.
- Confirm the local server is running on port `1234` with **Serve on Local Network** enabled, and that `Invoke-RestMethod http://127.0.0.1:1234/v1/models` works on the host.
- Compose uses `http://host.docker.internal:1234/v1` for the backend automatically; do not change that container address to `localhost`.

**Frontend says the server is unavailable**

- Confirm http://localhost:8000/api/health responds.
- Confirm `VITE_API_URL=http://localhost:8000`.
- Restart Vite after changing frontend environment variables.

**Backend cannot connect to PostgreSQL**

- Run `alembic current` to verify connectivity.
- Use port `5432` for a normal local PostgreSQL server.
- Use port `5433` when a host-run backend connects to the Docker database through the committed override.
- Use hostname `db:5432` only inside Docker Compose.

**The 3D or Top view looks wrong after updating the code**

- Hard-reload the editor tab (Ctrl+Shift+R). A tab left open across code reloads can keep old view state.

**A public share does not show recent edits**

- Share links expose the latest manually saved layout, not the auto-save draft.
- Click **Save Layout**, then reload the public link.

**Canvas export fails**

- Wait until the 3D canvas has rendered.
- Cross-origin assets added in the future must permit canvas export.

## Contribution Workflow

- Never push directly to `main`; create a focused feature branch and open a pull request.
- Write tests before or alongside the implementation, and keep all three suites green.
- Keep frontend, backend, generation and logging concerns separate.
- There is one geometry contract (`backend/app/schemas/layout_plan.py`) and one engine. Walls and doors are derived from rooms, never hand-maintained.
- A change that replaces something deletes the old thing in the same change.
- Schema changes to database models need an Alembic migration with a working downgrade.
- Run the relevant checks before each commit and use a clear commit message.

See [CLAUDE.md](CLAUDE.md) for the full rules.

## License

Copyright (c) 2026 Udai Batta & Samarth Chatli. All rights reserved.

This project is proprietary software. See [LICENSE](LICENSE) for full terms. Unauthorized use, copying, or distribution is prohibited.
