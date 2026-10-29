# IndoorKit

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

IndoorKit is an indoor mapping SDK for the browser, written in TypeScript on top of MapLibre GL JS. It reads venues in IMDF, draws floors and rooms in 2.5D, and puts everything else (floors, markers, live positions, geofences, heatmaps, routes) into plugins that are typed end to end and clean up after themselves.

**Live demo: <https://vivi-shiki.github.io/indoorkit-demo/?lang=en>**

## Features

- **Plugin system.** `definePlugin` declares a plugin and its dependencies. Plugins load in dependency order, and their APIs are typed on `indoor.plugins`.
- **No leaks by design.** Every source, layer, listener, timer and Worker a plugin creates is registered with a `ResourceTracker`, and `destroy()` releases them in reverse order. A memory regression test checks the JS heap, Workers and leftover resources.
- **Open data.** Venues are IMDF (an OGC Community Standard), validated with zod, including references between features and unique ids. Data outside the standard, such as departments or parking zones, goes into typed extension files with their own checks.
- **Styles from data.** Room colors and heights come from the room category and a theme, and rooms and walls are extruded without 3D models. Language and theme switch at runtime without recreating the map.
- **Real-time positioning.** A `DataProvider` contract for location feeds, with a position stream that interpolates thousands of tags smoothly, plus trails with stop detection, geofences, room clustering and bounded-memory heatmaps.
- **Business logic stays outside.** The SDK knows nothing about any industry. Domain packages hold the rules and do not depend on the map or the DOM.
- **Tested without a GPU.** Unit tests run the SDK against an in-memory mock map. The demo repository drives the SDK in a browser with Playwright and measures heap growth.

## Packages

| Package | Contents |
| --- | --- |
| `@indoorkit/core` | Map creation, camera, plugin system, resource tracking, events, style and theme generation. The only package that imports MapLibre |
| `@indoorkit/imdf` | IMDF loading, validation and conversion, and extension files |
| `@indoorkit/rtls` | Real-time positioning contract: tag positions, data providers and the `positions:update` event |
| `@indoorkit/plugins` | Floor, zone, position stream, unit cluster, unit state, route, trail, cluster, geofence, heatmap, polygon, line, popup and marker plugins |

## Usage

```ts
import { createIndoorMap, definePlugin } from '@indoorkit/core';
import { buildVenueModel, fetchImdf } from '@indoorkit/imdf';
import { floorPlugin, markerPlugin, unitStatePlugin } from '@indoorkit/plugins';

const venue = buildVenueModel(await fetchImdf('/data/my-venue'));

// A custom plugin: its API appears as indoor.plugins.clicks
const clicksPlugin = definePlugin({
  name: 'clicks',
  deps: ['floor'],
  setup(ctx) {
    let count = 0;
    ctx.on('map:click', () => count++); // released by destroy()
    return { count: () => count };
  },
});

const indoor = await createIndoorMap({
  container: 'map',
  venue,
  plugins: [
    floorPlugin,
    markerPlugin,
    unitStatePlugin({ colors: { free: '#30a46c', occupied: '#e5484d' } }),
    clicksPlugin,
  ] as const,
});

indoor.plugins.floor.set('2F');
indoor.plugins.marker.add({ id: 'gate', coord: venue.center, label: 'Gate' });
indoor.plugins['unit-state'].set('unit-201', 'occupied');
indoor.events.on('floor:change', ({ levelId }) => console.log(levelId));

await indoor.destroy();
```

## Examples

The live demo shows three use cases built on the SDK, each with its own business package and simulator: hospital RTLS, parking management and a museum, plus a digital twin cockpit for each. Its source, the fictional venue data and the 3D campus models are in the [indoorkit-demo](https://github.com/vivi-shiki/indoorkit-demo) repository.

| Hospital | Parking | Museum |
| --- | --- | --- |
| ![Live People Tracking](https://raw.githubusercontent.com/vivi-shiki/indoorkit-demo/main/docs/images/tracking.png) | ![Space Availability](https://raw.githubusercontent.com/vivi-shiki/indoorkit-demo/main/docs/images/parking-availability.png) | ![Environmental Monitoring](https://raw.githubusercontent.com/vivi-shiki/indoorkit-demo/main/docs/images/museum-environment.png) |

## Development

Requires Node.js 22 and pnpm.

```bash
pnpm install
pnpm verify   # lint, typecheck and unit tests
pnpm build    # build the packages
```

Architecture decisions are in [docs/adr](docs/adr).

TypeScript (strict) · MapLibre GL JS · IMDF · zod · Web Worker + Comlink · KDBush · Flatbush · Turf · Vite · pnpm workspaces · Vitest · Playwright · Biome · GitHub Actions + GitHub Pages
