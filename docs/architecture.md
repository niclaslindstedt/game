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
deterministic by construction: `createGame(seed)` builds the level from a
seeded RNG, and `step(state, input, dtMs)` advances it with a fixed
timestep — the same seed and input sequence always replays the same run,
which is what makes gameplay unit-testable in plain Node and bugs
reproducible.

Content is data, simulation is code: the game's levels, monsters, and
equipment live in **catalogs** under `src/game/defs/`, and the engine only
ever references them by id. Shipping level 1 (earth) or the hundredth
weapon means adding catalog entries, not touching the simulation.

- **`src/game/config.ts`** — the GLOBAL balance knobs (player, jumping, XP
  curve, stat effects, loot rules), nothing hardcoded in logic.
- **`src/game/defs/levels.ts`** — the level registry: geometry, per-level
  gravity (the moon's low g is why jumps soar), biome, the story intro text,
  landmark props, banded enemy spawns, the objective (`killBoss` /
  `clearAll`), decor, and the loot table (pools + tier chances).
- **`src/game/defs/enemies.ts`** — the monster catalog (stats, AI radii,
  roles; bosses pin guaranteed drops). Level 2 ships wisp → moon ghost →
  wraith plus ARMSTRONG, the giant astronaut ghost guarding the flag.
- **`src/game/defs/equipment.ts`** — weapons (melee/ranged/magic classes),
  gear, the four-tier quality ladder (regular/magic/epic/legendary — later
  levels unlock the upper tiers), and the affix pools magic+ items roll.
- **`src/game/types.ts`** — state shapes plus the `GameEvent` union: events
  are the only channel from simulation to presentation (sound, flashes);
  the engine never knows a renderer or speaker exists.
- **`src/game/create.ts`** — seeded run setup from a level def: difficulty
  bands scale with distance from the player spawn toward the objective.
- **`src/game/step.ts`** — the per-tick pipeline, in documented order:
  player steering + jump physics → weapon auto-attack → projectiles →
  enemies (aggro/guard AI, contact damage) → item pickups → objective →
  win/lose. The character fights autonomously; the player steers
  (hold), jumps (tap/Space), spends level-up stat points, and manages
  the inventory.
- **`src/game/items.ts`** — equipment instances and the player-driven
  mutations the UI calls into: loot rolls, `equipFromInventory` /
  `unequipToInventory` / `moveInventoryItem`, `allocateStat`, and the
  derived stats (max hp, weapon damage, crit chance).
- **`src/lib/`** — generic, game-agnostic helpers (`vec.ts`, `rng.ts`),
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

- **`website/src/App.tsx`** — the title screen and the switch into the game.
- **`website/src/game/`** — the presentation of the engine:
  `GameScreen.tsx` (canvas mount, fixed-timestep loop, HUD with hp/XP bars,
  jump input, end-of-run splash), `IntroOverlay.tsx` (the level's story
  text box), `LevelUpOverlay.tsx` (the stat chooser shown while the engine
  pauses in `levelup`), `InventoryPanel.tsx` (the Diablo-style bag:
  drag-to-equip slots, tier-colored borders, item card, character sheet),
  `render.ts` (camera + sprite drawing onto a world-unit canvas upscaled
  with `image-rendering: pixelated`), `tiers.ts` (tier name colors),
  `sfx.ts` (engine events → synthesized sounds), `assets.ts` (loads the
  generated sprites + pixel font), and `assets/` (generated PNGs + font
  atlas — never hand-edited).
- **`website/src/lib/`** — generic game UI plumbing imported via the
  `@ui/lib/*` alias and earmarked for oss-framework extraction:
  `game-loop.ts` (fixed-timestep rAF loop), `pointer.ts` (hold-to-steer +
  tap detection), `synth.ts` (WebAudio SFX synth — the game ships zero
  audio files), `pixel-font.ts` + `PixelText.tsx` (runtime renderer for
  the generated bitmap font), `load-images.ts`.
- **`website/scripts/asset-tools/` + `sprite-data.mjs` +
  `generate-assets.mjs`** — the pixel-asset pipeline (`make assets`):
  sprites are character grids with ramp-derived palettes, rendered at build
  time to committed PNGs plus gitignored previews (contact sheet, film
  strips, palette sheet, font specimen). See the `pixel-assets` skill.
- **`website/scripts/playtest.mjs`** — the autoplay bot that drives real
  runs headlessly through the `?debug` state hook. See the `playtest`
  skill.
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

Releases: a maintainer dispatches `version-bump.yml`, which computes the
next semver from conventional commits and pushes a `v*` tag using
`RELEASE_TOKEN`. That tag push fires `release.yml`, which regenerates
`CHANGELOG.md`, rewrites every version string
(`scripts/update-versions.sh`), commits to `main`, force-moves the tag to
the release commit, runs the build + tests, publishes a GitHub Release, and
chains into `pages.yml` so the new tag is live at the site root immediately.

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
  WebAudio oscillator/noise parameters in `website/src/game/sfx.ts`,
  keeping the offline PWA payload tiny.
