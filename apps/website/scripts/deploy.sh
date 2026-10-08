#!/usr/bin/env bash
#
# Deploy the website to Cloudflare Workers and (optionally) apply D1 migrations.
#
# Expects the app to be built already (`.output/server/wrangler.json` must exist);
# this script never builds anything.
#
# Environment variables:
#   CLOUDFLARE_ACCOUNT_ID   required (unless SKIP_AUTH_CHECK=true)
#   CLOUDFLARE_API_TOKEN    required (unless SKIP_AUTH_CHECK=true)
#   CLOUDFLARE_ENV          wrangler environment to deploy to (e.g. "preview"); read by wrangler itself
#   WRANGLER_BIN            wrangler command to run          (default: "npx wrangler")
#   WRANGLER_CONFIG         path to the built wrangler file  (default: .output/server/wrangler.json)
#   RUN_MIGRATIONS          apply D1 migrations after deploy (default: true)
#   D1_BINDING              D1 binding name to migrate       (default: DB)
#   SKIP_AUTH_CHECK         skip the credentials check, e.g. for a locally logged-in wrangler (default: false)
#   LOG_FILE                where wrangler output is written (default: .logs/deploy-<timestamp>.log)
#
# Usage (from apps/website):
#   ./scripts/deploy.sh
#   CLOUDFLARE_ENV=preview RUN_MIGRATIONS=false ./scripts/deploy.sh

set -euo pipefail

## Config
##############
wrangler_bin="${WRANGLER_BIN:-npx wrangler}"
wrangler_config="${WRANGLER_CONFIG:-.output/server/wrangler.json}"
run_migrations="${RUN_MIGRATIONS:-true}"
d1_binding="${D1_BINDING:-DB}"
skip_auth_check="${SKIP_AUTH_CHECK:-false}"
log_file="${LOG_FILE:-.logs/deploy-$(date +%Y-%m-%d_%H-%M-%S).log}"

## Helpers
##############
info() { echo "Info: $*" >&2; }
success() { echo "Success: $*" >&2; }
fatal() {
  echo "Error: $*" >&2
  exit 1
}

require_env() {
  [ -n "${!1:-}" ] || fatal "Environment variable $1 is required"
}

require_file() {
  [ -f "$1" ] || fatal "Required file $1 does not exist. Build the app first."
}

# Run a wrangler command, appending its output to the log file and
# showing the tail of the log if it fails.
# shellcheck disable=SC2086 # wrangler_bin is intentionally word-split ("npx wrangler")
run_wrangler() {
  if ! $wrangler_bin "$@" >>"$log_file" 2>&1; then
    echo "--- last lines of $log_file ---" >&2
    tail -n 20 "$log_file" >&2
    return 1
  fi
}

## Pre-flight checks
#######################
mkdir -p "$(dirname "$log_file")"
: >"$log_file"

require_file "$wrangler_config"

if [ "$skip_auth_check" != "true" ]; then
  require_env CLOUDFLARE_ACCOUNT_ID
  require_env CLOUDFLARE_API_TOKEN
fi

## Deploy
#############
info "Deploying to Cloudflare Workers using '$wrangler_bin'${CLOUDFLARE_ENV:+ (env: $CLOUDFLARE_ENV)}"
run_wrangler deploy --config "$wrangler_config" || fatal "Wrangler deployment failed. See $log_file for details."
success "Wrangler deployment completed."

## Migrations (optional)
############################
if [ "$run_migrations" = "true" ]; then
  info "Applying D1 migrations to binding '$d1_binding'"
  run_wrangler d1 migrations apply "$d1_binding" --remote --config "$wrangler_config" ||
    fatal "Database migration failed. See $log_file for details."
  success "Database migration completed."
else
  info "Skipping database migrations (RUN_MIGRATIONS=$run_migrations)"
fi
