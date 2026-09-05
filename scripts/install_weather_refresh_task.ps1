# Run once to install/update a user-level hourly task. No administrator rights needed.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$taskName = 'LandslideAI-WeatherRefresh'
$script = Join-Path $projectRoot 'scripts\refresh_weather.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2)
$trigger.RepetitionInterval = (New-TimeSpan -Hours 1)
$trigger.RepetitionDuration = (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Refreshes Landslide AI Open-Meteo/IMD observations hourly with local audit logs.' -Force | Out-Null
Write-Output "Installed $taskName. Check data\refresh_logs\weather_refresh.log for each run."
