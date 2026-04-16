param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$SamScript = Join-Path $PSScriptRoot 'start_sam3_backend.ps1'
$AppScript = Join-Path $PSScriptRoot 'start_label_studio.ps1'

Start-Process powershell.exe -ArgumentList @(
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    $SamScript,
    '-InstallRoot',
    $InstallRoot
)

Start-Sleep -Seconds 3

& powershell.exe -ExecutionPolicy Bypass -File $AppScript -InstallRoot $InstallRoot
