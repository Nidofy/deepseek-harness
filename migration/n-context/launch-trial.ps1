# Isolated Notebook trial. The normal installation and previous M4 trial keep their own data.
$ErrorActionPreference = 'Stop'
$contextRepo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$contextBuild = Join-Path $contextRepo 'apps/desktop/.desktop-build'
$contextExecutable = Join-Path $contextBuild 'targets/win-x64/candidates/n-notes/personal-unsigned/win-unpacked/Nidofy DSH Desktop.exe'
if (-not (Test-Path -LiteralPath $contextExecutable -PathType Leaf)) { throw 'Build the Notebook candidate first.' }
$contextPreviousRoot = $env:NIDOFY_DESKTOP_DATA_ROOT
try {
    $env:NIDOFY_DESKTOP_DATA_ROOT = Join-Path $contextBuild 'n-context-trial-data'
    & $contextExecutable
} finally {
    $env:NIDOFY_DESKTOP_DATA_ROOT = $contextPreviousRoot
}
