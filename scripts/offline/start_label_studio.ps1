param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$EnvFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

if (-not $EnvFile) {
    $EnvFile = Join-Path $InstallRoot 'config\app.env'
}

Import-EnvFile -EnvFile $EnvFile

$LabelStudioExe = Join-Path $InstallRoot 'venvs\app\Scripts\label-studio.exe'
if (-not (Test-Path -LiteralPath $LabelStudioExe)) {
    throw "Label Studio executable not found: $LabelStudioExe"
}

if (-not $env:BASE_DATA_DIR) {
    $env:BASE_DATA_DIR = Join-Path $InstallRoot 'data\label-studio'
}
if (-not $env:DATABASE_NAME) {
    $env:DATABASE_NAME = Join-Path $env:BASE_DATA_DIR 'label_studio.sqlite3'
}
if (-not $env:HOST) {
    $env:HOST = '127.0.0.1'
}
if (-not $env:PORT) {
    $env:PORT = '8080'
}

Ensure-Directory -Path $env:BASE_DATA_DIR

Write-Host "Starting Label Studio on http://$($env:HOST):$($env:PORT)"
Write-Host "BASE_DATA_DIR: $($env:BASE_DATA_DIR)"
Write-Host "DATABASE_NAME: $($env:DATABASE_NAME)"

& $LabelStudioExe start --host $env:HOST --port $env:PORT --no-browser
