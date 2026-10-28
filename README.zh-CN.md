# IndoorKit

[English](README.md) | **简体中文** | [日本語](README.ja.md)

IndoorKit 是一个运行在浏览器中的室内地图 SDK，使用 TypeScript 开发，基于 MapLibre GL JS。它读取 IMDF 格式的场馆数据，以 2.5D 绘制楼层和房间；楼层切换、标记、实时定位、电子围栏、热力图、路线等功能都以插件提供，插件有完整的类型推导，并且自己负责释放资源。

**在线演示：<https://vivi-shiki.github.io/IndoorKit/?lang=zh>**

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

每个场景新增一个**数字孪生驾驶舱**：可编辑的 3D 园区、本地室外地图、室内楼层切换、亮暗主题和手机布局。支持高低画质；点击**导出 GLB**即可在 Blender 中编辑整个园区。模型来源、授权和编辑方法见[数字孪生文档](docs/digital-twin.md)。

在线演示包含三个基于 SDK 的应用场景，各自有独立的业务包（`domains/hospital`、`domains/parking`、`domains/museum`）和模拟器，互不依赖。所有场馆、人员、车辆、公司和藏品都是虚构的。

- **医院实时定位**：「樱花综合医院」，3 栋楼、每栋 5 层。最多 5,000 人的实时定位、设备定位、轨迹回放、基于部门区域和电子围栏的告警、定位热力图。
- **停车场管理**：「港中央停车场」，4 层停车楼加一个平面停车场，共 331 个车位。基于传感器和摄像头的车位实况、车辆进出与停车费、三类异常告警、预约与沿车道的导航路线、运营分析。
- **博物馆**：「港市立美术博物馆」，3 层开放楼层加地下库房，共 59 个展柜。展厅与展柜的温湿度、照度监测和 24 小时曲线，每件藏品的累计光照量和公开天数，藏品移动与 RFID 核对，观众客流和停留时长，三类告警与安保巡逻核对，以及带推荐路线的参观导览。

| 医院 | 停车场 | 博物馆 |
| --- | --- | --- |
| ![人员实时定位](docs/images/tracking.png) | ![车位实况](docs/images/parking-availability.png) | ![保存环境](docs/images/museum-environment.png) |

演示应用位于 `apps/playground`（React 和 MUI），支持中文、英文、日文，浅色和深色主题，以及手机。

## 开发

需要 Node.js 22 和 pnpm。

```bash
pnpm install
pnpm build                         # 生成数据，构建各个包和演示
pnpm verify                        # 代码检查、类型检查和单元测试
pnpm e2e                           # 端到端测试和内存测试
pnpm --filter playground preview   # http://localhost:4173/IndoorKit/
```

架构决策见 [docs/adr](docs/adr)。

TypeScript（strict）· MapLibre GL JS · IMDF · zod · Web Worker + Comlink · KDBush · Flatbush · Turf · Vite · pnpm workspaces · Vitest · Playwright · Biome · GitHub Actions + GitHub Pages
