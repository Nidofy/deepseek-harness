# Personal Desktop qualification reference

English | [中文](README.zh.md)

This reference defines the personal network-enabled candidate and its qualification boundary. The pinned official baseline remains in [the source lock](../m0/source-lock.json). The application uses the official Host, Agent loop, Session writer and model settings; the distribution overlay owns account, telemetry and update policy. Enterprise site acceptance is deferred by the user and is not a prerequisite for this candidate.

## Identity and configuration

Select `apps/desktop/.env.windows.personal.example` as the local `.env.windows` configuration. The App ID is `io.github.nidofy.dsh.desktop`, the product name is `Nidofy DSH Desktop`, and its external protocol is `nidofy-dsh`. Data defaults to `%APPDATA%/Nidofy DSH Desktop/{electron,harness}`. `NIDOFY_DESKTOP_DATA_ROOT` selects an absolute test/deployment root; ambient `DSH_HOME` is ignored. Existing official, intranet and Tauri data is not imported automatically.

The final `personal.patch.yml` overlay preserves optional official-account sign-in and disables product/session telemetry, feedback and API Session-log attachment. Browser network access, public web tools and online plugin management retain upstream availability. This is not a network sandbox. The fork does not subscribe to the official updater; replace the whole application package after quitting it, preserving the separate data directory.

Use Settings → Models → Add model provider to configure a catalog provider or custom API, with its own protocol, base URL, credential and model list. OpenAI Chat Completions appends `/chat/completions` to the supplied API base (often ending in `/v1`). Anthropic Messages appends `/v1/messages`; supplying an extra `/v1` duplicates that segment. Follow the actual gateway's endpoint contract. An API base URL is not automatically an HTTP proxy.

## Build and verification

Use the existing Desktop packaging entry point with the personal environment selected. Windows unsigned directory output is `apps/desktop/.desktop-build/targets/win-x64/personal-unsigned/win-unpacked`. Keep the complete directory with `Nidofy DSH Desktop.exe`; the executable alone is insufficient. Signed output uses the sibling `personal` directory. Runtime preparation remains shared within a target, so do not build distributions concurrently.

Run `node migration/personal/smoke-desktop.mjs` using the qualified bundled Node after packaging. It launches a private real Electron instance, checks the official composer and Models page, and sends normal authenticated Host RPCs. Local OpenAI/Anthropic streaming fixtures enforce protocol-specific paths, use identical model names with separate synthetic credentials, and require completed turns in durable Session history. The script also checks stale settings revision rejection, credential rotation for the next turn, and settings/credentials/history after restart. It never opens a real user's data or supplies real API credentials.

The script measures Chromium HTTPS access to `https://example.com/` separately and records the actual status. A failed public probe stays visible in `publicNetwork` even when local protocol qualification passes; require `publicNetwork.ok` before calling public connectivity verified. Plugin-manager availability does not establish successful plugin installation. Search is not used as a persistence oracle because the upstream default can disable the optional index; history is read at the official projection cursor.

The recorded run, package hashes, sanitized runtime log and screenshots are in [evidence](evidence/summary.json). The official packaged-runtime check covers bundled native modules, terminal, file search, pnpm and DOCX/XLSX/PPTX conversion. Synthetic model replies prove application integration, not a paid provider's credentials, quotas, reasoning or tool behavior. Browser guest navigation, live web search, third-party MCP and plugin installation need their own endpoint tests.

## Remaining migration boundary

This record describes the initial personal candidate. The subsequent [M2 implementation](../m2/README.md) adds immutable connection revisions, credential leases, retry binding, transaction recovery, catalog/payload adaptations, copy-only import and the first native protection slice. Its separate evidence identifies the current package; the earlier package hashes here remain historical. M3 engineering workflows and complete protection/recovery remain open. Follow upstream by rebasing the narrow composition changes onto an explicitly pinned release and repeating connection, data, protection and packaged-runtime qualification.
