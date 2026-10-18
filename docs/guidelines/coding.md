# 编码约束

1. 插件创建的 source、layer、地图监听、事件订阅，必须通过 `ctx.trackSource`、`ctx.trackLayer`、`ctx.onMap`、`ctx.on` 或 `ctx.track` 登记；禁止在插件里直接调用 `map.on` 而不登记。
2. `destroy()` 后 `resources.size` 必须为 0，内存实验室和 leak-bench 会检查。
3. 插件之间只通过 `ctx.get(name)`（需在 `deps` 中声明）和 `EventBus` 通信，禁止全局变量。
4. 图层与数据源 id 统一以 `indoor-` 开头。
5. 样式由数据类别 + 主题生成，不把颜色写进数据。
6. 地图文案至少提供 `ja` 和 `en`。
7. 核心逻辑必须能在没有 WebGL 的环境下用 `FakeMap` 测试。
