# Launch the complete candidate with a separate personal data root.
$ErrorActionPreference = 'Stop'
$m3Repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$m3Build = Join-Path $m3Repository 'apps/desktop/.desktop-build'
$m3Executable = Join-Path $m3Build 'targets/win-x64/candidates/m3/personal-unsigned/win-unpacked/Nidofy DSH Desktop.exe'
if (-not (Test-Path -LiteralPath $m3Executable -PathType Leaf)) { throw 'Build the M3 candidate before launching this trial.' }
$m3PriorDataRoot = $env:NIDOFY_DESKTOP_DATA_ROOT
try {
    $env:NIDOFY_DESKTOP_DATA_ROOT = Join-Path $m3Build 'm3-trial-data'
    & $m3Executable
} finally {
    $env:NIDOFY_DESKTOP_DATA_ROOT = $m3PriorDataRoot
}
