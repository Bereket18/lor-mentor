# T-30 Redis-down drill (staging/compose only).
#
# Proves the fail-closed posture end to end:
#   1. log in to the compose API as the seeded super admin
#   2. stop the Redis container
#   3. readiness flips to 503 (redis down)
#   4. POST /auth/refresh is denied (401) because the denylist cannot be read
#   5. start Redis again; readiness returns to 200
#
# It never prints the admin password or any token. Run from the repo root with
# the compose stack already up:
#
#   pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\t30-redis-drill.ps1

param(
  [string]$Api = 'http://127.0.0.1:4000',
  [string]$ComposeFile = 'docker-compose.prod.yml',
  [string]$EnvFile = '.env.production'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-EnvValue {
  param([string]$Path, [string]$Key)
  if (-not (Test-Path $Path)) { throw "$Path not found" }
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

function Get-ReadyStatus {
  try {
    $r = Invoke-WebRequest -Uri "$Api/api/v1/health/ready" -UseBasicParsing `
      -SkipHttpErrorCheck -TimeoutSec 15
    return [int]$r.StatusCode
  } catch {
    return 0
  }
}

function Wait-Ready {
  param([int]$Expected, [int]$TimeoutSeconds = 60)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $status = Get-ReadyStatus
    if ($status -eq $Expected) { return $true }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  return $false
}

$email = Get-EnvValue -Path (Join-Path $root $EnvFile) -Key 'SUPER_ADMIN_EMAIL'
$password = Get-EnvValue -Path (Join-Path $root $EnvFile) -Key 'SUPER_ADMIN_PASSWORD'
if (-not $email -or -not $password) {
  throw "SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD missing from $EnvFile"
}

Write-Host "[1/5] logging in as the seeded super admin"
$body = @{ email = $email; password = $password } | ConvertTo-Json
$login = Invoke-WebRequest -Uri "$Api/api/v1/auth/login" -Method Post `
  -Body $body -ContentType 'application/json' `
  -SkipHttpErrorCheck -TimeoutSec 30
if ([int]$login.StatusCode -ne 200) {
  throw "login failed with HTTP $([int]$login.StatusCode)"
}

# NODE_ENV=production marks the refresh cookie `Secure`, so .NET's cookie jar
# refuses to replay it over this local plain-HTTP staging URL. Extract the
# signed value from Set-Cookie and send it explicitly — drill-only workaround;
# never do this in a real browser/client.
$setCookie = @($login.Headers['Set-Cookie']) -join "`n"
$m = [regex]::Match($setCookie, 'refresh_token=([^;]+)')
if (-not $m.Success) { throw 'login did not return a refresh_token cookie' }
$refreshCookie = "refresh_token=$($m.Groups[1].Value)"

Write-Host '[2/5] stopping Redis'
docker compose -f $ComposeFile --env-file $EnvFile stop redis | Out-Null

Write-Host '[3/5] waiting for readiness to report Redis down (503)'
if (-not (Wait-Ready -Expected 503 -TimeoutSeconds 60)) {
  throw 'readiness never flipped to 503 after Redis stop'
}

Write-Host '[4/5] refreshing a token while Redis is down (expect 401)'
$refresh = Invoke-WebRequest -Uri "$Api/api/v1/auth/refresh" -Method Post `
  -Headers @{ Cookie = $refreshCookie } -SkipHttpErrorCheck -TimeoutSec 30
$refreshStatus = [int]$refresh.StatusCode

Write-Host '[5/5] starting Redis again'
docker compose -f $ComposeFile --env-file $EnvFile start redis | Out-Null
if (-not (Wait-Ready -Expected 200 -TimeoutSeconds 90)) {
  throw 'readiness never returned to 200 after Redis start'
}

$pass = $refreshStatus -eq 401
[pscustomobject]@{
  login = 'PASS'
  readinessWithRedisDown = 503
  refreshWithRedisDown = $refreshStatus
  readinessAfterRecovery = 200
  pass = $pass
} | ConvertTo-Json

if (-not $pass) { exit 1 }
