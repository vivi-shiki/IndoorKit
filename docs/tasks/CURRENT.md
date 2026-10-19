# !!!INVESTIGATE!!!

# PROBLEM DESCRIPTION

帮我实现这份需求文档的需求
1、先写硬性功能的测试，比如各种功能正常实现（性能指标之类的不能硬性考核的东西不用管）
2、评估测试后迭代一次测试
3、按照测试来逐项编写功能

验收标准
1、测试
2、pages正常运行，具有这几个页面，页面内正常渲染出了内容
3、页面切换后内存不泄漏

(The requirements document is "vivi-map 第 2 级需求：实时定位与空间计算", items R1–R8 and Demo 3, 4, 7 (2D), 10.)

# UPDATES

# TEST [CONFIRMED]

Functional tests only; frame-rate and timing thresholds are out of scope.

Unit tests (Vitest, FakeMap, no WebGL):

- R1 `tools/venue-gen/test/generate.test.ts`: 3 buildings × 5 floors, one level per floor shared by all buildings, bridges between buildings, IMDF validation passes, every unit inside its level, no overlaps, one door per enclosed unit, walls never cover a door, deterministic.
- R2 `tools/rtls-simulator/test/*.test.ts`: same seed gives identical batches; tag count and interval honored; tags always stand inside a unit of their level and never inside a wall; tags change floors only through elevators or stairs; the provider stops emitting after `stop()` and terminates the worker on `dispose()`; the Comlink worker provider delivers batches over a real MessageChannel.
- R3 `packages/plugins/test/position-stream.test.ts`: interpolation between samples, snapping across floors, stale tags hidden, only the current floor rendered, track history limited to the window, replay draws the trail, everything released on destroy.
- R4 `packages/plugins/test/cluster.test.ts`: the naive and the indexed algorithms return identical clusters; radius respected; plugin renders the current floor only.
- R5 `packages/plugins/test/geofence.test.ts`, `overlays.test.ts`: enter/exit on boundary, nested fences, floor changes, no repeated events; polygon, line and popup plugins add, remove and release.
- R6 `packages/plugins/test/heatmap.test.ts`: time window filter, current floor only, bounded memory (per-minute buckets).
- R8 `packages/core/test/theme.test.ts`, `apps/playground/test/settings.test.ts`: `setTheme` updates paint properties without recreating the map; the theme setting is detected, saved and restored like the locale.

End-to-end tests (Playwright, through `window.__vivi`):

- Gallery lists 6 demos; each new demo opens, becomes ready and renders its content (positions, clusters, fence polygon and alerts, heatmap points).
- Demo 3: tags render on the current floor only; clicking a tag replays its trail.
- Demo 4: both algorithms report a duration and identical results.
- Demo 7: a preset fence is drawn, tags trigger alerts, a popup opens.
- Demo 10: switching the time window and floor updates the heatmap data.
- R7: the performance overlay shows the same numbers the hooks return.
- R8: the theme toggle changes UI and map colors, persists after reload.
- i18n: every new page title follows the language switch.
- leak-bench: switching through all pages repeatedly leaves no workers, no unreleased resources, and heap growth under 8 MiB.

Success criteria: `pnpm verify` and `pnpm e2e` pass; GitHub Pages serves all pages with rendered content; page switching does not leak.

## Review of the first draft (one iteration)

- The performance overlay test read the DOM and the hook in two calls; the numbers refresh in between, so it could fail at random. Now both are read in one `page.evaluate` and must be equal.
- The geofence demo's preset fence (ICU) is on 3F, but maps open on 1F, so the fence polygon and popups would never render. The test now requires the demo to open on the fence's floor.
- The theme test reads the map background through `FakeMap.getPaintProperty`, but the background layer comes from the base style, not `addLayer`. FakeMap must keep base-style paint separately so `layerIds()` stays empty after destroy.
- Cluster equality only holds if both algorithms share the same greedy definition (first unassigned point seeds a cluster, members within the radius of the seed). supercluster uses zoom-grid clustering and would never match the naive loop, so the indexed version uses a KDBush index with the same greedy rule.
- Clicking a moving tag: the tag moves a few pixels per second, so the click handler queries a 10 px box around the click instead of the exact pixel.

# PROPOSALS

Confirmed failing before implementation: 41 unit tests fail and 3 suites fail to import because the modules do not exist yet (`pnpm exec vitest run`); the two R1 generator tests fail on building and floor counts.

- No.1 Implement R1–R8 and the four demos as specified by the tests

## No.1 Implement R1–R8 and the four demos as specified by the tests

### CODE CHANGE

One requirement at a time, in the order of the requirements document: R1 generator, R2 simulator and providers, R3 position-stream, R7 overlay with Demo 3, R4 cluster with Demo 4, R5 overlays and geofence with Demo 7, R6 heatmap with Demo 10, R8 theme.
