## Context

`infra/` and `scripts/aws.sh` were copied from a sibling project. Both projects use Node.js 22, PostgreSQL 16 and Redis 7, and the same shape: VPC (public / app / isolated subnets), RDS + ElastiCache in isolated subnets, an Elastic Beanstalk (Node.js 22, ALB) backend in private subnets, and an S3 + CloudFront frontend that forwards `/api/*` to the ALB (ALB reachable only from CloudFront's prefix list, plus an `X-Origin-Verify` secret header). The copy is partial (no root files, no app code) and is only a reference.

Analysis of what differs in this repo (each item becomes a task):

| Area                 | Sibling project (copied)                                                                               | This project                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Names                | `delta-intake-<stage>`, `DeltaIntake-<stage>-*`, DB `delta_intake`, pkg `@delta-intake/*`              | `langchain-example-<stage>`, `LangchainExample-<stage>-*`, DB `langchain_example`, `@app/*`                                                                         |
| Region               | hard-coded `us-east-2`                                                                                 | `AWS_REGION` from root `.env` (currently `us-east-2`)                                                                                                               |
| DB env               | `DATABASE_HOST/PORT/NAME/USERNAME/PASSWORD/SSL`                                                        | `DB_HOST/PORT/NAME/USER/PASSWORD/SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, `DB_SSL_CA_PATH`                                                                               |
| Redis env            | clients without TLS support                                                                            | `REDIS_HOST/PORT/PASSWORD/DB/TLS` (ioredis TLS supported)                                                                                                           |
| Listen port          | `PORT=3000`                                                                                            | `API_PORT=3000`                                                                                                                                                     |
| Auth env             | `COGNITO_ISSUER/JWKS_URI/USER_POOL_ID/AUDIENCE` (fixed pool id in code)                                | `AUTH_ENABLED=true`, `OIDC_ISSUER`, `OIDC_CLIENT_ID` (API) and `OIDC_ISSUER/CLIENT_ID/COGNITO_DOMAIN/SCOPE` (web build); the pool is operator-supplied, not in code |
| Secrets              | `DATABASE_PASSWORD`, `INTAKE_CONFIG_SECRET`, `ORIGIN_VERIFY_SECRET`, `MODEL_API_KEY`, `VOYAGE_API_KEY` | `DB_PASSWORD`, `ORIGIN_VERIFY_SECRET`, `MODEL_API_KEY`, `CONFIG_GITHUB_TOKEN`                                                                                       |
| Other env            | classification/embedding/suggestion/chat tuning, `USER_SYNC_INTERVAL_MINUTES`                          | `MODEL_BASE_URL`, `CONFIG_SOURCE`, `CONFIG_REF`, `CONFIG_GITHUB_API_URL`, `ADMIN_GROUP`, `APP_VERSION`, `EVOLUTION_MODEL`, `EVOLUTION_MAX_TOKENS`                   |
| AWS SDK use in app   | S3 presigned uploads, Cognito admin calls                                                              | none (`@aws-sdk/*` is not a dependency) → no asset bucket, no instance IAM beyond EB/SSM + secret read                                                              |
| Twilio / Postmark    | webhooks, CloudFront comment, deploy output                                                            | none → removed                                                                                                                                                      |
| OIDC redirect        | `<url>/callback`                                                                                       | `<url>/` (HashRouter; `redirect_uri = origin + pathname`), sign-out URL `<url>/`                                                                                    |
| Web OIDC config      | `VITE_COGNITO_*`                                                                                       | `OIDC_*` read by Vite (`envPrefix`, `envDir` = repo root) at build time                                                                                             |
| Monorepo             | `@delta-intake/api`, `pnpm build:packages`                                                             | `@app/api`, `@app/shared` (`pnpm --filter @app/shared build`)                                                                                                       |
| Migrations / seed    | compiled `dist/scripts/post-deploy.js`, `docs/database-migration.md`                                   | migrations in `dist/database/migrations`, scripts in `dist/database/scripts`; the seed only adds a dummy user                                                       |
| Reset                | `DB_RESET_ALLOW_REMOTE` honored                                                                        | `db-reset.ts` hard-refuses `NODE_ENV=production`                                                                                                                    |
| Toolchain on Windows | `python3` used by the bundle script                                                                    | no `python3` on this machine; `node` is guaranteed                                                                                                                  |
| Streaming            | JSON only                                                                                              | chat replies are SSE (`X-Accel-Buffering: no` already set) and may be silent for a while                                                                            |
| Workspace            | `infra` is a workspace package                                                                         | `pnpm-workspace.yaml` lists only `apps/*` and `packages/*`                                                                                                          |

## Goals / Non-Goals

**Goals:**

- One command (`pnpm deploy:aws`) builds web + API, deploys the Data and App stacks and prints the URL and the Cognito URLs to register; re-running updates in place.
- Secrets never appear as plain Elastic Beanstalk properties or in git; the real values come from the environment / git-ignored files.
- Migrations run automatically on deploy, exactly once under concurrency; failure fails the deployment.
- `pnpm db:reset:aws` and `pnpm destroy:aws` are guarded by explicit confirmation.
- CDK tests (`jest`, no AWS access) cover the main guarantees.

**Non-Goals:**

- GitHub workflow / CI deployment (explicitly out of scope; follow-up change).
- Multiple stages (only `dev`; the stage parameter stays so `prod` can be added), custom domain/ACM, WAF, Multi-AZ, backups beyond 1 day.
- Creating the Cognito user pool or app client (existing, operator-supplied); migrating existing data.
- Changing app behavior.

## Decisions

1. **Keep the copied architecture (two stacks, EB + CloudFront).** It is proven for the same stack and the user asked to reuse it. The Data stack (VPC, RDS, Redis, secrets) outlives App stack rebuilds. _Alternative: ECS/Fargate – rejected, would redo working code._

2. **Naming** via one `prefix = langchain-example-<stage>` derived in `config.ts` (stack ids `LangchainExample-<stage>-Data|App`, secret names `<prefix>/<NAME>`, EB app/env names). `aws.sh` uses the same names.

3. **Region from `AWS_REGION`.** `bin/app.ts` uses `process.env.AWS_REGION` (fails clearly if unset); `aws.sh` loads it from root `.env`. The fixed `us-east-2` constant and the sibling's pool id are removed from code. _Alternative: keep the constant – rejected: the user's `.env` already carries the region and the sibling pool must not leak into this project._

4. **Settings sources in `aws.sh`**: precedence is real environment > `infra/.env.<stage>` (git-ignored) > root `.env`, and only an allow-list of keys is ever read from the root `.env`: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_COGNITO_DOMAIN`, `OIDC_SCOPE`, `MODEL_BASE_URL`, `MODEL_API_KEY`, `CONFIG_*`, `ADMIN_GROUP`, `EVOLUTION_*`, `APP_VERSION`. Local-only values (`DB_*`, `REDIS_*`, `NODE_ENV`, `AUTH_ENABLED`, ports) are never read, so local development settings cannot leak into the cloud. The root `.env` is parsed line by line (not `source`d). _Alternative: infra/.env.dev only – rejected: duplicates keys the developer already maintains._ `AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY` are used only by the CLI/CDK process; they are never copied to Elastic Beanstalk (the instance role is used).

5. **Elastic Beanstalk configuration.** Plain properties: `NODE_ENV=production`, `API_PORT=3000` (+ process port 3000), `AUTH_ENABLED=true`, `DB_HOST/PORT/NAME/USER`, `DB_SSL=true`, `DB_SSL_REJECT_UNAUTHORIZED=false` (RDS PG16 forces SSL; the RDS CA bundle is not shipped; the DB is in an isolated subnet reachable only from the app SG), `REDIS_HOST/PORT`, `REDIS_TLS=true`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, plus optional `ADMIN_GROUP`/`MODEL_BASE_URL`/`CONFIG_SOURCE`/`CONFIG_REF`/`CONFIG_GITHUB_API_URL`/`EVOLUTION_*`/`APP_VERSION` only when non-empty (allow-list `OPTIONAL_API_ENV` in `config.ts`). `DB_MIGRATIONS_RUN` stays false (migrations run in the predeploy hook). Secrets (`environmentsecrets`): `DB_PASSWORD`, `MODEL_API_KEY`, `CONFIG_GITHUB_TOKEN`, `ORIGIN_VERIFY_SECRET`. `DB_PASSWORD` and `ORIGIN_VERIFY_SECRET` are generated; `MODEL_API_KEY` and `CONFIG_GITHUB_TOKEN` are created with a placeholder and written by `deploy:aws` (`put_secret_if_changed`). The EB instance role may read only these secrets. The instance reaches GitHub (config repo), the model endpoint and MCP servers through the NAT gateway.

6. **Redis with in-transit encryption** (`transitEncryptionEnabled: true`, `REDIS_TLS=true`, no AUTH token → `REDIS_PASSWORD` empty). The sibling disabled it because its clients lacked TLS; this repo's ioredis provider supports it. The `noeviction` parameter group of the sibling existed for Bull queues; this API has no Bull dependency, so the default parameter group is used (task: verify with a grep of Redis usage before dropping it).

7. **No asset bucket, no Cognito IAM policy, no Voyage/intake secrets.** Nothing in this app uses them (no `@aws-sdk/*`, no S3). Removing them shrinks IAM and cost.

8. **Frontend build inputs.** `deploy` builds `@app/shared` then `@app/web` with `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_COGNITO_DOMAIN`, `OIDC_SCOPE` exported from the resolved settings (Vite's `loadEnv` lets process env win over the root `.env`, so local values do not leak into the build). Required: `OIDC_ISSUER`, `OIDC_CLIENT_ID`. The API gets the same issuer/client id. CloudFront serves the SPA at `/` with a default root object; `HashRouter` means no deep-link rewrite is needed, so the copied CloudFront SPA-rewrite function is dropped.

9. **Cognito URLs.** After deploy print: Callback URL `<url>/`, Sign-out URL `<url>/`, API health `<url>/api/health`. Cognito requires these registered by the pool owner (not automated).

10. **Migrations on deploy.** New `apps/api/src/database/scripts/migrate.ts` (compiled to `dist/database/scripts/migrate.js`): takes `pg_advisory_lock`, runs `dataSource.runMigrations()`, releases. The predeploy hook runs it after `load-env.js` exports the EB properties and secrets. No seed on AWS. _Alternative: `DB_MIGRATIONS_RUN=true` at API start – rejected: races on multi-instance and fails app start instead of failing the deploy._ Migrations enable `vector`/`pgcrypto`; both are allowed for the RDS master user.

11. **Reset.** `db-reset.ts` keeps refusing `NODE_ENV=production` unless `DB_RESET_ALLOW_REMOTE=true` is set. `reset-data.sh` (run through SSM `send-command` on an instance) sets it, runs `dist/database/scripts/db-reset.js --redis`, then `migrate.js`, then restarts `web.service`. `db:reset:aws` asks the user to type the stage name unless `--yes`.

12. **Bundle.** `bundle-api.sh`: build `@app/shared` and `@app/api`, write a bundle `package.json` (API runtime dependencies, `@app/shared` vendored from `packages/shared`), run `npm install --omit=dev --install-links --legacy-peer-deps` for a flat `node_modules`, copy `dist`, `Procfile` (`web: node dist/main.js`) and `.platform`, refuse to include any `.env*`, zip, then mark `.platform` hooks/scripts executable in the zip (`zip-set-exec.js`; Windows zip drops the mode bit). _Alternative: `pnpm deploy` – rejected on Windows: its link layout cannot be zipped (zip build lacks `-y`) and following links gave a 169 MB / 88k-file bundle. Trade-off: npm resolves versions from semver ranges, not `pnpm-lock.yaml`; the production dependency set can differ slightly from tested versions._ The `docs/database-migration.md` copy is removed (no such file).

13. **Streaming through CloudFront/ALB.** Chat replies are SSE and the agent may be silent while it works. Set the CloudFront `/api/*` origin read timeout to 60 s (default 30 s), ALB idle timeout to 120 s (`aws:elbv2:loadbalancer IdleTimeout`), and nginx `proxy_read_timeout 120s` via `.platform/nginx/conf.d`. `X-Accel-Buffering: no` (already sent by the API) disables nginx buffering. `CACHING_DISABLED` + `ALL_VIEWER_AND_CLOUDFRONT_2022` stay.

14. **Workspace & scripts.** Add `infra` to `pnpm-workspace.yaml` (package `@app/infra`) so `pnpm exec cdk` works and tests run via `pnpm -r test`. Root scripts call `bash scripts/aws.sh <cmd>`: `infra:bootstrap`, `infra:synth`, `infra:diff`, `deploy:aws`, `destroy:aws`, `db:reset:aws`. ESLint/Prettier cover `infra` (ignore `infra/cdk.out`, `infra/build`). The Dockerfile uses `--filter @app/api...`, so the extra workspace package does not change the image.

15. **No NAT gateway.** The target account has no free Elastic IP (quota exhausted by other stacks), so the NAT gateway cannot be created. The VPC has public and isolated subnets only; Elastic Beanstalk instances run in the public subnets with public IPs and a security group that admits only the ALB (itself CloudFront-only). _Alternative: raise the EIP quota and keep private app subnets with one NAT._

16. **Windows.** The CLI is bash. Requirements: Git Bash (`bash` on PATH ahead of WSL's), `aws` v2, `zip`, `node`/`pnpm`. No `python3`.

## Risks / Trade-offs

- [Redis TLS misconfiguration → API cannot reach Redis, `/api/health` fails] → The health endpoint checks Redis, so it surfaces as an unhealthy EB environment; fallback documented: set `transitEncryptionEnabled: false` and `REDIS_TLS=false`.
- [`DB_SSL_REJECT_UNAUTHORIZED=false` accepts any server certificate] → DB is private and SG-restricted; shipping the RDS CA bundle (`DB_SSL_CA_PATH`) is a later hardening.
- [Long-silent agent runs exceed the 60 s CloudFront origin timeout (hard limit without a quota raise)] → Documented; recommend periodic SSE keep-alive comments from the API in a later change.
- [Instances have public IPs] → inbound only from the ALB SG; no NAT cost.
- [Idle EB/RDS costs a few tens of USD per month] → `destroy:aws`; documented in `docs/aws-deployment.md`.
- [`RemovalPolicy.DESTROY` on RDS/S3/secrets: `destroy:aws` deletes all data] → Typed-stage confirmation; this is a dev stage.
- [Changing the EB `SolutionStackName` replaces the environment, impossible with a custom environment name] → Platform pinned in `config.ts`; override only knowingly with `EB_SOLUTION_STACK`.
- [Stray local `.env` values leaking into the cloud] → Allow-list loader (decision 4).
- [Access keys are long-lived credentials] → Used only locally; the deploy principal needs broad rights (CloudFormation, IAM, EC2, RDS, ElastiCache, EB, S3, CloudFront, Secrets Manager, SSM); a least-privilege policy is a follow-up.
- [Bootstrap and first deploy take ~25-35 min (RDS, ElastiCache, EB, CloudFront)] → Documented; a failed first create leaves `ROLLBACK_COMPLETE`, which the script deletes before retrying.

## Migration Plan

1. `pnpm install` (picks up `infra`), `pnpm infra:bootstrap` once per account/region.
2. Put deploy settings in root `.env` / `infra/.env.dev` (see `infra/.env.example`).
3. `pnpm deploy:aws`; register Callback/Sign-out URLs in the Cognito app client; open the URL.
4. Roll back: redeploy a previous commit (`deploy:aws`), or `pnpm destroy:aws` (dev only). Migrations are forward-only; use `db:reset:aws` for dev data.

## Open Questions

- Is the config repository (`CONFIG_SOURCE`) private? Assumed yes, so `CONFIG_GITHUB_TOKEN` is required for deploy; if public, make it optional.
- Reuse the local Cognito app client (add the CloudFront URLs to it) or a dedicated one? The scripts only need `OIDC_ISSUER`/`OIDC_CLIENT_ID`, so either works.
- Is `t3.small` enough for the LangChain agent process? Start with it; raise `ebInstanceType` in `config.ts` if memory pressure appears.
