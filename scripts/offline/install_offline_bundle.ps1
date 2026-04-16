param(
    [Parameter(Mandatory = $true)]
    [string]$InstallRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

$BundleRoot = Split-Path -Parent $PSScriptRoot
$ManifestPath = Join-Path $BundleRoot 'manifest.json'
if (-not (Test-Path -LiteralPath $ManifestPath)) {
    throw "Bundle manifest not found: $ManifestPath"
}

$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json

Ensure-Directory -Path $InstallRoot
Ensure-Directory -Path (Join-Path $InstallRoot 'runtime')
Ensure-Directory -Path (Join-Path $InstallRoot 'venvs')
Ensure-Directory -Path (Join-Path $InstallRoot 'packages')
Ensure-Directory -Path (Join-Path $InstallRoot 'config')
Ensure-Directory -Path (Join-Path $InstallRoot 'models')
Ensure-Directory -Path (Join-Path $InstallRoot 'logs\sam3')
Ensure-Directory -Path (Join-Path $InstallRoot 'data\label-studio')
Ensure-Directory -Path (Join-Path $InstallRoot 'scripts')

$VcInstallerName = $Manifest.vc_redist_installer
if ($VcInstallerName) {
    $VcInstallerPath = Join-Path $BundleRoot "installers\$VcInstallerName"
    if (Test-Path -LiteralPath $VcInstallerPath) {
        Write-Host 'Installing VC++ runtime...'
        Start-Process -FilePath $VcInstallerPath -ArgumentList @('/install', '/quiet', '/norestart') -Wait
    }
}

$PythonRoot = Join-Path $InstallRoot 'runtime\python'
$PythonExe = Join-Path $PythonRoot 'python.exe'
if (-not (Test-Path -LiteralPath $PythonExe)) {
    $PythonInstaller = Join-Path $BundleRoot "installers\$($Manifest.python_installer)"
    if (-not (Test-Path -LiteralPath $PythonInstaller)) {
        throw "Python installer not found in bundle: $PythonInstaller"
    }

    Write-Host 'Installing Python runtime...'
    Start-Process -FilePath $PythonInstaller -ArgumentList @(
        '/quiet',
        'InstallAllUsers=0',
        'Include_pip=1',
        'Include_test=0',
        'SimpleInstall=1',
        'PrependPath=0',
        "TargetDir=$PythonRoot"
    ) -Wait
}

if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "Python runtime not found after installer completed: $PythonExe"
}

$AppVenv = Join-Path $InstallRoot 'venvs\app'
$Sam3Venv = Join-Path $InstallRoot 'venvs\sam3'
if (-not (Test-Path -LiteralPath (Join-Path $AppVenv 'Scripts\python.exe'))) {
    & $PythonExe -m venv $AppVenv
}
if (-not (Test-Path -LiteralPath (Join-Path $Sam3Venv 'Scripts\python.exe'))) {
    & $PythonExe -m venv $Sam3Venv
}

$AppPython = Join-Path $AppVenv 'Scripts\python.exe'
$Sam3Python = Join-Path $Sam3Venv 'Scripts\python.exe'
$AppWheelhouse = Join-Path $BundleRoot 'wheels\app'
$Sam3Wheelhouse = Join-Path $BundleRoot 'wheels\sam3'

Write-Host 'Bootstrapping app environment...'
& $AppPython -m pip install --no-index --find-links $AppWheelhouse pip setuptools wheel build
& $AppPython -m pip install --no-index --find-links $AppWheelhouse -r (Join-Path $BundleRoot $Manifest.app_requirements)
& $AppPython -m pip install --no-deps (Join-Path $BundleRoot "packages\label_studio_app\$($Manifest.app_wheel)")

Write-Host 'Bootstrapping SAM3 environment...'
& $Sam3Python -m pip install --no-index --find-links $Sam3Wheelhouse pip setuptools wheel build
& $Sam3Python -m pip install --no-index --find-links $Sam3Wheelhouse -r (Join-Path $BundleRoot $Manifest.sam3_requirements)
& $Sam3Python -m pip install --no-deps (Join-Path $BundleRoot "packages\sam3_local_backend\$($Manifest.sam3_backend_wheel)")

Write-Host 'Copying SAM3 source and checkpoint into install root...'
Copy-TreeRobust `
    -Source (Join-Path $BundleRoot 'packages\sam3_source') `
    -Destination (Join-Path $InstallRoot 'packages\sam3_source') `
    -ExcludeDirs @('__pycache__') `
    -ExcludeFiles @('*.pyc', '*.pyo')
Copy-Item `
    -LiteralPath (Join-Path $BundleRoot "models\$($Manifest.sam3_checkpoint)") `
    -Destination (Join-Path $InstallRoot "models\$($Manifest.sam3_checkpoint)") `
    -Force

$AppEnvExample = Join-Path $BundleRoot 'scripts\app.env.example'
$Sam3EnvExample = Join-Path $BundleRoot 'scripts\sam3.env.example'
$AppEnv = Join-Path $InstallRoot 'config\app.env'
$Sam3Env = Join-Path $InstallRoot 'config\sam3.env'

if (-not (Test-Path -LiteralPath $AppEnv)) {
    (Get-Content -LiteralPath $AppEnvExample -Raw).Replace('__INSTALL_ROOT__', $InstallRoot) | Set-Content -LiteralPath $AppEnv -Encoding UTF8
}
if (-not (Test-Path -LiteralPath $Sam3Env)) {
    (Get-Content -LiteralPath $Sam3EnvExample -Raw).Replace('__INSTALL_ROOT__', $InstallRoot) | Set-Content -LiteralPath $Sam3Env -Encoding UTF8
}

foreach ($artifact in @('common.ps1', 'start_label_studio.ps1', 'start_sam3_backend.ps1', 'start_all.ps1', 'healthcheck.ps1')) {
    Copy-Item -LiteralPath (Join-Path $BundleRoot "scripts\$artifact") -Destination (Join-Path $InstallRoot 'scripts') -Force
}

Write-Host 'Validating imports...'
& $AppPython -c "import label_studio; print(label_studio.__file__)"
& $Sam3Python -c "import sam3_local_backend; print(sam3_local_backend.__file__)"

Write-Host "Offline installation complete: $InstallRoot"
Write-Host "Start services with:"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$InstallRoot\scripts\start_all.ps1`""
