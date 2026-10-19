# Knowledge base

Notes for working on IndoorKit that the code alone does not make obvious: which API to reach for, and why the core is shaped the way it is. Check here before making design or API decisions.

How pages are written:
- Every claim points to the code that backs it, by file and function or class name.
- No code snippets and no line numbers, since both go stale quickly. Name things instead.
- Explain why and how; do not translate code line by line.
- When code changes something a page describes, update the page in the same change.

## Choosing APIs

#### Map lifecycle and resources

`createIndoorMap` builds a MapLibre map, adds the generated indoor style and runs plugins in dependency order. Everything created along the way is registered with one `ResourceTracker` and released in reverse order by `destroy()`.

- Use `createIndoorMap` to create a map; never construct `maplibregl.Map` yourself in SDK code.
- Use `ctx.trackSource` / `ctx.trackLayer` for sources and layers a plugin adds.
- Use `ctx.on` for SDK events and `ctx.onMap` for MapLibre events inside a plugin.
- Use `ctx.track(value, dispose, label)` for anything else that needs releasing (timers, workers, DOM nodes).
- Use `indoor.resources.size` / `indoor.resources.labels()` to check what is still registered.

[API Explanation](./KB_Core_Lifecycle.md)

#### Plugins

A plugin is a `definePlugin({ name, deps, setup })` object. `setup` receives a `PluginContext` and returns the plugin's API, which appears typed as `indoor.plugins.<name>`.

- Use `definePlugin` to declare a plugin.
- Use `deps` plus `ctx.get(name)` to call another plugin's API.
- Use `ctx.events` (`EventBus`) to broadcast; extend `IndoorEvents` by declaration merging for new events.
- Use `ctx.indoorLayerIds` for the layers that follow the current floor.

[API Explanation](./KB_Core_Lifecycle.md#plugins)

#### IMDF data

`@indoorkit/imdf` validates IMDF 1.0.0 archives with zod and turns them into a `VenueModel` the core consumes.

- Use `fetchImdf` to load an archive from a URL, `validateImdf` to check it, `buildVenueModel` to convert it.
- Use `pickLabel` to choose a label by language priority, and `languageFallbacks` (core) to build that priority from a UI locale.

#### Real-time data and spatial plugins

Live positions come from a `DataProvider` (`packages/core/src/types.ts`). `tools/rtls-simulator` provides one that runs `createSimulation` on a timer, either on the main thread (`createSimulationProvider`) or in a Worker through Comlink (`exposeSimulation` + `createWorkerProvider`).

- Use `positionStreamPlugin({ provider, intervalMs })` to draw positions; it owns the provider, disposes it with the map, and re-broadcasts each batch as the `positions:update` event.
- Use `geofencePlugin` (needs `polygon`), `heatmapPlugin` and `clusterPlugin` to consume positions; geofence and heatmap listen to `positions:update` themselves.
- Use `floorOverlay` (`packages/plugins/src/overlay.ts`) for any plugin layer that follows the current floor, and `localProjection` / `distanceMeters` for metric math on lng/lat.
- Use `clusterPoints` for greedy radius clustering with a KDBush index; `clusterPlugin` runs it on every `positions:update` for the current floor.
- Use `indoor.setTheme(themes.dark)` to recolor without recreating the map; `themePaint` is the single mapping from a theme to paint properties.

#### Testing

- Use `FakeMap` / `fakeMapFactory` (`packages/core/src/testing.ts`) for unit tests of core and plugins; they need no WebGL.
- Use `window.__vivi` (`apps/playground/src/test-hooks.ts`) to read playground state from Playwright tests and when an agent checks a demo.
- Use `tools/leak-bench` for heap-growth regressions across create/destroy cycles.

[API Explanation](./KB_Testing.md)

## Design Explanation

#### Reverse-order release

The map is registered first so it is released last; sources are registered before the layers that use them, so layers are removed first. This mirrors the order MapLibre requires (a source cannot be removed while a layer uses it, which `FakeMap.removeSource` also enforces).

[Design Explanation](./KB_Core_Lifecycle.md#release-order)

#### Bundling the MapLibre worker

maplibre-gl 6 derives its worker URL from its own module URL, which breaks after bundling. The playground sets it explicitly in `apps/playground/src/maplibre-worker.ts`. See [ADR 0001](../adr/0001-maplibre-and-imdf.md).
