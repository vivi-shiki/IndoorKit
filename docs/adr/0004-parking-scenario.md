# ADR 0004：停车场演示与场景之间的独立

状态：已采纳

## 背景

首页的第二个应用场景是停车场：虚构的「港中央停车场」（4 层自走式停车楼 + 平面停车场 P2，共 332 个车位），给运营方（满空、入出库、告警、分析）和司机（预约与导航）各一套页面。规划见项目资料里的停车场 demo 规划。

验收要求停车场模块和 SDK、地图引擎、医院演示、首页互相独立。

## 决定

- **SDK 只加通用能力**：`packages/plugins` 新增 `unitStatePlugin`（按区块状态着色、按标记描边、按组汇总）和 `routePlugin`（跨楼层路线），`markerPlugin` 支持颜色和更新。SDK 里不出现停车场的词（`test/layers.test.ts` 检查 vehicle、plate、tariff、garage、monthly、车位、停车、駐車、車室）。
- **业务包 `domains/parking`**：区、设备和车道是 IMDF 扩展文件（`parking-zone`、`parking-device`、`parking-lane`）；计费、三层告警（车位使用 → 停车时间 → 设备与环境）、车道图上的最短路径、预约 / 法人手配 / 活动包场、运营统计和建议都在这里，不依赖地图和 DOM，和 `domains/hospital` 互不引用。
- **场馆和模拟**：`tools/venue-gen` 生成停车场 IMDF；`tools/parking-simulator` 按种子生成昨天和今天的全部进出、预约、设备故障，并把行驶中的车作为 `DataProvider` 上报。数据量小，直接在页面里算，不用 Worker。
- **应用里自成一个文件夹** `apps/playground/src/parking/`：路由表、三语文案（`messages.ts`，语言的选择沿用外框）、适配层（数据加载、模拟时钟、车位状态、告警存储）、地图布局、测试钩子（`window.__parking`）和 `pages/<page>/{index,view}.tsx`。停车场只能用外框的这些部分：`app/scenario-layout`（侧栏和手机菜单）、`app/map`（创建并统计地图、语言和主题跟随、楼层按钮）、`app/teardown`、`app-i18n` / `app-theme` / `settings`、`testing/hooks` 的全局统计。它不引用医院的页面、适配层、文案和 `@indoorkit/hospital`。
- **反方向**：SDK、医院页面、首页和其他外框文件都不引用停车场；只有 `app/routes.ts` 认识停车场的路由表，`app/App.tsx` 挂载停车场的入口 `ParkingApp`。以上都由 `test/layers.test.ts` 的 `parking scenario` 一组检查。
- **地址**：`#/parking/<page>`，进入 `#/parking` 直接打开满空地图。`?t=09:30` 从这个时刻开始模拟，默认 14:00；模拟时钟、告警的处理状态和预约在换页后保留。

## 后果

- 数字孪生改造（ADR 0006）将 1F A 排的两个无障碍位扩至 3.75 m：减少一个普通位，总数改为 331，原有 6 m 车道不变。

- 医院原来的 `HospitalLayout` 和 `useMapPage` 里与业务无关的部分移到了 `app/scenario-layout.tsx` 和 `app/map.tsx`，医院页面的行为和测试不变。博物馆演示可以照同样的方式接入。
- 停车场的车位状态每秒整体刷新一次（332 个区块），用 `unitStatePlugin` 只更新数据，不重建图层。
- 内存回归测试（`tools/leak-bench`）每轮依次打开医院和停车场的全部页面。
