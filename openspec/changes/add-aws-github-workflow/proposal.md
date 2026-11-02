## Why

The AWS dev stack can only be deployed from a developer machine (`pnpm deploy:aws`, see the `add-aws-cdk-deployment` change). Running deploy, diff, DB reset and destroy from GitHub Actions lets any maintainer do it without local AWS keys, tools or a Windows/Git Bash setup, and leaves an audit trail. `.github/workflows/aws.yml` was copied from a sibling project as a reference; it still contains that project's names, a stale pnpm version, a hard-coded region and Cognito pool, Cognito/Voyage settings, build commands that do not exist here, and the wrong Cognito callback URL, so it cannot run as is.

## What Changes

- Rewrite `.github/workflows/aws.yml` for this project: manual `workflow_dispatch` with actions `deploy`, `diff`, `db-reset`, `destroy`; the dev GitHub environment; one operation at a time; typed confirmation for destructive actions.
- Use this repo's toolchain: pnpm from the `packageManager` field (11.5.0, not 10), Node.js 22, `pnpm install --frozen-lockfile`.
- Replace the sibling project's configuration: region from `AWS_REGION`; `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_COGNITO_DOMAIN`, `OIDC_SCOPE` as variables; `MODEL_API_KEY` and `CONFIG_GITHUB_TOKEN` as secrets; no `VOYAGE_API_KEY`, `COGNITO_AUDIENCE` or `VITE_COGNITO_*`; stack names `LangchainExample-<stage>-*`; job summary shows the Cognito callback and sign-out URL as `<url>/` (not `/callback`).
- Make `scripts/aws.sh` `synth`/`diff` build the web app and API bundle themselves when the outputs are missing, so the workflow's `diff` step is one command and local and CI behave the same (removes the duplicated build commands from the workflow).
- Document the one-time GitHub setup (environment `dev`, variables, secrets, IAM user) in `docs/aws-deployment.md#github-actions`.
- No automatic triggers (no push or pull request deploys) and no change to the AWS infrastructure.

## Capabilities

### New Capabilities

- `aws-deployment-workflow`: the manually triggered GitHub Actions workflow that runs the deployment CLI (deploy, diff, db-reset, destroy) for the `dev` stage, with its inputs, configuration, safeguards and summary.

### Modified Capabilities

<!-- None: no existing requirement changes. -->

## Impact

- Changed: `.github/workflows/aws.yml`, `scripts/aws.sh` (build on demand for synth/diff), `docs/aws-deployment.md`.
- GitHub repository settings (done by a repository admin): environment `dev`, variables `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, optional `OIDC_COGNITO_DOMAIN`, `OIDC_SCOPE`, `API_ENV`, `CLOUDFRONT_PREFIX_LIST_ID`; secrets `AWS_SECRET_ACCESS_KEY`, `MODEL_API_KEY`, `CONFIG_GITHUB_TOKEN`.
- Depends on the `add-aws-cdk-deployment` change (scripts, stacks, CDK bootstrap already done in the account).
- Uses GitHub-hosted runner minutes; a deploy takes about 15 to 35 minutes.
