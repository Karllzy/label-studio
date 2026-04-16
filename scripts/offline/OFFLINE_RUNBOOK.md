# Offline Deployment Runbook

This runbook is for moving the current Label Studio + SAM3 setup onto an offline Windows machine.

## Scope

This deployment includes:

- Label Studio backend
- built frontend assets bundled inside the Label Studio package
- SAM3 local ML backend
- SAM3 model checkpoint
- two isolated Python environments

This deployment does not include:

- existing test projects or SQLite data from the current machine
- frontend development tooling such as Node.js or Yarn

## What To Prepare On The Online Machine

You need:

- this repository with the offline scripts
- `sam3` source directory
- SAM3 checkpoint file
- Python Windows installer
- `VC_redist.x64.exe`

Recommended example:

```text
sam3 source:       C:\Users\Administrator\Developer\sam3
sam3 checkpoint:   C:\Users\Administrator\.cache\modelscope\hub\models\facebook\sam3___1\sam3.1_multiplex.pt
python installer:  C:\Users\zhenye\Downloads\python-3.12.10-amd64.exe
vc runtime:        C:\Users\zhenye\Downloads\VC_redist.x64.exe
```

## Step 1: Build The Offline Bundle

Run this on the online machine from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/offline/build_offline_bundle.ps1 `
  -BundleOutputDir C:\offline_bundle `
  -PythonInstallerPath C:\Users\zhenye\Downloads\python-3.12.10-amd64.exe `
  -VCRedistInstallerPath C:\Users\zhenye\Downloads\VC_redist.x64.exe `
  -Sam3SourceDir C:\Users\Administrator\Developer\sam3 `
  -Sam3CheckpointPath C:\Users\Administrator\.cache\modelscope\hub\models\facebook\sam3___1\sam3.1_multiplex.pt `
  -AppPythonExe C:\Users\Administrator\Developer\label-studio-develop\.offline-build-venv\Scripts\python.exe `
  -Force
```

Expected output directory:

```text
C:\offline_bundle
```

The bundle should contain:

- `installers\python-3.12.10-amd64.exe`
- `installers\VC_redist.x64.exe`
- `packages\label_studio_app\*.whl`
- `packages\sam3_local_backend\*.whl`
- `packages\sam3_source\`
- `models\sam3.1_multiplex.pt`
- `scripts\install_offline_bundle.ps1`
- `scripts\start_all.ps1`

## Step 2: Copy To The Offline Machine

Copy the whole `offline_bundle` directory to the offline Windows machine.

Example target path:

```text
D:\offline_bundle
```

## Step 3: Install On The Offline Machine

Open PowerShell as a normal user and run:

```powershell
powershell -ExecutionPolicy Bypass -File D:\offline_bundle\scripts\install_offline_bundle.ps1 -InstallRoot D:\LSOffline
```

What this does:

- installs Python into `D:\LSOffline\runtime\python`
- creates `D:\LSOffline\venvs\app`
- creates `D:\LSOffline\venvs\sam3`
- installs all wheels from the local wheelhouse only
- copies `sam3` source into `D:\LSOffline\packages\sam3_source`
- copies the checkpoint into `D:\LSOffline\models`
- creates fresh config files under `D:\LSOffline\config`

## Step 4: Start The Services

Run:

```powershell
powershell -ExecutionPolicy Bypass -File D:\LSOffline\scripts\start_all.ps1
```

This starts:

- SAM3 backend on `http://127.0.0.1:9090`
- Label Studio on `http://127.0.0.1:8080`

## Step 5: Verify

If both processes start, run:

```powershell
powershell -ExecutionPolicy Bypass -File D:\LSOffline\scripts\healthcheck.ps1
```

Expected:

- SAM3 `/health` returns `status: UP`
- Label Studio homepage returns HTTP `200`

## Config Files

After install, these are the main files to edit:

- `D:\LSOffline\config\app.env`
- `D:\LSOffline\config\sam3.env`

Typical values:

```text
BASE_DATA_DIR=D:\LSOffline\data\label-studio
DATABASE_NAME=D:\LSOffline\data\label-studio\label_studio.sqlite3
SAM3_REPO_DIR=D:\LSOffline\packages\sam3_source
SAM3_CHECKPOINT_PATH=D:\LSOffline\models\sam3.1_multiplex.pt
SAM3_ML_PORT=9090
```

## Common Problems

`install_offline_bundle.ps1` fails during Python install:

- check that `installers\python-3.12.10-amd64.exe` exists in the bundle
- check that the offline machine allows silent installs

SAM3 backend starts but cannot load the model:

- confirm `D:\LSOffline\models\sam3.1_multiplex.pt` exists
- confirm `SAM3_CHECKPOINT_PATH` in `config\sam3.env` points to that file

SAM3 backend starts but import fails:

- confirm `D:\LSOffline\packages\sam3_source` exists
- confirm `SAM3_REPO_DIR` points to it

Label Studio starts but cannot open the database:

- confirm `BASE_DATA_DIR` exists
- confirm `DATABASE_NAME` points inside `data\label-studio`

Port conflict:

- edit `config\app.env` or `config\sam3.env`
- restart the affected service

## GitHub Note

If you later want a cleaner handoff process, the next step is to publish the generated `offline_bundle` as a GitHub Release asset. That would let you download a versioned deployment package directly instead of rebuilding it each time.
