# Scheduler-safe hourly refresh. Writes a local audit log; does not overwrite history.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$python = 'C:\Python314\python.exe'
$logDirectory = Join-Path $projectRoot 'data\refresh_logs'
$logFile = Join-Path $logDirectory 'weather_refresh.log'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

$started = (Get-Date).ToUniversalTime().ToString('o')
try {
  $result = & $python (Join-Path $projectRoot 'pipeline.py') weather 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Weather refresh completed with provider failures: $result" }
  Add-Content -LiteralPath $logFile -Value "$started SUCCESS $result"
  exit 0
} catch {
  Add-Content -LiteralPath $logFile -Value "$started FAILURE $($_.Exception.Message)"
  exit 1
}
