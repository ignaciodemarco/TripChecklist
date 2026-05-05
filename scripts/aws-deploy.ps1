#!/usr/bin/env pwsh
# Creates the TripChecklist App Runner service from the latest ECR image.

param(
  [string]$Profile = "cf-prod",
  [string]$Region = "us-east-1",
  [string]$ServiceName = "tripchecklist",
  [string]$ImageTag = "latest"
)

$ErrorActionPreference = "Stop"
$env:AWS_PROFILE = $Profile

# Load .env
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (-not (Test-Path $envFile)) { throw ".env not found at $envFile" }

$envVars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$') {
    $val = $matches[2].Trim().Trim('"').Trim("'")
    $envVars[$matches[1]] = $val
  }
}

# Load DB credentials
$credFile = Join-Path $PSScriptRoot "rds-credentials.local.txt"
if (-not (Test-Path $credFile)) { throw "rds-credentials.local.txt not found" }
$dbCreds = @{}
Get-Content $credFile | ForEach-Object {
  if ($_ -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$') {
    $dbCreds[$matches[1]] = $matches[2].Trim()
  }
}
$databaseUrl = $dbCreds['DATABASE_URL']

# Wait for any pending deletion to finish
Write-Host "Checking for existing service..."
do {
  $existing = aws apprunner list-services --region $Region --query "ServiceSummaryList[?ServiceName=='$ServiceName']" --output json | ConvertFrom-Json
  if ($existing.Count -eq 0) { break }
  Write-Host "Existing service status: $($existing[0].Status). Waiting..."
  Start-Sleep -Seconds 15
} while ($true)

$accountId = "257074874944"
$imageUri = "${accountId}.dkr.ecr.${Region}.amazonaws.com/tripchecklist:${ImageTag}"
$accessRoleArn = "arn:aws:iam::${accountId}:role/AppRunnerEcrAccessRole"

# We don't know the public URL until after creation, so use placeholder; we'll update it after.
$nextAuthUrl = "https://placeholder.example.com"

$serviceConfig = @{
  ServiceName = $ServiceName
  SourceConfiguration = @{
    AutoDeploymentsEnabled = $true
    AuthenticationConfiguration = @{
      AccessRoleArn = $accessRoleArn
    }
    ImageRepository = @{
      ImageIdentifier = $imageUri
      ImageRepositoryType = "ECR"
      ImageConfiguration = @{
        Port = "8080"
        RuntimeEnvironmentVariables = @{
          NODE_ENV = "production"
          AUTH_TRUST_HOST = "true"
          DATABASE_URL = $databaseUrl
          AUTH_SECRET = $envVars['AUTH_SECRET']
          NEXTAUTH_URL = $nextAuthUrl
          AUTH_GOOGLE_ID = $envVars['AUTH_GOOGLE_ID']
          AUTH_GOOGLE_SECRET = $envVars['AUTH_GOOGLE_SECRET']
          OPENAI_API_KEY = $envVars['OPENAI_API_KEY']
          OPENAI_MODEL = if ($envVars['OPENAI_MODEL']) { $envVars['OPENAI_MODEL'] } else { "gpt-4o-mini" }
        }
      }
    }
  }
  InstanceConfiguration = @{
    Cpu = "1024"
    Memory = "2048"
  }
  HealthCheckConfiguration = @{
    Protocol = "HTTP"
    Path = "/login"
    HealthyThreshold = 1
    UnhealthyThreshold = 5
    Interval = 20
    Timeout = 10
  }
}

$jsonPath = Join-Path $PSScriptRoot "apprunner-service-config.local.json"
$serviceConfig | ConvertTo-Json -Depth 20 | Set-Content -Path $jsonPath -Encoding UTF8

Write-Host "Creating App Runner service '$ServiceName' with image $imageUri..."
$result = aws apprunner create-service --cli-input-json "file://$jsonPath" --region $Region --output json | ConvertFrom-Json

$serviceArn = $result.Service.ServiceArn
$serviceUrl = $result.Service.ServiceUrl
$publicUrl = "https://$serviceUrl"

Write-Host ""
Write-Host "Service ARN: $serviceArn"
Write-Host "Service URL: $publicUrl"
Write-Host ""
Write-Host "Updating NEXTAUTH_URL to the real URL..."

# Update env with real URL (App Runner needs to know its own public URL for auth callbacks)
$serviceConfig.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables.NEXTAUTH_URL = $publicUrl
$serviceConfig | ConvertTo-Json -Depth 20 | Set-Content -Path $jsonPath -Encoding UTF8

Write-Host "Waiting for initial provisioning..."
do {
  Start-Sleep -Seconds 20
  $status = aws apprunner describe-service --service-arn $serviceArn --region $Region --query 'Service.Status' --output text
  Write-Host "Status: $status"
} while ($status -eq "OPERATION_IN_PROGRESS")

if ($status -eq "RUNNING") {
  Write-Host ""
  Write-Host "Updating service with correct NEXTAUTH_URL..."
  $updatePayload = @{
    SourceConfiguration = @{
      AutoDeploymentsEnabled = $true
      AuthenticationConfiguration = @{ AccessRoleArn = $accessRoleArn }
      ImageRepository = $serviceConfig.SourceConfiguration.ImageRepository
    }
  }
  $updPath = Join-Path $PSScriptRoot "apprunner-update.local.json"
  $updatePayload | ConvertTo-Json -Depth 20 | Set-Content -Path $updPath -Encoding UTF8
  aws apprunner update-service --service-arn $serviceArn --cli-input-json "file://$updPath" --region $Region --query 'Service.Status' --output text
}

Write-Host ""
Write-Host "================================================================"
Write-Host "  PUBLIC URL: $publicUrl"
Write-Host "================================================================"
Write-Host ""
Write-Host "Save this ARN as GitHub secret AWS_APP_RUNNER_SERVICE_ARN:"
Write-Host "  $serviceArn"
