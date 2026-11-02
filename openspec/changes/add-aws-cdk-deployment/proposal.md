## Why

The app only runs locally (docker compose). To demo and test it with real Cognito sign-in, a real RDS PostgreSQL and ElastiCache Redis, it needs a repeatable AWS deployment. A sibling project (same Node.js 22 / PostgreSQL 16 / Redis 7 stack, same Elastic Beanstalk + CloudFront architecture) already has working AWS CDK code and a deploy CLI; they were copied into `infra/` and `scripts/aws.sh` as a reference. They still carry the other project's names, env vars, secrets, Twilio webhooks and OIDC callback, and call scripts and files this repo does not have. This change adapts them to this project and makes the local AWS CLI deployment work end to end.

## What Changes

- Adapt `infra/` (CDK app, TypeScript) to this project: resource names (`langchain-example-<stage>`, stacks `LangchainExample-<stage>-Data|App`), database name (`langchain_example`), npm package name (`@app/infra`), region taken from `AWS_REGION` instead of a hard-coded one.
- Re-map the Elastic Beanstalk environment properties and Secrets Manager secrets to this API's variables (`DB_*`, `REDIS_*`, `AUTH_ENABLED`, `OIDC_*`, `API_PORT`, `MODEL_*`, `CONFIG_*`, `ADMIN_GROUP`, `EVOLUTION_*`, `APP_VERSION`); drop what this project does not have (Voyage key, intake config secret, S3 asset bucket, Cognito admin IAM policy, classification/embedding/chat tuning variables).
- Remove all Twilio/Postmark references (CloudFront comment, webhook URLs printed after deploy, docs).
- Fix the Cognito app client URLs printed after deploy: this web app uses `HashRouter` and sends the OIDC redirect to the site root, so callback and sign-out URL are both `<CloudFront URL>/` (the sibling project used `/callback`). OIDC settings are build-time Vite variables of the web build.
- Add Elastic Beanstalk hooks that fit this repo: a predeploy hook that runs compiled TypeORM migrations under a PostgreSQL advisory lock (no seed: the repo seed only inserts a dummy user), and a reset script. Add the compiled scripts they call to `apps/api` (`migrate`, and a remote-reset opt-in for `db-reset`, which currently refuses `NODE_ENV=production`).
- Adapt `infra/scripts/bundle-api.sh` to this monorepo (`@app/shared`, `@app/api`, no `python3`, no `docs/database-migration.md`) and `scripts/aws.sh` (stack/secret names, required variables, settings sourced from root `.env`, post-deploy output).
- Add root `package.json` scripts: `infra:bootstrap`, `infra:synth`, `infra:diff`, `deploy:aws`, `destroy:aws`, `db:reset:aws`; add `infra` to the pnpm workspace; add `docs/aws-deployment.md`.
- Deploy via AWS CLI from the developer machine using `AWS_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from the root `.env`. **No GitHub workflow in this change.**

## Capabilities

### New Capabilities

- `aws-deployment`: the single-stage (`dev`) AWS deployment of this app (infrastructure, runtime configuration and secrets, database migration on deploy, Cognito URLs, local CLI commands and their safeguards).

### Modified Capabilities

<!-- None: no existing requirement changes. Auth behavior is unchanged; the API only gets deployment scripts. -->

## Impact

- New/changed: `infra/**`, `scripts/aws.sh`, root `package.json`, `pnpm-workspace.yaml` (+ lockfile), `docs/aws-deployment.md`, `README.md` (short pointer), `.env.example` (note on deploy settings).
- API code: new `apps/api/src/database/scripts/migrate.ts`; small change to `db-reset.ts` (explicit remote opt-in). No change to runtime behavior or endpoints.
- AWS resources created in the target account (billable): VPC (no NAT gateway), RDS PostgreSQL 16 (`t4g.micro`), ElastiCache Redis 7 (`cache.t4g.micro`), Elastic Beanstalk (ALB + `t3.small`), S3, CloudFront, Secrets Manager. The user must register the printed URL in the Cognito app client.
- Dependencies: `aws-cdk-lib`, `constructs`, `aws-cdk`, `jest`, `ts-jest` as dev dependencies of `infra`; local tools `aws` CLI v2, `bash`, `zip`.
