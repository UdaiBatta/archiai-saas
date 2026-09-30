# Progress

Build progress against the phased plan (3D-first site massing, housing and
interior planning; AI as a secondary layer). Ticked = merged or in an open PR.
Full plan and competitor map: [roadmap.html](roadmap.html) (published as the
"ArchiAI Roadmap" page); after ticking items here, run
`python docs/sync_progress.py` to copy them into it. Near-term engine
work lives in [ROADMAP.md](ROADMAP.md).

_Last updated: 2026-09-30_

## Foundation: layout engine quality — PR #44 (merged)

- [x] Home quality suite: 26 real briefs, baseline pinned in tests
- [x] Daylight hard rule: bedrooms, living rooms, kitchens touch an outside wall
- [x] Entry and outdoor rooms stay on the street side / outline
- [x] Squarer rooms: proportion score and shape-aware cutting
- [x] Windows placed by the engine (one per room that needs light)
- [x] 3D sun follows a time-of-day slider
- [ ] Split the shared wet slot (bathrooms ~1.5 x 4.3 m)
- [ ] Stack bathrooms over wet rooms on multi-storey homes
- [ ] Broader room-order search on polygon plots

## P1: Professional 3D workspace — PR #45 (in progress)

- [x] White model: matte walls, crisp edges, pale room-floor tints, glass windows
- [x] Ambient occlusion and soft sun shadows fitted to the site
- [x] Site ground with grid, plot pad and boundary line, north arrow
- [x] View cube
- [x] Perspective / Axo / Top (orthographic, north up) views framing the site
- [x] Hide or ghost other floors on multi-storey plans
- [x] Setback lines on the ground (with P2's site rules)
- [x] No ghost trails in Top view after visiting Persp/Axo
- [x] Camera frames the whole site and its masses
- [x] Saved views: named cameras saved with the project (restore, rename, delete)
- [x] Dimensions and room labels in Top view
- [x] Editing in Top view: move, 8 resize grips, polygon corners, doors and windows, undo
- [x] Keyboard selection in Top view (Tab, Enter/Space) and tooltips on small rooms
- [x] Top view reads as a drawing (no shadows or ambient occlusion)
- [x] Retire the separate 2D editor: the 2D Plan tab opens Top view
- [x] Frame budget: ~8 ms/frame orbiting the 3-bedroom example on an integrated GPU (was ~17 ms)
- [ ] Re-measure on a 4-bedroom home
- [x] Drags stay light: only the validator and the moved room re-render (PR #48)
- [x] One bottom dock for tools, views, lenses, site, massing, sun (PR #48)
- [x] Camera frames the building in the space the chrome leaves clear (PR #48)
- [x] Rooms may overhang the plot (balconies); plot line still reported (PR #48)
- [x] Account menu and settings page (profile, password, preferences, plan) (PR #48)
- [ ] On-screen zoom buttons in Top view

## P2: Site & massing — PR #47 (in progress)

- [x] Site from the plot, drawn in Top view, or imported (GeoJSON, DXF); drag its corners
- [ ] Map tile underlay
- [ ] Add or remove corners on an existing site or mass
- [ ] DXF arcs and curves (today replaced by their chords)
- [x] Per-edge setbacks, height limit, coverage and FAR as site rules
- [x] Masses: add, fill the envelope, draw; push/pull floors; move and reshape in Top view
- [x] Live metrics panel: GFA, FAR, coverage, height, floors against the limits
- [x] Zoning warnings in 3D with a reason and a one-click fix (trim, height, FAR, overlap)
- [ ] Automatic fix for over-coverage
- [ ] Timed test: parcel to a compliant mass in under 5 minutes

## P3: Housing + interior inside the mass

- [ ] Engine fills massing floor plates around a core
- [ ] Unit mix targets with yield readout
- [ ] Instant re-solve on mass edit, honouring locked rooms and units
- [ ] Furniture layouts checked against clearances

## P4: AI assistant panel (secondary)

- [ ] Brief to three scored options
- [ ] Explain a rule violation with the engine's fix
- [ ] Suggest alternatives for a selected room or unit
- [ ] Every AI action is an ordinary, undoable edit

## P5: Analysis

- [ ] Sun-hours heatmap on facades and ground
- [ ] Per-room daylight check tied to the daylight rule
- [ ] View analysis per window

## P6: Collaboration

- [ ] Comments pinned to 3D points, rooms and units
- [ ] View-only share links with a saved camera
- [ ] Boards: live model frames, metrics cards, notes
- [ ] Real-time multiplayer

## P7: Interop — PR #46

- [x] DXF for AutoCAD (R2013, mm, AIA layers)
- [x] IFC4 for Revit / ArchiCAD (walls, openings, doors, windows, spaces with areas, slabs)
- [x] GLB and OBJ 3D models
- [x] SVG vector plan
- [x] File > Export menu for all formats, every storey
- [ ] IFC import of site and context
- [ ] Revit round-trip via IFC with stable GUIDs
- [ ] Rhino (3DM) and SketchUp (SKP)
- [ ] Spreadsheet sync for area schedules
