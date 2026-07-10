# game

**Gone in Space** — survive the search for your lost love. Ada went out for chips and soda on movie night and never came back; the trail leads off-planet. An offline top-down survival scroller shooter that runs entirely in your browser: you steer with the pointer (or touch), and your character fights on its own according to the weapons and items it picks up.

[![CI](https://github.com/niclaslindstedt/game/actions/workflows/ci.yml/badge.svg)](https://github.com/niclaslindstedt/game/actions/workflows/ci.yml)
[![SEO](https://github.com/niclaslindstedt/game/actions/workflows/seo.yml/badge.svg)](https://github.com/niclaslindstedt/game/actions/workflows/seo.yml)
[![Pages](https://github.com/niclaslindstedt/game/actions/workflows/pages.yml/badge.svg)](https://github.com/niclaslindstedt/game/actions/workflows/pages.yml)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg)](LICENSE)

> **Status: four playable levels.** Pick a difficulty on the Doom-style
> main menu and you drop straight into the story (the mission picker only
> unlocks once you have cleared the campaign at that difficulty), sit through
> the movie-night prelude (or hit SKIP, top right), raid SPACEZ HQ for the
> drive ingredient MUSKRAT the mutant rat swallowed, take the fight to
> the haunted moon and ARMSTRONG at the old flag, storm the secret Mars
> colony ELON MOSQUE owns (he flees into a rift rather than lose), then
> follow him into THE RIFT itself — a hallucinatory void of black holes,
> asteroid rain, and history's missing, guarded by GROK OMEGA, ZAI's secret
> superintelligence — all to a chiptune soundtrack, looting gear and powers
> while the auto-firing weapons thin the horde. Beat one of the rift's
> legends (TESLA, EARHART, RASPUTIN — or LUCKY the leprechaun) and choose:
> KILL for the loot, or SPARE them and they join you as a companion —
> fighting at your side, dressable from your bag (weapon, helmet, chest),
> and walking with you into the next level; sparing LUCKY buys his +50%
> magic-find aura. Each run's end screen shows a summary with a retry
> button and your best survival time on that difficulty.

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

Level 1 — SPACEZ HQ: Ada went out for chips and soda and never came back.
Her jacket's beacon points off-planet, and an interplanetary drive needs
the one ingredient SpaceZ keeps in its cleanroom — the one MUSKRAT, a
mutant lab rat, just ate. Fight through the night shift (interns,
scientists, engineers, guards, hazmat techs), through walled offices and
lab corridors, to his nest under the prototype rocket. Level 2 — THE MOON:
the beacon's trail. Ghosts thicken the further you stray from the lander,
and something enormous haunts the old flag.

- Pick **NEW GAME** on the main menu and choose a difficulty — EASY,
  MEDIUM, HARD, NIGHTMARE, or JESUS CHRIST! Harder settings raise the horde
  size and monster LEVEL — and since item tiers unlock by monster level
  (magic, then rare, with unique and legendary plumbed in above), the hard
  rungs drop more loot, reach every tier earlier, and add their own bonus
  odds on top.
- The run opens on a short **cutscene** (the movie night Ada never came
  back from) — tap (or press **Space** / **Enter**) to advance a beat, hit
  SKIP, or press **Escape** to skip the whole scene. It plays **once per
  device**: retries and later runs jump straight to the level.
- **Steer with the pointer** — on desktop the character chases the cursor;
  on touch, hold and drag: a virtual joystick appears under your finger and
  you walk in the direction you drag — release to stop. (Swap the mouse
  back to classic hold-to-steer under SETTINGS → CONTROLS.)
- **Or use the keyboard** — on desktop, **WASD / arrow keys** run, **Shift**
  walks, and no key stands still (a binary run/walk mode that frees the mouse
  from steering). Toggle it under SETTINGS → CONTROLS.
- **Tap** (with the other hand while steering, or press Space) to **jump**
  — each level sets its own gravity: HQ hops clear a desk; moon gravity
  sails you clean over a ghost's grasp.
- **Feel the game** — on phones with a vibration motor, every takedown
  buzzes, and the bigger the mob the harder it hits (a minion flicks, a boss
  rumbles); dialogue is felt too, each letter of the crawl ticking under your
  thumb. Turn it off under SETTINGS → CONTROLS. (iOS has no web vibration, so
  it's silently inert there.)
- **Pause** any time with **P** or **Escape** on desktop — the game and its
  music freeze on a pause screen; click or press **P**/**Escape** again to
  resume. The run also auto-pauses when you switch away (on a phone, just
  leave the app).
- **Obstacles** litter every level and nothing walks through them — desks,
  crates, and low rocks can be **jumped over**, and monsters can't jump: a
  barrier the horde must flow around is your best friend. SPACEZ HQ's
  walls only pass at their doorways — the horde funnels; you decide where.
- **Ability pickups** (fire orbs, storm cell, stasis field, the item
  magnet — and the rare screen-clearing NUKE) are carried with you and
  banked into **three big powerup slots** in a bottom corner, oldest on the
  left. **Tap a slot** (or on desktop click, press E, or hit **1/2/3**) to
  spend one when the horde closes in — the rest slide left. On desktop **Q**
  pops the weapon switcher and **1-4** equip a carried weapon. Prefer the
  corner on your other thumb, or fire powerups the instant you grab them?
  Both live under SETTINGS → CONTROLS, along with music and sound volumes.
- The character **fights by itself** with whatever weapon is equipped —
  your job is positioning: kite the haunting, don't get surrounded.
- Kills grant **XP**; each level-up **restores you to full health** and
  pauses the run to spend a stat point. The stats each own an axis:
  **STRENGTH** hits the hardest for **damage** (melee & ranged — more per point
  than any other stat lifts its class) and widens your carry bag (which starts
  at just three slots), but the muscle to haul **slows your walk** a touch per
  point; **DEXTERITY** speeds up melee & ranged
  **attacks** and raises your **hit rate** — a nimble hero's blows miss or get
  dodged far less often; **INTELLECT** powers **magic** weapons, gives every weapon
  **longer range**, and **widens the melee cleave** — a swing only strikes the
  two nearest foes until INT raises that cap, so mowing down the crowd is an
  INT build, not a free perk of a wide sword; **SPEED** quickens the walk;
  **LUCK** lands crits and finds better loot; **STAMINA** deepens your sprint
  pool and quickens its recovery, so you run at full speed longer before the
  winded half-speed jog. The
  base fire rate is deliberately slow, so a build is what wins the cadence
  back, and a new **(i)** button on the level-up screen spells out exactly
  what each stat does. Golden
  **XP arrows** drop from the horde and are always worth a fixed share of
  your next level.
- The horde drops **loot**, Diablo-style — medkits, gear, repair kits, energy
  drinks, XP arrows, and **base weapons themed to each level** (a box cutter or the
  armory's pump shotgun on earth, 70s hardware on the moon, AI-forged
  railguns and plasma blades on Mars, historic and fantasy arms in the
  rift). Each base has a **level requirement** — it neither drops from
  monsters below it nor equips before you reach it — and each drop carries
  an **item level** near its killer's that sizes its magic bonuses, so a
  deep find genuinely outrolls an early one. Picking up something **better
  than what you wear equips it instantly**; the rest lands in the **BAG** —
  open it with the **hero avatar** in the top-left vitals panel (or press I)
  for a Diablo-style inventory: drag items onto their slot or tap to
  quick-equip. Prefer to curate your own loadout? Turn auto-equip off under
  SETTINGS → CONTROLS and every find banks to the bag instead.
- Dropped weapons **wear out** as they fire: when one breaks it is trashed
  and the best weapon left in your bag takes its place (your own sidearm
  never breaks). **Repair kits** restore the equipped weapon's edge,
  **energy drinks** reset your sprint pool to full, and
  grabbing a **fresh copy of the weapon you already hold** swaps it in for
  the extra durability, banking the worn one as a spare.
- **Unique mobs** wait at set spots on every level — larger, named
  characters (the NIGHT MANAGER, DR. NOVA, the ghost of an Apollo MISSION
  SPECIALIST…) that **rush into view and talk**: each scene reveals a
  piece of the plot — what SPACEZ launches after midnight, what was under
  the flag in '69, who really came home. Kill one and it drops a
  **signature weapon** (better than the level's pool, shy of the boss's)
  plus **story items**: keycards that open **locked rooms** (spare parts,
  the alien anti-grav unit) and documents that deepen the mystery.
- **Don't get complacent when you're winning.** Once you're outclassing the
  horde — **one-shotting mobs for far more than they're worth** and clearing at
  a blistering pace — you build **menace** and a RAMPAGE gauge lights up on the
  HUD. It reads how _overpowered_ you are, not just how fast you swing, so a
  fresh hero can't trip it in the opening levels; it takes a genuinely lopsided
  build. How touchy it is depends on the difficulty: **EASY** barely reacts,
  **MEDIUM** answers only a truly dominant run, and each harder rung is more
  sensitive up to **JESUS CHRIST!**, where a handful of kills is enough. When it
  lights, the horde answers: it **lures more foes** onto you, **evolves** the
  mobs it sends into tougher versions (marked by a glowing aura) that pay more
  XP and drop better gear, and scales elite mobs and bosses to your power so
  they can't be one-shot. Ease off and the meter cools.
- **Kill the boss** — MUSKRAT under the rocket, ARMSTRONG at the flag — to
  clear the level; bosses have their own longer stare-down scenes before
  the fight. If your HP reaches zero the run ends with a stats screen and
  a retry button.

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

| Command                               | Purpose                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `make build`                          | Typecheck the engine + app and build the deployable bundle                                                    |
| `make test`                           | Run the Vitest suite (`tests/*_test.ts`)                                                                      |
| `make lint`                           | ESLint + TypeScript over the whole repo, zero warnings                                                        |
| `make fmt` / `make fmt-check`         | Prettier format / verify                                                                                      |
| `make website-dev`                    | Local dev server for the game app                                                                             |
| `make website`                        | Production build of the game app                                                                              |
| `make icons`                          | Regenerate all PWA icons + the OG card from `website/public/icon.svg`                                         |
| `make assets`                         | Regenerate in-game pixel assets (sprite atlas, tiles, UI font) + previews from `website/scripts/sprite-data/` |
| `make shellcheck` / `make actionlint` | Lint shell scripts / workflow YAML                                                                            |
| `make bump`                           | Print the semver bump the release workflow derives from `.changes/unreleased/`                                |
| `make changelog VERSION=X.Y.Z`        | Preview a release: collate the changeset fragments into `CHANGELOG.md`                                        |

## Configuration

The game has no user-facing configuration yet. Build-time knobs:

| Variable                   | Effect                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_PAT`               | Auth for GitHub Packages installs (`.npmrc`)                                                                                                    |
| `VITE_BASE`                | Deploy-slot base path (`/`, `/preview/`, `/branch/`); defaults to `/` for local builds                                                          |
| `?debug` URL param         | Turns on debug-level console output (`src/output.ts`) and exposes the live game state as `window.__game` for inspection and automated playtests |
| `?level=<id>` URL param    | Starts runs on a specific catalog level (`spacez_hq`, `moon`, `mars`, `the_rift`) instead of the story default                                  |
| `?seed=<n>` URL param      | Pins the run's layout seed so retries reproduce the same level layout                                                                           |
| `?cutscene=<id>` URL param | Opens the cutscene workbench: loops one scene from the catalog for authoring iteration (see `docs/configuration.md`)                            |
| Hidden DEVELOPER menu      | Long-press the title moon to unlock a DEVELOPER row in SETTINGS: level select (warp) and a (currently inert) debug-mode toggle                  |

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

## Making a sequel / new game on this engine

This repo is built to be built on: a new game is a clone with the first
game's assets and story stripped and new content authored on the same
engine. The engine (`src/`) is content-agnostic — all levels, enemies,
equipment, abilities, and story are data under `src/game/defs/`, and the
brand identity is one file (`game.config.json`). The step-by-step playbook is
the **`new-game`** agent skill (`.agent/skills/new-game/SKILL.md`): rename via
the identity config, strip the content catalogs and this game's docs/tests,
then rebuild with the `engine-system`, `pixel-assets`, `sound-effects`, and
`playtest` skills. See [Architecture › Extension points](docs/architecture.md)
for how to add new _mechanics_ (not just new content).

## Documentation

- [Getting started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Game content](docs/game-content.md) — this game's story, levels, and roster
- [Manuscript](docs/manuscript.md) — the source of truth for all story and dialogue
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
