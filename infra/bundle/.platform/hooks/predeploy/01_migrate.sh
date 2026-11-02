#!/bin/bash
# Runs before the new version is swapped in, on every instance. The Node script takes a
# PostgreSQL advisory lock, so concurrent instances serialize and only the first does real work
# (the others find nothing to apply). A non-zero exit fails the deployment.
set -euo pipefail

cd /var/app/staging

# At predeploy time Elastic Beanstalk has not written an env file yet, so read the
# environment properties and the resolved Secrets Manager values directly.
eval "$(node .platform/scripts/load-env.js)"

for v in DB_HOST DB_PASSWORD; do
  [[ -n "${!v:-}" ]] || { echo "missing $v in environment" >&2; exit 1; }
done

node dist/database/scripts/migrate.js
