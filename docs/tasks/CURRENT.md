# PROBLEM DESCRIPTION

帮我拉取最新代码，然后完成以下数字孪生演示demo的开发

1、对照实际存在的医院、博物馆、停车场平面图，修复逻辑不合理的地方
2、对这三个建筑进行建模
3、参照主流开源项目，完善3D模型的渲染逻辑，另外添加光照阴影等
4、美化建模，让外表看起来像正常建筑
5、寻找开源的室外景观贴图和模型，树木、汽车、马路、湖泊、绿化、景观、雕塑等等，设计整个室外部分，如果有开源贴图或者模型则借鉴，没有则帮我绘制生成，要求建筑和其它各种东西的成果物都能导出到blender来编辑
6、视角一定高度以上显示模型和室外地图，一定高度以内显示室内地图，旁边有小控件可以切换楼层
7、为三个demo场景各自多设计一个数字孪生界面，参考主流的以及我之前的项目，完成这部分设计和渲染
8、各种渲染均需考虑到电脑或者手机性能不足的情况，补全低画质逻辑，另外为手机端设计一套界面

完成标准：
1、存在三套建模和一套贴图
2、三个数字孪生页面正常显示，电脑端和手机端均能正确显示，三语言和亮色暗色主题正常显示
3、室外地图正常加载，室外模型正常加载显示，且没有严重性能问题
4、数字孪生页面的周边有驾驶舱设计感，可以参照各种主流大屏驾驶舱
5、仓库中存在对应提交
6、该提交提交到vivi-shiki的github远端，注意不是map1en的仓库
7、对应的github项目的pages正常更新成功

# UPDATES

# TEST [CONFIRMED]

- Unit: three new routes, all cockpit translations; zoom hysteresis, quality selection; generated GLB headers, metre/Y-up coordinates, scene nodes, asset budgets; floor-plan entrances and connected circulation.
- E2E: each scenario loads its outdoor model, switches by camera zoom and floor buttons, exports a valid GLB; light/dark and zh/en/ja, desktop/mobile overflow and controls; disposal on leaving. Low quality disables shadows and uses reduced geometry. Rendering screenshots reviewed separately.
- Gates: pnpm verify, pnpm build, pnpm e2e. Commit includes owner trailer; origin must be vivi-shiki/IndoorKit. GitHub Actions and Pages deployment checked on pushed SHA.

# PROPOSALS

- No.1 Shared geographic 3D renderer, generated editable campuses and independent scenario cockpits [CONFIRMED]

## No.1 Shared geographic 3D renderer, generated editable campuses and independent scenario cockpits

### CODE CHANGE

- Keep existing scenario data and framework boundaries. Generate three fictitious campuses from IMDF footprints; use real published plans only as circulation references, never copy real operational data.
- Lazy Three.js renderer in core, MapLibre shared context and geographic alignment; PBR materials, sun shadows, on-demand rendering, reduced quality and offline local outdoor map. Indoor/outdoor zoom threshold has hysteresis; floor plugin stays authoritative indoors.
- Build-time GLB assets, named editable objects, embedded textures and asset provenance. Separate reduced assets. Export the same complete GLB for Blender.
- Shared responsive cockpit under app/twin, independent adapters/pages per scenario. Metrics come from the existing fictional venue/simulator or are explicitly labelled geometry inventories.
- Preserve test-first sequencing; do not commit deliberately failing tests because AGENTS.md requires both gates before every commit.

### Verification notes

- Before implementation, `pnpm verify` failed on the missing twin-policy module. The accessible-bay regression test then measured 2.5003 m before the fix (expected at least 3.6 m). The revised 1F row has 15 ordinary-width bays and two 3.75 m accessible bays, with the same overall row length and aisle width.
- Pulled `origin/main` with `--ff-only`; origin is `https://github.com/vivi-shiki/IndoorKit.git` and was already current at c3b668a.
- First verification exposed Windows path separators in the architecture scanner and excessive default test concurrency (69 Vitest workers competing with software WebGL). Normalize paths before all boundary checks and bound both suites to two workers. Intermittent failures are rechecked separately before accepting the fix.
- Parking ramp travel now has nonzero distance, so arrival times changed. Morning demand is increased in the fictional day generator to retain the existing busy-noon requirement; the test threshold is unchanged.
- Three initial browser scenarios passed with no page errors; exported files have the glTF magic header. Screenshot review led to responsive exterior fitting, corrected parking device counts and a separate no-WebGL view.

### CONFIRMED

- Final `pnpm verify`: 70 test files, 576 tests passed; lint and type checking passed. `pnpm build` passed and regenerated all six GLBs and the three local site maps.
- Final `pnpm e2e`: 159 tests passed, including all three new cockpit scenarios, zh/en/ja and light/dark, desktop/mobile, camera transitions, export, no-WebGL recovery and both memory regressions. The 3D regression performs repeated high/low changes across all three scenes, checks zero unreleased tracked resources and limits post-GC heap growth to 8 MiB.
- Reviewed generated desktop, indoor and mobile screenshots. The assets contain embedded textures and named metre-scale objects; glTF structure and downloads are tested. Blender itself is not installed on this workstation, so native Blender import was not executed.
- High-quality scene budgets: hospital 17,656 triangles / 5,690,904 bytes; parking 21,928 triangles / 6,069,928 bytes; museum 12,100 triangles / 5,124,240 bytes. All have separately generated low-quality assets. Shared paving textures are CC0, with attribution and editing instructions in `docs/digital-twin.md`.
- The earlier intermittent browser cases passed 10 consecutive repetitions each (30 passes). The seven affected unit-test files also passed 10 consecutive runs. Test concurrency is bounded to two workers; that stability fix is committed separately from the feature.
- Push target and Pages configuration verified as `vivi-shiki/IndoorKit`, with GitHub Actions deployment to `https://vivi-shiki.github.io/IndoorKit/`. The resulting remote commit and deployment are checked after pushing.
