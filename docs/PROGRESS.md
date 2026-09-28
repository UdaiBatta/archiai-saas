# Progress

Build progress against the phased plan (3D-first site massing, housing and
interior planning; AI as a secondary layer). Ticked = merged or in an open PR.
Full plan and competitor map: the "ArchiAI Roadmap" page. Near-term engine
work lives in [ROADMAP.md](ROADMAP.md).

_Last updated: 2026-09-28_

## Foundation: layout engine quality — PR #44

- [x] Home quality suite: 26 real briefs, baseline pinned in tests
- [x] Daylight hard rule: bedrooms, living rooms, kitchens touch an outside wall
- [x] Entry and outdoor rooms stay on the street side / outline
- [x] Squarer rooms: proportion score and shape-aware cutting
- [x] Windows placed by the engine (one per room that needs light)
- [x] 3D sun follows a time-of-day slider
- [ ] Split the shared wet slot (bathrooms ~1.5 x 4.3 m)
- [ ] Stack bathrooms over wet rooms on multi-storey homes
- [ ] Broader room-order search on polygon plots

## P1: Professional 3D workspace — PR #42 (in progress)

- [x] White model: matte walls, crisp edges, pale room-floor tints, glass windows
- [x] Ambient occlusion and soft sun shadows fitted to the site
- [x] Site ground with grid, plot pad and boundary line, north arrow
- [x] View cube
- [x] Perspective / Axo / Top (orthographic, north up) views framing the site
- [x] Hide or ghost other floors on multi-storey plans
- [ ] Setback lines on the ground (needs setback data, comes with P2)
- [ ] Saved views
- [ ] Dimensions and room labels in Top view
- [ ] Editing handles in Top view (move, resize, walls, doors, windows)
- [ ] Retire the separate 2D editor once Top view reaches parity
- [ ] 60 fps on a mid-range laptop for a 4-bedroom home

## P2: Site & massing

- [ ] Draw or import the site polygon (DXF, GeoJSON); map tile underlay
- [ ] Per-edge setbacks, height limit, coverage and FAR as site rules
- [ ] Push/pull masses, floor count, floor-to-floor height
- [ ] Live metrics panel: GFA, FAR, coverage, height, floors
- [ ] Zoning warnings in 3D with a reason and a suggested fix

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

## P7: Interop — PR #43

- [x] DXF for AutoCAD (R2013, mm, AIA layers)
- [x] IFC4 for Revit / ArchiCAD (walls, openings, doors, windows, spaces with areas, slabs)
- [x] GLB and OBJ 3D models
- [x] SVG vector plan
- [x] File > Export menu for all formats, every storey
- [ ] IFC import of site and context
- [ ] Revit round-trip via IFC with stable GUIDs
- [ ] Rhino (3DM) and SketchUp (SKP)
- [ ] Spreadsheet sync for area schedules
