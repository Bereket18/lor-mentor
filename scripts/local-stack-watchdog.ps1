# Local development stack watchdog.
#
# Starts any missing API / web / verifier / Prisma Studio / cloudflared process
# and is safe to run repeatedly. It never kills or duplicates a healthy
# process. Register it with Windows Task Scheduler (see the bottom of this
# file) for automatic recovery after a crash or reboot.
#
# Usage:
#   pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack-watchdog.ps1
#   pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack-watchdog.ps1 -SkipTunnel

param(
  [switch]$SkipTunnel,
  [switch]$SkipStudio,
  [switch]$VerboseLog
)

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $env:TEMP 'lor-logs'
$StateDir = Join-Path $env:TEMP 'lor-watchdog'
New-Item -ItemType Directory -Force -Path $LogDir, $StateDir | Out-Null

function Write-WatchdogLog {
  param([string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -Path (Join-Path $LogDir 'watchdog.log') -Value $line
  if ($VerboseLog) { Write-Host $line }
}

function Test-Listening {
  param([int]$Port)
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Get-EnvValue {
  param([string]$Path, [string]$Key)
  if (-not (Test-Path $Path)) { return $null }
  $value = $null
  foreach ($line in Get-Content $Path) {
    if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") {
      $value = $Matches[1].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
          ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }
  }
  return $value
}

function Start-MissingProcess {
  param(
    [string]$Name,
    [int]$Port,
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$WorkingDirectory,
    [hashtable]$Environment,
    [string]$ReadyPath
  )

  if (Test-Listening $Port) {
    Write-WatchdogLog "$Name is already listening on $Port"
    return
  }

  $lock = Join-Path $StateDir "$Name.lock"
  if (Test-Path $lock) {
    $age = (Get-Date) - (Get-Item $lock).LastWriteTime
    if ($age.TotalSeconds -lt 150) {
      Write-WatchdogLog "$Name start is still in its grace window ($([int]$age.TotalSeconds)s)"
      return
    }
  }
  Set-Content -Path $lock -Value (Get-Date -Format o)

  if ($ReadyPath -and -not (Test-Path $ReadyPath)) {
    Write-WatchdogLog "$Name cannot start: build output missing at $ReadyPath"
    return
  }

  $outLog = Join-Path $LogDir "$Name.log"
  $errLog = Join-Path $LogDir "$Name.err.log"
  Write-WatchdogLog "Starting $Name (port $Port)"

  $params = @{
    FilePath               = $FilePath
    ArgumentList           = $ArgumentList
    WorkingDirectory       = $WorkingDirectory
    RedirectStandardOutput = $outLog
    RedirectStandardError  = $errLog
    WindowStyle            = 'Hidden'
    PassThru               = $true
  }
  if ($Environment) { $params.Environment = $Environment }

  try {
    $proc = Start-Process @params
    Write-WatchdogLog "$Name started with PID $($proc.Id)"
  } catch {
    Write-WatchdogLog "$Name failed to start: $($_.Exception.Message)"
  }
}

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
$npx = (Get-Command npx.cmd -ErrorAction SilentlyContinue).Source
$verifierPython = Join-Path $Root 'services\receipt-verifier\.venv\Scripts\python.exe'
$cloudflared = Join-Path $env:APPDATA 'npm\node_modules\cloudflared\bin\cloudflared.exe'
$apiEnv = Join-Path $Root 'apps\api\.env'

if (-not $node) { Write-WatchdogLog 'node.exe not found'; exit 1 }
if (-not $npm) { Write-WatchdogLog 'npm.cmd not found'; exit 1 }

Start-MissingProcess -Name 'api' -Port 4000 -FilePath $node `
  -ArgumentList @('dist/src/main') -WorkingDirectory (Join-Path $Root 'apps\api') `
  -ReadyPath (Join-Path $Root 'apps\api\dist\src\main.js')

Start-MissingProcess -Name 'web' -Port 3000 -FilePath $npm `
  -ArgumentList @('run', 'start') -WorkingDirectory (Join-Path $Root 'apps\web') `
  -ReadyPath (Join-Path $Root 'apps\web\.next\BUILD_ID')

if (Test-Path $verifierPython) {
  $verifierEnv = @{}
  $token = Get-EnvValue -Path $apiEnv -Key 'RECEIPT_VERIFIER_TOKEN'
  if ($token) { $verifierEnv['VERIFIER_SHARED_TOKEN'] = $token }
  Start-MissingProcess -Name 'verifier' -Port 8000 -FilePath $verifierPython `
    -ArgumentList @('-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', '8000') `
    -WorkingDirectory (Join-Path $Root 'services\receipt-verifier') `
    -Environment $verifierEnv -ReadyPath (Join-Path $Root 'services\receipt-verifier\main.py')
} else {
  Write-WatchdogLog "verifier Python not found at $verifierPython"
}

if (-not $SkipStudio -and $npx) {
  Start-MissingProcess -Name 'studio' -Port 5555 -FilePath $npx `
    -ArgumentList @('prisma', 'studio', '--port', '5555') `
    -WorkingDirectory (Join-Path $Root 'apps\api') `
    -ReadyPath (Join-Path $Root 'apps\api\prisma\schema.prisma')
}

if (-not $SkipTunnel -and (Test-Path $cloudflared)) {
  $existing = Get-Process cloudflared -ErrorAction SilentlyContinue
  if ($existing) {
    Write-WatchdogLog "cloudflared is already running (PID $($existing.Id -join ', '))"
  } else {
    $lock = Join-Path $StateDir 'cloudflared.lock'
    $age = if (Test-Path $lock) { (Get-Date) - (Get-Item $lock).LastWriteTime } else { [TimeSpan]::MaxValue }
    if ($age.TotalSeconds -ge 150) {
      Set-Content -Path $lock -Value (Get-Date -Format o)
      Write-WatchdogLog 'Starting cloudflared quick tunnel'
      try {
        $proc = Start-Process -FilePath $cloudflared `
          -ArgumentList @('tunnel', '--url', 'http://localhost:4000', '--no-autoupdate') `
          -RedirectStandardOutput (Join-Path $LogDir 'cloudflared.log') `
          -RedirectStandardError (Join-Path $LogDir 'cloudflared.err.log') `
          -WindowStyle Hidden -PassThru
        Write-WatchdogLog "cloudflared started with PID $($proc.Id); URL is in cloudflared.err.log"
      } catch {
        Write-WatchdogLog "cloudflared failed to start: $($_.Exception.Message)"
      }
    }
  }
}

# Optional one-time task registration (run manually, not on every watchdog tick):
#
# Register the task against the hidden launcher, NOT pwsh.exe directly: a pwsh
# console window flashed on every tick even with -WindowStyle Hidden (this
# machine's default, delegated console host still showed it). The launcher
# starts wscript.exe, a GUI process, which opens the watchdog with a hidden
# window instead.
#
# $launcher = Join-Path $Root 'scripts\local-stack-watchdog-hidden.vbs'
# $action = New-ScheduledTaskAction -Execute 'wscript.exe' `
#   -Argument "//B //NoLogo `"$launcher`""
# $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
#   -RepetitionInterval (New-TimeSpan -Minutes 2)
# $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
#   -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
# Register-ScheduledTask -TaskName 'LorMentorStackWatchdog' -Action $action `
#   -Trigger $trigger -Settings $settings -Description 'Restarts the local Lor Mentor stack if a process dies.' -Force
