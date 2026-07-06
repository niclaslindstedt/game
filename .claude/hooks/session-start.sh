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

# Root install covers the website workspace too. `npm install` (not ci) so
# the cached container state keeps repeat runs fast and idempotent.
npm install --no-audit --no-fund

# Playwright for the playtest harness (deliberately not a repo dependency —
# see website/scripts/playtest.mjs). Browser binaries are pre-installed at
# /opt/pw-browsers, so this only fetches the npm package.
npm install --no-save --no-audit --no-fund playwright

echo "session-start: dependencies ready"
