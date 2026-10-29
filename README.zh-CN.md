# IndoorKit

[English](README.md) | **简体中文** | [日本語](README.ja.md)

IndoorKit 是一个运行在浏览器中的室内地图 SDK，使用 TypeScript 开发，基于 MapLibre GL JS。它读取 IMDF 格式的场馆数据，以 2.5D 绘制楼层和房间；楼层切换、标记、实时定位、电子围栏、热力图、路线等功能都以插件提供，插件有完整的类型推导，并且自己负责释放资源。

**在线演示：<https://vivi-shiki.github.io/indoorkit-demo/?lang=zh>**

## 特点

- **插件系统。** 用 `definePlugin` 声明插件及其依赖，按依赖顺序加载，插件 API 在 `indoor.plugins` 上有完整的类型。
- **从设计上避免内存泄漏。** 插件创建的 source、图层、监听、定时器和 Worker 都登记到 `ResourceTracker`，`destroy()` 时按创建的逆序释放。内存回归测试检查 JS 堆、Worker 和未释放的资源。
- **开放的数据格式。** 场馆数据采用 IMDF（OGC 社区标准），用 zod 校验，包括要素之间的引用和 id 唯一性。标准之外的数据（如部门、停车分区）放在带类型的扩展文件里，各自有校验。
- **由数据生成样式。** 房间颜色和高度由房间类别和主题决定，墙体和房间直接拉伸，不需要 3D 模型。语言和主题在运行时切换，不重建地图。
- **实时定位。** 定位数据通过 `DataProvider` 接入；定位流插件可平滑插值数千个标签，另有带停留识别的轨迹、电子围栏、按房间聚合和内存有上限的热力图。
- **业务逻辑在 SDK 之外。** SDK 不包含任何行业概念，业务规则放在独立的业务包里，不依赖地图和 DOM。
- **不依赖 GPU 的测试。** 单元测试在内存中的模拟地图上运行 SDK；Playwright 通过测试钩子操作演示页面，并测量堆增长。

## 包

| 包 | 内容 |
| --- | --- |
| `@indoorkit/core` | 地图创建、相机、插件系统、资源登记、事件、样式和主题生成。唯一引用 MapLibre 的包 |
| `@indoorkit/imdf` | IMDF 的读取、校验、转换，以及扩展文件 |
| `@indoorkit/rtls` | 实时定位的约定：标签位置、数据源和 `positions:update` 事件 |
| `@indoorkit/plugins` | 楼层、区域、定位流、房间聚合、区块状态、路线、轨迹、聚合、电子围栏、热力图、多边形、线、弹窗和标记插件 |

## 用法

```ts
import { createIndoorMap, definePlugin } from '@indoorkit/core';
import { buildVenueModel, fetchImdf } from '@indoorkit/imdf';
import { floorPlugin, markerPlugin, unitStatePlugin } from '@indoorkit/plugins';

const venue = buildVenueModel(await fetchImdf('/data/my-venue'));

// 自定义插件：返回的 API 出现在 indoor.plugins.clicks 上
const clicksPlugin = definePlugin({
  name: 'clicks',
  deps: ['floor'],
  setup(ctx) {
    let count = 0;
    ctx.on('map:click', () => count++); // destroy() 时自动释放
    return { count: () => count };
  },
});

const indoor = await createIndoorMap({
  container: 'map',
  venue,
  plugins: [
    floorPlugin,
    markerPlugin,
    unitStatePlugin({ colors: { free: '#30a46c', occupied: '#e5484d' } }),
    clicksPlugin,
  ] as const,
});

indoor.plugins.floor.set('2F');
indoor.plugins.marker.add({ id: 'gate', coord: venue.center, label: '入口' });
indoor.plugins['unit-state'].set('unit-201', 'occupied');
indoor.events.on('floor:change', ({ levelId }) => console.log(levelId));

await indoor.destroy();
```

## 示例

在线演示包含三个基于 SDK 的应用场景：医院实时定位、停车场管理和博物馆，各自有独立的业务包和模拟器，并各有一个数字孪生驾驶舱。演示的源码、虚构场馆数据和 3D 园区模型在 [indoorkit-demo](https://github.com/vivi-shiki/indoorkit-demo) 仓库。

| 医院 | 停车场 | 博物馆 |
| --- | --- | --- |
| ![人员实时定位](https://raw.githubusercontent.com/vivi-shiki/indoorkit-demo/main/docs/images/tracking.png) | ![车位实况](https://raw.githubusercontent.com/vivi-shiki/indoorkit-demo/main/docs/images/parking-availability.png) | ![保存环境](https://raw.githubusercontent.com/vivi-shiki/indoorkit-demo/main/docs/images/museum-environment.png) |

## 开发

需要 Node.js 22 和 pnpm。

```bash
pnpm install
pnpm verify   # 代码检查、类型检查和单元测试
pnpm build    # 构建各个包
```

架构决策见 [docs/adr](docs/adr)。

TypeScript（strict）· MapLibre GL JS · IMDF · zod · Web Worker + Comlink · KDBush · Flatbush · Turf · Vite · pnpm workspaces · Vitest · Playwright · Biome · GitHub Actions + GitHub Pages
