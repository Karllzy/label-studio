param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$EnvFile,
    [string]$BaseUrl,
    [switch]$SkipApiRegression,
    [switch]$KeepSelfCheckProject
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

if (-not $EnvFile) {
    $EnvFile = Join-Path $InstallRoot 'config\app.env'
}

Import-EnvFile -EnvFile $EnvFile

$PythonExe = Join-Path $InstallRoot 'venvs\app\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "Python executable not found: $PythonExe"
}

if (-not $env:BASE_DATA_DIR) {
    $env:BASE_DATA_DIR = Join-Path $InstallRoot 'data\label-studio'
}
if (-not $env:DATABASE_NAME) {
    $env:DATABASE_NAME = Join-Path $env:BASE_DATA_DIR 'label_studio.sqlite3'
}
if (-not $BaseUrl) {
    $labelStudioPort = if ($env:PORT) { $env:PORT } else { '8080' }
    $BaseUrl = "http://127.0.0.1:$labelStudioPort"
}

$env:OFFLINE_SELFTEST_BASE_URL = $BaseUrl.TrimEnd('/')
$env:OFFLINE_SELFTEST_SKIP_API = if ($SkipApiRegression) { '1' } else { '0' }
$env:OFFLINE_SELFTEST_KEEP_PROJECT = if ($KeepSelfCheckProject) { '1' } else { '0' }

$SelfCheckScript = @'
import base64
import json
import os
import sys
import time
import uuid
from pathlib import Path

try:
    import label_studio
    sys.path.insert(0, str(Path(label_studio.__file__).resolve().parent))
except Exception:
    pass

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.label_studio")

import django
django.setup()

from django.db.models import Q
from rest_framework.authtoken.models import Token
from users.models import User, normalize_username

ADMIN_EMAIL = "admin@admin.com"
ADMIN_USERNAME = "Admin"
ADMIN_PASSWORD = "Admin123!"


def fail(message):
    raise RuntimeError(message)


def response_text(response):
    text = response.text or ""
    return text[:1000]


def assert_response(response, expected, action):
    if response.status_code not in expected:
        fail(f"{action} failed: HTTP {response.status_code}: {response_text(response)}")
    return response


username_norm = normalize_username(ADMIN_USERNAME)
matches = User.objects.filter(
    Q(email__iexact=ADMIN_EMAIL) | Q(username__iexact=ADMIN_USERNAME) | Q(username__iexact=username_norm)
).order_by("id")
admin = matches.filter(email__iexact=ADMIN_EMAIL).first()
if admin is None:
    fail(f"default Admin user is missing: {ADMIN_EMAIL}")

duplicate_ids = list(matches.exclude(pk=admin.pk).values_list("id", flat=True))
orphan_ids = list(
    User.objects.filter(email__iendswith="@local")
    .filter(Q(username__iexact=ADMIN_USERNAME) | Q(username__iexact=username_norm))
    .values_list("id", flat=True)
)
if duplicate_ids or orphan_ids:
    fail(
        "duplicate/orphan Admin users remain after offline startup reset: "
        f"duplicates={duplicate_ids}, orphans={orphan_ids}"
    )

if not admin.is_staff or not admin.is_superuser or not admin.is_active:
    fail("default Admin user is not active staff superuser")
if not admin.check_password(ADMIN_PASSWORD):
    fail("default Admin password check failed")

try:
    import label_studio.server as label_studio_server

    resolved = label_studio_server._resolve_user_by_identifier(ADMIN_USERNAME)
    if resolved is None or resolved.pk != admin.pk:
        fail("server._resolve_user_by_identifier did not resolve the canonical Admin user")
except Exception as exc:
    fail(f"server Admin resolver raised unexpectedly: {exc}")

token, _ = Token.objects.get_or_create(user=admin)

skip_api = os.environ.get("OFFLINE_SELFTEST_SKIP_API") == "1"
base_url = os.environ["OFFLINE_SELFTEST_BASE_URL"].rstrip("/")
result = {
    "admin_user_id": admin.pk,
    "admin_duplicate_check": "ok",
    "api_regression_check": "skipped" if skip_api else "pending",
}

if not skip_api:
    import requests

    session = requests.Session()
    session.headers.update({"Authorization": f"Token {token.key}"})

    assert_response(session.get(f"{base_url}/api/projects/", timeout=15), {200}, "list projects")

    label_config = (
        '<View>'
        '<Image name="image" value="$image"/>'
        '<RectangleLabels name="label" toName="image">'
        '<Label value="Object"/>'
        '</RectangleLabels>'
        '</View>'
    )
    title = f"offline-selfcheck-{uuid.uuid4().hex[:8]}"
    create_response = assert_response(
        session.post(
            f"{base_url}/api/projects/",
            json={"title": title, "label_config": label_config, "is_draft": True},
            timeout=30,
        ),
        {200, 201},
        "create self-check project",
    )
    project_id = create_response.json()["id"]

    png_bytes = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lTt4qQAAAABJRU5ErkJggg=="
    )
    all_upload_ids = []
    try:
        for round_index in range(1, 3):
            files = [
                ("file_0", ("repeat-name.png", png_bytes, "image/png")),
                ("file_1", ("repeat-name.png", png_bytes, "image/png")),
            ]
            import_response = assert_response(
                session.post(
                    f"{base_url}/api/projects/{project_id}/import",
                    params={"commit_to_project": "false"},
                    files=files,
                    timeout=60,
                ),
                {201},
                f"batch image import round {round_index}",
            )
            payload = import_response.json()
            ids = payload.get("file_upload_ids") or []
            if len(ids) != 2:
                fail(f"batch image import round {round_index} returned {len(ids)} file_upload_ids, expected 2")
            if len(set(ids)) != 2:
                fail(f"batch image import round {round_index} returned duplicate file_upload_ids: {ids}")
            all_upload_ids.extend(ids)

            file_list_response = assert_response(
                session.get(
                    f"{base_url}/api/projects/{project_id}/file-uploads",
                    params={"ids": json.dumps(ids)},
                    timeout=30,
                ),
                {200},
                f"load uploaded file list round {round_index}",
            )
            file_list = file_list_response.json()
            returned_ids = {item.get("id") for item in file_list}
            missing_ids = sorted(set(ids) - returned_ids)
            if missing_ids:
                fail(f"file upload list round {round_index} missed uploaded ids: {missing_ids}")

        if len(set(all_upload_ids)) != 4:
            fail(f"second batch image import reused or dropped upload ids: {all_upload_ids}")

        reimport_response = assert_response(
            session.post(
                f"{base_url}/api/projects/{project_id}/reimport",
                json={"file_upload_ids": all_upload_ids, "files_as_tasks_list": False},
                timeout=60,
            ),
            {201},
            "reimport all uploaded image files",
        )
        reimport_payload = reimport_response.json()
        if reimport_payload.get("task_count") != 4:
            fail(f"reimport task_count={reimport_payload.get('task_count')}, expected 4")

        result["api_regression_check"] = "ok"
        result["self_check_project_id"] = project_id
        result["batch_image_upload_ids"] = all_upload_ids
    finally:
        if os.environ.get("OFFLINE_SELFTEST_KEEP_PROJECT") != "1":
            try:
                session.delete(f"{base_url}/api/projects/{project_id}", timeout=30)
            except Exception:
                pass

print(json.dumps(result, ensure_ascii=False, sort_keys=True))
'@

Write-Host 'Running Label Studio offline regression self-check...'
$SelfCheckScript | & $PythonExe -
if ($LASTEXITCODE -ne 0) {
    throw "Offline regression self-check failed with exit code $LASTEXITCODE."
}
