$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

if (Test-Path "dist/SensorMonitor") {
    Remove-Item "dist/SensorMonitor" -Recurse -Force
}

if (Test-Path "build/sensor_monitor_desktop") {
    Remove-Item "build/sensor_monitor_desktop" -Recurse -Force
}

python -m PyInstaller --clean --noconfirm sensor_monitor_desktop.spec
