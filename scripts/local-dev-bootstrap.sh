#!/usr/bin/env bash
# One-shot local database bootstrap: Docker Postgres → schema → taxonomy.
# Run from repo root: bash scripts/local-dev-bootstrap.sh
#
# Prerequisites: Docker Desktop (or docker on PATH) running.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not found. Install Docker Desktop, start it, ensure \`docker\` is on your PATH, then re-run:" >&2
  echo "  bash scripts/local-dev-bootstrap.sh" >&2
  exit 1
fi

echo "→ Starting Postgres (docker compose)..."
npm run db:up

echo "→ Waiting for postgres_postit to accept connections..."
for i in $(seq 1 45); do
  if docker exec postgres_postit pg_isready -U postgres -d postit >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ "$i" -eq 45 ]]; then
    echo "ERROR: Postgres did not become ready in time." >&2
    exit 1
  fi
done

echo "→ Loading schema..."
npm run db:setup

echo "→ Seeding taxonomy..."
npm run taxonomy:seed

echo ""
echo "OK. Next: npm run dev"
echo "Then open the URL shown in the terminal (often http://localhost:3000)."
echo "Sign in with BOOTSTRAP_ADMIN_EMAIL from .env.local (invite token blank)."
