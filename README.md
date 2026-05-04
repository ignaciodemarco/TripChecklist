# Trip Checklist

Weather-aware smart packing list, with per-user accounts (Google or Microsoft sign-in), saved trips,
editable personal defaults, and an Imperial / Metric toggle.

Built with Next.js 15 + TypeScript + Tailwind + Prisma + NextAuth (Auth.js v5).

## Quick Start (Local)

```powershell
# 1. Install
npm install

# 2. Copy env and fill in values
copy .env.example .env

# 3. Generate a secret for NextAuth
npx auth secret

# 4. Run migrations
npx prisma migrate dev --name init

# 5. Run app
npm run dev
# http://localhost:3001
```

## Database

This project uses PostgreSQL in production.

Recommended:
- Local development: Neon free PostgreSQL
- Production: Neon, Amazon RDS PostgreSQL, or any managed PostgreSQL

Set DATABASE_URL in .env:

```env
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
```

## OAuth Setup

### Google

1. Create OAuth credentials in Google Cloud Console.
2. Add redirect URIs:
   - http://localhost:3001/api/auth/callback/google
   - https://your-production-domain/api/auth/callback/google

### Microsoft Entra ID

1. Create App Registration in Azure.
2. Add redirect URIs:
   - http://localhost:3001/api/auth/callback/microsoft-entra-id
   - https://your-production-domain/api/auth/callback/microsoft-entra-id

## AWS Production Deploy (App Runner)

This repository includes:
- Dockerfile
- .dockerignore
- GitHub Action: .github/workflows/deploy-aws-apprunner.yml
- Bootstrap script: scripts/aws-bootstrap-apprunner.ps1

### Reuse the same AWS account as CompanyFactory

Yes. You can deploy this app in the same account used by CompanyFactory (257074874944).

If you want to reuse the same GitHub OIDC deploy role (CompanyFactory-GhDeploy), allow this repo in the trust policy:

```powershell
./scripts/aws-allow-tripchecklist-on-companyfactory-role.ps1
```

Then set GitHub secret AWS_DEPLOY_ROLE_ARN in this repository to that role ARN.

### One-time setup

1. Authenticate AWS CLI:

```powershell
aws login
```

2. Build and push first image to ECR:

```powershell
aws ecr create-repository --repository-name tripchecklist --region us-east-1
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker build -t tripchecklist:latest .
docker tag tripchecklist:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/tripchecklist:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/tripchecklist:latest
```

3. Create App Runner service:

```powershell
./scripts/aws-bootstrap-apprunner.ps1 \
  -Region us-east-1 \
  -AccountId <account-id> \
  -ServiceName tripchecklist \
  -ImageTag latest \
  -DatabaseUrl "<postgres-url>" \
  -AuthSecret "<auth-secret>" \
  -NextAuthUrl "https://<apprunner-domain>" \
  -GoogleId "<google-id>" \
  -GoogleSecret "<google-secret>" \
  -MicrosoftId "<microsoft-id>" \
  -MicrosoftSecret "<microsoft-secret>" \
  -MicrosoftIssuer "https://login.microsoftonline.com/common/v2.0" \
  -OpenAiApiKey "<openai-key>"
```

4. Configure GitHub secrets:
- AWS_DEPLOY_ROLE_ARN
- AWS_APP_RUNNER_SERVICE_ARN

After this, every push to main auto-deploys to AWS App Runner.

## Useful Commands

```powershell
npm run dev
npm run build
npm start
npm run db:studio
npm run db:migrate
```
