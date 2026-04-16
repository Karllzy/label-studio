# SAM3 Local ML Backend

This backend exposes a minimal Label Studio ML Backend API for local image projects that use:

- `Image`
- `RectangleLabels`

It loads the local SAM3 checkpoint from:

- `C:\Users\Administrator\.cache\modelscope\hub\models\facebook\sam3___1\sam3.1_multiplex.pt`

and the local SAM3 code from:

- `C:\Users\Administrator\Developer\sam3`

## Endpoints

- `GET /health`
- `POST /setup`
- `POST /predict`
- `GET /versions`
- `POST /train`
- `POST /webhook`

## Start

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start_sam3_ml_backend.ps1
```

## Default URL

```text
http://127.0.0.1:9090
```
