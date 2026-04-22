# lite-my-openagent

[English](README.md) | [简体中文](README.zh-cn.md)

A lightweight overlay plugin for `oh-my-openagent`.

It does **not** replace OmO itself. Instead, it should be loaded **after** `oh-my-openagent` and it will:

- prepend a lite policy overlay to the prompts of `sisyphus`, `hephaestus`, `prometheus`, and `atlas`
- rewrite OmO's injected `[search-mode]` and `[analyze-mode]` text into a lite policy
- enforce the user's local subagent budget philosophy in prompt form

## What it changes

Based on the user's `子代理调用规范.md`:

- auto-injected `search-mode` / `analyze-mode` is **not** treated as the user's real intent
- default search budget becomes local-first and minimal
- `L0`: no subagents
- `L1`: at most 1 subagent
- `L2`: at most 2 subagents, typically `1 explore + 1 librarian`
- `L3/L4`: must ask the user for approval first
- no nested same-topic search delegation

## Install order

Put this plugin **after** `oh-my-openagent` in your OpenCode plugin list so its hooks run later and can rewrite OmO's prompt/config output.

Example:

```json
{
  "plugin": [
    "oh-my-openagent",
    "file:///ABSOLUTE/PATH/TO/lite-my-openagent"
  ]
}
```

## Build

```bash
npm install
npm run build
```

## Notes

- This plugin intentionally uses prompt overlays instead of patching OmO source.
- It depends on plugin execution order. If another plugin rewrites the same agents/messages after this one, that later plugin wins.
