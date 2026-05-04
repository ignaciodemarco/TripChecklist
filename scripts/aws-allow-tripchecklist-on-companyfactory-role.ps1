param(
  [string]$RoleName = "CompanyFactory-GhDeploy",
  [string]$Owner = "ignaciodemarco",
  [string]$Repo = "TripChecklist"
)

$ErrorActionPreference = "Stop"

$repoSubject = "repo:$Owner/$Repo:*"

Write-Host "Reading current trust policy from role $RoleName..."
$raw = aws iam get-role --role-name $RoleName --query "Role.AssumeRolePolicyDocument" --output json
$policy = $raw | ConvertFrom-Json

$updated = $false

foreach ($stmt in $policy.Statement) {
  if ($stmt.Action -eq "sts:AssumeRoleWithWebIdentity" -and $stmt.Principal.Federated -like "*token.actions.githubusercontent.com") {
    $stringLike = $stmt.Condition."StringLike"
    if (-not $stringLike) {
      $stmt.Condition | Add-Member -NotePropertyName "StringLike" -NotePropertyValue (@{})
      $stringLike = $stmt.Condition."StringLike"
    }

    $sub = $stringLike."token.actions.githubusercontent.com:sub"

    if ($sub -is [string]) {
      if ($sub -ne $repoSubject) {
        $stringLike."token.actions.githubusercontent.com:sub" = @($sub, $repoSubject)
        $updated = $true
      }
    } elseif ($sub -is [System.Array]) {
      if (-not ($sub -contains $repoSubject)) {
        $stringLike."token.actions.githubusercontent.com:sub" += $repoSubject
        $updated = $true
      }
    } elseif (-not $sub) {
      $stringLike."token.actions.githubusercontent.com:sub" = @($repoSubject)
      $updated = $true
    }
  }
}

if (-not $updated) {
  Write-Host "No trust policy changes were needed."
  exit 0
}

$tempFile = Join-Path $PSScriptRoot "companyfactory-gh-deploy-trust-policy.json"
$policy | ConvertTo-Json -Depth 20 | Set-Content -Path $tempFile -Encoding UTF8

Write-Host "Updating trust policy to allow $repoSubject ..."
aws iam update-assume-role-policy --role-name $RoleName --policy-document file://$tempFile | Out-Null

Write-Host "Done. Role $RoleName now trusts GitHub OIDC tokens from $repoSubject."
