# AWS deployment (dev stage)

Deploys the app to AWS from your machine with the AWS CLI and CDK (`infra/`, `scripts/aws.sh`), or from GitHub Actions (see [GitHub Actions](#github-actions)).

```
CloudFront ─┬─ /*      → private S3 bucket (web build)
            └─ /api/*  → ALB (CloudFront-only) → Elastic Beanstalk (Node.js 22, public subnets, SG: ALB only)
                                                   ├─ RDS PostgreSQL 16 (isolated subnets, pgvector)
                                                   └─ ElastiCache Redis 7 (isolated subnets, TLS)
Secrets Manager: DB_PASSWORD, ORIGIN_VERIFY_SECRET, MODEL_API_KEY, CONFIG_GITHUB_TOKEN
```

Stacks: `LangchainExample-dev-Data` (network, RDS, Redis, secrets) and `LangchainExample-dev-App`
(Elastic Beanstalk, S3, CloudFront). Resources are named `langchain-example-dev`.

## Prerequisites

- AWS CLI v2, Node.js 22, pnpm, `zip`, and **Git Bash** (`bash` must be Git's, not WSL's, on `PATH`).
- An IAM user/role with rights for CloudFormation, IAM, EC2/VPC, RDS, ElastiCache, Elastic Beanstalk,
  S3, CloudFront, Secrets Manager, SSM and ECR/S3 for CDK bootstrap.
- An existing Cognito user pool and app client.

## Settings

Precedence: process environment > `infra/.env.dev` (git-ignored, see `infra/.env.example`) > root `.env`.
From the root `.env` only deployment keys are read (`AWS_*`, `OIDC_*`, `MODEL_*`, `CONFIG_*`,
`ADMIN_GROUP`, `EVOLUTION_*`, `APP_VERSION`); local `DB_*`, `REDIS_*`, `NODE_ENV` and `AUTH_ENABLED`
are never sent to AWS. AWS access keys are used by the CLI only, never by the deployed app.

| Setting                                                                                                                                           | Required | Use                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`                                                                                        | yes      | CLI/CDK credentials                                                                                   |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`                                                                                                                   | yes      | API token verification and web sign-in (build time)                                                   |
| `MODEL_API_KEY`                                                                                                                                   | yes      | secret `MODEL_API_KEY`                                                                                |
| `CONFIG_GITHUB_TOKEN`                                                                                                                             | yes      | secret; read access to the agent config repository                                                    |
| `SETTINGS_ENCRYPTION_KEY`                                                                                                                         | no       | secret; base64 32-byte key so admins can store the GitHub token on the Settings page (keep it stable) |
| `OIDC_COGNITO_DOMAIN`, `OIDC_SCOPE`                                                                                                               | no       | web logout / scopes (build time) and API environment                                                  |
| `ADMIN_GROUP`, `MODEL_BASE_URL`, `CONFIG_SOURCE`, `CONFIG_REF`, `CONFIG_GITHUB_API_URL`, `EVOLUTION_MODEL`, `EVOLUTION_MAX_TOKENS`, `APP_VERSION` | no       | Elastic Beanstalk properties when set                                                                 |
| `CLOUDFRONT_PREFIX_LIST_ID`                                                                                                                       | no       | only if `ec2:DescribeManagedPrefixLists` is not allowed                                               |
| `EB_SOLUTION_STACK`                                                                                                                               | no       | deliberate platform override (replaces the environment)                                               |

## Commands (repo root)

```bash
pnpm install
pnpm infra:bootstrap      # once per account/region
pnpm deploy:aws           # build web + API, deploy both stacks (first run ~25-35 min)
pnpm infra:synth          # templates only (needs a previous build)
pnpm infra:diff
pnpm db:reset:aws         # wipe DB + Redis, re-run migrations (type "dev" to confirm, or --yes)
pnpm destroy:aws          # delete everything incl. data (type "dev" to confirm, or --yes)
```

After `deploy:aws` the URL is printed. Register in the Cognito app client (callback and sign-out
URLs are the site root, because the web app uses `HashRouter`):

- Callback URL: `<CloudFront URL>/`
- Sign-out URL: `<CloudFront URL>/`

Migrations run on every deploy in the Elastic Beanstalk predeploy hook under a PostgreSQL advisory
lock; a failure fails the deployment. The seed is not run on AWS.

## GitHub Actions

`.github/workflows/aws.yml` runs the same scripts. It is **manual only** (Actions tab → _AWS (dev)_ → _Run workflow_), with the action `deploy`, `diff`, `db-reset` or `destroy`. `db-reset` and `destroy` need the input `confirm` set to `dev`. Runs are serialized (one at a time, never cancelled). The workflow must exist on the default branch to appear in the UI; before that use `gh workflow run aws.yml --ref <branch> -f action=diff`.

One-time setup (repository admin), Settings → Environments → **New environment** `dev` (optionally add _Required reviewers_, recommended for `destroy` and `db-reset`), then add to that environment:

| Kind     | Name                                                                       | Value                                                                                                                                                           |
| -------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| variable | `AWS_REGION`                                                               | region of the stack, e.g. `us-east-2`                                                                                                                           |
| variable | `AWS_ACCESS_KEY_ID`                                                        | access key id of the deploy IAM user                                                                                                                            |
| secret   | `AWS_SECRET_ACCESS_KEY`                                                    | its secret key                                                                                                                                                  |
| variable | `OIDC_ISSUER`, `OIDC_CLIENT_ID`                                            | Cognito issuer and app client (required for deploy and diff)                                                                                                    |
| variable | `OIDC_COGNITO_DOMAIN`, `OIDC_SCOPE`                                        | optional, as in `.env.example`                                                                                                                                  |
| secret   | `MODEL_API_KEY`, `CONFIG_GITHUB_TOKEN`, optional `SETTINGS_ENCRYPTION_KEY` | written to Secrets Manager by deploy                                                                                                                            |
| variable | `API_ENV`                                                                  | optional non-secret settings, one `KEY=value` per line (`CONFIG_SOURCE`, `CONFIG_REF`, `MODEL_BASE_URL`, `ADMIN_GROUP`, …), same format as `infra/.env.example` |
| variable | `CLOUDFRONT_PREFIX_LIST_ID`                                                | only if the IAM user cannot call `ec2:DescribeManagedPrefixLists`                                                                                               |

The IAM user needs the same rights as for the local CLI (the account is already CDK-bootstrapped). Use a dedicated user and rotate its key regularly; GitHub OIDC federation (no stored keys) is a possible hardening. After `deploy` the job summary shows the URL and the Cognito callback and sign-out URLs (`<url>/`). `diff` builds the web app and API bundle first; because the bundle is rebuilt, the asset hashes can show up as changes even when the code is the same.

## Network

There is no NAT gateway (it needs an Elastic IP, and the account quota can run out). Backend instances
run in public subnets with a public IP for outbound access (GitHub config repo, model API, MCP
servers); their security group admits traffic only from the ALB, whose security group admits only
CloudFront. RDS and Redis are in isolated subnets. To move instances back to private subnets add a
NAT gateway and `PRIVATE_WITH_EGRESS` subnets in `data-stack.ts`/`app-stack.ts`.

## Cost

Roughly a few tens of USD per month while running (RDS `t4g.micro`, ElastiCache
`cache.t4g.micro`, ALB, `t3.small`). Run `pnpm destroy:aws` when not needed; the dev stack uses
`DESTROY` removal policies.

## Troubleshooting

- **`ROLLBACK_COMPLETE` stack**: `deploy:aws` deletes it and retries.
- **`/api/health` unhealthy, Redis**: the ElastiCache group uses in-transit encryption (`REDIS_TLS=true`).
  Fallback: set `transitEncryptionEnabled: false` in `infra/lib/data-stack.ts` and `REDIS_TLS` to `false` in `app-stack.ts`.
- **Chat stream cut after 60 s without data**: CloudFront's origin read timeout is 60 s (service
  maximum without a quota increase); the API should emit keep-alive comments for long agent runs.
- **Database SSL**: `DB_SSL_REJECT_UNAUTHORIZED=false`; ship the RDS CA bundle and set `DB_SSL_CA_PATH` to harden.
- **Logs**: Elastic Beanstalk streams to CloudWatch Logs (14 days).
