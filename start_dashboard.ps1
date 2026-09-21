$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $repoRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    throw "Virtual environment not found at $python. Create it with: python -m venv .venv"
}

$backendCommand = "Set-Location '$repoRoot'; & '$python' -m uvicorn backend.app:app --host 127.0.0.1 --port 8000"
Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $backendCommand
) -WindowStyle Normal

Set-Location (Join-Path $repoRoot "dashboard")
npm run dev