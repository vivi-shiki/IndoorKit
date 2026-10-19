# IndoorKit — 院内定位管理平台

[English](README.md) | **简体中文** | [日本語](README.ja.md)

一个在浏览器里运行的医院室内定位（RTLS）与资产管理演示。底层是用 TypeScript 从零编写、基于 MapLibre GL JS 的室内地图 SDK。

**在线演示：<https://vivi-shiki.github.io/IndoorKit/?lang=zh>**

所有人员、设备和建筑都是虚构的。场馆为「さくら総合病院」：3 栋楼、每栋 5 层，每层都有连廊相通。

## 演示内容

### 人员实时定位

全院医护人员、患者和设备的实时位置。定位标签沿走廊行走、经门进出房间，只通过电梯或楼梯换层。

- 可选 500、2,000、5,000 个标签；每秒上报一次，两次上报之间平滑移动。
- 点击标签可回放它最近 10 分钟的轨迹。
- 性能面板显示帧率、帧间隔和在线标签数。

![人员实时定位](docs/images/tracking.png)

### 设备资产分布

按楼层查看设备的聚集情况。3 米内的设备合为一个聚集点，点上的数字是设备数量；标题栏显示本层的聚集点数和设备数。

![设备资产分布](docs/images/assets.png)

### 禁入区域告警

3F 的 ICU 设为禁入区域。标签进入或离开时，告警会出现在列表中，并在标签位置弹出提示。

![禁入区域告警](docs/images/alerts.png)

### 人流密度分析

查看各楼层近 1、5、15 分钟内的人员密集区域，用于排班和发现拥堵。

![人流密度分析](docs/images/occupancy.png)

### 所有页面通用

- 楼层切换（1F～5F），所有楼栋同时切换。
- 中文、英文、日文三语，地图内的房间名也一起切换。
- 亮色与暗色主题，两种主题下文字都满足 WCAG AA 对比度。
- 语言和主题保存在浏览器里，下次打开时保持不变。

## 技术要点

- **带插件系统的室内地图 SDK。** 用 `definePlugin` 声明插件及其依赖，按依赖顺序加载，插件 API 有完整的类型推导（如 `map.plugins.cluster.clusters()`）。
- **从设计上避免内存泄漏。** 插件创建的 source、图层、监听、定时器和 Worker 都登记到 `ResourceTracker`，`destroy()` 时按创建的逆序释放。内存回归测试会反复切换所有页面，检查 JS 堆、Worker 和已登记资源。
- **开放的数据格式。** 地图数据采用 IMDF（OGC 社区标准），用 zod 校验，包括要素之间的引用和 id 唯一性。虚构医院由脚本生成，数据可以复现。
- **由数据生成样式。** 房间颜色和 2.5D 高度由房间类别和主题决定；墙体和房间用 `fill-extrusion` 拉伸，不需要 3D 模型。语言和主题在运行时切换，不重建地图。
- **实时数据不占主线程。** 可复现的定位模拟器（按种子生成）运行在 Web Worker 里，通过 Comlink 与页面通信。
- **空间算法。** 带轨迹记录的插值移动；用 KDBush 索引做半径聚合；用 Flatbush 索引加点在多边形内判断做电子围栏；热力图按「分钟 × 网格」累计样本，内存占用有上限。
- **端到端测试。** 单元测试在不依赖 WebGL 的内存假地图上运行 SDK。Playwright 通过测试钩子操作真实页面，检查两种主题下的对比度，并通过 Chrome DevTools Protocol 测量堆增长。GitHub Actions 运行全部测试并部署到 GitHub Pages。

## 技术栈

TypeScript（strict）· MapLibre GL JS · IMDF · zod · Web Worker + Comlink · KDBush · Flatbush · Turf · Vite · pnpm workspaces · Vitest · Playwright · Biome · GitHub Actions + GitHub Pages

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `packages/core` | 地图创建、插件系统、资源登记、事件、样式与主题生成 |
| `packages/imdf` | IMDF 读取、校验与转换 |
| `packages/plugins` | 楼层、实时位置、聚合、电子围栏、热力图、多边形、线、弹窗、标记插件 |
| `tools/venue-gen` | 虚构医院生成器 |
| `tools/rtls-simulator` | 标签移动模拟器及其 Worker 数据源 |
| `apps/playground` | 在线演示的四个页面 |

## 本地运行

需要 Node.js 22 和 pnpm。

```bash
pnpm install
pnpm build
pnpm --filter playground preview
```

然后打开 <http://localhost:4173/IndoorKit/>。
