# Testing

## Unit tests without WebGL

`FakeMap` (`packages/core/src/testing.ts`) implements `MapLike` in memory. It fires `load` asynchronously like the real map, rejects duplicate sources, and refuses to remove a source that a layer still uses. Pass `fakeMapFactory()` as `mapFactory` to `createIndoorMap`. It also records camera calls (`cameraCalls`) and answers `queryRenderedFeatures` for point features, so `pick` and `rendered` on plugins can be unit tested. `createManualProvider` (`@indoorkit/rtls/testing`) is a `DataProvider` that emits batches when the test calls `emit`.

## Playground test hooks

Each page calls `setHooks` (`apps/playground/src/testing/hooks.ts`) and fills in what it supports; everything else throws "not available in this demo". Playwright reads them with `page.evaluate(() => window.__vivi!...)` after waiting for `window.__vivi.ready`.

| Hook | Demo | Returns |
| --- | --- | --- |
| `floor()`, `levelIdOf(short)` | every map page | current floor short name; level id for a short name |
| `renderedLevelIds(layer)`, `renderedCount(layer)` | every map page | what is actually rendered, via `queryRenderedFeatures`; a layer hidden at the current zoom (`minzoom`, `maxzoom`, `visibility`) counts as nothing, because the query alone still returns features from tiles kept from another zoom level |
| `zoom()`, `setZoom(z)` | every map page | current zoom; jump to a zoom keeping the center |
| `labelLanguage()` | every map page | the first language in the label expression |
| `resourceLabels()` | every map page | `indoor.resources.labels()` |
| `styleLayerIds()` | every map page | ids of every layer in the live MapLibre style |
| `mapBackground()` | every map page | the live background color, to check the theme |
| `venueScreenCenter()` | every map page | viewport position of the venue center, to check no overlay covers it |
| `perf()`, `tagScreenPoint()`, `replaying()` | tracking | overlay numbers (same snapshot the overlay shows); screen point of a tag with history; tag whose trail is shown |
| `clusterCount()`, `clusterScreenPoint()` | assets | cluster points on the current floor; screen point of one that is already drawn (data reaches the plugin a frame before MapLibre draws it, so a point taken from the data alone may not be clickable yet) |
| `fenceIds()`, `alertCount()` | alerts | fences on the map; enter/exit events so far |
| `heatWindow()`, `heatPointCount()`, `heatLevelIds()` | occupancy | window in minutes; samples in the window; levels in the drawn data |

The floor, render and style hooks are available on every map page, because `mountMapPage` (`apps/playground/src/pages/map-page.ts`) sets them. The ones that read the MapLibre style or rendered features live in `installMapHooks` (`apps/playground/src/testing/map-hooks.ts`), which goes through `inspect` from `@indoorkit/core/testing`; pages themselves never touch the raw map. Page hooks that need rendered features use plugin APIs instead (`positionStream.rendered()`, `unitCluster.rendered()`).

`window.__viviStats` survives page changes: `activeWorkers` (simulation Workers not yet terminated), `liveMaps` (maps created by `createTrackedMap` and not yet destroyed) and `lastUnreleased` (`resources.size` after the last destroy). `tools/leak-bench/page-switch.spec.ts` checks all three are back to 0 after visiting every page.

## Phone layout

`apps/playground/e2e/mobile.spec.ts` checks the map pages at 375×812 by layout boxes, not pixels: every floating part is inside the viewport, no two overlap, and the venue center lands on the map canvas. On phones (`@media (max-width: 640px)` in `style.css`) the left list sits behind the `panel-toggle` button that `mountMapPage` adds, and the list and drawers open as bottom sheets. The initial `fitBounds` padding is read from the laid-out list and toggle, so the same code centers the venue on both layouts.

Pages whose map redraws continuously (live positions) never fire `idle`, so they become ready on the first rendered batch of positions instead (`readyWhen: 'first-positions'`).

Prefer these over screenshots: they give exact values, they don't depend on the GPU, and an agent can check a demo without reading pixels. When a new demo or plugin adds visible state, add a hook for it in the same change.

## Memory regression

`tools/leak-bench/page-switch.spec.ts` opens all four pages in turn, 2 warm-up rounds and then 8 measured rounds, forcing GC through CDP before each measurement. It fails if `JSHeapUsedSize` grows by 8 MiB or more, or if any Worker, map or registered resource is left after returning to the home page.

## Intermittent failures

See "Memory leaks and intermittent failures" in [coding.md](../guidelines/coding.md#memory-leaks-and-intermittent-failures). CI retries Playwright tests once (`playwright.config.ts`), so a test that passes only on retry still counts as a failure to investigate.
