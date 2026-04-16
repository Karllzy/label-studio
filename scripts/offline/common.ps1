Set-StrictMode -Version Latest

function Import-EnvFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$EnvFile
    )

    if (-not (Test-Path -LiteralPath $EnvFile)) {
        return
    }

    Get-Content -LiteralPath $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) {
            return
        }

        $parts = $line -split '=', 2
        if ($parts.Length -ne 2) {
            return
        }

        $name = $parts[0].Trim()
        $value = $parts[1].Trim()
        if ($name) {
            [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

function Ensure-Directory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Remove-DirectoryIfExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
}

function Copy-TreeRobust {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,
        [Parameter(Mandatory = $true)]
        [string]$Destination,
        [string[]]$ExcludeDirs = @(),
        [string[]]$ExcludeFiles = @()
    )

    Ensure-Directory -Path $Destination
    $args = @($Source, $Destination, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP')
    if ($ExcludeDirs.Count -gt 0) {
        $args += '/XD'
        $args += $ExcludeDirs
    }
    if ($ExcludeFiles.Count -gt 0) {
        $args += '/XF'
        $args += $ExcludeFiles
    }

    & robocopy @args | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy failed with exit code $LASTEXITCODE while copying $Source to $Destination"
    }
}

function Get-OfflineDependenciesFromPyProject {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PyProjectPath
    )

    $lines = Get-Content -LiteralPath $PyProjectPath
    $inDeps = $false
    $deps = New-Object System.Collections.Generic.List[string]

    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if (-not $inDeps) {
            if ($trimmed -eq 'dependencies = [') {
                $inDeps = $true
            }
            continue
        }

        if ($trimmed -eq ']') {
            break
        }

        if (-not $trimmed -or $trimmed.StartsWith('#') -or $trimmed.StartsWith('##')) {
            continue
        }

        if ($trimmed.StartsWith('"')) {
            $dep = $trimmed.TrimEnd(',').Trim('"')
            if ($dep) {
                $deps.Add($dep)
            }
        }
    }

    return $deps
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string[]]$Lines
    )

    $content = [string]::Join([Environment]::NewLine, $Lines)
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $content + [Environment]::NewLine, $encoding)
}

function Resolve-RepoRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ScriptPath
    )

    return Split-Path -Parent (Split-Path -Parent $ScriptPath)
}
