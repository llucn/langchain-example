# AWS deployment (dev stage)

Deploys the app to AWS from your machine with the AWS CLI and CDK (`infra/`, `scripts/aws.sh`). No CI.

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

| Setting                                                                                                                                           | Required | Use                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------- |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`                                                                                        | yes      | CLI/CDK credentials                                     |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`                                                                                                                   | yes      | API token verification and web sign-in (build time)     |
| `MODEL_API_KEY`                                                                                                                                   | yes      | secret `MODEL_API_KEY`                                  |
| `CONFIG_GITHUB_TOKEN`                                                                                                                             | yes      | secret; read access to the agent config repository      |
| `OIDC_COGNITO_DOMAIN`, `OIDC_SCOPE`                                                                                                               | no       | web logout / scopes (build time) and API environment    |
| `ADMIN_GROUP`, `MODEL_BASE_URL`, `CONFIG_SOURCE`, `CONFIG_REF`, `CONFIG_GITHUB_API_URL`, `EVOLUTION_MODEL`, `EVOLUTION_MAX_TOKENS`, `APP_VERSION` | no       | Elastic Beanstalk properties when set                   |
| `CLOUDFRONT_PREFIX_LIST_ID`                                                                                                                       | no       | only if `ec2:DescribeManagedPrefixLists` is not allowed |
| `EB_SOLUTION_STACK`                                                                                                                               | no       | deliberate platform override (replaces the environment) |

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
