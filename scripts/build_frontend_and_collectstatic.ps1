Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$WebDir = Join-Path $RepoRoot "web"
$ManagePy = Join-Path $RepoRoot "label_studio\manage.py"
$VenvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$NxCmd = Join-Path $WebDir "node_modules\.bin\nx.cmd"
$LocalEnv = Join-Path $ScriptDir "local.env"
$EnvLoader = Join-Path $ScriptDir "load_local_env.ps1"

if (Test-Path $EnvLoader) {
    . $EnvLoader
    Import-LocalEnv -EnvFile $LocalEnv
}

function Resolve-YarnRunner {
    $pathYarn = Get-Command yarn.cmd -ErrorAction SilentlyContinue

    if ($pathYarn) {
        return @{
            Command = $pathYarn.Source
            PrefixArgs = @()
            Description = $pathYarn.Source
        }
    }

    $fallbacks = @(
        "C:\Users\Administrator\AppData\Roaming\npm\yarn.cmd",
        "C:\Users\$env:USERNAME\AppData\Roaming\npm\yarn.cmd"
    )

    foreach ($candidate in $fallbacks) {
        if (Test-Path $candidate) {
            return @{
                Command = $candidate
                PrefixArgs = @()
                Description = $candidate
            }
        }
    }

    $corepack = Get-Command corepack.cmd -ErrorAction SilentlyContinue
    if ($corepack) {
        return @{
            Command = $corepack.Source
            PrefixArgs = @("yarn")
            Description = "$($corepack.Source) yarn"
        }
    }

    throw "yarn not found. Install Yarn or ensure corepack is available."
}

function Invoke-Yarn {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Runner,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & $Runner.Command @($Runner.PrefixArgs + $Arguments)
}

function Resolve-PythonExe {
    if (Test-Path $VenvPython) {
        return $VenvPython
    }

    $pathPython = Get-Command python.exe -ErrorAction SilentlyContinue

    if ($pathPython) {
        return $pathPython.Source
    }

    throw "python.exe not found, and project virtualenv is missing."
}

$YarnRunner = Resolve-YarnRunner
$PythonExe = Resolve-PythonExe

Write-Host "Repo root: $RepoRoot"
Write-Host "Yarn: $($YarnRunner.Description)"
Write-Host "Python: $PythonExe"
Write-Host "NX: $NxCmd"
Write-Host "BASE_DATA_DIR: $env:BASE_DATA_DIR"
Write-Host "DATABASE_NAME: $env:DATABASE_NAME"

Write-Host "=> Building frontend in web/"
Push-Location $WebDir
try {
    if (Test-Path $NxCmd) {
        Write-Host "=> Running: $NxCmd run labelstudio:build:production"
        & $NxCmd run labelstudio:build:production
    }
    else {
        Write-Host "=> Running: $($YarnRunner.Description) ls:build"
        Invoke-Yarn -Runner $YarnRunner -Arguments @("ls:build")
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Frontend build failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

Write-Host "=> Collecting Django static files"
& $PythonExe $ManagePy collectstatic --no-input

if ($LASTEXITCODE -ne 0) {
    throw "collectstatic failed with exit code $LASTEXITCODE."
}

Write-Host "=> Done"
