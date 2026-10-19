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
