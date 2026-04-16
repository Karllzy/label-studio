# Offline Windows Deployment

This folder contains scripts for building an offline deployment bundle on a connected machine and installing it on an offline Windows machine.

## Builder machine

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/offline/build_offline_bundle.ps1 `
  -BundleOutputDir C:\offline_bundle `
  -PythonInstallerPath C:\installers\python-3.10.11-amd64.exe `
  -VCRedistInstallerPath C:\installers\vc_redist.x64.exe `
  -Sam3SourceDir C:\path\to\sam3 `
  -Sam3CheckpointPath C:\path\to\sam3.1_multiplex.pt
```

The builder outputs a self-contained bundle with:

- Python installer
- VC++ runtime installer
- app and SAM3 wheelhouses
- built wheels for `label-studio` and `sam3-local-backend`
- copied `sam3` source tree
- copied SAM3 checkpoint
- offline install and start scripts

## Offline machine

Copy the generated bundle to the offline machine and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_offline_bundle.ps1 -InstallRoot D:\LSOffline
```

After installation:

```powershell
powershell -ExecutionPolicy Bypass -File D:\LSOffline\scripts\start_all.ps1
```

## Notes

- The offline install creates two virtual environments: `venvs\app` and `venvs\sam3`.
- No existing project data is copied. The install creates a fresh SQLite database under `data\label-studio`.
- Update `config\app.env` and `config\sam3.env` after install if you need non-default ports or paths.
