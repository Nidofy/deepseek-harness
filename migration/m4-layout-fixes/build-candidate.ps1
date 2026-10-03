$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '../..')
$env:CI='true'
$env:npm_config_store_dir='D:/.pnpm-store'
$env:GIT_CONFIG_COUNT='1'
$env:GIT_CONFIG_KEY_0='safe.directory'
$env:GIT_CONFIG_VALUE_0='D:/Documents/FeiyangChen/devApps/dshWinUi/electron'
$env:PATH=(Resolve-Path apps/desktop/.desktop-build/toolchain).Path+';'+$env:PATH
$env:DSH_DESKTOP_BUILD_CANDIDATE='m4-layout-fixes'
$env:DSH_DESKTOP_DISTRIBUTION='personal'
$env:DSH_DESKTOP_APP_ID='io.github.nidofy.dsh.desktop'
$env:DSH_DESKTOP_BUILD_COMMIT=(& git -c safe.directory=$PWD.Path rev-parse dsh-v0.2.0-rc.2)
$env:DSH_DESKTOP_BUILD_DIRTY='1'
$env:DSH_DESKTOP_UNSIGNED='1'
$env:DSH_DESKTOP_TARGET_PLATFORM='win32'
$env:DSH_DESKTOP_TARGET_ARCH='x64'
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
$env:ELECTRON_BUILDER_7Z_FILTER='BCJ'
$fixNode=(Resolve-Path apps/desktop/.desktop-build/toolchain/node.exe).Path
$fixPnpm=(Resolve-Path node_modules/.pnpm/pnpm@11.7.0/node_modules/pnpm/bin/pnpm.mjs).Path
& $fixNode $fixPnpm --dir apps/desktop run build
if($LASTEXITCODE -ne 0){throw 'Desktop build failed'}
$fixPacked=Join-Path $PWD 'apps/desktop/.desktop-build/targets/win-x64/candidates/m4-layout-fixes/packed/dsh'
foreach($fixPackage in @('packages/client/ui-layout','apps/desktop-host','packages/nidofy/desktop-extras','packages/nidofy/desktop-bundle')) {
  & $fixNode $fixPnpm --dir $fixPackage pack --pack-destination $fixPacked
  if($LASTEXITCODE -ne 0){throw "Pack failed: $fixPackage"}
}
foreach($fixStep in @('prepare:packages','prepare:dsh')) {
  & $fixNode $fixPnpm --dir apps/desktop run $fixStep
  if($LASTEXITCODE -ne 0){throw "Preparation failed: $fixStep"}
}
Push-Location apps/desktop
try {
  & $fixNode $fixPnpm exec electron-builder --config electron-builder.config.mjs --win --x64 --publish never --dir
  if($LASTEXITCODE -ne 0){throw 'Packaging failed'}
} finally { Pop-Location }
