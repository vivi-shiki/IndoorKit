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

Prefer these over screenshots: they give exact values, they don't depend on the GPU, and an agent can check a demo without reading pixels. When a new demo or plugin adds visible state, add a hook for it in the same change.

## Memory regression

`tools/leak-bench/memory-lab.spec.ts` runs 5 warm-up cycles and then 50 create/destroy cycles in the memory demo, forcing GC through CDP before each measurement. It fails if `JSHeapUsedSize` grows by 8 MiB or more, or if `unreleased` is not 0.

## Intermittent failures

See "Memory leaks and intermittent failures" in [coding.md](../guidelines/coding.md#memory-leaks-and-intermittent-failures). CI retries Playwright tests once (`playwright.config.ts`), so a test that passes only on retry still counts as a failure to investigate.
