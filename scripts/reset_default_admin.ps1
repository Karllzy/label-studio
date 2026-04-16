Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$DjangoRoot = Join-Path $RepoRoot "label_studio"
$VenvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$LocalEnv = Join-Path $ScriptDir "local.env"
$EnvLoader = Join-Path $ScriptDir "load_local_env.ps1"

if (Test-Path $EnvLoader) {
    . $EnvLoader
    Import-LocalEnv -EnvFile $LocalEnv
}

$FallbackPython = Get-Command python.exe -ErrorAction SilentlyContinue

if (Test-Path $VenvPython) {
    $PythonExe = $VenvPython
}
elseif ($FallbackPython) {
    $PythonExe = $FallbackPython.Source
}
else {
    throw "python.exe not found, and project virtualenv is missing."
}

$ResetScript = @'
import os
from pathlib import Path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.label_studio")

import django
django.setup()

from django.conf import settings
from users.models import User

email = "admin@admin.com"
password = "admin"
username = "admin"

user = User.objects.filter(email=email).first()
created = False

if user is None:
    user = User(email=email, username=username)
    created = True

user.username = username
user.is_staff = True
user.is_superuser = True
user.is_active = True
user.set_password(password)
user.save()

print(f"DATABASE_NAME={settings.DATABASES['default'].get('NAME')}")
print(f"BASE_DATA_DIR={settings.BASE_DATA_DIR}")
print(f"ADMIN_EMAIL={email}")
print(f"ADMIN_PASSWORD={password}")
print(f"CREATED={created}")
'@

Write-Host "Repo root: $RepoRoot"
Write-Host "Django root: $DjangoRoot"
Write-Host "Python: $PythonExe"
Write-Host "BASE_DATA_DIR: $env:BASE_DATA_DIR"
Write-Host "DATABASE_NAME: $env:DATABASE_NAME"

Push-Location $DjangoRoot
try {
    $ResetScript | & $PythonExe -

    if ($LASTEXITCODE -ne 0) {
        throw "Reset admin script failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
