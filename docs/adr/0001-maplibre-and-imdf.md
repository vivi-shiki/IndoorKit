# ADR 0001：使用 MapLibre GL JS 与 IMDF

状态：已采纳（第 1 级）

## 决定

- 地图引擎使用 MapLibre GL JS（npm 包、ESM 引入），不需要 token，没有授权限制。
- 室内数据使用 IMDF 1.0.0（OGC 社区标准，基于 GeoJSON）。OGC 没有官方校验器，因此用 zod 自写校验器，并额外检查要素之间的引用和 id 唯一性。
- 墙体用 IMDF `fixture`（category `wall`）表示，由 `fill-extrusion` 拉伸为 2.5D，不使用模型素材。

## 后果

- maplibre-gl 6 根据自身模块地址推算 worker 路径，打包后必须调用 `setWorkerUrl`（见 `apps/playground/src/maplibre-worker.ts`）。
- 核心通过 `MapLike` 接口访问地图，单元测试使用 `FakeMap`，无需 WebGL。
