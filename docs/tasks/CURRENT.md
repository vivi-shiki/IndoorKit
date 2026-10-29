# !!!INVESTIGATE!!!

# PROBLEM DESCRIPTION

建模、外表和ui都缺少数字孪生的精致感，参考我原来项目的室内室外模型，以及建筑模型，还有各种画质显示配置项，给出一个优化方案

(Plan delivered as the artifact "数字孪生页精致化方案". Decisions and follow-up from Vivi, 2026-10-29:)

1用three 2用cc0 3暂时先不做

先给上述你列出的方案写测试，而后再实现

# UPDATES

# TEST [CONFIRMED]

Plan items A (modelling), B (materials and lighting, without post-processing), C (quality settings) and D (UI). Each item has a test written before its implementation.

- Unit, `packages/core/test/twin-policy.test.ts`: five presets L0–L4 with the agreed switch matrix; three-layer merge (preset < site defaults < user overrides); device detection; frame governor that steps down after sustained slow frames and back up after sustained fast frames, never above its ceiling; only model/prop/texture changes need a new GLB; shadow extent follows zoom; sun position and night by simulated hour; section cut (above hidden, current solid, below ghost); building focus style; label decluttering; idle orbit only outdoors and never with reduced motion.
- Unit, `packages/core/test/twin-floors.test.ts`: indoor floors are generated in Three.js from IMDF (units grouped by category, wall fixtures extruded to wall height, level elevation = ordinal × floor height, local metre coordinates inside the building).
- Unit, `packages/core/test/create-indoor-map.test.ts`: `antialias` reaches the map factory.
- Generator, `tools/venue-gen/test/twin-assets.test.ts` and `twin.test.ts`: GLB budgets (high ≤ 4 MB, low ≤ 1.5 MB); CC0 props vendored with checksums and credited; props instanced with `EXT_mesh_gpu_instancing`, low has about half the instances; windows on all four facades; baked vertex AO on building shells; a context neighbourhood outside the site; extended ground, sidewalks and crossings in `site.geojson`; manifest lists buildings with node names, centres and heights; the parking garage has a principal entrance; the museum pond clears every building.
- App unit, `apps/playground/test/twin.test.ts`: quality preferences round-trip through storage and ignore corrupt values; parking levels and museum rooms map simulated data to good / warn / critical; new copy exists in zh/en/ja.
- E2E, `apps/playground/e2e/twin.spec.ts`: the quality popover (levels, per-switch override, persistence after reload, performance line); L0 shows 2.5D extrusions without a GLB; antialias, sky, environment lighting and tone mapping on L2+; floors open with a section cut, pitch ≥ 40° and the whole building in view; building labels in the current language; clicking a building focuses it and shows a card that can enter a floor; reset view; night after 18:00 on the simulation slider; status colours painted on parking and museum; parking shows a principal entrance; desktop/mobile, both themes, three languages, no page errors.
- Leak bench, `tools/leak-bench/twin.spec.ts`: switching through every level, floors, focus and labels keeps unreleased resources at 0 and heap growth under 8 MiB.

Gates: `pnpm verify`, `pnpm build`, `pnpm e2e`. Commits carry the owner trailer.

# PROPOSALS

1. Render policy in `packages/core/src/twin/policy.ts` (L0–L4 switch sets, three-layer merge, device detection, frame governor, view hysteresis, shadow extent, sun by hour, section cut, focus, label placement, idle orbit), free of Three.js and exported from `@indoorkit/core`. [CONFIRMED] 13 unit tests.
2. Indoor floors generated in Three.js from IMDF (`floors.ts`), shown in the indoor view at L3+ with a section cut: the current floor sits just under the MapLibre floor so labels and picking stay with MapLibre; lower floors are translucent ghosts. [CONFIRMED] unit + e2e (pitch ≥ 40°, level in view).
3. Generator rewrite: buildings as nodes carrying IMDF ids, windows on four facades, baked vertex AO on the shell plinth, sidewalks/kerbs/crossings, context neighbourhood, CC0 Kenney props as GPU instances. Static geometry is indexed and only paving keeps UVs; car counts and context density were cut to stay under 120k triangles. [CONFIRMED] 66 generator tests; budgets high 1.4–2.0 MB, low 1.25–1.43 MB, 81k–104k triangles.
4. Renderer: ACES tone mapping, room environment map, MapLibre sky, shadows sized per level with zoom-following extent, outlines, focus with per-building material clones, ray picking against building boxes, labels projected from the last frame, night emissive glass and lamps, status bands and markers, progressive low→high download with progress. [CONFIRMED] e2e.
5. Page: quality popover (levels, individual switches, performance line) persisted in localStorage; anti-aliasing change recreates the map; labels with declutter; building card with enter-floor; reset view; legend; site plan dimmed at night. [CONFIRMED] e2e 8/8 twin tests.
6. Test hook `buildingPoint` only returns points not covered by UI (the quality popover covered the first candidate). [CONFIRMED]
7. L0 reports ready only after MapLibre has drawn the massing layer (map idle). [CONFIRMED] fixed a race in the extrusion check.
