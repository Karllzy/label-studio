param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$EnvFile,
    [int]$Port = 9090
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

if (-not $EnvFile) {
    $EnvFile = Join-Path $InstallRoot 'config\sam3.env'
}

Import-EnvFile -EnvFile $EnvFile

$PythonExe = Join-Path $InstallRoot 'venvs\sam3\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "SAM3 Python not found: $PythonExe"
}

if (-not $env:SAM3_REPO_DIR) {
    $env:SAM3_REPO_DIR = Join-Path $InstallRoot 'packages\sam3_source'
}
if (-not $env:SAM3_CHECKPOINT_PATH) {
    $env:SAM3_CHECKPOINT_PATH = Join-Path $InstallRoot 'models\sam3.1_multiplex.pt'
}
$env:SAM3_ML_PORT = "$Port"
if (-not $env:LABEL_STUDIO_BASE_DATA_DIR) {
    $env:LABEL_STUDIO_BASE_DATA_DIR = Join-Path $InstallRoot 'data\label-studio'
}
if (-not $env:SAM3_LOG_DIR) {
    $env:SAM3_LOG_DIR = Join-Path $InstallRoot 'logs\sam3'
}

Ensure-Directory -Path $env:SAM3_LOG_DIR

Write-Host "Starting SAM3 backend on http://127.0.0.1:$($env:SAM3_ML_PORT)"
Write-Host "SAM3_REPO_DIR: $($env:SAM3_REPO_DIR)"
Write-Host "SAM3_CHECKPOINT_PATH: $($env:SAM3_CHECKPOINT_PATH)"

& $PythonExe -m sam3_local_backend
