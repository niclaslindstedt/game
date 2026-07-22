# Troubleshooting

Common failure modes and their fixes. If your problem is not listed, open an
issue with the output of the failing command.

## Installing

### `npm error Failed to replace env in config: ${GITHUB_PAT}`

`.npmrc` references the `GITHUB_PAT` environment variable and npm refuses to
run while it is unset. Export a GitHub personal access token with the
`read:packages` scope:

```sh
export GITHUB_PAT=ghp_yourtoken
```

### `401 Unauthorized` / `403 Forbidden` from `npm.pkg.github.com`

The token is set but invalid: expired, revoked, or missing the
`read:packages` scope. Regenerate it at <https://github.com/settings/tokens>.

### CI fails installing `@niclaslindstedt/oss-framework`

The workflows use the `GITHUB_PAT` repository secret when present and fall
back to the workflow's own token. If the fallback lacks access to the
package, add a `GITHUB_PAT` secret (Settings → Secrets → Actions) containing
a `read:packages` token.

## Building

### `extract-source-data: src/version.ts (…) disagrees with package.json (…)`

The embedded engine version and the manifest drifted. Never edit versions by
hand — `scripts/update-versions.sh vX.Y.Z` rewrites all of them atomically.

### `vite: command not found` inside `pwa/`

Dependencies are installed from the repository root (npm workspaces), not
inside `pwa/`. Run `npm install` at the root.

## The deployed game

### The site shows an old build after a deploy

Expected: the service worker parks new builds in `waiting` and shows an
update toast rather than yanking the app out from under a run. Accept the
toast, or close every tab/instance of the app and reopen.

### The preview slot shows the production app (or vice versa)

The production worker's scope covers `/preview/` and `/branch/`;
its navigation denylist should make it ignore them. If a stale worker from
before the denylist is still controlling the origin, unregister it
(DevTools → Application → Service Workers → Unregister) and reload.

### Installed PWA white-screens on launch

Usually two slots fighting over one cache. Verify
`pwa/src/app/pwa.ts` derives distinct cache ids for every entry in
`DEPLOY_SLOTS` (`pwa/pwa-plugin.ts`), then bump a deploy so fresh
workers install.

## Diagnostics

Load the app with `?debug` appended to the URL to get debug-level console
output. All log levels are always captured in an in-memory buffer
(`recentLogs()` in `src/output.ts`) regardless of the flag.
