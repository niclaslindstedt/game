# Getting started

This walks you from a fresh clone to a running local build of the game app.
For a one-screen overview, see the [README](../README.md); this page goes
deeper on each step.

## 1. Toolchain

Install **Node.js 24** (the exact pin lives in [`.nvmrc`](../.nvmrc)):

```sh
nvm install && nvm use   # reads .nvmrc
```

## 2. Install and run

```sh
git clone https://github.com/niclaslindstedt/game.git
cd game
npm install
make website-dev     # Vite dev server for the game app
```

The dev server prints a local URL. In dev mode no service worker registers
(hot reload and service workers do not mix); PWA behaviour is exercised on
production builds only.

## 3. Two TypeScripts, on purpose

`package.json` installs the compiler twice, and both entries are aliases:

- `@typescript/native` → `typescript@7` — the native (Go) compiler. It owns the
  `tsc` binary, so `make lint` / `npm run typecheck` typecheck with TypeScript 7.
- `typescript` → `@typescript/typescript6` — TypeScript 6's JavaScript compiler
  API, exposed under the `typescript` module name (and a `tsc6` binary).

TypeScript 7.0 ships no programmatic API, and typescript-eslint refuses to load
against it, so tools that need the API resolve `require("typescript")` to the
6.x copy while `tsc` stays on 7. This is the side-by-side layout the TypeScript
team documents for the 6 → 7 transition; collapse it back to a single
`typescript` dependency once typescript-eslint supports 7.x
([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)).

## 4. The development loop

```sh
make test        # engine test suite (Vitest, tests/*_test.ts)
make lint        # ESLint + TypeScript, zero warnings
make fmt         # Prettier, in place
make build       # typecheck everything + production bundle in pwa/dist
```

To try the production build — including the service worker and offline
behaviour — locally:

```sh
make website
npm run preview --workspace pwa
```

## 5. Where things live

| Path             | What it is                                                                   |
| ---------------- | ---------------------------------------------------------------------------- |
| `content/`       | Every authored catalog, as YAML — the format a mod is written in too         |
| `mod/`           | The mod SDK — CLI, compiler, format reference, worked example                |
| `src/`           | The engine — framework-free game logic (imported by the app as `@game/core`) |
| `pwa/`           | The deployable app — Vite + React PWA shell                                  |
| `scripts/`       | The instruments — renderers, simulators, calculators, catalog generators     |
| `tests/`         | Engine tests                                                                 |
| `docs/`          | These reference pages                                                        |
| `.agent/skills/` | Playbooks for each kind of work (also reachable as `.claude/skills`)         |

## 6. If you are here to make a mod

```sh
node mod/tools/cli.mjs new my-mod     # scaffold one that already compiles
node mod/tools/cli.mjs check my-mod   # validate it — the fast inner loop
```

[CONTRIBUTING.md](../CONTRIBUTING.md) is the authoring guide, and
[Testing mod content](../README.md#testing-mod-content) is the loop that renders,
simulates and playtests it — every instrument in `scripts/` takes `--mod <dir>`.

Next: read [architecture.md](architecture.md) for the module layout and
deployment topology.
