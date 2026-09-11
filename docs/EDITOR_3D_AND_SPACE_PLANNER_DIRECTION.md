# Editor 3D & Space-Planner Design Direction

Owner-approved direction (2026-09-12) that governs the Sprint 25 generation-UI
rework and the 3D/editor work that follows it. Two source ideas are fused into
one consistent design language; the clickable mockup at
[`docs/mockups/generation-redesign.html`](../mockups/generation-redesign.html)
is the reference implementation of this direction.

## Source ideas

1. **Shared 3D floor-plan document** (`gill-road-office-3d-floor-plan.html`,
   user-provided): a real, orbitable Three.js model — walls are built as runs
   with door/slider/shutter openings **cut in as real gaps** (lintel above,
   colored sill marker below), rooms are labeled slabs, clicking a room shows
   what it connects to and by which opening type, levels can be toggled and
   "exploded", wall height is adjustable, and the plan reads like a drawing
   sheet with a legend and inspector.
2. **Commercial space-planner design brief** (user-provided prompt): a 3D
   planner for cafés, small offices, and boutique retail — templates (café /
   co-working / boutique / restaurant), a capacity planner (seats per m², fire
   egress), a user-pickable brand color applied across branded elements live,
   a cost estimator with rough furniture/fixture totals, animated egress
   arrows when "show fire safety" is on, a smooth camera swing between
   top-down plan and 3D perspective, and a blueprint-grid background.

## Merged design decisions (what "consistent" means)

- **Palette:** charcoal base (the app's existing graphite ladder), **warm
  white** walls (`#d8d2c4` family), **oat** wood/fixtures (`#cdbb98`), muted
  sage/teal services — and **one user-pickable brand accent** (default: the
  app's purple `#7663D7`) applied to branded elements only (chair/stool seats,
  counter front, signage, packaging). Status/safety colors stay semantic
  (egress = green, doors = red) regardless of brand color.
- **Typography:** Archivo (contemporary geometric sans — headings and UI) +
  IBM Plex Mono (all numbers: dimensions, areas, scores, costs, capacity).
- **Background:** subtle blueprint-tinted grid behind the 3D scene, on the
  charcoal base.
- **3D truth:** doors and windows are real openings cut into wall runs (not
  thin marker boxes) — this is the concrete target for the existing "Pillar F
  — 3D modeling fidelity" gap in the 10x roadmap.
- **Inspector continuity:** clicking a room slab highlights it and lists its
  connections (via which opening type), reusing the app's graphite panel
  style — the Gill Road inspector convention in the app's chrome.
- **Commercial programs:** the café unit in the mockup (16 × 9 m: guest floor,
  prep kitchen, store, WC, storefront glazing + entry door) is the reference
  program; the deterministic engine's catalog already supports arbitrary
  space types, so café/co-working/boutique/restaurant templates map to
  catalog + archetype data rather than new engine code.
- **Costs:** rough furniture/fixture totals in ₹ (India-first, Razorpay
  billing); line items update live as furniture is placed/removed.

## Production mapping (Sprint 25 Step 3 and follow-ons)

| Mockup element | Production home |
|---|---|
| Real walls with cut openings | Canvas 3D renderer: build wall runs from room adjacency + door policy (Pillar F; doors already exist in layout JSON) |
| Room slab click → connections | Inspector adjacency tab, fed by the door graph the engine already produces |
| Brand color picker | Editor setting; recolors a `branded` material group (chairs/counter/sign) live |
| Capacity planner | Client-side: seats from furniture objects vs egress limit (area / 1.1 m², adjustable) — advisory, not a hard engine rule |
| Cost estimator | Side panel with a per-item cost table; totals update on place/remove |
| Egress arrows | Toggle that animates flow arrows along the shortest path to the exit door (graph path already exists from the reachability work) |
| Plan ↔ 3D camera swing | Animate the existing OrbitControls between top-down and perspective poses |
| Templates | Quick-start briefs + building templates for café/co-working/boutique/restaurant |
| Landing scroll story | Scroll-linked build-up of the generated model (describe → generate → edit → export), ending in DXF/IFC/DWG export messaging (see `EXPORT_AND_BIM_ROADMAP.md` for the Revit/AutoCAD interop path) |

## What is intentionally NOT in this direction yet

- Furniture-set swapping between templates (mockup toasts honestly) — needs a
  furniture library decision.
- True multi-floor explode/wall-height tooling in the production canvas (the
  mockup is single-storey; the Gill Road document remains the reference for
  multi-level UX).
- Real-time collaboration on the 3D scene.
