# lite-my-openagent

[English](README.md) | [简体中文](README.zh-cn.md)

这是一个面向 `oh-my-openagent` 的轻量级覆盖插件。

它**不会**替代 OmO 本体，而是应该加载在 `oh-my-openagent` **之后**。加载后，它会：

- 给 `sisyphus`、`hephaestus`、`prometheus`、`atlas` 的提示词前置一层 lite 策略覆盖
- 把 OmO 注入的 `[search-mode]` 和 `[analyze-mode]` 文本重写为 lite 规范
- 以提示词约束的方式，落实你的本地子代理预算哲学

## 它会修改什么

基于用户的 `子代理调用规范.md`，这个插件会把默认行为收紧为：

- 自动注入的 `search-mode` / `analyze-mode` **不视为用户真实意图**
- 默认搜索预算改为“本地优先、最小必要”
- `L0`：不允许子代理
- `L1`：最多 `1` 个子代理
- `L2`：最多 `2` 个子代理，通常是 `1 explore + 1 librarian`
- `L3/L4`：必须先向用户申请并获得明确同意
- 禁止同主题的嵌套搜索委托

## Slash 命令

这个插件还会注册一个显式命令：

```bash
/lite-agent <请求内容>
```

使用它时，会在这一次请求前面强制注入 lite 子代理约束，而不是继续沿用 OmO 默认偏激进的编排倾向。

## 安装顺序

把这个插件放在 OpenCode 的插件列表里，并且**放在** `oh-my-openagent` **后面**，这样它的 hook 会在后面执行，才能重写 OmO 已经生成的 prompt 和消息内容。

示例：

```json
{
  "plugin": [
    "oh-my-openagent",
    "file:///ABSOLUTE/PATH/TO/lite-my-openagent"
  ]
}
```

## 自动更新器

这个插件内置了一套轻量级启动更新检查器，思路参考 `oh-my-openagent`。

你可以通过插件 tuple 选项启用或调整它：

```json
{
  "plugin": [
    "oh-my-openagent",
    ["lite-my-openagent@latest", { "auto_update": true, "show_update_toast": true }]
  ]
}
```

可用选项：

- `auto_update`：默认是 `true`
- `show_update_toast`：默认是 `true`

说明：

- 更新检查会在首个顶层 `session.created` 之后触发。
- 如果配置里使用的是裸包名或 `@latest` 这类 dist-tag，实际是否能立即拉到最新版仍然依赖 OpenCode 的 npm 缓存策略。
- 如果你希望行为最稳定、最可复现，优先使用精确版本，例如 `lite-my-openagent@0.1.6`。
- 如果配置已经锁定为精确版本，自动更新器不会强行替换，只会提示有新版本。

## 构建

```bash
pnpm install
pnpm run build
```

## 说明

- 这个插件故意采用 **prompt overlay** 的方式，而不是直接修改 OmO 源码。
- 它依赖插件执行顺序。如果后面还有别的插件继续重写相同的 agent prompt 或消息内容，那么后加载的插件会覆盖它。
