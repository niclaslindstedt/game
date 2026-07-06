# Agent guidance for game

This file is the canonical source of truth for AI coding agents working in this
repo. `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `GEMINI.md`,
`.aider.conf.md`, and `.github/copilot-instructions.md` are symlinks to this
file.

## OSS Spec conformance

This repository adheres to [`OSS_SPEC.md`](OSS_SPEC.md), a prescriptive
specification for open source project layout, documentation, automation, and
governance. A copy of the spec lives at the repository root so contributors and
AI agents can consult it without leaving the repo; its version is recorded in
the YAML front matter at the top of the file.

Run `oss-spec validate .` to verify conformance. When in doubt about a layout,
naming, or workflow decision, consult the relevant section of `OSS_SPEC.md` —
it is the source of truth for the conventions this repo follows.

## Build and test commands

```sh
make build         # developer build
make test          # full test suite
make lint          # zero-warning linter
make fmt           # format in place
make fmt-check     # verify formatting (CI)
```

## Commit and PR conventions

- All commits follow [Conventional Commits](https://www.conventionalcommits.org/).
- PRs are squash-merged; the **PR title** becomes the single commit on `main`,
  so it must follow conventional-commit format.
- Breaking changes use `<type>!:` or a `BREAKING CHANGE:` footer.

## Architecture summary

This is a **webapp-kind project (OSS_SPEC §11.4/§11.5): the deployed website
IS the game** — an offline top-down survival scroller shooter, steered by
holding pointer/touch, where the character acts autonomously according to
picked-up weapons and items.

Two layers, one dependency direction:

- **`src/` — the engine.** Framework-free TypeScript (simulation loop,
  steering, weapons, items, spawning — to be built). It must stay importable
  from any renderer; no React, no DOM assumptions beyond what a browser
  provides. `src/output.ts` is the central output module (§19.4) — all
  diagnostic output routes through it; raw `console.*` elsewhere fails lint.
- **`website/` — the app.** A Vite + React 19 PWA shell that mounts the
  engine (imported via the `@game/core` alias → `../src/index.ts`), renders
  it, and owns everything deploy-shaped: the service worker build
  (`website/pwa-plugin.ts`), manifest, icons, SEO surfaces, and the update
  toast. The app depends on the engine; the engine never imports from the
  app.

Deployment is three GitHub Pages slots on one origin
(`https://niclaslindstedt.github.io/game/`): `/game/` serves the highest
`v*` tag (or `main` before the first release), `/game/preview/` serves every
`main` push, `/game/branch/` serves a manually parked branch persisted in
the `branch-deploy` orphan branch. `.github/workflows/pages.yml` builds all
slots into a single Pages artifact; each slot gets its own service worker and
a disjoint precache cache id (`website/src/app/pwa.ts`).

## Reuse through oss-framework

This game builds on
[`@niclaslindstedt/oss-framework`](https://github.com/niclaslindstedt/oss-framework)
(shared React components, hooks, and utilities for local-first PWAs —
storage, PWA update lifecycle, theming, achievements, i18n, …), installed
from GitHub Packages. **Prefer the framework over hand-rolling**:

- **Add the framework repo to your session.** When working in this repo with
  an AI coding agent, add `niclaslindstedt/oss-framework` as a root
  repository using the agent's repo tool (in Claude Code: the `add_repo`
  tool) so the framework's source, docs, and demo app are readable alongside
  this codebase. Its demo (`oss-framework/demo/`) is the reference
  implementation for the PWA/deploy patterns this repo uses.
- Before writing app-level UI or infrastructure (settings storage, update
  prompts, sidebars, achievements, encryption, sync, charts), check whether
  the framework already ships it and use that.
- **Keep generic game code separate, extract to the framework later.** Code
  that is not specific to THIS game (HUD widgets, input handling, game-loop
  utilities, sprite/audio helpers) goes in the dedicated generic areas —
  `src/lib/` for engine-side code, `website/src/lib/` for React/UI code —
  never tangled into game-specific modules. Do **not** upstream it into
  oss-framework immediately: publishing a framework release for every
  tweak makes iteration loops far too long. Iterate and playtest it here;
  once the code has matured and playtesting shows it works, extract the
  `lib/` module into oss-framework and swap the imports to the package.
  The clean separation is what keeps that extraction cheap.
- Installing `@niclaslindstedt/*` packages requires a `GITHUB_PAT` env var
  with `read:packages` (see `.npmrc`); CI falls back to the workflow token.

## Where new code goes

| Change type                                 | Goes in                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| Engine/gameplay logic specific to this game | `src/...` (framework-free TypeScript)                                         |
| Generic engine code (usable by any game)    | `src/lib/...` — earmarked for extraction to oss-framework once mature         |
| App shell, rendering, PWA, game-specific UI | `website/src/...`                                                             |
| Generic React/UI game components            | `website/src/lib/...` — earmarked for extraction to oss-framework once mature |
| Mature, playtested generic code             | extract into `oss-framework`, then import the package here                    |
| Tests                                       | `tests/...` (engine) — name them `*_test.ts`                                  |
| Docs update                                 | `docs/...`                                                                    |
| Examples                                    | `examples/...`                                                                |
| LLM prompt                                  | `prompts/<name>/<major>_<minor>_<patch>.md` (see `prompts/README.md`)         |

## Test conventions

- **All tests live in separate files** — never inline in source files (no `#[cfg(test)]` blocks, no `if __name__ == "__main__"` test harnesses). This keeps source files free of test scaffolding and lets agents, hooks, and linters treat source and test code differently.
- Test files are named with a `_test` or `_tests` suffix (e.g. `output_test.ts`). The stem must match the pattern `_?[Tt]ests?$` per §20 of `OSS_SPEC.md`.
- Tests live in `tests/` and run with **Vitest** (`make test`, or `npx vitest run tests/output_test.ts` for a single file). The include pattern lives in `vitest.config.ts` — keep it in lockstep with the naming rule.
- No test-specific setup is needed today; engine tests run in a plain Node environment.

## Source file size

- Non-test source files must stay under **1000 physical lines** (§20.5 of `OSS_SPEC.md`). When a file grows past the limit, prefer splitting by concern (extracting submodules, helpers, or sibling files) over relaxing the cap.
- A file may opt out by placing `oss-spec:allow-large-file: <reason>` in any comment within its first 20 lines. The reason must be non-empty and motivate why the file genuinely cannot be split (generated code, cohesive state machine, third-party snapshot, inherently dense rule catalogue).

## Documentation sync points

| When you change…                    | Update…                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| engine public API (`src/index.ts`)  | `docs/architecture.md`, `README.md` Usage                                              |
| Make targets / npm scripts          | `README.md` Usage, `CONTRIBUTING.md`, this file                                        |
| deploy slots / pages workflow       | `docs/architecture.md`, `README.md` Play table, `website/pwa-plugin.ts` `DEPLOY_SLOTS` |
| config knobs (env vars, URL params) | `docs/configuration.md`, `README.md` Configuration                                     |
| PWA surface (manifest, icons, SW)   | `docs/architecture.md`, regenerate icons via `make icons`                              |
| version anywhere                    | never by hand — `scripts/update-versions.sh` owns it                                   |

The website must be regenerated whenever source-derived content changes
(§11.2): `website/scripts/extract-source-data.mjs` runs on every build and
fails if `src/version.ts` and `package.json` disagree.

## Parity / cross-cutting rules

- `website/pwa-plugin.ts` `DEPLOY_SLOTS`, `website/src/app/pwa.ts`
  `cacheIdForBase`, and the slot paths in `.github/workflows/pages.yml` must
  agree — a mismatch makes slots clobber each other's precache or serve the
  wrong shell.
- `src/version.ts`, root `package.json`, and `website/package.json` versions
  must match; `tests/version_test.ts` and the extract script both enforce it.
- Icons are generated from `website/public/icon.svg` only (`make icons`) —
  never edit the PNGs.

## Maintenance skills

Per §21 of `OSS_SPEC.md`, this repo ships agent skills for keeping drift-prone artifacts in sync with their sources of truth. Skills live under `.agent/skills/<name>/` and are also accessible via the `.claude/skills` symlink.

| Skill            | When to run                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `maintenance`    | When several artifacts have likely drifted at once — umbrella skill that runs every `update-*` skill in the correct order.        |
| `update-docs`    | After any change to the public API, configuration keys, or error messages.                                                        |
| `update-readme`  | After any change that alters user-visible behavior, commands, or install instructions.                                            |
| `update-website` | After changes that affect the deployed app's SEO surfaces or source-derived content under `website/`.                             |
| `update-prompts` | After any change to an LLM prompt's source of truth (embedded docs, rendering-context keys, JSON-schema enums, validation rules). |
| `sync-oss-spec`  | When the repo may have drifted from `OSS_SPEC.md` — walks the spec's mandates and fixes violations.                               |
| `commit`         | To commit, push, and open/update a PR with a conventional-commit title.                                                           |

Each skill has a `SKILL.md` (the playbook) and a `.last-updated` file (the baseline commit hash). Run a skill by loading its `SKILL.md` and following the discovery process and update checklist. The skill rewrites `.last-updated` at the end of a successful run, and improves itself in place when it discovers new mapping entries. The `maintenance` skill owns a **Registry** table listing every `update-*` skill — add a row whenever you create a new sync skill.
