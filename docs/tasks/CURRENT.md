# PROBLEM DESCRIPTION

帮我拉取最新项目

然后调研其它数字孪生项目和我的项目，给出一个继续提升的方案

最后帮我把数字孪生项目的逻辑改为，视角拉近以后，外面地图渲染不变，只是隐藏建筑主体本身，然后改为显示室内地图，可以用室内控件切换楼层，同时这个时候出现另外一个控件，用来像各个分页面一样查看对应的各种设备信息、人员信息等等等等

验收要求
1、ui写法和呈现风格和原来的一致
2、参考现有的ui编写流程
3、commit推到vivi-shiki的github，并且pages更新成功，不涉及map1en的任何项目
4、给出一个继续提升显示效果的方案，这份方案只在这个聊天窗口展示，不放到项目内部
5、pages正常打开，在三个demo中控件都能正常切换，且对应的显示内容都得以改变

# UPDATES

# TEST [CONFIRMED]

- Scene visibility: entering an interior preserves terrain, roads, landscaping, surrounding buildings and surface parking while hiding the venue building envelope and attached parts. Returning outside restores the same objects; zoom hysteresis and all render levels still work.
- Business overlays: each scenario has its own modes backed by existing domain/simulator data. Changing mode, floor, time or locale changes the actual map markers and matching list/details; markers cannot remain visible outside or on another floor. Selection and search use the same dataset as the map.
- UI follows ADR 0003 and existing map-page chips, rows, search, drawer and mobile panel; zh/en/ja and light/dark remain usable, including the no-WebGL fallback.
- Verify with pnpm verify, pnpm build, pnpm e2e, screenshots and resource/heap regression. Push only to vivi-shiki/IndoorKit and verify the pushed SHA's Actions/Pages deployment and published assets. The research/improvement proposal stays in the chat.

# PROPOSALS

- No.1 Preserve campus context and add floor-scoped business inspection [CONFIRMED]

## No.1 Preserve campus context and add floor-scoped business inspection

### CODE CHANGE

- Keep one owned map and its existing quality/lifecycle controls. Toggle only building-envelope objects when entering the indoor representation; preserve site geometry and local outdoor fill.
- Reuse the existing marker overlay with a batched update API. Scenario adapters supply floor-positioned objects and translated details from existing domain/simulator data; shared presentation owns mode, search, selection and responsive inspection UI.
- Keep the current UI components and tokens. Test the rendering visibility and business data flow first, then verify every scenario and deployment. No future visual-improvement roadmap is saved to the repository.

### Verification notes

- Pulled origin/main with --ff-only to 78f55f5; origin is vivi-shiki/IndoorKit. Existing working tree was clean.
- New tests fail on the missing campus visibility helper, batched marker API and inspection hooks, confirming that the requested behavior is absent. The pulled lockfile also introduces asset-tool dependencies; install it before further verification.
- Browser plugin not available in this session. Use the repository's pnpm e2e workflow and inspect its rendering screenshots.
- First full browser run passed all 168 tests. Desktop/mobile inspection screenshots confirmed the retained campus context and matching business lists in all three scenarios. Review identified rooftop props that must disappear with the envelope; generic glTF metadata now identifies attached geometry and elevated instances while preserving paving and ground traffic.
- Keep scenario-specific names in asset metadata, not SDK logic. The SDK boundary test caught a hardcoded prop-group name; the renderer now consumes generic indoorHidden / indoorKeepMaterial / indoorHideAbove attributes.
- During verification origin/main advanced to 5500182 with a Three.js viewport/canvas synchronization fix. Stopped the superseded local run, preserved all work in a temporary stash, pulled with --ff-only, and combined the viewport debug hook with the new inspection hook. Restart all gates on the combined source; do not overwrite the upstream fix.

### CONFIRMED

- On the combined 5500182 base, `pnpm build` passed and regenerated all six GLBs with the generic indoor visibility metadata. `pnpm verify` passed lint, type checks and all 628 tests in 74 files.
- `pnpm e2e` passed all 170 tests, including the new seven inspection tests: three scenes at 1600×1000 and 390×844, plus the three-scene no-WebGL path. Mode changes replace actual rendered markers; floor/search filtering, marker and list selection, detail drawers, three languages and theme changes work together. Exterior site/landscape visibility is retained and the envelope is restored outside.
- Reviewed the desktop/mobile screenshots. Existing map-page presentation is preserved. The SDK's nearest-marker picking resolves overlapping hit areas; invalid bulk marker data leaves the previous source intact.
- Both memory regressions passed. The twin regression warms every business mode, then repeats all modes across render levels, floor entry and scenario teardown; tracked resources are released and post-GC growth stays within the existing 8 MiB limit.
- Deployment target remains vivi-shiki/IndoorKit. The pushed SHA's CI/Pages and the published inspection tests are checked after pushing. The future visual-improvement proposal is delivered only in the chat.
