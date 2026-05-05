# Tail / search CloudWatch logs for the TripChecklist App Runner service.
#
# Usage:
#   ./scripts/aws-logs.ps1                          # last 15 min, application logs
#   ./scripts/aws-logs.ps1 -Minutes 60               # last 60 min
#   ./scripts/aws-logs.ps1 -Follow                   # tail in near real-time (polls every 5s)
#   ./scripts/aws-logs.ps1 -Filter "trip.rebuild_failed"
#   ./scripts/aws-logs.ps1 -Filter "{ $.level = `"error`" }"   # JSON field filter
#   ./scripts/aws-logs.ps1 -RequestId 1234abcd-...   # find one request end-to-end
#   ./scripts/aws-logs.ps1 -Service                  # show service (build/deploy) logs instead of app logs
#
# App Runner ships container stdout/stderr to:
#   /aws/apprunner/<serviceName>/<serviceId>/application
# and build/deploy logs to:
#   /aws/apprunner/<serviceName>/<serviceId>/service

[CmdletBinding()]
param(
  [int]$Minutes = 15,
  [string]$Filter = "",
  [string]$RequestId = "",
  [switch]$Follow,
  [switch]$Service,
  [string]$Profile = "cf-prod",
  [string]$Region  = "us-east-1",
  [string]$ServiceArn = "arn:aws:apprunner:us-east-1:257074874944:service/tripchecklist/362120bb1964467bb3178313f402f43e"
)

$ErrorActionPreference = "Stop"
$env:AWS_PROFILE = $Profile

# Derive log group name from the service ARN.
# ARN format: arn:aws:apprunner:<region>:<acct>:service/<name>/<id>
$arnParts   = $ServiceArn -split "/"
$serviceName = $arnParts[1]
$serviceId   = $arnParts[2]
$stream      = if ($Service) { "service" } else { "application" }
$logGroup    = "/aws/apprunner/$serviceName/$serviceId/$stream"

# Build filter pattern
$pattern = $Filter
if ($RequestId) {
  if ($pattern) { $pattern = "$RequestId $pattern" } else { $pattern = $RequestId }
}

Write-Host "Log group: $logGroup" -ForegroundColor Cyan
if ($pattern) { Write-Host "Filter   : $pattern" -ForegroundColor Cyan }

function Show-Events {
  param([long]$StartMs, [long]$EndMs)
  $args = @(
    "logs", "filter-log-events",
    "--log-group-name", $logGroup,
    "--start-time", $StartMs,
    "--region", $Region,
    "--profile", $Profile,
    "--output", "json",
    "--max-items", "500"
  )
  if ($EndMs) { $args += @("--end-time", $EndMs) }
  if ($pattern) { $args += @("--filter-pattern", $pattern) }

  $raw = aws @args 2>$null
  if (-not $raw) { return @() }
  try {
    $data = $raw | ConvertFrom-Json
    return $data.events
  } catch {
    return @()
  }
}

if ($Follow) {
  Write-Host "Following $logGroup (Ctrl+C to stop)" -ForegroundColor Yellow
  $cursor = [DateTimeOffset]::UtcNow.AddMinutes(-1).ToUnixTimeMilliseconds()
  $seen = New-Object System.Collections.Generic.HashSet[string]
  while ($true) {
    $events = Show-Events -StartMs $cursor
    foreach ($e in $events) {
      if ($seen.Add($e.eventId)) {
        $ts = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$e.timestamp).ToString("HH:mm:ss")
        Write-Host "[$ts] " -NoNewline -ForegroundColor DarkGray
        Write-Host $e.message
        if ([long]$e.timestamp -gt $cursor) { $cursor = [long]$e.timestamp + 1 }
      }
    }
    Start-Sleep -Seconds 5
  }
} else {
  $start = [DateTimeOffset]::UtcNow.AddMinutes(-$Minutes).ToUnixTimeMilliseconds()
  $events = Show-Events -StartMs $start
  if (-not $events -or $events.Count -eq 0) {
    Write-Host "No log events in the last $Minutes minute(s)." -ForegroundColor Yellow
    exit 0
  }
  foreach ($e in $events) {
    $ts = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$e.timestamp).ToString("yyyy-MM-dd HH:mm:ss")
    Write-Host "[$ts] " -NoNewline -ForegroundColor DarkGray
    Write-Host $e.message
  }
  Write-Host ""
  Write-Host "Showed $($events.Count) event(s). Use -Follow to tail." -ForegroundColor DarkGray
}
