# Architecture

One product loop, one engine, one geometry contract.

```
brief text ──► /api/extract ──► RequirementsSpec ──► /api/generate ──► LayoutPlan ──► editor (2D / 3D)
                (LLM + rules)                         (deterministic)                   │  edit rooms, set
                                                                                        │  wall/door/open
                              quality report + re-derived walls/doors ◄── /api/validate ◄┘
```

## Backend (`backend/app`)

| Package | Role |
|---|---|
| `api/mvp` | `/api/extract`, `/api/generate`, `/api/validate`, MVP versions |
| `api/designs` | saved canvas layouts: latest, save (named version), auto-save draft, fetch version |
| `api/projects`, `api/workspaces`, `api/shares`, `api/auth`, `api/billing` | CRUD, membership, public read-only links, JWT, plans/quota |
| `services/extraction.py` + `services/llm_client.py` | brief text → `RequirementsSpec` (OpenAI-compatible LLM, rule fallback) |
| `services/clarification.py` | decide *generate* vs *ask a question*; apply defaults |
| `extraction._reconcile_program` | last pass after the model: merge the same room named twice, take bathroom counts from the brief's own words, drop rules about rooms that aren't in the program |
| `services/planning` | `RequirementsSpec` → `ProgramGraph` → `EngineProgram` (rooms, zones, adjacency) |
| `services/layout_engine` | `EngineProgram` → `LayoutPlan`: archetype bands, guillotine subdivision, walls, doors, best-of-N search |
| `services/quality` | hard constraints (overlap, bounds, reachability, privacy chain) and soft scoring rule packs |
| `services/layout_adapter.py` | `LayoutPlan` → the editor's canvas JSON that designs are stored as |
| `services/catalog` | the space catalog: every room type's zone, privacy, sizes, aliases |

Dependency direction: `api → services → schemas`. `layout_engine`, `planning`
and `quality` are pure (no DB, no HTTP).

### The geometry contract: `schemas/layout_plan.py`

- `PlanRoom` — axis-aligned rectangle (or polygon via `vertices`), metres, NW origin.
- `Wall` — one per shared edge plus boundary walls. `rooms` names the two rooms an
  interior wall separates. `kind: "open"` means no wall at all (open plan); the
  edge stays in the list so the validator counts it as a connection.
- `Door` — hosted on a wall by `wall_ref` + `offset`.
- `Connection` — the user's choice for a room pair: `wall`, `door` (with `at`,
  0..1 along the edge) or `open`. Stored in `LayoutPlan.connections`.

- `LayoutPlan.footprint` — where the building sits on the plot (the rest is
  yard). The engine sizes the house to its rooms ×1.3 and grows it toward the
  full plot only if the program doesn't fit (`plan_on_plot`).

Walls and doors are **derived**. `rebuild_derived_geometry` recomputes them from
rooms after every edit, honouring `connections`. Outside walls are the stretches
of room edges no other room covers.

### What a plan must pass (hard checks)

No overlaps; inside the plot; minimum room sizes; every room reachable from the
entrance; no room reachable only through a bedroom (an en-suite through its own
bedroom is fine when another bathroom is reachable directly); every requested
room present; every "must connect" in the brief met; balconies, terraces,
porches and verandas on an outside wall, and the ground-floor entry too.

In homes (house, apartment, villa, duplex), also: no room reachable only by
walking through a bedroom, bathroom, kitchen, laundry, utility room, garage or
store (`walk_through_room`). Closets (store, pantry, laundry, utility) may sit
behind the room they serve, and a room the brief attaches on purpose may sit
behind its partner (an en-suite behind its bedroom), never the reverse.

The best-of-64 search only returns plans that pass; otherwise the brief is
refused with the rule that failed.

### How doors are chosen

1. User `door` connections, where the user put them.
2. `must` adjacencies, matched one-to-one: "each bedroom has its own bathroom"
   gives every bedroom a door to a bathroom of its own.
3. A spanning tree from the circulation room, growing out of public rooms first,
   then kitchens/laundries/garages, and through a bathroom or bedroom only as a
   last resort. An en-suite is never a bedroom's way in, and never the
   corridor's link to the house. Open-plan edges count as already connected,
   so living/dining/kitchen/entry need no doors.
4. If every bathroom ended up an en-suite, one also gets a door onto a public
   room or the corridor, so nobody has to cross a bedroom to reach a bathroom.
5. One front door on the ground floor: the most public room with an outside wall,
   street side preferred.

User `wall` connections and spec `avoid_adjacency` pairs never get a door.

## Frontend (`frontend/src`)

| Area | Role |
|---|---|
| `pages/Project` | the editor page: brief → review → generate → edit → save |
| `store/canvasStore.ts` | editor state: canvas objects, floors, metadata, undo history, save/draft status |
| `store/connections.ts` | pure helpers: upsert a room-pair connection, snap a door along its wall |
| `services/mvpLayoutAdapter.ts` | `LayoutPlan` ⇄ canvas objects, plus `edgesFromLayout` |
| `hooks/useMvpQualityValidation.ts` | debounced `/api/validate` after each edit; swaps in re-derived walls/doors |
| `components/canvas/Plan2D*` | SVG floor plan (primary editor) |
| `components/canvas/Canvas3D`, `RoomMesh` | React Three Fiber: real walls with door openings, rooms as floor slabs |
| `components/canvas/RoomConnections` | Wall / Door / Open switch per neighbour of the selected room |
| `components/canvas/roomGraphModel` + `useAccessGraph` | the access graph: synced edges with the user's newer choices laid over them, depth from the entrance, routes, and reasoning findings (unreachable, only-through-a-bedroom, private room opened to public) |
| `components/canvas/RoomGraphView`, `ZoningView` | justified access graph (click a line to cycle wall/door/open) and how each zone is entered, both recomputed on every change |

Canvas metadata carries `mvpRequirements`, `mvpQuality`, `mvpEdges` (how each
room pair meets, from the last sync) and `mvpConnections` (the user's choices).

## Persistence

PostgreSQL via SQLAlchemy async + Alembic (`backend/alembic/versions`, head `016`).
Designs store the canvas JSON; each save creates a `DesignVersion`; auto-save
writes a separate draft that never overwrites named versions.
