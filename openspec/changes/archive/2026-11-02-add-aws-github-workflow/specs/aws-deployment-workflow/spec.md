## ADDED Requirements

### Requirement: Manually triggered workflow

The repository SHALL provide a GitHub Actions workflow `.github/workflows/aws.yml` that runs only on `workflow_dispatch` with an `action` input (`deploy`, `diff`, `db-reset`, `destroy`) and a `confirm` input. It MUST NOT run on push, pull request or schedule.

#### Scenario: Dispatch

- **WHEN** a maintainer starts the workflow with action `deploy`
- **THEN** the job runs in the GitHub environment `dev` and executes the deployment CLI for the `dev` stage

#### Scenario: No automatic trigger

- **WHEN** code is pushed or a pull request is opened
- **THEN** the workflow does not run

### Requirement: Same scripts as the local CLI

Each action SHALL call the root scripts used locally: `deploy:aws`, `infra:diff`, `db:reset:aws` and `destroy:aws`, with `--stage dev`. The runner SHALL use Node.js 22, the pnpm version from the `packageManager` field of `package.json`, and `pnpm install --frozen-lockfile`.

#### Scenario: Diff without local builds

- **WHEN** the action is `diff` on a clean runner
- **THEN** the web app and the API bundle are built by the CLI as needed and the CloudFormation diff is printed without changing AWS

### Requirement: Project configuration from GitHub settings

The workflow SHALL take the region and credentials from `AWS_REGION`, `AWS_ACCESS_KEY_ID` (variables) and `AWS_SECRET_ACCESS_KEY` (secret); the Cognito settings from the variables `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_COGNITO_DOMAIN`, `OIDC_SCOPE`; the secrets `MODEL_API_KEY` and `CONFIG_GITHUB_TOKEN`; and optional non-secret API settings from the variable `API_ENV` written to `infra/.env.dev`. It MUST NOT contain the region, a Cognito pool id, Voyage, Twilio or other-project settings as literals.

#### Scenario: Secrets handling

- **WHEN** the workflow runs
- **THEN** secrets are provided only as masked secrets or step environment variables and are never written to the job summary or logs

#### Scenario: Missing required setting

- **WHEN** a required variable or secret is not configured for a `deploy`
- **THEN** the CLI lists the missing names and the job fails before any AWS change

### Requirement: Guarded destructive actions

For `db-reset` and `destroy` the workflow SHALL fail before checkout unless the `confirm` input equals the stage name (`dev`). Only one run SHALL operate on the stage at a time and a running operation MUST NOT be cancelled by a newer run.

#### Scenario: Wrong confirmation

- **WHEN** `destroy` is dispatched with `confirm` empty or not `dev`
- **THEN** the job fails with a message and nothing is deleted

#### Scenario: Concurrent runs

- **WHEN** a second run is dispatched while one is in progress
- **THEN** it waits until the first finishes

### Requirement: Least-privilege token and pinned setup

The workflow SHALL declare `permissions: contents: read`, a job timeout, and use major-version-pinned official actions.

#### Scenario: Token permissions

- **WHEN** the workflow runs
- **THEN** the `GITHUB_TOKEN` has read-only repository contents access

### Requirement: Deployment summary

After a successful `deploy` the workflow SHALL write the application URL, the health URL and the Cognito callback and sign-out URLs (the application URL with a trailing slash) to the job summary, reading the output of the stack `LangchainExample-dev-App`.

#### Scenario: Summary content

- **WHEN** `deploy` finishes successfully
- **THEN** the summary shows `<url>`, `<url>/api/health`, callback `<url>/` and sign-out `<url>/` and no webhook URLs

### Requirement: One-time setup is documented

`docs/aws-deployment.md` SHALL have a GitHub Actions section describing the environment `dev`, every variable and secret, the IAM user, optional required reviewers and how to dispatch the workflow.

#### Scenario: Setting up

- **WHEN** a repository admin follows the section
- **THEN** they can run `diff` and `deploy` without any other information
