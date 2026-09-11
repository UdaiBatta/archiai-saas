# ArchiAI — AGENTS.md

This file is the source of truth for any AI agent (Codex, Codex, Gemini, or other) working on this codebase. Read it fully before making any changes.

---

## What This Project Is

ArchiAI is an AI-powered architectural design platform. Users enter a natural language design brief and receive a 3D architectural layout they can view, edit, and refine in an interactive browser-based canvas.

Full product strategy: [`docs/PROJECT_STRATEGY.md`](docs/PROJECT_STRATEGY.md)
Sprint 1 design spec: [`docs/superpowers/specs/2026-05-23-sprint1-auth-design.md`](docs/superpowers/specs/2026-05-23-sprint1-auth-design.md)

---

## Multi-Agent Environment

**This code is written by Codex and reviewed by other agents including Codex.**

Rules for all agents:
- Read this file and the relevant spec before touching any code
- Do not change the project structure without updating this file
- Do not introduce dependencies not listed in the tech stack below without flagging it
- Do not modify another agent's completed and committed work without a clear reason documented in the commit message
- If you are unsure about scope, read the sprint spec before proceeding
- Leave code cleaner than you found it — fix obvious issues in files you touch, but do not refactor unrelated code

If you are Codex or another reviewing agent:
- Check code against the spec in `docs/superpowers/specs/`
- Flag any deviation from the agreed design
- Do not auto-fix — report findings so the lead agent (Codex) can action them

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router v6, Zustand, Axios, React Hook Form |
| Backend | Python 3.11+, FastAPI, SQLAlchemy (async), Alembic, Pydantic v2 |
| Database | PostgreSQL 16 |
| Auth | JWT (HS256, python-jose), bcrypt (passlib) |
| 3D Canvas | Three.js, React Three Fiber, @react-three/drei (Sprint 4+) |
| Dev | Docker, Docker Compose |
| Testing | Pytest, httpx (backend) |

---

## Project Structure

```
archiai-saas/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config/settings.py
│   │   ├── database/connection.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── api/
│   │   ├── services/
│   │   ├── utils/
│   │   └── tests/
│   ├── alembic/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── store/
│   │   ├── services/
│   │   ├── hooks/
│   │   └── utils/
│   ├── Dockerfile
│   └── package.json
├── docs/
│   ├── PROJECT_STRATEGY.md
│   └── superpowers/specs/
├── docker-compose.yml
├── .env.example
├── AGENTS.md               ← this file
└── README.md
```

---

## Sprint Progress

### Sprint 0 — Product Planning ✅ Complete
- [x] Full product strategy written (`docs/PROJECT_STRATEGY.md`)
- [x] Sprint 1 design spec written and approved (`docs/superpowers/specs/2026-05-23-sprint1-auth-design.md`)
- [x] GitHub repo created: `github.com/samarth080/archiai-saas`
- [x] AGENTS.md created

### Sprint 1 — Authentication and Project Setup ✅ Complete
- [x] Backend project scaffolded (FastAPI + SQLAlchemy + Alembic)
- [x] PostgreSQL via Docker Compose running
- [x] User model and migration
- [x] `POST /api/auth/register`
- [x] `POST /api/auth/login`
- [x] `POST /api/auth/logout`
- [x] `GET /api/auth/me`
- [x] JWT middleware
- [x] Auth tests passing (8 tests)
- [x] Frontend project scaffolded (React + TypeScript + Tailwind + Vite)
- [x] Landing page
- [x] Register page
- [x] Login page
- [x] Register/login forms display backend and network errors instead of generic failures
- [x] Dashboard page (protected, stub)
- [x] Zustand auth store
- [x] ProtectedRoute + PublicOnlyRoute wrappers
- [x] `docker-compose up` runs full stack

### Sprint 2 — Backend Foundation ✅ Complete
- [x] Global error handler returns `{ error, code, status }` for all HTTPExceptions
- [x] RequestValidationError also returns readable `{ error, code, status }` shape (422)
- [x] All existing auth tests updated and passing with new error format
- [x] `POST /api/projects` creates a project and logs `"project.created"` to ActivityLog
- [x] `GET /api/projects` returns only the authenticated user's projects
- [x] `GET /api/projects/{id}` returns 403 for another user's project
- [x] `PUT /api/projects/{id}` updates and logs `"project.updated"`
- [x] `DELETE /api/projects/{id}` deletes and logs `"project.deleted"`, returns 204
- [x] All 8 project tests passing
- [x] All 8 auth tests still passing
- [x] Alembic migrations 002 (projects) and 003 (activity_logs) added

### Sprint 3 — Frontend Foundation ✅ Complete
- [x] Shared Axios instance (`src/services/api.ts`) injects Bearer token on every request
- [x] Shared Axios instance defaults to `http://localhost:8000` when `VITE_API_URL` is not provided in local frontend env
- [x] Auth service uses the shared Axios instance so register/login follow the same API URL and token behavior
- [x] 401 responses log the user out and redirect to `/login`
- [x] Dashboard rebuilt: sidebar + responsive card grid + real data from `GET /api/projects`
- [x] Dashboard guards invalid project-list responses so API/config mistakes show an error instead of crashing React
- [x] "+ New Project" modal — calls `POST /api/projects`, prepends project to grid on success
- [x] ProjectCard click navigates to `/projects/:id`
- [x] Project workspace page (`src/pages/Project/index.tsx`) — loads from `GET /api/projects/:id`
- [x] Edit mode updates title/description via `PUT /api/projects/:id`
- [x] Delete button confirms, calls `DELETE /api/projects/:id`, redirects to dashboard
- [x] Empty state, loading state, and inline error states throughout
- [x] `/projects/:id` added as a protected route in `App.tsx`
- [x] TypeScript compilation clean (`npx tsc --noEmit`)
- [x] Canvas placeholder in place for Sprint 4

### Sprint 4 — Basic 3D Canvas ✅ Complete

- [x] Shared `<Sidebar>` component extracted; Dashboard and Project pages use it
- [x] `three`, `@react-three/fiber@8`, `@react-three/drei@9`, `@types/three` installed
- [x] R3F canvas renders in the Project workspace with correct lighting and grid
- [x] Camera orbits, zooms, and pans with mouse (OrbitControls)
- [x] 5 hardcoded room boxes visible, each a different color
- [x] Clicking a room selects it (emissive highlight) and opens the Inspector panel
- [x] Clicking empty canvas deselects (Inspector closes)
- [x] TransformControls gizmo appears on selected room; dragging it moves the room
- [x] OrbitControls disabled while TransformControls is active (no camera fighting)
- [x] Inspector X/Z fields and size fields update/move the room in real time
- [x] Delete button in inspector removes the room from the scene
- [x] Canvas state is in-memory only (persistence in Sprint 7)
- [x] `npx tsc --noEmit` passes with zero errors
- [x] 8 canvas store tests passing

### Sprint 5 — Basic 3D Layout Generation ✅ Complete

- [x] `prompt_service.py` extracts room types, counts, and size modifiers from natural language
- [x] `layout_service.py` places rooms in two zones (public/private) with 1m gaps, 2m between zones
- [x] `POST /api/design/generate` returns layout JSON; protected by JWT (DB-backed auth)
- [x] Bottom prompt bar in Project workspace — textarea + Generate button
- [x] Generated rooms replace hardcoded canvas rooms via `canvasStore.loadRooms`
- [x] Loading state (button disabled + "Generating…") during API call
- [x] Error message shown if generation fails or no rooms detected; API error propagated to user
- [x] Floor count extraction supports numeric, word-based, storey/story, G+N, and ground-plus prompts
- [x] Layout JSON includes `metadata.totalFloors`, `building.floorHeight`, and `floors[]`
- [x] Multi-floor layouts assign each generated object to exactly one floor
- [x] Multi-floor layouts add simple aligned `Stairs` placeholders on every floor
- [x] Top-level `rooms` remains available for backward compatibility
- [x] Design and first DesignVersion models/migration added for generated layouts
- [x] Project-scoped generation saves layout JSON to Design and DesignVersion when `projectId` is supplied
- [x] Project workspace generation sends `projectId` so generated layouts are saved for the project
- [x] `POST /api/design/generate` logs `"design.generated"` through ActivityLog
- [x] Prompt service, layout service, and design API tests cover generation behavior
- [x] Backend tests passing (56 tests)
- [x] `npx tsc --noEmit` passes with zero errors

### Sprint 6 — 3D Editing Workflow ✅ Complete

- [x] Canvas state supports object type, rotation, grid snap, save status, floor assignment, and edit activity entries
- [x] Inspector supports label editing, object type editing, floor assignment, precise X/Z movement, precise resize, precise rotation, duplicate, and delete
- [x] Canvas renders object labels above rooms/components
- [x] Clicking a room/component selects only that object and shows a visible highlight
- [x] Direct mouse drag moves the selected object on the X/Z plane while preserving floor/elevation
- [x] Orbit controls are disabled while direct object drag is active
- [x] Direct drag respects snap-to-grid when enabled
- [x] Sprint 6 bug fix: removed unstable selected-object `TransformControls` wrapper so selection and pointer drag stay on the same mesh
- [x] Sprint 6 bug fix: empty-canvas deselect no longer competes with object click/drag events
- [x] Ctrl+D / Cmd+D duplicates the selected object
- [x] Delete / Backspace removes the selected object
- [x] Editor toolbar supports snap toggle, floor selector, add-object panel, duplicate, delete, and save status
- [x] Add-object panel can create room, wall, door, window, stair, floor, and open space objects on the selected floor
- [x] Duplicate preserves type, dimensions, rotation, and floor assignment with a small X/Z offset
- [x] Single-floor layouts continue to render and edit through the backward-compatible top-level `rooms` structure
- [x] Multi-floor layouts render through `floors[]`; selected floor mode edits one floor, All Floors shows stacked elevations
- [x] Project workspace loads the latest saved Design layout for the project when available
- [x] Save Layout persists edited layout JSON to Design and creates a new DesignVersion
- [x] `PUT /api/design/{design_id}` logs `"layout.saved"` through ActivityLog
- [x] In-memory activity log records add, move, resize, rotate, rename, duplicate, and delete edits
- [x] Debounced in-memory auto-save status shows Saving then Saved after edits
- [x] Canvas store tests expanded to 20 passing tests
- [x] Backend design save/load tests passing as part of 58 backend tests
- [x] Frontend production build passes
- [x] Sprint 6 implementation note exists at `docs/superpowers/plans/2026-05-27-sprint6-3d-editing-workflow.md`
- [ ] Persistent per-object ActivityLog API remains deferred to Sprint 9

### Sprint 7 — Database and Project Management ✅ Complete

- [x] Project CRUD, rename, and delete remain project-owner scoped
- [x] Project delete removes related Design and DesignVersion rows so persisted layouts do not block deletion
- [x] Manual Save Layout creates a named/manual DesignVersion with incrementing version number, snapshot JSON, change summary, creator, and timestamp
- [x] Generated layouts continue to create the first generated DesignVersion
- [x] `GET /api/projects/{id}/versions` lists project versions newest first with useful metadata
- [x] `POST /api/projects/{id}/duplicate` creates a separate project copy with latest design/layout snapshot
- [x] Project duplicate creates its own initial DesignVersion and does not copy old activity logs
- [x] Project thumbnails are captured from the canvas on Save Layout and persisted on Project
- [x] Dashboard ProjectCard displays saved thumbnails or a clean placeholder
- [x] Opening a project loads the latest saved design/layout when available
- [x] Empty projects show a clear empty editor state instead of hardcoded starter rooms
- [x] Save status distinguishes Unsaved changes, Saving, Saved with timestamp, and Error
- [x] Alembic migration 005 adds Sprint 7 project thumbnail and version metadata fields
- [x] Backend Sprint 7 tests cover versions, duplicate, thumbnail persistence, latest load, and delete-with-designs behavior
- [x] Frontend canvas store tests cover empty layout clearing and unsaved state
- [ ] Full version history panel deferred to Sprint 9
- [ ] Restore version UI deferred to Sprint 9
- [ ] Collaboration/version-control UI deferred to Sprint 9

### Sprint 8 — Prompt Refinement ✅ Complete

- [x] `refinement_service.parse_refinement` extracts AddOp / RemoveOp / ResizeOp from natural language
- [x] `refinement_service.apply_refinement` mutates the layout append-only (existing room positions preserved)
- [x] RESIZE → REMOVE → ADD application order; multi-floor ADD routes by Sprint 6 zone+floor rules
- [x] `POST /api/design/refine` returns the updated layout plus a `refinementSummary` string
- [x] Successful refine inserts `DesignVersion(version_type='refined', change_summary=summary)` and logs `design.refined`
- [x] 422 with help text when the prompt produces no ops; 422 with "No matching rooms" when ops are all no-ops
- [x] Generate / Refine segmented toggle on the bottom prompt bar; Refine disabled until a saved design exists
- [x] Summary banner above the prompt bar; auto-clears when the user types; ✕ to dismiss
- [x] React Testing Library + happy-dom configured for frontend RTL tests
- [x] 17 backend refinement service tests + 3 endpoint tests; 3 new frontend RTL tests
- [x] `npx tsc --noEmit` passes with zero errors

### Sprint 9A — Version History & Restore ✅ Complete

- [x] `GET /api/design/version/{version_id}` — fetches a single DesignVersion; 401 / 403 / 404 guarded
- [x] `designId` / `designVersionId` keys stripped from `layout_json` before spread to avoid kwarg collision
- [x] 3 new backend tests (correct layout returned, 403 wrong user, 404 missing)
- [x] `fetchVersion(versionId)` exported from `design.service.ts`
- [x] `VersionHistoryDrawer` component — overlay drawer with version list, type badges, relative timestamps, per-row Restore
- [x] Restore loads the historical layout into the canvas as unsaved changes (user must Save to persist)
- [x] Per-row loading state — only the clicked Restore button shows "Restoring…"
- [x] `isMounted` ref guards setState calls against unmount in handleRestore
- [x] 2 RTL tests for VersionHistoryDrawer (renders rows, Restore calls API + closes drawer)
- [x] 2 Project page tests (History button opens drawer, close button closes it)
- [x] "History" button in project top bar opens the drawer
- [x] `npx tsc --noEmit` passes with zero errors

### Sprint 9B — Activity Log Panel ✅ Complete

- [x] Alembic `006` adds nullable, indexed `project_id` to `activity_logs` (no FK — append-only audit)
- [x] `ActivityLog.project_id` declared on the model
- [x] `log_activity(db, user_id, action, project_id=None)` — all 7 existing call sites pass `project_id`
- [x] `log_activity` sets `timestamp=datetime.now(timezone.utc)` explicitly so SQLite tests can order entries within the same second
- [x] `GET /api/projects/{project_id}/activity` returns 50 newest entries, scoped to the project, newest-first
- [x] 401 / 403 / 404 guarded; cross-project isolation verified by test
- [x] `ActivityLogOut` schema added
- [x] 3 new backend tests (scoped + ordered, 403 wrong user, isolation between projects)
- [x] `formatRelative` extracted to `frontend/src/utils/time.ts`; both drawers import from there
- [x] `projectService.activity()` + `ActivityEntry` type
- [x] `ActivityDrawer` component (mirrors VersionHistoryDrawer structure, action label map, `isMounted` ref)
- [x] 2 RTL tests for `ActivityDrawer` (rows with labels, empty state)
- [x] "Activity" button next to "History" in project top bar
- [x] 1 new Project page test (Activity button opens the drawer)
- [x] `npx tsc --noEmit` clean

### Sprint 9C — Auto-save with Drafts ✅ Complete

- [x] Task 1: Backend draft endpoint tests
  - Tests cover authenticated draft save, draft fetch, no-draft response, wrong-user access, layout JSON persistence, and named-version safety
- [x] Task 2: Backend draft service functions
- [x] Task 3: Backend draft schemas and endpoints
- [x] Task 4: Backend tests and backend draft verification
- [x] Task 5: Canvas store draft state
- [x] Task 6: Frontend draft service functions
- [x] Task 7: `useAutoSave` hook and tests
- [x] Task 8: Draft recovery in ProjectPage and recovery banner
- [x] Task 9: EditorToolbar draft indicator
- [x] Task 10: RTL tests for recovery banner
- [x] Task 11: Final checks and commit
- [x] Auto-save writes separate `auto_draft` versions without overwriting named/manual version history
- [x] Draft recovery banner lets users restore unsaved draft work into the editor before manually saving
- [x] EditorToolbar shows draft dirty, saving, saved, and error states
- [x] Backend and frontend checks pass

### Sprint 9D — Team Collaboration (Workspaces) ✅ Complete

- [x] Task 1: Sprint 9D workspace collaboration plan
- [x] Task 2: Backend workspace/team tests
- [x] Task 3: Workspace and TeamMember models/migration
- [x] Task 4: Backend workspace services
- [x] Task 5: Workspace API endpoints
- [x] Task 6: Project-workspace association and access checks
- [x] Task 7: Frontend workspace service functions
- [x] Task 8: Basic workspace dashboard UI
- [x] Task 9: Member management UI
- [x] Task 10: Permissions and activity log polish
- [x] Task 11: Final checks and Sprint 9D completion update
- [x] Workspaces support owner, admin, editor, and viewer roles with backend-enforced permissions
- [x] Existing users can be added by email and shared workspace projects remain compatible with personal projects
- [x] Workspace activity history includes team actions and shared project/design changes
- [x] Backend tests, frontend tests, typecheck, production build, migration, and live PostgreSQL API smoke flow pass

Deferred beyond Sprint 9D:
- Real-time collaboration
- Pending email invitations / actual email sending
- Comments
- Notifications
- Workspace billing

### Sprint 10 — Web Scraper and Data Pipeline ✅ Complete

- [x] Task 1: Sprint 10 scraper/data-pipeline plan
- [x] Task 2: Backend scraper pipeline tests
- [x] Task 3: ScraperSource and ScraperRun models/migration
- [x] Task 4: RobotsTxtChecker utility
- [x] Task 5: Basic safe-source scraper runner
- [x] Task 6: Data cleaning and deterministic metadata extraction
- [x] Task 7: Structured LayoutPattern model/migration
- [x] Task 8: Scraper management API endpoints
- [x] Task 9: Scraper monitoring UI
- [x] Task 10: Final checks and Sprint 10 completion update
- [x] Pipeline collects permitted public textual layout references only and stores source URL plus access timestamp provenance
- [x] Every scrape run checks `robots.txt`; blocked or unreachable policy checks fail closed without fetching source content
- [x] Raw text records and deterministic `LayoutPattern` metadata remain isolated from design generation
- [x] Authenticated scraper APIs and the Data Pipeline monitoring UI cover source management, explicit runs, status, history, and extracted patterns
- [x] Backend tests, frontend tests, typecheck, production build, PostgreSQL migrations, and local API smoke flow pass

Deferred beyond Sprint 10:
- AI training and layout-generation improvements belong to Sprint 11
- Scheduled/background crawling and crawl queues
- Dedicated system-admin authorization for pipeline management
- Source-specific extraction adapters

Intentionally excluded:
- Scraping or storing copyrighted floor-plan images
- Personal-data collection

### Sprint 11 — Layout Improvement Using Pattern Data ✅ Complete

- [x] Task 1: Sprint 11 layout-improvement plan/spec
- [x] Task 2: Benchmark prompt and quality tests
- [x] Task 3: Layout-pattern access service with fallbacks
- [x] Task 4: Room-sizing rule improvements
- [x] Task 5: Zoning and adjacency improvements
- [x] Task 6: Building-type layout templates
- [x] Task 7: Prompt requirement extraction improvements
- [x] Task 8: Layout-quality scoring
- [x] Task 9: Minimal generation-insight UI
- [x] Task 10: Future-AI placeholder documentation
- [x] Task 11: Final checks and Sprint 11 completion update
- [x] Deterministic generation uses structured pattern data when available and realistic fallback rules when the database has no matching patterns
- [x] Room sizing, zones, adjacency ordering, prompt extraction, building templates, multi-floor compatibility, and quality scoring improve concept layouts without external model calls
- [x] Editor layout insights show detected building type, applied template, zones, quality score, and compact diagnostics
- [x] Backend tests, frontend tests, typecheck, production build, and migration-head checks pass

Deferred beyond Sprint 11:
- Paid AI API integration
- OpenAI, Codex, or Gemini provider integration
- Local model integration
- Full AI model training or fine-tuning
- LLM-based layout generation
- Advanced architectural validation
- Automatic self-learning from user edits
- Complex spatial optimization algorithms
- CAD/BIM reasoning

### Sprint 12 — Export, Share, and Polish ✅ Complete

- [x] Task 0: Clean `AGENTS.md` development-rule formatting
- [x] Task 1: Sprint 12 export/share/polish plan and checklist
- [x] Task 2: Backend export/share tests
- [x] Task 3: Backend export/share models and services
- [x] Task 4: Backend export/share API endpoints
- [x] Task 5: Frontend image export
- [x] Task 6: Frontend PDF export
- [x] Task 7: Shareable read-only project links
- [x] Task 8: Export/share activity labels and integration
- [x] Task 9: MVP user-interface polish
- [x] Task 10: Full local MVP smoke testing and fixes
- [x] Task 11: README and deployment readiness
- [x] Task 12: Final checks and Sprint 12 completion update

- [x] `AGENTS.md` Development Rules cleanup completed
- [x] Image export downloads the current canvas and records project activity
- [x] PDF export produces a lightweight project summary and records project activity
- [x] Share links open a public read-only latest-saved-layout view and can be revoked
- [x] Export/share actions are permission-safe and readable in activity history
- [x] Core MVP UI polish and local smoke verification completed
- [x] README, Docker, migrations, setup, and deployment-readiness notes updated
- [x] Backend tests, frontend tests, typecheck, production build, production dependency audit, Docker image builds, and healthy Compose startup pass

Deferred beyond Sprint 12:
- CAD/BIM export
- Real-time collaboration
- Public template marketplace
- Payment/subscription system
- Advanced deployment automation
- Mobile/tablet-specific UI
- Advanced PDF styling/report templates
- Cloud file storage for exports

### Sprint 13 — Smarter Layouts, Pattern Learning, and Better Canvas ✅ Complete

- [x] Task 1: Sprint 13 plan and tracker
- [x] Task 2: Pattern audit and validation
- [x] Task 3: Pattern normalization
- [x] Task 4: Pattern-weighted rule resolver
- [x] Task 5: Adjacency-aware placement engine
- [x] Task 6: Footprint and layout sanity checks
- [x] Task 7: Wall, door, and window placeholders
- [x] Task 8: Canvas visual polish
- [x] Task 9: Quality feedback and insights
- [x] Task 10: Benchmark suite
- [x] Task 11: Pattern data workflow documentation
- [x] Task 12: Final checks and sprint completion

- [x] Sprint 13 implementation plan created at `docs/superpowers/plans/2026-06-07-sprint13-smarter-layouts-pattern-canvas.md`
- [x] Pattern data validation keeps low-quality scraped data from influencing generation
- [x] Normalized pattern vocabulary maps messy scraped terms to internal room/building types
- [x] Pattern-weighted generation improves room sizes, zones, adjacency, and layout metadata without paid AI APIs
- [x] Canvas visualization improves readability while preserving editing, save, export, and share behavior
- [x] Non-AI pattern data workflow documented at `docs/PATTERN_DATA_WORKFLOW.md`
- [x] Backend tests, frontend typecheck, production build, and frontend tests pass

Deferred beyond Sprint 13:
- Paid AI API integration
- OpenAI, Codex, Gemini, or local model integration
- AI model training or fine-tuning
- CAD/BIM export and structural validation
- Advanced spatial optimization
- Public scraper/source-management workflow for normal users

### Sprint 14 — Advanced Deterministic Prompt Parser ✅ Complete

- [x] Stage 1: Normaliser and synonym expansion
- [x] Stage 2: Building type inference with BHK support
- [x] Stage 3: Compound room extraction
- [x] Stage 4: Merge and deduplication
- [x] Stage 5: Relational constraint extraction
- [x] Stage 6: Size and proportion resolver
- [x] Stage 7: Wire parser stages into `prompt_service.py`
- [x] Stage 8: Update `layout_service.py` for parser-aware adjacency and floor distribution
- [x] Stage 9: Optional Vastu compliance module and integration
- [x] Stage 10: Full parser/layout regression suite and final Sprint 14 completion update

- [x] Parser work is on feature branch `sprint-14/advanced-keyword-parser`
- [x] All 10 stages committed as separate workflow units
- [x] Full parser + regression suite passes (`377 passed`)
- [x] Advanced parser (`parse_prompt`) is wired into production generation via `designs/router.py`
- [x] Vastu compliance is opt-in (triggered by "vastu"/"vaastu" keywords only)
- [x] All existing tests continue to pass — zero regressions

Deferred beyond current Sprint 14 partial scope:
- Paid AI API integration
- AI model training or fine-tuning
- Full CAD/BIM reasoning
- Complex structural validation
- Automatic self-learning from user edits

### Sprint 15 — Layout Quality, Visual Improvements & Overlap Fix ✅ Complete

- [x] Multi-pass iterative overlap repair in `_repair_rooms` (resolves X and Z direction overlaps; up to 10 passes until stable)
- [x] Stair placement made relative to `x_offset` — no longer hardcoded at (1.0, 1.5)
- [x] Partition wall generation: `_generate_partition_walls` creates thin wall meshes between every adjacent room pair on a floor
- [x] Quality scorer: `dining_room` added to expected apartment/house rooms — pure 3BHK no longer trivially scores 100/100
- [x] Quality scorer: building-type completeness check with per-type expected room sets
- [x] Quality scorer: adjacency density check penalizes layouts with very low satisfaction rates
- [x] Scene.tsx: floor slabs thicker (0.45m in 3D vs 0.16m), distinct per-floor color palette, ceiling plane between stories in multi-floor 3D view
- [x] RoomMesh.tsx: edge outlines rendered on all room/stair objects (not just selected) so adjacent rooms have visible separation; wall/partition opacity increased to 0.62
- [x] 17 new Sprint 15 tests covering overlap repair, no-overlap guarantee for 5-bed 2-story layout, partition wall presence, quality penalties
- [x] 394 backend tests passing, zero regressions; frontend typecheck clean

Deferred beyond Sprint 15:
- True internal wall topology (shared-wall detection, door openings in walls)
- Floor plan 2D rendering mode with dimension labels
- Room labeling on floor plan (room names at centroid in plan view)
- Refine improvements (prompt understanding, adjacency-aware refinement)
- Per-room activity log API

### Sprint 15 Phase 2 — Tiled Floor-Plan Algorithm ✅ Complete

- [x] `_tile_rooms` zones rooms into front/corridor/back rows; each row scales to fill the exact building width so rooms share walls (zero gaps), replacing the old row-based algorithm that left "floating box" gaps
- [x] `_fill_row` scales room widths proportionally to fill `building_width` exactly
- [x] Residential building types (`apartment`, `house`, `studio`, `two_storey_home`, `bungalow`, `villa`, `townhouse`) route through `_tile_rooms`; commercial types continue using `_place_rooms`
- [x] Multi-floor tiled layouts pre-compute a shared `target_width` from the widest floor so all storeys align on the same building width
- [x] Stairs reserve a 2.2m strip on the building's right edge, using the shared `target_width` so stair position is consistent across all floors even when some floors have no other rooms
- [x] `_assign_rooms_to_floors`: every floor with bedrooms now also gets its own bathroom
- [x] `generate_layout` produces a single candidate for tiled types instead of 3 variants
- [x] `_outside_footprint` and overlap checks gain a 2cm epsilon to absorb float drift at shared walls without masking real overlaps
- [x] Quality scorer no longer double-counts symmetric avoid-adjacency violations (e.g. kitchen/bathroom)
- [x] New tiled-layout regression suite (`test_sprint15_tiled_layout.py`) plus updated benchmark/unit test expectations
- [x] 409 backend tests passing, zero regressions

Deferred beyond Sprint 15 Phase 2:
- True internal wall topology (shared-wall detection, door openings in walls)
- Floor plan 2D rendering mode with dimension labels
- Room labeling on floor plan (room names at centroid in plan view)
- Refine improvements (prompt understanding, adjacency-aware refinement)
- Per-room activity log API

### Sprint 16 — Unified Space-Filling Layouts & Adjacency Reasoning ✅ Complete

> Full spec: [`docs/superpowers/specs/2026-06-11-sprint16-unified-space-filling-layouts.md`](docs/superpowers/specs/2026-06-11-sprint16-unified-space-filling-layouts.md)
> Branch: `sprint-16/unified-space-filling-layouts` (off `main`). Scope: **Phases 1–3**, plus two unplanned parser/NLU fixes (Gaps A & B) found via user testing.

**Why:** `layout_service.py` had two placement engines. Residential types used the good space-filling tiler (`_tile_rooms`, zero gaps). Everything else (office, clinic, retail, restaurant, school, classroom, and mixed-vocab prompts resolving to a commercial `building_type`) used the old row-band engine (`_place_rooms`), whose footprint was the bounding box of mismatched-width zone rows — the source of large "blank space" inside the boundary walls. The tiler also ignored the parser's adjacency constraints and used one uniform depth per row, distorting proportions.

- [x] **Phase 1 — Unify on the tiler:** `_TILED_BUILDING_TYPES` now covers both the production `detect_building_type` vocabulary (8 types) and the parser's `infer_building_type` vocabulary (13 types) — office, clinic, restaurant, retail, classroom, school, hotel all tile with zero gaps; `_place_rooms`/`_repair_rooms` remain a fallback only.
- [x] **Phase 2 — Real adjacency reasoning:** `_chain_by_adjacency`/`_order_zone_rooms` thread the parser's MUST/SHOULD `AdjacencyConstraint`s into row ordering inside `_tile_rooms`; `interleave_service` attaches a bathroom/ensuite to the bedroom it's constrained to (with ensuite→bathroom aliasing).
- [x] **Phase 3 — Proportion realism:** `_fill_row` rewritten to allocate row width proportional to each room's target *area* (not pre-sized width), so large rooms (e.g. open workspace) get proportionate space instead of being squeezed by neighbors — this also fixed the last failing adjacency benchmark.
- [x] **Geometry fixes:** boundary walls offset outward by half thickness (rooms no longer overlap the walls bounding them); implicit privacy corridor gated to residential types + clinic (clinics have a real circulation corridor); commercial multi-floor distribution (`_assign_commercial_floors`) round-robins rooms evenly across floors and anchors public rooms to the ground floor, fixing near-empty ground floors for types like `school`.
- [x] **Gap A — missing building templates:** `infer_template_rooms` was silently falling back to the apartment template (bedrooms/kitchen/living room) for any of 6 building types with no template entry — this directly caused the user-reported "clinic generates bedrooms" bug. Added proper templates for `clinic`, `school`, `hotel`, `villa`, `townhouse`, `warehouse`.
- [x] **Gap B — NL synonyms & relational patterns:** added missing synonyms ("seating area"/"waiting area"→`waiting_room`, "doctor's office"/"exam room"/"treatment room"→`consultation_room`); generalized the adjacency regex to handle directional phrasing (behind, opens into, leads to, opposite, facing, backs onto) and reversed sentence order ("next to X is Y"), with filler-word tolerance.
- [x] New `test_sprint16_unified_layouts.py` (21 tests: footprint utilization, no-overlap, key adjacencies, relational-language adjacency, multi-floor commercial sharing, clinic/school template correctness, NL synonym resolution); updated `test_layout_architectural_rules.py`, `test_layout_benchmarks.py`, `test_sprint15_tiled_layout.py` for the new tiled-commercial semantics
- [x] Full backend suite green (430 passed, 0 failed); `npx tsc --noEmit` clean

Known limitation (not fixed, flagged for later): relational phrases with an inserted clause between the two room mentions (e.g. "entry door **which** opens into the reception area") still fail to match the adjacency extractor.

Deferred beyond Sprint 16:
- Phase 4: quality-scorer space-utilization metric + parser-tied adjacency-satisfaction score (so the generator self-selects good layouts)
- Phase 5: 2D floor-plan view mode, door openings punched into partition walls, persistent room-type color legend
- True internal wall topology (shared-wall dedup, openings)
- Paid AI / model-based generation, CAD/BIM, structural validation

### Sprint 17+ — 10× Master-Brief Vertical Slice ✅ Phases 0–3 complete (2026-07)

> A second, independent pass on the 10x roadmap driven by the master
> implementation brief. **Do not confuse these Phase numbers with the older
> "Sprint 17 Phase 0–4" DesignParams/dimensions numbering below** — this is a
> separate initiative delivered as four focused branches off `main`'s current
> tip (`sprint-17/phase0-design-params`), one per concern (per the user's
> branch-per-task preference). None pushed yet (local only until asked).

- **Phase 0 — Security & hardening** (`sprint-17/phase0-security-hardening`, 2 commits): scraper is admin-only (`User.is_admin`, mig 012); `utils/ssrf.py` blocks private/loopback/link-local/metadata targets (v4+v6, per-redirect); access tokens cut 7d→45m with `jti`/`type`, revocable refresh tokens (mig 013, `POST /auth/refresh` rotation, `/logout` revoke); `utils/rate_limit.py` per-user/IP limiter; prompt/layout/body payload caps; env-driven `ENV`/`ALLOWED_ORIGINS` + security headers + prod SECRET_KEY gate. 512 backend tests.
- **Phase 1 — Canvas direct-manipulation** (`sprint-17/phase1-canvas-ux`): footprint-clamped drag, 8-point `ResizeHandles` (min-dim + single log entry), click-to-place, 6 new object types (corridor/lift/shaft/furniture/column/generic), `MeasurePanel` + tape tool, bounded undo/redo + Cmd/Ctrl+Z. 106 frontend tests, tsc + build clean.
- **Phase 2 — ProgramGraph** (`sprint-17/phase2-program-graph`): `backend/app/services/planning/` — building-type-agnostic typed Node/Edge graph + adapters (`from_parser_output`/`from_building_template`/`from_user_objects`/`merge`) + lossless `to_room_specs`/`from_room_specs` bridge + explainable `validate()`. Additive: golden tests pin byte-identical layout vs. the direct path across residential + office/clinic/warehouse/restaurant. 493 backend tests.
- **Phase 3 — Billing & entitlements** (`sprint-17/phase3-billing`, stacked on Phase 0): Plan/Subscription/PaymentOrder/PaymentEvent/Entitlement/UsageCounter (mig 014); `entitlement_service` (backend-verified free-tier limits, feature gates → 402/403, metered generations, admin bypass); `billing_service` (Razorpay order via httpx, signature-verified idempotent webhook, no SDK); `/api/billing/*`; gates wired into project-create + generate. No card/bank/UPI/PAN stored. 520 backend tests.

New reference docs: [`docs/NON_ML_GRAPH_LAYOUT_ENGINE.md`](docs/NON_ML_GRAPH_LAYOUT_ENGINE.md), [`docs/SAAS_HARDENING_AND_MONETIZATION.md`](docs/SAAS_HARDENING_AND_MONETIZATION.md), [`docs/EXPORT_AND_BIM_ROADMAP.md`](docs/EXPORT_AND_BIM_ROADMAP.md), [`docs/HYPAR_INSPIRED_PRODUCT_STRATEGY.md`](docs/HYPAR_INSPIRED_PRODUCT_STRATEGY.md).

Hard constraints held throughout: no ML / no paid-AI layout generation; every change additive and backward-compatible with the existing layout JSON + `RoomSpec → generate_layout` path; no new runtime dependencies (rate-limiter and Razorpay both stdlib). Migration chain across branches is linear (Phase 0 adds 012+013, Phase 3 adds 014 on top; Phases 1–2 add none), so merge order is Phase 1 & Phase 2 (independent, off base) then Phase 3 (brings Phase 0). Deferred: graph-driven placement (Phase 4), circulation/doors (Phase 5), furniture (Phase 6), CAD/BIM export (Phases 7–8), frontend token→cookie migration, full cross-user authz matrix.

### Sprint 17+ — 10× Roadmap 🚧 In Progress (Phases 0-3 core complete, Phase 4 underway)

> Full roadmap: [`docs/superpowers/plans/2026-06-22-10x-roadmap.md`](docs/superpowers/plans/2026-06-22-10x-roadmap.md)
> Branches: `sprint-17/dimensions-on-canvas` (Phase 1, off `main`), `sprint-17/phase0-design-params` (Phase 0 + Phase 2 + Phase 3 + Phase 4, stacked on top of it). Neither is pushed yet — this machine's GitHub credentials (`udai-shunya`) lack write access to `samarth080/archiai-saas`; push once that's resolved.

A longer-horizon plan to move from "concept layout MVP" to a standout product, reverse-engineered from Hypar's parametric-generative approach. Five pillars, sequenced into phases:

- **Pillar A — Real planning engine:** replace row/tile packing with a BSP/slicing-tree space partitioner for a true building envelope, plus a real circulation graph, doors on the path, and orientation-aware windows.
- **Pillar B — Dimensions & interaction:** on-canvas dimension lines + area badges on click/select (not just the Inspector side panel), a metrics HUD, CAD-lite snapping.
- **Pillar C — Data learning:** swap the scraper's fetcher to Scrapling (handles JS/anti-bot sites like ArchDaily/Dezeen), extract structured project data (not just visible text), aggregate into statistical priors (area distributions, adjacency probabilities) feeding the existing `LayoutPatternRules` pipe.
- **Pillar D — UI/UX overhaul:** single-screen layout (brief/params, canvas + option gallery, inspector/metrics), muted architectural palette, option gallery for generated candidates, command palette, dimensioned plan-view rendering with door swings.
- **Pillar E — Interop & hardening:** SVG/DXF/glTF export, production frontend build (currently Docker serves the Vite dev server), refresh-token auth hardening.
- **Pillar F — 3D modeling fidelity (not started, broadly scoped):** rooms currently render as flat-colored boxes with no real wall/door/window geometry (doors and windows are thin marker boxes, not openings cut into a wall), no furniture, no materials/textures, and no roof or exterior facade detail — multi-floor buildings are just stacked flat slabs. Flagged by the user as a real gap; not broken down into phases yet, revisit once Phase 4's UI/export work lands.

Phased rollout: Phase 0 (pipeline refactor + `DesignParams`) → Phase 1 (dimensions + UI shell) → Phase 2 (BSP planning engine + circulation) → Phase 3 (Scrapling + priors) → Phase 4 (optioneering + export) → Phase 5 (optional ML + IFC, later). Pillar F isn't yet slotted into a phase.

**Phase 0 progress (DesignParams + first parametric levers):**
- [x] `DesignParams` schema (`plotWidthM`, `plotDepthM`, `floors`, `orientation`, `vastu`) added to `GenerateRequest` as a fully optional sibling of `prompt` — omitting it leaves generation byte-for-byte unaffected
- [x] `plot_width_m` wired end-to-end: overrides the tiled building's program-area-inferred footprint width, clamped to 4-40m (wider than the 7-22m inferred default since a real plot can legitimately fall outside that heuristic's range); holds consistently across multi-floor layouts
- [x] `floors` and `vastu` DesignParams route through the existing `total_floors`/`vastu_requested` parameters, taking precedence over the prompt when supplied
- [x] `orientation` (S/N/E/W, default S) wired end-to-end: picks which exterior wall is the entry/road-facing side via `_ORIENTATION_ENTRY_WALL`; windows are placed on the other three exterior walls (previously always exactly one window on one fixed wall, regardless of building shape)
- [x] `plot_depth_m` still only accepted/recorded in `metadata.designParams`, not yet applied to geometry — needs the BSP partitioner (Phase 2) to constrain depth without distorting room proportions the way a naive clamp would
- [x] Fixed a pre-existing gap found along the way: `FloorResponse` was silently dropping `footprint` from every API response (the schema never declared the field), which meant the Phase 1 metrics HUD's footprint-utilization stat could never populate for API-loaded layouts; `footprint` is now part of the response schema
- [x] Collapsible "Plot params" row in the Project prompt bar — plot width, floors, and an "Entry faces" direction select (all blank/"auto" by default) — sends `designParams` alongside the prompt when filled in
- [x] Backend + frontend tests cover plot width override/clamping/multi-floor consistency, orientation's effect on entry/window placement, API plumbing, and no-params regression
- [ ] The full `Fn`-pipeline decomposition of `generate_layout` into composable functions over a shared `BuildingModel` (the architectural part of Phase 0) is deferred — the `DesignParams` plumbing was delivered as a safe, additive slice instead of risking the 440+ test layout engine on a large simultaneous rewrite; revisit when Phase 2's BSP partitioner needs the pipeline shape anyway
- [ ] `plot_width_m`/`orientation` only affect tiled building types (`_TILED_BUILDING_TYPES`) — row-banded fallback types ignore them (in practice this covers nearly everything generated since Sprint 16)

**Phase 1 progress (dimensions + UI shell):**
- [x] `showDimensions` toggle added to `canvasStore` (default off)
- [x] `DimensionAnnotations.tsx` — width/depth dimension lines with end ticks, labelled in metres, rendered just outside a room's footprint; selected room renders them bold plus a centered area badge (`W × D m · area m²`); other rooms get the same lines in a faint style when the global toggle is on
- [x] Wired into `RoomMesh.tsx`, updates live during drag
- [x] `MetricsHud.tsx` — live room count, total area, and footprint-utilization % for the active floor, mirrored opposite `EditorToolbar`
- [x] "Dimensions" checkbox added to `EditorToolbar` next to the existing Snap toggle
- [x] Frontend tests for the new toggle (store + toolbar); full frontend suite green, `npx tsc --noEmit` clean
- [x] **Bug fix:** the global toggle rendered dimension lines for every room in *any* view mode, including the default 3D perspective camera — each line's fixed 0.45m offset landed inside neighbouring rows in a tightly tiled plan, so multiple rooms' labels piled on top of each other (this is what produced the cluttered screenshot during testing). Now restricted to plan/top view, where the convention actually reads cleanly; the selected room's own dimensions still show in any view mode.
- [ ] Hover-triggered dimensions on non-selected rooms (deferred — click/select only for now)
- [ ] Rotation-aware dimension lines (current lines assume axis-aligned rooms)
- [ ] `sq ft` unit toggle on the area badge

**Phase 2 progress (BSP space partitioner + real circulation) ✅ Core deliverables complete:**
- [x] Every partition wall between two adjacent rooms whose shared span is >= 1.2m gets a door marker centred on it (`_generate_partition_walls`), so generated floor plans are walkable room-to-room instead of solid-walled boxes with only one entry door total
- [x] **Bug fix — wrong adjacency branch:** when one room's footprint was narrower than and fully nested inside another's span on one axis (e.g. an Office nested inside a wider Hallway), both gap measurements read near-zero and the code picked the wrong wall orientation, so Hallway↔room walls/doors were silently never generated at all. Fixed by comparing real overlap magnitude on each axis instead of relying on which gap happened to read near zero.
- [x] **Bug fix — doors routed wrong:** even with the geometry fixed, every adjacent pair got a direct door unconditionally, so two private/service cells sitting side by side (e.g. Office next to Bathroom) each got a lateral door to each other instead of each opening onto the corridor. `_wants_direct_door` now gates this: the corridor always connects to whatever it touches, open-plan public rooms still connect directly to each other, but two private/service cells only get a direct door when there's no corridor on the floor to route through instead. This was the exact bug visible in the user-reported clinic screenshot (Office<->Bathroom and Bathroom<->Consultation Room doors, but nothing connecting either to the Hallway).
- [x] **Real BSP space partitioner:** `_bsp_partition_rect` is a true 2D recursive partition — `_fill_row` (the plain tiler) only ever varies room WIDTH within a band, forcing every room in that band to the SAME depth; BSP can cut a rectangle along either axis (always the currently-longer side, split point chosen by cumulative room area), so a deep bedroom and a shallow bathroom sharing a row can each get the depth their area actually calls for, while still fully tiling the rectangle with zero gaps
- [x] **Competes, doesn't replace:** tiled building types now generate two full candidates per request (`placement_style` "tile" and "bsp"), both scored by the existing quality scorer, higher score wins — the same `max()` competition the codebase already used for row-offset variants. BSP can never make a layout worse, only take over when it demonstrably produces better proportions. Winning engine recorded in `metadata.placementEngine`.
- [x] **Real circulation check:** `_floor_unreachable_rooms` builds a per-floor graph from interior doors and walks it from the floor's entry point (the `entry`-typed room on the ground floor, or the room nearest the stairs on upper floors), flagging by label any room not actually reachable — not just "are there doors" but "can you walk from the entry to every room." Penalises the quality score and surfaces as a warning + suggestion.
- [x] Tests cover door placement, span-matching, the 1.2m minimum-span cutoff, the corridor-routing fix (regression test against the exact clinic layout that surfaced the bug), open-plan rooms still connecting directly, BSP's zero-gap/zero-overlap tiling guarantee, BSP producing genuinely variable depths under heterogeneous room areas, candidate competition never scoring below either engine alone, and reachability correctly flagging a deliberately disconnected room
- [x] **Bug fix — dropped metadata fields:** found a second instance of the dropped-field bug from Phase 0 (`FloorResponse.footprint`) — `GenerateMetadata` never declared `candidateCount`, so it was silently stripped from every API response by the response model the whole time. Fixed alongside adding `placementEngine`.
- [x] `layout_service.py` given a module docstring + section banners (comments only, zero logic change) documenting the two-engine history, since that's exactly the kind of file where a bug like the corridor-nesting one hides
- [ ] Door-clearance checks (a clearance rectangle in front of each door, flagged if another room/object overlaps it) are not implemented — the roadmap's stretch goal for this phase, lower priority than the partitioner and circulation work above
- [ ] BSP is currently only used for the back/private+service row; the front row (open-plan living/kitchen/dining) deliberately still uses uniform-depth `_fill_row` since a benchmark test asserts those rooms share an exact Z position — revisit if BSP's depth-variance benefit is wanted there too

**Phase 3 progress (Scrapling + data priors) ✅ Core deliverables complete:**
- [x] **Scrapling fetcher swap:** `fetch_public_page` now tries Scrapling's `AsyncFetcher` first (fast, no browser, curl_cffi-based — handles the common case and basic bot checks via TLS/header fingerprinting), escalating to `StealthyFetcher` (a real stealthy browser session) only when the plain fetch comes back blocked (403/429/503) or the body shows a captcha/block-page marker. Installed from `github.com/D4Vinci/Scrapling` (explicit instruction, not the PyPI release), pinned to the resolved commit in `requirements.txt`. `StealthyFetcher`'s browser binaries need `scrapling install` as a deployment step — not run in this environment and not needed for tests or the plain-fetch path; the import is guarded so a missing browser install degrades to skipping escalation rather than crashing the scraper.
- [x] **Real statistical aggregation:** `get_layout_pattern_rules` previously picked exactly one `LayoutPattern` row per room type (highest confidence, most recent) and discarded every other usable row — scraping ten sites for "bedroom" area only ever used one of them. `_select_best_tier_patterns` + `_aggregate_patterns_for_room` now combine every pattern in the winning confidence tier: area ranges use the median across sources (robust to outliers), adjacency only keeps pairs corroborated by a real fraction of sources once there are enough to be picky about. The existing trust hierarchy is preserved exactly — a single high-confidence source still beats a pile of seed rows outright (a prior test pins this down); aggregation only kicks in *within* the winning tier.
- [x] `applied_pattern_count` now honestly counts every pattern that fed the aggregate, not just one per room type
- [x] Tests cover the escalation/blocked-detection logic directly (mocking at the `AsyncFetcher`/`StealthyFetcher` boundary, not `fetch_public_page` itself, since the rest of the scraper suite monkeypatches that wholesale), median aggregation across disagreeing sources, the adjacency support threshold, and single-source mentions still counting without corroboration
- [ ] The roadmap's bigger structured-extraction piece — a new `ScrapedProject` table, a real Spider crawler, and project-level fields (full room lists with per-room areas, plan descriptors) beyond the existing per-sentence `LayoutPattern` extraction — is not started. The aggregation pipe above already operates on the existing `LayoutPattern` table; a richer source table would feed it more (and better) data but isn't required for the aggregation logic itself to work
- [ ] Scheduled/background crawling, crawl queues, and the public scraper/source-management workflow for normal users remain out of scope (carried over from Sprint 10's deferred list)

**Phase 4 progress (Pillar D started — option gallery + muted palette):**
- [x] **Option gallery:** `generate_layout` already built 2-3 full candidate layouts per request (tile vs bsp for tiled types, x-offset variants for the row-band fallback) and discarded everything but the winner. `generate_layout` gained a `return_all_candidates` flag (default off, every existing call site unaffected); `/api/design/generate` now returns the losers as `alternatives` — never persisted, since only the winner is saved as the Design/DesignVersion. New `OptionGallery.tsx` renders a compact card per alternative (score, engine, room count, area) below the insights panel; clicking one swaps it into the canvas (`loadLayout` + `markDirty`, since picking an alternative doesn't auto-save it).
- [x] **Muted architectural palette:** `ROOM_COLORS` (backend) and `OBJECT_DEFAULTS`/`INITIAL_ROOMS` (frontend) were raw bright Tailwind 400/500 swatches — a "toy blocks" look. Every value is now that same hex run through one fixed HSL transform (saturation ×0.62, lightness +0.07), so the palette stays internally consistent (same relative hues/distinguishability) while reading as a muted architectural drawing instead of candy UI. `wall` deliberately untouched (structural marker, not a room identity color).
- [x] **Single-screen layout already satisfied:** checked the existing Project page structure before planning new work — canvas, Inspector, EditorToolbar, MetricsHud, prompt bar with collapsible plot params, and now the option gallery are already all on one screen with no route hops. Pillar D's "single-screen layout" ask needed no new work.
- [ ] Command palette (⌘K) — not started
- [ ] Dimensioned plan-view rendering with door swings — not started (door geometry itself is a Pillar F gap, see below)
- [ ] Parameter-sweep optioneering to get 6-12 candidates instead of the current 2-3 — not started; the gallery infrastructure is ready for it whenever the candidate count grows
- [ ] Pillar E (SVG/DXF/glTF export, production frontend build) — not started

Not yet started: the rest of Phase 4 (command palette, plan-view door swings, parameter-sweep optioneering, Pillar E export/hardening), Phase 5 (optional ML/IFC), Pillar F (3D modeling fidelity — see the roadmap doc's section 7a, flagged by the user but not yet phased).

### Sprint 18 — Master-brief roadmap continued 🚧 (new sprint line; Sprint 17 was getting overloaded)

> Per the user, further master-brief roadmap work moves to `sprint-18/...` branches rather than piling onto Sprint 17.

**Phase 4 (graph-driven layout)** (`sprint-18/phase4-graph-scoring`, off `sprint-17/phase2-program-graph` since it needs the ProgramGraph):

- *Slice 1 — graph-satisfaction scoring:* `planning/graph_scoring.py` measures how well a *generated* layout honours its ProgramGraph's MUST/SHOULD `adjacent` edges — deterministic AABB shared-wall geometry, weighted score, and the human-readable list of unmet MUST adjacencies. Wired additively into `/api/design/generate` as `metadata.graphSatisfaction` (schema field added so it isn't dropped).
- *Slice 2 — graph-aware candidate selection:* `generate_layout` already builds several candidates (tile/bsp/x-offset variants) and kept the highest quality score. Among the tiler/BSP candidates the winner key is now `(quality_score, adjacency_bonus)` — quality stays primary, adjacency realised breaks ties.
- *Slice 3 — a real graph-driven placement engine:* `_graph_pack_rooms` is a genuinely new engine (not a re-rank): the zone tiler honours adjacency only *within* a front/back row, so a MUST pair split across zones can never share a wall. The graph packer orders the **whole** room set by the adjacency graph (MUST-linked rooms consecutive, regardless of zone) and flows them into width-filling rows, keeping a MUST pair in one row — realising cross-zone adjacencies the tiler structurally can't, still zero-gap. It's added as an **extra competing candidate only when hard MUST constraints exist**, and it **replaces the tiler winner only when it realises strictly more MUST adjacencies at no quality cost** (a guaranteed improvement, never a quality regression). Demonstrated: `clinic where the reception is next to the consultation room` → tiler MUST 0/1 (q81), graph MUST 1/1 (q86), graph wins.

No existing candidate is generated differently and none removed. 18 new tests total; full backend suite 509 passed, zero regressions.

Deferred (Phase 4 remainder): richer graph-driven placement honouring `preferred_relative_position`/`requires_external_wall` and true BSP footprint slicing by adjacency cluster (the current packer clusters into rows). The scoring + selection + row-clustering engine land first; the full spatial solver is the larger follow-up.

### Sprint 19 - Release A: Safe Editor Interaction, Component Parity, and Progressive Editing Foundation

- [x] **Central component registry:** frontend component behavior now comes from `componentRegistry.ts` for all supported types: room, wall, door, window, stair, floor, open_space, corridor, lift, shaft, furniture, column, generic. The registry owns labels, defaults, create/select/move/resize/rotate policies, minimum dimensions, beginner/professional palette placement, inspector policy, and rendering treatment.
- [x] **Floor object policy:** `CanvasFloor` remains the level/floor concept; `objectType: "floor"` remains a legacy editable canvas object with explicit full lifecycle support instead of being silently dropped or converted.
- [x] **Safe selection and movement:** first left click on an unselected object selects only. Moving requires pressing an already selected object and crossing a 6px screen-space threshold. Active move uses transient store updates and commits one final history/activity/autosave action on release; pointer cancel/Escape restore a safe idle state.
- [x] **Navigation rules:** left mouse is reserved for selection/editing, right drag pans, wheel zooms, and middle drag orbits only in 3D. Context-menu prevention is scoped to the canvas container.
- [x] **Resize parity:** selected resizable objects show plan/top-view handles. Resize preserves type-specific minimums, floor elevation, footprint clamping, transient updates, and a single final history entry.
- [x] **Clipboard and history:** Ctrl/Cmd+C, Ctrl/Cmd+V, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y, Ctrl/Cmd+D, Delete/Backspace, and Escape share editable-target protection. Internal clipboard paste regenerates ids, targets the active floor, offsets progressively, selects the pasted object, and supports undo/redo.
- [x] **Inspector and ToolRail parity:** Inspector type options and field policies are registry-driven. Beginner tools show common components; More components exposes open space, lift, shaft, generic object, and legacy floor object.
- [x] **Persistence compatibility:** frontend serialization preserves all valid component types. Backend regression coverage verifies all 13 component types survive save, latest reload, version fetch, and public share.
- [x] **Verification:** frontend tests 120 passed, frontend TypeScript check passed, frontend production build passed, backend tests 551 passed. Local backend (`127.0.0.1:8000`) and frontend (`127.0.0.1:5173`) server smoke checks returned 200.
- [ ] **Manual browser acceptance:** visual in-app browser verification was blocked in this Codex session because no browser backend was available (`agent.browsers.list()` returned `[]`). The servers were started and healthy; complete visual beginner/professional acceptance remains pending in an environment with browser control.

### Sprint 20 - Reliable Sessions, Save Safety, and CI Protection

- [x] **Refresh-token session continuity:** frontend auth state now persists both the short-lived access token and the refresh token returned by login/register. Startup keeps the user authenticated when only the access token has expired and a refresh token remains valid, so the next protected request can refresh instead of immediately clearing the session.
- [x] **Single-flight Axios refresh flow:** protected 401 responses now share one in-flight `/api/auth/refresh` request, wait for rotation to finish, then retry each eligible original request once with the new access token. Auth endpoints, requests marked `skipAuthRefresh`, already-retried requests, and non-401 errors do not enter the refresh path.
- [x] **Safe failure behavior:** refresh failure clears auth state and redirects to `/login`; 403 authorization failures, 422 validation failures, 429 rate limits, 402 entitlement/usage limits, network failures, and backend 5xx responses surface through the caller without being treated as logout.
- [x] **Save/draft integrity:** manual layout saves and auto-save drafts resolve as saved only after the retried request succeeds. Failed refresh leaves manual saves in `error` while preserving unsaved canvas state, and draft failures leave `draftStatus: "error"` with recoverable in-memory work. Regression tests pin that a manual save after token refresh creates only one named version write and that draft saves remain separate from named versions.
- [x] **CI protection:** `.github/workflows/ci.yml` added for pushes to `main` and pull requests. CI runs backend dependency install + `pytest`, then frontend `npm ci`, `npm test`, `npx tsc --noEmit`, and `npm run build` without deployment or secrets.
- [x] **Verification:** frontend tests 153 passed, frontend TypeScript check passed, frontend production build passed, backend tests 558 passed. Focused session-expiry simulations cover concurrent 401s, refresh success/failure, retry limits, non-refresh status codes, autosave, manual save, and local input preservation.
- [ ] **Live browser acceptance:** deterministic automated tests cover the Sprint 20 session-expiry scenario; full live browser acceptance with a running app session was not performed in this Codex environment.

### Sprint 25 — Hosted LLM Swap & Generation Experience Redesign 🚧 In progress (mockup approved)

> Branch: `sprint-25/hosted-llm-and-generation-ui` (off `main`). Design direction:
> [`docs/EDITOR_3D_AND_SPACE_PLANNER_DIRECTION.md`](docs/EDITOR_3D_AND_SPACE_PLANNER_DIRECTION.md).
> Reference mockup: `docs/mockups/generation-redesign.html` (self-contained, open in a browser; Three.js loads from cdnjs).

- [x] Step 1 — Clickable redesign mockup approved by the owner: hero prompt card, staged generation progress with cancel, brief-review with answer chips, result state with a working alternatives gallery (fed by best-of-64 runners-up in production), honest save states, refinement playback with skip, a real Three.js **3D edit state** (walls with door openings cut in as real gaps — per the shared Gill Road floor-plan document — plus the commercial space-planner tools: café template, brand color picker, capacity planner, cost estimator, animated egress arrows, plan↔3D camera swing), and a scroll-driven 3D landing story ending in Revit/AutoCAD export messaging.
- [ ] Step 2 — Config-driven hosted LLM for extraction (AWS Bedrock OpenAI-compatible preset, plus Groq/Gemini/OpenRouter/local LM Studio presets; `LLM_API_KEY` + conditional `reasoning_effort`/model discovery/semaphore in `llm_client.py`; provider-neutral error strings). Replaces the local-model requirement — the owner's PC slowed when the local model ran.
- [ ] Step 3 — Production generation-UI rework per the approved mockup + direction doc (alternatives on `POST /api/generate`, accent token, motion system, dead-control fixes, 3D walls-with-openings per Pillar F).

### MVP Rework 🚧 — LLM-first pipeline per `ArchiAI_Implementation_Workflow_fable.md` (in-place, started 2026-07)

> The owner's MVP Implementation Workflow (prompt → **local LLM extraction** (LM Studio + Qwen3.5 9B on the host RTX 4060) → clarification → deterministic subdivision engine → quality+Vastu score → editable 2D SVG + the existing 3D editor with two-way sync → save/version → PNG/PDF/share/**IFC/DXF**) is being implemented **in place in this repo** (owner decision — not a greenfield sibling). Everything is additive: the legacy `parse_prompt → generate_layout` path, its 550+ tests, auth, workspaces, and billing remain untouched and green. Auth is KEPT (the workflow's "no accounts" was greenfield scope-cutting; ours is already built). Graph2Plan/fine-tuning/multi-candidate/native plugins stay excluded per the workflow.
>
> Key adaptation decisions: `LayoutPlan` (NW-origin, meters, walls/doors first-class, rotation ∈ {0,90,180,270}) is the MVP pipeline's canonical contract, with converters to the legacy center-based canvas JSON so the Sprint 19 editor renders it; **walls/doors are derived artifacts** regenerated deterministically from rooms after every edit; sizing table lives in `config/mvp_defaults.py` (not settings.py — env config vs product constants); branch-per-phase (`mvp/phaseN-*`).

- [x] **Phase 0 — env + locked contracts** (`mvp/phase0-contracts`): `schemas/requirements.py` (closed `RoomType` enum, StrictInt counts, string-number rejection, `extra="forbid"`, master_bedroom counting rule locked in the docstring), `schemas/layout_plan.py` (coordinate convention stated once), `schemas/quality_report.py`; `config/mvp_defaults.py` (9×12 m default plot, east default facing, 12-type room sizing table, public/private zoning sets); `frontend/src/types/contracts.ts` mirror; `/api/health` now reports `db` + `llm` separately (LLM down = feature-degraded, not app-down); `LLM_BASE_URL` setting + compose `extra_hosts: host.docker.internal:host-gateway` + container env; `tests/golden_prompts.json` (10-prompt acceptance suite incl. junk + injection), 5 requirement fixtures (1BHK–clinic; clinic uses `study` as consultation stand-in — closed-enum limitation, documented), `fixtures/lmstudio_smoke.sh`; 20 new tests.
- [ ] **Step 0.2 (owner, host machine):** install LM Studio, download Qwen3.5 9B Q4_K_M, max GPU offload + ctx 4096, enable "Serve on Local Network", disable JIT auto-unload, run `lmstudio_smoke.sh` 5×. Gates Phase 2's live tests; Phases 0/1 are LLM-free by design.
- [x] **Phase 1 — subdivision engine v0 + hard validator** (`mvp/phase1-engine`): `services/layout_engine/` — `geometry.py` (1 mm-epsilon Rect: overlaps/contains/shared_edge, corner contact ≠ adjacency), `subdivision.py` (balanced area-weighted guillotine: order-preserving halving, longer-side cuts, min-area clamped, facing-anchored so entry pulls to the facing edge; zero gaps/overlaps by construction), `engine.py` (expand+auto-entry → public/private facing bands → subdivide → leaf min-size gate → **deduplicated walls** (one per shared edge + boundary) → doors: `must`-adjacency first, then a BFS spanning tree from the circulation room so the access graph is connected by construction, narrow-door fallback, front door on the entry's facing wall; structured `DoesNotFitError` for undersized plots). `services/quality/hard_constraints.py` — pure fast validator: overlap / out_of_bounds / below_min_size / door-graph reachability. `services/export/render.py::layout_to_svg` + `scripts/render_debug.py` (all 5 fixtures render; 3BHK: 11 rooms / 34 walls / 12 doors). **Go/no-go gate passed:** Hypothesis property suite (200 random specs, derandomized) — the engine either returns a plan with zero hard violations or refuses with DoesNotFit, never broken geometry; the gate immediately caught (and we fixed) independent x/w rounding drift creating phantom 1 mm overlaps — edges are now rounded, widths derived. v0 limitations: single storey (floors>1 flattens), rotation always 0. New dev dependency flagged: `hypothesis==6.112.0`. 29 new tests.
- [x] Phase 2 — extraction · Phase 3 — clarification · Phase 4 — API/DB wiring · Phase 5 — 2D SVG editor · Phase 6 — scorer + data-driven `vastu_rules.json` · Phase 7 — two-way sync + 90° rotation all completed and verified (see `CLAUDE.md`'s per-phase detail for file/test breakdown — this file's Phase 2–7 line was not kept granular in step with Claude's log and is condensed here as a catch-up note rather than backfilled). Phase 8 — server-side PNG/PDF + share pinning + DXF/IFC (deps `cairosvg`/`ezdxf`/`ifcopenshell` to be flagged when added) · Phase 9 — hardening: still not started, intentionally paused pending the Packet 7.1+ quality gate below.

### Packet 7.1 — Program Truth Gate (post-Phase-7 quality gate, prerequisite to `archiai_engine_generalization_workflow.md`)

- [x] **Extraction fix:** `services/extraction.py::_explicit_count` missed hyphenated count-adjective forms ("2-bedroom") because it required whitespace (`\s+`) between the number and its noun — a live-tested brief extracted 1 bedroom instead of 2. Separator widened to `[\s-]+`; regression test added with the exact failed prompt. "2 bedrooms"/"two bedrooms"/BHK forms were already correct and remain so.
- [x] **Completeness hard-gate:** `services/quality/hard_constraints.py::validate` takes an optional `requirements` param; a requested room type/count short in the generated layout is now a hard violation (`missing_requested_room`), so quality can no longer call an incomplete layout satisfactory. Optional param — the fast `/api/validate` editor path and existing `validate(plan)` callers are unchanged; only `quality/scorer.py` passes requirements through.
- [x] **Verification:** backend `pytest app/tests -ra` — 707 passed, 3 expected live-LM skips, 0 failed. Frontend `npm test -- --run` — 271 passed / 54 files, 0 failed. Live check against running LM Studio (`qwen/qwen3.5-9b`) on the exact failed prompt: 2 bedrooms, 2 bathrooms, plot 12×15 m, east-facing — correct. Commit `4c9ad6f` on `mvp/phase7-two-way-sync`, not merged/pushed.
- [ ] **Deferred:** Packets 7.2–7.9 / `archiai_engine_generalization_workflow.md` (SpaceCatalog, ProgramGraph-as-canonical-input, archetypes, circulation, candidate search, rule packs, multi-floor) — none started.

### Phase 7 close-out — editor UI fixes and manual 3D resize QA

- [x] Four editor UI fixes, each its own commit: 3D context card no longer shows while already in 3D Edit (`b4fcb9e`); tool rail unified to one labeled style across all views instead of two different looks (`a15d964`); dimension-label overlap on a selected room fixed by removing a duplicate area readout and widening label spacing (`be64b77`); Space Program panel's leftover gap after the context-card fix closed by dropping its stale position override (`6abf93f`). Each verified with `tsc --noEmit`, full frontend suite (271/54, 0 failed), and `npm run build`.
- [x] **Manual 3D resize-grip QA** (closes the item Phase 7 left open): verified via direct geometry reads on the `trial` project — 3 of 4 corner handles confirmed as genuine resizes (not moves) across two rooms, including one footprint-clamped case; the 4th handle's hitbox couldn't be reliably isolated from neighboring rooms in this remote session, though all 4 share one function differing only by a sign constant. Undo restored exact bit-for-bit values across 6+ attempts; Redo re-applied a resize bit-for-bit. Save + full page reload preserved resized geometry to full float precision. Incidentally confirmed the Packet 7.1 `missing_requested_room` check firing correctly on this project's own pre-existing 2-bedroom-requested/1-bedroom-saved data. Test edits were reverted and `trial` re-saved to its original state.
- [x] Full suites re-verified after this pass: backend 707 passed / 3 expected skips / 0 failed; frontend 271 passed / 54 files / 0 failed.
- [x] **Review gate: CLOSED.** Phase 7 complete. Not merged to `main`; pushed only to `origin/mvp/phase7-two-way-sync`.

### Packet 7.2 — Engine Benchmark and AVOID-adjacency finding (`packet7.2/engine-benchmark-audit`)

- [x] Real (not estimated) baseline: `backend/scripts/benchmark_acceptance_prompts.py` runs the 6 acceptance prompts through the production `parse_prompt -> generate_layout` path. Scores 51-87, deterministic (fixed a false non-determinism reading caused by comparing fresh per-run UUIDs instead of geometry), AVOID-adjacency violations in 5/6 prompts.
- [x] Root cause: `_order_zone_rooms`/`_chain_by_adjacency` only consider must/should pairs; AVOID is a post-placement score penalty only, never a placement input.
- [x] Attempted a bounded fix (extend the MUST-pair cross-row repair to AVOID pairs too); live-tested, found it doesn't work when the conflicting type has 2+ instances (moving one still leaves another adjacent); also found the fix targeted `_graph_pack_rooms`, a candidate that never even runs without MUST pairs. Reverted cleanly rather than ship a no-op.
- [x] Full finding written into `archiai_engine_generalization_workflow.md` §0.4 so the next attempt doesn't redo this diagnosis.
- [x] Backend suite unchanged: 707 passed, 3 expected skips, 0 failed. No engine code changed.
- [ ] No code fix shipped for the AVOID-adjacency gap in this packet — audit-only by design; a real fix needs Phase 4 (circulation) or Phase 5 (search), not a patch.

### Phase 1 — SpaceCatalog (`phase1/space-catalog`)

- [x] `backend/scripts/audit_catalog.py`: real diff of ROOM_SIZING (12 residential types) vs BASE_SIZES (37 free-string types) — 11 of 12 overlapping types conflict on area, only bedroom already agreed.
- [x] `app/services/catalog/space_catalog.py`: single free-string-keyed `SpaceType` registry (37 entries). Resolution rule: BASE_SIZES wins area, ROOM_SIZING wins min_w/min_d where both exist; derived minimums (near-square, 60% of area, floored at 1.2m) for BASE_SIZES-only types. `get()`/`resolve_alias()` never guess (UnknownSpaceType + difflib suggestion); `register()` is the runtime-extension escape hatch.
- [x] Purely additive — nothing existing imports or is imported by it yet.
- [x] `test_space_catalog.py`, 28 tests: every RoomType enum value round-trips, all 5 existing fixtures resolve untouched.
- [x] Full suite: 735 passed (707 + 28 new), 3 expected skips, 0 failed.
- [ ] Not done: schemas/requirements.py, layout_engine, quality/*, and the frontend contract don't consume the catalog yet — that's Phase 1.2 onward, not this slice.

**Phase 1.2 — SpaceRequest/spaces:**

- [x] `SpaceRequest` + `RequirementsSpec.spaces` added additively (default `[]`); `rooms`/`RoomType` unchanged. `spaces_from_rooms()` maps every RoomType value losslessly.
- [x] Fixed 3 test_mvp_api.py assertions broken by the new field's legitimate presence in persisted JSON (compared raw fixture vs serialized model) — updated expected values, not the schema; confirmed via a full-suite search that no other comparison needed the same fix.
- [x] Full suite: 747 passed (735 + 12 new), 3 expected skips, 0 failed. One transient scraper-test failure batch did not reproduce on rerun — confirmed unrelated.
- [ ] Still nothing consumes `spaces` for generation/scoring yet.

**Phase 2.1 — EngineProgram bridge (stacked on Phase 1.2, same branch):**

- [x] `EngineProgram` dataclass + `to_engine_program()` in `planning/program_graph.py` (exported via `app.services.planning`): id-keyed `needs: list[RoomNeed]`, `zone_of`/`floor_of`, id-level `must_adjacent`/`should_adjacent`/`avoid`, `circulation_nodes`, `entry_node`. `engine.py` untouched — purely additive, no behavior change.
- [x] Sizing precedence: explicit node area/minima > new `Node.size_hint` x multiplier (nothing produces it yet, added ahead of its producer like `SpaceRequest.size_hint` was) > catalog default > `width x depth` fallback for an unresolvable space_type. Hard minima never scale with size_hint.
- [x] Adjacency bucketing is id-level, not type-level — fixes the exact bug Packet 7.2 diagnosed (two bedrooms no longer collapse onto one `("bedroom","bathroom")` pair).
- [x] `test_engine_program.py`, 16 tests: sizing precedence tiers, id-level must/avoid, zone/floor coverage, circulation_nodes, entry_node incl. None case, buildable-node filtering.
- [x] **Verification caveat:** `pytest` could not run this session — `conftest.py` forces `app.main` -> scraper router -> `scrapling` -> `browserforge` header generation, which now raises (pinned `chrome_version=148` has zero matches in the current fingerprint dataset). Confirmed pre-existing, unrelated to this change, blocks the whole suite's collection (tried a browserforge downgrade, still fails). Verified instead by running every assertion directly against the real modules (no mocks): new tests all pass, plus spot-checked golden `test_program_graph.py` round-trip/identical-layout and `test_space_catalog.py` checks still pass. Re-run via `pytest` once the scrapling pin is fixed.
- [ ] Not done: `engine.py` doesn't consume `EngineProgram` yet (Phase 2.2), no `from_requirements()` builder, no auto-entry-as-graph-rule (`program_completion.py`).

**Phase 2.2a — from_requirements() adapter (stacked on 2.1, same branch):**

- [x] `from_requirements(spec) -> ProgramGraph` in `planning/program_graph.py`, parallel to the other adapters. Uses `spec.spaces` when populated, else normalizes `spec.rooms` via `catalog.spaces_from_rooms()`. `spec.adjacency`/`avoid_adjacency` are still RoomType-keyed, so each pref resolves to its catalog key before matching nodes — id-level, every matching pair gets its own edge (verified: 2 bathrooms x pooja_room avoid = 2 edges, not 1).
- [x] Deliberately does not auto-inject entry — `engine._expand()`'s hack stays put until 2.2b replaces it with a real graph completion rule.
- [x] 6 new tests in test_engine_program.py (22 total): spaces-over-rooms precedence, no-auto-entry, enum-to-catalog-key alias (clinic's entry->foyer), id-level avoid bucketing, full round-trip on the 3bhk_adjacencies fixture.
- [x] Verification: same pytest blocker as 2.1 — verified via direct script execution, plus reran all Phase 2.1 checks and the golden test_program_graph.py suite to confirm no interference. All pass. Scrapling/browserforge fix spawned as its own separate task.
- [ ] Not done: engine.py still calls `_expand(spec)` unchanged — 2.2b (the byte-identical-output swap) is next.

**Phase 2.2b — engine.py consumes the graph pipeline (stacked on 2.2a, same branch):**

- [x] `_expand(spec)` is now `ensure_entry(from_requirements(spec))` -> `to_engine_program(graph).needs`. `generate_plan()` output verified byte-identical (ids aside) against a real pre-refactor snapshot for all 5 fixtures.
- [x] **Revised 2.2a's design after finding 2 real conflicts:** (1) catalog area != ROOM_SIZING area for 11/12 types — `from_requirements`'s rooms branch now sets explicit sizing from ROOM_SIZING directly instead of going through spaces_from_rooms/catalog. (2) engine.py's own zoning (`RoomType(need.type) in PUBLIC_ROOM_TYPES`) requires raw RoomType values, not catalog-aliased keys — rooms branch now uses raw values ("dining" not "dining_room"), so 2.2a's `nodes_by_key`/`ensure_entry` design (which assumed catalog keys, e.g. "foyer") got corrected to raw values ("entry"), with a fallback to catalog keys for the spaces path. Updated 2.2a's own tests to match. Side-fixed a small pre-existing classification gap (`_PUBLIC_TYPES`/`_SERVICE_TYPES` were missing "dining"/"parking" as raw synonyms, mirroring the existing entry/foyer, utility/laundry pairs).
- [x] `planning/program_completion.py` (new): `ensure_entry()` replaces the old inline auto-entry hack.
- [x] **Real bug caught by the golden-diff, not by the existing invariant tests:** 4bhk's door count differed (15 vs 14) after wiring in — root cause is `_place_doors`'s BFS tie-break sorting room key strings lexicographically, so the graph's "node-3" id scheme picks different doors than the legacy "r1".."rN" scheme even though geometry is otherwise identical. Fixed by remapping needs' keys back to r1..rN before subdivision. New permanent test (`test_room_ids_follow_the_legacy_r_n_scheme` in test_mvp_engine.py) pins this, since the file's existing tests are invariant-only by design and would not have caught it.
- [x] Also hit and fixed a genuine circular import (layout_engine/__init__ -> engine.py -> planning -> program_graph.py -> layout_engine.subdivision, re-entering layout_engine mid-init) by deferring the RoomNeed import inside to_engine_program() to call time.
- [x] Verification: golden snapshot diff (5 fixtures), every test_mvp_engine.py test rerun directly (valid-plan, fills-plot, determinism, entry-facing, attached-bathroom, wall-dedup, doors, DoesNotFitError, rebuild_derived_geometry), the real 200-example derandomized Hypothesis go/no-go gate (0 failures), plus test_engine_program.py/test_program_graph.py/test_space_catalog.py/test_mvp_contracts.py via direct reflection. test_mvp_api.py/test_mvp_clarification.py need the blocked DB fixture — import clean, assertions not rerun, flagged as residual risk.
- [ ] Not done, on purpose: `_order_group` still matches `spec.adjacency` by type, not `program.must_adjacent` by id — doing that id-level fix now would change which bathroom gets attached in 3bhk_adjacencies (2 bathrooms, 1 must-pair), breaking byte-identical output. Needs its own slice with its own acceptance test.

### Engine generalization workflow — current merged/stacked status

- [x] Phases 1–3: SpaceCatalog/contract migration, ProgramGraph engine input, and layout archetypes are merged to `main`.
- [x] Phase 4: real corridor geometry, circulation-rooted doors, AVOID vetoes, and the `through_room_access` hard rule are merged to `main`.
- [x] Phase 5.1: deterministic best-of-64 candidate search is merged to `main`.
- [x] Phase 5.3 continuation (`codex/phase5-refinement-negotiation`): production MVP generation now uses candidate search and fit errors return concrete trade-offs. Full backend gate: 905 passed, 3 expected live-model skips.
- [x] Phase 6 (`codex/phase6-rule-packs`, stacked on Phase 5): `services/quality/packs/` owns pack activation and weights; generic, residential, healthcare, workplace, hospitality/education, and opt-in Vastu packs are live. Frontend quality guidance groups arbitrary pack keys. Full gates: backend 914 passed/3 skipped; frontend 272 passed, typecheck and production build clean.
- [x] Phase 7 (`codex/phase7-multi-floor`, stacked on Phase 6): graph-aware floor assignment, aligned pre-carved stair/lift cores, per-floor canonical geometry, vertical reachability, wet-stack/floor-balance scoring, and existing `LevelMenu` canvas integration are complete. The named two-storey, three-floor hotel-style, and `4bhk.json` acceptance programs pass.
- [x] Phase 7 gates: backend 944 passed/3 expected skips; frontend 273 passed across 54 files; typecheck and production build clean; 300 deterministic randomized 2–3-floor briefs returned 262 valid plans and 38 honest fit refusals with zero invalid plans.
- [x] Phase 8 (`codex/phase8-requirements-extraction`, stacked on Phase 7): catalog-native arbitrary programs, self-describing unknown-space metadata, low-confidence clarification, free-string relationships, catalog-aware parser recovery, and canonical frontend routing are complete.
- [x] Phase 8 gates: 24 golden briefs include 15 non-residential programs; all 15 generate valid layouts on a fit plot. Backend 970 passed/3 expected live-model skips; frontend 274 passed across 54 files; typecheck and production build clean.
- [x] Phase 9 (`codex/phase9-engine-hardening`, stacked on Phase 8): sanitary rooms receive corridor-served geometry, specialized archetypes hard-validate with one safe fallback, 13 parser-template building fixtures have complete golden plans/scores, and CI publishes the single-shot versus best-of-64 benchmark matrix.
- [x] Phase 9 gates: all four archetypes pass 80 deterministic catalog-program property cases; the hand-coded landlocked-bath plan pins privacy-chain, wet-room exterior, and Brahmasthan diagnostics; all 13 fixtures rebuild editor geometry; backend 1,011 passed/3 skipped, frontend 274 passed, typecheck and production build clean.
- [x] Phase 10.1 (`codex/phase10-hierarchical-archetypes`, stacked on Phase 9): qualifying non-private repeat programs partition into zone-tagged archetype regions around one shared circulation spine; service dependencies remain with their anchors; canonical and editor contracts preserve zone/reason metadata without changing ordinary serialized plans.
- [x] Phase 10.1 gates: the composed school produces double-loaded classroom and open-core regions from all four facings with zero hard violations and deterministic search. It matches the Phase 9 quality score at 100, reduces doors from 23 to 12, runs best-of-64 in about 0.19 s, and leaves the complete Phase 9 golden matrix byte-identical. Backend 1,021 passed/3 skipped; frontend 275 passed; typecheck and production build clean.
- [ ] Phase 5.2 simulated annealing remains deliberately deferred: best-of-64 is never worse than single-shot across the 13-fixture benchmark and remains far below the 3-second ceiling, so the workflow's benchmark gate does not justify another optimizer yet.
- [ ] Phase 10.1 deliberately activates only the proven repeat/service/core/support shape on rectangular single-floor programs. Arbitrary-depth graph partitioning, multi-floor composition, and a visible region-overlay UI require their own fixtures and gates.
- [ ] Multi-floor polygon boundaries remain an explicit unsupported combination, not a silent bounding-box fallback.

---

## Development Rules

- **Never hardcode secrets.** All credentials and keys go in `.env` (gitignored). Use `.env.example` for documentation.
- **Never credit AI as a contributor.** No `Co-Authored-By` trailers naming AI models (Claude, Codex, Copilot, etc.) in commit messages, and no AI-identifying author/committer emails — commits always use the human owner's git identity.
- **Never push directly to `main`.** Use feature branches. Branch naming: `sprint-1/feature-name`.
- **Write tests before or alongside code**, not after.
- **Every significant action must be logged.** Canvas edits, generation events, team changes — all go to `ActivityLog`.
- **Keep modules separate.** Frontend, backend, AI logic, scraper, and logging are distinct. Do not mix concerns.
- **No TODOs in committed code.** If something is deferred, document it in the sprint spec or a GitHub issue.
- **Mouse drag-and-drop in the 3D canvas must work directly.** Inspector editing is a complement, not the primary UX.
- **Auto-save must never overwrite named version history.** Drafts are separate from named versions.

---

## Environment Setup

```bash
git clone https://github.com/samarth080/archiai-saas.git
cd archiai-saas
cp .env.example .env
docker-compose up
```

- Backend: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`
- Frontend: `http://localhost:5173`

---

## Key Docs

| Document | Purpose |
|---|---|
| `docs/PROJECT_STRATEGY.md` | Full product strategy, all 20 sections |
| `docs/EDITOR_3D_AND_SPACE_PLANNER_DIRECTION.md` | Owner-approved 3D-editor + commercial space-planner design direction (Sprint 25+) |
| `docs/superpowers/specs/2026-05-23-sprint1-auth-design.md` | Sprint 1 detailed design spec |

---

## Contact / Ownership

Project: ArchiAI
Repo: `github.com/samarth080/archiai-saas`
Lead: samarth080
