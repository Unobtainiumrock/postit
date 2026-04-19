#!/usr/bin/env bash
# AWS provisioning helper for postit (Amplify + Cognito + RDS + S3).
#
# This fork does not ship a full unattended provisioner yet. Use this script
# as a checklist hook: print what to configure, then fill .env.production.local
# (start from .env.local.example) from the AWS console or from the upstream
# sharedboard automation if you port it.
#
# Usage: bash scripts/aws-provision.sh

set -euo pipefail

echo "postit — AWS / Amplify provisioning (manual checklist)"
echo ""
echo "1. Create (or reuse) Cognito User Pool + app client → NEXTAUTH_* / Cognito env vars"
echo "2. Create RDS Postgres with pgvector + pg_trgm → DATABASE_URL"
echo "3. Create S3 bucket for avatars (if used) → AWS_* env vars"
echo "4. Connect the repo to AWS Amplify; mirror env vars from .env.local.example"
echo ""
echo "Plan-of-record for stack choices: README.md + docs/CURRENT_STATUS.md"
echo ""
