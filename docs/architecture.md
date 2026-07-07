# Architecture

## The shape of the project

This is a **webapp-kind** project per OSS_SPEC §11.4: the deployed website
_is_ the game. There is no marketing site — every build artifact is the
playable app.

Two layers with a one-way dependency:

```
website/  (the app: Vite + React PWA shell, rendering, deploy concerns)
   │  imports via @game/core
   ▼
src/      (the engine: framework-free TypeScript game logic)
```

### `src/` — the engine

Pure TypeScript with no React and no build-tool coupling. The simulation is
deterministic by construction: `createGame(seed, levelId?, difficulty?)`
builds the level from a seeded RNG, and `step(state, input, dtMs)` advances
it with a fixed timestep — the same seed, difficulty, and input sequence
always replays the same run, which is what makes gameplay unit-testable in
plain Node and bugs reproducible.

Content is data, simulation is code: the game's levels, monsters,
equipment, and cutscenes live in **catalogs** under `src/game/defs/`, and
the engine only ever references them by id. Shipping level 12 or the
hundredth weapon means adding catalog entries, not touching the simulation.

- **`src/game/config.ts`** — the GLOBAL balance knobs (player, jumping, XP
  curve, stat effects, loot rules), nothing hardcoded in logic.
- **`src/game/defs/levels.ts`** — the level registry: geometry, per-level
  gravity (the moon's low g is why jumps soar), biome, the story intro text,
  an optional prelude cutscene id, landmark props, banded enemy spawns, the
  objective (`killBoss` / `clearAll`), solid obstacles (tall pieces block
  everyone; low ones can be jumped by the player but never by monsters),
  deliberate `walls` (segments expanded into chains of solid circles at
  creation — door gaps between segments are how SPACEZ HQ carves its rooms),
  decor, and the loot table (pools + tier chances).
- **`src/game/defs/enemies.ts`** — the monster catalog (stats, AI radii,
  roles; bosses pin guaranteed drops). Level 1 ships the SpaceZ night shift
  (intern → lab scientist → propulsion engineer → security guard → hazmat
  tech) plus MUSKRAT, the mutant rat under the prototype rocket; level 2
  ships wisp → moon ghost → wraith plus ARMSTRONG, the giant astronaut
  ghost guarding the flag.
- **`src/game/defs/cutscenes.ts`** — the cutscene catalog: pure-data scenes
  (a stage of props, a cast, a beat timeline) played by the generic
  `@game/lib/cutscene` state machine. A level references a scene via its
  `prelude` field; the run then opens in the `cutscene` phase (the sim
  frozen underneath), advanced by `step()` on the same clock, tapped
  through with `tapCutscene` or ended with `skipCutscene`.
- **`src/game/defs/equipment.ts`** — weapons (melee/ranged/magic classes,
  each with a durability budget — dropped weapons wear out per attack and
  break; the starting sidearm is minted unbreakable), gear, the four-tier
  quality ladder (regular/magic/epic/legendary — later levels unlock the
  upper tiers), and the affix pools magic+ items roll.
- **`src/game/defs/abilities.ts`** — the ability pickups: time-limited
  powers (orbiting fire orbs, storm strikes, stasis slow fields, the item
  magnet whose pull radius grows with INTELLIGENCE) plus the instant
  screen nuke (kills every non-boss monster on screen, its drop rate kept
  rare by `LOOT.nukeShare`); levels choose which can drop via their
  `loot.abilityPool`. Pickups are banked into `player.heldAbilities` (up
  to `HELD_ITEMS.cap`) and spent with the `useItem` input.
- **`src/game/defs/difficulties.ts`** — the difficulty ladder (EASY →
  MEDIUM → HARD → NIGHTMARE → JESUS CHRIST!), chosen on the main menu and
  layered over every level: multipliers for spawn counts, monster hp, and
  the wave spawner's live cap, plus loot sweeteners (drop-chance bonus and
  per-tier chance bonuses that unlock epic/legendary on levels whose own
  loot table caps lower). MEDIUM is the exact 1.0 baseline.
- **`src/game/abilities.ts`** — ability activation and the helpers the
  renderer shares (`orbPositions`, `stasisFactorAt`); the per-tick behavior
  runs inside `step.ts` so all damage flows through one path.
- **`src/game/types.ts`** — state shapes plus the `GameEvent` union: events
  are the only channel from simulation to presentation (sound, flashes);
  the engine never knows a renderer or speaker exists.
- **`src/game/create.ts`** — seeded run setup from a level def: difficulty
  bands scale with distance from the player spawn toward the objective.
- **`src/game/step.ts`** — the per-tick pipeline, in documented order:
  player steering + jump physics (+ obstacle push-out) → use-item edge →
  weapon auto-attack (wearing the weapon's durability) → abilities →
  projectiles → enemies (aggro/guard AI, contact damage, obstacle
  push-out) → wave spawner → item pickups → objective → win/lose. The
  character fights autonomously (and only targets monsters inside the
  visible view the app passes in `input.view`); the player steers, jumps
  (tap/Space), spends banked ability pickups (`input.useItem`), spends
  level-up stat points, and manages the inventory. Level-ups restore full
  health; golden XP arrows grant a fixed share of the current threshold.
  Picked-up equipment that beats what is worn is equipped on the spot.
- **`src/game/items.ts`** — equipment instances and the player-driven
  mutations the UI calls into: loot rolls, `equipFromInventory` /
  `unequipToInventory` / `moveInventoryItem`, `allocateStat`, the derived
  stats (max hp, weapon damage, move speed, crit chance), the auto-equip
  scoring (`weaponScore` DPS / `gearScore`), and the durability cycle
  (`wearEquippedWeapon` — a broken weapon is trashed and the best bag
  weapon takes over — and `repairEquippedWeapon` for repair-kit drops).
- **`src/game/bot.ts`** — the autopilot: pure strategies (`idle`, `rush`,
  `kite`, `boss`, `survivor`) that turn the live state into ordinary
  `GameInput`, so a bot can sit anywhere a player does — headless tests,
  the app's `?bot=` autoplay mode, and later an AI-driven second player.
- **`src/lib/`** — generic, game-agnostic helpers (`vec.ts`, `rng.ts`,
  `cutscene.ts` — the deterministic beat-machine cutscene player),
  imported via the `@game/lib/*` alias and earmarked for extraction into
  oss-framework once mature (extraction is then a prefix swap).
- **`src/index.ts`** — the public surface the app imports via `@game/core`.

`src/output.ts` remains the central output module (OSS_SPEC §19.4) through
which all diagnostic output flows: semantic helpers
(`status`/`warn`/`info`/`header`/`error`/`debug`), an always-on in-memory
log buffer (`recentLogs()`), and a debug switch (`?debug` URL param or
`setDebugEnabled`). Raw `console.*` calls outside this module fail lint.

### `website/` — the app

A Vite + React 19 shell that mounts the engine and owns everything
deploy-shaped:

- **`website/src/App.tsx`** — the app shell: splash main menu ↔ the game,
  plus the cutscene workbench route (`?cutscene=<id>`).
- **`website/src/game/`** — the presentation of the engine:
  `TitleScreen.tsx` (the Doom-style splash menu: starfield, logo,
  keyboard-and-pointer navigation, NEW GAME → the difficulty ladder,
  SETTINGS → controls + volumes, HOW TO PLAY), `GameScreen.tsx` (canvas
  mount, fixed-timestep loop, control-scheme input mapping, HUD with hp/XP
  bars and the banked-item USE button, end-of-run splash),
  `IntroOverlay.tsx` (the level's story text box + chosen difficulty),
  `CutsceneOverlay.tsx` (draws a running scene — backdrop, props, cast,
  fade, dialogue — while the engine sits in the `cutscene` phase; TAP
  advances a beat, SKIP ends the scene) and `CutscenePreview.tsx` (the
  `?cutscene=<id>` workbench that loops one scene outside any run),
  `LevelUpOverlay.tsx` (the stat chooser shown while the engine pauses in
  `levelup`; folds into a 3×2 grid on landscape phones),
  `InventoryPanel.tsx` (the Diablo-style bag: drag-to-equip slots,
  tier-colored borders, item card, character sheet), `render.ts` (camera +
  sprite drawing onto a world-unit canvas upscaled with `image-rendering:
pixelated`), `tiers.ts` (tier name colors), `sfx.ts` (engine events →
  synthesized NES-palette sounds + menu UI sounds), `music.ts` (the
  original chiptune title/level themes as note data), `audio.ts` (one
  shared synth split into SFX/music volume views), `settings.ts`
  (persisted control-scheme + volume settings), `progress.ts` (persisted
  story progress: watched cutscenes, so a prelude plays once per device),
  `assets.ts` (loads the generated sprites + pixel font), and `assets/`
  (generated PNGs + font atlas — never hand-edited).
- **`website/src/lib/`** — generic game UI plumbing imported via the
  `@ui/lib/*` alias and earmarked for oss-framework extraction:
  `game-loop.ts` (fixed-timestep rAF loop), `pointer.ts` (pointer gestures:
  hold/hover steering state, taps with finger count, press edges),
  `synth.ts` (WebAudio SFX synth — the game ships zero audio files),
  `chiptune.ts` (the NES-style music sequencer scheduling note-data tracks
  on the synth), `pixel-font.ts` + `PixelText.tsx` (runtime renderer for
  the generated bitmap font), `flag-store.ts` (a persisted string-flag set
  with graceful no-storage fallback), `load-images.ts`.
- **`website/scripts/asset-tools/` + `sprite-data.mjs` +
  `generate-assets.mjs`** — the pixel-asset pipeline (`make assets`):
  sprites are character grids with ramp-derived palettes, rendered at build
  time to committed PNGs plus gitignored previews (contact sheet, film
  strips, palette sheet, font specimen). See the `pixel-assets` skill.
- **`website/scripts/playtest.mjs`** — the autoplay bot that drives real
  runs headlessly through the `?debug` state hook. See the `playtest`
  skill.
- **`website/scripts/cutscene-preview.mjs`** — the scene review harness:
  plays one cutscene in headless Chromium via the workbench and
  screenshots every beat into `website/assets-preview/cutscenes/<id>/`,
  so a scene edit is reviewed like a storyboard contact sheet.
- **`website/pwa-plugin.ts`** — emits the service worker, `version.json`,
  and `precache-manifest.json` at build time (the pattern is borrowed from
  the oss-framework demo). The worker precaches the app shell, parks new
  builds in `waiting`, and only takes over when the player accepts the
  update toast — a mid-run silent refresh would destroy the run.
- **`website/src/app/pwa.ts`** — the per-slot precache cache id shared by
  the plugin (Node side) and the app (browser side).
- **`website/scripts/`** — source-data extraction (§11.2), SEO generation
  (sitemap/robots/llms/404, §11.3), and the structural SEO checker
  (§11.3.10).

The app consumes
[`@niclaslindstedt/oss-framework`](https://github.com/niclaslindstedt/oss-framework)
for local-first PWA plumbing (today: `usePwaUpdate` + `UpdateToast`; more as
the game grows). Game-agnostic code is kept in the dedicated `src/lib/` and
`website/src/lib/` areas so it can be extracted into the framework for reuse
in later games once it has matured through playtesting — see `AGENTS.md` for
the policy.

## Deployment topology

GitHub Pages serves three deploy slots on one origin —
**<https://game.niclaslindstedt.se/>**, a custom domain (CNAME) on the
GitHub Pages origin — assembled by a single `pages.yml` run into one
artifact:

| Slot       | URL         | Source                                                                                     | Indexed        |
| ---------- | ----------- | ------------------------------------------------------------------------------------------ | -------------- |
| Production | `/`         | Highest `v*` tag (or `main` before the first release)                                      | Yes            |
| Staging    | `/preview/` | `main` HEAD, every push                                                                    | No (`noindex`) |
| Branch     | `/branch/`  | Last branch parked via `workflow_dispatch`, persisted in the `branch-deploy` orphan branch | No (`noindex`) |

Each slot is built separately with its own `VITE_BASE`, gets its own service
worker scoped to its base, and a disjoint precache id (`game`,
`game-preview`, `game-branch`) so the builds never poison each other. The
production worker's scope covers the nested slots, so it carries a
navigation denylist and refuses to answer their navigations.

Releases: a maintainer dispatches `release.yml`, which derives the semver
bump from the changeset fragments in `.changes/unreleased/` (front-matter
`type` + optional `breaking: true` — see `scripts/release/compute-bump.mjs`;
an explicit patch/minor/major input overrides it), consumes the fragments
into a new dated `CHANGELOG.md` section, rewrites every version string
(`scripts/update-versions.sh`), runs the build + tests, commits and tags
`vX.Y.Z` on `main`, publishes a GitHub Release, and chains into `pages.yml`
so the new tag is live at the site root immediately. Everything happens in
one dispatched run with the default `GITHUB_TOKEN` — no `RELEASE_TOKEN` PAT.
Every PR that touches user-visible code must add a fragment under
`.changes/unreleased/` (CI's `changeset` job enforces it; label a PR
`no-changelog` to opt out).

## Design decisions

- **Engine/app split** — gameplay logic stays renderer-agnostic so it can be
  unit-tested in Node without a DOM, and so a future renderer change (canvas
  → WebGL/WebGPU) never touches game rules.
- **Hand-rolled service worker over Workbox** — the framework's
  `usePwaUpdate` needs three emitted files and one cache-naming convention;
  emitting them from a small Vite plugin is cheaper than adopting the
  Workbox toolchain, and the update flow stays fully inspectable.
- **Events over callbacks** — the simulation reports what happened
  (`GameEvent[]` per step) and the app decides how to present it. Sound,
  screen flashes, and future particles hang off the same channel without
  the engine growing presentation hooks.
- **Generated assets over binaries** — sprites, tiles, and the UI font are
  committed PNGs, but their sources of truth are reviewable text
  (pixel grids, palette ramps, glyph definitions) rendered by
  `make assets`. Art is diffable and agent-editable like any other code.
- **Synthesized audio over audio files** — every sound is a handful of
  WebAudio oscillator/noise parameters in `website/src/game/sfx.ts`, and
  the background music is note data (`website/src/game/music.ts`) played
  by a small sequencer (`@ui/lib/chiptune.ts`) on the same synth — the
  offline PWA payload stays tiny and both tunes are diffable code.
