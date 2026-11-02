# aws-deployment Specification

## Purpose
Deploy the application to AWS (Elastic Beanstalk, RDS, ElastiCache, CloudFront) from the local machine with CDK; synced from change add-aws-cdk-deployment.

## Requirements
### Requirement: Single-command deployment from the local machine

The system SHALL provide root scripts `infra:bootstrap`, `infra:synth`, `infra:diff`, `deploy:aws`, `destroy:aws` and `db:reset:aws` that run the AWS CDK app in `infra/` with the AWS CLI credentials `AWS_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` taken from the environment or the root `.env`. `deploy:aws` SHALL build the web app and the API bundle, deploy the Data stack and then the App stack, and print the application URL.

#### Scenario: Deploy

- **WHEN** a developer runs `pnpm deploy:aws` with valid AWS credentials, a bootstrapped account and all required settings
- **THEN** the web app and API bundle are built, both stacks are deployed, and the CloudFront URL and the health URL `<url>/api/health` are printed

#### Scenario: Missing credentials or bootstrap

- **WHEN** the AWS credentials are unusable or the CDK toolkit stack does not exist in the account and region
- **THEN** the script stops before building or deploying and tells the developer to fix the credentials or run `pnpm infra:bootstrap`

#### Scenario: Missing required setting

- **WHEN** `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `MODEL_API_KEY` or `CONFIG_GITHUB_TOKEN` is not set
- **THEN** `deploy:aws` lists the missing names and stops without changing AWS

#### Scenario: Synth and diff without a deployment

- **WHEN** a developer runs `pnpm infra:synth` or `pnpm infra:diff` after the build outputs exist
- **THEN** the CloudFormation templates are produced or compared without creating resources

### Requirement: Settings are read only from an allow-list

The deploy CLI SHALL read settings with the precedence process environment, then `infra/.env.<stage>`, then the repository root `.env`, and from the root `.env` it SHALL read only deployment keys (`AWS_*` credentials and region, `OIDC_*`, `MODEL_*`, `CONFIG_*`, `ADMIN_GROUP`, `EVOLUTION_*`, `APP_VERSION`). Local development values such as `DB_*`, `REDIS_*`, `NODE_ENV` and `AUTH_ENABLED` MUST NOT be passed to AWS. AWS access keys MUST NOT be written to the Elastic Beanstalk environment.

#### Scenario: Local database settings in root .env

- **WHEN** the root `.env` contains `DB_HOST=localhost` and `AUTH_ENABLED=false`
- **THEN** the deployed API still uses the RDS endpoint and `AUTH_ENABLED=true`

#### Scenario: Credentials stay local

- **WHEN** the stacks are synthesized
- **THEN** no Elastic Beanstalk option contains `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`

### Requirement: Project-specific naming and region

All AWS resources SHALL be named after this project (`langchain-example-<stage>`; stacks `LangchainExample-<stage>-Data` and `LangchainExample-<stage>-App`; database `langchain_example`) and SHALL be created in `AWS_REGION`. Only the stage `dev` SHALL be accepted.

#### Scenario: Unsupported stage

- **WHEN** the CLI is run with `--stage prod`
- **THEN** it fails with a message listing the supported stages

#### Scenario: Region

- **WHEN** `AWS_REGION` is `us-east-2`
- **THEN** the stacks are created in `us-east-2`; when it is unset the CLI stops with a clear error

### Requirement: Runtime configuration matches the API

The Elastic Beanstalk environment SHALL provide the variables the API reads: `NODE_ENV=production`, `API_PORT`, `AUTH_ENABLED=true`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_SSL=true`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_TLS`, `OIDC_ISSUER` and `OIDC_CLIENT_ID`; and, only when set, `OIDC_COGNITO_DOMAIN`, `OIDC_SCOPE`, `ADMIN_GROUP`, `MODEL_BASE_URL`, `CONFIG_SOURCE`, `CONFIG_REF`, `CONFIG_GITHUB_API_URL`, `EVOLUTION_MODEL`, `EVOLUTION_MAX_TOKENS` and `APP_VERSION`. The environment SHALL NOT contain variables of other projects (`DATABASE_*`, `COGNITO_*`, Twilio, Postmark, Voyage).

#### Scenario: Health check

- **WHEN** the App stack is deployed
- **THEN** the load balancer health check uses `/api/health` on the API port and the environment becomes healthy only when PostgreSQL and Redis are reachable

#### Scenario: Optional setting absent

- **WHEN** `CONFIG_GITHUB_API_URL` is not set at deploy time
- **THEN** it is not an Elastic Beanstalk property

### Requirement: Secrets in Secrets Manager

`DB_PASSWORD`, `ORIGIN_VERIFY_SECRET`, `MODEL_API_KEY` and `CONFIG_GITHUB_TOKEN` SHALL be stored in AWS Secrets Manager under `langchain-example-<stage>/<NAME>` and injected into Elastic Beanstalk as environment secrets, never as plain properties. `DB_PASSWORD` and `ORIGIN_VERIFY_SECRET` SHALL be generated; `MODEL_API_KEY` and `CONFIG_GITHUB_TOKEN` SHALL be written from the operator's settings on every deploy when they differ from the stored value. The instance role SHALL be able to read only these secrets.

#### Scenario: Secret changed

- **WHEN** the operator changes `MODEL_API_KEY` and deploys again
- **THEN** the secret is updated in Secrets Manager and nothing is printed to the console

#### Scenario: No plain secret

- **WHEN** the App stack template is inspected
- **THEN** none of the four names appears as a plain environment property

### Requirement: Private data tier

The database SHALL be PostgreSQL 16 on RDS and the cache SHALL be Redis 7 on ElastiCache, both in isolated subnets, encrypted at rest, with security groups admitting only the application instances. The application SHALL connect to the database with SSL and to Redis with TLS.

#### Scenario: Network exposure

- **WHEN** the Data stack is inspected
- **THEN** the RDS instance is not publicly accessible and the PostgreSQL and Redis ports accept traffic only from the application security group

### Requirement: Single public entry through CloudFront

The web app SHALL be served from a private S3 bucket through CloudFront, and `/api/*` SHALL be forwarded uncached to the load balancer, which SHALL accept only CloudFront origin-facing traffic and requests carrying the secret `X-Origin-Verify` header. The `/api/*` path SHALL allow long-running streaming chat responses (origin read timeout 60 seconds, load balancer idle timeout 120 seconds, response buffering disabled).

#### Scenario: Direct access to the load balancer

- **WHEN** a client connects to the ALB address directly, not via CloudFront
- **THEN** the connection is refused by the security group

#### Scenario: Streaming chat

- **WHEN** a chat message is sent through the CloudFront URL
- **THEN** the server-sent events arrive incrementally and are not buffered by nginx

### Requirement: Cognito sign-in URLs

After a successful deploy the CLI SHALL print the URLs to register in the Cognito app client: the callback URL `<CloudFront URL>/` and the sign-out URL `<CloudFront URL>/`. It MUST NOT print Twilio or other webhook URLs. The web build SHALL receive `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_COGNITO_DOMAIN` and `OIDC_SCOPE` from the deploy settings.

#### Scenario: Printed URLs

- **WHEN** `deploy:aws` finishes
- **THEN** the output shows the callback and sign-out URLs equal to the site root with a trailing slash, and no webhook URLs

### Requirement: Database migration on every deploy

The API bundle SHALL run the TypeORM migrations in a predeploy hook under a PostgreSQL advisory lock so that concurrent instances apply them once, and a migration failure SHALL fail the deployment. The seed SHALL NOT be run on AWS.

#### Scenario: Two instances deploy at once

- **WHEN** two instances run the hook concurrently
- **THEN** the migrations are applied once and both hooks succeed

#### Scenario: Failing migration

- **WHEN** a migration throws
- **THEN** the hook exits non-zero and Elastic Beanstalk reports the deployment as failed

### Requirement: Guarded destructive commands

`destroy:aws` and `db:reset:aws` SHALL require the operator to type the stage name unless `--yes` is passed. `db:reset:aws` SHALL run on an application instance through AWS Systems Manager, drop and recreate the database, flush Redis, re-run the migrations and restart the API. The API reset script SHALL refuse to run when `NODE_ENV=production` unless `DB_RESET_ALLOW_REMOTE=true` is set explicitly.

#### Scenario: Confirmation mismatch

- **WHEN** the operator types anything other than the stage name
- **THEN** the command aborts and nothing is deleted

#### Scenario: Local production guard

- **WHEN** `db-reset` runs with `NODE_ENV=production` and without `DB_RESET_ALLOW_REMOTE`
- **THEN** it refuses with an error

### Requirement: Infrastructure is tested without AWS access

The CDK app SHALL have jest tests that synthesize both stacks offline and assert the guarantees above (private RDS, secrets via Secrets Manager, no foreign variables, health check path, CloudFront behaviors, naming).

#### Scenario: Run the tests

- **WHEN** a developer runs `pnpm --filter @app/infra test`
- **THEN** the tests pass without AWS credentials or network access
