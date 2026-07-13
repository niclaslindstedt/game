# Configuration

## In-game settings

The main menu's **SETTINGS** screen holds the player-facing configuration,
persisted on-device in `localStorage` under `<storagePrefix>:settings`
(`website/src/game/settings.ts`). The `<storagePrefix>` is the `storagePrefix`
field of the identity config (`game.config.json`) — this game ships it as its
own namespace, and a sequel changes it there once:

| Setting                      | Values                                                       | Default                                                                                                               |
| ---------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Controls → Mouse             | follow cursor / hold to steer                                | follow cursor on fine pointers, hold on touch-first devices                                                           |
| Controls → Keys              | WASD move / mouse only                                       | WASD move on fine pointers, off on touch-first devices                                                                |
| Controls → Powerups (use)    | use on pickup / use manually (tap a slot, click, E, or 1-3)  | manual everywhere                                                                                                     |
| Controls → Gear (auto-equip) | equip on pickup / keep in bag                                | keep in bag (finds bank to the bag and glow when they beat what's worn; on wears a stronger find on the spot)         |
| Controls → Powerups (side)   | lower left / lower right                                     | lower left                                                                                                            |
| Controls → Key bindings      | rebind every desktop key/mouse control (Quake-style submenu) | shipped WASD scheme (Shift walk, Space jump, E/Q/I/M/P, C/X dock; RESET TO DEFAULTS restores it)                      |
| Music volume                 | 0–100% drag slider                                           | 80%                                                                                                                   |
| Sound FX volume              | 0–100% drag slider                                           | 100%                                                                                                                  |
| Display → XP on kill         | on / off                                                     | on (floating "+N XP" text on kills)                                                                                   |
| Developer → Debug mode       | on / off                                                     | off (shows the in-run FPS meter; row hidden until unlocked)                                                           |
| Developer → Auto level stats | on / off                                                     | off (opt-in free per-level base-stat growth; the row is hidden until unlocked)                                        |
| Developer → Character gear   | on / off                                                     | off (opt-in worn armor + weapon on the field hero; the row is hidden until unlocked)                                  |
| Developer → Weapon swing     | on / off                                                     | off (experimental — animate the held weapon on each attack; needs Character weapon; the row is hidden until unlocked) |
| Developer → Balance          | ten multiplier sliders, 0×–100× (exponential)                | 1× each (the shipped tuning; a RESET ALL row restores it)                                                             |

A hidden **DEVELOPER** row unlocks at the bottom of SETTINGS after the title
screen's moon Easter egg is found — a long-press on the title moon detonates it
and latches `developerUnlocked` (persisted, so the row then survives launches).
The player opens SETTINGS themselves to find it; the detonation does nothing
else. The developer screen offers **SELECT LEVEL** (the warp picker — pick any
difficulty and mission regardless of unlock state, skipping the intro), **VIEW
ARSENAL** (a
browsable gallery of every hand-authored unique/legendary item, ordered by item
level and drawn with the same icon + item card the in-game inventory uses —
steer the scrollable list with the pointer or the arrow keys, ESC backs out), a
**DEBUG MODE** toggle, and three feature flags. DEBUG MODE shows a small FPS
meter at the bottom of the screen during runs (the frame rate the render loop
actually achieves — the first probe for performance regressions); the `?debug`
URL parameter below forces the same meter on and additionally controls console
verbosity. The feature
flags are **opt-in (off by default)**. **AUTO LEVEL STATS** turns the automatic
per-level base-stat growth on or off — on also brings the horde's compensating
hp scaling in lockstep (both derive from the same rule), and off leaves only
chosen points and gear to push the hero ahead of the curve. **CHARACTER WEAPON**
shows or hides the held weapon on the field hero sprite (the worn armor always
shows); the HUD avatar and inventory portrait stay armed either way. **WEAPON
SWING** (experimental) animates that held weapon on each attack — a blade whips
through its slash, a gun recoils, a wand thrusts on the cast — in step with the
swing/muzzle effect; it needs CHARACTER WEAPON on to have anything to swing.

The developer screen also holds a **BALANCE** subpage: ten runtime multipliers
over the engine's shipped tuning (`src/game/tuning.ts`, applied via
`setBalanceTuning`) for probing the game's balance without rebuilding — XP
GAIN (leveling pace), HERO DAMAGE, MOB HP, MOB DAMAGE, HORDE SIZE (the wave
spawner's floor and cap), DROP RATE, GEAR SHARE (the equipment slice of the
drop ladder), GEAR QUALITY (magic/rare tier odds), UNIQUE DROPS, and MENACE
GAIN. Each row is a slider — drag it, tap the track, or steer it with the
left/right arrow keys — spanning **0× (system off) to 100×** the shipped
tuning, where **1× is baseline**. The track is exponential: its four quarters
cover 0→1, 1→2, 2→10, then 10→100, so the useful low end gets most of the
travel. Values persist with the settings, and a **RESET ALL** row restores the
shipped 1× across the board.

Desktop keyboard controls (when **Keys** is set to WASD): the shipped scheme is
**WASD** steer, **Shift** walks, **Space** jumps, **Q** opens the weapon
switcher (then **1-4** equip a weapon), **E** spends the oldest powerup, **C**
uses a medkit and **X** drinks a stamina potion from the consumable dock, **I**
toggles the bag, **M** the level map, and **P** pauses. **1/2/3** also fire the
powerup dock slots (a fixed contextual range).
Every one of those controls is **rebindable in Controls → Key Bindings** — a
Quake-style list (action label left, bound key far right): choose a row, then
press the keyboard key or mouse button to bind it (a rebind steals the key off
whatever action held it; **Escape** cancels and is never bindable). Bindings are
stored by physical key code, so WASD stays put under any keyboard layout, and
persist with the settings; **Reset to Defaults** restores the shipped scheme.
**Escape** pauses/resumes the run and closes overlays no matter what else is
bound. On touch, tapping the on-screen clock / foe counter in the HUD pauses
too. The run also auto-pauses when the tab or app loses focus; clicking the
screen or pressing the pause key / **Escape** again resumes. During a cutscene,
intro, or dialogue, **Space** or **Enter** turns the page (the first press
finishes the letter crawl, the next advances) and **Escape** skips the whole
scene.

Progress belongs to **characters** — named, persistent heroes
(`website/src/game/characters.ts`), stored under `<storagePrefix>:characters`
with the active one at `<storagePrefix>:active-character`. The app opens on the
title menu; **PLAY** opens a submenu with **NEW GAME** and **LOAD GAME**. NEW
GAME opens the roster straight on the create form (name the hero and choose
**HARDCORE** at creation — the choice belongs to the character, not a global
setting); LOAD GAME opens the hero list to pick a saved hero (or retire the
fallen). A freshly created hero, or one who has beaten their current difficulty,
drops into the difficulty ladder to pick a lane or step up a rung; a hero
mid-campaign skips the ladder and resumes at the **beginning of their current
level** on the difficulty they are already on (no difficulty picker —
`resumeTargetFor`). A character owns ONE evolving build (the
engine `Loadout` — level,
stats, gear, inventory, coins, abilities, companions) that carries whole into
every difficulty and level, so higher difficulties are met with the gear earned
on the lower ones. It also remembers which difficulties it has BEATEN and which
levels it has CLEARED — pure progress bookmarks that gate two things: the
difficulty ladder (the three parallel starting lanes — easy/medium/hard — are
all open from the start; NIGHTMARE unlocks once any one is beaten, JESUS once
NIGHTMARE is; locked rungs show greyed out), and a difficulty runs as a linear
campaign until it is beaten, after which its level picker opens for free replays
(the grind-for-gear endgame). **HARDCORE is permadeath**: a hardcore hero that
dies is retired for good (kept in the roster as fallen, never played again), and
its death splash offers only MENU. A softcore death costs no progress — the
run's build is banked on death just as on victory, so the hero keeps the levels,
stats and items earned it and can RETRY the level (from that kept build) or exit
to MENU; only the level-clear bookmarks wait for an actual victory. High scores
are a **hardcore-only, whole-campaign** affair: a hardcore hero's foes felled,
survival time and highest menace stage are summed across every map of a
difficulty's campaign and banked per difficulty under
`<storagePrefix>:campaign-scores` (`website/src/game/highscores.ts`) when the
campaign is beaten (**SURVIVED**) or the hero falls partway through it
(**FELL**, its totals including the fatal run). Softcore heroes never score.
Survival time is the **combat clock** (`stats.combatMs`), which only ticks while
a fight is live — a foe on the field, or within a two-second tail of the last
kill — so a cleared field can't be milked for time (the HUD run timer shows this
clock, not the wall clock). The menu's HIGH SCORES board ranks the campaigns
four ways (mobs killed, survival time, kills-per-minute, peak menace) and opens
any campaign into a full breakdown. Cutscenes
always play at the start of a run (dismiss with the top-right SKIP button).
An in-progress run is parked to storage too: exiting to the menu from the
pause screen freezes the whole run under `<storagePrefix>:current-run`
(`website/src/game/saved-run.ts`), so the menu's **RESUME** button survives a
page reload — the one an app update forces included — instead of vanishing with
the wiped memory. The snapshot is dropped once the run is resumed, abandoned
(victory/defeat MENU), or replaced by a fresh game, and a snapshot written by
an incompatible older build is discarded rather than resumed. Clearing site
data resets all of it; the `?cutscene=<id>` workbench replays any scene
regardless, and `?level=<id>` reaches any level regardless of unlock state.

A hero can be carried between devices from **SETTINGS → DATA**: **EXPORT
CHARACTER** opens a picker over the whole roster where you tick one or many
heroes (not just the current game) and download each as a small signed `.zip`
(a `character.json` save plus a `manifest.json`), and **IMPORT CHARACTER** opens
a file picker to load one back into the roster as a fresh copy
(`website/src/game/character-transfer.ts`). The archive is signed with an
HMAC-SHA256 key (`VITE_CHARACTER_SIGNING_KEY`, below), so a hand-edited save
fails to re-import — an anti-cheat speed bump, not a wall, since the key ships
in the bundle.

Everything else configurable concerns the build and the development
environment.

## Environment variables

| Variable                     | Read by                                        | Effect                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_PAT`                 | `.npmrc` (every npm command), all CI workflows | Auth token for GitHub Packages — required to install `@niclaslindstedt/oss-framework`. Needs the `read:packages` scope. CI prefers the `GITHUB_PAT` secret and falls back to the workflow token.                                                                                                                                                                       |
| `VITE_BASE`                  | `website/vite.config.ts`                       | The deploy-slot base path: `/` (production), `/preview/` (staging), `/branch/` (branch slot). Defaults to `/` for local dev and the CI quality gates. Drives asset URLs, the service-worker scope, the per-slot robots meta, and the precache cache id.                                                                                                                |
| `GITHUB_SHA`                 | `website/vite.config.ts`                       | Stamps the build label shown in the update toast and title screen; falls back to `git rev-parse` / a timestamp locally.                                                                                                                                                                                                                                                |
| `VITE_CHARACTER_SIGNING_KEY` | `website/src/game/character-transfer.ts`       | HMAC-SHA256 key that signs exported character archives so a hand-edited save fails to re-import (an anti-cheat speed bump, not a wall — the key ships in the bundle). Optional: `.github/workflows/pages.yml` maps the `CHARACTER_SIGNING_KEY` deploy secret onto it; an empty/unset secret falls back to the committed default key. Set the secret to rotate the key. |

## URL parameters

| Parameter          | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?debug`           | Enables debug-level console output (`src/output.ts`, OSS_SPEC §19.3). All levels are always captured in the in-memory buffer regardless; the flag only controls console verbosity. Additionally exposes the live engine state as `window.__game`, the scenario hook as `window.__scenario(spec)`, and two animation-tuning hooks — `window.__swing({kind, weaponClass, t})` pins the field hero's held weapon at a fixed fraction `t` (0..1) of its WEAPON SWING arc (`null` clears it), and `window.__timeScale(f)` scales the whole simulation clock so a fast animation runs at `f`× speed (`1` restores real time) — all in `website/src/game/GameScreen.tsx`, so DevTools, the playtest harness (`website/scripts/playtest.mjs`), and the weapon-swing preview (`website/scripts/weapon-swing.mjs`) can inspect and re-shape real runs. It also forces the in-run FPS meter on (the DEVELOPER menu's DEBUG MODE setting shows the same meter).                                                                                                                                                                                                                                                                                                                  |
| `?bot=<strategy>`  | Hands the run to the engine autopilot (`src/game/bot.ts`): the bot skips any prelude cutscene, dismisses the intro, steers, jumps, and spends level-up points itself. Strategies: `idle`, `rush`, `kite`, `boss`, `survivor`. Unknown names are ignored (normal input applies). Used by the playtest harness (usually combined with `?debug`) and the seed for an AI-controlled second player.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `?level=<id>`      | Dev override that starts runs on a specific catalog level (`src/game/defs/levels/` — this game's ids: `spacez_hq`, `moon`, `mars`, `the_rift`, `eastworld` — plus the secret `the_bunker`, normally reached only through its rift gate) instead of the level picked in the menu's level-select screen. It bypasses the campaign unlock gate, so it reaches any level regardless of saved progress. A mid-campaign jump with no banked loadout starts with the engine's derived stand-in (`deriveArrivalLoadout`) — roughly what clearing the earlier levels would have banked — so testing later levels stays realistic. Unknown ids are ignored (the menu selection applies). Normal play uses the level-select screen; `?level=` is for testing a specific level directly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `?seed=<n>`        | Pins the run's layout seed (a positive integer) so retries and bug reports lay the level out identically. Absent or invalid, the seed derives from the clock. See the debug-game skill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `?scenario=<json>` | Dev/test override that mutates a fresh run into an exact situation (`applyScenario`, `src/game/scenario.ts` — see the `test-scenario` skill): teleport the hero (`"place":"boss"`, `"place":"merchant"`, or `{x,y}`), set hp/stamina/level/stats/coins, swap or strip the weapon and worn gear, bank powerups, stock the consumable dock (`medkits` per-quality counts, `staminaPotions`), clear the field, silence the wave spawner, spawn rings of extra mobs around the player at a minimum distance (optionally pre-wounded via `hpFrac`, to pose battle-damage sprite stages), lay ground items out around the hero (`drops`: loose pickups, equipment/unique/ability/story ids), and `freeze` the world's actors for a stable screenshot (enemies/merchant/companions hold still; the hero stays playable — pair with `disarmed`). The value is URL-encoded JSON, e.g. `?scenario={"place":"boss","hp":2,"weapon":null,"spawns":[{"enemy":"ghost","count":60,"minDistance":60}]}`. Applies once at run start (not to resumed or checkpointed runs); by default it also skips the opening. Invalid JSON is ignored with a warning. Combine with `?level=`, `?seed=` (the spawn ring draws on the run's seeded rng, so repros are exact), `?bot=`, and `?debug`. |
| `?cutscene=<id>`   | Opens the cutscene workbench instead of the game: plays one scene from the catalog (`src/game/defs/cutscenes.ts`) with TAP/SKIP/REPLAY controls, for iterating on scene authoring. With `?debug`, exposes the live scene as `window.__cutscene` for the preview harness (`website/scripts/cutscene-preview.mjs`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Gameplay tuning

All balance knobs — level size, player/enemy speed and hp, weapon cooldown
and range, item heals, spawn counts — live in one file:
[`src/game/config.ts`](../src/game/config.ts). They are compile-time
constants by design; tuning happens by editing that file and playtesting
(see the `playtest` skill). The difficulty ladder's multipliers live in
[`src/game/defs/difficulties.ts`](../src/game/defs/difficulties.ts) —
MEDIUM is the exact 1.0 baseline the levels are tuned at.

**Mercy drops** ease the fight without making it un-losable: a packed screen
(20+ mobs) starts dropping screen-nuke bombs, low
health or worn-down gear makes medkits, armor pieces, and repair kits rain
harder, and a hero stranded with a bone-dry sprint pool (stamina at exactly 0,
not merely low) is thrown STAMINA POTIONS — a per-kill chance that ramps with the
time spent winded up to 15% on EASY, tapering down the ladder to zero on
JESUS. Medkits and stamina potions no longer fire on contact: touching one
banks it into the **consumable dock** (a medkit slot and a stamina slot above
the powerups), stacked 5 deep — medkits per quality — and the hero spends them
on his own call (tap the slot, or **C** / **X** on desktop), medkits
biggest-heal-first, never wasting one at a full bar. Each signal keeps at most ONE rope on the ground: while the
rescue it answers with (a medkit, repair kit, drink, screen-nuke, or armor
piece) already lies un-collected within `MERCY.rescueRadius` of the hero, that
signal holds fire — picking it up (or leaving it behind out of view) re-arms
the rope. The ramp _shapes_ (where each signal starts and maxes) are the
`MERCY` block in `config.ts`; each rung's _strength_ is its `mercy` object in
`difficulties.ts` (`MercyTuning`), tapering geometrically down the ladder
(~×0.4 per rung: EASY full, MEDIUM lighter, HARD a whisper, NIGHTMARE a
ghost, JESUS absolute zero — death is always on the table up there). Every mercy rope makes a dramatic entrance: rather than blinking
onto the ground, a guardian ANGEL flies it in from above, cradles it, and
releases it over the spot the mob died — the whole descent inside
`MERCY.angelDeliverMs` (under two seconds), during which the gift is airborne
and can't be grabbed (the magnet leaves it alone too).

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
