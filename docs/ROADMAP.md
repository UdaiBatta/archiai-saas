# Roadmap

At most three things are "now". Finished items are deleted, not archived.

## Now

1. **Remaining stretched rooms (22% of home-fixture rooms, down from 32%).** Left:
   the pooja room in a bedroom wing (4.6 × 1.2 m), a lone common bathroom with no
   attached one to stack against, upstairs wings in multi-storey homes (villa
   bedrooms ~3 × 11 m), and rooms along long office corridors. Next: a
   proportion rule in the score so the search prefers squarer rooms, and
   letting small private rooms (pooja, study) join the living zone.
2. **Fit robustness.** The 3BHK and 4BHK fixtures now fit all four facings
   since the building-footprint change. Still to do: try the other archetypes
   and the rotated band order before refusing tight plots.
3. **Editor page split.** `pages/Project/index.tsx` (~930 lines, 39 `useState`
   calls) and `store/canvasStore.ts` (~1.2k lines): a stage router
   (brief / review / edit) and a document store separate from UI state.

## Next

- Polygon plots place one layout with no search over room orders, so a bad
  arrangement can't be avoided (known case: a trapezoid where the living room
  is only reachable through the kitchen; `test_polygon_home_has_no_room_behind_the_kitchen`
  is an xfail). Give the polygon path the same ordering search as rectangles.
- Garage access: a garage should open onto the entry, a utility room or the
  outside, not a dining or living room.
- A Playwright test of the core loop: brief → generate → drag a room → save → reload.
- Front-door placement as a user connection (today only interior pairs can be overridden).
- Draw the building footprint / yard in the 2D editor (the data is already in `mvpFootprint`).
- Payments: wire `/api/billing` to the pricing page; paid plans show "Coming soon" until then.
- ESLint rule against hex colour literals in components (tokens live in `tailwind.config.ts`).

## Later

- Workspaces, sharing and billing stay as they are until the core loop is solid.
