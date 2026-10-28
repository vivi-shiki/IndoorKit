# ADR 0006: Editable digital-twin campuses

Status: accepted

The three demos gain independent `#/hospital/twin`, `#/parking/twin` and `#/museum/twin` pages. Existing operational routes remain the defaults. A shared cockpit in `apps/playground/src/app/twin` receives a venue and metric callbacks; it imports no scenario package. Scenario adapters own the hospital inventory and the parking/museum simulation snapshots. A time slider selects a simulated hour; it is not a live telemetry feed.

`@indoorkit/core/twin` is an optional, dynamically imported entry point. Three.js shares MapLibre's WebGL context through a custom layer. The scene uses metre-scale glTF, +Y up, +X east, +Z south, with the venue's geographic origin recorded in its manifest. MapLibre remains responsible for navigation and the existing floor plugin remains responsible for indoor filtering. The custom layer and all listeners, requests, GPU buffers, materials, image bitmaps and shadow targets have explicit lifecycle ownership.

The representation switches into the indoor map above zoom 18.85 and back to the exterior below 18.5. The gap prevents oscillation around the threshold. Floor controls enter the indoor view directly. Exterior fitting is calculated from the campus bounds and the available desktop/mobile viewport.

Three.js standard PBR materials, hemisphere fill light and one directional sun provide lighting. High quality uses a 1024-pixel cached shadow map. Low quality loads a separate reduced GLB, disables shadows and caps the map pixel ratio at 1. High quality caps it at 1.5. Auto selects low on narrow viewports, devices reporting four or fewer hardware threads, or save-data connections, and steps down after sustained slow interactive frames. Rendering follows map changes; there is no independent perpetual animation loop. A WebGL initialization failure leaves an SVG site/indoor plan, floor controls and model export available.

The sites are fictional offshore coordinates. A local GeoJSON campus plan is the outdoor basemap, with roads, building footprints and landscape geometry. An unrelated real-world tile map would show ocean under these campuses. No commercial tile token or third-party model request is required. This is a campus-scale model, not a city-scale photogrammetric model or a BIM construction deliverable.

`tools/venue-gen/src/twin.ts` derives footprints and principal entrances from the same IMDF archives as the indoor views and writes the committed models under `apps/playground/public/models`. `pnpm build` regenerates them. All exterior objects are named by building, floor or landscape function and material; batches reduce draw calls. Blender can separate a batch by loose parts when individual props are needed. GLB download always exports the complete high-quality campus, regardless of the current floor or rendering quality.

The asset provenance, real-plan references and Blender workflow are in [Digital twin assets](../digital-twin.md). Architecture tests allow both self-contained scenarios to use `app/twin`; they still prohibit imports between the scenarios.
