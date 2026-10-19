# IndoorKit 开发路线图

[中文](roadmap.zh-CN.md) · [English](roadmap.en.md) · [日本語](roadmap.ja.md)

IndoorKit 是一个开源的 TypeScript 室内地图 SDK，配套示例画廊、实时定位看板，以及用自然语言操作地图的 AI 助手。所有地图数据都是虚构医院「さくら総合病院」，所有依赖都是公开包和开放数据。

路线图分为 0～6 共 7 级。第 1 级是**最小可演示版本（MVP）**，之后每一级都在上一级可运行的基础上增加能力，第 6 级完成全部计划功能。每一级末尾的「关卡」全部通过后，才进入下一级。

**进度**：第 0、1、2 级已完成（2026-10-19）。第 2 级实现时的两处调整：聚合对比用 KDBush 空间索引代替 supercluster，保证两种算法结果逐一相同；Demo 4 的点数选项为 1,000 / 5,000 / 10,000，因为双重循环在 50,000 点时会卡住页面十几秒。

## 总览

| 级别 | 主题 | 完成后能演示什么 |
| --- | --- | --- |
| 0 | 工程基础 | 空仓库可以 lint、测试、自动部署到 GitHub Pages |
| **1** | **最小可演示版本** | **在线打开虚构医院地图，切换楼层、添加标记；内存实验室证明反复创建/销毁不泄漏** |
| 2 | 实时定位与空间计算 | 数千个标签实时移动、聚合算法前后对比、电子围栏告警、热力图 |
| 3 | 导航与多楼层 | 跨楼层路径规划（含无障碍模式）、多楼层展开视图、多院区切换 |
| 4 | 3D 与自适应画质 | three.js 楼栋与设施模型、3D 围栏、按设备自动选择画质 |
| 5 | 应用层与 AI 助手 | React 组件、实时定位看板、自然语言操作地图 |
| 6 | 文档、发布与扩展 | 文档站、npm 发布、室外底图、可选 3D Tiles 城市模型 |

## 0 级：工程基础

目标：先把「怎么构建、怎么测试、怎么上线」定死，之后每个功能都走同一条流水线。

- pnpm workspace 单仓多包：`packages/core`、`packages/imdf`、`packages/plugins`、`apps/playground`、`tools/venue-gen`、`tools/leak-bench`
- TypeScript strict、Vite 库模式（ESM 输出）、ESLint 或 Biome
- Vitest 单元测试；Playwright 端到端测试（Chromium）
- GitHub Actions：lint → typecheck → test → 构建 → 部署 GitHub Pages
- 唯一入口命令 `pnpm verify`（lint + typecheck + test），不直接调用 vite / tsc
- AI 协作规则写进仓库：`AGENTS.md`（项目结构与唯一构建入口）、`docs/guidelines/coding.md`（架构约束，如「插件创建的资源必须登记」）、`docs/adr/`（架构决策记录）

**关卡 0**：推送到 main 后，CI 全绿，Pages 上能打开一个空白 playground 页面。

## 1 级：最小可演示版本（MVP）

目标：一个任何人点开链接就能看的室内地图，并用数字证明核心设计（自动资源释放）有效。

**核心（@indoorkit/core）**

- `createIndoorMap({ container, data, plugins })`：生命周期 init → load → ready → destroy，每步发出类型化事件
- `definePlugin`：插件声明名称和依赖，按依赖排序加载，插件 API 由 TypeScript 自动推导（`map.plugins.marker.add(...)` 有完整类型）
- `ResourceTracker`：插件通过 `ctx.track()` 登记 source、layer、事件监听；`destroy()` 时按创建的逆序自动释放
- `EventBus`：插件之间只通过核心事件通信
- 地图引擎：MapLibre GL JS（npm 包，ESM 引入，无需 token）

**数据（@indoorkit/imdf）**

- 读取 IMDF（OGC 社区标准 1.0.0，基于 GeoJSON）目录或 zip
- 用 zod 编写校验器（OGC 没有官方校验器，自写校验器本身也是展示点）
- 转换为内部模型：Venue / Building / Level / Unit / Opening / Amenity

**虚构数据（tools/venue-gen）**

- 脚本按参数生成「走廊 + 两侧房间 + 楼梯间/电梯井」布局，MVP 规模为 1 栋 × 3 层
- 输出 IMDF，科室名带 ja / en 双语，坐标放在虚构地点

**渲染与插件**

- 样式生成器：按 IMDF category + 主题配置生成 MapLibre 图层（亮色主题）
- 墙体和房间用 MapLibre `fill-extrusion` 拉伸成 2.5D，不需要任何模型素材
- 中日文标注使用 MapLibre 默认的本地字体渲染（`localIdeographFontFamily`），MVP 阶段无需生成 CJK 字形文件
- `floor` 插件 + 楼层切换控件
- `marker` 插件：添加、删除、按楼层过滤

**示例画廊（apps/playground）**

- Demo 1「基础地图」：加载虚构医院、切换楼层、添加标记，页面显示首屏时间
- Demo 2「内存实验室」：反复创建/销毁地图，实时显示每轮堆大小和未释放资源数

**内存回归（tools/leak-bench）**

- Playwright 通过 CDP 调用 `HeapProfiler.collectGarbage` 后读取 `Performance.getMetrics` 中的 `JSHeapUsedSize`
- 创建/销毁 50 轮后，堆增长不超过设定阈值，否则 CI 失败

**关卡 1（MVP 验收）**：GitHub Pages 上可打开 Demo 1 和 Demo 2；楼层切换和标记可用；leak-bench 在 CI 中通过；README 有在线链接和截图。

## 2 级：实时定位与空间计算

目标：展示「大量实时数据 + 空间算法 + 性能可量化」。

- 暗色主题；界面与地图标注三语（ja / en / zh）
- `DataProvider` 接口；默认实现是 Web Worker 定位模拟器（用 Comlink 通信），数千个标签 1Hz 上报
- `position-stream` 插件：位置插值平滑移动、轨迹记录与回放
- `popup`、`line`、`polygon` 覆盖物插件
- `cluster` 插件：使用 supercluster
- `geofence` 插件：flatbush 空间索引 + turf `booleanPointInPolygon`，输出进入/离开事件
- `heatmap` 插件：MapLibre 原生 heatmap 图层，按时间窗口统计人员密度（每层一张平面热力图）
- 性能浮层：FPS、主线程耗时
- 虚构数据扩大到 3 栋 × 5 层
- Demo 3「实时定位」：显示 FPS 和主线程耗时
- Demo 4「万级聚合对比」：同一批数据分别用 O(n²) 双重循环和空间索引聚合，显示两者耗时
- Demo 7「电子围栏与告警」（2D 版）：进出检测、告警弹窗，显示每批检测耗时
- Demo 10「热力图」

**关卡 2**：5,000 个模拟标签下 Demo 3 在普通笔记本上保持流畅（目标 ≥ 50 FPS，以实测为准）；Demo 4 页面内给出两种算法的实测耗时对比。

## 3 级：导航与多楼层

目标：完成室内地图最有辨识度的两项交互：跨楼层导航和多楼层展开。

- venue-gen 生成路网：走廊中线 + 门节点 + 楼梯/电梯跨层连接；边带长度和 `accessible` 标记；作为 IMDF 扩展输出（带 `level_id` 的 LineString）
- `route` 插件：用 ngraph.path 的 A* 在浏览器端计算；电梯/楼梯权重；无障碍模式（屏蔽楼梯边）
- `nav-animation` 插件：沿路径的导航动画与镜头跟随
- `multi-floor` 插件：各楼层用 `fill-extrusion-base` 叠加高度偏移形成展开视图；自写鼠标/触摸手势，上下滑动切换楼层并带动画
- `camera-sequence` 插件：预设镜头动画序列
- `campus-switcher`：多院区数据源切换，切换前后内存回落
- UI 小部件：指南针、比例尺
- 空间查询：坐标所属楼栋/房间（flatbush 索引）
- Demo 5「跨楼层路径规划」：显示规划耗时和路径长度
- Demo 6「多楼层展开」：显示动画帧率
- Demo 11「多院区切换」：显示切换前后堆大小

**关卡 3**：任意两个房间之间（含跨栋跨层）都能规划出路径，无障碍模式下路径不经过楼梯；路由单元测试覆盖跨层与不可达情况；多院区来回切换 20 次后 leak-bench 通过。

## 4 级：3D 与自适应画质

目标：展示 WebGL / three.js 功底和对弱设备的适配。

- `@indoorkit/three`：自写 `ThreeLayer`（MapLibre CustomLayerInterface），共享 WebGL 上下文，墨卡托坐标与米的换算（参照 MapLibre 官方 three.js 示例）
- 射线拾取：用 MapLibre 传入的投影矩阵反算射线（官方没有现成示例，需要自己实现并写测试）
- 模型：GLTFLoader + MeshoptDecoder（及 DRACOLoader）；InstancedMesh 对象池；楼栋聚焦（其他楼栋降低高度）；阴影
- 3D 插件：`fence-3d`（围栏柱）、`sphere-3d`、`line-3d`、`models`（按 amenity 类别自动摆放设施）
- 素材管线：只用 CC0 / CC-BY 素材（KayKit、Kenney、Quaternius、Poly Haven，轮椅用 Poly Pizza CC-BY 并署名），缺的电梯、监护仪等用 Blender 自建；统一转 glb、1 单位 = 1 米、原点在底面中心；`gltf-transform` 做 meshopt 压缩；`ASSETS.md` 记录每个模型的来源与许可
- `quality` 插件：L0～L4 五档渲染等级（控制抗锯齿、2.5D、模型、阴影等）；初始档位用 `@pmndrs/detect-gpu` 估计，运行时以 FPS 为准持续偏低就自动降级（该库的基准数据源已停止更新，所以只作初值）
- 性能浮层增加 draw call 数
- Demo 7 升级为 3D 围栏；Demo 8「3D 楼栋」：显示 draw call 数；Demo 9「自适应画质」：显示当前档位和 FPS

**关卡 4**：Demo 8 在 L4 档位可流畅运行；人为限制 FPS 后 Demo 9 能自动降级；含 3D 内容的地图销毁后 leak-bench 通过（geometry、material、texture 均被释放）。

## 5 级：应用层与 AI 助手

目标：证明「不只会写 SDK，也会用它做产品」，并展示 AI × IoT × 医疗方向。

- `@indoorkit/react`：`<IndoorMap>` 组件、`useIndoorMap`、`usePlugin`（React 19）
- `apps/rtls-dashboard` 实时定位看板：资产列表 + 地图 + 告警流 + AI 对话框
- 可选 `DataProvider`：Node WebSocket 服务，演示前后端分离
- `@indoorkit/ai`
  - 插件可声明 `tools`（名称、说明、zod 参数）；用 zod v4 的 `z.toJSONSchema()` 生成工具定义，并内联 `$defs`，兼容不同模型服务
  - 查询类工具（`findNearest`、`whereIs`、`listAlerts`）直接执行；操作类工具（`planRoute`、`setFence`）先在地图上预览，用户确认后生效
  - 模型适配：Anthropic 与 OpenAI 兼容接口；在线 demo 采用用户自带 API key（浏览器直连，key 只保存在本地）
  - 默认使用内置的录制回放，没有 key 时在线 demo 也能完整演示
- Demo 12「AI 地图助手」：如「3階で一番近い車椅子は？」「ICUまで案内して」，页面显示工具调用记录

**关卡 5**：看板在 GitHub Pages 上无需任何 key 即可运行（回放模式）；填入 key 后可进行真实对话；操作类工具必须经过确认才生效。

## 6 级：文档、发布与扩展

目标：补齐全部计划功能，成为可被他人使用的开源项目。

- 文档站：VitePress + TypeDoc API 参考；README 日 / 英双语；30 秒演示 GIF
- 发布：Changesets 管理多包版本，发布到 npm
- 室外底图：默认 OpenFreeMap（免 key，但无服务保证），备选为自托管的小范围 Protomaps PMTiles 文件
- 地图字形：如需自定义拉丁字体，用 font-maker 生成 glyph PBF；图标用 spreet 打 sprite
- 可选 `3d-tiles` 插件：3d-tiles-renderer 与 MapLibre 相机同步；PLATEAU 城市模型作室外背景（需额外处理 glTF 的 `CESIUM_RTC` 偏移）
- devtools：未释放资源数、draw call、图层列表面板
- 测试矩阵：「浏览器 × 画质档位 × Demo」逐格验证后再发布
- 知识库：`docs/kb/`（如 ResourceTracker、ThreeLayer 坐标换算），同时作为文档站的素材

**关卡 6**：npm 上可安装 `@indoorkit/*`；文档站上线；12 个 Demo 和看板全部可用；测试矩阵全部通过。

## Demo 清单与所属级别

| # | Demo | 级别 |
| --- | --- | --- |
| 1 | 基础地图 | 1 |
| 2 | 内存实验室 | 1 |
| 3 | 实时定位 | 2 |
| 4 | 万级聚合对比 | 2 |
| 5 | 跨楼层路径规划 | 3 |
| 6 | 多楼层展开 | 3 |
| 7 | 电子围栏与告警 | 2（2D）/ 4（3D） |
| 8 | 3D 楼栋 | 4 |
| 9 | 自适应画质 | 4 |
| 10 | 热力图 | 2 |
| 11 | 多院区切换 | 3 |
| 12 | AI 地图助手 | 5 |
