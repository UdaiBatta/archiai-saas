# 001 — Let users set what a hand-placed room is (its use)

- **Written against:** commit `8c0837e` (main). If `git diff 8c0837e -- frontend/src/components/canvas/Inspector.tsx frontend/src/store/canvasStore.ts` shows changes to the excerpts below, re-read them before starting; if the Type select described here no longer exists, STOP and report.
- **Effort:** M · **Risk:** low–medium · **Priority:** 1 (blocks 002 being useful)

## Why

The app is editor-first: a new project is a blank plot, and the user places rooms by hand ("+ Add a room"). Every hand-placed room is created with `objectType: 'room'` and `roomType: 'room'` and the label `Room`. There is **no control anywhere in the UI to say a room is a bedroom, kitchen, entry, etc.** The Inspector's only "Type" select switches the *object* kind (Room / Wall / Door / Window / Stair …), not the room's use.

Consequences seen in a real walkthrough (3 rooms placed on a 12 × 15 m plot):
- The Program panel shows **"Private 100%"** and every room is named "Room".
- The plan is flagged **"Invalid layout", Quality 49**, with one room marked `! Room`. The backend rules need an `entry` room (front door, reachability from the entrance), habitable rooms need daylight, etc. None of this can be satisfied because the user cannot declare an entry or any other use.
- Doors, windows, zoning colours and the quality score are all driven by `roomType`, so they are meaningless for hand-drawn plans.

## Current state (verified)

`frontend/src/components/canvas/Inspector.tsx` ~lines 122–142, the only type control:

```tsx
<label className="flex flex-col gap-1">
  <span className={LABEL_CLASS}>Type</span>
  <select
    aria-label="Object type"
    className={FIELD_CLASS}
    value={room.objectType}
    onChange={(event) => {
      const objectType = event.target.value as CanvasObjectType
      updateRoom(
        room.id,
        { objectType, roomType: componentTypeToRoomType(objectType) },
        { action: 'object.updated', previousValue: room.objectType },
      )
    }}
  >
    {COMPONENT_DEFINITIONS.filter((type) => type.canCreate).map((type) => (
      <option key={type.type} value={type.type}>{type.label}</option>
    ))}
  </select>
</label>
```

`frontend/src/store/componentRegistry.ts:335`:
```ts
export function componentTypeToRoomType(type: CanvasObjectType) {
  return type === 'stair' ? 'stairs' : type
}
```
So a placed room gets `roomType: 'room'` (`frontend/src/store/canvasStore.ts` ~line 556–557 in `defaultRoomForType`).

How `roomType` is used downstream (do not change these, just know them):
- `frontend/src/services/mvpLayoutAdapter.ts` (~line 336–376, `canvasObjectsToLayoutPlan`) sends `room.roomType` as `PlanRoom.type` to the backend `/api/validate`. The backend accepts any non-empty string (`backend/app/schemas/layout_plan.py` `PlanRoom.type: str`) and resolves it through `backend/app/services/catalog/space_catalog.py` `resolve_alias()`.
- `frontend/src/components/canvas/zoneModel.ts` `ROOM_TYPE_ZONES` maps roomType → zone colour (public/private/service/…).
- `frontend/src/hooks/useMvpQualityValidation.ts` `geometryFingerprint` includes `object.roomType`, so **changing roomType already triggers re-validation** (walls/doors/windows rebuild). No hook changes needed.

Repo conventions to match:
- Inspector fields use the module constants `FIELD_CLASS` / `LABEL_CLASS` (top of Inspector.tsx) and a `<label className="flex flex-col gap-1">` wrapper, exactly like the excerpt above.
- Edits go through `updateRoom(id, patch, { action, previousValue })` so they are undoable and logged.
- UI colours only from Tailwind tokens; no new hex literals in components (CLAUDE.md).
- Files stay small; put the option list in its own module rather than growing Inspector.tsx.

## Scope

In scope:
- New file `frontend/src/components/canvas/roomUses.ts` (option list + label helper).
- `frontend/src/components/canvas/Inspector.tsx` (add one select, only for `objectType === 'room'`).
- Tests: `frontend/src/components/canvas/Inspector.test.tsx` (exists; extend it) and a tiny `roomUses.test.ts`.

Out of scope (do NOT touch): the backend, `useMvpQualityValidation.ts`, `mvpLayoutAdapter.ts`, `zoneModel.ts`, the object-type select's behaviour, the brief/AI flow.

## Steps

1. **Confirm which use keys the backend understands.** From `backend/`:
   ```bash
   DATABASE_URL=sqlite+aiosqlite:///:memory: SECRET_KEY=x-test-secret-key-0123456789abcdef0123 \
     python -c "from app.services.catalog.space_catalog import resolve_alias; print({k: resolve_alias(k) for k in ['entry','living_room','dining','kitchen','master_bedroom','bedroom','bathroom','study','utility','balcony','pooja_room','corridor','parking','store']})"
   ```
   Keep only keys that resolve to a non-None value. Expect most to resolve; if `entry`, `bedroom`, `kitchen` or `living_room` resolve to None, STOP and report (the plan's premise is wrong).

2. **Create `frontend/src/components/canvas/roomUses.ts`:**
   - `export const ROOM_USES: { value: string; label: string }[]` — ordered as a person would think: Entry, Living room, Dining, Kitchen, Master bedroom, Bedroom, Bathroom, Study, Utility, Balcony, Pooja room, Corridor, Parking, Store (only those that passed step 1), plus a first option `{ value: 'room', label: 'Unassigned' }`.
   - `export function useLabel(value: string): string` returning the label for a value (fallback: the value with `_` → space, capitalised).
   - Verify: `npx tsc --noEmit` (from `frontend/`) → no errors.

3. **Add a "Use" select in Inspector.tsx**, directly *above* the existing "Type" label block, rendered only when `room.objectType === 'room'`:
   - `aria-label="Room use"`, `value={typeof room.roomType === 'string' ? room.roomType : 'room'}`; if the current value is not in `ROOM_USES`, render it as an extra option so it is not lost (generated plans use types not in the short list).
   - `onChange`: compute `next = event.target.value`. Build `patch = { roomType: next }`. **Also rename** when the current label is still a default — i.e. `room.label === 'Room'` or `room.label === useLabel(room.roomType)` (optionally followed by ` <number>`): set `patch.label = useLabel(next)`. Never overwrite a label the user typed.
   - Call `updateRoom(room.id, patch, { action: 'object.updated', previousValue: room.roomType })`.
   - Verify: `npx tsc --noEmit` → no errors.

4. **Tests.** In `Inspector.test.tsx`, following the existing render pattern in that file:
   - select "Kitchen" on a room labelled "Room" → store room has `roomType: 'kitchen'` and `label: 'Kitchen'`;
   - a room labelled "Mum's room" keeps its label when the use changes;
   - the "Room use" select is not rendered for a `door`/`wall` object.
   In `roomUses.test.ts`: `useLabel('living_room') === 'Living room'`, unknown value falls back sensibly.
   - Verify: `npx vitest run src/components/canvas/Inspector.test.tsx src/components/canvas/roomUses.test.ts` → all pass.

5. **Full gate** (from `frontend/`): `npx tsc --noEmit && npx vitest run` → 0 type errors, all tests pass.

## Done criteria (machine-checkable)

- `grep -n 'aria-label="Room use"' frontend/src/components/canvas/Inspector.tsx` → 1 match.
- `npx tsc --noEmit` exits 0; `npx vitest run` exits 0.
- Manual check for a human reviewer (not the executor): new blank project → place 2 rooms → set one to "Entry" and the other to "Living room" → the Program panel shows Public, the invalid flag on reachability clears or changes (an entry now exists).

## Maintenance notes

- If the backend catalog adds/removes types, `ROOM_USES` must follow; step 1's command is the check.
- Plan 002 (explain problems in place) assumes this picker exists and points users at it ("set a room's use to Entry").
- Watch for generated plans (AI path) whose `roomType` values are richer than the list — step 3's "keep unknown value as an extra option" rule protects them.

## Escape hatches

- If `updateRoom` rejects or ignores a `roomType`-only patch (check `inferAction` / the update path in `canvasStore.ts`), STOP and report rather than adding a new store action.
- If changing `roomType` does not trigger re-validation in the browser, do not modify the validation hook; report it.
