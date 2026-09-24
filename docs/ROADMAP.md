# Roadmap

At most three things are "now". Finished items are deleted, not archived.

## Now

1. **Room proportions.** 40% of non-circulation rooms across the test fixtures
   are stretched beyond 2.2:1 (e.g. 21.7 × 2.3 m office bathrooms, 2 × 40 m
   clinic storage). Cause: every room in a corridor wing spans the full wing
   depth, and the plot is always 100% filled, so surplus area stretches service
   rooms. Direction: cap wing depth (a second row, or ensuites behind bedrooms),
   give surplus area to living/circulation, and add a proportion rule to the
   quality score so the best-of-N search stops picking strip layouts.
   Measure with the aspect-ratio script in the PR that fixes it.
2. **Fit robustness.** Some briefs fit a plot facing one way and not another
   (3BHK on 12 × 15 m: east fits, north fails with "wings need 13.5 m";
   4BHK + parking on 15 × 18 m fails outright). Try the other archetypes and the
   rotated band order before giving up.
3. **Editor page split.** `pages/Project/index.tsx` (~930 lines, 39 `useState` calls)
   and `store/canvasStore.ts` (~1.2k lines) should become a stage router
   (brief / review / edit) and a document store separate from UI state.

## Next

- A Playwright test of the core loop: brief → generate → drag a room → save → reload.
- Front-door placement as a user connection (today only interior pairs can be overridden).
- ESLint rule against hex colour literals in components (tokens live in `tailwind.config.ts`).

## Later

- Workspaces, sharing and billing stay as they are until the core loop is solid.
