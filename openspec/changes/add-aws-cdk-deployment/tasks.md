## 1. Workspace and API scripts

- [x] 1.1 Add `infra` to `pnpm-workspace.yaml`, rename the package to `@app/infra`, run `pnpm install` and commit the lockfile; add `infra/cdk.out` and `infra/build` to ESLint ignores; make `pnpm lint` and `pnpm checkstyle` pass on `infra` and `scripts`
- [x] 1.2 Add `apps/api/src/database/scripts/migrate.ts`: connect, take `pg_advisory_lock`, `runMigrations()`, unlock, exit non-zero on failure
- [x] 1.3 Change `db-reset.ts` to refuse `NODE_ENV=production` unless `DB_RESET_ALLOW_REMOTE=true`; confirm `dist/database/scripts/{migrate,db-reset}.js` exist after `pnpm --filter @app/api build`
- [x] 1.4 Grep Redis usage in `apps/api` to confirm no queue needs the `noeviction` policy (decision 6)

## 2. CDK app (`infra/`)

- [x] 2.1 `lib/config.ts`: project prefix helper (`langchain-example-<stage>`, stack ids), region from `AWS_REGION`, drop the Cognito pool constant and `cognito` config, replace `OPTIONAL_API_ENV` with this API's list (`OIDC_COGNITO_DOMAIN`, `OIDC_SCOPE`, `ADMIN_GROUP`, `MODEL_BASE_URL`, `CONFIG_SOURCE`, `CONFIG_REF`, `CONFIG_GITHUB_API_URL`, `EVOLUTION_MODEL`, `EVOLUTION_MAX_TOKENS`, `APP_VERSION`)
- [x] 2.2 `bin/app.ts`: new stack ids and package/context names, region from `AWS_REGION` with a clear error when unset
- [x] 2.3 `lib/data-stack.ts`: database `langchain_example`, secrets `DB_PASSWORD`, `ORIGIN_VERIFY_SECRET` (generated) and `MODEL_API_KEY`, `CONFIG_GITHUB_TOKEN` (provided), remove `INTAKE_CONFIG_SECRET`, `VOYAGE_API_KEY` and the asset bucket, Redis in-transit encryption on, parameter group per task 1.4
- [x] 2.4 `lib/app-stack.ts`: re-map properties and secrets to the API variables (design decision 5), `API_PORT`, `AUTH_ENABLED=true`, `DB_SSL_REJECT_UNAUTHORIZED=false`, `REDIS_TLS=true`, remove the Cognito IAM policy, asset bucket grant and SPA-rewrite function, remove the Twilio wording, EB/ALB idle timeout 120 s, CloudFront `/api/*` origin read timeout 60 s, new names
- [x] 2.5 `infra/package.json` (name, scripts), `infra/.env.example` (deploy settings of this project, no Voyage, no `COGNITO_AUDIENCE`, no Twilio), `infra/.gitignore` check
- [x] 2.6 Update `infra/test/stacks.test.ts` to the new guarantees (naming, secrets list, no foreign variables, no AWS keys, redis TLS, CloudFront behaviors, health path, no asset bucket); `pnpm --filter @app/infra test` and `typecheck` pass offline

## 3. Elastic Beanstalk bundle

- [x] 3.1 `infra/scripts/bundle-api.sh`: `@app/shared` and `@app/api` build/deploy commands, `node` instead of `python3`, no `docs/database-migration.md`, keep the `.env*` safety net; produce `infra/build/api-bundle.zip`
- [x] 3.2 `.platform/hooks/predeploy/01_migrate_and_seed.sh` → rename to `01_migrate.sh`: read variables via `load-env.js`, check `DB_HOST DB_PASSWORD`, run `node dist/database/scripts/migrate.js` (no seed); make it executable in the zip
- [x] 3.3 `.platform/scripts/reset-data.sh`: set `DB_RESET_ALLOW_REMOTE=true`, run `dist/database/scripts/db-reset.js --redis` then `migrate.js`, restart `web.service`
- [x] 3.4 Add `.platform/nginx/conf.d/streaming.conf` (`proxy_read_timeout 120s`, buffering off); `Procfile` stays `web: node dist/main.js`
- [x] 3.5 Inspect the produced zip: contains `dist`, `.platform`, `Procfile`, production `node_modules`; no `.env*`, no source maps, no dangling symlinks

## 4. Deploy CLI (`scripts/aws.sh`)

- [x] 4.1 Names (`LangchainExample-<stage>-*`, `langchain-example-<stage>`), region from `AWS_REGION`, allow-listed loader for root `.env` + `infra/.env.<stage>` with the documented precedence (design decision 4), no `Twilio`/`Postmark` text
- [x] 4.2 `deploy`: required vars `OIDC_ISSUER OIDC_CLIENT_ID MODEL_API_KEY CONFIG_GITHUB_TOKEN`; build `@app/shared` then `@app/web` with `OIDC_*` exported; write secrets `MODEL_API_KEY`, `CONFIG_GITHUB_TOKEN`; keep the ROLLBACK_COMPLETE recovery for both stacks
- [x] 4.3 Post-deploy output: App URL, health URL, Cognito callback `<url>/` and sign-out `<url>/`; nothing else
- [x] 4.4 `destroy` and `reset-data` (typed-stage confirmation, SSM run, environment name `langchain-example-<stage>`); update usage text; `bootstrap` uses `AWS_REGION`
- [x] 4.5 Run `bash -n scripts/aws.sh infra/scripts/bundle-api.sh` and `shellcheck` if available

## 5. Root scripts and docs

- [x] 5.1 Add to root `package.json`: `infra:bootstrap`, `infra:synth`, `infra:diff`, `deploy:aws`, `destroy:aws`, `db:reset:aws` (each `bash scripts/aws.sh <command>`; `db:reset:aws` → `reset-data`)
- [x] 5.2 Write `docs/aws-deployment.md`: prerequisites (aws CLI v2, Git Bash, zip, pnpm, IAM rights), settings table and precedence, commands, Cognito registration steps, cost and timing notes, troubleshooting (Redis TLS fallback, SSE timeouts, `ROLLBACK_COMPLETE`), destroy/reset
- [x] 5.3 Add a short pointer in `README.md` and a deploy-settings note in `.env.example`

## 6. Verification against AWS

- [x] 6.1 `pnpm install`, `pnpm lint`, `pnpm checkstyle`, `pnpm test` pass
- [x] 6.2 Confirm the `.env` credentials work (`aws sts get-caller-identity`, without printing keys); run `pnpm infra:bootstrap`
- [x] 6.3 `pnpm infra:synth` and `pnpm infra:diff` produce the expected resources
- [x] 6.4 `pnpm deploy:aws` succeeds; `curl <url>/api/health` returns `ok`; the SPA loads at `<url>/`; EB logs show migrations applied once
- [ ] 6.5 After the Cognito URLs are registered by the pool owner: sign in, send a chat message and confirm streaming works; run `pnpm db:reset:aws -- --yes` once and re-check health
- [ ] 6.6 Re-run `pnpm deploy:aws` to confirm an in-place update is a no-op; leave the stack running or `pnpm destroy:aws` per the user's choice
