#!/bin/bash
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# SessionStart hook for Claude Code on the web: install every dependency the
# repo's build/test/lint/playtest loops need, in the background, so sessions
# never stall on a missing package. Local (non-remote) sessions skip it.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Run in the background while the session starts (asked for explicitly:
# "installs playwright in the background when the session starts").
echo '{"async": true, "asyncTimeout": 600000}'

cd "$CLAUDE_PROJECT_DIR"

# @niclaslindstedt/* packages come from GitHub Packages and need a token
# (see .npmrc). CI and the remote env provide GITHUB_PAT; fall back to the
# workflow token when only that is available.
if [ -z "${GITHUB_PAT:-}" ] && [ -n "${GITHUB_TOKEN:-}" ]; then
  export GITHUB_PAT="$GITHUB_TOKEN"
  echo "export GITHUB_PAT=\"$GITHUB_TOKEN\"" >> "$CLAUDE_ENV_FILE"
fi

# `src/generated/` is the RETIRED path of the compiled content tree — the root
# source tree was renamed src/ -> engine/ (#1046). Nothing writes there any
# more, but a remote container's working copy is CACHED and reused rather than
# re-cloned, so one that last built before that commit still holds the stale
# directory: git cannot delete an ignored directory across the checkout that
# moves it forward. It then reappears in every resumed session. `make clean`
# removes it; prune it here so a cached container heals itself. Retire this
# alongside the .gitignore/.prettierignore/eslint entries that suppress it,
# once no cached working copy predates #1046.
# Anchored absolutely on purpose: SIX directories in this repo are named
# `src/` (pwa, native, electron, tauri/shell, tauri/src-tauri) and only the
# ROOT one is the retired engine tree. A bare `src/generated` would be a
# `rm -rf` whose meaning depends on the working directory.
rm -rf "$CLAUDE_PROJECT_DIR/src/generated"
rmdir "$CLAUDE_PROJECT_DIR/src" 2>/dev/null || true

# Root install covers the website workspace too. `npm install` (not ci) so
# the cached container state keeps repeat runs fast and idempotent.
npm install --no-audit --no-fund

# The native wrapper in native/ is NOT an npm workspace member — it has its own
# dependency tree (expo, react-native, expo-haptics, the store SDK…), so it
# needs its own install for `native/` typechecks and bundles to work. The root
# `native:install` script is `npm --prefix native install`; call it directly so the
# --no-audit/--no-fund flags reach the install unambiguously.
npm --prefix native install --no-audit --no-fund

# Playwright for the playtest harness (deliberately not a repo dependency —
# see pwa/scripts/playtest.mjs). Browser binaries are pre-installed at
# /opt/pw-browsers, so this only fetches the npm package.
npm install --no-save --no-audit --no-fund playwright

# The GENERATED build artifacts: the compiled content catalogs
# (engine/generated/*, from content/**) and the pixel assets (the sprite atlas,
# tiles, the UI font atlas → pwa/src/game/assets/). Both are gitignored and
# regenerated on every build, so a fresh clone has NEITHER — and until they
# exist, a plain `npx vitest run` fails on the missing atlas.json and any
# script that reaches the engine fails on the missing catalogs. `npm run
# assets` runs the whole generator chain (leveling → items → enemies →
# powerups → sprites → levels → bot tuning), which is the same chain
# `pretest`/`prelint` invoke; doing it here means the first test, lint, sim, or
# playtest of a session starts against a ready tree instead of paying for it.
npm run assets

echo "session-start: dependencies ready"
