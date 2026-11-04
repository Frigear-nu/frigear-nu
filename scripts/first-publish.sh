#!/usr/bin/env bash
# First publish of a new public package, run once by a maintainer from the repo root on an up to date `main`.
#
# npm Trusted Publishing can only be configured on a package that already exists, so a new package is published
# once by hand (npm login, 2FA in the browser) and then linked to `.github/workflows/release.yml`. From then on the
# Release workflow publishes it like every other package. Safe to re-run: a version that is already on npm is
# skipped, and `npm trust` only adds the relationship.
#
# Usage: bash scripts/first-publish.sh <package>   # folder under packages/, e.g. cli
set -euo pipefail

package=${1:?usage: bash scripts/first-publish.sh <package>}
dir="packages/$package"
[ -f "$dir/package.json" ] || { echo "No $dir/package.json"; exit 1; }

name=$(node -p "require('./$dir/package.json').name")
version=$(node -p "require('./$dir/package.json').version")

npm whoami >/dev/null || { echo "Run npm login first"; exit 1; }

if npm view "$name@$version" version >/dev/null 2>&1; then
  echo "$name@$version is already on npm, skipping the publish"
else
  echo "Publishing $name@$version"
  # Packs with pnpm (rewrites workspace: ranges, runs the prepack build) and publishes with npm.
  (cd "$dir" && bash ../../scripts/npm-publish.sh)
fi

echo "Trusting Frigear-nu/frigear-nu release.yml to publish $name"
npm trust github "$name" --file release.yml --repository Frigear-nu/frigear-nu --allow-publish --yes
npm trust list "$name"
