#!/usr/bin/env bash
# Versions one package: `release-package.sh <package> <increment>`, run from the repo root.
#
# - If a previous run pushed the version commit + tag but never reached npm (e.g. an auth failure),
#   nothing is bumped; the package is simply queued for publishing again.
# - Otherwise runs release-it (bump, commit, tag, push, GitHub release) without its hooks: building and
#   publishing happen afterwards for all packages at once, see scripts/publish-released.sh.
#
# The package is appended to $RELEASED_FILE, the list of packages publish-released.sh publishes.
# Expects the branch to be checked out and `pnpm install` to have run.
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
  echo "$tag is tagged but not on npm; it will be published without a new release"
else
  # Calls the binary directly: going through `pnpm exec` makes pnpm re-verify (and re-run) the install
  # because the previous package's version bump changed a manifest.
  (cd "$dir" && ../../node_modules/.bin/release-it "$increment" --ci --no-hooks)
fi

echo "$package" >> "${RELEASED_FILE:?}"
