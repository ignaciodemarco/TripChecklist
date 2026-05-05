#!/usr/bin/env pwsh
# Creates the App Runner service from local .env + scripts/rds-credentials.local.txt
$ErrorActionPreference = "Stop"
$env:AWS_PROFILE = "cf-prod"
$Region = "us-east-1"

# Load .env
$envVars = @{}
Get-Content .env | ForEach-Object {
  if ($_ -match "^([A-Z_]+)=(.*)$") { $envVars[$matches[1]] = $matches[2].Trim('"') }
}

# Load RDS creds
$rdsCreds = @{}
Get-Content scripts/rds-credentials.local.txt | ForEach-Object {
  if ($_ -match "^([A-Z_]+)=(.*)$") { $rdsCreds[$matches[1]] = $matches[2] }
}

$databaseUrl = $rdsCreds["DATABASE_URL"]
$authSecret = $envVars["AUTH_SECRET"]
$googleId = $envVars["AUTH_GOOGLE_ID"]
$googleSecret = $envVars["AUTH_GOOGLE_SECRET"]
$openAiKey = $envVars["OPENAI_API_KEY"]

# Get image URI
$tag = aws ecr describe-images --repository-name tripchecklist --region $Region --query 'imageDetails[0].imageTags[0]' --output text
$imageUri = "257074874944.dkr.ecr.${Region}.amazonaws.com/tripchecklist:${tag}"
Write-Host "Image: $imageUri"

# Get role ARN
$ecrRoleArn = aws iam get-role --role-name AppRunnerEcrAccessRole --query "Role.Arn" --output text
$instanceRoleArn = aws iam get-role --role-name AppRunnerInstanceRole --query "Role.Arn" --output text

$envVarsForApp = @{
  NODE_ENV = "production"
  AUTH_TRUST_HOST = "true"
  DATABASE_URL = $databaseUrl
  AUTH_SECRET = $authSecret
  NEXTAUTH_URL = "https://placeholder.awsapprunner.com"
  AUTH_GOOGLE_ID = $googleId
  AUTH_GOOGLE_SECRET = $googleSecret
  OPENAI_API_KEY = $openAiKey
  OPENAI_MODEL = "gpt-4o-mini"
}

$serviceConfig = @{
  ServiceName = "tripchecklist"
  SourceConfiguration = @{
    AutoDeploymentsEnabled = $true
    AuthenticationConfiguration = @{
      AccessRoleArn = $ecrRoleArn
    }
    ImageRepository = @{
      ImageIdentifier = $imageUri
      ImageRepositoryType = "ECR"
      ImageConfiguration = @{
        Port = "8080"
        RuntimeEnvironmentVariables = $envVarsForApp
      }
    }
  }
  InstanceConfiguration = @{
    Cpu = "1 vCPU"
    Memory = "2 GB"
    InstanceRoleArn = $instanceRoleArn
  }
  HealthCheckConfiguration = @{
    Protocol = "TCP"
    HealthyThreshold = 1
    UnhealthyThreshold = 5
    Interval = 10
    Timeout = 5
  }
}

$jsonPath = "scripts/apprunner-service-config.json"
$serviceConfig | ConvertTo-Json -Depth 20 | Set-Content -Path $jsonPath -Encoding UTF8

Write-Host "Creating App Runner service..."
$result = aws apprunner create-service --cli-input-json file://$jsonPath --region $Region --output json | ConvertFrom-Json
$serviceArn = $result.Service.ServiceArn
$serviceUrl = $result.Service.ServiceUrl

Write-Host ""
Write-Host "Service ARN: $serviceArn"
Write-Host "Service URL: https://$serviceUrl"
Write-Host ""

# Save service ARN
"SERVICE_ARN=$serviceArn`nSERVICE_URL=https://$serviceUrl" | Set-Content scripts/apprunner-service.local.txt

# Now update NEXTAUTH_URL with real URL
Write-Host "Updating NEXTAUTH_URL with real domain..."
Start-Sleep -Seconds 5
$envVarsForApp["NEXTAUTH_URL"] = "https://$serviceUrl"
$updateConfig = @{
  ImageRepository = @{
    ImageIdentifier = $imageUri
    ImageRepositoryType = "ECR"
    ImageConfiguration = @{
      Port = "8080"
      RuntimeEnvironmentVariables = $envVarsForApp
    }
  }
  AutoDeploymentsEnabled = $true
  AuthenticationConfiguration = @{
    AccessRoleArn = $ecrRoleArn
  }
}
$updateJson = "scripts/apprunner-update.local.json"
@{ ServiceArn = $serviceArn; SourceConfiguration = $updateConfig } | ConvertTo-Json -Depth 20 | Set-Content $updateJson
aws apprunner update-service --cli-input-json file://$updateJson --region $Region | Out-Null
Write-Host "Service URL: https://$serviceUrl"
