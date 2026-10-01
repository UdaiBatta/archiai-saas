# Progress

Build progress against the phased plan (3D-first site massing, housing and
interior planning; AI as a secondary layer). Ticked = merged or in an open PR.
Full plan and competitor map: [roadmap.html](roadmap.html) (published as the
"ArchiAI Roadmap" page); after ticking items here, run
`python docs/sync_progress.py` to copy them into it. Near-term engine
work lives in [ROADMAP.md](ROADMAP.md).

_Last updated: 2026-10-01_

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
- [x] On-screen zoom in / out / fit in Top and Axo (PR #48)
- [x] Ambient occlusion opt-in, off by default: Persp stays light (PR #48)
- [x] Merged meshes: ~60 draw calls per frame for a 17-room villa (PR #48)

## P2: Site & massing — PR #47 (in progress)

- [x] Site from the plot, drawn in Top view, or imported (GeoJSON, DXF); drag its corners
- [ ] Map tile underlay
- [ ] Add or remove corners on an existing site or mass
- [ ] DXF arcs and curves (today replaced by their chords)
- [x] Per-edge setbacks, height limit, coverage and FAR as site rules
- [x] Masses: add, fill the envelope, draw; push/pull floors; move and reshape in Top view
- [x] Live metrics panel: GFA, FAR, coverage, height, floors against the limits
- [x] Zoning warnings in 3D with a reason and a one-click fix (trim, height, FAR, overlap)
- [x] Automatic fix for over-coverage (shrink footprints to fit) (PR #48)
- [ ] Timed test: parcel to a compliant mass in under 5 minutes

## P3: Housing + interior inside the mass — PR #49

- [x] Engine fills massing floor plates around a core (corridor, stair/lift core, stacked units)
- [x] Unit mix targets with yield readout (mix within 1 unit per type; NSA, GFA, efficiency)
- [x] Re-solve on mass edit (optional auto), honouring locked units
- [ ] Locks for individual rooms inside a unit
- [ ] Second wing / core for irregular footprints (today: largest rectangle)
- [x] Furniture layouts checked against clearances (zero violations on the golden plans)

## P4: AI assistant panel (secondary) — PR #50

- [x] Brief to three distinct scored options, engine-only (Plan > Options)
- [x] Explain a rule violation: why it matters and how to fix it
- [x] Assistant: plain-language instruction to a previewed, validated edit
- [x] Every AI action is an ordinary, undoable edit (nothing changes before Apply)

## P5: Analysis — PR #51

- [x] Real solar position (NOAA) for the site's latitude and a chosen date
- [x] Sun-hours heatmap on ground and façades (0.2 s for villa + 5-floor block)
- [x] Per-room direct-sun check at the windows of habitable rooms
- [ ] Validate sun hours against an external tool (Ladybug) on three sites
- [ ] View analysis per window

## P6: Collaboration — PR (p6-collab)

- [x] Comments pinned to 3D points and rooms: threads with replies, resolve, author-only delete (Comments in the dock)
- [x] View-only share links with a saved camera (Share ▸ Opens at)
- [ ] Comments pinned to housing units
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
