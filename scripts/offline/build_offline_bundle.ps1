param(
    [Parameter(Mandatory = $true)]
    [string]$BundleOutputDir,
    [Parameter(Mandatory = $true)]
    [string]$PythonInstallerPath,
    [string]$VCRedistInstallerPath,
    [Parameter(Mandatory = $true)]
    [string]$Sam3SourceDir,
    [Parameter(Mandatory = $true)]
    [string]$Sam3CheckpointPath,
    [string]$AppPythonExe,
    [string]$Sam3RequirementsPath,
    [ValidateSet('cu126', 'cu128', 'cu130')]
    [string]$Sam3GpuTorchPlatform = 'cu126',
    [string]$Sam3CpuTorchIndexUrl,
    [string]$Sam3GpuTorchIndexUrl,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

if (-not $Sam3RequirementsPath) {
    $Sam3RequirementsPath = Join-Path $PSScriptRoot 'sam3.requirements.txt'
}
if (-not $Sam3CpuTorchIndexUrl) {
    $Sam3CpuTorchIndexUrl = 'https://download.pytorch.org/whl/cpu'
}
if (-not $Sam3GpuTorchIndexUrl) {
    $Sam3GpuTorchIndexUrl = "https://download.pytorch.org/whl/$Sam3GpuTorchPlatform"
}

$RepoRoot = Resolve-RepoRoot -ScriptPath $PSScriptRoot
if (-not $AppPythonExe) {
    $AppPythonExe = Join-Path $RepoRoot '.venv\Scripts\python.exe'
}

foreach ($requiredPath in @($PythonInstallerPath, $Sam3SourceDir, $Sam3CheckpointPath, $AppPythonExe, $Sam3RequirementsPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required path not found: $requiredPath"
    }
}

if ((Test-Path -LiteralPath $BundleOutputDir) -and -not $Force) {
    throw "Bundle output already exists: $BundleOutputDir. Use -Force to replace it."
}

if ($Force) {
    Remove-DirectoryIfExists -Path $BundleOutputDir
}

$bundleDirs = @(
    $BundleOutputDir,
    (Join-Path $BundleOutputDir 'installers'),
    (Join-Path $BundleOutputDir 'wheels\app'),
    (Join-Path $BundleOutputDir 'wheels\sam3'),
    (Join-Path $BundleOutputDir 'wheels\sam3\cpu'),
    (Join-Path $BundleOutputDir 'wheels\sam3\gpu'),
    (Join-Path $BundleOutputDir 'packages\label_studio_app'),
    (Join-Path $BundleOutputDir 'packages\sam3_local_backend'),
    (Join-Path $BundleOutputDir 'packages\sam3_source'),
    (Join-Path $BundleOutputDir 'models'),
    (Join-Path $BundleOutputDir 'requirements'),
    (Join-Path $BundleOutputDir 'scripts')
)
foreach ($dir in $bundleDirs) {
    Ensure-Directory -Path $dir
}

Copy-Item -LiteralPath $PythonInstallerPath -Destination (Join-Path $BundleOutputDir "installers\$(Split-Path -Leaf $PythonInstallerPath)") -Force
if ($VCRedistInstallerPath) {
    if (-not (Test-Path -LiteralPath $VCRedistInstallerPath)) {
        throw "VC++ runtime installer not found: $VCRedistInstallerPath"
    }
    Copy-Item -LiteralPath $VCRedistInstallerPath -Destination (Join-Path $BundleOutputDir "installers\$(Split-Path -Leaf $VCRedistInstallerPath)") -Force
}

$tempRoot = Join-Path $BundleOutputDir '.build-tmp'
Ensure-Directory -Path $tempRoot
$appWheelDir = Join-Path $tempRoot 'app-wheel'
$backendWheelDir = Join-Path $tempRoot 'sam3-backend-wheel'
Ensure-Directory -Path $appWheelDir
Ensure-Directory -Path $backendWheelDir

Write-Host 'Building label-studio wheel...'
& $AppPythonExe -m build --wheel --outdir $appWheelDir $RepoRoot
if ($LASTEXITCODE -ne 0) {
    throw "Failed to build label-studio wheel."
}

Write-Host 'Building sam3-local-backend wheel...'
& $AppPythonExe -m build --wheel --outdir $backendWheelDir (Join-Path $RepoRoot 'ml_backends\sam3_local_backend')
if ($LASTEXITCODE -ne 0) {
    throw "Failed to build sam3-local-backend wheel."
}

$appWheel = Get-ChildItem -LiteralPath $appWheelDir -Filter '*.whl' | Select-Object -First 1
$backendWheel = Get-ChildItem -LiteralPath $backendWheelDir -Filter '*.whl' | Select-Object -First 1
if (-not $appWheel) {
    throw 'Built label-studio wheel not found.'
}
if (-not $backendWheel) {
    throw 'Built sam3-local-backend wheel not found.'
}

Copy-Item -LiteralPath $appWheel.FullName -Destination (Join-Path $BundleOutputDir 'packages\label_studio_app') -Force
Copy-Item -LiteralPath $backendWheel.FullName -Destination (Join-Path $BundleOutputDir 'packages\sam3_local_backend') -Force

$projectDeps = Get-OfflineDependenciesFromPyProject -PyProjectPath (Join-Path $RepoRoot 'pyproject.toml')
$directUrlDeps = @()
$normalDeps = @()
foreach ($dep in $projectDeps) {
    if ($dep -match ' @ https?://') {
        $directUrlDeps += $dep
    } else {
        $normalDeps += $dep
    }
}

$appRequirementsPath = Join-Path $BundleOutputDir 'requirements\app-offline.txt'
$appRequirementLines = @($normalDeps)
foreach ($dep in $directUrlDeps) {
    $packageName = ($dep -split '@', 2)[0].Trim()
    if ($packageName) {
        $appRequirementLines += $packageName
    }
}
Write-Utf8NoBom -Path $appRequirementsPath -Lines $appRequirementLines

$sam3OfflineRequirementsPath = Join-Path $BundleOutputDir 'requirements\sam3-offline.txt'
$sam3RequirementLines = Get-Content -LiteralPath $Sam3RequirementsPath
$sam3NonTorchRequirements = @(
    $sam3RequirementLines | Where-Object {
        $trimmed = $_.Trim()
        if (-not $trimmed) { return $false }
        if ($trimmed.StartsWith('#')) { return $true }
        return -not ($trimmed -match '^(torch|torchvision)([<>=!~ ].*)?$')
    }
)
$sam3NonTorchRequirementsPath = Join-Path $tempRoot 'sam3-non-torch.requirements.txt'
[System.IO.File]::WriteAllLines($sam3NonTorchRequirementsPath, $sam3NonTorchRequirements, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllLines($sam3OfflineRequirementsPath, $sam3NonTorchRequirements, (New-Object System.Text.UTF8Encoding($false)))

$bootstrapPackages = @('pip', 'setuptools', 'wheel', 'build')

Write-Host 'Downloading bootstrap packages for app environment...'
& $AppPythonExe -m pip download --dest (Join-Path $BundleOutputDir 'wheels\app') @bootstrapPackages
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to download bootstrap packages for app environment.'
}

Write-Host 'Downloading application dependency wheels...'
& $AppPythonExe -m pip download --dest (Join-Path $BundleOutputDir 'wheels\app') -r $appRequirementsPath
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to download app dependency wheels.'
}

foreach ($dep in $directUrlDeps) {
    Write-Host "Building wheel for direct dependency: $dep"
    & $AppPythonExe -m pip wheel --wheel-dir (Join-Path $BundleOutputDir 'wheels\app') $dep
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to build wheel for direct dependency: $dep"
    }
}

Write-Host 'Downloading bootstrap packages for SAM3 environment...'
& $AppPythonExe -m pip download --dest (Join-Path $BundleOutputDir 'wheels\sam3') @bootstrapPackages
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to download bootstrap packages for SAM3 environment.'
}

Write-Host "Downloading CPU PyTorch wheels for SAM3 environment from $Sam3CpuTorchIndexUrl..."
& $AppPythonExe -m pip download --dest (Join-Path $BundleOutputDir 'wheels\sam3\cpu') --index-url $Sam3CpuTorchIndexUrl torch torchvision
if ($LASTEXITCODE -ne 0) {
    throw "Failed to download CPU torch/torchvision wheels from $Sam3CpuTorchIndexUrl."
}

Write-Host "Downloading GPU PyTorch wheels for SAM3 environment from $Sam3GpuTorchIndexUrl..."
& $AppPythonExe -m pip download --dest (Join-Path $BundleOutputDir 'wheels\sam3\gpu') --index-url $Sam3GpuTorchIndexUrl torch torchvision
if ($LASTEXITCODE -ne 0) {
    throw "Failed to download GPU torch/torchvision wheels from $Sam3GpuTorchIndexUrl."
}

Write-Host 'Downloading SAM3 dependency wheels...'
& $AppPythonExe -m pip download --dest (Join-Path $BundleOutputDir 'wheels\sam3') -r $sam3NonTorchRequirementsPath
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to download SAM3 dependency wheels.'
}

Write-Host 'Copying SAM3 source tree...'
Copy-TreeRobust `
    -Source $Sam3SourceDir `
    -Destination (Join-Path $BundleOutputDir 'packages\sam3_source') `
    -ExcludeDirs @('.git', '.venv', '__pycache__', 'build', 'dist', '.pytest_cache') `
    -ExcludeFiles @('*.pyc', '*.pyo')

Write-Host 'Copying SAM3 checkpoint...'
Copy-Item -LiteralPath $Sam3CheckpointPath -Destination (Join-Path $BundleOutputDir "models\$(Split-Path -Leaf $Sam3CheckpointPath)") -Force

foreach ($artifact in @(
    'common.ps1',
    'install_offline_bundle.ps1',
    'reset_default_admin.ps1',
    'start_label_studio.ps1',
    'start_sam3_backend.ps1',
    'start_all.ps1',
    'start_local_stack.ps1',
    'healthcheck.ps1',
    'post_install_selfcheck.ps1',
    'app.env.example',
    'sam3.env.example',
    'README_DEPLOY.md'
)) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $artifact) -Destination (Join-Path $BundleOutputDir 'scripts') -Force
}

$manifest = [ordered]@{
    generated_at = (Get-Date).ToString('s')
    bundle_version = '1'
    app_wheel = $appWheel.Name
    sam3_backend_wheel = $backendWheel.Name
    python_installer = Split-Path -Leaf $PythonInstallerPath
    vc_redist_installer = if ($VCRedistInstallerPath) { Split-Path -Leaf $VCRedistInstallerPath } else { $null }
    sam3_checkpoint = Split-Path -Leaf $Sam3CheckpointPath
    app_requirements = 'requirements/app-offline.txt'
    sam3_requirements = 'requirements/sam3-offline.txt'
    sam3_cpu_torch_index_url = $Sam3CpuTorchIndexUrl
    sam3_gpu_torch_platform = $Sam3GpuTorchPlatform
    sam3_gpu_torch_index_url = $Sam3GpuTorchIndexUrl
}
$manifestJson = $manifest | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText((Join-Path $BundleOutputDir 'manifest.json'), $manifestJson, (New-Object System.Text.UTF8Encoding($false)))

Remove-DirectoryIfExists -Path $tempRoot
Write-Host "Offline bundle created at: $BundleOutputDir"
