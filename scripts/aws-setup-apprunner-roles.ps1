#!/usr/bin/env pwsh
param(
  [string]$Profile = "cf-prod"
)

$ErrorActionPreference = "Stop"

# Create the ECR access role (for pulling images)
Write-Host "Creating ECR access role for App Runner..."

$trustPolicy = @{
  Version = "2012-10-17"
  Statement = @(
    @{
      Effect = "Allow"
      Principal = @{
        Service = "build.apprunner.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }
  )
} | ConvertTo-Json -Depth 10

try {
  aws iam create-role `
    --role-name AppRunnerEcrAccessRole `
    --assume-role-policy-document $trustPolicy `
    --profile $Profile | Out-Null
  Write-Host "✓ Created role: AppRunnerEcrAccessRole"
} catch {
  if ($_ -match "EntityAlreadyExists") {
    Write-Host "✓ Role already exists: AppRunnerEcrAccessRole"
  } else {
    throw
  }
}

aws iam attach-role-policy `
  --role-name AppRunnerEcrAccessRole `
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess `
  --profile $Profile 2>$null | Out-Null
Write-Host "✓ Attached ECR access policy"

# Create the instance role (for app runtime permissions if needed)
Write-Host ""
Write-Host "Creating instance role for App Runner..."

$instanceTrustPolicy = @{
  Version = "2012-10-17"
  Statement = @(
    @{
      Effect = "Allow"
      Principal = @{
        Service = "tasks.apprunner.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }
  )
} | ConvertTo-Json -Depth 10

try {
  aws iam create-role `
    --role-name AppRunnerInstanceRole `
    --assume-role-policy-document $instanceTrustPolicy `
    --profile $Profile | Out-Null
  Write-Host "✓ Created role: AppRunnerInstanceRole"
} catch {
  if ($_ -match "EntityAlreadyExists") {
    Write-Host "✓ Role already exists: AppRunnerInstanceRole"
  } else {
    throw
  }
}

Write-Host ""
Write-Host "✓ All App Runner IAM roles ready."
