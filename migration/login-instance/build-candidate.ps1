$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '../..')
$env:CI='true'
$env:pnpm_config_verify_deps_before_run='warn'
$env:npm_config_store_dir='D:/.pnpm-store'
$env:GIT_CONFIG_COUNT='1'
$env:GIT_CONFIG_KEY_0='safe.directory'
$env:GIT_CONFIG_VALUE_0=$PWD.Path
$env:PATH=(Resolve-Path apps/desktop/.desktop-build/toolchain).Path+';'+$env:PATH
$env:DSH_DESKTOP_BUILD_CANDIDATE='n-login'
$env:DSH_DESKTOP_DISTRIBUTION='personal'
$env:DSH_DESKTOP_APP_ID='io.github.nidofy.dsh.desktop'
$env:DSH_DESKTOP_BUILD_COMMIT=(& git -c safe.directory=$PWD.Path rev-parse dsh-v0.2.0-rc.2)
$env:DSH_DESKTOP_BUILD_DIRTY='1'
$env:DSH_DESKTOP_UNSIGNED='1'
$env:DSH_DESKTOP_TARGET_PLATFORM='win32'
$env:DSH_DESKTOP_TARGET_ARCH='x64'
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
$fixNode=(Resolve-Path apps/desktop/.desktop-build/toolchain/node.exe).Path
& $fixNode node_modules/.pnpm/pnpm@11.7.0/node_modules/pnpm/bin/pnpm.mjs --dir apps/desktop run build
if($LASTEXITCODE -ne 0){throw 'Desktop build failed'}
Push-Location apps/desktop
try {
  & $fixNode (Get-Item ../../node_modules/.pnpm/electron-builder*/node_modules/electron-builder/cli.js).FullName --config ../../migration/login-instance/electron-builder.config.mjs --win --x64 --publish never --dir
  if($LASTEXITCODE -ne 0){throw 'Packaging failed'}
} finally { Pop-Location }
