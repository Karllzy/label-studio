<#
.SYNOPSIS
Start the local Label Studio stack for this repository.

.DESCRIPTION
Optionally rebuilds frontend assets, starts the SAM3 ML backend if needed,
and then starts Label Studio using the repository's fixed-db script.

.PARAMETER BuildFrontend
Run frontend build and collectstatic before starting services.

.PARAMETER SkipMlBackend
Skip starting the SAM3 ML backend.

.PARAMETER MlPort
Port used to detect whether the SAM3 ML backend is already running.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File .\scripts\start_local_stack.ps1

.EXAMPLE
powershell -ExecutionPolicy Bypass -File .\scripts\start_local_stack.ps1 -BuildFrontend
#>
param(
    [switch]$BuildFrontend,
    [switch]$SkipMlBackend,
    [int]$MlPort = 9090
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuildScript = Join-Path $ScriptDir "build_frontend_and_collectstatic.ps1"
$MlScript = Join-Path $ScriptDir "start_sam3_ml_backend.ps1"
$AppScript = Join-Path $ScriptDir "start_label_studio_fixed_db.ps1"

function Test-PortListening {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Test-Sam3Health {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -Method Get -TimeoutSec 5
        return $response.status -eq "UP"
    }
    catch {
        return $false
    }
}

if ($BuildFrontend) {
    if (-not (Test-Path -LiteralPath $BuildScript)) {
        throw "Build script not found: $BuildScript"
    }

    Write-Host "Building frontend assets and collecting static files..."
    & powershell -ExecutionPolicy Bypass -File $BuildScript
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend build failed with exit code $LASTEXITCODE."
    }
}

if (-not $SkipMlBackend) {
    if (-not (Test-PortListening -Port $MlPort)) {
        if (-not (Test-Path -LiteralPath $MlScript)) {
            throw "ML backend start script not found: $MlScript"
        }

        Write-Host "Starting SAM3 ML backend..."
        & powershell -ExecutionPolicy Bypass -File $MlScript -Port $MlPort

        $deadline = (Get-Date).AddSeconds(20)
        do {
            Start-Sleep -Seconds 1
            $mlReady = Test-PortListening -Port $MlPort
        } while (-not $mlReady -and (Get-Date) -lt $deadline)

        if (-not $mlReady) {
            throw "SAM3 ML backend did not start listening on port $MlPort within 20 seconds."
        }
    }
    else {
        if (-not (Test-Sam3Health -Port $MlPort)) {
            throw "Port $MlPort is already in use, but it is not a healthy SAM3 backend."
        }
        Write-Host "SAM3 ML backend is already healthy on port $MlPort."
    }
}

if (-not (Test-Path -LiteralPath $AppScript)) {
    throw "Label Studio start script not found: $AppScript"
}

Write-Host "Starting Label Studio..."
& powershell -ExecutionPolicy Bypass -File $AppScript
