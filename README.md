# game

**Gone in Space** — survive the search for your lost love. Ada went out for a midnight walk and never came back; the trail leads to the moon. An offline top-down survival scroller shooter that runs entirely in your browser: you steer with the pointer (or touch), and your character fights on its own according to the weapons and items it picks up.

[![CI](https://github.com/niclaslindstedt/game/actions/workflows/ci.yml/badge.svg)](https://github.com/niclaslindstedt/game/actions/workflows/ci.yml)
[![SEO](https://github.com/niclaslindstedt/game/actions/workflows/seo.yml/badge.svg)](https://github.com/niclaslindstedt/game/actions/workflows/seo.yml)
[![Pages](https://github.com/niclaslindstedt/game/actions/workflows/pages.yml/badge.svg)](https://github.com/niclaslindstedt/game/actions/workflows/pages.yml)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg)](LICENSE)

> **Status: first playable level.** Pick a difficulty on the Doom-style
> main menu, steer your character across the haunted moon to a chiptune
> soundtrack, let the auto-firing weapons thin the ghost horde, loot gear
> and powers, and take down ARMSTRONG at the old flag. Dying shows a run
> summary with a retry button.

## Why?

- **One-touch play** — hold to steer, release to stop. Your loadout does the
  fighting, so the game works equally well with a mouse or a thumb.
- **Runs entirely in the browser** — no account, no server, no install step.
  Game state lives on your device.
- **Fully offline** — the game is an installable PWA that precaches itself;
  once loaded it launches and plays with no network at all.
- **Built to be built on** — reusable game components and code are developed
  against [`oss-framework`](https://github.com/niclaslindstedt/oss-framework)
  so later games can share them.

## Play

The deployed game lives at **<https://game.niclaslindstedt.se/>**:

| Slot       | URL         | Serves                                                    |
| ---------- | ----------- | --------------------------------------------------------- |
| Production | `/`         | The latest release (or `main` until the first release)    |
| Preview    | `/preview/` | The current `main`, on every push                         |
| Branch     | `/branch/`  | A feature branch parked via the `pages` workflow dispatch |

### How to play

Level 2 — THE MOON: Ada went out for a midnight walk and never came back;
the trail leads here. Ghosts thicken the further you stray from the lander,
and something enormous haunts the old flag.

- Pick **NEW GAME** on the main menu and choose a difficulty — EASY,
  MEDIUM, HARD, NIGHTMARE, or JESUS CHRIST! Harder settings raise the horde
  size and monster health, but drop loot more often and unlock higher item
  tiers (epic and legendary) that the moon alone never rolls.
- **Steer with the pointer** — on desktop the character chases the cursor;
  on touch, hold a finger down and release to stop. (Swap the mouse back to
  classic hold-to-steer under SETTINGS → CONTROLS.)
- **Tap** (or press Space) to **jump** — moon gravity carries you high
  enough to sail clean over a ghost's grasp.
- **Ability pickups** (fire orbs, storm cell, stasis field) are carried
  with you — on desktop **click** (or press E, or the HUD USE button) to
  pop one when the horde closes in; on touch they fire the moment you grab
  them (two-finger tap uses one manually). Tune it under SETTINGS, along
  with music and sound volumes.
- The character **fights by itself** with whatever weapon is equipped —
  your job is positioning: kite the haunting, don't get surrounded.
- Kills grant **XP**; each level-up pauses the run to spend a stat point on
  HEALTH, STRENGTH (melee), DEXTERITY (ranged), INTELLECT (magic), or LUCK
  (crits, loot).
- Ghosts drop **loot** — medkits, weapons, and gear in regular or magic
  tier. Open the **BAG** (or press I) for the Diablo-style inventory: drag
  items onto their slot or tap to quick-equip.
- **Kill ARMSTRONG**, the giant astronaut ghost guarding the flag, to clear
  the level; if your HP reaches zero the run ends with a stats screen and a
  retry button.

### Install it as an app

The game is a Progressive Web App: open the site in your browser and choose
**Install app** / **Add to Home Screen** from the browser menu. The installed
app launches fullscreen, works offline, and shows a small toast when a new
build is ready — reload when it suits you; an update never interrupts a run.

## Prerequisites

- **Node.js ≥ 24** (pinned in [`.nvmrc`](.nvmrc); `nvm use` picks it up).
- **A `GITHUB_PAT` environment variable** holding a GitHub personal access
  token with the `read:packages` scope. The
  [`@niclaslindstedt/oss-framework`](https://github.com/niclaslindstedt/oss-framework)
  dependency is served from GitHub Packages, which requires authentication
  even for reads (see [`.npmrc`](.npmrc)).
- `make` for the developer entry points, `shellcheck`/`actionlint` for the
  optional shell-lint targets.

## Install

```sh
git clone https://github.com/niclaslindstedt/game.git
cd game
export GITHUB_PAT=ghp_yourtoken   # read:packages
npm install
```

## Quick start

```sh
make website-dev   # start the game app on a local Vite dev server
make test          # run the engine test suite
make build         # typecheck everything and produce website/dist
```

## Usage

| Command                               | Purpose                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `make build`                          | Typecheck the engine + app and build the deployable bundle                                                  |
| `make test`                           | Run the Vitest suite (`tests/*_test.ts`)                                                                    |
| `make lint`                           | ESLint + TypeScript over the whole repo, zero warnings                                                      |
| `make fmt` / `make fmt-check`         | Prettier format / verify                                                                                    |
| `make website-dev`                    | Local dev server for the game app                                                                           |
| `make website`                        | Production build of the game app                                                                            |
| `make icons`                          | Regenerate all PWA icons + the OG card from `website/public/icon.svg`                                       |
| `make assets`                         | Regenerate in-game pixel assets (sprites, tiles, UI font) + previews from `website/scripts/sprite-data.mjs` |
| `make shellcheck` / `make actionlint` | Lint shell scripts / workflow YAML                                                                          |
| `make bump`                           | Print the semver bump the release workflow derives from `.changes/unreleased/`                              |
| `make changelog VERSION=X.Y.Z`        | Preview a release: collate the changeset fragments into `CHANGELOG.md`                                      |

## Configuration

The game has no user-facing configuration yet. Build-time knobs:

| Variable           | Effect                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_PAT`       | Auth for GitHub Packages installs (`.npmrc`)                                                                                                    |
| `VITE_BASE`        | Deploy-slot base path (`/`, `/preview/`, `/branch/`); defaults to `/` for local builds                                                          |
| `?debug` URL param | Turns on debug-level console output (`src/output.ts`) and exposes the live game state as `window.__game` for inspection and automated playtests |

## Examples

See [`examples/`](examples/) — empty until there is gameplay API worth
demonstrating.

## Troubleshooting

- **`npm install` fails with 401/403 against `npm.pkg.github.com`** — your
  `GITHUB_PAT` is missing, expired, or lacks the `read:packages` scope.
- **`npm` complains `Failed to replace env in config: ${GITHUB_PAT}`** — the
  variable is unset in this shell; `export GITHUB_PAT=…` and retry.
- **The deployed game doesn't update after a deploy** — the previous build's
  service worker is parked in `waiting`; the in-app update toast applies it,
  or close every tab of the app and reopen.
- More in [docs/troubleshooting.md](docs/troubleshooting.md).

## Documentation

- [Getting started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Configuration](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)

Discussion happens in
[GitHub Issues](https://github.com/niclaslindstedt/game/issues) (bugs,
feature requests) and
[GitHub Discussions](https://github.com/niclaslindstedt/game/discussions)
(questions, ideas).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Licensed under [PolyForm Noncommercial 1.0.0](LICENSE).
