param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

$AppEnv = Join-Path $InstallRoot 'config\app.env'
$SamEnv = Join-Path $InstallRoot 'config\sam3.env'

Import-EnvFile -EnvFile $AppEnv
Import-EnvFile -EnvFile $SamEnv

$labelStudioPort = if ($env:PORT) { $env:PORT } else { '8080' }
$sam3Port = if ($env:SAM3_ML_PORT) { $env:SAM3_ML_PORT } else { '9090' }

$sam3 = Invoke-RestMethod -Uri "http://127.0.0.1:$sam3Port/health" -TimeoutSec 10
$labelStudio = Invoke-WebRequest -Uri "http://127.0.0.1:$labelStudioPort/" -TimeoutSec 10

Write-Host "SAM3 status: $($sam3.status)"
Write-Host "SAM3 model_version: $($sam3.model_version)"
Write-Host "Label Studio HTTP status: $($labelStudio.StatusCode)"
