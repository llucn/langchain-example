#!/usr/bin/env bash
# Builds the API from a clean tree and packages the Elastic Beanstalk bundle:
#   infra/build/api-bundle.zip
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/infra/build"
STAGE_DIR="$OUT/api"

cd "$ROOT"
# Stale dist output would ship stale migrations.
rm -rf apps/api/dist "$OUT/api" "$OUT/api-bundle.zip"
mkdir -p "$OUT"

pnpm --filter @app/shared build
pnpm --filter @app/api build

# Production-only, flat node_modules. npm (not `pnpm deploy`) is used on purpose: pnpm's
# symlink/junction layout cannot be zipped portably on Windows and duplicates every package.
mkdir -p "$STAGE_DIR/vendor/shared"
cp -R packages/shared/dist packages/shared/package.json "$STAGE_DIR/vendor/shared/"
node "$ROOT/infra/scripts/make-bundle-package.js" apps/api/package.json "$STAGE_DIR"
(cd "$STAGE_DIR" && npm install --omit=dev --install-links --legacy-peer-deps --no-audit --no-fund --package-lock=false)

cp -R apps/api/dist "$STAGE_DIR/dist"
cp infra/bundle/Procfile "$STAGE_DIR/Procfile"
cp -R infra/bundle/.platform "$STAGE_DIR/.platform"

# Safety net: never ship local environment files.
if find "$STAGE_DIR" -maxdepth 1 -name '.env*' | grep -q .; then
  echo "refusing to bundle: .env file present" >&2; exit 1
fi

(cd "$STAGE_DIR" && zip -qr "$OUT/api-bundle.zip" . -x '*.map')
# Windows zip builds drop the executable bit that Elastic Beanstalk needs for hooks and scripts.
node "$ROOT/infra/scripts/zip-set-exec.js" "$OUT/api-bundle.zip" .platform/hooks/ .platform/scripts/
echo "Bundle: $OUT/api-bundle.zip ($(du -h "$OUT/api-bundle.zip" | cut -f1))"
