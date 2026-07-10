# Configuration

## In-game settings

The main menu's **SETTINGS** screen holds the player-facing configuration,
persisted on-device in `localStorage` under `<storagePrefix>:settings`
(`website/src/game/settings.ts`). The `<storagePrefix>` is the `storagePrefix`
field of the identity config (`game.config.json`) — this game ships it as its
own namespace, and a sequel changes it there once:

| Setting                      | Values                                                      | Default                                                                              |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Controls → Mouse             | follow cursor / hold to steer                               | follow cursor on fine pointers, hold on touch-first devices                          |
| Controls → Keys              | WASD move / mouse only                                      | WASD move on fine pointers, off on touch-first devices                               |
| Controls → Powerups (use)    | use on pickup / use manually (tap a slot, click, E, or 1-3) | manual everywhere                                                                    |
| Controls → Powerups (side)   | lower left / lower right                                    | lower left                                                                           |
| Music volume                 | 0–100% in quarter steps                                     | 80%                                                                                  |
| Sound FX volume              | 0–100% in quarter steps                                     | 100%                                                                                 |
| Display → XP on kill         | on / off                                                    | on (floating "+N XP" text on kills)                                                  |
| Developer → Debug mode       | on / off                                                    | off (inert flag; the row itself is hidden until unlocked)                            |
| Developer → Auto level stats | on / off                                                    | off (opt-in free per-level base-stat growth; the row is hidden until unlocked)       |
| Developer → Character gear   | on / off                                                    | off (opt-in worn armor + weapon on the field hero; the row is hidden until unlocked) |

A hidden **DEVELOPER** row unlocks at the bottom of SETTINGS after the title
screen's moon Easter egg is found — a long-press on the title moon detonates it
and latches `developerUnlocked` (persisted, so the row then survives launches).
The player opens SETTINGS themselves to find it; the detonation does nothing
else. The developer screen offers **SELECT LEVEL** (the warp picker — jump into
any mission regardless of unlock state, skipping the intro), a **DEBUG MODE**
toggle, and two feature flags. DEBUG MODE is a persisted flag with no wired-up
behavior yet, distinct from the `?debug` URL parameter below. Both feature
flags are **opt-in (off by default)**. **AUTO LEVEL STATS** turns the automatic
per-level base-stat growth on or off — on also brings the horde's compensating
hp scaling in lockstep (both derive from the same rule), and off leaves only
chosen points and gear to push the hero ahead of the curve. **CHARACTER GEAR**
shows or hides the worn armor and held weapon on the field hero sprite; the HUD
avatar and inventory portrait stay dressed either way.

Desktop keyboard controls (when **Keys** is set to WASD): WASD or the arrow
keys run, **Shift** walks, **Space** jumps, **1/2/3** fire the powerup dock
slots, **Q** opens the weapon switcher (then **1-4** equip a weapon), **E**
spends the oldest powerup, **I** toggles the bag, and **P** or **Escape**
pauses the run (and its music). On touch, tapping the on-screen clock / foe
counter in the HUD pauses too. The run also auto-pauses when the tab or app
loses focus; clicking the screen or pressing **P**/**Escape** again resumes.
During a cutscene, intro, or dialogue, **Space** or **Enter** turns the page
(the first press finishes the letter crawl, the next advances) and **Escape**
skips the whole scene.

Progress belongs to **characters** — named, persistent heroes
(`website/src/game/characters.ts`), stored under `<storagePrefix>:characters`
with the active one at `<storagePrefix>:active-character`. The app opens on the
title menu; **PLAY** opens the roster when no hero is active: pick a hero, create
one (naming it and choosing **HARDCORE** at creation — the choice belongs to the
character, not a global setting), or retire the fallen, then drop into the
difficulty ladder for the chosen hero. A character owns ONE evolving build (the
engine `Loadout` — level,
stats, gear, inventory, coins, abilities, companions) that carries whole into
every difficulty and level, so higher difficulties are met with the gear earned
on the lower ones. It also remembers which difficulties it has BEATEN and which
levels it has CLEARED — pure progress bookmarks that gate two things: the
difficulty ladder unlocks in order (a rung opens once the one before it is
beaten; locked rungs show greyed out), and a difficulty runs as a linear
campaign until it is beaten, after which its level picker opens for free replays
(the grind-for-gear endgame). **HARDCORE is permadeath**: a hardcore hero that
dies is retired for good (kept in the roster as fallen, never played again), and
its death splash offers only MENU. A softcore death costs no progress — the
run's build is banked on death just as on victory, so the hero keeps the levels,
stats and items earned it and can RETRY the level (from that kept build) or exit
to MENU; only the level-clear bookmarks wait for an actual victory. Every
finished run is banked per difficulty under `<storagePrefix>:highscores` with
its survival time, kills, player level reached, and a full end-of-run session
snapshot (`website/src/game/highscores.ts`); the end-of-run screen shows that
difficulty's best survival time, and the menu's HIGH SCORES board ranks the
runs four ways (survival time, kills-per-minute, mobs killed, level reached) and
opens any banked run into a full-session detail card. Cutscenes
always play at the start of a run (dismiss with the top-right SKIP button).
An in-progress run is parked to storage too: exiting to the menu from the
pause screen freezes the whole run under `<storagePrefix>:current-run`
(`website/src/game/saved-run.ts`), so the menu's **CONTINUE** button survives a
page reload — the one an app update forces included — instead of vanishing with
the wiped memory. The snapshot is dropped once the run is resumed, abandoned
(victory/defeat MENU), or replaced by a fresh game, and a snapshot written by
an incompatible older build is discarded rather than resumed. Clearing site
data resets all of it; the `?cutscene=<id>` workbench replays any scene
regardless, and `?level=<id>` reaches any level regardless of unlock state.

Everything else configurable concerns the build and the development
environment.

## Environment variables

| Variable     | Read by                                        | Effect                                                                                                                                                                                                                                                  |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_PAT` | `.npmrc` (every npm command), all CI workflows | Auth token for GitHub Packages — required to install `@niclaslindstedt/oss-framework`. Needs the `read:packages` scope. CI prefers the `GITHUB_PAT` secret and falls back to the workflow token.                                                        |
| `VITE_BASE`  | `website/vite.config.ts`                       | The deploy-slot base path: `/` (production), `/preview/` (staging), `/branch/` (branch slot). Defaults to `/` for local dev and the CI quality gates. Drives asset URLs, the service-worker scope, the per-slot robots meta, and the precache cache id. |
| `GITHUB_SHA` | `website/vite.config.ts`                       | Stamps the build label shown in the update toast and title screen; falls back to `git rev-parse` / a timestamp locally.                                                                                                                                 |

## URL parameters

| Parameter         | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?debug`          | Enables debug-level console output (`src/output.ts`, OSS_SPEC §19.3). All levels are always captured in the in-memory buffer regardless; the flag only controls console verbosity. Additionally exposes the live engine state as `window.__game` (`website/src/game/GameScreen.tsx`) so DevTools and the playtest harness (`website/scripts/playtest.mjs`) can inspect real runs.                                                                                                                                                                                                                                                                                                   |
| `?bot=<strategy>` | Hands the run to the engine autopilot (`src/game/bot.ts`): the bot skips any prelude cutscene, dismisses the intro, steers, jumps, and spends level-up points itself. Strategies: `idle`, `rush`, `kite`, `boss`, `survivor`. Unknown names are ignored (normal input applies). Used by the playtest harness (usually combined with `?debug`) and the seed for an AI-controlled second player.                                                                                                                                                                                                                                                                                      |
| `?level=<id>`     | Dev override that starts runs on a specific catalog level (`src/game/defs/levels/` — this game's ids: `spacez_hq`, `moon`, `mars`, `the_rift`) instead of the level picked in the menu's level-select screen. It bypasses the campaign unlock gate, so it reaches any level regardless of saved progress. A mid-campaign jump with no banked loadout starts with the engine's derived stand-in (`deriveArrivalLoadout`) — roughly what clearing the earlier levels would have banked — so testing later levels stays realistic. Unknown ids are ignored (the menu selection applies). Normal play uses the level-select screen; `?level=` is for testing a specific level directly. |
| `?seed=<n>`       | Pins the run's layout seed (a positive integer) so retries and bug reports lay the level out identically. Absent or invalid, the seed derives from the clock. See the debug-game skill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `?cutscene=<id>`  | Opens the cutscene workbench instead of the game: plays one scene from the catalog (`src/game/defs/cutscenes.ts`) with TAP/SKIP/REPLAY controls, for iterating on scene authoring. With `?debug`, exposes the live scene as `window.__cutscene` for the preview harness (`website/scripts/cutscene-preview.mjs`).                                                                                                                                                                                                                                                                                                                                                                   |

## Gameplay tuning

All balance knobs — level size, player/enemy speed and hp, weapon cooldown
and range, item heals, spawn counts — live in one file:
[`src/game/config.ts`](../src/game/config.ts). They are compile-time
constants by design; tuning happens by editing that file and playtesting
(see the `playtest` skill). The difficulty ladder's multipliers live in
[`src/game/defs/difficulties.ts`](../src/game/defs/difficulties.ts) —
MEDIUM is the exact 1.0 baseline the levels are tuned at.

**Mercy drops** ease the gentle rungs without making them un-losable: on EASY
and MEDIUM a packed screen (20+ mobs) starts dropping screen-nuke bombs, low
health or worn-down gear makes medkits, armor pieces, and repair kits rain
harder, and a hero stranded with a bone-dry sprint pool (stamina at exactly 0,
not merely low) is thrown ENERGY DRINKS — a per-kill chance that ramps with the
time spent winded up to 15% on EASY / 10% on MEDIUM (the drink resets stamina to
full on touch). Each signal keeps at most ONE rope on the ground: while the
rescue it answers with (a medkit, repair kit, drink, screen-nuke, or armor
piece) already lies un-collected within `MERCY.rescueRadius` of the hero, that
signal holds fire — picking it up (or leaving it behind out of view) re-arms
the rope. The ramp _shapes_ (where each signal starts and maxes) are the
`MERCY` block in `config.ts`; each rung's _strength_ is its `mercy` object in
`difficulties.ts` (`MercyTuning`), zeroed on HARD and up so death stays on the
table there.

## Repository pins

| File                          | Pins                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `.nvmrc`                      | Node 24 — both local (`nvm use`) and every CI workflow (`node-version-file`) resolve this single file (§10.5). |
| `package.json` `engines.node` | `>=24`, so npm warns on a stale local Node.                                                                    |

## Release configuration

| Secret       | Used by                                   | Purpose                                                                   |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------- |
| `GITHUB_PAT` | ci/pages/release/seo/lighthouse workflows | GitHub Packages reads (optional — workflows fall back to `github.token`). |

No `RELEASE_TOKEN` is needed: `release.yml` is dispatched manually and
chains into `pages.yml` via `workflow_call` inside the same run, so the
default `GITHUB_TOKEN` suffices end to end.
