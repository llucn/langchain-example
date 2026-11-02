#!/usr/bin/env bash
# Local AWS deployment CLI (no CI). Usage, via pnpm from the repo root:
#   pnpm infra:bootstrap            one-time CDK bootstrap for the account/region
#   pnpm infra:synth  [-- --stage dev]   builds web + API bundle first when missing
#   pnpm infra:diff   [-- --stage dev]   same; needs OIDC_ISSUER / OIDC_CLIENT_ID then
#   pnpm deploy:aws   [-- --stage dev]
#   pnpm destroy:aws  [-- --stage dev] [--yes]
#   pnpm db:reset:aws [-- --stage dev] [--yes]   wipe + migrate the deployed database
#
# Settings: real environment > infra/.env.<stage> > repo root .env (deployment keys only).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMAND="${1:-}"; shift || true

STAGE="dev"; ASSUME_YES="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --) shift ;;
    --stage) STAGE="${2:-}"; shift 2 ;;
    --stage=*) STAGE="${1#*=}"; shift ;;
    --yes|-y) ASSUME_YES="true"; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "==> $*"; }

[[ "$STAGE" == "dev" ]] || die "Unsupported stage \"$STAGE\". Supported stages: dev"

PROJECT="langchain-example"
DATA_STACK="LangchainExample-${STAGE}-Data"
APP_STACK="LangchainExample-${STAGE}-App"
PREFIX="${PROJECT}-${STAGE}"

# Reads KEY=VALUE lines (no shell evaluation) and exports keys that are not set yet and match
# the optional ERE filter.
load_env_file() {
  local file="$1" filter="${2:-}" line key value
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*# || -z "${line//[[:space:]]/}" ]] && continue
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"; value="${line#*=}"
    key="${key//[[:space:]]/}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    [[ -z "$filter" || "$key" =~ $filter ]] || continue
    if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
    [[ -z "${!key:-}" ]] && export "$key=$value"
  done < "$file"
  return 0
}

# Only deployment keys are taken from the root .env: local DB_*, REDIS_*, NODE_ENV and
# AUTH_ENABLED must never reach AWS.
DEPLOY_KEYS='^(AWS_REGION|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|OIDC_[A-Z_]+|MODEL_BASE_URL|MODEL_API_KEY|CONFIG_[A-Z_]+|ADMIN_GROUP|EVOLUTION_[A-Z_]+|APP_VERSION)$'
load_env_file "$ROOT/infra/.env.$STAGE"
load_env_file "$ROOT/.env" "$DEPLOY_KEYS"

[[ -n "${AWS_REGION:-}" ]] || die "AWS_REGION is not set (set it in the root .env or the environment)"
REGION="$AWS_REGION"
export AWS_REGION AWS_DEFAULT_REGION="$REGION"

cdk() { (cd "$ROOT/infra" && pnpm exec cdk "$@"); }

preflight() {
  command -v aws  >/dev/null || die "aws CLI not found"
  command -v pnpm >/dev/null || die "pnpm not found"
  command -v zip  >/dev/null || die "zip not found"
  local node_major; node_major="$(node -p 'process.versions.node.split(".")[0]')"
  (( node_major >= 20 )) || die "Node.js >= 20 required (found $(node -v))"

  ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" \
    || die "AWS credentials not usable. Check AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION in the root .env."
  info "AWS account $ACCOUNT_ID, region $REGION, stage $STAGE"

  aws cloudformation describe-stacks --stack-name CDKToolkit >/dev/null 2>&1 \
    || die "CDK is not bootstrapped in $ACCOUNT_ID/$REGION. Run: pnpm infra:bootstrap"
}

require_vars() {
  local missing=()
  for v in "$@"; do [[ -n "${!v:-}" ]] || missing+=("$v"); done
  if (( ${#missing[@]} )); then
    echo "Missing required settings: ${missing[*]}" >&2
    die "Set them in the environment, the root .env or infra/.env.$STAGE (see infra/.env.example)"
  fi
}

# Context values resolved with the AWS CLI so synth needs no CDK lookups.
cdk_context_args() {
  CTX=(-c "stage=$STAGE")
  local pl="${CLOUDFRONT_PREFIX_LIST_ID:-}"
  [[ -n "$pl" ]] || pl="$(aws ec2 describe-managed-prefix-lists \
        --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
        --query 'PrefixLists[0].PrefixListId' --output text 2>/dev/null || true)"
  if [[ -z "$pl" || "$pl" == "None" ]]; then
    die "Cannot resolve the CloudFront origin-facing prefix list id (needs ec2:DescribeManagedPrefixLists). Set CLOUDFRONT_PREFIX_LIST_ID (name: com.amazonaws.global.cloudfront.origin-facing, VPC console > Managed prefix lists)."
  fi
  CTX+=(-c "cloudFrontPrefixListId=$pl")
  # The platform is pinned in infra/lib/config.ts: changing SolutionStackName replaces the
  # environment, which CloudFormation cannot do for a custom-named environment. Override
  # deliberately with EB_SOLUTION_STACK=... (see docs/aws-deployment.md).
  if [[ -n "${EB_SOLUTION_STACK:-}" ]]; then
    info "Elastic Beanstalk platform override: $EB_SOLUTION_STACK"
    CTX+=(-c "ebSolutionStack=$EB_SOLUTION_STACK")
  fi
}

put_secret_if_changed() {
  local name="$1" value="$2" id="$PREFIX/$1" current tmp
  current="$(aws secretsmanager get-secret-value --secret-id "$id" --query SecretString --output text 2>/dev/null || true)"
  [[ "$current" == "$value" ]] && return 0
  tmp="$(umask 077; mktemp)"; printf '%s' "$value" > "$tmp"
  # AWS CLI on Windows needs a native path for file://
  local tmp_native="$tmp"; command -v cygpath >/dev/null && tmp_native="$(cygpath -m "$tmp")"
  aws secretsmanager put-secret-value --secret-id "$id" --secret-string "file://$tmp_native" >/dev/null
  rm -f "$tmp"
  info "Updated secret $id"
}

# A failed first create leaves the stack in ROLLBACK_COMPLETE, which CloudFormation cannot update.
# It holds no resources, so delete it and let CDK recreate it.
remove_failed_stack() {
  local status
  status="$(aws cloudformation describe-stacks --stack-name "$1" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || true)"
  if [[ "$status" == "ROLLBACK_COMPLETE" ]]; then
    info "Removing failed stack $1 ($status)"
    aws cloudformation delete-stack --stack-name "$1"
    aws cloudformation wait stack-delete-complete --stack-name "$1"
  fi
}

stack_output() {
  aws cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue | [0]" --output text
}

# Web app (Vite reads OIDC_* at build time; the process environment wins over the root .env) and
# API bundle, i.e. the inputs of the App stack.
build_artifacts() {
  info "Building web app"
  (cd "$ROOT" && pnpm --filter @app/shared build)
  (cd "$ROOT" && OIDC_COGNITO_DOMAIN="${OIDC_COGNITO_DOMAIN:-}" OIDC_SCOPE="${OIDC_SCOPE:-openid email phone}"     pnpm --filter @app/web build)

  info "Bundling API"
  bash "$ROOT/infra/scripts/bundle-api.sh"
}

# Settings that are only checked by `cdk synth`/`diff`; empty is fine there.
export OIDC_ISSUER="${OIDC_ISSUER:-}" OIDC_CLIENT_ID="${OIDC_CLIENT_ID:-}"

case "$COMMAND" in
  bootstrap)
    account="$(aws sts get-caller-identity --query Account --output text)" || die "AWS credentials not usable"
    # cdk loads the app even for bootstrap; the stacks need a prefix-list context value to
    # construct, but nothing from the app is deployed here, so a placeholder is fine.
    cdk bootstrap "aws://$account/$REGION" -c "stage=$STAGE" -c cloudFrontPrefixListId=pl-bootstrap-placeholder
    ;;

  synth|diff)
    cdk_context_args
    # Synthesis needs the build outputs the stacks reference; build them when missing.
    if [[ ! -f "$ROOT/infra/build/api-bundle.zip" || ! -d "$ROOT/apps/web/dist" ]]; then
      require_vars OIDC_ISSUER OIDC_CLIENT_ID
      build_artifacts
    fi
    cdk "$COMMAND" "$DATA_STACK" "$APP_STACK" "${CTX[@]}"
    ;;

  deploy)
    preflight
    require_vars OIDC_ISSUER OIDC_CLIENT_ID MODEL_API_KEY CONFIG_GITHUB_TOKEN
    cdk_context_args

    build_artifacts

    remove_failed_stack "$DATA_STACK"
    info "Deploying $DATA_STACK"
    cdk deploy "$DATA_STACK" "${CTX[@]}" --require-approval never

    info "Writing operator-supplied secrets"
    put_secret_if_changed MODEL_API_KEY "$MODEL_API_KEY"
    put_secret_if_changed CONFIG_GITHUB_TOKEN "$CONFIG_GITHUB_TOKEN"
    if [[ -n "${SETTINGS_ENCRYPTION_KEY:-}" ]]; then
      put_secret_if_changed SETTINGS_ENCRYPTION_KEY "$SETTINGS_ENCRYPTION_KEY"
    fi

    remove_failed_stack "$APP_STACK"
    info "Deploying $APP_STACK (migrations run in the Elastic Beanstalk predeploy hook)"
    cdk deploy "$APP_STACK" "${CTX[@]}" --require-approval never

    URL="$(stack_output "$APP_STACK" CloudFrontUrl)"
    cat <<MSG

==========================================================================
Deployed stage "$STAGE"
  App URL:      $URL
  API health:   $URL/api/health

Register in the Cognito app client (owner action):
  Callback URL:  $URL/
  Sign-out URL:  $URL/
==========================================================================
MSG
    ;;

  destroy)
    preflight
    cdk_context_args
    if [[ "$ASSUME_YES" != "true" ]]; then
      echo "This permanently destroys $APP_STACK and $DATA_STACK, including the $STAGE database."
      read -r -p "Type the stage name ($STAGE) to confirm: " answer
      [[ "$answer" == "$STAGE" ]] || die "Confirmation did not match; aborting."
    fi
    # Synth needs the referenced paths to exist even though nothing is uploaded.
    mkdir -p "$ROOT/infra/build" "$ROOT/apps/web/dist"
    [[ -f "$ROOT/infra/build/api-bundle.zip" ]] || : > "$ROOT/infra/build/api-bundle.zip"
    cdk destroy "$APP_STACK" "$DATA_STACK" --force "${CTX[@]}"
    ;;

  reset-data)
    preflight
    INSTANCE_ID="$(aws elasticbeanstalk describe-environment-resources --environment-name "$PREFIX" \
      --query 'EnvironmentResources.Instances[0].Id' --output text 2>/dev/null || true)"
    [[ -n "$INSTANCE_ID" && "$INSTANCE_ID" != "None" ]] || die "No running instance found for environment $PREFIX"
    if [[ "$ASSUME_YES" != "true" ]]; then
      echo "This DELETES ALL DATA in the $STAGE database (and flushes Redis), then re-runs the migrations."
      echo "Instance: $INSTANCE_ID. The API restarts and is briefly unavailable."
      read -r -p "Type the stage name ($STAGE) to confirm: " answer
      [[ "$answer" == "$STAGE" ]] || die "Confirmation did not match; aborting."
    fi
    info "Running reset on $INSTANCE_ID via SSM"
    COMMAND_ID="$(aws ssm send-command --instance-ids "$INSTANCE_ID" --document-name AWS-RunShellScript \
      --timeout-seconds 900 --comment "$PREFIX data reset" \
      --parameters 'commands=["bash /var/app/current/.platform/scripts/reset-data.sh 2>&1"],executionTimeout=["900"]' \
      --query Command.CommandId --output text)"
    status="InProgress"
    while [[ "$status" == "InProgress" || "$status" == "Pending" || "$status" == "Delayed" ]]; do
      sleep 5
      status="$(aws ssm get-command-invocation --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
        --query Status --output text 2>/dev/null || echo Pending)"
    done
    aws ssm get-command-invocation --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
      --query 'StandardOutputContent' --output text | grep -v '^query' || true
    [[ "$status" == "Success" ]] || { aws ssm get-command-invocation --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" --query 'StandardErrorContent' --output text >&2; die "Reset finished with status $status"; }
    info "Reset complete."
    ;;

  *)
    echo "Usage: $0 {bootstrap|synth|diff|deploy|destroy|reset-data} [--stage dev] [--yes]" >&2
    exit 2
    ;;
esac
