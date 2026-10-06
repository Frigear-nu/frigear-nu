#!/usr/bin/env bash
# Creates or deletes the per-PR Cloudflare D1 preview database used by
# .github/workflows/deploy-preview.yml (via the apps/website/.github/workflows/deploy.yml
# reusable workflow).
#
# Usage: cloudflare-preview-db.sh <create|delete>
#
# Requires the following env vars:
#   PR_NUMBER          - pull request number the database belongs to
#   CLOUDFLARE_DB_NAME - base D1 database name (e.g. frigear-nu-website)
# Wrangler itself must be authenticated via the CLOUDFLARE_API_TOKEN /
# CLOUDFLARE_ACCOUNT_ID env vars.
#
# On `create`, prints `database_id=<uuid>` to $GITHUB_OUTPUT (when set) and is
# idempotent: re-running it for a PR that already has a database (e.g. on a
# `synchronize` event) reuses the existing database instead of failing.
#
# On `delete`, it is idempotent too: it succeeds even when the database has
# already been removed, so PR `closed` teardown can't fail the workflow.
set -euo pipefail

action="${1:?Usage: $0 <create|delete>}"
: "${PR_NUMBER:?PR_NUMBER env var is required}"
: "${CLOUDFLARE_DB_NAME:?CLOUDFLARE_DB_NAME env var is required}"

db_name="pr-${PR_NUMBER}-${CLOUDFLARE_DB_NAME}-preview"
wrangler=(pnpm --filter @frigear-nu/website exec wrangler)

find_database_id() {
  "${wrangler[@]}" d1 list --json 2>/dev/null \
    | node -e "
      let data = ''
      process.stdin.on('data', (chunk) => { data += chunk })
      process.stdin.on('end', () => {
        try {
          const databases = JSON.parse(data)
          const match = databases.find((db) => db.name === process.argv[1])
          if (match) process.stdout.write(match.uuid)
        } catch {
          // No output: treated as "not found" by the caller.
        }
      })
    " "$db_name"
}

case "$action" in
  create)
    database_id="$(find_database_id)"

    if [ -n "$database_id" ]; then
      echo "D1 database '$db_name' already exists ($database_id)"
    else
      echo "Creating D1 database '$db_name'"
      "${wrangler[@]}" d1 create "$db_name"
      database_id="$(find_database_id)"
    fi

    if [ -z "$database_id" ]; then
      echo "Failed to resolve the database id for '$db_name' after creation" >&2
      exit 1
    fi

    echo "database_id=$database_id" >> "${GITHUB_OUTPUT:-/dev/stdout}"
    ;;
  delete)
    if [ -z "$(find_database_id)" ]; then
      echo "D1 database '$db_name' does not exist, nothing to delete"
      exit 0
    fi

    echo "Deleting D1 database '$db_name'"
    "${wrangler[@]}" d1 delete "$db_name" --skip-confirmation
    ;;
  *)
    echo "Unknown action '$action' (expected create|delete)" >&2
    exit 1
    ;;
esac
