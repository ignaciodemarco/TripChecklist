#!/usr/bin/env pwsh
# Provisions a small RDS PostgreSQL instance for TripChecklist.
# Cost: ~$13/month for db.t3.micro + storage.

param(
  [string]$Profile = "cf-prod",
  [string]$Region = "us-east-1",
  [string]$DbInstanceId = "tripchecklist-db",
  [string]$DbName = "tripchecklist",
  [string]$DbUsername = "tripchecklist"
)

$ErrorActionPreference = "Stop"
$env:AWS_PROFILE = $Profile

# Generate a strong random password
Add-Type -AssemblyName System.Web
$DbPassword = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})

Write-Host "Looking up default VPC..."
$vpcId = aws ec2 describe-vpcs --filters "Name=is-default,Values=true" --query "Vpcs[0].VpcId" --output text --region $Region

Write-Host "Default VPC: $vpcId"

Write-Host "Creating security group..."
$sgId = $null
try {
  $sgId = aws ec2 create-security-group `
    --group-name tripchecklist-db-sg `
    --description "TripChecklist Postgres DB - public access" `
    --vpc-id $vpcId `
    --region $Region `
    --query 'GroupId' --output text 2>$null
  Write-Host "Created security group: $sgId"
  
  aws ec2 authorize-security-group-ingress `
    --group-id $sgId `
    --protocol tcp `
    --port 5432 `
    --cidr 0.0.0.0/0 `
    --region $Region | Out-Null
  Write-Host "Opened port 5432"
} catch {
  $sgId = aws ec2 describe-security-groups --filters "Name=group-name,Values=tripchecklist-db-sg" --query "SecurityGroups[0].GroupId" --output text --region $Region
  Write-Host "Reusing existing security group: $sgId"
}

Write-Host "Creating RDS PostgreSQL instance (this takes 5-10 minutes)..."
try {
  aws rds create-db-instance `
    --db-instance-identifier $DbInstanceId `
    --db-instance-class db.t3.micro `
    --engine postgres `
    --engine-version 16.3 `
    --master-username $DbUsername `
    --master-user-password $DbPassword `
    --allocated-storage 20 `
    --storage-type gp3 `
    --db-name $DbName `
    --vpc-security-group-ids $sgId `
    --publicly-accessible `
    --backup-retention-period 1 `
    --no-multi-az `
    --no-deletion-protection `
    --region $Region | Out-Null
  Write-Host "RDS instance creation initiated."
} catch {
  Write-Host "RDS instance may already exist; will fetch existing one."
}

Write-Host ""
Write-Host "Waiting for RDS instance to become available..."
aws rds wait db-instance-available --db-instance-identifier $DbInstanceId --region $Region

$endpoint = aws rds describe-db-instances `
  --db-instance-identifier $DbInstanceId `
  --query 'DBInstances[0].Endpoint.Address' `
  --output text --region $Region

Write-Host ""
Write-Host "✓ RDS instance ready"
Write-Host "  Endpoint: $endpoint"
Write-Host "  Database: $DbName"
Write-Host "  Username: $DbUsername"
Write-Host ""

$databaseUrl = "postgresql://${DbUsername}:${DbPassword}@${endpoint}:5432/${DbName}?sslmode=require"

# Save credentials to a local file (gitignored)
$credPath = Join-Path $PSScriptRoot "rds-credentials.local.txt"
@"
DATABASE_URL=$databaseUrl
DB_ENDPOINT=$endpoint
DB_NAME=$DbName
DB_USERNAME=$DbUsername
DB_PASSWORD=$DbPassword
"@ | Set-Content -Path $credPath -Encoding UTF8

Write-Host "✓ Credentials saved to: $credPath"
Write-Host ""
Write-Host "DATABASE_URL=$databaseUrl"
