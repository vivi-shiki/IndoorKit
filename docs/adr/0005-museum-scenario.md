# ADR 0005：博物馆演示

状态：已采纳

## 背景

首页的第三个应用场景是博物馆：虚构的「みなと市立美術博物館」（地下收藏库 B1 + 1F～3F，展示室、企划展示室、59 个展示柜和约 300 件虚构藏品），给学芸员（保存环境、藏品与光照）、运营与警备（客流、安防与巡逻）、来馆者（导览）各一套页面。规划见项目资料里的博物馆 demo 规划。

和停车场一样，验收要求博物馆模块和 SDK、地图引擎、另外两个演示、首页互相独立。

## 决定

- **SDK 只改一处通用行为**：展示柜是嵌在展示室里的小区块，`createVenueIndex().locate` 在区块嵌套时返回最里层（外包矩形最小）的那个，`unitStatePlugin.unitAt` 因此点到展示柜。地图插件全部复用（`unitStatePlugin`、`routePlugin`、`markerPlugin`、`heatmapPlugin`、`positionStreamPlugin`、`trailPlugin`）。SDK 里不出现博物馆的词（`test/layers.test.ts` 检查 museum、gallery、curator、artwork、exhibit、conservation、patrol 和对应的中日文）。
- **不加「传感器时序」契约**：规划里设想过 SDK 新增读数契约。模拟器的读数是「种子 + 时刻」的纯函数，页面按模拟时钟直接取某一时刻和一段时间的值即可，加契约只会多一层没有第二个使用者的抽象。等真正接入外部数据源时再定。
- **业务包 `domains/museum`**：房间与展览、展示柜、藏品、设备、路线是 IMDF 扩展文件（`museum-space`、`museum-case`、`museum-object`、`museum-device`、`museum-route`）。保存标准（按材质分光敏感度三档）、累计光照量和公开天数、三层告警（区域与时间 → 保存环境 → 展示柜与设备；湿度日波动用 24 小时窗口，读数在阈值附近时有回差）、巡逻核对、藏品移动与 RFID 核对、更换建议都在这里，不依赖地图和 DOM，和另外两个业务包互不引用。
- **场馆和模拟**：`tools/venue-gen` 生成博物馆 IMDF；`tools/museum-simulator` 按种子生成一天的温湿度和照度（含空调故障、照明故障、传感器离线）、来馆者（约 30% 佩戴定位标签、团体参观）、警卫巡逻（迟到、漏巡）、换展和安防事件，并把带标签的来馆者作为 `DataProvider` 上报。
- **应用里自成一个文件夹** `apps/playground/src/museum/`：路由表、三语文案、适配层（数据加载、模拟时钟 1× / 60× / 600×、地图状态、告警存储）、地图布局、24 小时曲线（直接画 SVG，不引入图表库）、测试钩子（`window.__museum`）和 `pages/<page>/{index,view}.tsx`。只用外框的 `app/scenario-layout`、`app/map`、`app/teardown`、`app-i18n` / `app-theme` / `settings`；样式表也不依赖停车场的。
- **反方向**：SDK、医院和停车场、首页都不引用博物馆；只有 `app/routes.ts` 认识博物馆的路由表，`app/App.tsx` 挂载 `MuseumApp`。由 `test/layers.test.ts` 的 `museum scenario` 一组检查。
- **地址**：`#/museum/<page>`，进入 `#/museum` 直接打开保存环境。`?t=21:00` 从这个时刻开始模拟，默认 14:00。

## 后果

- 首页从走马灯改为三个场景并排的卡片，窄屏时上下排列。
- 告警引擎每分钟检查一次全馆读数，从 0 点预跑到 14:00 约 1 秒；「跳到闭馆后」再跑约 7 小时。
- 内存回归测试（`tools/leak-bench`）每轮依次打开三个演示的全部页面。
