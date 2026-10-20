# ADR 0002：地图引擎、SDK、业务、页面四层分开

状态：已采纳

## 背景

医院的科室、角色、设备状态和两层报警原来写在 SDK 里：`@indoorkit/imdf` 读取科室文件，`@indoorkit/plugins` 带着科室插件和报警插件，核心类型里有定位数据和围栏事件，页面直接调用 MapLibre。换一个行业就要改 SDK，页面也绕过 SDK 操作底层地图。

## 决定

代码分成四层，依赖只能从上往下：

| 层 | 位置 | 可以依赖 |
| --- | --- | --- |
| 页面 | `apps/playground/src/pages` | SDK 公开接口、医院业务、`adapters/`、`presentation/` |
| 业务 | `domains/hospital`（`@indoorkit/hospital`） | `@indoorkit/imdf` 的数据模型、`@indoorkit/rtls` 的类型、zod |
| SDK | `packages/imdf`、`packages/rtls`、`packages/core`、`packages/plugins` | 下层 SDK 包；只有 core 引入 maplibre-gl |
| 地图引擎 | maplibre-gl | — |

- **地图引擎**：只有 `@indoorkit/core` 引入 maplibre-gl。页面要的镜头、坐标换算、点选和等待绘制都由核心提供（`indoor.camera.focus` / `fit`、`indoor.project`、`map:click` 事件、`ctx.queryRendered`、`indoor.idle` / `rendered`）。应用里只有 `engine/maplibre.ts` 加载引擎的样式表和 Worker 脚本，`testing/` 通过 `@indoorkit/core/testing` 的 `inspect` 读取样式供测试钩子使用。
- **SDK**：不认识任何行业概念。科室变成通用的 IMDF 扩展（`defineImdfExtension`，数据在 `venue.extensions`）；科室插件变成按区块分组的 `zonePlugin`；状态颜色、热力图窗口由调用方传入；定位数据契约独立成 `@indoorkit/rtls`，`positions:update` 事件在那里声明。
- **业务**：`@indoorkit/hospital` 放科室扩展、科室查询（`createHospital`）、人员和设备模型、报警规则和报警引擎。它不引入地图、不碰 DOM，可以在服务端或 Worker 里直接用。
- **页面**：每个页面一个目录，`index.ts` 接线（插件、事件、状态），`view.ts` 生成界面 HTML。页面不碰底层地图、不写 `indoor-` 图层 id、不强转插件 API。把业务接到 SDK 插件上的代码（报警插件、读取带科室的场馆、模拟数据源）放在 `adapters/`。

边界由 `test/layers.test.ts` 检查：扫描每层源码的 import 和用词，越界即失败。

## 后果

- 换一个行业（商场、工厂）只需要写新的业务包和适配，SDK 不用改。
- 场馆数据要显式带上扩展才读得到科室：`buildVenueModel(archive, [departmentExtension])`。
- 测试钩子里需要读 MapLibre 样式的部分集中在 `apps/playground/src/testing/map-hooks.ts`，页面里没有这类代码。
