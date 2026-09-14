# Staged project experience — 14 September 2026

Owner direction: the two screenshots attached on 14 September supersede earlier
visual references. Use `docs/mockups/generation-redesign.html` only for useful
brief/progress/review patterns, not as an exact visual target.

## Product stages

1. **Brief** — a focused hero, prompt and optional plot settings. No empty
   inspector, room tools or analysis panels before a layout exists.
2. **Understand and review** — real request progress, an editable summary,
   clarification fields, quick room additions and unrestricted extra requirements.
   Added requirements must be re-extracted and reviewed before generation.
3. **Layout** — generation opens **2D Plan**. **3D Edit** is a second view of the
   same editable room blocks, not a furnished model. The first screenshot guides
   the large canvas, restrained colored blocks and compact room-program panel.
   Selection, movement, resize, undo, floors and persistence must remain intact.
4. **Review and refine** — show actual session edits and layout checks; refinement
   starts from the current geometry, including unsaved moves. Errors preserve the
   current layout. Refinement must never silently revert to a saved snapshot.
5. **3D model** — explicit **Create a 3D model** action enters a separate model
   presentation, guided by screenshot two: floor surfaces, opaque walls with
   hosted door openings and furniture placement. Back to layout is non-destructive.
   This is a concept model of the same rooms, not a new AI image or a BIM model.

## Implementation boundaries

- Reuse React, Zustand, SVG editor and React Three Fiber; no new dependencies.
- Show room properties on selection and checks on demand; don't duplicate the
  program panel, inspector and permanent analysis cards.
- Model stage is a URL-backed presentation (`stage=model`, `view=3d`), not a
  second mutable layout. Saving continues to use the existing design/draft APIs.
- Furniture starts as editable generic proxy objects. Selecting actual furniture
  types, asset catalogs, materials, costing and BIM export are future stages.
- Existing hosted doors can form actual wall openings. Unhosted legacy markers
  remain explicit placeholders; do not invent connectivity.
- No claim of construction readiness or regulatory certification.

## Acceptance checks

- Empty project → prompt → review; add more rooms and retain all clarification
  answers/notes; then generate directly into 2D Plan.
- Both generation requests can be cancelled without showing success or replacing
  the current canvas after cancellation.
- Move/resize in 2D and 3D Edit use one store; review lists the actual edits.
- Refine submits current geometry and preserves it on a failed request.
- Model transition and return preserve geometry, IDs, undo and dirty state.
- Furniture can be placed on the active level, selected, moved, saved and reloaded.
- Hosted openings leave real gaps; presentation changes do not mutate wall data.
- Check frontend tests/build and targeted backend regressions; inspect the local
  experience in the browser at a wide and a narrow viewport.
