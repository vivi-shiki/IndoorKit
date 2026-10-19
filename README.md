# vivi-map

开源的 TypeScript 室内地图 SDK（工作名 IndoorKit），配套示例画廊、实时定位看板与 AI 地图助手。

An open-source TypeScript indoor map SDK (working name IndoorKit), with a demo gallery, a real-time location dashboard, and an AI map assistant.

オープンソースの TypeScript 製屋内地図 SDK（仮称 IndoorKit）。デモギャラリー、リアルタイム位置情報ダッシュボード、AI 地図アシスタント付き。

**在线演示 / Live demo / オンラインデモ：<https://vivi-shiki.github.io/vivi-map/>**

## 页面

- 人员实时定位：数千个定位标签在 Worker 中模拟上报，平滑移动，点击回放轨迹
- 设备资产分布：按楼层用聚集点显示设备数量
- 禁入区域告警：进出 ICU 禁入区时告警并弹窗
- 人流密度分析：按时间段显示人员密集区域

全部页面支持中英日三语和亮色/暗色主题。路线图第 0～2 级已完成。

## 开发

```bash
pnpm install
pnpm verify   # lint + typecheck + 单元测试
pnpm build    # 生成数据 + 构建
pnpm e2e      # 端到端与内存回归
```

## 路线图 / Roadmap / ロードマップ

- [中文](docs/roadmap.zh-CN.md)
- [English](docs/roadmap.en.md)
- [日本語](docs/roadmap.ja.md)

## 本地设计文档

完整的设计文档保存在本地文件 [改造项目文档.md](./改造项目文档.md)，已加入 `.gitignore`，不会被提交或推送到 GitHub。在 GitHub 上这个链接打不开是正常的。
