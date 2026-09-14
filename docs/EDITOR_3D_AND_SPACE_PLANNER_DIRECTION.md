# Editor and staged project experience

Owner direction, updated 14 September 2026. The two screenshots supplied in the
current task supersede earlier shared resources, including the cafe-only and
Gill Road references. The [generation mockup](mockups/generation-redesign.html)
is useful for brief/progress/review patterns, not an exact template to copy.

Implementation spec: [Staged project experience](superpowers/specs/2026-09-14-staged-project-experience.md).

## The workflow

1. **Design brief:** a focused hero on the real editor's perspective grid plane.
   Only the prompt and optional plot settings are needed before generation.
2. **Understand and review:** extract the brief, show what was understood, ask
   for missing details, and accept free-text additions such as extra bedrooms.
   Additions and clarification answers stay together and are reviewed again.
3. **Layout:** open the result in **2D Plan**. **3D Edit** shows the same editable
   room blocks. Options, room selection, dragging, resizing, snapping and undo
   operate on one shared layout. The first screenshot guides this stage.
4. **Review and refine:** show actual session edits, with layout checks available
   on demand. Refinement starts from the current canvas, including unsaved edits.
   A failed refinement leaves that work intact.
5. **3D model:** an explicit **Create a 3D model** action enters a distinct
   presentation with warm-white walls, real hosted openings, room floors and
   editable furniture proxies. The second screenshot guides this stage.
   **Back to layout** preserves objects, IDs, undo history and unsaved work.

## UI rules

- Charcoal canvas, subtle grid, one purple action accent, restrained room colors.
- One room-program/details panel; properties appear on selection and analysis
  sits behind disclosure controls. Zoning and Room Graph remain under More views.
- Keep primary tools short: selection, room/furniture placement, measure, undo
  and redo. Additional components are progressively disclosed.
- Narrow windows use a details drawer and compact header; the model camera fits
  the viewport rather than cutting off the building.
- Empty, cancelled, error, saving and recovery states must be honest.

## Implementation boundaries

- Reuse React, Zustand, SVG and React Three Fiber. No additional dependencies.
- Model mode uses `stage=model&view=3d`; it is not a separate mutable design or a
  generated image. Existing design, draft, version and sharing APIs are reused.
- Hosted doors/windows cut render-only gaps in their walls. Unhosted legacy
  markers stay placeholders. Wall relationships must survive API round trips.
- Furniture is currently a generic editable table-shaped proxy. Asset/type
  libraries, materials, costs, detailed fittings and BIM export remain future
  work. Do not expose simulated pricing, capacity or compliance as real results.
- This is an early concept-design tool, not construction or regulatory approval.

## Local verification

The local demo project `Workflow demo — September 14` is separate from the
owner's original project. `backend/scripts/seed_workflow_demo.py` can seed only
an empty, explicitly named workflow-demo project in a non-production environment.
It uses explicit requirements and the real deterministic generation/persistence
path; it does not impersonate successful AI extraction.

Live prompt extraction was unavailable during this session because the configured
AI provider could not be reached. This remains a visible prerequisite/error,
not a mock success. Automated request/review/cancellation tests cover the UI flow.
