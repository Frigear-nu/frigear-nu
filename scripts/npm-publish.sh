#!/usr/bin/env bash
# Publishes the package in the current working directory to npm.
#
# Uses `pnpm pack` (not `npm publish` directly) so that `workspace:*`
# dependencies are rewritten to the real published version ranges in the
# packed tarball. The resulting tarball is then published with the `npm`
# CLI, since `npm publish` is what supports npm's OIDC "trusted publishing"
# (pnpm does not implement it yet, see https://github.com/pnpm/pnpm/issues/9812).
#
# Intended to be run as a release-it `after:release` hook from within a
# package directory (cwd = packages/<name>), see packages/*/.release-it.json.
#
# `--provenance` is required here even though Trusted Publishing is already
# configured on npmjs.com: npm's OIDC token-exchange endpoint has a known bug
# (https://github.com/npm/cli/issues/8730) where it 404s with "package not
# found" for scoped/monorepo packages unless `npm publish` is run with
# `--provenance`. Without it, npm silently falls through to the (absent)
# classic-auth path and fails with ENEEDAUTH instead of actually using OIDC.
set -euo pipefail

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

pnpm pack --pack-destination "$tmp_dir"
npm publish "$tmp_dir"/*.tgz --access public
