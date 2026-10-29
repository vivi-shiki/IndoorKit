# Knowledge base

Notes for working on IndoorKit that the code alone does not make obvious: which API to reach for, and why the core is shaped the way it is. Check here before making design or API decisions.

Paths under `apps/`, `domains/` and `tools/` are in the [indoorkit-demo](https://github.com/vivi-shiki/indoorkit-demo) repository since the split ([ADR 0007](../adr/0007-sdk-and-demo-repositories.md)).

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
- Use `defineImdfExtension({ file, schema, check, build })` for data outside the IMDF standard; pass the extensions to `fetchImdf`, `validateImdf` and `buildVenueModel`, and read the result from `venue.extensions[file]`. Hospital departments are one (`departmentExtension` in `@indoorkit/hospital`).

#### Layers

Map engine, SDK, business and pages are kept apart ([ADR 0002](../adr/0002-sdk-and-domain-layers.md), checked by `test/layers.test.ts`).

- Use `indoor.camera.focus` / `indoor.camera.fit`, `indoor.project`, `indoor.idle()` / `indoor.rendered()` and the `map:click` event from pages instead of MapLibre calls.
- Use `indoor.plugin<T>(name)` / `indoor.hasPlugin(name)` for a plugin known only by name, instead of casting `indoor.plugins`.
- Use `ctx.queryRendered(layerIds, { point, radius })` inside a plugin to answer "what is drawn here"; plugins expose it as `pick` / `rendered` (`positionStreamPlugin`, `unitClusterPlugin`). It skips layers hidden at the current zoom.
- Put industry logic in a domain package (`domains/hospital`): it may import `@indoorkit/imdf` and `@indoorkit/rtls` types, never the map. Connect it to plugins in `apps/playground/src/adapters` (for example `hospitalAlarmPlugin`).
- Use `pickLabel` to choose a label by language priority, and `languageFallbacks` (core) to build that priority from a UI locale.

#### Real-time data and spatial plugins

Live positions come from a `DataProvider` (`packages/rtls/src/index.ts`, which also declares the `positions:update` event). `tools/rtls-simulator` provides one that runs `createSimulation` on a timer, either on the main thread (`createSimulationProvider`) or in a Worker through Comlink (`exposeSimulation` + `createWorkerProvider`).

- Use `positionStreamPlugin({ provider, intervalMs })` to draw positions; it owns the provider, disposes it with the map, and re-broadcasts each batch as the `positions:update` event. Pass `visible: false` when a page only needs the data (clusters, heatmap).
- Use `zonePlugin({ zones })` to tint groups of units (departments, tenants); the zones come from the caller, for example `hospital.zones()`.
- Use `geofencePlugin` (needs `polygon`), `heatmapPlugin({ cellMeters, windowsMinutes, window })` and `clusterPlugin` to consume positions; geofence and heatmap listen to `positions:update` themselves. `unitClusterPlugin` takes its `statusOrder` and `statusColors` from the caller.
- `heatmapPlugin` follows the Mapbox "Create a heatmap layer" example: the `indoor-heat` heatmap layer (zoom-scaled radius and intensity) fades out between zoom 20 and 22, and the `indoor-heat-point` circle layer on the same source, colored and sized by cell weight with the same palette, fades in from 20 to 21 (moved up one level from 19–21 on 2026-10-22 so the switch happens only when zoomed in closer). A fixed-pixel heatmap over 2 m grid cells shows the grid as separate dots once zoomed in, which is why the display switches.
- Use `floorOverlay` (`packages/plugins/src/overlay.ts`) for any plugin layer that follows the current floor, and `localProjection` / `distanceMeters` for metric math on lng/lat. Never call `setData` or `setFilter` on a plugin GeoJSON source yourself: `floorOverlay` filters by floor in the data and keeps at most one `setData` in flight (the next one waits for `sourcedata` with `isSourceLoaded`). MapLibre does not wait for or cancel a running reload of the same tile, and overlapping parses of different data make `queryRenderedFeatures` throw "feature index out of bounds" (`apps/playground/e2e/streaming-query.spec.ts`).
- Use `clusterPoints` for greedy radius clustering with a KDBush index; `clusterPlugin` runs it on every `positions:update` for the current floor.
- Use `indoor.setTheme(themes.dark)` to recolor without recreating the map; `themePaint` is the single mapping from a theme to paint properties.

#### Testing

- Use `FakeMap` / `fakeMapFactory` (`packages/core/src/testing.ts`) for unit tests of core and plugins; they need no WebGL.
- Use `window.__vivi` (`apps/playground/src/testing/hooks.ts`) to read playground state from Playwright tests and when an agent checks a demo.
- Use `tools/leak-bench` for heap-growth regressions across create/destroy cycles.

[API Explanation](./KB_Testing.md)

## Design Explanation

#### Digital-twin campuses

Use the optional `@indoorkit/core/twin` entry for geographic GLB rendering with MapLibre. `twinPlugin` exposes representation, quality, building focus, time and status controls plus state/frame subscriptions. It shares the map context and tracks its GPU resources; never call `forceContextLoss` on this renderer. Models and local outdoor maps are generated from IMDF by `tools/venue-gen/src/twin.ts`. See [ADR 0006](../adr/0006-digital-twin.md) and [asset/Blender guide](../digital-twin.md).

`applyCampusView` in `packages/core/src/twin/scene.ts` hides only building-owned geometry indoors; keep the outdoor scene root visible. Business views belong in each scenario's `adapters/twin-indoor.ts`. `filterIndoorItems` in `app/twin/indoor.ts` supplies the same floor/search slice to the list and the `markerPlugin.replaceAll` overlay. Do not create another map or duplicate device/person state when adding a business mode. `markerPlugin.setVisible` and `pick` keep outdoor visibility and map selection consistent with the existing floor overlay lifecycle.

#### Reverse-order release

The map is registered first so it is released last; sources are registered before the layers that use them, so layers are removed first. This mirrors the order MapLibre requires (a source cannot be removed while a layer uses it, which `FakeMap.removeSource` also enforces).

[Design Explanation](./KB_Core_Lifecycle.md#release-order)

#### Bundling the MapLibre worker

maplibre-gl 6 derives its worker URL from its own module URL, which breaks after bundling. The playground sets it explicitly in `apps/playground/src/engine/maplibre.ts`. See [ADR 0001](../adr/0001-maplibre-and-imdf.md).
