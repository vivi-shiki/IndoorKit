# IndoorKit Development Roadmap

[中文](roadmap.zh-CN.md) · [English](roadmap.en.md) · [日本語](roadmap.ja.md)

IndoorKit is an open-source TypeScript indoor map SDK, with a demo gallery, a real-time location dashboard, and an AI assistant that operates the map through natural language. All map data describes a fictional hospital, "Sakura General Hospital" (さくら総合病院), and every dependency is a public package or open data.

The roadmap has 7 levels, numbered 0 to 6. Level 1 is the **minimum demonstrable version (MVP)**. Each later level adds capabilities on top of a working previous level, and Level 6 completes every planned feature. A level's "gate" must be fully passed before work moves to the next level.

**Progress**: levels 0, 1 and 2 are done (2026-10-19). Two changes made while building level 2: the clustering comparison uses a KDBush spatial index instead of supercluster so that both algorithms return identical results, and Demo 4 offers 1,000 / 5,000 / 10,000 points, because the double loop freezes the page for over ten seconds at 50,000.

## Overview

| Level | Theme | What can be demonstrated when it is done |
| --- | --- | --- |
| 0 | Engineering foundation | The empty repository lints, tests, and deploys to GitHub Pages automatically |
| **1** | **Minimum demonstrable version** | **Open the fictional hospital map online, switch floors, add markers; a memory lab proves that repeated create/destroy does not leak** |
| 2 | Real-time location and spatial computing | Thousands of tags moving live, a before/after clustering comparison, geofence alerts, heatmaps |
| 3 | Navigation and multiple floors | Cross-floor route planning (with an accessible mode), an exploded multi-floor view, multi-campus switching |
| 4 | 3D and adaptive quality | three.js building and facility models, 3D fences, automatic quality selection per device |
| 5 | Application layer and AI assistant | React components, a real-time location dashboard, natural-language map control |
| 6 | Docs, release, and extensions | Documentation site, npm release, outdoor basemap, optional 3D Tiles city models |

## Level 0: Engineering foundation

Goal: settle how the project builds, tests, and ships first, so every later feature goes through the same pipeline.

- pnpm workspace monorepo: `packages/core`, `packages/imdf`, `packages/plugins`, `apps/playground`, `tools/venue-gen`, `tools/leak-bench`
- TypeScript strict, Vite library mode (ESM output), ESLint or Biome
- Vitest unit tests; Playwright end-to-end tests (Chromium)
- GitHub Actions: lint → typecheck → test → build → deploy to GitHub Pages
- A single entry command, `pnpm verify` (lint + typecheck + test); vite / tsc are never called directly
- AI collaboration rules live in the repository: `AGENTS.md` (project structure and the single build entry), `docs/guidelines/coding.md` (architecture rules, such as "every resource a plugin creates must be registered"), `docs/adr/` (architecture decision records)

**Gate 0**: after a push to main, CI is green and GitHub Pages serves an empty playground page.

## Level 1: Minimum demonstrable version (MVP)

Goal: an indoor map anyone can view from a link, with numbers that prove the core design (automatic resource release) works.

**Core (@indoorkit/core)**

- `createIndoorMap({ container, data, plugins })`: lifecycle init → load → ready → destroy, with a typed event at each step
- `definePlugin`: a plugin declares its name and dependencies, plugins load in dependency order, and plugin APIs are inferred by TypeScript (`map.plugins.marker.add(...)` is fully typed)
- `ResourceTracker`: plugins register sources, layers, and event listeners with `ctx.track()`; `destroy()` releases them automatically in reverse creation order
- `EventBus`: plugins communicate only through core events
- Map engine: MapLibre GL JS (npm package, ESM import, no token required)

**Data (@indoorkit/imdf)**

- Load IMDF (OGC Community Standard 1.0.0, based on GeoJSON) from a directory or zip
- A validator written with zod (OGC provides no official validator, so the custom validator is itself a showcase)
- Convert to an internal model: Venue / Building / Level / Unit / Opening / Amenity

**Fictional data (tools/venue-gen)**

- A script generates a "corridor + rooms on both sides + stairwells / elevator shafts" layout from parameters; the MVP size is 1 building × 3 floors
- Output is IMDF, department names are bilingual (ja / en), and coordinates are placed at a fictional location

**Rendering and plugins**

- Style generator: builds MapLibre layers from IMDF categories plus a theme config (light theme)
- Walls and rooms are extruded to 2.5D with MapLibre `fill-extrusion`, so no model assets are needed
- Japanese and Chinese labels use MapLibre's default local font rendering (`localIdeographFontFamily`), so no CJK glyph files are generated for the MVP
- `floor` plugin + floor switcher control
- `marker` plugin: add, remove, filter by floor

**Demo gallery (apps/playground)**

- Demo 1 "Basic map": load the fictional hospital, switch floors, add markers; the page shows time to first render
- Demo 2 "Memory lab": create and destroy the map repeatedly, showing heap size and unreleased resource count per round in real time

**Memory regression (tools/leak-bench)**

- Playwright calls `HeapProfiler.collectGarbage` over CDP, then reads `JSHeapUsedSize` from `Performance.getMetrics`
- After 50 create/destroy rounds, heap growth must stay under a set threshold, or CI fails

**Gate 1 (MVP acceptance)**: Demo 1 and Demo 2 open on GitHub Pages; floor switching and markers work; leak-bench passes in CI; the README has a live link and screenshots.

## Level 2: Real-time location and spatial computing

Goal: show large volumes of real-time data, spatial algorithms, and measurable performance.

- Dark theme; UI and map labels in three languages (ja / en / zh)
- A `DataProvider` interface; the default implementation is a Web Worker location simulator (communicating via Comlink) with thousands of tags reporting at 1 Hz
- `position-stream` plugin: interpolated smooth movement, track recording and playback
- `popup`, `line`, `polygon` overlay plugins
- `cluster` plugin: uses supercluster
- `geofence` plugin: flatbush spatial index + turf `booleanPointInPolygon`, emitting enter/leave events
- `heatmap` plugin: MapLibre's native heatmap layer, showing people density over a time window (one flat heatmap per floor)
- Performance overlay: FPS, main-thread time
- Fictional data grows to 3 buildings × 5 floors
- Demo 3 "Real-time location": shows FPS and main-thread time
- Demo 4 "Clustering at 10k scale": clusters the same data with an O(n²) double loop and with a spatial index, showing both timings
- Demo 7 "Geofence and alerts" (2D version): enter/leave detection, alert popups, time per detection batch
- Demo 10 "Heatmap"

**Gate 2**: with 5,000 simulated tags, Demo 3 stays smooth on an ordinary laptop (target ≥ 50 FPS, as measured); Demo 4 shows a measured timing comparison of the two algorithms on the page.

## Level 3: Navigation and multiple floors

Goal: complete the two most distinctive indoor map interactions: cross-floor navigation and the exploded multi-floor view.

- venue-gen generates a route network: corridor centerlines + door nodes + cross-floor stair / elevator links; edges carry length and an `accessible` flag; output as an IMDF extension (LineStrings with `level_id`)
- `route` plugin: A* from ngraph.path, computed in the browser; elevator / stair weights; accessible mode (stair edges blocked)
- `nav-animation` plugin: navigation animation along the route with camera follow
- `multi-floor` plugin: each floor gets a height offset via `fill-extrusion-base` to form an exploded view; custom mouse / touch gestures switch floors with a vertical swipe, with animation
- `camera-sequence` plugin: preset camera animation sequences
- `campus-switcher`: switches between multi-campus data sources, with memory dropping back after a switch
- UI widgets: compass, scale bar
- Spatial queries: which building / room contains a coordinate (flatbush index)
- Demo 5 "Cross-floor route planning": shows planning time and route length
- Demo 6 "Exploded multi-floor view": shows animation frame rate
- Demo 11 "Multi-campus switching": shows heap size before and after a switch

**Gate 3**: a route can be planned between any two rooms (including across buildings and floors), and in accessible mode the route never uses stairs; routing unit tests cover cross-floor and unreachable cases; leak-bench passes after switching campuses back and forth 20 times.

## Level 4: 3D and adaptive quality

Goal: show WebGL / three.js skill and support for low-end devices.

- `@indoorkit/three`: a custom `ThreeLayer` (MapLibre CustomLayerInterface) sharing the WebGL context, with Mercator-to-meter conversion (following MapLibre's official three.js example)
- Ray picking: derive the ray from the projection matrix MapLibre passes in (there is no official example, so it is implemented and tested in-house)
- Models: GLTFLoader + MeshoptDecoder (and DRACOLoader); an InstancedMesh object pool; building focus (other buildings are lowered); shadows
- 3D plugins: `fence-3d` (fence columns), `sphere-3d`, `line-3d`, `models` (facilities placed automatically by amenity category)
- Asset pipeline: only CC0 / CC-BY assets (KayKit, Kenney, Quaternius, Poly Haven; the wheelchair comes from Poly Pizza under CC-BY with attribution); missing items such as elevators and monitors are modeled in Blender; everything is converted to glb at 1 unit = 1 meter with the origin at the bottom center; `gltf-transform` applies meshopt compression; `ASSETS.md` records each model's source and license
- `quality` plugin: five render levels, L0 to L4 (controlling antialiasing, 2.5D, models, shadows, and more); the initial level is estimated with `@pmndrs/detect-gpu`, and at runtime FPS decides, with automatic downgrade when it stays low (the library's benchmark source has stopped updating, so it only sets the starting value)
- Performance overlay adds draw call count
- Demo 7 is upgraded to 3D fences; Demo 8 "3D buildings": shows draw call count; Demo 9 "Adaptive quality": shows current level and FPS

**Gate 4**: Demo 8 runs smoothly at L4; Demo 9 downgrades automatically when FPS is artificially limited; leak-bench passes after destroying a map with 3D content (geometries, materials, and textures are all released).

## Level 5: Application layer and AI assistant

Goal: prove the SDK can be used to build a product, and show the AI × IoT × healthcare direction.

- `@indoorkit/react`: `<IndoorMap>` component, `useIndoorMap`, `usePlugin` (React 19)
- `apps/rtls-dashboard` real-time location dashboard: asset list + map + alert stream + AI chat panel
- Optional `DataProvider`: a Node WebSocket server, demonstrating a separate backend
- `@indoorkit/ai`
  - Plugins can declare `tools` (name, description, zod parameters); tool definitions are generated with zod v4's `z.toJSONSchema()`, with `$defs` inlined for compatibility across model providers
  - Query tools (`findNearest`, `whereIs`, `listAlerts`) run directly; action tools (`planRoute`, `setFence`) are previewed on the map first and take effect only after the user confirms
  - Model adapters: Anthropic and OpenAI-compatible APIs; the online demo uses the user's own API key (direct browser calls, with the key stored only locally)
  - A built-in recorded replay is the default, so the online demo works fully without a key
- Demo 12 "AI map assistant": for example "3階で一番近い車椅子は？" (nearest wheelchair on 3F) or "ICUまで案内して" (guide me to the ICU); the page shows the tool call log

**Gate 5**: the dashboard runs on GitHub Pages without any key (replay mode); real conversations work once a key is entered; action tools never take effect without confirmation.

## Level 6: Docs, release, and extensions

Goal: complete every planned feature and become an open-source project others can use.

- Documentation site: VitePress + TypeDoc API reference; bilingual README (ja / en); a 30-second demo GIF
- Release: Changesets manages multi-package versions, published to npm
- Outdoor basemap: OpenFreeMap by default (no key, but no service guarantee), with a self-hosted small-area Protomaps PMTiles file as the fallback
- Map glyphs: if a custom Latin font is needed, glyph PBFs are generated with font-maker; icons are packed into a sprite with spreet
- Optional `3d-tiles` plugin: 3d-tiles-renderer synced to the MapLibre camera; PLATEAU city models as an outdoor backdrop (requires handling the glTF `CESIUM_RTC` offset)
- devtools: panels for unreleased resource count, draw calls, and the layer list
- Test matrix: each "browser × quality level × demo" cell is verified before a release
- Knowledge base: `docs/kb/` (for example ResourceTracker, ThreeLayer coordinate conversion), also used as source material for the documentation site

**Gate 6**: `@indoorkit/*` installs from npm; the documentation site is live; all 12 demos and the dashboard work; the test matrix passes in full.

## Demo list by level

| # | Demo | Level |
| --- | --- | --- |
| 1 | Basic map | 1 |
| 2 | Memory lab | 1 |
| 3 | Real-time location | 2 |
| 4 | Clustering at 10k scale | 2 |
| 5 | Cross-floor route planning | 3 |
| 6 | Exploded multi-floor view | 3 |
| 7 | Geofence and alerts | 2 (2D) / 4 (3D) |
| 8 | 3D buildings | 4 |
| 9 | Adaptive quality | 4 |
| 10 | Heatmap | 2 |
| 11 | Multi-campus switching | 3 |
| 12 | AI map assistant | 5 |
