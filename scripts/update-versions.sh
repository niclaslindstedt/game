#!/usr/bin/env bash
# Update every version string the project ships to match the given tag
# (OSS_SPEC §10.3): the root package.json, every workspace package.json, the
# lockfile, and the engine's embedded version constant.
set -euo pipefail

tag="${1:?usage: update-versions.sh <tag>}"
ver="${tag#v}"

# Root + workspace package.json and package-lock.json in one idempotent step.
npm version --no-git-tag-version --allow-same-version \
  --workspaces --include-workspace-root "${ver}" >/dev/null

# The engine's embedded version constant (kept in its own module precisely so
# this rewrite stays a one-liner; tests/version_test.ts guards the parity).
sed -i.bak -E "s/engineVersion = \"[^\"]*\"/engineVersion = \"${ver}\"/" src/version.ts
rm src/version.ts.bak

echo "updated versions to ${ver}"
