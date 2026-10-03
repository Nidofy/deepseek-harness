$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '../..')
$env:CI='true'
$env:npm_config_store_dir='D:/.pnpm-store'
$env:PATH=(Resolve-Path apps/desktop/.desktop-build/toolchain).Path+';'+$env:PATH
$env:DSH_DESKTOP_BUILD_CANDIDATE='m4-environment-details'
$env:DSH_DESKTOP_DISTRIBUTION='personal'
$env:DSH_DESKTOP_APP_ID='io.github.nidofy.dsh.desktop'
$env:DSH_DESKTOP_UNSIGNED='1'
$env:DSH_DESKTOP_TARGET_PLATFORM='win32'
$env:DSH_DESKTOP_TARGET_ARCH='x64'
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
$env:ELECTRON_BUILDER_7Z_FILTER='BCJ'
$m5Node=(Resolve-Path apps/desktop/.desktop-build/toolchain/node.exe).Path
$m5Builder=(Get-Item node_modules/.pnpm/electron-builder*/node_modules/electron-builder/cli.js).FullName
$m5Input=(Resolve-Path 'apps/desktop/.desktop-build/targets/win-x64/candidates/m4-environment-details/personal-unsigned/win-unpacked').Path
$m5Output=Join-Path $PWD 'apps/desktop/.desktop-build/targets/win-x64/candidates/m5-local/installer'
$m5Stage=Join-Path $PWD 'apps/desktop/.desktop-build/targets/win-x64/candidates/m5-local/staged/win-unpacked'
& robocopy $m5Input $m5Stage /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP
if($LASTEXITCODE -gt 7){throw 'M5 staging failed'}
Push-Location apps/desktop
try {
 & $m5Node $m5Builder --config electron-builder.config.mjs --prepackaged $m5Stage --win nsis --x64 --publish never "-c.directories.output=$m5Output" "-c.win.signExecutable=false"
 if($LASTEXITCODE -ne 0){throw 'M5 installer packaging failed'}
} finally {Pop-Location}
