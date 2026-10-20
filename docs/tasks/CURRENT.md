# !!!INVESTIGATE!!!

# PROBLEM DESCRIPTION

1、给这个项目引入react，用react重写现有的东西，sdk和业务层解耦，相当于sdk和mapbox是纯ts，业务层以上是react和日本较为流行的react ui框架

2、编写一个首页，介绍这个项目是iot加地图的sdk的各个应用场景，首页三个像是切换走马灯那样的三个应用场景切换：医院、停车场、博物馆

3、后两个场景置灰开发中

4、医院场景修页面逻辑，主页面就是渲染地图，添加pc端的左侧侧栏菜单和手机端的顶栏菜单，点击两个业务场景时，相当于渲染不同页面的内容

验收标准
1、引入相关依赖，重构业务层，功能和原有完全一致
2、更改交互逻辑，进入某个demo时直接渲染地图
3、添加pc端和手机端两种菜单
4、按照进度和内容模块划分commit，全部提交到github上
5、各个页面正常显示
6、测试全部通过

# UPDATES

# TEST [CONFIRMED]

Reading of the request:

- React and MUI (the UI library most used by React teams in Japan) are used only in `apps/playground`. `packages/*` (SDK, the only place that wraps MapLibre) and `domains/hospital` (business rules, no UI at all, also runs in Workers) stay framework-free TypeScript. "业务层以上" is read as the hospital business UI: adapters, pages and app shell.
- Home page `#/`: IndoorKit as an IoT × indoor map SDK, with a carousel of three use cases: hospital (opens the demo), parking and museum (greyed out, "in development", copy taken from the two demo plans).
- Hospital demo `#/hospital/<page>`: entering goes straight to a map (`#/hospital` → the equipment map). Desktop has a permanent left sidebar, phones have a top app bar with a menu button that opens a top menu. Both list the two business views (Equipment View: Equipment Map; People View: Live Map, Route History, Zone Alerts, Location Report Heatmap); a click renders that page's map content. Old links `#/<page>?…` redirect.
- Every existing feature, test hook, copy text and language/theme behaviour is unchanged.

Tests written before the implementation:

- `test/layers.test.ts`: scans `.tsx`; SDK and domain contain no `.tsx` and import no React/MUI/Emotion; each page folder (now including `home`) has `index.tsx` and `view.tsx`; pages never write HTML strings (`innerHTML`, `createElement`); `apps/playground/src/app` exists.
- `apps/playground/test/routes.test.ts`: hash routes, redirects (`#/hospital`, legacy links, removed pages), the route key that remounts a page, the menu groups.
- `apps/playground/test/scenarios.test.ts`: scenario order, only hospital opens, copy present in three languages, parking/museum venues from the plans.
- `apps/playground/e2e/home.spec.ts`: heading/tagline/tab title, three slides, arrows and dots, autoplay that stops after manual use (Playwright clock), greyed-out slides with disabled buttons, opening the hospital demo lands on a rendered map, reviewed hospital copy in three languages, phone width.
- `apps/playground/e2e/navigation.spec.ts`: sidebar groups and links, `aria-current`, switching pages renders new content and releases the old map, the sidebar never covers the map, language switch, home link releases maps and workers; `#/hospital` and legacy links; phone top bar, menu open/switch/close, home link.
- Existing specs moved to the new addresses (`openDemo` → `#/hospital/<demo>`, home hook `demo: 'home'`), the home-page contrast check, `.nav-appbar` in the phone layout check, sidebar text in the contrast check.

Success criteria: `pnpm verify`, `pnpm build`, `pnpm e2e` (including leak-bench) all pass; every page renders on desktop and phone (screenshots checked); commits split by module and pushed to `main`; CI deploys GitHub Pages.

Before the change: `vitest run test/layers.test.ts apps/playground/test` → 3 layer checks fail (no `src/app`, no `.tsx` pages, pages write HTML strings) and both new test files fail to import (`src/app/routes`, `src/pages/home/scenarios` do not exist). Baseline e2e on `d51cd01`: 84 passed.

# PROPOSALS
