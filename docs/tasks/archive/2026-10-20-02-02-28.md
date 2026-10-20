# !!!INVESTIGATE!!!

# PROBLEM DESCRIPTION

几个页面的左上角菜单都挡住了手机端显示，手机端实现更好的显示方案

先写测试，后开发

验收标准：
1、各个页面左上角的组件在手机端自然显示，不遮挡

# UPDATES

# TEST [CONFIRMED]

`apps/playground/e2e/mobile.spec.ts` (Playwright, 375×812 phone viewport plus a desktop check):

- Every map page on a phone: the floating parts (`.bar`, `.panel`, `.panel-toggle`, `.perf`, `.player`, `.floors`, `.venue-name`, open `.drawer`, `.app-controls`) are each inside the viewport, no two overlap, and the page has no horizontal scroll.
- The venue center (`window.__vivi.venueScreenCenter()`) lands on the map canvas, not under a panel.
- The left list is collapsed behind a `panel-toggle` button (`aria-expanded`); opening it shows it as a sheet no taller than half the map area and still clear of the other parts; it closes again.
- Assets: a unit drawer opened from a cluster stays on screen and clear of the other parts. Tracking: choosing a search result shows the person card and hides the list.
- Desktop: the list stays open beside the map, the toggle is hidden, nothing overlaps.
- `pnpm verify`, `pnpm build`, `pnpm e2e` pass.

Before the fix all 12 phone tests fail: the panel covers the map and the floor buttons, `.perf` and `.player` sit at `left: 312px` and leave the viewport, the venue name runs under the language buttons, and there is no toggle. The 5 desktop checks already pass.

# PROPOSALS

- No.1 Phones: list behind a toggle, panels and drawers as bottom sheets [CONFIRMED]

## No.1 Phones: list behind a toggle, panels and drawers as bottom sheets

### CODE CHANGE

- `map-page.ts`: every page with a `.panel` gets a `panel-toggle` button (`aria-expanded`, label `panel.toggle` in three languages) that sets `data-panel-open` on `.stage`. The initial `fitBounds` padding is taken from the layout (the list's right edge when it is shown, the toggle's bottom when it is shown) instead of a fixed 312 px, so the venue is centered in the free area on both phone and desktop. New hook `venueScreenCenter`.
- `style.css`, one `@media (max-width: 640px)` block: the toggle and the venue name stack at the top left (the venue name no longer collides with the language buttons), `.perf` goes under them; the list is hidden until opened and then becomes a bottom sheet (full width, at most 45 % of the map area, above the language buttons and above the trail player); drawers use the same sheet and hide the list while open; the trail player spans the width above the language buttons. On desktop the toggle is hidden and nothing changes.

### CONFIRMED

- `mobile.spec.ts`: 17/17 pass (12 phone, 5 desktop). Screenshots in Chinese at 375×812 show the map clear with only the venue name and the 一覧/List/列表 button at the top left; the opened list sits above the language buttons (and above the trail player); nothing leaves the screen.
- The venue is now centered in the free area on phones, because the `fitBounds` padding follows the actual layout; desktop padding is unchanged (16 + 280 + 16 = 312).
- `pnpm verify` passes. `pnpm e2e` showed two failures that are not caused by this change:
  - `efficiency.spec.ts` cluster click (and the new phone drawer test, which uses the same hook) failed 5/10 on the unchanged HEAD. Cause: `clusterScreenPoint` returned a cluster from the plugin's data before MapLibre had drawn it, so the click hit nothing. Fixed in a separate commit by returning only drawn clusters; 50/50 runs pass afterwards.
  - `business.spec.ts` "unit clusters" fails about 1/20 also on HEAD: MapLibre throws `feature index out of bounds` in `queryRenderedFeatures`. In `geojson_worker_source._parseWorkerTile`, when two parses of the same tile overlap after rapid `setData` calls, one result is paired with the other's raw tile data. This needs an SDK change in `floorOverlay` (send the next `setData` only after the source has finished loading) with its own unit tests; left as a follow-up.
  - `people.spec.ts` "clicking a person" (1/10 on HEAD) had the same cause in `tagScreenPoint`, and `theme-contrast.spec.ts` "map pages" (2/10 on HEAD) opened five pages inside one 30 s test budget. Fixed in a separate commit (drawn tags only; one ready budget per page); 30/30 runs pass afterwards.
- Review: the toggle is created before the page's first `translate(root)`; `translate` only walks descendants, so translating the button itself had left its label empty until a later page-wide translate. The test now checks the label.
- Final: `pnpm verify` passes, `pnpm build` and `pnpm e2e` pass 78/78.
- Regressions fixed along the way: `test-hooks.ts` default for the new hook; working-copy CRLF in a few files (git index already LF) that made biome fail.
