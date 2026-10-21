# !!!INVESTIGATE!!!

# PROBLEM DESCRIPTION

根据停车场与博物馆的demo计划，实现博物馆部分
1、功能大体和另外两个一致
2、相关技术用语先查找同行的相关翻译，确认中日英三语常用和正确的术语，而后再编写文案
3、先编写测试，后编写功能
4、在编写完成后，将首页的走马灯改为三个项目并排出现，这样视觉效果更好一点

验收标准：1、首页出现三个项目横向并排 2、各个项目能正确进入 3、新加的功能与之前的两个场景互不耦合，与底层也不耦合 4、全部测试通过 5、git正常提交 6、page正常更新 7、readme的场景部分添加对应部分

# UPDATES

# TEST [CONFIRMED]

Reading of the request: build the museum scenario from the museum demo plan (fictional みなと市立美術博物館, B1 storage + 1F–3F, 59 display cases, about 300 fictional objects; pages 保存環境, 収蔵品・露光管理, 来館者・混雑, 警備・巡回, 館内ガイド in three views: curator, operations and security, visitor) the same way as the parking demo, then replace the home carousel with three cards side by side.

Terminology: each language uses its own museum and conservation terms (ja 展示室・展示ケース・収蔵庫・積算露光量・巡回; zh 展厅・展柜・库房・累计光照量・巡更点・观众; en gallery, display case, storage, cumulative light exposure, checkpoint). The cloud environment's network policy blocked fetching the reference pages (Tokyo National Research Institute for Cultural Properties, Agency for Cultural Affairs), so the terms come from search result titles, the home page copy reviewed earlier and general usage; they are pinned in `museum-i18n.test.ts`.

Tests written before the implementation:

- SDK: `packages/plugins/test/venue-index.test.ts` — nested units resolve to the innermost one.
- Domain: `domains/museum/test/*` (model and extension checks, standards and assessment with hysteresis, exposure and display days, 24-hour humidity window, all alarm rules, patrol and move checks, rotation suggestions).
- Venue and simulator: `tools/venue-gen/test/museum.test.ts`, `tools/museum-simulator/test/*` (every alarm rule fires during the day; incidents, school group, missed checkpoint, intrusion after closing).
- App: `apps/playground/test/museum-routes.test.ts`, `museum-i18n.test.ts` (all keys in three languages, agreed terms, banned words), `museum-live.test.ts` (environment, crowding and exposure states, patrol status, guide steps, alarm store, clock); `scenarios.test.ts` (museum card opens `#/museum`), `routes.test.ts`, `i18n.test.ts` (carousel keys removed).
- Independence: `test/layers.test.ts` `museum scenario` — SDK has no museum words and does not import the museum package; the three business packages do not import each other; `src/museum/` imports only the shell; only `app/routes.ts` and `app/App.tsx` know it.
- E2E: `apps/playground/e2e/museum.spec.ts` (menu, every page, languages, release on leaving, each page's main functions, phone layout); `home.spec.ts` rewritten for the side-by-side cards; `tools/leak-bench` switches through the museum pages too.

# PROPOSALS

## No.1 Museum scenario as a self-contained module; home page with three cards

### CODE CHANGE

- SDK: `createVenueIndex().locate` returns the innermost unit when units are nested.
- `domains/museum`, `tools/venue-gen` (museum layout), `tools/museum-simulator`.
- `apps/playground/src/museum/`: routes, messages and i18n hooks, adapters (venue context, clock, live states, alarm store), map hook and layout, SVG chart, swatch, test hooks, five pages.
- Router: `#/museum/<page>`. Home: three cards side by side, museum card opens `#/museum`. ADR 0005, READMEs, AGENTS.md.

### CONFIRMED

`pnpm verify`, `pnpm build` and `pnpm e2e` (e2e and leak-bench) pass.
