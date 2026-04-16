Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$DjangoRoot = Join-Path $RepoRoot "label_studio"
$VenvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$LocalEnv = Join-Path $ScriptDir "local.env"
$EnvLoader = Join-Path $ScriptDir "load_local_env.ps1"

if (Test-Path $EnvLoader) {
    . $EnvLoader
    Import-LocalEnv -EnvFile $LocalEnv
}

if (-not (Test-Path $VenvPython)) {
    throw "python.exe not found in .venv\Scripts\python.exe"
}

Write-Host "Repo root: $RepoRoot"
Write-Host "Django root: $DjangoRoot"
Write-Host "Python: $VenvPython"
Write-Host "BASE_DATA_DIR: $env:BASE_DATA_DIR"
Write-Host "DATABASE_NAME: $env:DATABASE_NAME"

Push-Location $DjangoRoot
try {
    & $VenvPython server.py start --no-browser

    if ($LASTEXITCODE -ne 0) {
        throw "Label Studio start failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
