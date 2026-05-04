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

This repository includes automated GitHub Actions workflows + helper scripts for AWS App Runner deployment.

### Deployment Architecture

- **Container**: Dockerfile multi-stage build (Node 20, Next.js, Prisma migrations)
- **Image Registry**: AWS ECR (Elastic Container Registry)
- **Hosting**: AWS App Runner (fully managed container service)
- **Database**: PostgreSQL (Neon or RDS)
- **CI/CD**: GitHub Actions with OIDC

### Deploy to AWS in 5 minutes

1. **Set up AWS credentials** (one-time):
```powershell
aws sso login --profile cf-prod --no-browser
./scripts/aws-setup-apprunner-roles.ps1
```

2. **Allow TripChecklist repo on the deploy role** (one-time):
```powershell
./scripts/aws-allow-tripchecklist-on-companyfactory-role.ps1
```

3. **Set GitHub repository secrets**:
   - `AWS_DEPLOY_ROLE_ARN`: the CompanyFactory-GhDeploy role ARN (shown by the trust policy script)
   - Example: `arn:aws:iam::257074874944:role/CompanyFactory-GhDeploy`

4. **Push to main branch**:
```powershell
git add .
git commit -m "Deploy to AWS"
git push
```
   This triggers the GitHub Action, which builds and pushes the image to ECR.

5. **Once image is in ECR**, create the App Runner service:
```powershell
./scripts/aws-create-apprunner-service.ps1 `
  -DatabaseUrl "postgresql://..." `
  -AuthSecret "..." `
  -GoogleId "..." `
  -GoogleSecret "..." `
  -MicrosoftId "..." `
  -MicrosoftSecret "..." `
  -OpenAiKey "..."
```

The service will be live within 2-3 minutes.

### Scripts

- `scripts/aws-setup-apprunner-roles.ps1` — Create IAM roles for App Runner (one-time)
- `scripts/aws-allow-tripchecklist-on-companyfactory-role.ps1` — Update deploy role trust (one-time)
- `scripts/aws-create-apprunner-service.ps1` — Create/deploy the service

### Environment Variables

Required in App Runner:
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — NextAuth secret (generate: `npx auth secret`)
- `NEXTAUTH_URL` — Production domain
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`
- `OPENAI_API_KEY`, `OPENAI_MODEL`

### GitHub Actions Workflow

The workflow `.github/workflows/deploy-aws-apprunner.yml` automatically:
1. Checks out code on push to `main`
2. Assumes the GitHub OIDC role (CompanyFactory-GhDeploy)
3. Logs in to ECR
4. Builds and pushes the Docker image
5. Triggers App Runner auto-deployment (if service exists)

## Useful Commands

```powershell
npm run dev
npm run build
npm start
npm run db:studio
npm run db:migrate
```
