## Context

`.github/workflows/aws.yml` is a copy from a sibling project (untracked, not working here). It already has the right shape: manual dispatch, a choice of action, a typed confirmation for destructive actions, a `dev` environment, a concurrency lock, and steps that call the same `pnpm` scripts as the local CLI. `scripts/aws.sh` (from `add-aws-cdk-deployment`) reads `AWS_REGION` and the other deployment settings from the process environment first, so the workflow only has to provide environment variables.

Differences found in the copied workflow (each is a task):

| Area                   | Copied workflow                                                                               | This project                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm                   | `version: 10`                                                                                 | `packageManager` is `pnpm@11.5.0`; `pnpm/action-setup` reads it when `version` is omitted                                                           |
| Region                 | `aws-region: us-east-2` hard-coded, pool id `us-east-2_vYGbxY6i7` hard-coded in the diff step | `vars.AWS_REGION`; no pool id in code                                                                                                               |
| Cognito config         | `COGNITO_AUDIENCE`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_AUTHORITY`                        | `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_COGNITO_DOMAIN`, `OIDC_SCOPE` (the API and the web build both read them)                                     |
| Secrets                | `MODEL_API_KEY`, `VOYAGE_API_KEY`                                                             | `MODEL_API_KEY`, `CONFIG_GITHUB_TOKEN` (no Voyage)                                                                                                  |
| diff job               | `pnpm build:packages`, web build with `VITE_*`, `bundle-api.sh`, then `infra:diff`            | no `build:packages`; the web build needs `OIDC_*`; moving this into `aws.sh` removes the duplication                                                |
| Stack name in summary  | `DeltaIntake-$STAGE-App`                                                                      | `LangchainExample-$STAGE-App`                                                                                                                       |
| Cognito URL in summary | `<url>/callback`                                                                              | callback and sign-out URL are `<url>/` (HashRouter)                                                                                                 |
| Optional settings      | `API_ENV` variable written to `infra/.env.dev` with MODEL_BASE_URL etc.                       | still valid; allowed keys are `MODEL_BASE_URL`, `CONFIG_SOURCE`, `CONFIG_REF`, `CONFIG_GITHUB_API_URL`, `ADMIN_GROUP`, `EVOLUTION_*`, `APP_VERSION` |
| Workflow header / docs | points to `docs/aws-deployment.md#github-actions`                                             | that section does not exist yet                                                                                                                     |
| Shell injection        | `${{ inputs.action }}` interpolated into a `run:` script                                      | pass through `env:` (inputs are a fixed choice, but keep the pattern safe)                                                                          |

## Goals / Non-Goals

**Goals:**

- Run `deploy`, `diff`, `db-reset` and `destroy` for `dev` from the Actions tab with the same scripts as local use.
- Safe by default: manual trigger only, one operation at a time, typed confirmation for data-deleting actions, least-privilege workflow token, secrets only as secrets.
- Setup is documented so a repository admin can enable it in minutes.

**Non-Goals:**

- Automatic deploys on push/PR, preview environments, a CI test/lint workflow (separate change).
- Replacing static IAM keys with GitHub OIDC federation (recommended hardening, follow-up).
- Changing infrastructure or the deployment scripts beyond build-on-demand for `synth`/`diff`.
- Multiple stages (only `dev`).

## Decisions

1. **Keep one manual workflow `aws.yml`** with `workflow_dispatch` inputs `action` (`deploy|diff|db-reset|destroy`) and `confirm`. _Alternative: separate workflows per action – rejected: more files, same steps, shared concurrency is simpler in one file._

2. **Configuration through GitHub environment `dev`**: `environment: dev` lets admins add required reviewers (recommended for `destroy`/`db-reset`) and scope secrets. Variables: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, optional `OIDC_COGNITO_DOMAIN`, `OIDC_SCOPE`, `CLOUDFRONT_PREFIX_LIST_ID`, `API_ENV`. Secrets: `AWS_SECRET_ACCESS_KEY`, `MODEL_API_KEY`, `CONFIG_GITHUB_TOKEN`. The values are passed as step environment variables, which `aws.sh` reads with its documented precedence (process env first). `aws-actions/configure-aws-credentials` exports `AWS_REGION` and the keys; `aws.sh` needs only those.

3. **pnpm via `packageManager`**: omit `version` in `pnpm/action-setup@v4` so it uses `pnpm@11.5.0`, matching local and the lockfile; `setup-node` with `node-version: 22` and `cache: pnpm`; `pnpm install --frozen-lockfile`.

4. **Build on demand in `aws.sh synth|diff`**: extract the web and API build into a `build_artifacts` function used by `deploy` and, when `infra/build/api-bundle.zip` or `apps/web/dist` is missing, by `synth`/`diff`. Then the workflow's `diff` step is `pnpm infra:diff -- --stage "$STAGE"` with the same env as deploy (OIDC values are needed for the web build). `destroy` keeps its placeholder outputs and never builds.

5. **Confirmation**: first step fails unless `confirm` equals the stage for `db-reset` and `destroy`; the value is compared through an environment variable. Both then pass `--yes` to the script (the typed confirmation already happened in the workflow). The `dev` environment can add a human approval on top.

6. **Permissions and concurrency**: `permissions: contents: read`; `concurrency: aws-dev` with `cancel-in-progress: false` (never cancel a running CloudFormation operation); `timeout-minutes: 60`.

7. **Summary**: after `deploy`, write App URL, health URL, and the Cognito callback and sign-out URL (`<url>/`) to `$GITHUB_STEP_SUMMARY`, reading the `CloudFrontUrl` output of `LangchainExample-$STAGE-App`.

8. **Credentials**: static IAM user keys, same as the local flow (the user explicitly chose AWS CLI keys). The access key id is stored as a variable, the secret as a secret. _Alternative: GitHub OIDC role – better, no long-lived keys; listed as follow-up._

9. **Third-party actions pinned to major versions** (`actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `aws-actions/configure-aws-credentials@v4`); `workflow_dispatch` only, so forks and PRs cannot trigger it.

## Risks / Trade-offs

- [Long-lived AWS keys stored in GitHub] → Environment-scoped secrets, manual trigger, recommended required reviewers, key rotation note; OIDC federation as a follow-up.
- [A maintainer destroys the stack by mistake] → Typed confirmation and optional environment reviewers.
- [Concurrent runs corrupting a CloudFormation update] → Concurrency group without cancel.
- [Runner differences from local (Linux zip supports `-y`, npm bundle same)] → The bundle script is already cross-platform; the first workflow run (`diff`) validates it.
- [Hosted runner minutes and the 60 minute limit on first deploy] → First deploy already exists; updates are faster.
- [`CONFIG_GITHUB_TOKEN` or model key leaking in logs] → Passed as secrets (masked), never echoed; `aws.sh` does not print them.
- [Workflow lives only on the default branch for the UI dispatch] → Document that it must be merged first, or run via `gh workflow run --ref <branch>`.

## Migration Plan

1. Merge the workflow change; a repository admin creates environment `dev`, the variables and secrets from the docs.
2. Run `diff` from the Actions tab and check it matches the deployed stack (no changes).
3. Use `deploy` for later updates. Roll back by running `deploy` on an earlier commit/ref.

## Open Questions

- Should the `dev` environment require a reviewer for `destroy`/`db-reset`? (Recommended; an admin setting, not code.)
- Is it acceptable to keep static IAM keys for now, or should this change use GitHub OIDC federation right away?
