param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$StackScript = Join-Path $PSScriptRoot 'start_local_stack.ps1'

& powershell.exe -ExecutionPolicy Bypass -File $StackScript -InstallRoot $InstallRoot
