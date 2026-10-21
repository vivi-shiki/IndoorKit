# IndoorKit

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

IndoorKit is an indoor mapping SDK for the browser, written in TypeScript on top of MapLibre GL JS. It reads venues in IMDF, draws floors and rooms in 2.5D, and puts everything else (floors, markers, live positions, geofences, heatmaps, routes) into plugins that are typed end to end and clean up after themselves.

**Live demo: <https://vivi-shiki.github.io/IndoorKit/?lang=en>**

## Features

- **Plugin system.** `definePlugin` declares a plugin and its dependencies. Plugins load in dependency order, and their APIs are typed on `indoor.plugins`.
- **No leaks by design.** Every source, layer, listener, timer and Worker a plugin creates is registered with a `ResourceTracker`, and `destroy()` releases them in reverse order. A memory regression test checks the JS heap, Workers and leftover resources.
- **Open data.** Venues are IMDF (an OGC Community Standard), validated with zod, including references between features and unique ids. Data outside the standard, such as departments or parking zones, goes into typed extension files with their own checks.
- **Styles from data.** Room colors and heights come from the room category and a theme, and rooms and walls are extruded without 3D models. Language and theme switch at runtime without recreating the map.
- **Real-time positioning.** A `DataProvider` contract for location feeds, with a position stream that interpolates thousands of tags smoothly, plus trails with stop detection, geofences, room clustering and bounded-memory heatmaps.
- **Business logic stays outside.** The SDK knows nothing about any industry. Domain packages hold the rules and do not depend on the map or the DOM.
- **Tested without a GPU.** Unit tests run the SDK against an in-memory mock map. Playwright drives the demo through test hooks and measures heap growth.

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

The live demo shows two use cases built on the SDK. Each has its own business package (`domains/hospital`, `domains/parking`) and simulator, and is independent of the other. All venues, people, vehicles and companies are fictional.

- **Hospital RTLS**: "Sakura General Hospital", 3 buildings with 5 floors. Live tracking of up to 5,000 people, asset tracking, location history playback, alerts from department zones and geofences, and a location heatmap.
- **Parking management**: "Minato Central Parking", a four-level garage and a surface lot with 332 spaces. Space availability with sensors and cameras, entries and exits with fees, three tiers of alerts, reservations with routes along the lanes, and operations analytics.

| Hospital | Parking |
| --- | --- |
| ![Live People Tracking](docs/images/tracking.png) | ![Space Availability](docs/images/parking-availability.png) |

The demo app is in `apps/playground` (React and MUI), and supports Chinese, English and Japanese, light and dark themes, and phones.

## Development

Requires Node.js 22 and pnpm.

```bash
pnpm install
pnpm build                         # generate data, build packages and the demo
pnpm verify                        # lint, typecheck and unit tests
pnpm e2e                           # end-to-end and memory tests
pnpm --filter playground preview   # http://localhost:4173/IndoorKit/
```

Architecture decisions are in [docs/adr](docs/adr).

TypeScript (strict) · MapLibre GL JS · IMDF · zod · Web Worker + Comlink · KDBush · Flatbush · Turf · Vite · pnpm workspaces · Vitest · Playwright · Biome · GitHub Actions + GitHub Pages
