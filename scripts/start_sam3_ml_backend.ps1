param(
    [int]$Port = 9090,
    [string]$PythonExe,
    [string]$Sam3Repo,
    [string]$BaseDataDir,
    [string]$CheckpointPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "ml_backends\sam3_local_backend"
$LocalEnv = Join-Path $PSScriptRoot "local.env"
$EnvLoader = Join-Path $PSScriptRoot "load_local_env.ps1"
$WarmupTimeoutSeconds = 120
$StdoutLogPath = Join-Path $BackendDir "sam3_ml_backend.stdout.log"
$StderrLogPath = Join-Path $BackendDir "sam3_ml_backend.stderr.log"

if (Test-Path -LiteralPath $EnvLoader) {
    . $EnvLoader
    Import-LocalEnv -EnvFile $LocalEnv
}

if (-not $PythonExe) {
    $PythonExe = if ($env:SAM3_PYTHON_EXE) {
        $env:SAM3_PYTHON_EXE
    } else {
        Join-Path (Split-Path -Parent $RepoRoot) "sam3\.venv\Scripts\python.exe"
    }
}
if (-not $Sam3Repo) {
    $Sam3Repo = if ($env:SAM3_REPO_DIR) {
        $env:SAM3_REPO_DIR
    } else {
        Join-Path (Split-Path -Parent $RepoRoot) "sam3"
    }
}
if (-not $BaseDataDir) {
    $BaseDataDir = if ($env:LABEL_STUDIO_BASE_DATA_DIR) {
        $env:LABEL_STUDIO_BASE_DATA_DIR
    } elseif ($env:BASE_DATA_DIR) {
        $env:BASE_DATA_DIR
    } else {
        Join-Path $env:LOCALAPPDATA "label-studio\label-studio"
    }
}
if (-not $CheckpointPath) {
    $CheckpointPath = if ($env:SAM3_CHECKPOINT_PATH) {
        $env:SAM3_CHECKPOINT_PATH
    } else {
        Join-Path $env:USERPROFILE ".cache\modelscope\hub\models\facebook\sam3___1\sam3.1_multiplex.pt"
    }
}

if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "SAM3 Python not found: $PythonExe"
}
if (-not (Test-Path -LiteralPath $Sam3Repo)) {
    throw "SAM3 repository not found: $Sam3Repo"
}
if (-not (Test-Path -LiteralPath $CheckpointPath)) {
    throw "SAM3 checkpoint not found: $CheckpointPath"
}
if (-not (Test-Path -LiteralPath $BackendDir)) {
    throw "Backend directory not found: $BackendDir"
}

$env:PYTHONIOENCODING = "utf-8"
$env:LABEL_STUDIO_BASE_DATA_DIR = $BaseDataDir
$env:SAM3_REPO_DIR = $Sam3Repo
$env:SAM3_CHECKPOINT_PATH = $CheckpointPath
$env:SAM3_ML_PORT = "$Port"

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
            if ($response.status -eq "UP") {
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
        project = "sam3-warmup"
        schema = '<View><Image name="image" value="$image"/><RectangleLabels name="label" toName="image"><Label value="Object"/></RectangleLabels></View>'
        hostname = "http://127.0.0.1:8080"
        access_token = "warmup"
        extra_params = $null
    } | ConvertTo-Json -Depth 5

    Write-Host "Prewarming SAM3 model..."
    Invoke-RestMethod `
        -Uri "http://127.0.0.1:$Port/setup" `
        -Method Post `
        -ContentType "application/json" `
        -Body $payload `
        -TimeoutSec $TimeoutSeconds | Out-Null
}

Write-Host "Starting SAM3 ML backend on http://127.0.0.1:$Port"
Write-Host "Stdout log: $StdoutLogPath"
Write-Host "Stderr log: $StderrLogPath"

Start-Process `
    -FilePath $PythonExe `
    -ArgumentList "server.py" `
    -WorkingDirectory $BackendDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $StdoutLogPath `
    -RedirectStandardError $StderrLogPath

if (-not (Wait-Sam3Health -Port $Port -TimeoutSeconds 20)) {
    throw "SAM3 ML backend did not report healthy within 20 seconds."
}

Invoke-Sam3Warmup -Port $Port -TimeoutSeconds $WarmupTimeoutSeconds
Write-Host "SAM3 ML backend is ready."
