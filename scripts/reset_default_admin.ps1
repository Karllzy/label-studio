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
import sys
from pathlib import Path

try:
    import label_studio
    sys.path.insert(0, str(Path(label_studio.__file__).resolve().parent))
except Exception:
    pass

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.label_studio")

import django
django.setup()

from django.conf import settings
from django.core.management import call_command
from django.db.models import Q
from organizations.models import Organization
from users.models import User, normalize_username

email = "admin@admin.com"
password = "Admin123!"
username = "Admin"
username_norm = normalize_username(username)

call_command("migrate", verbosity=0, interactive=False)

matches = User.objects.filter(
    Q(email__iexact=email) | Q(username__iexact=username) | Q(username__iexact=username_norm)
).order_by("id")

user = matches.filter(email__iexact=email).first()
created = False

if user is None:
    user = matches.first()
    if user is None:
        user = User.objects.create_user(email=email, username=username, password=password)
        created = True

for dup in matches.exclude(pk=user.pk):
    print(f"Removing duplicate admin user id={dup.pk} username={dup.username!r} email={dup.email!r}")
    dup.delete()

# Orphan accounts created by server.py (username@local) when Admin already exists under another casing
for orphan in User.objects.filter(email__iendswith="@local").filter(
    Q(username__iexact=username) | Q(username__iexact=username_norm)
):
    print(f"Removing orphan admin user id={orphan.pk} username={orphan.username!r} email={orphan.email!r}")
    orphan.delete()

user.email = email
user.username = username
user.is_staff = True
user.is_superuser = True
user.is_active = True
user.set_password(password)
user.save()

org = Organization.objects.first()
if org is None:
    org = Organization.create_organization(created_by=user, title="Label Studio")
else:
    org.add_user(user)

user.active_organization = org
user.save(update_fields=["active_organization"])

print(f"DATABASE_NAME={settings.DATABASES['default'].get('NAME')}")
print(f"BASE_DATA_DIR={settings.BASE_DATA_DIR}")
print("Admin password has been reset on startup.")
print("ADMIN_USERNAME=Admin")
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
