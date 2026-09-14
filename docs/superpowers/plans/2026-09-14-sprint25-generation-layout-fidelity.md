# Sprint 25 — Generation Layout Fidelity Plan

**Status:** Historical proposal — superseded by the owner's new screenshots and
[staged experience spec](../specs/2026-09-14-staged-project-experience.md).
The audit below records the pre-implementation state, not the current product.

**Target branch:** `sprint-25/hosted-llm-and-generation-ui`

**Primary visual reference:** `docs/mockups/generation-redesign.html`

**Product-direction override:** `docs/EDITOR_3D_AND_SPACE_PLANNER_DIRECTION.md`

## Objective

Bring the production project editor's generation experience into faithful
alignment with the approved mockup for the complete path:

`empty project -> extract brief -> review -> generate -> inspect 2D result -> choose an option -> refine`

This is an integration and fidelity pass, not a new editor or generation
engine. The current React, Zustand, Axios, Tailwind, 2D/3D canvases, and
deterministic backend stay in place. No new dependency is required.

## Source-of-truth precedence

1. The September 13 owner workflow in
   `docs/EDITOR_3D_AND_SPACE_PLANNER_DIRECTION.md` wins when it differs from
   the older mockup.
2. `docs/mockups/generation-redesign.html` defines visual hierarchy,
   component anatomy, density, motion, and the individual interaction states.
3. Existing production behavior remains authoritative for authentication,
   permissions, saving, draft recovery, validation, errors, and layout
   geometry.

Important intentional differences from the older mockup:

- The generated result opens in **2D Plan**, with **Create 3D Model** in the
  persistent right panel.
- The product is general-purpose architecture, not a cafe-only planner.
- The cost estimator stays deferred by product decision.
- Revit/AutoCAD controls must not imply working exports until those exporters
  exist.

## Current-state audit

### Already implemented and retained

- The empty-project hero, Generate/Refine modes, quick-start briefs, and plot
  parameter controls exist in `CommandBar.tsx`.
- Extraction and generation are separate API calls, with hosted-provider
  support already in place.
- `BriefReviewPanel.tsx` displays understood facts and includes the new
  **Add anything else?** field.
- MVP generation returns geometrically distinct best-of-64 alternatives.
- `InsightsStrip.tsx` renders quality and an alternatives popover.
- The docked prompt bar, refine flow, refinement playback, and Skip action are
  functional.
- The 2D Plan, 3D Edit, Zoning, and Room Graph views share one canvas store.
- The right panel already exposes **Create 3D Model** and furniture-placement
  arming.
- Session edit count already opens the activity drawer.
- Honest save states, error surfaces, draft recovery, and version history are
  already present.

### Gaps to close

1. The generating view only shows two small dots. It lacks the mockup's brief
   echo, three-step track including Done, progress bar, live status line, and
   complete cancel behavior.
2. Cancel currently covers extraction, but reviewed generation does not create
   or pass an AbortController. The legacy `/api/design/generate` service also
   has no signal argument.
3. Successful initial generation does not explicitly switch to 2D Plan, even
   though the approved workflow says the result is edited there first.
4. There is no dismissible **Layout ready** success pill with real floors,
   spaces, area, and score.
5. `InsightsStrip` is mounted only in 3D, so the layout-options gallery is not
   available in the primary 2D result state.
6. Alternative selection is split between `InsightsStrip` and
   `ProgramPanel`; `ProgramPanel` owns a separate local cycling index. The
   current winner is not represented alongside alternatives or marked as the
   current option.
7. The mockup's guided clarification chips are not possible with the current
   `questions: string[]` API contract.
8. In the blocking clarification path, extra notes are appended to the local
   array after `clarifiedPrompt` is constructed, so **Add anything else?** is
   silently omitted from the re-extraction prompt.
9. Quick-start buttons lack the mockup's building-type icons.
10. The mockup's room-reveal transition is not implemented.
11. The editor clips at narrow in-app-browser widths. Full mobile editing is
    out of scope, but the generation flow still needs a safe laptop/narrow
    fallback without losing its primary controls.

## Implementation decisions

- Keep orchestration in `Project/index.tsx`; do not introduce a second global
  generation store.
- Expand the existing `generationStage` only as far as needed:
  `idle | extracting | generating | done`. Derive review/result/docked states
  from `briefReview`, `roomCount`, and `refinementPlayback` rather than
  duplicating them.
- Keep one AbortController ref and create a fresh controller for every extract
  or generation request. Pass its signal through both generation services.
- Keep one option model at page level: the generated winner plus returned
  alternatives and one active index. Both the insights gallery and Re-layout
  consume this model.
- Use real store/result values for all counts and scores. Never copy mockup
  numbers into production.
- Add backend clarification choices additively. Existing text questions remain
  supported, and the frontend falls back to a textarea whenever choices are
  absent.
- Use existing Tailwind tokens, inline SVG conventions, Archivo, and IBM Plex
  Mono. Add no icon, animation, or state-management dependency.
- Gate all new motion behind `motion-safe` / `prefers-reduced-motion`.

## Work packets

### Packet 1 — Make the generation lifecycle truthful

**Files**

- `frontend/src/pages/Project/index.tsx`
- `frontend/src/services/mvp.service.ts`
- `frontend/src/services/design.service.ts`
- their existing test files

**Tasks**

1. Extend the stage type with `done`.
2. Create and register an AbortController in `handleGenerateReviewed`, pass it
   to `generateMvpLayout`, and clear it only if it is still the active request.
3. Add an optional `AbortSignal` to legacy `generateLayout` and pass it to
   Axios.
4. Treat Axios cancellation as a neutral return, not a generation error.
5. Move briefly through `done` only after the layout has loaded successfully;
   reduced-motion users transition immediately.
6. Fix `handleClarifyBrief` so extra notes are appended before the clarified
   prompt string is built.
7. Preserve the user's prompt on cancellation or failure.

**Acceptance**

- Cancel aborts extraction and both generation routes.
- Cancellation never clears an existing layout or creates a false error.
- Retry uses the unchanged brief.
- Extra notes survive a blocking clarification/re-check round trip.

### Packet 2 — Match the Hero and Generating states

**Files**

- `frontend/src/components/canvas/CommandBar.tsx`
- `frontend/src/constants/quickStarts.ts`
- `frontend/tailwind.config.ts` only if a missing motion token is required
- `frontend/src/components/canvas/CommandBar.test.tsx`

**Tasks**

1. Match the mockup's hero composition: headline hierarchy, restrained copy,
   prompt-card dimensions, left-aligned mode tabs, plot-parameter affordance,
   textarea spacing, and arrow CTA.
2. Remove decorative elements not present in the approved mockup.
3. Add the four small building icons using the repository's inline SVG style.
4. Replace the current compact two-dot tracker with the mockup anatomy:
   brief echo, Reading brief / Designing layout / Done steps, connecting line,
   progress bar, live status copy, Cancel, and disabled busy CTA.
5. Keep aria-live status output and keyboard/focus behavior intact.

**Acceptance**

- Hero and generating states match the mockup at 1440x900 and 1280x720.
- No fake completion is shown before the layout is loaded.
- Reduced-motion mode has no pulsing or staged delay.

### Packet 3 — Complete Brief Review

**Files**

- `backend/app/services/clarification.py`
- `backend/app/schemas/mvp.py`
- `backend/app/api/mvp/router.py`
- `backend/app/tests/test_mvp_api.py`
- clarification service tests
- `frontend/src/types/contracts.ts`
- `frontend/src/components/canvas/BriefReviewPanel.tsx`
- `frontend/src/components/canvas/BriefReviewPanel.test.tsx`
- `frontend/src/pages/Project/index.test.tsx`

**Tasks**

1. Add an optional, backward-compatible `question_options` response field,
   keyed by the existing question string.
2. Supply choices only for bounded questions such as facing and floor count;
   retain textarea input for free-form room programs and fit negotiations.
3. Render the mockup's step label, understood chips, question count, answered
   count, answer chips, default-assumption note, Edit brief, and final action.
4. Keep **Add anything else?** visible for both blocking and non-blocking
   review routes.
5. Re-run extraction when additional requirements are present, then show the
   updated review rather than silently generating from stale requirements.

**Acceptance**

- Known bounded questions use one-tap chips.
- Unknown/dynamic questions remain fully answerable by text.
- Generate/Re-check stays disabled until every blocking question is answered.
- Additional requirements appear in the second extraction request and its
  understood summary.

### Packet 4 — Make the 2D result the primary result state

**Files**

- `frontend/src/pages/Project/index.tsx`
- `frontend/src/components/canvas/InsightsStrip.tsx`
- `frontend/src/components/canvas/ProgramPanel.tsx`
- `frontend/src/components/canvas/LayoutThumbnail.tsx`
- a small `LayoutReadyNotice.tsx` only if keeping it inline would further
  enlarge `Project/index.tsx`
- corresponding tests

**Tasks**

1. After a successful initial generation, switch to `floor_plan`. Do not force
   a view change after refine, restore, or option selection.
2. Show a dismissible, auto-clearing Layout ready notice with actual floor
   count, habitable-space count, net area, and quality score.
3. Mount the insights/options control in both 2D Plan and 3D Edit.
4. Normalize the winner and alternatives into one page-level list. Mark the
   loaded option as CURRENT and display total options, including the winner.
5. Make Re-layout open or advance through that same option model; remove the
   independent local alternative index from `ProgramPanel`.
6. When an option is selected, preserve design/version IDs, load its geometry,
   mark the layout unsaved, update the current badge, and keep the options open
   long enough for the choice to be visibly confirmed.
7. Preserve the honest `1 optimal layout` state when no alternatives exist.

**Acceptance**

- Generation lands on an editable 2D plan.
- The success notice contains no hardcoded metrics.
- Winner and alternatives can all be inspected and selected from one gallery.
- There is one authoritative active-option index.
- Selecting another option never creates an overlap or loses the current
  design ID.

### Packet 5 — Result reveal and refine continuity

**Files**

- `frontend/src/components/canvas/Plan2D.tsx`
- `frontend/src/components/canvas/RefinementPlaybackPanel.tsx`
- `frontend/src/components/canvas/CommandBar.tsx`
- `frontend/src/pages/Project/index.tsx`
- focused component/page tests

**Tasks**

1. Add a short, one-shot staggered reveal for newly generated 2D room groups.
   Do not replay it after ordinary edits, floor changes, restore, or reload.
2. Keep the prompt bar docked once rooms exist.
3. Match the mockup's compact refine playback placement, counter, row states,
   Skip action, and completion summary.
4. Ensure activity, assumption, success, refinement, and draft notices have a
   deterministic priority so they do not overlap at the top center.

**Acceptance**

- Reveal runs once per successful generation and respects reduced motion.
- Skip loads the exact final refinement result.
- No toast/pill overlap occurs.
- Refine preserves the user's active editor view.

### Packet 6 — Right-panel and 3D handoff cleanup

**Files**

- `frontend/src/components/canvas/RightPanel.tsx`
- `frontend/src/components/canvas/ProgramPanel.tsx`
- `frontend/src/pages/Project/index.tsx`
- focused tests

**Tasks**

1. Keep the persistent right panel as the single home for the space-program
   summary and Create 3D Model action.
2. Remove or reposition duplicate floating program UI where it competes with
   the persistent panel.
3. Keep Create 3D Model behavior already approved: first click switches to 3D;
   the next action arms furniture placement.
4. Keep connections, validation, properties, and activity driven by real
   canvas data.

**Acceptance**

- The result has one space-program presentation, not two competing panels.
- Create 3D Model is visible after generation and has no dead state.
- Selecting a room still opens its existing property and adjacency controls.

### Packet 7 — Responsive safety and fidelity QA

**Files**

- Existing editor components only; avoid a parallel mobile component tree.

**Tasks**

1. Preserve the full mockup composition at desktop/laptop widths.
2. At narrow widths, collapse secondary chrome before shrinking the prompt or
   canvas: right panel becomes a drawer, tool labels compact, and primary
   Generate/Cancel/Edit controls remain reachable.
3. Prevent horizontal clipping and prompt-card overflow.
4. Capture production screenshots for Hero, Generating, Brief Review, Result,
   Alternatives, and Docked Refine at the mockup's desktop size.
5. Compare each screenshot directly against the corresponding mockup state and
   record a fidelity ledger for layout, typography, palette, spacing, controls,
   icons, and motion.

**Acceptance**

- No primary control is clipped at 1024px wide or the in-app browser's narrow
  viewport.
- Desktop screenshots receive no remaining material fidelity comments.
- Console has no new errors or warnings from the generation flow.

## Test plan

### Backend

- Existing full `pytest` suite remains green.
- New tests pin optional clarification choices without breaking the existing
  `questions` contract.
- Tests cover choices absent for dynamic/free-form questions.

### Frontend

- `CommandBar`: Hero, each generation stage, Cancel, locked Refine, plot
  parameters, quick-start icons, and reduced-motion-safe markup.
- `BriefReviewPanel`: choice questions, textarea fallback, answered count,
  disabled action, defaults, extra notes, and Edit brief.
- `ProjectPage`: complete extract-review-generate state sequence, cancellation
  for both engines, extra-note re-extraction, automatic 2D result, real success
  metrics, notice priority, and one-shot reveal.
- Alternatives: winner included, current badge, option selection, preserved
  IDs, dirty state, and single-layout behavior.
- Existing save, draft, refinement, version, activity, and editor-view tests
  must remain green.

### Final gates

```text
backend:  python -m pytest -q
frontend: npm test
frontend: npx tsc --noEmit
frontend: npm run build
browser:  desktop + laptop + narrow workflow acceptance
visual:   mockup-to-production screenshot comparison for all six states
```

## Recommended commit sequence

1. `fix(generate): complete cancellation and preserve clarification additions`
2. `feat(generate-ui): match hero and staged generation states`
3. `feat(brief-review): add guided clarification choices`
4. `feat(generate-ui): make 2d result and options gallery canonical`
5. `feat(generate-ui): add result reveal and refine-state continuity`
6. `fix(editor): consolidate result panels and narrow-width behavior`
7. `docs(sprint25): record generation-layout fidelity gates`

## Explicitly out of scope

- Cost estimation.
- Real Revit, DWG, IFC, or DXF export implementation.
- New generation algorithms or scoring rules.
- Furniture asset-library expansion.
- Multi-floor exploded-view controls.
- Real-time collaboration.
- A separate mobile editor architecture.

These items should not block shipping the generation-layout fidelity pass.
