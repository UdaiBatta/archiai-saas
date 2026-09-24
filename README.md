# ArchiAI

ArchiAI is an MVP architectural concept-layout tool. A user describes a space in plain language, receives a deterministic rule-guided 3D layout, edits it in the browser, saves versions, collaborates through workspaces, exports PNG/PDF handoffs, and shares a revocable read-only link.

The current MVP does not call paid AI APIs for generation. Brief extraction (plain language to structured requirements) runs through any OpenAI-compatible provider: by default a local model via LM Studio, or a hosted provider such as AWS Bedrock, Groq, Gemini, or OpenRouter by setting `LLM_API_KEY` in `.env`. Layout geometry, validation, sizing, zoning, and adjacency remain deterministic and retain built-in fallback rules.

## Current MVP

- Register and log in with JWT authentication.
- Create personal or workspace projects.
- Generate single-floor and multi-floor concept layouts from prompts.
- Select, drag, resize, rename, add, duplicate, and delete layout objects.
- Save named/manual versions and recover separate auto-save drafts.
- View version history and project/workspace activity.
- Export the current canvas as PNG or a basic project-summary PDF.
- Create and revoke public token-based read-only project links.

Exports are concept handoffs, not CAD/BIM or construction documents.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router, Zustand, React Three Fiber |
| Backend | Python 3.11+, FastAPI, SQLAlchemy async, Alembic, Pydantic v2 |
| Database | PostgreSQL 16 |
| Auth | JWT (HS256), bcrypt |
| Testing | Pytest, Vitest, React Testing Library |
| Development | Docker and Docker Compose |

## Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL 16, or Docker Desktop with Docker Compose and the WSL 2 backend
- For brief extraction, one of:
  - a hosted provider API key (AWS Bedrock / Groq / Gemini / OpenRouter) — see the provider table below; or
  - LM Studio with `qwen/qwen3.5-9b` loaded locally (the app also works without either, using deterministic parser fallbacks)
- Git

## Environment Setup

Copy the documented example and replace all placeholder credentials:

```powershell
Copy-Item .env.example .env
```

Required values:

```dotenv
POSTGRES_USER=your_postgres_user
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_DB=your_database_name
DATABASE_URL=postgresql+asyncpg://your_postgres_user:your_postgres_password@db:5432/your_database_name
SECRET_KEY=replace-with-a-long-random-secret
LLM_BASE_URL=http://localhost:1234/v1
LLM_TIMEOUT_S=30
LLM_MODEL=
LLM_API_KEY=
VITE_API_URL=http://localhost:8000
```

Never commit `.env` or real credentials.

## Run Locally

### 1. Start PostgreSQL

Use an existing local PostgreSQL server on `localhost:5432`, or start only the Docker database:

```powershell
docker compose up -d db
```

The committed `docker-compose.override.yml` publishes the Docker database on host port `5433` to avoid conflicting with a local PostgreSQL installation. If the backend runs on your host while using the Docker database, set:

```dotenv
DATABASE_URL=postgresql+asyncpg://your_postgres_user:your_postgres_password@localhost:5433/your_database_name
```

### 2. Start The Backend With Uvicorn

From the repository root:

```powershell
py -3.11 -m venv .venv311
.\.venv311\Scripts\python.exe -m pip install --upgrade pip
.\.venv311\Scripts\python.exe -m pip install -r backend\requirements.txt

cd backend
Copy-Item ..\.env.example .env
..\.venv311\Scripts\python.exe -m alembic upgrade head
..\.venv311\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Verify:

- Health: http://localhost:8000/api/health
- API docs: http://localhost:8000/docs

When `backend/.env` contains a Docker hostname such as `@db:5432` but `db` is not resolvable, local settings fall back to `@localhost:5432`. Use an explicit `localhost:5433` URL when connecting a host-run backend to the Docker database.

### 3. Start The Frontend

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

## AI Extraction Provider

Brief extraction runs through any OpenAI-compatible chat-completions endpoint. Pick one by editing `.env` — no code changes:

| Provider | LLM_BASE_URL | LLM_MODEL example | Cost |
|---|---|---|---|
| LM Studio (default, local) | `http://localhost:1234/v1` | *(blank — auto-detected)* | Free, uses your GPU |
| AWS Bedrock | `https://bedrock-runtime.<region>.amazonaws.com/openai/v1` | `amazon.nova-micro-v1:0` | Pay per token (fractions of a cent per extraction) |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | Free tier (~1k requests/day) |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` | Free tier |
| OpenRouter | `https://openrouter.ai/api/v1` | `meta-llama/llama-3.3-70b-instruct` | Free models / pay per token |

Set `LLM_API_KEY` to the provider's bearer key and restart the backend. With a key set, the backend skips local-model discovery when `LLM_MODEL` is explicit and allows concurrent requests. Bedrock API keys come from the AWS Bedrock console (short- or long-term bearer keys — no SigV4 signing needed). Generation geometry never calls the provider; only brief extraction does.

## Run Everything With Docker Compose

### Windows startup checklist

Docker Compose starts ArchiAI's database, backend, and frontend. By default LM Studio runs separately on the Windows host so it can use the GPU directly; if you configured a hosted provider with `LLM_API_KEY`, skip the LM Studio steps.

1. Start **Docker Desktop** from the Windows Start menu. Keep the WSL 2 engine enabled and wait until Docker Desktop reports that the engine is running.

2. Confirm that the Docker daemon and Compose are available:

```powershell
docker version
docker info
docker compose version
```

`docker compose ps` only reports container status; it does not start the application.

3. Start **LM Studio**, download and load `qwen/qwen3.5-9b` (the Q4_K_M quantization is suitable for an 8 GB RTX 4060), set context length to `4096`, and use maximum GPU offload. In LM Studio's Developer/Local Server screen:

   - use port `1234`;
   - enable **Serve on Local Network** so Docker can reach the host;
   - start the local server and keep LM Studio open.

4. Verify the model server from PowerShell. The response should list `qwen/qwen3.5-9b`:

```powershell
Invoke-RestMethod http://127.0.0.1:1234/v1/models | ConvertTo-Json -Depth 4
```

5. From the repository root, create `.env` once and replace its placeholder database credentials and `SECRET_KEY`:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose config
docker compose up -d --build
```

Compose starts PostgreSQL, runs Alembic migrations, starts Uvicorn on port `8000`, and starts Vite on port `5173`. The first build can take several minutes.

6. Check container and application health:

```powershell
docker compose ps
Invoke-RestMethod http://localhost:8000/api/health
```

The health response should contain `"db": "ok"` and `"llm": "ok"`. The app is then available at http://localhost:5173 and the API documentation at http://localhost:8000/docs.

Useful commands:

```powershell
docker compose ps
docker compose logs -f backend frontend
docker compose exec backend alembic current
docker compose restart backend frontend
docker compose down
```

The current frontend container runs the Vite development server. A production deployment should serve `npm run build` output through a production web server and provide HTTPS, secure secrets, database backups, and deployment-specific CORS configuration.

## Database Migrations

```powershell
cd backend
..\.venv311\Scripts\python.exe -m alembic heads
..\.venv311\Scripts\python.exe -m alembic current
..\.venv311\Scripts\python.exe -m alembic upgrade head
```

Sprint 12 adds migration `011` for export audit records and project share links.

## Run Checks

Backend:

```powershell
cd backend
pytest
```

Frontend:

```powershell
cd frontend
npm test
npx tsc --noEmit
npm run build
npm audit --omit=dev
```

Docker:

```powershell
docker compose config
docker compose build backend frontend
```

## Core User Flow

1. Register or log in.
2. Create a personal project or workspace project.
3. Enter a layout prompt and generate a concept.
4. Select and edit objects directly in the 3D canvas.
5. Let auto-save preserve a separate draft, then use **Save Layout** for a named/manual version.
6. Review history and activity.
7. Export PNG or PDF from the project editor.
8. Create a read-only share link, open it without authentication, and revoke it when finished.

## Export And Share Behavior

- PNG and PDF files are generated in the browser and downloaded locally.
- The backend records export audit entries but does not store generated files.
- PDF export is a lightweight project summary containing the current canvas image and available layout metadata.
- Share links use possession-based public tokens and expose only project title, description, and latest saved layout.
- Public links never expose drafts, versions, activity, users, workspace membership, or editor controls.
- Revoking a link makes the public token unavailable.

Treat share links as sensitive. The MVP does not yet support passwords, expiry dates, link analytics, or cloud file storage.

## API Highlights

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Register and receive JWT |
| POST | `/api/auth/login` | Log in and receive JWT |
| GET | `/api/auth/me` | Load current user |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/{id}` | Load project |
| POST | `/api/extract` | Brief text to structured requirements (LLM + fallback rules) |
| POST | `/api/generate` | Generate and persist a layout from requirements |
| POST | `/api/validate` | Re-derive walls/doors and quality-check an edited layout |
| PUT | `/api/design/{id}` | Manual save and create named version |
| PUT | `/api/design/{id}/draft` | Save/update separate auto-draft |
| POST | `/api/projects/{id}/export/image` | Record image export |
| POST | `/api/projects/{id}/export/pdf` | Record PDF export |
| POST | `/api/projects/{id}/share` | Create read-only share link |
| DELETE | `/api/projects/{id}/share/{share_id}` | Revoke share link |
| GET | `/api/share/{token}` | Public latest-saved-layout response |

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

**Backend health reports `"llm": "unreachable"`**

- Local mode: confirm LM Studio is open and `qwen/qwen3.5-9b` is loaded. Hosted mode: confirm `LLM_API_KEY` (and `LLM_BASE_URL`/`LLM_MODEL`) are set correctly in `.env`.
- Confirm the local server is running on port `1234` with **Serve on Local Network** enabled.
- Confirm `Invoke-RestMethod http://127.0.0.1:1234/v1/models` works on the host.
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

**A public share does not show recent edits**

- Share links expose the latest manually saved layout, not the auto-save draft.
- Click **Save Layout**, then reload the public link.

**Canvas export fails**

- Wait until the 3D canvas has rendered.
- Cross-origin assets added in the future must permit canvas export.

## Future AI Scope

The MVP intentionally avoids paid AI APIs and model training. Future work may add an optional provider behind a strict interface while retaining deterministic parsing, fallback rules, provenance, and testable layout generation.

## Contribution Workflow

- Never push directly to `main`.
- Create a focused feature branch.
- Write tests before or alongside implementation.
- Keep frontend, backend, generation, and logging concerns separate.
- Run relevant checks before each commit and use a clear commit message.
- Open a pull request for review.

## License

Copyright (c) 2026 Udai Batta & Samarth Chatli. All rights reserved.

This project is proprietary software. See [LICENSE](LICENSE) for full terms. Unauthorized use, copying, or distribution is prohibited.
