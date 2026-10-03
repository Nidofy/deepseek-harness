# Nidofy intranet distribution

English | [中文](README.zh.md)

The Windows x64 intranet package runs the official Desktop Host and Web application with a final packaged policy overlay. Runtime version remains aligned with the bundled DSH version; distribution revision is recorded separately in `dshDistribution` in the packaged manifest. The policy neither changes the Agent loop nor weakens the runtime descriptor, package-set, Office or signature verification.

## Build and launch

Copy `apps/desktop/.env.windows.intranet.example` to `apps/desktop/.env.windows`, then run `pnpm --dir apps/desktop run package:win:x64:dir --unsigned` with the pinned toolchain. Build-time dependency preparation needs approved build network access or a populated verified cache. The resulting `Nidofy DSH Intranet.exe` carries the Node, Python, Office, pnpm and DSH payloads; first launch does not install dependencies. An unsigned artifact is a development candidate, not a signed release.

The application uses App ID `io.github.nidofy.dsh.intranet`, external protocol `nidofy-dsh-intranet`, and `%APPDATA%/Nidofy DSH Intranet/{electron,harness}`. `NIDOFY_DESKTOP_DATA_ROOT` selects an explicit absolute parent directory for isolated qualification or managed deployment. Ambient `DSH_HOME` does not redirect the intranet application. Profile locks, local credentials and Session data live under its Harness home; Chromium partitions live under its Electron home. The internal `dsh-app` document protocol is process-local and is not an OS URL association. The loopback server allocates a free port.

## Policy

The packaged `resources/intranet.patch.yml` runs after profile and home patches. It disables account providers/controllers, product analytics and its exporter, session telemetry, feedback submission, API Session-log attachment, public web tools and online plugin management. Core local Session persistence and export remain available. Third-party bundles are executable code: a profile is not a security sandbox and arbitrary locally installed code requires administrator review. Optional bundles must be prepared through the build process; online installation is unavailable.

Main enters the workspace directly, reads only local language settings, does not subscribe to account state, ignores mandatory update metadata in this mode, and does not start automatic update checks. Account expiry cannot return the user to Welcome. Update actions explain complete offline package replacement. Shut down the application, preserve its data, verify the replacement package and deploy it as one unit. Never replace only Host or individual dependencies. Online publication settings are rejected when mixed with intranet packaging settings; signed offline builds still require the normal signing configuration.

Default-session Chromium requests may address only the current authenticated local Host or packaged/local assets. Sidebar guests cannot access network destinations, and shell-owned external links do not open a browser. The policy does not intercept arbitrary Node sockets, model requests, MCP, Git or shell/build descendants. Enterprise gateway rules must restrict those processes to approved services. An API `base URL + API Key` describes a model gateway; it is not a generic HTTP proxy and must not be put into `HTTP_PROXY` automatically. Credential and model connection migration belongs to M2.

## Qualification

Run `node migration/m1/smoke-desktop.mjs` after packaging. It creates private data, supplies no credentials, checks direct local entry and restart, attempts a denied Chromium request against a local sink, tests final-overlay precedence against conflicting saved profile entries, and starts the retained M0 official package simultaneously. The M0 package must be at `.desktop-build/qualification/m0-official-win-unpacked`; the script never uses a real user's official home. Results and screenshots stay under `.desktop-build/qualification`.

The test does not certify a disconnected machine or the enterprise gateway. Site acceptance must verify allowed model/MCP/artifact endpoints, rejection of disallowed destinations from Node and shell/Git descendants, redirect handling and absence of authentication forwarding to other origins. No real API key belongs in evidence. Record gateway policy revision and sanitized destination/port outcomes. See [network inventory](network-inventory.json) for the application and deployment responsibilities.

The intended site uses `http://172.16.10.6:18080` and blocks public internet access, according to the deployment owner; the build machine cannot reach it. At the site, run `node migration/m1/probe-site-network.mjs http://172.16.10.6:18080 https://example.com site-network.json`, using the packaged tool Node. This credential-free probe measures Node and PowerShell child TCP connectivity only. A positive result must accompany enterprise rule/audit evidence; it does not prove API authentication, HTTP redirect policy, Git/MCP behavior, or every possible destination.

## Following upstream

Rebase the small Desktop packaging/Main/Host changes onto a fixed official release. Review the final policy row IDs against both official bundle patches before enabling the new build. Repeat distribution tests, the official package verification and real packaged UI qualification. Run the upstream account/updater tests to protect the default distribution. Update `migration/m0/source-lock.json` only as part of an explicit baseline upgrade; keep prior evidence. Product features consume the official Host rather than starting a second supervisor.
