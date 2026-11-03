#!/usr/bin/env bash
# Deploys the QA environment: a SEPARATE Firebase/GCP project from production.
# It refuses any project or service name that does not look like QA/dev/test/staging, and it
# never sets Telegram variables, so QA cannot touch the production bot or its webhook.
# Setup and the full runbook: DEPLOYMENT.md, section "QA environment".
set -euo pipefail

cd "$(dirname "$0")/../.."

usage() {
  cat <<'EOF'
Usage: QA_PROJECT_ID=<qa-project-id> scripts/qa/deploy-qa.sh <command> [--dry-run] [--yes]

Commands:
  check   Validate names, tools and the .env.qa file; deploy nothing.
  rules   Deploy Firestore rules to the QA project.
  api     Deploy the API to Cloud Run in the QA project.
  web     Build the frontend in "qa" mode and deploy it to QA Hosting.

Options:
  --dry-run  Print the commands instead of running them.
  --yes      Skip the confirmation prompt (needed when there is no terminal).

Environment:
  QA_PROJECT_ID      Required. Must contain a qa, dev, test or staging token (for example my-app-qa).
  QA_REGION          Default us-central1.
  QA_SERVICE         Default finpersonal-api-qa. Must also contain a qa, dev, test or staging token.
  QA_GEMINI_SECRET   Secret Manager secret that holds the QA Gemini key. Default gemini-api-key.
  QA_EXTRA_ORIGINS   Extra comma separated origins allowed by CORS (for example a custom QA domain).
  QA_ENV_FILE        Frontend build variables for QA. Default .env.qa (ignored by git).
EOF
}

fail() {
  echo "error: $*" >&2
  exit 1
}

DRY_RUN=0
ASSUME_YES=0
CMD=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --yes) ASSUME_YES=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    check | rules | api | web) CMD="$arg" ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done
if [[ -z "$CMD" ]]; then
  usage >&2
  exit 2
fi

[[ -n "${QA_PROJECT_ID:-}" ]] || fail "QA_PROJECT_ID is not set. Set it to the QA Firebase/GCP project id."
REGION="${QA_REGION:-us-central1}"
SERVICE="${QA_SERVICE:-finpersonal-api-qa}"
SECRET="${QA_GEMINI_SECRET:-gemini-api-key}"
ENV_FILE="${QA_ENV_FILE:-.env.qa}"

# Every value below ends up in a gcloud/firebase command line (and some in a delimiter-separated
# env list), so each one is checked for its exact shape before anything is built from it.
ORIGIN_RE='https?://[a-z0-9.-]+(:[0-9]{1,5})?'
[[ "$QA_PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || fail "QA_PROJECT_ID must be a valid GCP project id (6-30 chars, lowercase letters, digits and hyphens)."
[[ "$REGION" =~ ^[a-z]+-[a-z]+[0-9]+$ ]] || fail "QA_REGION must look like us-central1."
[[ "$SERVICE" =~ ^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]] || fail "QA_SERVICE must be a valid Cloud Run service name (lowercase letters, digits and hyphens)."
[[ "$SECRET" =~ ^[A-Za-z0-9_-]{1,255}$ ]] || fail "QA_GEMINI_SECRET must be a Secret Manager secret name (letters, digits, - and _)."
if [[ -n "${QA_EXTRA_ORIGINS:-}" ]]; then
  [[ "$QA_EXTRA_ORIGINS" =~ ^${ORIGIN_RE}(,${ORIGIN_RE})*$ ]] || fail "QA_EXTRA_ORIGINS must be exact origins separated by commas (for example https://qa.example.com), with no wildcards, paths or spaces."
fi
ORIGINS="https://${QA_PROJECT_ID}.web.app,https://${QA_PROJECT_ID}.firebaseapp.com${QA_EXTRA_ORIGINS:+,${QA_EXTRA_ORIGINS}}"

is_qa_name() { [[ "$1" =~ (^|-)(qa|dev|test|staging)(-|$) ]]; }
is_qa_name "$QA_PROJECT_ID" || fail "'$QA_PROJECT_ID' does not look like a QA project (it needs a qa, dev, test or staging token such as my-app-qa). Refusing."
is_qa_name "$SERVICE" || fail "service '$SERVICE' does not look like a QA service. Refusing."

run() {
  echo "+ $*"
  if [[ "$DRY_RUN" == 0 ]]; then "$@"; fi
}

env_value() {
  # Last assignment of KEY in the env file, without surrounding quotes.
  sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}\$/\1/p" "$ENV_FILE" | tail -n 1
}

check_env_file() {
  [[ -f "$ENV_FILE" ]] || fail "$ENV_FILE not found. Create it with the QA web app config (see DEPLOYMENT.md)."
  # Vite also loads .env, so every variable must be set here or a QA build could inherit production values.
  local key
  for key in VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_STORAGE_BUCKET VITE_FIREBASE_MESSAGING_SENDER_ID VITE_FIREBASE_APP_ID VITE_API_BASE_URL; do
    [[ -n "$(env_value "$key")" ]] || fail "$key is missing or empty in $ENV_FILE."
  done
  [[ "$(env_value VITE_FIREBASE_PROJECT_ID)" == "$QA_PROJECT_ID" ]] \
    || fail "VITE_FIREBASE_PROJECT_ID in $ENV_FILE does not match QA_PROJECT_ID."
  # Every other VITE_* variable the app reads must at least be defined (empty is fine), otherwise
  # the value from a production .env would be baked into the QA bundle.
  local referenced
  referenced="$(grep -rhoE --exclude='*.test.*' 'VITE_[A-Z0-9_]+' src vite.config.ts 2> /dev/null | sort -u || true)"
  for key in $referenced; do
    grep -q "^${key}=" "$ENV_FILE" \
      || fail "$key is read by the app but not defined in $ENV_FILE. Define it (empty is fine) so a production .env value cannot leak into the QA build."
  done
}

check_tools() {
  local tool
  for tool in "$@"; do
    command -v "$tool" > /dev/null 2>&1 || fail "'$tool' is not installed or not on PATH."
  done
}

confirm() {
  echo "Project: $QA_PROJECT_ID | Region: $REGION | Service: $SERVICE | Command: $CMD"
  [[ "$DRY_RUN" == 1 || "$ASSUME_YES" == 1 ]] && return 0
  if [[ ! -t 0 ]]; then
    fail "Refusing to deploy without a terminal. Re-run with --yes to confirm."
  fi
  local answer
  read -r -p "Deploy to this QA project? [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || fail "Cancelled."
}

cmd_check() {
  check_tools gcloud firebase pnpm
  check_env_file
  echo "ok: project=$QA_PROJECT_ID region=$REGION service=$SERVICE env=$ENV_FILE origins=$ORIGINS"
}

cmd_rules() {
  check_tools firebase
  confirm
  run firebase deploy --only firestore:rules --project "$QA_PROJECT_ID"
}

cmd_api() {
  check_tools gcloud
  confirm
  # --set-env-vars and --set-secrets replace the whole set, so Telegram variables can never leak in.
  run gcloud run deploy "$SERVICE" \
    --project "$QA_PROJECT_ID" \
    --region "$REGION" \
    --source . \
    --allow-unauthenticated \
    --min-instances 0 \
    --max-instances 2 \
    --set-env-vars "^@^GOOGLE_CLOUD_PROJECT=${QA_PROJECT_ID}@CORS_ALLOWED_ORIGINS=${ORIGINS}" \
    --set-secrets "GEMINI_API_KEY=${SECRET}:latest"
  if [[ "$DRY_RUN" == 0 ]]; then
    # Capture first: piping into "grep -q" would report "clean" when describe fails or grep exits early.
    local described
    described="$(gcloud run services describe "$SERVICE" --project "$QA_PROJECT_ID" --region "$REGION" --format=json)" \
      || fail "could not read the deployed service to verify it has no Telegram variables. Check it manually before using this QA environment."
    if grep -q "TELEGRAM" <<< "$described"; then
      fail "the QA service has Telegram variables. Remove them: gcloud run services update $SERVICE --project $QA_PROJECT_ID --region $REGION --remove-env-vars TELEGRAM_BOT_TOKEN,TELEGRAM_WEBHOOK_SECRET"
    fi
    echo "ok: no Telegram variables on $SERVICE."
  fi
}

cmd_web() {
  check_tools firebase pnpm
  check_env_file
  confirm
  run pnpm exec vite build --mode qa
  if [[ "$DRY_RUN" == 0 ]]; then
    grep -rqF "$QA_PROJECT_ID" dist/assets \
      || fail "the built bundle does not mention $QA_PROJECT_ID; it may carry another project's config. Not deploying."
  fi
  run firebase deploy --only hosting --project "$QA_PROJECT_ID"
}

case "$CMD" in
  check) cmd_check ;;
  rules) cmd_rules ;;
  api) cmd_api ;;
  web) cmd_web ;;
esac
