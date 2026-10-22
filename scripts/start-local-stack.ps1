# Lor Mentor local development stack launcher.
#
# Opens each service in its own PowerShell window so logs stay visible:
#   1. API (4000) + web (3000) via the root `npm run dev`
#   2. Receipt verifier (8000)
#   3. Prisma Studio (5555)
#
# No Cloudflare tunnel is started by this script. PostgreSQL and Redis are
# expected to be running as Windows services already; the script only warns
# if they are not listening.
#
# Usage (from the repository root):
#   pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local-stack.ps1
#   pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local-stack.ps1 -SkipStudio
#   pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local-stack.ps1 -SkipVerifier

[CmdletBinding()]
param(
  [switch]$SkipVerifier,
  [switch]$SkipStudio
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$ApiDir = Join-Path $Root 'apps\api'
$VerifierDir = Join-Path $Root 'services\receipt-verifier'
$VerifierPython = Join-Path $VerifierDir '.venv\Scripts\python.exe'
$ApiEnv = Join-Path $ApiDir '.env'

function Test-Port {
  param([int]$Port)
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Get-EnvValue {
  param([string]$Path, [string]$Key)

  if (-not (Test-Path -LiteralPath $Path)) { return $null }

  $value = $null
  foreach ($line in Get-Content -LiteralPath $Path) {
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

function Start-ServiceWindow {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
  )

  $shell = (Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source
  if (-not $shell) {
    $shell = (Get-Command powershell.exe -ErrorAction Stop).Source
  }

  # Keep the window open after the service exits so startup errors remain
  # visible. Paths are single-quoted inside the child command.
  $inner = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location -LiteralPath '$WorkingDirectory'; $Command"
  $argumentLine = "-NoExit -NoProfile -Command `"$inner`""

  Start-Process -FilePath $shell -ArgumentList $argumentLine -WorkingDirectory $WorkingDirectory | Out-Null
}

Write-Host ''
Write-Host 'Lor Mentor - starting local development stack' -ForegroundColor Cyan
Write-Host "Repository: $Root"
Write-Host ''

foreach ($dependency in @(
    @{ Name = 'PostgreSQL'; Port = 5432 },
    @{ Name = 'Redis'; Port = 6379 }
  )) {
  if (Test-Port $dependency.Port) {
    Write-Host "  OK  $($dependency.Name) is listening on $($dependency.Port)" -ForegroundColor Green
  } else {
    Write-Warning "$($dependency.Name) is not listening on $($dependency.Port). Start its Windows service before using the API."
  }
}

Write-Host ''

if ((Test-Port 3000) -or (Test-Port 4000)) {
  Write-Warning 'Port 3000 or 4000 is already in use; skipping the API + web launcher.'
} else {
  Write-Host 'Starting API + web (npm run dev)...'
  Start-ServiceWindow -Title 'Lor Mentor - API + Web' -WorkingDirectory $Root -Command 'npm.cmd run dev'
}

if ($SkipVerifier) {
  Write-Host 'Skipping receipt verifier (-SkipVerifier).'
} elseif (Test-Port 8000) {
  Write-Warning 'Port 8000 is already in use; skipping the receipt verifier.'
} elseif (-not (Test-Path -LiteralPath $VerifierPython)) {
  Write-Warning "Receipt verifier virtualenv not found at $VerifierPython."
} else {
  Write-Host 'Starting receipt verifier...'

  $token = Get-EnvValue -Path $ApiEnv -Key 'RECEIPT_VERIFIER_TOKEN'
  if (-not $token) {
    Write-Warning 'RECEIPT_VERIFIER_TOKEN was not found in apps\api\.env; starting the verifier without a shared token.'
  }

  $previousToken = $env:VERIFIER_SHARED_TOKEN
  if ($token) { $env:VERIFIER_SHARED_TOKEN = $token }

  try {
    Start-ServiceWindow -Title 'Lor Mentor - Receipt Verifier' -WorkingDirectory $VerifierDir `
      -Command '.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000'
  } finally {
    if ($null -eq $previousToken) {
      Remove-Item Env:VERIFIER_SHARED_TOKEN -ErrorAction SilentlyContinue
    } else {
      $env:VERIFIER_SHARED_TOKEN = $previousToken
    }
  }
}

if ($SkipStudio) {
  Write-Host 'Skipping Prisma Studio (-SkipStudio).'
} elseif (Test-Port 5555) {
  Write-Warning 'Port 5555 is already in use; skipping Prisma Studio.'
} else {
  Write-Host 'Starting Prisma Studio...'
  Start-ServiceWindow -Title 'Lor Mentor - Prisma Studio' -WorkingDirectory $ApiDir -Command 'npx.cmd prisma studio --port 5555'
}

Write-Host ''
Write-Host 'Services:' -ForegroundColor Cyan
Write-Host '  Web:             http://localhost:3000'
Write-Host '  API:             http://localhost:4000/api/v1'
Write-Host '  API readiness:   http://localhost:4000/api/v1/health/ready'
Write-Host '  Receipt verifier:http://localhost:8000/health'
Write-Host '  Prisma Studio:   http://localhost:5555'
Write-Host ''
Write-Host 'Each service runs in its own window. Press Ctrl+C or close that window to stop it.'
Write-Host 'No Cloudflare tunnel was started.'
Write-Host ''
