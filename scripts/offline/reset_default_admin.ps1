param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$EnvFile
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

Ensure-Directory -Path $env:BASE_DATA_DIR

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
from django.db.models import Q
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

for orphan in User.objects.filter(email__iendswith="@local").filter(
    Q(username__iexact=username) | Q(username__iexact=username_norm)
).exclude(pk=user.pk):
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

Write-Host 'Resetting default Admin password to Admin123!...'
$ResetScript | & $PythonExe -
if ($LASTEXITCODE -ne 0) {
    throw "Reset admin script failed with exit code $LASTEXITCODE."
}
