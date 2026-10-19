# Testing

## Unit tests without WebGL

`FakeMap` (`packages/core/src/testing.ts`) implements `MapLike` in memory. It fires `load` asynchronously like the real map, rejects duplicate sources, and refuses to remove a source that a layer still uses. Pass `fakeMapFactory()` as `mapFactory` to `createIndoorMap`.

## Playground test hooks

Each demo calls `setHooks` (`apps/playground/src/test-hooks.ts`) and fills in what it supports; everything else throws "not available in this demo". Playwright reads them with `page.evaluate(() => window.__vivi!...)` after waiting for `window.__vivi.ready`.

| Hook | Demo | Returns |
| --- | --- | --- |
| `floor()`, `levelIdOf(short)` | basic | current floor short name; level id for a short name |
| `renderedLevelIds(layer)`, `renderedCount(layer)` | basic | what is actually rendered, via `queryRenderedFeatures` |
| `labelLanguage()` | basic | the first language in the label expression |
| `resourceLabels()` | basic | `indoor.resources.labels()` |
| `styleLayerIds()` | basic | ids of every layer in the live MapLibre style |
| `cycles`, `unreleased`, `runCycles(n)` | memory | create/destroy cycle count, `resources.size` after the last destroy, run more cycles |
| `mapBackground()` | every map page | the live background color, to check the theme |
| `perf()`, `tagScreenPoint()`, `replaying()` | realtime | overlay numbers (same snapshot the overlay shows); screen point of a tag with history; tag whose trail is shown |
| `clusterRun()` | cluster | point count, both timings, whether results match, cluster count |
| `fenceIds()`, `alertCount()` | geofence | fences on the map; enter/exit events so far |
| `heatWindow()`, `heatPointCount()`, `heatLevelIds()` | heatmap | window in minutes; samples in the window; levels in the drawn data |

The floor, render and style hooks of the basic demo are available on every map page, because `mountMapPage` (`apps/playground/src/map-page.ts`) sets them.

`window.__viviStats` survives page changes: `activeWorkers` (simulation Workers not yet terminated), `liveMaps` (maps created by `createTrackedMap` and not yet destroyed) and `lastUnreleased` (`resources.size` after the last destroy). `tools/leak-bench/page-switch.spec.ts` checks all three are back to 0 after visiting every page.

Pages whose map redraws continuously (live positions) never fire `idle`, so they become ready on the first rendered batch of positions instead (`readyWhen: 'first-positions'`).

Prefer these over screenshots: they give exact values, they don't depend on the GPU, and an agent can check a demo without reading pixels. When a new demo or plugin adds visible state, add a hook for it in the same change.

## Memory regression

`tools/leak-bench/memory-lab.spec.ts` runs 5 warm-up cycles and then 50 create/destroy cycles in the memory demo, forcing GC through CDP before each measurement. It fails if `JSHeapUsedSize` grows by 8 MiB or more, or if `unreleased` is not 0.

## Intermittent failures

See "Memory leaks and intermittent failures" in [coding.md](../guidelines/coding.md#memory-leaks-and-intermittent-failures). CI retries Playwright tests once (`playwright.config.ts`), so a test that passes only on retry still counts as a failure to investigate.
