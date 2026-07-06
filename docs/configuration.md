# Configuration

The game itself has no user-facing configuration yet (player settings will
be stored on-device via the oss-framework storage module once gameplay
exists). What is configurable today is the build and the development
environment.

## Environment variables

| Variable     | Read by                                        | Effect                                                                                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_PAT` | `.npmrc` (every npm command), all CI workflows | Auth token for GitHub Packages — required to install `@niclaslindstedt/oss-framework`. Needs the `read:packages` scope. CI prefers the `GITHUB_PAT` secret and falls back to the workflow token.                                                                       |
| `VITE_BASE`  | `website/vite.config.ts`                       | The deploy-slot base path: `/game/` (production), `/game/preview/` (staging), `/game/branch/` (branch slot). Defaults to `/` for local dev and the CI quality gates. Drives asset URLs, the service-worker scope, the per-slot robots meta, and the precache cache id. |
| `GITHUB_SHA` | `website/vite.config.ts`                       | Stamps the build label shown in the update toast and title screen; falls back to `git rev-parse` / a timestamp locally.                                                                                                                                                |

## URL parameters

| Parameter | Effect                                                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?debug`  | Enables debug-level console output (`src/output.ts`, OSS_SPEC §19.3). All levels are always captured in the in-memory buffer regardless; the flag only controls console verbosity. |

## Repository pins

| File                          | Pins                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `.nvmrc`                      | Node 24 — both local (`nvm use`) and every CI workflow (`node-version-file`) resolve this single file (§10.5). |
| `package.json` `engines.node` | `>=24`, so npm warns on a stale local Node.                                                                    |

## Release configuration

| Secret          | Used by                                   | Purpose                                                                                                           |
| --------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `RELEASE_TOKEN` | `version-bump.yml`                        | A PAT/App token that pushes the `v*` tag; the default `GITHUB_TOKEN` would not fire the downstream `release.yml`. |
| `GITHUB_PAT`    | ci/pages/release/seo/lighthouse workflows | GitHub Packages reads (optional — workflows fall back to `github.token`).                                         |
