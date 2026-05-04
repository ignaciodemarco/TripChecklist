param(
  [Parameter(Mandatory = $true)]
  [string]$Region,

  [Parameter(Mandatory = $true)]
  [string]$AccountId,

  [Parameter(Mandatory = $true)]
  [string]$ServiceName,

  [Parameter(Mandatory = $true)]
  [string]$ImageTag,

  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$AuthSecret,

  [Parameter(Mandatory = $true)]
  [string]$NextAuthUrl,

  [Parameter(Mandatory = $true)]
  [string]$GoogleId,

  [Parameter(Mandatory = $true)]
  [string]$GoogleSecret,

  [Parameter(Mandatory = $true)]
  [string]$MicrosoftId,

  [Parameter(Mandatory = $true)]
  [string]$MicrosoftSecret,

  [Parameter(Mandatory = $true)]
  [string]$MicrosoftIssuer,

  [Parameter(Mandatory = $true)]
  [string]$OpenAiApiKey,

  [string]$OpenAiModel = "gpt-4o-mini",

  [string]$EcrRepository = "tripchecklist"
)

$ErrorActionPreference = "Stop"

$ImageIdentifier = "$AccountId.dkr.ecr.$Region.amazonaws.com/$EcrRepository:$ImageTag"

Write-Host "Ensuring ECR repository exists..."
try {
  aws ecr describe-repositories --repository-names $EcrRepository --region $Region | Out-Null
} catch {
  aws ecr create-repository --repository-name $EcrRepository --region $Region | Out-Null
}

Write-Host "Creating App Runner access role..."
$AssumeRolePolicy = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"build.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

$RoleArn = ""
try {
  $RoleArn = aws iam get-role --role-name AppRunnerEcrAccessRole --query "Role.Arn" --output text
} catch {
  aws iam create-role --role-name AppRunnerEcrAccessRole --assume-role-policy-document $AssumeRolePolicy | Out-Null
  aws iam attach-role-policy --role-name AppRunnerEcrAccessRole --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess | Out-Null
  Start-Sleep -Seconds 10
  $RoleArn = aws iam get-role --role-name AppRunnerEcrAccessRole --query "Role.Arn" --output text
}

$ServiceConfig = @{
  ServiceName = $ServiceName
  SourceConfiguration = @{
    AutoDeploymentsEnabled = $true
    AuthenticationConfiguration = @{
      AccessRoleArn = $RoleArn
    }
    ImageRepository = @{
      ImageIdentifier = $ImageIdentifier
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
          AUTH_MICROSOFT_ENTRA_ID_ISSUER = $MicrosoftIssuer
          OPENAI_API_KEY = $OpenAiApiKey
          OPENAI_MODEL = $OpenAiModel
        }
      }
    }
  }
  InstanceConfiguration = @{
    Cpu = "1 vCPU"
    Memory = "2 GB"
  }
  HealthCheckConfiguration = @{
    Protocol = "HTTP"
    Path = "/"
    HealthyThreshold = 1
    UnhealthyThreshold = 5
    Interval = 10
    Timeout = 5
  }
}

$JsonPath = Join-Path $PSScriptRoot "apprunner-create-service.json"
$ServiceConfig | ConvertTo-Json -Depth 20 | Set-Content -Path $JsonPath -Encoding UTF8

Write-Host "Creating App Runner service..."
$Result = aws apprunner create-service --cli-input-json file://$JsonPath --region $Region
$ServiceArn = ($Result | ConvertFrom-Json).Service.ServiceArn

Write-Host ""
Write-Host "Service created successfully."
Write-Host "Service ARN: $ServiceArn"
Write-Host ""
Write-Host "Add this ARN as GitHub secret AWS_APP_RUNNER_SERVICE_ARN."
Write-Host "Also add AWS_DEPLOY_ROLE_ARN for GitHub OIDC deployment."
