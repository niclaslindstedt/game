# Contributing to game

Thanks for your interest! This document describes how to set up a dev
environment, the conventions we follow, and how to get a change merged.

## Prerequisites

- **Node.js ≥ 24** — pinned in `.nvmrc` (`nvm use`); CI resolves the same file.
- **GNU make** — the canonical developer entry points.
- Optional: `shellcheck` and `actionlint` for `make shellcheck` / `make actionlint`.

### Two TypeScripts, on purpose

`package.json` installs the compiler twice, and both entries are aliases:

- `@typescript/native` → `typescript@7` — the native (Go) compiler. It owns the
  `tsc` binary, so `make lint` / `npm run typecheck` typecheck with TypeScript 7.
- `typescript` → `@typescript/typescript6` — TypeScript 6's JavaScript compiler
  API, exposed under the `typescript` module name (and a `tsc6` binary).

TypeScript 7.0 ships no programmatic API, and typescript-eslint refuses to load
against it, so tools that need the API — typescript-eslint — resolve
`require("typescript")` to the 6.x copy while `tsc` stays on 7. This is the
side-by-side layout the TypeScript team documents for the 6 → 7 transition;
collapse it back to a single `typescript` dependency once typescript-eslint
supports 7.x ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)).

## Getting the source

```sh
git clone https://github.com/niclaslindstedt/game.git
cd game
npm install
```

## Build, test, lint

```sh
make build
make test
make lint
make fmt-check
```

## Development workflow

1. Fork the repo.
2. Create a topic branch: `git checkout -b feat/<slug>` or `fix/<slug>`.
3. Make focused commits using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   <type>(<scope>): <summary>
   ```
   Types: `feat`, `fix`, `perf`, `docs`, `test`, `refactor`, `chore`, `ci`,
   `build`, `style`. Breaking changes: `<type>!:` or `BREAKING CHANGE:` footer.
4. Open a PR. The **PR title** must be conventional-commit format because we
   squash-merge and that title becomes the commit message on `main`.
5. CI must be green and at least one reviewer must approve.

## Tests

Engine tests live in `tests/` as Vitest files named `*_test.ts` (never inline
in source — see `AGENTS.md`). Run the suite with `make test`, a single file
with `npx vitest run tests/output_test.ts`. Every engine change should come
with a test change. For app-level verification, drive the real game with the
autoplay bot (`pwa/scripts/playtest.mjs` — see the `playtest` skill in
`.agent/skills/`).

## Documentation

If your change touches user-visible behavior, update the relevant `docs/`
topic and the README quick start. See `AGENTS.md` for the full sync table.

## Code of Conduct

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting security issues

See [SECURITY.md](SECURITY.md). Do **not** open public issues for security
problems.
