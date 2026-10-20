# Map lifecycle and resources

Source: `packages/core/src/create-indoor-map.ts`, `packages/core/src/resource-tracker.ts`, `packages/core/src/plugin.ts`.

## Phases

`createIndoorMap` emits `lifecycle` events in this order: `init` (before the map exists), `load` (MapLibre `load` fired), `ready` (all plugins set up), and later `destroy`. Handlers passed as `options.on` are attached before `init`, so they see every phase.

## What gets registered

One `ResourceTracker` per map. In registration order:

1. The map itself, label `map`, disposed with `map.remove()`.
2. The sources and layers from `buildIndoorStyle`, labels `source:<id>` and `layer:<id>`.
3. For each plugin, in dependency order: whatever it registers through its context. `ctx.track` labels are prefixed with the plugin name (`marker:...`); `ctx.on` and `ctx.onMap` register as `<plugin>:on:<event>` and `<plugin>:map.on:<event>`. `trackSource` and `trackLayer` use the same `source:` / `layer:` labels as the core style.

Nothing else is registered after `ready`. Switching floors only calls `setFilter` on the venue layers and `setData` on the plugin overlay sources, and adding markers only calls `setData` on the existing `indoor-markers` source, so `resources.labels()` stays the same while the map is used. The e2e test "switching floors and adding markers registers no new resources" checks this.

## Release order

`ResourceTracker.disposeAll` walks the entries backwards. Because the map is first and each source is registered before its layers, the result is: plugin listeners and layers, then their sources, then the core layers and sources, then the map. Removing a source before its layer would fail in MapLibre, and `FakeMap.removeSource` throws in the same case so unit tests catch it.

`disposeAll` keeps going if one dispose throws and returns the collected errors. `destroy()` still finishes the whole release, marks the map destroyed and clears its events, then rejects with an `AggregateError` holding those errors. A failed release is a bug (see "Fail loudly, but validate input" in [coding.md](../guidelines/coding.md)), so it is not logged and swallowed.

If setup fails partway (a plugin throws), `createIndoorMap` disposes everything registered so far and rethrows, so a failed create leaves nothing behind.

## Plugins

`sortPlugins` orders plugins topologically by `deps` and throws on duplicate names, missing dependencies and cycles. `ctx.get(name)` throws unless that plugin was already set up, which with correct `deps` it always is.
