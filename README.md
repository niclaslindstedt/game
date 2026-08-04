# game

The source repository for **Ada's Trail** — an offline top-down survival
scroller shooter that runs in the browser — and the **mod SDK** its content is
authored with.

[![CI](https://github.com/niclaslindstedt/game/actions/workflows/ci.yml/badge.svg)](https://github.com/niclaslindstedt/game/actions/workflows/ci.yml)
[![SEO](https://github.com/niclaslindstedt/game/actions/workflows/seo.yml/badge.svg)](https://github.com/niclaslindstedt/game/actions/workflows/seo.yml)
[![Pages](https://github.com/niclaslindstedt/game/actions/workflows/pages.yml/badge.svg)](https://github.com/niclaslindstedt/game/actions/workflows/pages.yml)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg)](LICENSE)

**Most people who clone this repo are here to make a mod.** A mod is a folder of
YAML in the game's own content format — no scripting language, no SDK to
install. [`CONTRIBUTING.md`](CONTRIBUTING.md) is the authoring guide; this page
is the development environment it runs in, and
[Testing mod content](#testing-mod-content) below is the loop.

The game itself is deployed at **<https://game.niclaslindstedt.se/>**, with its
generated reference site — bestiary, arsenal, mission guide, story — beside it
at **`/library/`**. It is an installable PWA: open the site and choose **Install
app** / **Add to Home Screen** to launch it fullscreen and offline. What is
_in_ the game is [`docs/game-content.md`](docs/game-content.md); the plot is
[`docs/story.md`](docs/story.md).

## Why?

- **Content is data.** Levels, maps, monsters, items, talents, sprites, sounds,
  music and story are authored as YAML under `content/` and compiled into the
  engine at build time — adding a venue or a monster needs no engine change.
- **A mod is the same format, checked by the same validator.** Anything under
  `content/` is a worked example of its kind, and `mod/tools/cli.mjs check` runs
  the exact compiler the shipped game runs when it loads a mod.
- **Every instrument takes `--mod`.** The map renderers, the headless campaign
  simulator, the weapon-budget calculators and the browser playtest harness all
  measure a mod the same way they measure the shipped game.
- **The engine is framework-free.** `src/` is plain TypeScript with no DOM or
  React assumptions, so it runs in the browser, in Node and in the test suite.
- **One repo, four shells.** The same built site is wrapped for the web, the App
  Store, Steam, and a headless dedicated server for co-op.

## Prerequisites

- **Node.js ≥ 24** — pinned in [`.nvmrc`](.nvmrc); `nvm use` picks it up.
- **GNU make** — the canonical developer entry points.
- Optional: `shellcheck` / `actionlint` for the shell-lint targets, and
  Playwright for the screenshot and playtest harnesses (installed ephemerally:
  `npm install --no-save playwright` — deliberately not a repo dependency).

## Install

```sh
git clone https://github.com/niclaslindstedt/game.git
cd game
npm install
```

Nothing else. Authoring and validating a mod needs no build, and no installed
copy of the game — you only need the game installed to _play_ a mod.

## Quick start

```sh
make website-dev                         # run the game on a local Vite dev server
node mod/tools/cli.mjs new my-mod        # scaffold a mod that already works
node mod/tools/cli.mjs check my-mod      # validate it — the fast inner loop
make test                                # the full test suite
```

## Usage

| Command                               | Purpose                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `make website-dev`                    | Vite dev server for the game app                                                            |
| `make website`                        | Production build of the game app                                                            |
| `make build`                          | Typecheck the engine + app and build the deployable bundle                                  |
| `make test`                           | The Vitest suite (`tests/**/*_test.ts`); `ARGS="--shard=1/3"` forwards to vitest            |
| `make lint`                           | ESLint + TypeScript over the whole repo, zero warnings                                      |
| `make fmt` / `make fmt-check`         | Prettier format / verify                                                                    |
| `make levels`                         | Recompile every content catalog from `content/*.yaml` (fast path when only content changed) |
| `make assets`                         | Regenerate the pixel assets (sprite atlas, tiles, UI font) + previews, then `make levels`   |
| `make mod-check DIR=<dir>`            | Validate a mod (defaults to `mod/examples/greenhouse`)                                      |
| `make mod-catalog`                    | Regenerate `mod/catalog.json` — every id a mod may reference                                |
| `make map LEVEL=<id>` / `map-layout`  | Render a level's annotated map / its clean layout blueprint                                 |
| `make sim-bench`                      | Benchmark the headless simulator (best-of-N, digest-checked)                                |
| `make icons` / `make screenshots`     | Regenerate the PWA icons + OG card / recapture the manifest screenshots                     |
| `make shellcheck` / `make actionlint` | Lint shell scripts / workflow YAML                                                          |
| `make bump`                           | Print the semver bump the release workflow derives from `.changes/unreleased/`              |
| `make changelog VERSION=X.Y.Z`        | Preview a release: collate the changeset fragments into `CHANGELOG.md`                      |
| `npm run library --workspace pwa`     | Rebuild the `/library/` reference pages (part of `make build`)                              |
| `npm run server:start`                | Run the standalone session server for co-op (see `docs/multiplayer.md`)                     |
| `npm run electron:*` / `native:*`     | The Steam and App Store shells — see `electron/README.md` and `native/README.md`            |

**Verify with `make test`, never with a bare `npx vitest run`.** The `make`
targets open by rebuilding the generated content and the sprite atlas; a bare
vitest run tests whatever happens to be on disk, and several committed artifacts
here are drift-tested against a fresh build.

## Repository layout

| Path             | What it is                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `content/`       | **Every authored catalog, as YAML** — the format a mod is written in                                |
| `mod/`           | The mod SDK: the CLI, the compiler, `FORMAT.md`, the worked example, `catalog.json`                 |
| `src/`           | The engine — framework-free TypeScript (`@game/core`); compiled content lands here                  |
| `pwa/`           | The deployable app — a Vite + React PWA shell that mounts the engine                                |
| `scripts/`       | The instruments: renderers, simulators, calculators, catalog generators                             |
| `tests/`         | Vitest suites (`*_test.ts`) — `tests/engine/` on fixtures, `tests/content/` on the shipped catalogs |
| `server/`        | The session server for co-op — the engine compiled for Node                                         |
| `native/`        | The App Store / Play Store shell (Expo, its own dependency tree)                                    |
| `electron/`      | The Steam shell (its own dependency tree, its own tests)                                            |
| `docs/`          | Reference documentation                                                                             |
| `.agent/skills/` | Playbooks for each kind of work — also reachable as `.claude/skills`                                |

Generated catalogs (`src/generated/`, `pwa/src/generated/`) are gitignored and
rebuilt by `make levels` / `make assets`. Never edit or commit one.

## Testing mod content

Authoring is [`CONTRIBUTING.md`](CONTRIBUTING.md). This is how you find out
whether what you authored is valid, balanced, and any good.

### 1. Validate — the fast inner loop

```sh
node mod/tools/cli.mjs check my-mod    # every problem at once, each with its file
node mod/tools/cli.mjs ids boots       # what ids may I reference?
make mod-check DIR=my-mod              # the same check, through make
```

`check` writes nothing and runs the identical compiler the desktop game runs at
load, so a `✓` here means the game will accept it. `mod/AGENTS.md` § "Reading
the errors" decodes every message it can print.

### 2. Measure — every instrument takes `--mod`

Run these **from the repo root**; the mod folder may live anywhere. `--mod` is
repeatable and ordered (`--mod a --mod b` — b wins any id both define, exactly
as the player's load order does), and it registers the compiled result through
the same seam the desktop game uses, so a tool measuring your mod measures what
players get.

| Command                                                            | Answers                                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `node scripts/level-render.mjs <id> --mod <dir> --dormant`         | what the map LOOKS like, drawn with the real sprites and its horde   |
| `node scripts/map-layout.mjs <id> --mod <dir>`                     | the design blueprint: walls, zones, mob level vs promised hero level |
| `node scripts/simulate-run.mjs --mod <dir> --level <id> --verdict` | can it be cleared, at what level, what dropped — PASS/WARN/FAIL      |
| `node scripts/progression-sim.mjs --mod <dir>`                     | where your venue sits on the whole campaign's curve                  |
| `node scripts/weapon-budget.mjs --mod <dir>`                       | is each weapon on the damage budget its `levelReq` is worth          |
| `node scripts/unique-check.mjs --mod <dir>`                        | can that named relic ever actually drop — run it before publishing   |
| `node scripts/drop-rate.mjs --mod <dir> --level <id>`              | how often it drops                                                   |
| `node scripts/sprite-preview.mjs --mod <dir> family <family>`      | a contact sheet of your sprites                                      |
| `node scripts/art-audit.mjs --mod <dir> level <id>`                | every piece of art your venue puts on screen, side by side           |

The full battery — and what does _not_ take `--mod`, and why — is
[`mod/AGENTS.md`](mod/AGENTS.md) step 5.

### 3. Play it in the real renderer

The playtest harness drives the actual app in headless Chromium with the
autoplay bot, so you see your mod as a player does — sprites, sounds, HUD:

```sh
npm install --no-save playwright              # once — deliberately not a repo dep
(cd pwa && npx vite --port 5199 &)            # the dev server, once
node pwa/scripts/playtest.mjs --mod ../my-mod --level my_level --speed 8
```

Screenshots land in `pwa/assets-preview/playtest/` and the run's stats come back
as JSON on stdout. `--speed` fast-forwards deterministically, `--seed` pins the
layout, and `--scenario '{"place":"boss","hp":2}'` stages an exact situation.
This is the one instrument that needs the app running, and the only browser-side
one that takes `--mod` — the harness compiles your mod in Node and hands the
bundles to the app's own loader, because the browser build has no filesystem.

### 4. Play it for real

```sh
node mod/tools/cli.mjs where    # prints the mods folder for your OS
```

Copy or symlink the folder there and it appears under **MODS** on the main menu.
**Mods load in the Steam desktop build only** — the browser and mobile builds
have no Workshop and no filesystem to read a mod from. A mod in that folder is a
_local_ mod: it sorts last in the load order, so the one you are iterating on
wins any clash.

## Configuration

Build-time knobs and the developer surfaces the instruments above rely on:

| Knob                         | Effect                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_BASE`                  | Deploy-slot base path (`/`, `/preview/`, `/branch/`); defaults to `/` locally                                                       |
| `VITE_CHARACTER_SIGNING_KEY` | HMAC key signing exported character archives so hand-edited saves fail to re-import                                                 |
| `?debug`                     | Debug-level output, the in-run FPS meter, and the live state as `window.__game` (plus the `window.__mods` hook the harness uses)    |
| `?level=<id>`                | Start on a specific catalog level instead of the story default                                                                      |
| `?seed=<n>`                  | Pin the run's layout seed so a retry reproduces the same carve                                                                      |
| `?scenario=<json>`           | Stage a fresh run into an exact situation — hero position, vitals, gear, spawned mobs                                               |
| `?cutscene=<id>`             | The cutscene workbench: loop one scene for authoring iteration                                                                      |
| Hidden DEVELOPER menu        | Tap the title screen's sun seven times — unlocks level select, the arsenal and effects galleries, and a debug toggle under SETTINGS |
| `GIS_ENABLE_MODS` et al.     | Desktop packaging capabilities — see the `desktop-steam` / `desktop-dist` targets in the [`Makefile`](Makefile)                     |

Full reference: [`docs/configuration.md`](docs/configuration.md).

## Examples

- [`mod/examples/greenhouse`](mod/examples/greenhouse) — a complete worked mod
  (one venue, one monster, one weapon, one relic, sprites, a sound, a score),
  with a comment on every field. `cli.mjs new` copies it.
- [`content/`](content) — the shipped game's own catalogs, in the same format.
- [`examples/`](examples) — empty until there is engine API worth demonstrating.

## Troubleshooting

- **A mod compiles but its monster never appears** — the sprite family needs
  both frames (`x_0` and `x_1`); `check` reports this as `sprite "x" has no frames`.
- **A level compiles but no run can be built from it** — a venue is two files:
  the mission and the `maps/<id>.yaml` blueprint it is carved from every run.
- **The deployed game doesn't update after a deploy** — the previous build's
  service worker is parked in `waiting`; the in-app update toast applies it, or
  close every tab and reopen.
- More in [`docs/troubleshooting.md`](docs/troubleshooting.md).

## Documentation

**Modding**

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — authoring a mod, start to publish
- [`mod/FORMAT.md`](mod/FORMAT.md) — every file and every field
- [`mod/AGENTS.md`](mod/AGENTS.md) — the same procedure as a checklist, with every command
- [`docs/modding.md`](docs/modding.md) — how a mod is compiled, loaded and resolved

**The repo**

- [Getting started](docs/getting-started.md) — a fresh clone to a running build
- [Architecture](docs/architecture.md) — the module map, the shells, deployment
- [The content pipeline](docs/content-pipeline.md) — how every catalog compiles
- [Rendering](docs/rendering.md) — the projection, the post effects, the canvas
- [Game content](docs/game-content.md) · [Story](docs/story.md) · [Manuscript](docs/manuscript.md)
- [Art style](docs/art-style.md) · [Naming](docs/naming.md)
- [Multiplayer](docs/multiplayer.md) · [Configuration](docs/configuration.md) · [Troubleshooting](docs/troubleshooting.md)
- [`AGENTS.md`](AGENTS.md) — the conventions this repo is maintained under
- [`OSS_SPEC.md`](OSS_SPEC.md) — the layout and governance spec it conforms to

Deployment is three GitHub Pages slots on one origin: `/` serves the highest
`v*` tag, `/preview/` every `main` push, and `/branch/` a branch parked via the
`pages` workflow dispatch.

Discussion happens in
[GitHub Issues](https://github.com/niclaslindstedt/game/issues) (bugs, feature
requests) and
[GitHub Discussions](https://github.com/niclaslindstedt/game/discussions)
(questions, ideas).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — it covers authoring mod content, and
what to do if a change belongs in this repo instead.

## License

Licensed under [PolyForm Noncommercial 1.0.0](LICENSE), with one exception: the
**Mod SDK** in [`mod/`](mod/) has its own terms ([`mod/LICENSE.md`](mod/LICENSE.md)).
The samples a modder copies — `mod/examples/` and the format docs — are public
domain (CC0), and your mod is yours; the toolchain in `mod/tools/` is licensed
for authoring content for this game rather than for reuse in another one.
