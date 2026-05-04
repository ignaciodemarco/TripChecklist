#!/usr/bin/env pwsh
param(
  [string]$ServiceName = "tripchecklist",
  [string]$Profile = "cf-prod",
  [string]$Region = "us-east-1",
  [string]$ImageUri = $null,
  [string]$DatabaseUrl = $null,
  [string]$AuthSecret = $null,
  [string]$NextAuthUrl = "https://tripchecklist.{APPRUNNER_DOMAIN}",
  [string]$GoogleId = $null,
  [string]$GoogleSecret = $null,
  [string]$MicrosoftId = $null,
  [string]$MicrosoftSecret = $null,
  [string]$OpenAiKey = $null
)

$ErrorActionPreference = "Stop"

# If no image URI provided, try to get latest from ECR
if (-not $ImageUri) {
  Write-Host "Fetching latest image from ECR..."
  $images = aws ecr describe-images `
    --repository-name tripchecklist `
    --region $Region `
    --profile $Profile `
    --query 'sort_by(imageDetails, &imagePushedAt)[-1]' `
    --output json | ConvertFrom-Json
  
  if (-not $images -or -not $images.imageTags) {
    Write-Host "ERROR: No images found in ECR repository. GitHub Actions may still be building."
    Write-Host "Run this script again after the build completes."
    exit 1
  }
  
  $tag = $images.imageTags[0]
  $ImageUri = "257074874944.dkr.ecr.${Region}.amazonaws.com/tripchecklist:${tag}"
  Write-Host "Using image: $ImageUri"
}

Write-Host "Creating App Runner service: $ServiceName..."

$serviceConfig = @{
  ServiceName = $ServiceName
  SourceConfiguration = @{
    AutoDeploymentsEnabled = $true
    AuthenticationConfiguration = @{
      AccessRoleArn = "arn:aws:iam::257074874944:role/AppRunnerEcrAccessRole"
    }
    ImageRepository = @{
      ImageIdentifier = $ImageUri
      ImageRepositoryType = "ECR"
      ImageConfiguration = @{
        Port = "8080"
        RuntimeEnvironmentVariables = @{
          NODE_ENV = "production"
          AUTH_TRUST_HOST = "true"
          DATABASE_URL = $DatabaseUrl
          AUTH_SECRET = $AuthSecret
          NEXTAUTH_URL = $NextAuthUrl
          AUTH_GOOGLE_ID = $GoogleId
          AUTH_GOOGLE_SECRET = $GoogleSecret
          AUTH_MICROSOFT_ENTRA_ID_ID = $MicrosoftId
          AUTH_MICROSOFT_ENTRA_ID_SECRET = $MicrosoftSecret
          OPENAI_API_KEY = $OpenAiKey
          OPENAI_MODEL = "gpt-4o-mini"
        }
      }
    }
  }
  InstanceConfiguration = @{
    Cpu = "1 vCPU"
    Memory = "2 GB"
    InstanceRoleArn = "arn:aws:iam::257074874944:role/AppRunnerInstanceRole"
  }
}

$jsonPath = Join-Path $PSScriptRoot "apprunner-service-config.json"
$serviceConfig | ConvertTo-Json -Depth 20 | Set-Content -Path $jsonPath -Encoding UTF8

$result = aws apprunner create-service `
  --cli-input-json file://$jsonPath `
  --region $Region `
  --profile $Profile `
  --output json | ConvertFrom-Json

$serviceArn = $result.Service.ServiceArn
$serviceUrl = $result.Service.ServiceUrl

Write-Host ""
Write-Host "✓ Service created successfully!"
Write-Host "Service ARN:  $serviceArn"
Write-Host "Service URL:  $serviceUrl"
Write-Host ""
Write-Host "The service will start in a few moments."
Write-Host "Check status: aws apprunner describe-service --service-arn $serviceArn --region $Region --profile $Profile"
