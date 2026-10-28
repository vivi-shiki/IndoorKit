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
| Building geometry, roads, trees, cars, benches, lights, lake and sculpture | Original deterministic geometry in `tools/venue-gen/src/twin.ts` | Repository MIT licence; no copied commercial meshes |
| Paving base colour, OpenGL normal and roughness | [ambientCG Paving Stones 036](https://ambientcg.com/view?id=PavingStones036), 1K JPG pack | [CC0](https://docs.ambientcg.com/license/); base colour embedded in both GLBs, normal in the high-quality GLB; roughness source included for authoring |
| Nature/car asset research | [Kenney Nature Kit](https://kenney.nl/assets/nature-kit), [Kenney Car Kit](https://kenney.nl/assets/car-kit) | CC0 packs evaluated; download requests returned HTTP 403, so no Kenney geometry is redistributed; original lightweight props are used |
| Rendering approach | [Three.js](https://github.com/mrdoob/three.js), [MapLibre custom-layer 3D example](https://maplibre.org/maplibre-gl-js/docs/examples/add-3d-tiles-3d-objects-and-models-using-threejs/) | Standard glTF/PBR, geographic transform and explicit shared-context ownership; no dashboard or third-party application code copied |

Models are committed at `apps/playground/public/models/{hospital,parking,museum}/scene.glb` and `scene-low.glb`. Shared source textures are in `apps/playground/public/models/textures`. Each model directory also contains a local `site.geojson` and a manifest describing the geographic origin, scene dimensions and measured mesh/triangle/download budgets.

## Blender editing

1. Use **Export GLB** on a cockpit, or open its committed `scene.glb`.
2. In Blender choose **File → Import → glTF 2.0 (.glb/.gltf)**. Textures are embedded; no external paths need repairing.
3. Keep the imported scale: one glTF unit is one metre. Blender converts glTF's Y-up coordinates automatically. The geographic origin is metadata, not a huge world-space vertex offset.
4. Objects are grouped by names such as `Building 1/Floor 2`, `Water garden` and `Street furniture`. In Edit Mode, **Separate → By Loose Parts** separates individual windows, trees or cars from their material batch. Materials remain editable.
5. Export glTF with materials and textures embedded. Keep the same origin and scale to preserve alignment with the IMDF indoor map. The build generator is the source of the committed default assets; keep manual variants outside the generated directories or update the generator before rebuilding.

## Verification

`pnpm verify` checks circulation, accessible-bay geometry, route parsing, quality/zoom policy and the committed GLBs. `pnpm build` regenerates all three sites and packages the pages. `pnpm e2e` checks desktop/mobile controls, three languages, both themes, automatic indoor transitions, GLB downloads, and release after repeated scenario/quality changes. Screenshots from the twin tests are written to `test-results/` for visual review.
