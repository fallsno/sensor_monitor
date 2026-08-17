$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Test-WebView2Runtime {
    $registryPaths = @(
        "Registry::HKEY_CURRENT_USER\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    )

    foreach ($path in $registryPaths) {
        try {
            $version = Get-ItemPropertyValue -Path $path -Name "pv" -ErrorAction Stop
            if (-not [string]::IsNullOrWhiteSpace($version)) {
                return $true
            }
        } catch {
        }
    }

    return $false
}

if (-not (Test-WebView2Runtime)) {
    Write-Warning "Microsoft Edge WebView2 Runtime was not detected on this machine. The installer will still be built, but target machines must have WebView2 Runtime before launching SensorMonitor."
}

# 同步版本号从 version.json 到 .iss
$versionJsonPath = "config/version.json"
$issPath = "installer/sensor_monitor.iss"

if (Test-Path $versionJsonPath) {
    $versionLoader = @"
import json
from pathlib import Path

print(json.loads(Path(r'$versionJsonPath').read_text(encoding='utf-8'))['version'])
"@
    $currentVersion = (python -c $versionLoader).Trim()
    Write-Host "Detected version from version.json: $currentVersion"

    $issUpdater = @"
from pathlib import Path
import re

iss_path = Path(r'$issPath')
iss_text = iss_path.read_text(encoding='utf-8-sig').lstrip('\ufeff')
current_version = '$currentVersion'
replacement = '#define MyAppVersion ' + chr(34) + current_version + chr(34)
updated_text = re.sub(
    r'^#define MyAppVersion\b.*$',
    replacement,
    iss_text,
    count=1,
    flags=re.MULTILINE,
)
iss_path.write_text(updated_text, encoding='utf-8-sig')
"@
    python -c $issUpdater
    Write-Host "Updated $issPath with version $currentVersion"
} else {
    Write-Warning "config/version.json not found, using existing version in .iss"
}

$iscc = "F:\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $iscc)) {
    throw "Inno Setup 6 is not installed: $iscc"
}

& $iscc "installer/sensor_monitor.iss"
