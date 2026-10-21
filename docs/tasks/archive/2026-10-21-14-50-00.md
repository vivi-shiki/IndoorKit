# !!!INVESTIGATE!!!

# PROBLEM DESCRIPTION

先编写停车场部分测试，而后完成这块的开发

验收标准：1、各页面正常打开，功能完备 2、模块独立，和sdk、mapbox、医院和主页均独立 3、测试全部通过 4、正常提交 5、page正常更新

# UPDATES

# TEST [CONFIRMED]

Reading of the request: build the parking scenario from the parking demo plan (fictional みなと中央パーキング, 4-level garage + surface lot, 332 spaces; pages 満空マップ, 入出庫・車両, 異常アラート, 予約・誘導, 運営分析) the same way as the hospital demo (React + MUI, PC sidebar / phone top menu, maps rendered directly, SDK reused), and enable the parking card on the home page. Copy is trilingual with each language's own parking industry terms. No real company or product names.

Tests written before the implementation:

- SDK: `packages/plugins/test/unit-state.test.ts`, `route.test.ts`, marker color and update.
- Domain: `domains/parking/test/*` (model and extension checks, tariff with night and 24-hour maximums, the three alarm tiers, lane routing across ramps and one-way lanes, reservations / events / fleet allocation, statistics and suggestions).
- Venue and simulator: `tools/venue-gen/test/parking.test.ts`, `tools/parking-simulator/test/*`.
- App: `apps/playground/test/parking-routes.test.ts` (routes, redirects, menu groups), `parking-i18n.test.ts` (all keys in three languages, agreed terms, banned borrowed words), `parking-live.test.ts` (space states, free counts, alarm store, clock); `scenarios.test.ts` and `routes.test.ts` updated for the enabled card.
- Independence: `test/layers.test.ts` — SDK has no parking words and imports neither business package; the two business packages do not import each other; `src/parking/` imports only the shell (`app/scenario-layout`, `app/map`, `app/teardown`, `app/mui-theme`, `app-i18n`, `app-theme`, `settings`, `theme`, `testing/hooks`); nothing outside `src/parking/` except `app/routes.ts` and `app/App.tsx` imports it, and those two only its routes and entry; parking pages use only public SDK APIs.
- E2E: `apps/playground/e2e/parking.spec.ts` (menu, every page from the menu, languages, release on leaving, each page's main functions, phone layout); `home.spec.ts` (parking card opens the map); `tools/leak-bench` switches through the parking pages too.

# PROPOSALS

## No.1 Parking scenario as a self-contained module on the shared shell

### CODE CHANGE

- SDK: `unitStatePlugin`, `routePlugin`, marker color and update; parking, road and ramp unit colors.
- `domains/parking`, `tools/venue-gen` (parking layout), `tools/parking-simulator`.
- Shell: `app/scenario-layout.tsx` (sidebar and phone menu, used by both scenarios), `app/map.tsx` (tracked map creation, following the language and theme, fit to stage, map events, throttled refresh, floor buttons); hospital `HospitalLayout` and `useMapPage` now use them.
- `apps/playground/src/parking/`: routes, messages and i18n hooks, adapters (venue context, simulation clock, space states, alarm store), shared space layers, map hook and layout, test hooks, five pages.
- Home: parking card opens `#/parking`. ADR 0004, READMEs, AGENTS.md.

### CONFIRMED

`pnpm verify`, `pnpm build` and `pnpm e2e` (e2e and leak-bench) pass.
