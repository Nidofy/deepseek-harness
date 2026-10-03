# Run the repaired M4 package with the existing M4 trial preferences and sessions.
$ErrorActionPreference = 'Stop'
$m4Repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$m4Build = Join-Path $m4Repository 'apps/desktop/.desktop-build'
$m4Executable = Join-Path $m4Build 'targets/win-x64/candidates/m4-fixes/personal-unsigned/win-unpacked/Nidofy DSH Desktop.exe'
if (-not (Test-Path -LiteralPath $m4Executable -PathType Leaf)) { throw 'Build the M4 candidate before launching this trial.' }
$m4PriorDataRoot = $env:NIDOFY_DESKTOP_DATA_ROOT
try {
    $env:NIDOFY_DESKTOP_DATA_ROOT = Join-Path $m4Build 'm4-trial-data'
    & $m4Executable
} finally {
    $env:NIDOFY_DESKTOP_DATA_ROOT = $m4PriorDataRoot
}
