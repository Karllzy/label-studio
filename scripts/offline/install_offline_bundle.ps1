param(
    [Parameter(Mandatory = $true)]
    [string]$InstallRoot,
    [ValidateSet('cpu', 'gpu')]
    [string]$Sam3RuntimeVariant = 'gpu'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

function Get-RegisteredPythonExe {
    foreach ($registryPath in @(
        'HKCU:\Software\Python\PythonCore\3.12\InstallPath',
        'HKLM:\Software\Python\PythonCore\3.12\InstallPath'
    )) {
        $installPath = (Get-ItemProperty -Path $registryPath -ErrorAction SilentlyContinue).'(default)'
        if (-not $installPath) {
            continue
        }

        $pythonExe = Join-Path $installPath 'python.exe'
        if (Test-Path -LiteralPath $pythonExe) {
            return $pythonExe
        }
    }

    return $null
}

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
    $RegisteredPythonExe = Get-RegisteredPythonExe
    if ($RegisteredPythonExe) {
        $RegisteredPythonRoot = Split-Path -Parent $RegisteredPythonExe
        Write-Host "Python installer reused an existing installation: $RegisteredPythonRoot"
        Write-Host "Copying existing Python runtime into install root..."
        Copy-TreeRobust `
            -Source $RegisteredPythonRoot `
            -Destination $PythonRoot `
            -ExcludeDirs @('__pycache__') `
            -ExcludeFiles @('*.pyc', '*.pyo')
    }
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
$Sam3VariantWheelhouse = if ($Sam3RuntimeVariant -eq 'cpu') {
    Join-Path $Sam3Wheelhouse 'cpu'
} else {
    Join-Path $Sam3Wheelhouse 'gpu'
}

Write-Host 'Bootstrapping app environment...'
& $AppPython -m pip install --no-index --find-links $AppWheelhouse pip setuptools wheel build
if ($LASTEXITCODE -ne 0) { throw 'Failed to install app bootstrap packages.' }
& $AppPython -m pip install --no-index --find-links $AppWheelhouse -r (Join-Path $BundleRoot $Manifest.app_requirements)
if ($LASTEXITCODE -ne 0) { throw 'Failed to install application dependencies.' }
& $AppPython -m pip install --no-deps (Join-Path $BundleRoot "packages\label_studio_app\$($Manifest.app_wheel)")
if ($LASTEXITCODE -ne 0) { throw 'Failed to install Label Studio application wheel.' }

Write-Host 'Bootstrapping SAM3 environment...'
& $Sam3Python -m pip install --no-index --find-links $Sam3Wheelhouse pip setuptools wheel build
if ($LASTEXITCODE -ne 0) { throw 'Failed to install SAM3 bootstrap packages.' }

if (-not (Test-Path -LiteralPath $Sam3VariantWheelhouse)) {
    throw "Selected SAM3 torch wheelhouse not found: $Sam3VariantWheelhouse"
}

$TorchWheel = Get-ChildItem -LiteralPath $Sam3VariantWheelhouse -Filter 'torch-*.whl' | Sort-Object Name -Descending | Select-Object -First 1
$TorchVisionWheel = Get-ChildItem -LiteralPath $Sam3VariantWheelhouse -Filter 'torchvision-*.whl' | Sort-Object Name -Descending | Select-Object -First 1
if (-not $TorchWheel -or -not $TorchVisionWheel) {
    throw "Selected SAM3 torch wheels are missing from: $Sam3VariantWheelhouse"
}

Write-Host "Installing selected SAM3 torch runtime variant: $Sam3RuntimeVariant"
& $Sam3Python -m pip install --no-deps --force-reinstall $TorchWheel.FullName $TorchVisionWheel.FullName
if ($LASTEXITCODE -ne 0) { throw "Failed to install selected SAM3 torch runtime: $Sam3RuntimeVariant" }

& $Sam3Python -m pip install --no-index --find-links $Sam3Wheelhouse -r (Join-Path $BundleRoot $Manifest.sam3_requirements)
if ($LASTEXITCODE -ne 0) { throw 'Failed to install SAM3 runtime dependencies.' }
& $Sam3Python -m pip install --no-deps (Join-Path $BundleRoot "packages\sam3_local_backend\$($Manifest.sam3_backend_wheel)")
if ($LASTEXITCODE -ne 0) { throw 'Failed to install SAM3 backend wheel.' }

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

$env:SAM3_REPO_DIR = Join-Path $InstallRoot 'packages\sam3_source'
$env:SAM3_CHECKPOINT_PATH = Join-Path $InstallRoot "models\$($Manifest.sam3_checkpoint)"
$env:LABEL_STUDIO_BASE_DATA_DIR = Join-Path $InstallRoot 'data\label-studio'
$env:SAM3_LOG_DIR = Join-Path $InstallRoot 'logs\sam3'

$AppEnvExample = Join-Path $BundleRoot 'scripts\app.env.example'
$Sam3EnvExample = Join-Path $BundleRoot 'scripts\sam3.env.example'
$AppEnv = Join-Path $InstallRoot 'config\app.env'
$Sam3Env = Join-Path $InstallRoot 'config\sam3.env'

if (-not (Test-Path -LiteralPath $AppEnv)) {
    (Get-Content -LiteralPath $AppEnvExample -Raw).Replace('__INSTALL_ROOT__', $InstallRoot) | Set-Content -LiteralPath $AppEnv -Encoding UTF8
}
if (-not (Test-Path -LiteralPath $Sam3Env)) {
    (
        (Get-Content -LiteralPath $Sam3EnvExample -Raw).
            Replace('__INSTALL_ROOT__', $InstallRoot).
            Replace('__SAM3_CHECKPOINT__', $Manifest.sam3_checkpoint)
    ) | Set-Content -LiteralPath $Sam3Env -Encoding UTF8
}

foreach ($artifact in @('common.ps1', 'reset_default_admin.ps1', 'start_label_studio.ps1', 'start_sam3_backend.ps1', 'start_all.ps1', 'start_local_stack.ps1', 'healthcheck.ps1', 'post_install_selfcheck.ps1')) {
    Copy-Item -LiteralPath (Join-Path $BundleRoot "scripts\$artifact") -Destination (Join-Path $InstallRoot 'scripts') -Force
}

Write-Host 'Validating imports...'
& $AppPython -c "import label_studio; print(label_studio.__file__)"
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to validate label_studio import in app environment.'
}
& $Sam3Python -c "import sam3_local_backend; print(sam3_local_backend.__file__)"
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to validate sam3_local_backend import in SAM3 environment.'
}
& $Sam3Python -c "import os, sys; sys.path.insert(0, os.environ['SAM3_REPO_DIR']); import torchvision, triton, timm, iopath, huggingface_hub, ftfy, regex, einops, pycocotools; from sam3.model.sam3_image_processor import Sam3Processor; print(Sam3Processor.__module__)"
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to validate SAM3 runtime imports in SAM3 environment.'
}
if ($Sam3RuntimeVariant -eq 'cpu') {
    & $Sam3Python -c "import torch; import sys; sys.exit(0 if torch.version.cuda is None else 1)"
    if ($LASTEXITCODE -ne 0) {
        throw 'CPU variant selected, but installed torch reports a CUDA runtime.'
    }
} else {
    & $Sam3Python -c "import torch; import sys; sys.exit(0 if torch.version.cuda else 1)"
    if ($LASTEXITCODE -ne 0) {
        throw 'GPU variant selected, but installed torch does not report a CUDA runtime.'
    }
}

Write-Host "Offline installation complete: $InstallRoot"
Write-Host "Start services with:"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$InstallRoot\scripts\start_all.ps1`""
