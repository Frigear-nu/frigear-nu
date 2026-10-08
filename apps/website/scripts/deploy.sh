#!/bin/bash

## deploy either "production" or "preview" to cloudflare workers using a configurable wrangler binary (npm/cli)
## This expects the artifacts are already built and will not run pnpm build etc..

cwd=${CWD:-$(pwd)}
wrangler_bin=npx wrangler
environment=${NODE_ENV:-production}
wrangler_file=.output/server/wrangler.json
log_dir=.logs
log_file=${LOG_FILE:-$log_dir/deploy-$(date +%Y-%m-%d_%H-%M-%S).log}
run_migrations={RUN_MIGRATIONS:-true}


## Helpers
##############
success() {
  echo "Success: $1" >&2
}
error() {
  echo "Error: $1" >&2
}

fatal() {
  error "$1"
  exit 1
}

info() {
  echo "Info: $1" >&2
}

log() {
  echo "$1" >&2
}

delete_file() {
  info "Deleting $1"
  rm -f "$1"
}

require_env() {
  if [ -z "${!1}" ]; then
    fatal "Environment variable $1 is required"
  fi
}

create_dir_if_not_exists() {
  if [ ! -d "$1" ]; then
    info "Creating directory $1"
    mkdir -p "$1"
  fi
}

setup_log_file() {
  if [ -f "$log_file" ]; then
    delete_file $log_file
  fi

  if [ ! -d "$log_dir" ]; then
    create_dir_if_not_exists $log_dir
  fi
}

require_file() {
  if [ ! -f "$1" ]; then
    fatal "Required file $1 does not exist."
  fi
}


## Pre-flight checks
#######################
setup_log_file
require_file $wrangler_file

# if the wrangler_bin does not start with "wrangler"
# then assume it is a local binary, and do not require env vars.
if [[ $wrangler_bin != wrangler* ]]; then
  require_env CLOUDFLARE_ACCOUNT_ID
  require_env CLOUDFLARE_API_TOKEN
fi

info "Deploying to Cloudflare Workers using $wrangler_bin"
$wrangler_bin --cwd "$cwd" deploy >$log_file 2>&1
if [ $? -ne 0 ]; then
  fatal "Wrangler deployment failed. See $log_file for details."
  exit 1
else
  success "Wrangler deployment completed."
fi


# Optionally, we also apply migrations to the database
if [ "$run_migrations" = true ]; then
  require_env NUXT_HUB_CLOUDFLARE_DATABASE_ID
  info "Migrating DB"
  $wrangler_bin --cwd "$cwd" d1 migrations apply DB --remote --config "$wrangler_file"
  if [ $? -ne 0 ]; then
    fatal "Database migration failed. See $log_file for details."
    exit 1
  fi
  success "Database migration completed."
fi

