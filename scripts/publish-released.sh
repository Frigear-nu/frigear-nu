#!/usr/bin/env bash
# Builds and publishes the packages listed (one per line) in the file given as $1, run from the repo root.
# Builds in dependency order, then publishes up to 4 packages at a time. Exits non-zero if any publish failed.
set -euo pipefail

list=$1
[ -s "$list" ] || { echo "Nothing to publish"; exit 0; }

filters=()
while read -r package; do filters+=(--filter "./packages/$package"); done < "$list"

# Versions are embedded in the build output, so this has to happen after the version bumps.
pnpm --workspace-concurrency=3 "${filters[@]}" run --if-present build

# `-P` keeps going after a failure and makes xargs exit non-zero at the end.
xargs -P 4 -I{} bash -c '
  echo "::group::Publish {}"
  cd "packages/{}" && NPM_PUBLISH_SKIP_BUILD=1 bash ../../scripts/npm-publish.sh
  status=$?
  echo "::endgroup::"
  [ $status -eq 0 ] || echo "::error::Publish of {} failed"
  exit $status
' < "$list"
