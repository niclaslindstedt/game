# Getting started

This walks you from a fresh clone to a running local build of the game app.
For a one-screen overview, see the [README](../README.md); this page goes
deeper on each step.

## 1. Toolchain

Install **Node.js 24** (the exact pin lives in [`.nvmrc`](../.nvmrc)):

```sh
nvm install && nvm use   # reads .nvmrc
```

## 2. GitHub Packages auth

The app depends on
[`@niclaslindstedt/oss-framework`](https://github.com/niclaslindstedt/oss-framework),
which is published to GitHub Packages. GitHub's npm registry requires
authentication even for public reads, so create a
[personal access token](https://github.com/settings/tokens) with the
`read:packages` scope and export it before any npm command:

```sh
export GITHUB_PAT=ghp_yourtoken
```

Put it in your shell profile — [`.npmrc`](../.npmrc) references the variable
on every npm invocation, and npm errors out if it is unset.

## 3. Install and run

```sh
git clone https://github.com/niclaslindstedt/game.git
cd game
npm install
make website-dev     # Vite dev server for the game app
```

The dev server prints a local URL. In dev mode no service worker registers
(hot reload and service workers do not mix); PWA behaviour is exercised on
production builds only.

## 4. The development loop

```sh
make test        # engine test suite (Vitest, tests/*_test.ts)
make lint        # ESLint + TypeScript, zero warnings
make fmt         # Prettier, in place
make build       # typecheck everything + production bundle in website/dist
```

To try the production build — including the service worker and offline
behaviour — locally:

```sh
make website
npm run preview --workspace website
```

## 5. Where things live

| Path             | What it is                                                                   |
| ---------------- | ---------------------------------------------------------------------------- |
| `src/`           | The engine — framework-free game logic (imported by the app as `@game/core`) |
| `website/`       | The deployable app — Vite + React PWA shell                                  |
| `tests/`         | Engine tests                                                                 |
| `docs/`          | These reference pages                                                        |
| `.agent/skills/` | Maintenance playbooks for AI coding agents                                   |

Next: read [architecture.md](architecture.md) for the module layout and
deployment topology.
