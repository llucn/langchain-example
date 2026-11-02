#!/bin/bash
# Wipes the application database (and flushes Redis), re-applies migrations, then restarts the
# API. Run on an instance through `pnpm db:reset:aws` (SSM), against the live version in
# /var/app/current.
set -euo pipefail

cd /var/app/current
eval "$(node .platform/scripts/load-env.js)"

for v in DB_HOST DB_PASSWORD; do
  [[ -n "${!v:-}" ]] || { echo "missing $v in environment" >&2; exit 1; }
done

# Explicit, per-invocation consent: the CLI asked for confirmation before getting here.
export DB_RESET_ALLOW_REMOTE=true

echo "==> Resetting database and Redis"
node dist/database/scripts/db-reset.js --redis
echo "==> Running migrations"
node dist/database/scripts/migrate.js
echo "==> Restarting API"
systemctl restart web.service
echo "==> Done"
