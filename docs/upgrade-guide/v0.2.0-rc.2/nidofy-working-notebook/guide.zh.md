---
kind: upgrade-guide
description: "Nidofy 工作笔记迁入独立插件，压缩时整理改为主动开启。"
---

# 独立的 Nidofy 工作笔记

[English](guide.md) | 中文

## 变更

Nidofy 原先在桌面扩展中挂载工作笔记，并在 Notebook 模式中自动整理笔记。工作笔记现在由 `@nidofy/dsh-working-notebook` 提供，可在官方标准模式和创造模式使用。基础压缩时整理改为持久保存、整个 profile 共用的选项，初始关闭，也适用于已有 Notebook 会话。只要笔记插件启用，普通笔记工具和手动编辑仍然可用。

## 迁移

1. Nidofy 桌面 bundle 自动启用新插件。原先只挂载 `@nidofy/dsh-desktop-extras` 的自定义 profile，需要额外挂载 `@nidofy/dsh-working-notebook` 才能保留笔记功能。
2. 保留 `$DSH_HOME/nidofy-extras/notebooks` 下的现有文件。无需转换笔记或 Session。
3. 新会话使用官方模式，已有 Notebook 模式 ID 仍然兼容。
4. 如需继续自动整理，在设置或环境信息栏打开“工作笔记与历史”，启用“压缩时自动整理”。该选择适用于此 profile 随后的基础压缩；关闭后仍保留已有笔记。
5. 重启并检查开关及已有笔记。可在插件管理器中单独停用笔记插件，文件不会删除。
