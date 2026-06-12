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
  -Sam3CheckpointPath C:\path\to\sam3.1_multiplex.pt `
  -Sam3GpuTorchPlatform cu126
```

The builder outputs a self-contained bundle with:

- Python installer
- VC++ runtime installer
- app and SAM3 wheelhouses
- built wheels for `label-studio` and `sam3-local-backend`
- copied `sam3` source tree
- copied SAM3 checkpoint
- offline install and start scripts
- SAM3 runtime dependencies including `torchvision`, `timm`, `iopath`, `ftfy`, and `huggingface_hub`
- Windows Triton package via `triton-windows`
- CPU and GPU `torch`/`torchvision` wheels from the official PyTorch Windows channels

## Offline machine

Copy the generated bundle to the offline machine and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_offline_bundle.ps1 -InstallRoot D:\LSOffline -Sam3RuntimeVariant gpu
```

To install the CPU-only SAM3 runtime instead:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_offline_bundle.ps1 -InstallRoot D:\LSOffline -Sam3RuntimeVariant cpu
```

After installation:

```powershell
powershell -ExecutionPolicy Bypass -File D:\LSOffline\scripts\start_all.ps1
powershell -ExecutionPolicy Bypass -File D:\LSOffline\scripts\healthcheck.ps1
```

`healthcheck.ps1` now also runs the offline regression self-check. It verifies that startup removed duplicate/orphan
default Admin users and that Label Studio can create a temporary image project, upload two image batches with duplicate
filenames, load the uploaded file list, and reimport all uploaded images. To run only the Label Studio regression self-check:

```powershell
powershell -ExecutionPolicy Bypass -File D:\LSOffline\scripts\post_install_selfcheck.ps1
```

Or use the explicit stack launcher:

```powershell
powershell -ExecutionPolicy Bypass -File D:\LSOffline\scripts\start_local_stack.ps1
```

## Windows note about Triton

The offline Windows bundle includes `triton-windows`, which provides the `triton` Python module for Windows installs.

## Windows note about CUDA

The bundle builder now downloads both CPU and GPU `torch` and `torchvision` wheels from the official PyTorch channels. The installer chooses which set to apply with `-Sam3RuntimeVariant`.

Typical choices:

- `cu126`: recommended default for wider Windows GPU compatibility
- `cu128`: use when the target GPU/driver specifically needs newer CUDA 12.8 wheels
- `cpu`: use only when the target machine has no usable NVIDIA CUDA runtime

## Notes

- The offline install creates two virtual environments: `venvs\app` and `venvs\sam3`.
- No existing project data is copied. The install creates a fresh SQLite database under `data\label-studio`.
- Update `config\app.env` and `config\sam3.env` after install if you need non-default ports or paths.
