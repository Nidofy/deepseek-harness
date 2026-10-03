# M0 qualification inputs

English | [中文](README.zh.md)

This directory records the local Windows qualification of the pinned official Desktop. It does not enable the intranet distribution or migrate user data. `source-lock.json` separates the upstream tag, dependency lock, and original private patch series. `couplings.json` names the integration points and the remaining implementation work.

## Source reconstruction

Fetch both `dsh-v0.2.0-rc.1` and `dsh-v0.1.7-alpha.2` from `upstream`, then run `node migration/m0/verify-source.mjs`. The verifier checks the dependency lock and patch bytes, reconstructs the old fork through a private Git index, and compares its complete tree. It does not apply the patches to the checkout. The exact patch files are preserved as binary Git attributes so checkout newline conversion cannot change their digests.

The archived patches are source recovery inputs, not rc.1-ready patches. Their generated catalogs, translation records and an event declaration require a deliberate port. M0 does not modify production model requests.

## Build and runtime qualification

Install with `npm exec --yes --package=pnpm@11.7.0 -- pnpm install --frozen-lockfile`. The tested local command is `pnpm --dir apps/desktop run package:win:x64:dir --unsigned`. It retains the approved upstream version `0.2.0-rc.1`. Configure a private application id and loopback-only mandatory-policy/update origins in the ignored `apps/desktop/.env.windows`; never reuse this qualification configuration for release. No signing or upload credentials are needed.

`smoke-desktop.mjs` uses the installed lockfile's Playwright, private Harness and Electron data directories, and a test-only composition disabling product analytics. It exercises the packaged welcome IPC, waits for the actual composer, captures screenshots and closes the application. It does not send a model request or certify OS-level egress isolation. Screenshots and results remain under `apps/desktop/.desktop-build/qualification/m0-ui-*`.

The runtime matrix distinguishes build-host Node 24.16.0, Electron 44.0.0 / Node 24.18.1, and bundled tool Node 24.21.0. SDK missing-Office-assets shutdown fails with a libuv assertion under 24.16.0 but passes under both packaged Node versions. Use the bundled tool Node for the recorded SDK/headless qualification; this observation does not certify every Node version allowed by the upstream engines range.

## Focused regressions

`apps/desktop/tests/migration-m0-connection.spec.ts` sends synthetic credentials to loopback HTTP servers through the real pi-ai adapter. It records the mutable-reference limitation and the revision-reference alternative. Repeated prepared dispatch is not a complete Agent retry or connection transaction implementation.

`apps/cli/tests/profiles/headless/tests/session-format-guard.expected.e2e.ts` checks source-preserving migration and refusal of unknown data. Its Windows file expectation follows the existing named-semaphore implementation; POSIX still requires the persistent lock file. No production Session format or lock behavior changes.

Machine-readable results and artifact digests are in `evidence/`. The original build logs and broader migration plan remain in the parent desktop workspace. Local qualification does not imply remote publication, user-data migration, signed distribution, full intranet acceptance, or completion of M1–M5.
