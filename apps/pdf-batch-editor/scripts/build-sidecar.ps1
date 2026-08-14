$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $appRoot "sidecar-dist"
$workDir = Join-Path $appRoot "sidecar-build"
$binaryDir = Join-Path $appRoot "src-tauri\binaries"
$target = Join-Path $binaryDir "stamp-engine-x86_64-pc-windows-msvc.exe"

New-Item -ItemType Directory -Force -Path $binaryDir | Out-Null

python -m PyInstaller `
  --noconfirm `
  --clean `
  --distpath $distDir `
  --workpath $workDir `
  (Join-Path $appRoot "stamp-engine.spec")

Copy-Item -LiteralPath (Join-Path $distDir "stamp-engine.exe") -Destination $target -Force
Write-Host "Sidecar: $target"
