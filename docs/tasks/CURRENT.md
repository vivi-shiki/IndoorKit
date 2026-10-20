# !!!INVESTIGATE!!!

# PROBLEM DESCRIPTION

我发现这个项目有个问题，map的sdk和实际业务混合在一起了，其实应该是sdk是一个单独的部分，实际业务是另一个单独的部分，帮我设计一套方案，如何去耦合

（方案文档：https://claude.ai/code/artifact/484e23b0-2236-41be-a1ef-01e78d758588 ，按其中「迁移步骤」第 1～6 步实施）

1、对1到6步重新编写测试
2、核对测试和这篇需求文档，评估是否正确
3、根据测试编写编码
4、进行测试与迭代

完成标准
1、各个区域的行为分别解耦，mapbox层、sdk层、业务层、页面层，每一层都清晰可见
2、通过所有测试
3、所有更新正常提交commit记录
4、pages页面正常更新
5、pages各个主要页面截图正常

# UPDATES

# TEST [CONFIRMED]

The four layers and where they live after the change:

| Layer | Paths | May import |
| --- | --- | --- |
| Map engine (MapLibre) | `maplibre-gl`, wrapped by `packages/core` only; the app loads it in `apps/playground/src/engine/` | — |
| SDK | `packages/imdf`, `packages/core`, `packages/rtls`, `packages/plugins` | each other, downward; only `core` imports `maplibre-gl` |
| Business (hospital domain) | `domains/hospital` (`@indoorkit/hospital`) | `@indoorkit/imdf`, `@indoorkit/rtls` (types), zod |
| Pages | `apps/playground/src/pages/**` | SDK public APIs, the domain, `presentation/`, `adapters/`, `testing/hooks` |

`apps/playground/src/adapters/` is the only app code that knows both the SDK plugin system and the domain; `apps/playground/src/testing/` is the only app code that may use `@indoorkit/core/testing`.

Tests per step of the plan (written before the code, each must fail first):

1. Boundary checks, `test/layers.test.ts` (Vitest, reads source files):
   - `packages/*/src` imports nothing from `domains/`, `tools/`, `apps/`; only `packages/core/src` imports `maplibre-gl`.
   - `packages/*/src` contains none of the hospital words (department, patient, nurse, doctor, visitor, caregiver, hospital, sos, offline, maintenance, infusion, 科室, 患者, 医院, 医护, 病房, 人员).
   - `domains/*/src` imports no `maplibre-gl`, `@indoorkit/core`, `@indoorkit/plugins`, and uses no `document` / `window`.
   - `apps/playground/src/pages/**` imports no `maplibre-gl` and no `@indoorkit/core/testing`, has no `indoor-` layer id literals, no `.map` access on the indoor map and no `as Record<string, unknown>` plugin casts.
   - The layer directories exist: `domains/hospital/src`, `packages/rtls/src`, `apps/playground/src/{engine,adapters,presentation,pages,testing}`.
   - `docs/adr/0002-sdk-and-domain-layers.md` exists.
2. Domain model, `domains/hospital/test/model.test.ts`: roles, asset types and statuses, `statusSummary`, `sosActive` come from `@indoorkit/hospital`; `tools/rtls-simulator` no longer exports them (`tools/rtls-simulator/test/roster.test.ts` imports the types from the domain).
3. Alarms, `domains/hospital/test/alarm.test.ts`: the department / fence / status layers of the alarm engine, run with plain data and a unit locator, no `FakeMap`. `apps/playground/test/alarm-adapter.test.ts`: `hospitalAlarmPlugin` checks every position update, draws its fences through `polygonPlugin`, emits `alarm:raise`.
4. Generic plugins and IMDF extensions:
   - `packages/plugins/test/zone.test.ts`: `zonePlugin({ zones })` draws, hides and highlights arbitrary unit groups (`indoor-zones`, `indoor-zone-outlines`), rejects unknown ids.
   - `unit-cluster.test.ts`: `statusColors` is required, there are no built-in statuses; unknown statuses are gray.
   - `heatmap.test.ts`: windows come from `windowsMinutes`, `setWindow` rejects others.
   - `venue-index.test.ts`: `locate` returns only `{ unitId }`; no department methods.
   - `packages/imdf/test/extension.test.ts`: `validateImdf` / `buildVenueModel` / `fetchImdf` take extensions (extra file, schema, cross-checks, built data under `venue.extensions[file]`); without extensions an extra file is ignored; the core model has no `departments` / `department_id`.
   - `domains/hospital/test/departments.test.ts`: `departmentExtension` validates units, `createHospital` locates the department of a point, by code, and its floors.
5. Core: `packages/core/test/camera-and-pick.test.ts`: `indoor.camera.focus` / `fit` drive the map, `map:click` carries the point and coordinate, `indoor.project`, `indoor.plugin(name)` throws for a missing plugin, `glyphs` / default languages come from options; `positions:update` and the position types live in `@indoorkit/rtls`. Plugins: `positionStream.setVisible`, `positionStream.pick(point, radius)`, `positionStream.rendered()`, `unitCluster.pick(point, radius)`, `unitCluster.rendered()`.
6. Pages: the existing Playwright suite (`pnpm e2e`, 82 tests plus leak-bench) still passes with the pages split into `pages/<page>/index.ts` (state, events, SDK calls) and `pages/<page>/view.ts` (HTML); layer ids that changed (`indoor-departments` → `indoor-zones`) are updated in the specs.

Success criteria:

- All of the above, `pnpm verify`, `pnpm build`, `pnpm e2e` pass.
- Commits pushed to `main`; the CI deploy job publishes the playground to GitHub Pages.
- Screenshots of the gallery and the five pages on the deployed site look right (map drawn, panels filled, no errors).
- `AGENTS.md` layout table, `docs/kb/` pages and ADR 0002 describe the layers.

Checked against the design document (step 2 of the request):

- Every coupling point in the document's table has a test: 1 alarm engine → `domains/hospital/test/alarm.test.ts`; 2 department plugin → `zone.test.ts`; 3 `DEFAULT_COLORS` → `unit-cluster.test.ts`; 4 `HEAT_WINDOWS` → `heatmap.test.ts`; 5 core events and types → `layers.test.ts` + `packages/rtls/test`; 6 IMDF `department` → `extension.test.ts` + `departments.test.ts`; 7 simulator owning the model → `roster.test.ts` + `domains/hospital/test/model.test.ts`; 8 pages using MapLibre → `layers.test.ts` page layer + the e2e suite.
- Two deliberate changes from the document, both narrower: clicks are a core `map:click` event plus `pick(point, radius)` on the plugins that draw pickable things, instead of a core `hits` object (the core would otherwise have to know every plugin's layers); the positions layer is hidden with `setVisible` / `visible: false` instead of a `showPoints` option. Test hooks that read arbitrary layers go through `@indoorkit/core/testing` from `apps/playground/src/testing/`, as the document planned.
- Default languages stay `['ja', 'en']` (already an option); only `glyphs` becomes a new option.

Before the change: `pnpm exec vitest run` → 12 files fail to import (`@indoorkit/hospital`, `@indoorkit/rtls`, `defineImdfExtension`, `zonePlugin` … do not exist) and 33 tests fail (layer checks, camera, heatmap windows, cluster colours, venue index). Baseline e2e on `5fc0a0b`: all 82 pass.

# PROPOSALS
