<#
.SYNOPSIS
Start the offline Label Studio stack.

.DESCRIPTION
Starts the SAM3 backend if it is not already listening, waits for it to become
available, and then starts Label Studio from the offline install root.

.PARAMETER InstallRoot
Offline install root containing config, scripts, venvs, data, and packages.

.PARAMETER SkipMlBackend
Skip starting the SAM3 backend.

.PARAMETER MlPort
Port used to detect whether the SAM3 backend is already running.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File .\scripts\start_local_stack.ps1 -InstallRoot D:\LSOffline
#>
param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$SkipMlBackend,
    [int]$MlPort = 9090
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$SamScript = Join-Path $PSScriptRoot 'start_sam3_backend.ps1'
$AppScript = Join-Path $PSScriptRoot 'start_label_studio.ps1'
$WarmupTimeoutSeconds = 120

function Test-PortListening {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Wait-Sam3Health {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port,
        [Parameter(Mandatory = $true)]
        [int]$TimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -Method Get -TimeoutSec 5
            if ($response.status -eq 'UP') {
                return $true
            }
        }
        catch {
        }

        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)

    return $false
}

function Invoke-Sam3Warmup {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port,
        [Parameter(Mandatory = $true)]
        [int]$TimeoutSeconds
    )

    $payload = @{
        project = 'sam3-warmup'
        schema = '<View><Image name="image" value="$image"/><RectangleLabels name="label" toName="image"><Label value="Object"/></RectangleLabels></View>'
        hostname = 'http://127.0.0.1:8080'
        access_token = 'warmup'
        extra_params = $null
    } | ConvertTo-Json -Depth 5

    Write-Host 'Prewarming SAM3 model...'
    Invoke-RestMethod `
        -Uri "http://127.0.0.1:$Port/setup" `
        -Method Post `
        -ContentType 'application/json' `
        -Body $payload `
        -TimeoutSec $TimeoutSeconds | Out-Null
}

if (-not $SkipMlBackend) {
    if (-not (Test-PortListening -Port $MlPort)) {
        Write-Host "Starting SAM3 backend on port $MlPort..."
        Start-Process powershell.exe -ArgumentList @(
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            $SamScript,
            '-InstallRoot',
            $InstallRoot,
            '-Port',
            "$MlPort"
        ) -WindowStyle Hidden

        $deadline = (Get-Date).AddSeconds(20)
        do {
            Start-Sleep -Seconds 1
            $mlReady = Test-PortListening -Port $MlPort
        } while (-not $mlReady -and (Get-Date) -lt $deadline)

        if (-not $mlReady) {
            throw "SAM3 backend did not start listening on port $MlPort within 20 seconds."
        }
    }
    else {
        if (-not (Wait-Sam3Health -Port $MlPort -TimeoutSeconds 5)) {
            throw "Port $MlPort is already in use, but it is not a healthy SAM3 backend."
        }
        Write-Host "SAM3 backend is already healthy on port $MlPort."
    }

    if (-not (Wait-Sam3Health -Port $MlPort -TimeoutSeconds 20)) {
        throw "SAM3 backend did not report healthy on port $MlPort within 20 seconds."
    }

    Invoke-Sam3Warmup -Port $MlPort -TimeoutSeconds $WarmupTimeoutSeconds
}

Write-Host 'Starting Label Studio...'
& powershell.exe -ExecutionPolicy Bypass -File $AppScript -InstallRoot $InstallRoot
