# Connections and legacy data

English | [中文](README.zh.md)

The derived Desktop keeps the official Host, Agent loop and Session writer. Its application menu opens **Connections and migration**, where users configure independent OpenAI Chat Completions or Anthropic Messages connections, import legacy data into a separate directory and enable scoped file protection. The official model selector lists saved routes as `nidofy-<connection>`. Upstream Settings → Models remains available; immutable revision and recovery guarantees apply to connections saved through this editor.

## Connections

Enter a connection ID, endpoint, protocol, model IDs and API key. An optional `catalogProvider` inherits an installed catalog. OpenAI bases usually end in `/v1`; Anthropic bases omit the final `/v1`. Independent connections can use the same model ID and different credentials. Editing an existing connection preserves advanced model declarations and profile options. Every save requires a key; the editor clears the password field after submission and never reads a stored key back.

Each save creates an immutable revision and a new credential reference in the official credential service. Active requests and retries retain their captured profile and key. New steps use the current revision. A revoke prevents retained leases from sending another request; it cannot undo an HTTP request already sent. The Host serializes saves, rejects stale expected revisions and reports the operation ID, Host epoch, desired/applied revisions and a digest excluding credentials. Reload queries the committed operation after an uncertain response. The recovery journal contains no keys. Unreferenced revisions retire only after the rollback window and release of all request/retry leases. Process-loss tests cover preparation, credential staging, commit and application; this does not assert filesystem durability after power loss.

Hot changes share the Host's existing network transport. Proxy and CA replacement is unavailable in this editor. Restart the complete application when changing the deployment network environment. The provider library additions are limited to installed-catalog aliases, request-local payload preparation and public profile/credential composition helpers; transcript conversion and the official retry loop stay in their existing owners.

## Copy-only import

Quit the legacy application, select its data root and desktop version, then import. The importer recognizes legacy `settings.yaml` and `profiles/dsh-desktop/cordis.patch.yml`, validates settings against currently loaded official plugins and writes the new `profiles/desktop` patch. It rejects ambiguous settings, inline secrets, executable plugin declarations, unknown Session generations, unsupported workspace formats, linked files and observed writer locks. The official reader validates every copied Session before the official migration chain writes successor generations. Existing source files remain unchanged. Restarting an interrupted import with the same operation ID resumes or returns the existing receipt.

The legacy registry adapter declares writer generation 3 for the old desktop baseline and generation 4 for the source-backed candidate. Tests cover both plus an older generation 0 migration, refusal of future generation 999 and interrupted imports. Session compression is preserved. Attachments and workspace records are copied; query indexes are rebuilt. Enabled file-protection scopes are carried into the new home and remain subject to native identity checks. Existing automation schedules stay in the original directory and are never activated by import.

The receipt gives an independent `dataRoot`. Set `NIDOFY_DESKTOP_DATA_ROOT` to that absolute directory before launching the complete Desktop package. The original directory remains the rollback copy. Imported connection suggestions appear in the editor but have no active credentials until the user binds new keys. Credential references in imported settings are replaced with deliberately absent references. Legacy network, cache and model-capability overrides are retained in the receipt for review rather than activated as unverified settings. Import does not merge into the currently running home or start another Host.

## File protection

Enable protection for a local workspace and 1–128 explicit relative file paths in the same editor. The packaged Rust helper retains the legacy Win32 handle, reparse-point, hardlink, filesystem identity and VCS metadata checks. The Host confirms capture before the first model step and rechecks identity before each official tool dispatch. Missing, expired or failed native operations prevent execution. A lost capture/seal result blocks further protected admission until restart; existing records remain available for inspection.

Child sessions cannot silently bypass admission. The [engineering workbench](../m3/README.md) coordinates runtime-owned children, disjoint workspaces and engineering commands, and provides restoration against a fresh preview. The connections editor exposes scope configuration and snapshot inspection. External processes are not confined by these snapshots.

## Qualification and upstream updates

The official Windows package command builds the helper from its Cargo lockfile and includes it only in derived Windows distributions. Build Node must live outside the runtime directory that packaging recreates. Preserve the full `personal-unsigned/win-unpacked` directory; the executable alone is not the application. The baseline and earlier distribution evidence remain in [M0](../m0/source-lock.json) and [personal qualification](../personal/README.md).

Focused tests live beside the Desktop Host and pi-ai adapter. `check-process-loss.mjs` terminates disposable owners and reopens their journals. `smoke-desktop.mjs` launches the real packaged Electron application with private data, synthetic credentials and local streaming providers. It exercises authenticated routes, retry A while saving B, a new B request, independent credentials, native protection, the editor, restart and an imported copy. [Evidence](evidence/summary.json) records actual results and the tested package. Real provider credentials and enterprise site acceptance are separate from deterministic local qualification.

When updating upstream, rebase the narrow pi-ai additions and Desktop composition changes, rebuild the complete package set, then repeat connection, data, protection and packaged runtime checks. Do not replace a live Host or individual runtime modules. The Rust source record is in [native origin](../../native/nidofy-protection/origin.json).
