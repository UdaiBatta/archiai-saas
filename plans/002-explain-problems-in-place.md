# 002 — Say what is wrong with the plan, where the user is looking, and fix the misleading next-step button

- **Written against:** commit `8c0837e` (main). Check `git diff 8c0837e -- frontend/src/components/canvas/WorkspacePanel.tsx frontend/src/components/canvas/RightPanel.tsx` before starting; if the excerpts below changed, re-read and adapt; if the "Layout checks" `<details>` block is gone, STOP and report.
- **Effort:** S–M · **Risk:** low · **Priority:** 2 · **Depends on:** 001 (the copy below points users to "Room use"; it still works without 001 but is less useful).

## Why

In a real walkthrough of the editor-first flow (blank plot → three rooms placed by hand), the editor showed:
- a red **"Invalid layout"** in the bottom status bar and **"Quality 49"** in the Program header,
- one room drawn as **`! Room`** in red,
- **no reason anywhere on screen.** The reasons exist (backend hard violations, with plain-language help in `violationHelp.ts`), but they are inside a **collapsed** `<details>` called "Layout checks" at the bottom of the right panel.

The same panel's main call to action, while the user is already looking at a 3D model, is an orange **"Create a 3D model →"** button with the hint *"Happy with the layout? Continue to walls & furniture."* This is a leftover from the old brief-first, two-stage flow. In the editor-first flow, walls already build themselves; the button actually opens the furniture/model stage. Users read it as "nothing is 3D yet".

## Current state (verified)

`frontend/src/components/canvas/WorkspacePanel.tsx`:
- line ~49: `const quality = useMemo(() => parseMvpQuality(layoutMetadata), [layoutMetadata])`
- line ~154 (collapsed by default):
  ```tsx
  {quality && <details className="mt-4 border-t border-ink/10 pt-3"><summary className="cursor-pointer text-xs text-muted">Layout checks</summary><div className="mt-3"><QualityPanel quality={quality} /></div></details>}
  ```
- lines ~174–179, the footer CTA and hint:
  ```tsx
  <button type="button" data-testid="create-3d-model" ... onClick={modelStage ? () => setPlacementMode(...) : onCreateModel} ...>
    {modelStage ? placementMode === 'furniture' ? 'Cancel placement' : '+ Add furniture' : 'Create a 3D model →'}
  </button>
  ...
  <p ...>{modelStage ? ... : 'Happy with the layout? Continue to walls & furniture.'}</p>
  ```
`frontend/src/components/canvas/RightPanel.tsx:684` has the same "Create a 3D model →" label (used in the Zoning / Room Graph lenses).

Hard violations have shape `{ code: string; room_ids: string[]; message: string }` (`frontend/src/types/contracts.ts:150`). `frontend/src/components/canvas/violationHelp.ts` exports `violationHelp(code) → { why, fix }`, already used by `QualityPanel.tsx`.

Tests that reference the old labels (must be updated, not deleted):
- `frontend/src/pages/Project/index.test.tsx:234` clicks the button named `'Create a 3D model →'`
- `frontend/src/components/canvas/RightPanel.test.tsx:201-216` uses `data-testid="create-3d-model"` (keep the test id).

Conventions: Tailwind tokens only (`text-danger`, `text-warn`, `border-ink/10`, `bg-graphite-…`); match the compact `text-[11px]`/`text-xs` sizes already used in WorkspacePanel; keep the file from growing past ~400 lines. If it would, put the new summary in its own small component file in the same folder.

## Scope

In scope: `WorkspacePanel.tsx`, `RightPanel.tsx` (label/hint only), a possible new `ProblemsSummary.tsx` in `frontend/src/components/canvas/`, and the two test files above plus a new test for the summary.
Out of scope: backend rules and scores, `QualityPanel.tsx` internals, `violationHelp.ts` text (you may *read* it), the model-stage behaviour itself (what the button does stays the same).

## Steps

1. **Problems summary, always visible when there are hard violations.** Create `ProblemsSummary.tsx` taking `quality` (the parsed snapshot) and rendering nothing when `quality.hard_violations.length === 0`. Otherwise render, just under the Program header area of WorkspacePanel (above the room list):
   - a heading: `N problem(s) to fix`, coloured `text-danger`;
   - up to 3 items, each: the room label(s) (look up `room_ids` in `useCanvasStore(s => s.rooms)`) + `violationHelp(code).fix`; clicking an item calls `useCanvasStore.getState().selectRoom(room_ids[0])` when there is one;
   - if there are more than 3, a "+N more in Layout checks" line.
   Verify: `npx tsc --noEmit` (from `frontend/`).

2. **Open "Layout checks" automatically when invalid.** Add `open={quality.hard_violations.length > 0 || undefined}` to that `<details>` so it starts expanded when something is wrong (do not make it controlled; the user can still collapse it).

3. **Fix the misleading CTA, outside the model stage only.** Change the label `'Create a 3D model →'` to `'Furniture & details →'` and the hint to `'Walls, doors and windows build as you draw. Next: place furniture and check clearances.'` in WorkspacePanel. Change RightPanel.tsx:684's label to the same text. Keep `data-testid="create-3d-model"` and `onCreateModel` unchanged.

4. **Tests.**
   - New `ProblemsSummary.test.tsx`: renders nothing for a valid snapshot; for 4 violations shows 3 items and "+1 more"; clicking an item selects the room (assert `useCanvasStore.getState().selectedId`). Follow the store-seeding pattern in `RoomConnections.test.tsx` (`useCanvasStore.setState({...})` in `beforeEach`).
   - Update `pages/Project/index.test.tsx:234` to the new button name.
   - Verify: `npx vitest run src/components/canvas src/pages/Project` → all pass.

5. **Full gate** from `frontend/`: `npx tsc --noEmit && npx vitest run` → 0 errors, all pass.

## Done criteria

- `grep -rn "Create a 3D model" frontend/src --include=*.tsx` → no matches outside tests (and none in tests either after step 4).
- `npx tsc --noEmit` exits 0; `npx vitest run` exits 0.
- Reviewer check: a blank project with two unconnected generic rooms shows "N problems to fix" with a readable fix line, without expanding anything.

## Maintenance notes

- New backend violation codes need a `violationHelp.ts` entry, or the summary shows the generic fallback text.
- If the model stage is later renamed or merged into the main editor, revisit the CTA copy from step 3.

## Escape hatches

- If `parseMvpQuality` returns `null` for blank-started projects even when the status bar says "Invalid layout", STOP and report where the status bar gets its state; do not invent a second parser.
- Do not change what the CTA *does*; if the copy seems wrong for what it does, report it.
