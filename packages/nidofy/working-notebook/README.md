---
description: "Optional working notes and compaction organization for official agent modes."
kind: "package-reference"
---

# @nidofy/dsh-working-notebook

English | [中文](README.zh.md)

## Summary

This independent plugin supplies note tools, original-history browsing, versioned user corrections and turn-boundary note snapshots. Standard and Creator retain their official preset definitions. Disable the plugin through Plugin Manager to remove its tools, prompt contribution, endpoints and UI without deleting notes or affecting desktop appearance and pets.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

The private desktop bundle mounts this package separately from desktop extras. The environment rail contributes a note panel when available; Settings also provides a working-notes section when desktop extras is disabled. Existing notes remain under `$DSH_HOME/nidofy-extras/notebooks`; no Session migration is needed. The five official history tools and persistent search index remain separately owned by the bundle.

“Organize notes during compaction” is a profile-wide, persisted switch, initially off. It applies from the next basic-compaction summary, including manual `/compact`, across Standard, Creator and other presets using the official basic provider. Switching it off keeps manual edits, model note tools and existing note snapshots available. A choice changed during a summary discards that operation's note candidate. Saved choices override the `autoOrganize` initial Config value; `maxEntries` and `maxBytes` bound notes and the summary appendix.

<a id="understand-the-implementation"></a>
## Understand the implementation

The plugin uses the `compaction/basic-summary` waterfall, adding a bounded appendix to the official trailing summary directive. It leaves replayed messages, tool schemas, routing, pressure thresholds, pruning, commit and cancellation with the official engine. Successful durable compaction publishes validated note deltas; malformed candidates fall back to ordinary summarization. The shared implementation remains in desktop-extras library exports, which do not activate that package's desktop plugin. The [compaction subsystem](../../../docs/subsystems/compaction.md) owns summary transactions.

Plugin disposal removes its event handlers and waits for pending work. Notes are non-authoritative reference material with exact source-event citations. Model writes cannot change user-pinned notes. No invariant companion is published because publication is owned by the versioned store and official compaction transaction rather than independently maintained runtime observations.

<a id="model-experience"></a>
## Model Experience

### Working notes

#### What the model sees

`notebook_read` and `notebook_update` are available while this plugin is enabled. Updates use revision checks, evidence quotes and entry limits. Disabling automatic organization does not remove these tools.

#### Token effect

Committed notes enter the next turn through logged runtime context. Enhanced summaries request an incremental note delta alongside the ordinary checkpoint. Only original cited events support new entries.

#### KV Cache effect

With organization off, the plugin does not alter the official summary request. When on, one bounded trailing appendix preserves the original request prefix; notes and generated deltas add tokens. Invalid enhanced output may cause another ordinary summarization request. Disabling the plugin removes future note injection but does not erase already logged history.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Custom compaction providers that bypass the basic-summary hook are not enhanced. Compatibility Notebook presets remain available for saved conversations; new conversations can use the official modes. The switch is profile-wide, not per conversation. History search retains the official literal FTS limitations, including Chinese substring limitations. Real long-task accuracy and cost are not established by synthetic regression checks.

<a id="dev-note"></a>
### Dev Note

This private package ships with the Nidofy desktop bundle. When updating upstream, verify the basic-summary hook and independent plugin disposal before rebuilding the desktop candidate.
