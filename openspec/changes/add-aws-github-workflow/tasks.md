## 1. Deployment CLI

- [x] 1.1 In `scripts/aws.sh` extract `build_artifacts` (shared package, web build with `OIDC_*`, API bundle) used by `deploy`; make `synth` and `diff` call it when `infra/build/api-bundle.zip` or `apps/web/dist` is missing, with the same required `OIDC_ISSUER`/`OIDC_CLIENT_ID` check; keep `destroy` building nothing
- [x] 1.2 Update the usage comment of `scripts/aws.sh` and the `synth`/`diff` section of `docs/aws-deployment.md`; run `bash -n scripts/aws.sh`

## 2. Workflow

- [x] 2.1 Rewrite `.github/workflows/aws.yml` header comment, inputs and `env`; keep `workflow_dispatch` only, `environment: dev`, `permissions: contents: read`, concurrency `aws-dev` without cancel, `timeout-minutes: 60`
- [x] 2.2 Setup steps: checkout, `pnpm/action-setup@v4` without `version`, `setup-node@v4` (Node 22, pnpm cache), `pnpm install --frozen-lockfile`, `aws-actions/configure-aws-credentials@v4` with `vars.AWS_REGION`, `vars.AWS_ACCESS_KEY_ID`, `secrets.AWS_SECRET_ACCESS_KEY`
- [x] 2.3 Confirmation step for `db-reset`/`destroy` (input passed through `env`), writing `API_ENV` to `infra/.env.dev` with `umask 077`
- [x] 2.4 Action steps: `deploy` and `diff` with `OIDC_*`, `MODEL_API_KEY`, `CONFIG_GITHUB_TOKEN`, `CLOUDFRONT_PREFIX_LIST_ID`; `db-reset` with `--yes`; `destroy` with `CLOUDFRONT_PREFIX_LIST_ID` and `--yes`; remove Voyage, `COGNITO_AUDIENCE`, `VITE_COGNITO_*`, `build:packages` and the hard-coded pool id and region
- [x] 2.5 Summary step with stack `LangchainExample-$STAGE-App`, URL, health URL, callback and sign-out `<url>/`
- [x] 2.6 Validate the YAML (`actionlint` if available, otherwise parse with a YAML parser) and run prettier on it

## 3. Documentation

- [x] 3.1 Add the `GitHub Actions` section to `docs/aws-deployment.md`: prerequisites (workflow on the default branch or `gh workflow run --ref`), environment `dev` with optional reviewers, the variable and secret table, IAM user and key rotation, how to dispatch each action, `API_ENV` example
- [x] 3.2 Update the "No CI" wording in `docs/aws-deployment.md` and the `README.md` pointer

## 4. Verification

- [x] 4.1 Run `pnpm lint` and prettier checks for changed files
- [ ] 4.2 After a repository admin has created the environment, variables and secrets and the workflow is on a branch: dispatch `diff` and confirm it reports no changes against the deployed stack
- [ ] 4.3 Dispatch `deploy` and confirm the summary and `/api/health`; dispatch `destroy` with a wrong `confirm` and confirm it fails without deleting anything
