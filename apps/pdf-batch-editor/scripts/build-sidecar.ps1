$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $appRoot "sidecar-dist"
$workDir = Join-Path $appRoot "sidecar-build"
$binaryDir = Join-Path $appRoot "src-tauri\binaries"
$target = Join-Path $binaryDir "stamp-engine-x86_64-pc-windows-msvc.exe"

New-Item -ItemType Directory -Force -Path $binaryDir | Out-Null

$venvPython = Join-Path $appRoot ".venv\Scripts\python.exe"
$python = if (Test-Path -LiteralPath $venvPython) { $venvPython } else { (Get-Command python -ErrorAction Stop).Source }

& $python -m PyInstaller `
  --noconfirm `
  --clean `
  --distpath $distDir `
  --workpath $workDir `
  (Join-Path $appRoot "stamp-engine.spec")

if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller failed with exit code $LASTEXITCODE"
}

$builtSidecar = Join-Path $distDir "stamp-engine.exe"
if (-not (Test-Path -LiteralPath $builtSidecar)) {
  throw "PyInstaller did not create the expected file: $builtSidecar"
}

Copy-Item -LiteralPath $builtSidecar -Destination $target -Force
Write-Host "Sidecar: $target"
