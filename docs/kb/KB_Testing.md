# Testing

## Unit tests without WebGL

`FakeMap` (`packages/core/src/testing.ts`) implements `MapLike` in memory. It fires `load` asynchronously like the real map, rejects duplicate sources, and refuses to remove a source that a layer still uses. Pass `fakeMapFactory()` as `mapFactory` to `createIndoorMap`.

## Playground test hooks

Each demo calls `setHooks` (`apps/playground/src/test-hooks.ts`) and fills in what it supports; everything else throws "not available in this demo". Playwright reads them with `page.evaluate(() => window.__vivi!...)` after waiting for `window.__vivi.ready`.

| Hook | Demo | Returns |
| --- | --- | --- |
| `floor()`, `levelIdOf(short)` | every map page | current floor short name; level id for a short name |
| `renderedLevelIds(layer)`, `renderedCount(layer)` | every map page | what is actually rendered, via `queryRenderedFeatures` |
| `labelLanguage()` | every map page | the first language in the label expression |
| `resourceLabels()` | every map page | `indoor.resources.labels()` |
| `styleLayerIds()` | every map page | ids of every layer in the live MapLibre style |
| `mapBackground()` | every map page | the live background color, to check the theme |
| `perf()`, `tagScreenPoint()`, `replaying()` | tracking | overlay numbers (same snapshot the overlay shows); screen point of a tag with history; tag whose trail is shown |
| `clusterCount()` | assets | cluster points on the current floor |
| `fenceIds()`, `alertCount()` | alerts | fences on the map; enter/exit events so far |
| `heatWindow()`, `heatPointCount()`, `heatLevelIds()` | occupancy | window in minutes; samples in the window; levels in the drawn data |

The floor, render and style hooks are available on every map page, because `mountMapPage` (`apps/playground/src/map-page.ts`) sets them.

`window.__viviStats` survives page changes: `activeWorkers` (simulation Workers not yet terminated), `liveMaps` (maps created by `createTrackedMap` and not yet destroyed) and `lastUnreleased` (`resources.size` after the last destroy). `tools/leak-bench/page-switch.spec.ts` checks all three are back to 0 after visiting every page.

Pages whose map redraws continuously (live positions) never fire `idle`, so they become ready on the first rendered batch of positions instead (`readyWhen: 'first-positions'`).

Prefer these over screenshots: they give exact values, they don't depend on the GPU, and an agent can check a demo without reading pixels. When a new demo or plugin adds visible state, add a hook for it in the same change.

## Memory regression

`tools/leak-bench/page-switch.spec.ts` opens all four pages in turn, 2 warm-up rounds and then 8 measured rounds, forcing GC through CDP before each measurement. It fails if `JSHeapUsedSize` grows by 8 MiB or more, or if any Worker, map or registered resource is left after returning to the gallery.

## Intermittent failures

See "Memory leaks and intermittent failures" in [coding.md](../guidelines/coding.md#memory-leaks-and-intermittent-failures). CI retries Playwright tests once (`playwright.config.ts`), so a test that passes only on retry still counts as a failure to investigate.
