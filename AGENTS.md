# AGENTS.md

AI 协作者与人类开发者共用的项目说明。

## 结构

| 路径 | 职责 |
| --- | --- |
| `packages/imdf` | IMDF 读取、zod 校验、转换为 `VenueModel` |
| `packages/core` | `createIndoorMap`、插件系统、`ResourceTracker`、`EventBus`、样式生成 |
| `packages/plugins` | 官方插件（`floor`、`marker`） |
| `tools/venue-gen` | 生成虚构医院「さくら総合病院」的 IMDF 数据 |
| `tools/leak-bench` | Playwright 内存回归测试 |
| `apps/playground` | 示例画廊，部署到 GitHub Pages |

## 唯一入口命令

```bash
pnpm verify   # lint + typecheck + 单元测试
pnpm build    # 生成数据 + 构建各包 + 构建 playground
pnpm e2e      # 端到端与内存回归（需先 pnpm build）
```

不要直接调用 vite、tsc、vitest、playwright。

## 规则

- 先写测试，再写实现；`pnpm verify` 和 `pnpm e2e` 全部通过才能提交。
- 编码约束见 [docs/guidelines/coding.md](docs/guidelines/coding.md)，架构决策见 [docs/adr](docs/adr)。
- 路线图见 [docs/roadmap.zh-CN.md](docs/roadmap.zh-CN.md)。
- 不提交任何真实医院、公司或个人的数据。
