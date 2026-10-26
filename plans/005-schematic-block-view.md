# 005 — A schematic "block planning" view for the layout stage (instead of a white-model render)

- **Rechecked 2026-10-26:** every file, line and value below was re-verified in the code. Corrections from the first draft: the 3D view tints the dark UI palette (not a light one); sun-hours analysis shares `buildMergedModel`, so blocks get their own builder; the dragged room and picking must share the block shape; the first palette failed its own contrast test and was replaced; the draw-call budget now counts labels.
- **Written against:** commit `e501354` (main, 2026-10-26). Before starting, run `git diff e501354 -- frontend/src/components/canvas/modelView.ts frontend/src/components/canvas/Scene.tsx frontend/src/components/canvas/Canvas3D.tsx frontend/src/components/canvas/RoomMesh.tsx frontend/src/components/canvas/mergedGeometry.ts`. If the lighting, palette or room-mesh code described below has changed, re-read it before editing. If a "block" style already exists, STOP and report.
- **Effort:** L (four PRs, M each) · **Risk:** medium (touches rendering shared with the model stage, masses, sun analysis and comments) · **Priority:** 1 for how the product feels
- **Not in scope:** the 2D Top plan drawing style (a separate piece of work: wall poché, door swings, dimensions), the DXF/IFC export upgrade, the AI redesign preview. They share the same geometry; this plan does not change it.

## Why

The 3D view is meant to be a place to *plan*: place rooms, see how they relate, change them. Today it reads as a finished render. Reported on 2026-10-26 with a screenshot of the villa plan: the colour tone and the feel of the rooms "straight up looks like the render", which is what you would expect *after* pressing "Furniture & details", not while laying out. The target is the look of block planning in Rhino and of space planning in Hypar: coloured volumes by function, clear at a glance, in the browser.

### What causes the render feel (verified in the code)

1. **Everything is near-white.** `modelView.ts` `MODEL_COLORS`: walls `#f4f3ef`, floor base `#f1efea`, ground `#e6e7e7`, sky `#eceef0`. Room floors are drawn with `floorTint(displayRoomColor(room))` (`mergedGeometry.ts` ~line 148, `RoomMesh.tsx` ~line 146), and `floorTint` mixes the colour **80% toward the floor base**, so rooms keep only a faint hint of colour. Rooms cannot be told apart by colour, which is the main thing a block plan does.
2. **The colour that is tinted is a dark UI colour.** `displayRoomColor` (`editorPalette.ts` ~line 137) returns `ROOM_TYPE_COLORS`, built from `MUTED_ROOM_COLORS` (`#7A3325`, `#4F4946`, `#3E3936` …): dark, muted colours made for the dark panels. Tinted 80% toward off-white they become near-identical beiges. (There is a second, pastel palette, `ROOM_COLORS` in `services/mvpLayoutAdapter.ts`, written into `room.color` on generation, but the 3D view never reads it. Do not build on it; see "Design decisions".)
3. **Photographic lighting.** `Scene.tsx` (~lines 139–160): in "studio" the hemisphere light is 1.35, the sun is `intensity × 1.9` with `castShadow` on and `shadow-radius` 4, and a time-of-day sun direction. That gives long, soft cast shadows and shaded wall faces, which is what makes it look like a render. `Canvas3D.tsx` adds neutral tone mapping, and N8AO ambient occlusion (`aoRadius 1.2`, `intensity 2.4`) is available as an opt-in that is off by default.
4. **Full-height closed walls hide the plan.** Rooms are enclosed by full-height walls. From a low or oblique camera you see the outside of the front wall and the interior is hidden, so the layout cannot be read. (The screenshot shows this: only the front façade and the tops of the far walls.)
5. **The default camera is a low perspective.** `Canvas3D` defaults to `initialPreset = 'perspective'`; `modelView.ts` `PRESET_DIRECTION.perspective = normalize([0.8, 1, 0.8])` is about 40° up, and the `OrbitControls` in `Scene.tsx` (~line 288) set no `minPolarAngle`/`maxPolarAngle`, so orbiting reaches near-horizontal. An axonometric (`axo`, true isometric) preset exists but is not the default for planning.
6. **No diagram language.** No colour legend in 3D, no in-scene room labels or areas, no hover or selection emphasis beyond an outline, no circulation or adjacency overlay. The Zoning and Room Graph "lenses" are 2D SVG views, separate from the 3D scene.

## Target look

Techniques to apply, with what each means here:

| Technique | In ArchiAI |
|---|---|
| Schematic massing | Each room is one simple coloured volume. No wall detail, no furniture, no textures. |
| Functional zoning colour | Colour by use (public, private, service, circulation, outdoor …), with a legend, from a palette made for a light scene. |
| Axonometric as the default | Orthographic isometric, so shapes and areas read without perspective distortion. Perspective stays available. |
| Sectional cut-away ("dollhouse") | Walls are cut at a plan height (about 1.2 m) so every room is visible from above; a control raises them to full height. |
| Flat diagrammatic lighting | High ambient and hemisphere light, one soft key light, short subtle shadows, thin dark edge lines. No long cast shadows, no tone-mapped glow. |
| Line weight hierarchy | Thin edges on blocks, slightly heavier on the building outline and selected block. |
| Labels and legend | Room name and area on each block, a legend for the colours, a north arrow and scale. |
| Stacking diagram | For multi-floor plans, an exploded (separated) view of levels. |

Hypar, as described by third parties (we could not read its own pages; treat as secondhand): space planning in colour by program type with a legend of program types on the right, 3D floor plans, bubble diagrams and multi-floor stacking diagrams ([BIMpure review](https://bimpure.com/blog/inside-hypar-2-the-future-of-space-planning), [tool directory](https://aitoolsexplorer.com/?p=14426)). The plan borrows those ideas; it does not copy their look.

## Design decisions

- **Two display styles, not a replacement.** `blocks` (new, the default while laying out) and `model` (today's white model, used from "Furniture & details" onward). Switching is a view setting: it is not part of the saved plan and not in undo history. Store it in a small UI store (the pattern of `site/siteUiStore.ts`), persisted per browser only.
- **Colour by zone first.** The seven zones in `zoneModel.ts` (`public`, `private`, `collaborative`, `service`, `circulation`, `utility`, `unassigned`) already drive the right panel and the room graph, so the 3D colours match what the user sees there. Colour by exact room type (bedroom vs bathroom) is a later refinement.
- **One palette, in the existing token module.** Put it next to `MODEL_COLORS` in `modelView.ts` (CLAUDE.md allows palette modules; no new hex literals inside components). It is for the light 3D scene only. `MUTED_ROOM_COLORS` stays: the dark panels (right panel, room graph, zoning view) still use it. The unused pastel `ROOM_COLORS` in `mvpLayoutAdapter.ts` is a separate cleanup, not part of this plan.
- **A separate block builder; the merged model stays as it is.** `buildMergedModel` (`mergedGeometry.ts`) is also the occluder model for the sun-hours analysis (`analysis/sunHours.ts` line ~174 builds it for ray casting). If walls were cut to 1.2 m inside it, sun-hours results would silently change. So add `buildBlockModel` alongside it, and leave `buildMergedModel` full-height. Analysis always uses `buildMergedModel`, whatever the display style.
- **The dragged room must look the same as the rest.** The merged model leaves the dragged or selected object out and `RoomMesh.tsx` draws it on its own, "mirroring" the merged look. Put the block shape and colour in one shared function used by both `buildBlockModel` and `RoomMesh`, so a room doesn't change appearance when picked up.
- **Keep picking working.** The merged mesh maps each triangle to its object through `solidOwners` (`MergedModel.tsx` ~line 88, used by pointer down/move). `buildBlockModel` must return the same owners list so clicking a block selects its room (and clicking a cut wall selects the wall).
- **Persp and Axo only.** The Top plan keeps its current drawing look; its new drawing style is separate work.
- **Keep the draw-call budget.** `mergedGeometry.ts` merges walls, floors and windows into 3 draw calls (about 60 per frame for the whole villa scene). Blocks must also be merged (vertex colours), not one mesh per room. Budget: the blocks style draws **no more than the model style does today** for the villa plan, labels included. That means labels are a batched layer or HTML, not one text mesh per room.
- **Do not touch geometry or editing.** Rooms, walls, doors and editing stay as they are. This changes how they are drawn.
- **Masses keep their own look.** `site/MassLayer.tsx` colours masses by floor use (`MODEL_COLORS.use*`). They only get the flatter lighting; their colours are not changed.
- **Unassigned rooms look unassigned.** They use a neutral colour with a dashed or hatched outline, so rooms with no use are obvious (this matches the Unassigned zone added in #61).

## Steps

### PR A — The block style: palette, volumes, lighting, default camera (M)

1. `modelView.ts`: add `BLOCK_COLORS` (zone → fill, plus ground, grid, edge colours) and a `ViewStyle = 'blocks' | 'model'` type. **Proposed palette, checked on 2026-10-26 against the thresholds in "Tests":** public `#F2B66D`, private `#8DB4E2`, collaborative `#B79CE0`, service `#EE8F7A`, circulation `#BDB8AE`, utility `#A9BC92`, unassigned `#E4E2DC` (deliberately pale, shown with a hatch and dashed outline); ground `#F3F3F1`; grid `#DAD8D2`; edges `#2F2E2B`. Every filled zone is at least 1.6:1 against the ground and the closest pair (circulation and unassigned) is ΔE 15. A first draft with circulation `#D9D6CF` failed: 1.31:1 against the ground and ΔE 4.3 from unassigned.
2. New `components/canvas/viewStyleStore.ts` (same pattern as `site/siteUiStore.ts`): `{ style, setStyle }`, default `blocks` outside the model stage and `model` inside it (`modelStage` is already a `Canvas3D` prop).
3. New `buildBlockModel(objects, openings, invalid, cutHeight)` in its own module next to `mergedGeometry.ts`, returning the same `MergedModel` shape (`solid`, `edges`, `solidOwners` …): one extruded volume per room from its footprint (polygon rooms via the same outline the floor slab uses, `mergedGeometry.ts` ~line 50), height = the plan-cut height, colour = zone colour as a vertex colour; walls thin and light grey at the same cut height, with edges on top. `MergedModel.tsx` picks the builder by style. `RoomMesh.tsx` uses the shared block-part function for the dragged or selected room. Model style is unchanged, and `buildMergedModel` is not modified.
4. `Scene.tsx`: in blocks style, ambient and hemisphere light dominate (about 0.9 and 1.1), one directional light at a fixed pleasant angle with `intensity` about 0.5, soft shadows only on the ground at short length (`shadow-radius` 6, tight frustum), no time-of-day dependence. While the **Sun** tool is open, use today's real-sun lighting, so the time-of-day shadow study still shows real shadows. The sun-hours numbers don't depend on scene lighting (they are ray-cast against `buildMergedModel`), so they need no special handling.
5. `Canvas3D.tsx`: in blocks style, light neutral background instead of the sky gradient, tone mapping off, AO off (as today by default). Default preset on opening a plan in the layout stage: `axo` (change the `initialPreset` default, and check `lensExitPreset` in `pages/Project/index.tsx` ~line 775, which also sets it). Keep `perspective` available, and set `maxPolarAngle` on the `OrbitControls` so the camera can't go below about 20° above the ground.
6. Tests (see below).

**Done when:** opening the villa plan in layout stage shows coloured zone blocks in axonometric on a light ground, rooms are distinguishable at a glance, "Furniture & details" still shows the existing model style, and `npx tsc --noEmit`, `npx vitest run` and `npm run test:e2e` pass.

### PR B — Labels, legend, plan-cut height, style switch (M)

1. `RoomLabels3D.tsx`: room name and area on each block (flat on the top face in axo, billboarded in perspective), hidden when the block is too small on screen. Use one batched text layer or HTML overlays like the existing top-view labels (`top-label-*` in `TopPlanOverlay.tsx`), not one text mesh per room (see the draw-call budget). Reuse `formatArea` (`utils/format.ts`).
2. A zone legend (reuse `ZONE_ORDER` / `ZONE_META` labels with the new colours), bottom-left, collapsible. It lists only zones present.
3. A "Cut height" control (Plan 1.2 m / Full) in the dock's view group; `Full` shows closed full-height walls like today.
4. A "Style: Blocks / Model" toggle in the View menu and the dock.
5. North arrow and a scale bar in axo (north arrow exists; add the scale).

### PR C — Selection, hover, problems, connections (M)

1. Hover: raise the block slightly and show a tooltip (name, zone, area). Selection: heavier outline and a soft glow in an accent token colour; other blocks dim slightly.
2. Problems: rooms with violations get a warning-coloured outline and a small marker (this is also issue #66, "Highlight the room or block that has the problem"; implement it once, here).
3. Connections overlay (toggle): lines between room centres for doors and openings, the entrance marked, reusing `roomGraphModel.ts`. This gives the "bubble diagram" feel in 3D. Off by default.

### PR D — Levels and presentation (M)

1. Multi-floor: an "Exploded" toggle that separates the levels vertically with a small gap, leaders to the stack, with the active floor highlighted (reuse `floorDisplay`).
2. Export a PNG of the blocks view with legend and title. Today File > Export > PNG draws a flat 2D plan image (`layoutPngDataUrl` in `LayoutThumbnail.tsx`), not the 3D scene, so this needs capturing the WebGL canvas (`preserveDrawingBuffer` or a `gl.render` then `toDataURL` at export time) and compositing the legend over it.
3. A style switch for the landing example and docs screenshots.

## Tests and verification

- **Unit (`modelView.test.ts` and a new `blockPalette.test.ts`):** every pair of zone colours is at least ΔE 10 apart (CIE76 in Lab); every filled zone is at least 1.5:1 contrast against the ground (Unassigned is exempt because it carries a hatch); `ViewStyle` defaults (blocks outside the model stage, model inside); the axo preset is the default in blocks style; the orbit limit is set.
- **Unit (`buildBlockModel` tests):** one volume per room (polygon rooms included) with vertex colours equal to the zone colour; walls at the cut height; `solidOwners` maps every triangle to an existing object id; the number of merged meshes for the villa fixture is no higher than `buildMergedModel` produces today.
- **Unit (sun-hours guard):** `analysis/sunHours.test.ts` results for a fixture are identical whatever the display style is set to (proves analysis still uses full-height geometry).
- **E2E (`frontend/e2e`):** open the generated plan, assert the style toggle exists and flips between Blocks and Model, assert the legend lists the zones present, and sample the canvas centre of two different rooms to confirm they are drawn in different colours (read pixels with `readPixels` or `page.screenshot` clip and compare; use tolerant thresholds because CI uses software GL).
- **Visual check by a person:** screenshot the villa plan (17 rooms), the 7-room plan and a two-floor plan in blocks and model styles, before and after, and attach them to the PR. The reported screenshot is the "before".
- **Regression:** the 19 existing E2E tests, the sun/analysis overlays, masses and comments pins must still render correctly in both styles.

## Risks and how to handle them

- **Sun-hours analysis shares geometry with the display.** It ray-casts against `buildMergedModel`. Never change that function for the blocks look; add `buildBlockModel` instead (see "Design decisions" and the sun-hours guard test).
- **The Sun tool's shadow study needs real lighting.** Use model-style lighting while it is open (step A4).
- **Software GL in CI** makes pixel assertions noisy. Assert on colour classes (hue), not exact values.
- **Polygon rooms and rooms that overhang the plot** (balconies): build volumes from the same footprint helpers the floors use so shapes match exactly.
- **Performance on integrated GPUs.** The blocks style must be cheaper than the model style, not dearer: no AO by default, no large shadow maps, merged meshes.
- **Colour accessibility.** Colour must not be the only cue: the legend and labels carry the meaning, and Unassigned has a pattern. Check the palette against common colour-blindness simulations before finalising.

## Questions for the owner (answer before PR A if possible)

1. Should the default plan-cut height be 1.2 m (see into every room) or full height (closer to today)? The plan assumes 1.2 m with a "Full" switch.
2. Colour by zone (7 colours) or by exact room type (about 12)? The plan starts with zones.
3. Should "Furniture & details" switch the style to Model automatically (the plan assumes yes) or stay in Blocks with furniture drawn as simple blocks?
