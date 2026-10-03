---
kind: upgrade-guide
description: "Nidofy working notes move to an independent plugin and compaction organization becomes opt-in."
---

# Independent Nidofy working notes

English | [中文](guide.zh.md)

## Change

Nidofy previously mounted working notes inside desktop extras and automatically organized notes in Notebook presets. Working notes now belong to `@nidofy/dsh-working-notebook`, available in official Standard and Creator modes. Organization during basic compaction is a persisted profile-wide choice, initially off, including existing Notebook conversations. Ordinary note tools and manual editing remain enabled while the notebook plugin is enabled.

## Migration

1. The Nidofy desktop bundle enables the new plugin automatically. Custom profiles that previously mounted only `@nidofy/dsh-desktop-extras` must also mount `@nidofy/dsh-working-notebook` to retain notes.
2. Keep existing files under `$DSH_HOME/nidofy-extras/notebooks`. No note or Session conversion is required.
3. Use official modes for new conversations. Existing Notebook preset IDs remain compatible.
4. To retain automatic organization, open Working notes and history in Settings or the environment rail and enable Organize notes during compaction. The choice applies to subsequent basic compactions across this profile; turning it off retains existing notes.
5. Restart and check the saved switch and existing notes. Plugin Manager can independently disable the notebook plugin without deleting its files.
