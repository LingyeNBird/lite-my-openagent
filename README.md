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

## Slash command

This plugin also registers an explicit slash command:

```bash
/lite-agent <request>
```

When used, it forces one request to run with the lite subagent constraints injected in front of the request, instead of relying on the default OmO orchestration behavior.

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

## Auto updater

This plugin includes a lightweight startup update checker inspired by `oh-my-openagent`.

You can enable it with plugin tuple options:

```json
{
  "plugin": [
    "oh-my-openagent",
    ["lite-my-openagent@latest", { "auto_update": true, "show_update_toast": true }]
  ]
}
```

Options:

- `auto_update`: defaults to `true`
- `show_update_toast`: defaults to `true`

Notes:

- The updater runs after the first top-level `session.created` event.
- If your config uses a bare package name or a dist-tag such as `@latest`, the behavior still depends on OpenCode's npm cache policy.
- If you want the most deterministic behavior, prefer an exact version such as `lite-my-openagent@0.1.6`.
- Auto update will not replace a version-pinned entry automatically; it will only warn.

## Build

```bash
pnpm install
pnpm run build
```

## Notes

- This plugin intentionally uses prompt overlays instead of patching OmO source.
- It depends on plugin execution order. If another plugin rewrites the same agents/messages after this one, that later plugin wins.
