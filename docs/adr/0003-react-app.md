# ADR 0003：演示应用改用 React 和 MUI

状态：已采纳

## 背景

演示应用原来用原生 TypeScript 拼 HTML 字符串（`view.ts` 返回字符串，`index.ts` 用 `innerHTML` 和事件委托接线）。首页要做三个应用场景的走马灯，医院演示要加桌面端侧栏和手机端顶栏菜单，页面状态（筛选、选中、抽屉）也越来越多，手写 DOM 更新容易出错。

## 决定

- **只有应用层用 React**：`apps/playground` 用 React 19 和 MUI（日本 React 项目里最常用的组件库）。`packages/*`（SDK，唯一封装 MapLibre 的地方）和 `domains/hospital`（医院业务规则，也在 Worker 里运行）保持不依赖框架的 TypeScript。`test/layers.test.ts` 检查 SDK 和业务层没有 `.tsx`、不引入 React / MUI / Emotion，页面不写 HTML 字符串。
- **地址**：`#/` 是首页；医院演示在 `#/hospital/<page>`，进入 `#/hospital` 直接打开第一个地图页；旧的 `#/<page>` 链接替换成新地址。路由在 `app/routes.ts`，是纯函数，有单元测试。
- **一次只有一张地图**：页面卸载时把销毁地图（含插件的 Worker）的 Promise 登记到 `app/teardown.ts`，路由等它完成才挂载下一页（`useSettled`）。换页时侧栏不重建。
- **地图页**：`useMapPage` 在挂载时创建地图，就绪前返回 `null`；`useMapEvent` 订阅地图事件；实时数据每秒更新，列表用 `useRefresh` 限频重画，渲染时从插件读最新数据。`MapPageLayout` 提供标题栏、楼层按钮、场馆名和手机端的列表按钮。
- **样式**：外框（侧栏、顶栏、首页、语言和主题按钮）用 MUI；地图上的面板沿用 `style.css`。两套主题的颜色只写在 `app/mui-theme.ts` 的 `TOKENS`，MUI 调色板和 CSS 变量都从它生成。

## 后果

- 停车场、博物馆演示可以复用 `app/` 的外框和 `useMapPage`，只写自己的业务包和页面。
- MUI 和 React 让应用包变大（约 1.7 MB，gzip 后约 490 KB），SDK 包不受影响。
- 受控输入框不响应直接写 `el.value`：端到端测试设 range 值时要用原生 setter。
