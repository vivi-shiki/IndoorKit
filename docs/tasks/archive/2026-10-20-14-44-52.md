# !!!INVESTIGATE!!!

# PROBLEM DESCRIPTION

学mapbox示例，在视角较高处显示热力图，在较低处涂色

先写测试，后改功能

验收标准：
1、高度不一致时应该有两套热力图显示方案，随着显示高度切换
2、功能和mapbox官方方案一致
3、测试通过
4、github存在该提交
5、page已经更新上去

# UPDATES

# TEST [CONFIRMED]

Reference: the Mapbox GL JS example "Create a heatmap layer" (earthquakes). A `heatmap` layer with `maxzoom`, whose weight follows a data property, whose radius and intensity grow with zoom, and whose opacity fades to 0 over the last zoom levels. A `circle` layer on the same source with `minzoom`, colored by the same property with the same palette, sized by zoom and property, with a white 1 px stroke, fading in over the first zoom level. Mapbox fades over zoom 7–9 for a world map. On the hospital the 2 m grid shows through the fixed 25 px radius from about zoom 19.5 (screenshots at 18–21), and the page opens at 18.5 (desktop) / 16.8 (phone), so the band here is 19–21.

1. `packages/plugins/test/heatmap.test.ts` "heatmap display by zoom" (Vitest, FakeMap):
   - `indoor-heat` is a heatmap with `maxzoom` 21 and opacity 1 at zoom 19 → 0 at 21; radius and intensity increase with zoom; weight follows `weight`; color follows `heatmap-density`.
   - `indoor-heat-point` is a circle layer on the same source with `minzoom` 19, opacity 0 at 19 → 1 at 20, white 1 px stroke; color by `weight` using the heatmap's palette; radius by zoom, and within each zoom by weight.
   - every cell feature has its own `id`.
2. `apps/playground/e2e/heat-zoom.spec.ts` (Playwright, `renderedCount` respects each layer's zoom range): crowding page opens below 19 with only the heatmap; at 19.5 both are drawn; at 21.5 only the colored cells; back at 18 only the heatmap. New hooks `zoom()` / `setZoom(z)` on every map page.
3. `pnpm verify`, `pnpm build`, `pnpm e2e` pass; the commit is on GitHub `main`; the CI deploy job has published the new playground to GitHub Pages.

Before the change: the 3 unit tests fail (no `maxzoom`, no point layer, no `id`), and the e2e test fails at zoom 19.5 (no colored cells).

# PROPOSALS

- No.1 Heatmap and colored-circle layers crossfading by zoom, as in the Mapbox example [CONFIRMED]

## No.1 Heatmap and colored-circle layers crossfading by zoom, as in the Mapbox example

### CODE CHANGE

- `packages/plugins/src/heatmap.ts`: the `indoor-heat` heatmap layer gets `maxzoom` 21, intensity 1→3 and radius 10→25→60 px over zoom 16→18.5→21, the Mapbox color ramp on `heatmap-density`, and opacity 1 at 19 → 0 at 21. A new `indoor-heat-point` circle layer on the same source (`minzoom` 19) is colored by `weight` with the same palette, sized by zoom and then weight, has a white 1 px stroke, and fades in from 19 to 20. The palette is defined once and spread over density 0–1 for the heatmap and weight 0–20 for the circles. Cell features carry `id` (the grid key).
- Playground hooks `zoom()` / `setZoom(z)`.

### CONFIRMED

- Unit tests 11/11; `heat-zoom.spec.ts` passes 10/10 in parallel and 20/20 serially. Screenshots at zoom 18.5 / 19.5 / 20.5 / 21.5: continuous heatmap, crossfade, colored circles only.
- Two test-hook defects found while confirming, both fixed:
  - `setZoom` returned `map.jumpTo(...)`, the whole MapLibre `Map`. `page.evaluate` serialized it, which took 60–85 s per call under six parallel workers, so the e2e test timed out in the full suite. It now returns nothing; the call takes milliseconds.
  - `renderedCount` / `renderedLevelIds` used `queryRenderedFeatures` alone. That does not check the layer's `minzoom` / `maxzoom`, so right after zooming out it still returned circles from tiles kept from the higher zoom, although the painter skips layers hidden at the current zoom. The hook now applies `StyleLayer.isHidden(zoom)` first.
- `pnpm verify` 228/228, `pnpm build`, `pnpm e2e` 82/82 twice in a row. KB: `Index.md` (heatmap display) and `KB_Testing.md` (hooks) updated.
