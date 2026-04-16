$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "ml_backends\\sam3_local_backend"
$PythonExe = "C:\Users\Administrator\Developer\sam3\.venv\Scripts\python.exe"
$Sam3Repo = "C:\Users\Administrator\Developer\sam3"
$BaseDataDir = "C:\Users\Administrator\AppData\Local\label-studio\label-studio"
$CheckpointPath = "C:\Users\Administrator\.cache\modelscope\hub\models\facebook\sam3___1\sam3.1_multiplex.pt"
$Port = 9090
$StdoutLogPath = Join-Path $BackendDir "sam3_ml_backend.stdout.log"
$StderrLogPath = Join-Path $BackendDir "sam3_ml_backend.stderr.log"

if (!(Test-Path $PythonExe)) {
    throw "SAM3 Python not found: $PythonExe"
}

if (!(Test-Path $CheckpointPath)) {
    throw "SAM3 checkpoint not found: $CheckpointPath"
}

if (!(Test-Path $BackendDir)) {
    throw "Backend directory not found: $BackendDir"
}

$env:PYTHONIOENCODING = "utf-8"
$env:LABEL_STUDIO_BASE_DATA_DIR = $BaseDataDir
$env:SAM3_REPO_DIR = $Sam3Repo
$env:SAM3_CHECKPOINT_PATH = $CheckpointPath
$env:SAM3_ML_PORT = "$Port"

Write-Host "Starting SAM3 ML backend on http://127.0.0.1:$Port"
Write-Host "Stdout log: $StdoutLogPath"
Write-Host "Stderr log: $StderrLogPath"

Start-Process `
  -FilePath $PythonExe `
  -ArgumentList "server.py" `
  -WorkingDirectory $BackendDir `
  -RedirectStandardOutput $StdoutLogPath `
  -RedirectStandardError $StderrLogPath

Write-Host "SAM3 ML backend launch requested."
