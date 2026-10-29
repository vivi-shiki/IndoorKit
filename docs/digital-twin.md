# Digital twin campuses

The three new pages are accessible through the **Digital twin / 数字孪生 / デジタルツイン** link in each scenario menu:

- `#/hospital/twin`: hospital wings, glazed connections, entrance canopies and roof equipment; department and room inventory.
- `#/parking/twin`: open parking decks, ramp well, separate lift/stair towers and the surface lot; simulated available bays and device availability.
- `#/museum/twin`: stone facade, rooflight, separate west escape core, public forecourt and sculpture garden; collection and monitoring-device inventory.

All campuses include local roads, road markings, trees, planting beds, cars, light poles, benches, paving, a pond and a sculpture. The scenes use fictional locations and operational data. Their local outdoor map works without an external tile service.

## Floor-plan research and changes

The following references were consulted for circulation and facility placement, not copied as real operational datasets:

| Reference | Observed principle | Change to the fictional demo |
| --- | --- | --- |
| [Doncaster Royal Infirmary official simplified map, 2025](https://www.dbth.nhs.uk/wp-content/uploads/2025/08/Simplified-DRI-map.pdf), main plan and emergency/outpatient plan | Public entrances connect to the internal corridor network; buildings are connected but can be entered separately | Each hospital wing now has a principal entrance through its reception, with an actual gap in the exterior wall. The 3D canopy and door use those opening coordinates. |
| [Jem official B2/B3 access guide and floor plans](https://www.jem.sg/accessibility-guide/basement-2-and-3/) | Accessible bays have additional width and are near lift lobbies; pedestrian routes and vehicle circulation are identified separately | Widen the ground-floor accessible bays near the lift, retaining a 6 m vehicle aisle. Replace the zero-length inter-floor car lane with a finite switchback route and model the open ramp well. |
| [Smithsonian historical museum guide](https://www.smithsonianeducation.org/educators/field_trips/si.pdf), PDF page 24, Hirshhorn floor plan | Public lobby, lifts, toilets and outdoor sculpture garden form identifiable visitor destinations | Split the oversized museum lift zone into a lift and a separate washroom, both opening to the landing; add a west escape stair connected to the corridor on every level. The original staff-only basement collection spaces remain staff-only. |

These are schematic demo layouts, not a claim of compliance with building, fire or accessibility regulations. The historic museum guide is a circulation reference, not current visitor advice.

The parking capacity is now 331: the ground-floor A row exchanges one standard bay for two 3.75 m accessible bays. The other standard bays remain 2.5 m wide and the aisles remain 6 m wide.

## Assets and licences

| Asset | Origin | Licence / treatment |
| --- | --- | --- |
| Buildings, facades, roofs, roads, kerbs, crossings, street lights, benches, pond | Original deterministic geometry in `tools/venue-gen/src/twin.ts` | Repository MIT licence |
| Paving base colour and OpenGL normal | [ambientCG Paving Stones 036](https://ambientcg.com/view?id=PavingStones036), 1K JPG pack | [CC0](https://docs.ambientcg.com/license/); 512 px copies embedded in the high-quality GLB |
| Trees, shrubs, flowers, rocks, obelisk | [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) | CC0. kenney.nl is blocked from the build environment, so the files come from the CC0 npm mirror `@netforge/asset-library-files@0.2.0`; `tools/venue-gen/assets/cc0/sources.json` records pack, source and SHA-256 for each file |
| Cars, taxi, van, ambulance, delivery van | [Kenney Car Kit](https://kenney.nl/assets/car-kit) | CC0, same mirror and checksums |
| Surrounding city blocks | [Kenney City Kit (Commercial)](https://kenney.nl/assets/city-kit-commercial) | CC0, same mirror and checksums; drawn in one neutral material as context massing |
| Rendering approach | [Three.js](https://github.com/mrdoob/three.js), [MapLibre custom-layer 3D example](https://maplibre.org/maplibre-gl-js/docs/examples/add-3d-tiles-3d-objects-and-models-using-threejs/) | Standard glTF/PBR, geographic transform and explicit shared-context ownership; no dashboard or third-party application code copied |

Models are committed at `apps/playground/public/models/{hospital,parking,museum}/scene.glb` and `scene-low.glb`. Shared source textures are in `apps/playground/public/models/textures`. Each model directory also contains a local `site.geojson` and a manifest with the geographic origin, the extended ground, every building (IMDF id, glTF node, centre, height) and the measured mesh/triangle/instance/download budgets.

Each building is a top-level node named `Building A`, `Building B`, … with child groups `Shell` (baked vertex ambient occlusion near the ground), `Floors`, `Windows` (all four facades), `Roof` and, for the garage, `Facade`, `Vehicle ramps`, `Lift and stair towers`. CC0 props are placed with `EXT_mesh_gpu_instancing` under `Trees`, `Vehicles` and `Context`, which carry `props: true` in their extras. The low-quality file keeps every other instance, drops window mullions and the paving texture, and uses coarser curves.

## Render levels

The quality popover offers Automatic and five levels, following the original map-sdk's graded rendering. Each level is a set of switches; a site default can override a level, and the viewer's own overrides win over both. The choice is kept in `localStorage`.

| Level | Model | Props | Pixel ratio | Shadows | Other switches |
| --- | --- | --- | --- | --- | --- |
| L0 | none: MapLibre 2.5D massing from IMDF level outlines | none | 1 | off | no anti-aliasing, no sky |
| L1 | `scene-low.glb` | half | 1 | off | anti-aliasing, sky and haze |
| L2 | `scene.glb` | all | 1.25 | 1024 | paving texture, environment reflections |
| L3 | `scene.glb` | all | 1.5 | 2048 | indoor floors generated in Three.js with a section cut, building outlines |
| L4 | `scene.glb` | all | 2 | 2048 soft | as L3 |

Automatic starts from the device (save-data → L0; narrow screen, four or fewer threads, ≤ 2 GB memory or a software GPU → L1; a discrete GPU with eight threads → L3; otherwise L2) and steps down after sustained slow frames, back up after sustained smooth frames, never above the starting level. Anti-aliasing belongs to the WebGL context, so changing it recreates the map. All levels use ACES filmic tone mapping. The sun follows the simulation clock (lights on from 18:00 to 06:00) and its shadow frustum follows the zoom. No post-processing pass is used.

Clicking a building focuses it (the others are lowered and faded) and opens a card that can enter its floors. Labels follow the camera and give way to each other by height. Entering a floor tilts the camera to at least 40° and fits the whole level; floors above are hidden and floors below are drawn as translucent ghosts. Parking levels get a facade band coloured by the share of free bays; museum rooms with alarms in the last hour get a coloured marker above the roof.

## Blender editing

1. Open the committed `scene.glb` (the page no longer offers a download button).
2. In Blender choose **File → Import → glTF 2.0 (.glb/.gltf)**. Textures are embedded; no external paths need repairing.
3. Keep the imported scale: one glTF unit is one metre. Blender converts glTF's Y-up coordinates automatically. The geographic origin is metadata, not a huge world-space vertex offset.
4. Objects are grouped by names such as `Building A/Windows`, `Water garden` and `Street furniture`. In Edit Mode, **Separate → By Loose Parts** separates individual windows, trees or cars from their material batch. Materials remain editable.
5. Export glTF with materials and textures embedded. Keep the same origin and scale to preserve alignment with the IMDF indoor map. The build generator is the source of the committed default assets; keep manual variants outside the generated directories or update the generator before rebuilding.

## Verification

`pnpm verify` checks circulation, accessible-bay geometry, route parsing, the render-level policy, Three.js floor generation and the committed GLBs (budgets, CC0 checksums, instancing, facades, baked AO, building list). `pnpm build` regenerates all three sites and packages the pages. `pnpm e2e` checks the quality popover and its persistence, L0 massing, anti-aliasing, sky and tone mapping, labels, focus and the building card, the floor section cut, the simulation clock and status colours, desktop/mobile, three languages, both themes, and release after repeated scenario and level changes; the leak bench cycles L4 → L0 with floors and focus. Screenshots from the twin tests are written to `test-results/` for visual review.
