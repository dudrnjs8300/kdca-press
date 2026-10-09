# Run from Windows PowerShell as the same Windows user that owns the WSL distro.
[CmdletBinding()]
param([string]$Distro, [switch]$Remove)
$ErrorActionPreference = 'Stop'
$taskName = 'KDCA-Press-WSL'
if ($Remove) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host 'KDCA WSL auto-start task removed. Linux services are unchanged.'
    exit
}
$available = @((& wsl.exe --list --quiet) | ForEach-Object { ($_ -replace "`0", '').Trim() } | Where-Object { $_ })
if (!$Distro) {
    Write-Host ('WSL distributions: ' + ($available -join ', '))
    $Distro = Read-Host 'Enter the distribution where kdca-press is installed'
}
if ($available -notcontains $Distro -or $Distro -notmatch '^[A-Za-z0-9_.-]+$') {
    throw 'Choose an exact WSL distribution name from the list.'
}
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wsl.exe" -Argument "-d `"$Distro`" --exec /bin/sleep infinity"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Keep the KDCA MCP WSL distribution running while signed in.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host 'Auto-start registered for this Windows account. The PC must remain awake and signed in.'
Write-Host 'No power settings were changed. Linux systemd starts the MCP and tunnel services.'
