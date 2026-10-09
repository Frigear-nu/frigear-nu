#!/usr/bin/env bash
# Releases one package: `release-package.sh <package> <increment>`, run from the repo root.
#
# - If a previous run pushed the version commit + tag but never reached npm (e.g. an auth failure),
#   the tagged version is built and published instead of cutting a new release.
# - Otherwise runs release-it (bump, commit, tag, push, GitHub release, npm publish).
#
# Expects the branch to be checked out, `pnpm install` and `pnpm build:packages` to have run. $RELEASE_BRANCH names the branch to
# return to after a recovery publish.
set -euo pipefail

package=$1
increment=$2
dir="packages/$package"

# Tests/builds can leave tracked files modified, and release-it refuses a dirty tree. Show what changed
# (to find the cause), then reset to what is committed.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "::warning::Tracked files were modified before releasing $package:"
  git status --short --untracked-files=no
  git diff --stat
  git checkout -- .
fi

name=$(node -p "require('./$dir/package.json').name")
version=$(node -p "require('./$dir/package.json').version")
tag="$package@$version"

if git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null &&
   ! npm view "$name@$version" version >/dev/null 2>&1; then
  echo "Resuming incomplete release $tag"
  git checkout --detach "$tag"
  pnpm install --frozen-lockfile
  pnpm --filter "{$dir}^..." run --if-present build
  pnpm --filter "./$dir" run --if-present build
  (cd "$dir" && bash ../../scripts/npm-publish.sh)
  git checkout "${RELEASE_BRANCH:?}"
  pnpm install --frozen-lockfile
else
  # Dependencies are already built (the workflow runs `pnpm build:packages` once up front).
  (cd "$dir" && pnpm exec release-it "$increment" --ci)
fi
