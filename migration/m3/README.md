# Engineering workbench

English | [中文](README.zh.md)

The derived Desktop application menu opens **Engineering workbench**. Choose a local workspace, then use Repository, Changes and draft, Build and test, Files and artifacts, Task status, or Protected files. These controls share the official Host, Shell, Agent lifecycle and Session reader. They do not introduce another agent loop or Session writer. The supported qualification target is Windows x64 personal distribution; enterprise network acceptance remains deferred.

## Repository and review

Git supports branch search, creation, switching, comparison, staged-only commits and explicit non-force push. Every write requires a one-use preview that expires after one minute and binds the workspace, repository state and selected execution permission. Dirty branch switching and stale previews are refused. Repository state checks cannot lock out unrelated external processes. Hg provides read-only status and comparisons.

Commands use the official Shell and deployment file policy. The Git preview has an explicit **Allow unrestricted file writes for this Git operation only** option. It selects the official `danger-full-access` mode for that preview alone; it does not change the session or deployment. There is no automatic fallback. On Windows, the ACL runner can reject MSYS named-pipe creation during push. Preview and confirm the explicit permission only when the destination and operation are intended. Failed commands report bounded output; inspect the repository before another attempt.

Review supports repository, staged, unstaged and captured task comparisons. Automatic baselines are captured before the first model step of a turn. Missing VCS executables, encoding failures and size limits mark automatic comparison unavailable in the current Host; they do not turn comparison into proof or bypass mandatory file protection. Partial captures remain partial. Baselines retain at most 30 records and 128 MiB. Select an excerpt, find an open official composer and append it. The target session, resident composer, patch hash and draft revision must still match. Existing text, reference chips and attachments stay intact. Claimed tickets are never automatically replayed after an uncertain acknowledgement. Tickets expire after two minutes or Host restart.

## Project actions and files

Actions are loaded from `.dsh/project-actions.json` or saved through the workbench. The schema uses `schemaVersion: 1` and an `actions` array. Each action has an `id`, `label`, relative `cwd`, timeout, optional environment and artifact paths. Use `commands.win32`, `commands.darwin` and `commands.linux` for platform-specific commands; an existing `command` remains supported. A platform map without the current platform is refused.

Review and trust the exact configuration before execution. Trust binds normalized configuration, canonical workspace and directory identity. Changes revoke its applicability, including while queued. Runs share one queue per workspace, retain at most 100 completed records and bounded logs, and support cancellation. Restart classifies unfinished runs as interrupted without starting them again. The Host reserves free disk space with a 64 MiB safety margin; it propagates write failures rather than claiming the old Tauri storage owner is still active.

Files can come from manual registration, official Session deliverable declarations, action declarations, or action logs. Declarations do not prove that a run generated fresh bytes. Each open, reveal or save checks a short-lived file identity and path lease. Links, traversal and VCS metadata are refused. Opening has a document/image extension allowlist. Save transfers a pinned copy, limits exports to 512 MiB and creates a new destination exclusively. Choose a new filename; existing destinations are not overwritten. A failed copy can leave an incomplete destination for inspection.

## Protection and task facts

Enable explicit protected paths in **Connections and migration**. The workbench lists snapshots, previews restoration and restores selected paths only against the fresh preview revision. Native checks preserve Win32 directory/file identity, reparse-point and hardlink exclusions, retention and restore receipts. No restore runs while a task or engineering command owns admission. A changed file conflicts rather than overwriting unrelated edits. Unknown capture, identity-check or seal outcomes block further execution pending inspection and restart.

Runtime-owned child sessions can share their parent's capture when they use the same protected root. The last owner seals it. Unrelated work on overlapping roots is refused; disjoint roots can proceed. Engineering commands participate in the same coordinator. Snapshots cover selected paths, not every file, and do not confine external applications.

Task status folds the official Session facts, including waiting tools, permissions, cancellation and unknown results. It never repeats a tool. Notification opt-in starts at the current cursor: Main polls bounded turn-end facts and can notify after the workbench closes. This preference lasts for the application run. Build completion notifications are observed while the workbench is open. Notifications are advisory and are not durable execution receipts.

## Model experience and upstream updates

`list_project_actions` exposes action IDs, labels, timeout and trust state. `run_project_action` accepts a trusted ID and returns the recorded outcome and bounded output through the official tool mechanism. Models cannot grant trust, choose unrestricted Git permission or provide arbitrary replacement action commands. Model execution resolves its own session policy and protection admission. An interrupted or unknown result is not permission to retry.

Upstream upgrades must recheck the Host authenticated route composition, `agent/pre-step`, `session/event`, `tools/pre-execute`, runtime agent ownership, Shell result contract, Session query, deliverable events and official composer insertion coordinates. The native helper adds canonical admission resolution; it must ship with the matching Host. The adapter source provenance is [origin.json](origin.json). The composer bridge is the narrow client patch; the workbench and migrated modules stay in Desktop Host. The package-local bundler includes typed JavaScript adapters explicitly.

Set `DSH_DESKTOP_BUILD_CANDIDATE=m3` to build under `targets/win-x64/candidates/m3`, without replacing running M2 or intranet packages. Preserve the complete `win-unpacked` directory. The repeatable qualification consists of the five scripts in `tests`, focused Vitest suites, `smoke-desktop.mjs`, the native helper tests and the standard complete package/runtime checks. Evidence and the implementation report identify the final tested bytes and remaining release boundaries.
