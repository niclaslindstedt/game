# Configuration

## In-game settings

The main menu's **SETTINGS** screen holds the player-facing configuration,
persisted on-device in `localStorage` under `<storagePrefix>:settings`
(`pwa/src/game/settings.ts`). The `<storagePrefix>` is the `storagePrefix`
field of the identity config (`game.config.json`) — this game ships it as its
own namespace, and a sequel changes it there once:

| Setting                      | Values                                                       | Default                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controls → Mouse             | follow cursor / aim & shoot (desktop-only row)               | follow cursor (aim & shoot walks with WASD, aims with the pointer, and fires on left click; touch always steers by holding and dragging and never sees the row) |
| Controls → Auto-fire         | on / off (desktop-only row, shown in aim & shoot mode)       | on (the character fires on its own; off holds every blow until the left mouse button is pressed)                                                                |
| Controls → Keys              | WASD move / mouse only (desktop-only row)                    | WASD move on fine pointers (in aim & shoot the row is greyed out and locked at WASD MOVE — that mode always walks by keyboard; hidden on touch)                 |
| Controls → Powerups (use)    | use on pickup / use manually (tap a slot, click, E, or 1-3)  | manual everywhere                                                                                                                                               |
| Controls → Gear (auto-equip) | equip on pickup / keep in bag                                | keep in bag (finds bank to the bag and glow when they beat what's worn; on wears a stronger find on the spot)                                                   |
| Controls → Powerups (side)   | lower left / lower right                                     | lower left                                                                                                                                                      |
| Controls → Key bindings      | rebind every desktop key/mouse control (Quake-style submenu) | shipped WASD scheme (Shift walk, Space jump, E/Q/I/M/P, C/X dock; RESET TO DEFAULTS restores it)                                                                |
| Sound → Mute                 | on / off                                                     | off (silences all audio while the MUSIC and SOUND FX sliders keep their levels, so unmuting restores the exact mix)                                             |
| Music volume                 | 0–100% drag slider                                           | 80%                                                                                                                                                             |
| Sound FX volume              | 0–100% drag slider                                           | 100%                                                                                                                                                            |
| Display → XP on kill         | on / off                                                     | on (floating "+N XP" text on kills)                                                                                                                             |
| Developer → Debug mode       | on / off                                                     | off (shows the in-run FPS meter; row hidden until unlocked)                                                                                                     |
| Developer → Auto level stats | on / off                                                     | off (opt-in free per-level base-stat growth; the row is hidden until unlocked)                                                                                  |
| Developer → Force store      | on / off                                                     | off (surfaces the coin store in any build with packs granted FREE — no payment provider outside production store builds; row hidden until unlocked)             |
| Developer → Bot view speed   | 1× / 2× / 4× / 8× fast-forward (the GAME SPEED step)         | 1× (real time; the step after difficulty + level in BOT VIEW — runs more game-loop steps per frame so the autopilot blitzes a level; row hidden until unlocked) |
| Developer → Balance          | ten multiplier sliders, 0×–100× (exponential)                | 1× each (the shipped tuning; a RESET ALL row restores it)                                                                                                       |
| Developer → Seed characters  | mint melee/ranged/magic heroes at LV 34/56/70/99             | none (a manual action — each press banks specimens into the roster; the row is hidden until unlocked)                                                           |

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
**DEBUG MODE** toggle, and a feature flag. DEBUG MODE shows a small FPS
meter at the bottom of the screen during runs (the frame rate the render loop
actually achieves — the first probe for performance regressions); the `?debug`
URL parameter below forces the same meter on and additionally controls console
verbosity. The feature
flag is **opt-in (off by default)**. **AUTO LEVEL STATS** turns the automatic
per-level base-stat growth on or off — on also brings the horde's compensating
hp scaling in lockstep (both derive from the same rule), and off leaves only
chosen points and gear to push the hero ahead of the curve. (The field hero now
always shows and swings his held weapon — a blade whips through its slash, a gun
recoils, a wand thrusts on the cast — so these are no longer toggles.)

The developer screen also holds a **BALANCE** subpage: a set of runtime
multipliers over the engine's shipped tuning (`src/game/tuning.ts`, applied via
`setBalanceTuning`) for probing the game's balance without rebuilding — XP
GAIN (leveling pace), HERO DAMAGE, KNOCKBACK (how far the rare knockback
weapons shove a struck mob back), MOB HP, MOB DAMAGE, HORDE SIZE (the wave
spawner's floor and cap), DROP RATE, GEAR SHARE (the equipment slice of the
drop ladder), REPAIR DROPS (the repair-kit slice), GEAR QUALITY (magic/rare
tier odds), UNIQUE DROPS, MENACE GAIN, and CLEAR GATE (how far you must
out-clear the horde's spawn rate before the menace meter heats). Each row is a slider — drag it, tap the track, or steer it with the
left/right arrow keys — spanning **0× (system off) to 100×** the shipped
tuning, where **1× is baseline**. The track is exponential: its four quarters
cover 0→1, 1→2, 2→10, then 10→100, so the useful low end gets most of the
travel. Values persist with the settings, and a **RESET ALL** row restores the
shipped 1× across the board.

The developer screen also holds a **SEED CHARACTERS** subpage — a shortcut that
mints ready-to-play heroes straight into the roster so a developer can jump into
late-game content without grinding a build out. It offers **SEED ALL** (the
whole matrix) plus one row per power tier — **NIGHTMARE (LV 34)**, **JESUS
(LV 56)**, **POST-JESUS (LV 70)**, and **ENDGAME (LV 99)** — each of which banks
three softcore specimens: a **melee**, a **ranged**, and a **magic** hero built
at that level. Each seed carries a lane-optimized stat spread (melee → STRENGTH,
ranged → DEXTERITY, magic → INTELLIGENCE), level-appropriate rerolled gear whose
armor material follows the lane (heavy STR plate/mail, DEX leather, INT cloth), a
class-correct weapon, a stock of consumables, and — for casters — a filled spell
bar. A seed is stamped as having beaten every difficulty up to its tier, so its
level picker is open; re-seeding a tier refreshes its specimens rather than
piling up duplicates. The heroes appear under **PLAY → LOAD GAME**.

Desktop keyboard controls (when **Keys** is set to WASD): the shipped scheme is
**WASD** steer, **Shift** walks, **Space** jumps, **Q** opens the weapon
switcher (then **1-4** equip a weapon), **E** spends the oldest powerup, **C**
uses a medkit, **X** drinks a stamina potion, **Z** drinks a blue-gatorade mana
potion, and **V** spends a repair kit from the consumable dock, **F/G/H/B** cast
the four spell-bar slots, **I** toggles the bag, **M** the level map, and **P**
pauses. **1/2/3** also fire the powerup dock slots (a fixed contextual range).
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
(`pwa/src/game/characters.ts`), stored under `<storagePrefix>:characters`
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
`<storagePrefix>:campaign-scores` (`pwa/src/game/highscores.ts`) when the
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
(`pwa/src/game/saved-run.ts`), so the menu's **RESUME** button survives a
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
(`pwa/src/game/character-transfer.ts`). The archive is signed with an
HMAC-SHA256 key (`VITE_CHARACTER_SIGNING_KEY`, below), so a hand-edited save
fails to re-import — an anti-cheat speed bump, not a wall, since the key ships
in the bundle.

Everything else configurable concerns the build and the development
environment.

## Environment variables

| Variable                     | Read by                                        | Effect                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_PAT`                 | `.npmrc` (every npm command), all CI workflows | Auth token for GitHub Packages — required to install `@niclaslindstedt/oss-framework`. Needs the `read:packages` scope. CI prefers the `GITHUB_PAT` secret and falls back to the workflow token.                                                                                                                                                                       |
| `VITE_BASE`                  | `pwa/vite.config.ts`                           | The deploy-slot base path: `/` (production), `/preview/` (staging), `/branch/` (branch slot). Defaults to `/` for local dev and the CI quality gates. Drives asset URLs, the service-worker scope, the per-slot robots meta, and the precache cache id.                                                                                                                |
| `GITHUB_SHA`                 | `pwa/vite.config.ts`                           | Stamps the build label shown in the update toast and title screen; falls back to `git rev-parse` / a timestamp locally.                                                                                                                                                                                                                                                |
| `VITE_CHARACTER_SIGNING_KEY` | `pwa/src/game/character-transfer.ts`           | HMAC-SHA256 key that signs exported character archives so a hand-edited save fails to re-import (an anti-cheat speed bump, not a wall — the key ships in the bundle). Optional: `.github/workflows/pages.yml` maps the `CHARACTER_SIGNING_KEY` deploy secret onto it; an empty/unset secret falls back to the committed default key. Set the secret to rotate the key. |
| `EXPO_PUBLIC_STORE_PAYMENTS` | `native/src/storePurchases.ts` (build-time)    | Set to `required` to make the native coin store charge real money through StoreKit / Play Billing. Only the `production` EAS build profile sets it (`native/eas.json`); every other build — local dev, simulator, preview, and the store-signed `testflight` profile — price-tags packs `FREE` and grants them without a pay sheet. See `pwa/src/game/store.ts`.       |

## URL parameters

| Parameter             | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?debug`              | Enables debug-level console output (`src/output.ts`, OSS_SPEC §19.3). All levels are always captured in the in-memory buffer regardless; the flag only controls console verbosity. Additionally exposes the live engine state as `window.__game`, the scenario hook as `window.__scenario(spec)`, and two animation-tuning hooks — `window.__swing({kind, weaponClass, t})` pins the field hero's held weapon at a fixed fraction `t` (0..1) of its swing arc (`null` clears it; for a melee swing, an optional `arc`/`range` also draws the matching slash pinned at the same fraction), `window.__timeScale(f)` scales the whole simulation clock so a fast animation runs at `f`× speed (`1` restores real time), `window.__speed(f)` FAST-FORWARDS the whole run to `f`× real time (the opposite lever — it runs more fixed steps per frame rather than scaling the step size, so it stays deterministic; clamped to `[1, 16]`, `1` restores real time), and `window.__cast(spellId)` makes the hero unlock and afford the named spell, slots it, and fires it (for eyeballing the element-tinted cast FX — pair with `__scenario` for a target and `__timeScale` to slow it) — all in `pwa/src/game/GameScreen.tsx`, so DevTools, the playtest harness (`pwa/scripts/playtest.mjs`), the weapon-swing preview (`pwa/scripts/weapon-swing.mjs`), and the spell preview (`pwa/scripts/spell-preview.mjs`) can inspect and re-shape real runs. It also forces the in-run FPS meter on (the DEVELOPER menu's DEBUG MODE setting shows the same meter). |
| `?bot=<strategy>`     | Hands the run to the engine autopilot (`src/game/bot/index.ts`): the bot skips any prelude cutscene, dismisses the intro, steers, jumps, and spends level-up points itself. Strategies (the positioning posture): `aggro` (close and hold tight, tolerate a denser ring before bailing), `balanced`/`survivor` (the adaptive edge-hug), `flee` (hold far, disengage early), plus the simpler `idle`, `rush`, `kite`, `boss`. Unknown names are ignored (normal input applies). Used by the playtest harness (usually combined with `?debug`) and the seed for an AI-controlled second player.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `?speed=<n>`          | FAST-FORWARDS the run: the app simulates `n`× as many fixed game-loop steps per animation frame, so the whole run advances `n`× as fast (a `?bot=` playtest clears a level in a fraction of the wall-clock time). It runs MORE steps at the same step size — never bigger steps — so a fast-forwarded run is deterministic and identical to a real-time one, just quicker (contrast the slow-motion `?debug` `window.__timeScale`, which scales the step SIZE). Clamped to `[1, 16]`; `1` (or absent/invalid) is real time. Overrides the developer BOT VIEW fast-forward (DEVELOPER → BOT VIEW → GAME SPEED, a 1×/2×/4×/8× step) for the run. Mainly for the playtest harness (`pwa/scripts/playtest.mjs --speed <n>`); with `?debug`, `window.__speed(n)` retunes it live. Wired in `pwa/src/lib/game-loop.ts` (`speed`) and `pwa/src/game/GameScreen.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `?botProfile=<build>` | The bot's stat-distribution BUILD — how it spends level-up points (see `src/game/builds.ts`): `meta` (default; the level-band STRATEGY — melee early, magic mid–high, then melee again at the level cap where the pure-damage/armor-pierce artifacts drop), `melee`, `ranged`, `magic` (focus one weapon lane; each still banks INTELLIGENCE for the reach/AoE-cleave/crit that helps every class), `balanced` (spread reasonably across every stat, no pinned lane), or `auto` (the emergent lane from what it has invested in). Through the stat-aware auto-equip the build also decides the weapon and gear. Only meaningful alongside `?bot=`. Unknown names fall back to `meta`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `?level=<id>`         | Dev override that starts runs on a specific catalog level (`src/game/defs/levels/` — this game's ids: `spacez_hq`, `moon`, `mars`, `the_rift`, `eastworld` — plus the secret `the_bunker`, normally reached only through its rift gate) instead of the level picked in the menu's level-select screen. It bypasses the campaign unlock gate, so it reaches any level regardless of saved progress. A mid-campaign jump with no banked loadout starts with the engine's derived stand-in (`deriveArrivalLoadout`) — roughly what clearing the earlier levels would have banked — so testing later levels stays realistic. Unknown ids are ignored (the menu selection applies). Normal play uses the level-select screen; `?level=` is for testing a specific level directly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `?seed=<n>`           | Pins the run's layout seed (a positive integer) so retries and bug reports lay the level out identically. Absent or invalid, the seed derives from the clock. See the debug-game skill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `?scenario=<json>`    | Dev/test override that mutates a fresh run into an exact situation (`applyScenario`, `src/game/scenario.ts` — see the `test-scenario` skill): teleport the hero (`"place":"boss"`, `"place":"merchant"`, or `{x,y}`), set hp/stamina/level/stats/coins, swap or strip the weapon and worn gear, bank powerups, stock the consumable dock (`medkits` per-quality counts, `staminaPotions`), clear the field, silence the wave spawner, spawn rings of extra mobs around the player at a minimum distance (optionally pre-wounded via `hpFrac`, to pose battle-damage sprite stages), lay ground items out around the hero (`drops`: loose pickups, equipment/unique/ability/story ids), and `freeze` the world's actors for a stable screenshot (enemies/merchant/companions hold still; the hero stays playable — pair with `disarmed`). The value is URL-encoded JSON, e.g. `?scenario={"place":"boss","hp":2,"weapon":null,"spawns":[{"enemy":"ghost","count":60,"minDistance":60}]}`. Applies once at run start (not to resumed or checkpointed runs); by default it also skips the opening. Invalid JSON is ignored with a warning. Combine with `?level=`, `?seed=` (the spawn ring draws on the run's seeded rng, so repros are exact), `?bot=`, and `?debug`.                                                                                                                                                                                                                                                                                    |
| `?cutscene=<id>`      | Opens the cutscene workbench instead of the game: plays one scene from the catalog (`src/game/defs/cutscenes.ts`) with TAP/SKIP/REPLAY controls, for iterating on scene authoring. With `?debug`, exposes the live scene as `window.__cutscene` for the preview harness (`pwa/scripts/cutscene-preview.mjs`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `?skytest`            | Planetarium test view of the title screen: strips the menu chrome (logo, menu, footer) so the sun-lit, rotating planet globes of the orbital solar-system backdrop can be inspected on a bare sky. Pair with `window.__skyFreeze` (0..1 pins the master orbital loop) and `window.__skyState` / `window.__skyLabels` (`pwa/src/game/titleSky.ts`); the correctness harness `pwa/scripts/verify-sky.mjs` reads the same hooks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Gameplay tuning

All balance knobs — level size, player/enemy speed and hp, weapon cooldown
and range, item heals, spawn counts — live in one place:
[`src/game/config/`](../src/game/config/), one module per system behind an
`index.ts` barrel. They are compile-time constants by design; tuning happens
by editing those modules and playtesting
(see the `playtest` skill). The difficulty ladder's multipliers live in
[`src/game/defs/difficulties.ts`](../src/game/defs/difficulties.ts) —
MEDIUM is the exact 1.0 baseline the levels are tuned at.

**Mercy drops** ease the fight without making it un-losable: a packed screen
(20+ mobs) starts dropping screen-nuke bombs, low
health or worn-down gear makes medkits, armor pieces, and repair kits rain
harder, and a hero stranded with a bone-dry sprint pool (stamina at exactly 0,
not merely low) is thrown STAMINA POTIONS — a per-kill chance that ramps with the
time spent winded up to 15% on EASY, tapering down the ladder to zero on
JESUS. Medkits, stamina potions, and repair kits no longer fire on contact:
touching one banks it into the **consumable dock** (a medkit slot, a stamina
slot, and a repair slot above the powerups), stacked 5 deep — medkits per
quality — and the hero spends them on his own call (tap the slot, or **C** /
**X** / **V** on desktop), medkits biggest-heal-first, never wasting one at a
full bar. A repair kit mends the WHOLE arsenal at once — the held weapon and
every weapon in the bag — and a weapon worn down to zero durability is no longer
destroyed: it falls into the bag as a broken, unequippable spare (the hero draws
the best remaining weapon instead of defaulting to the starter sidearm), waiting
for a repair kit to wake it. Spending one restores the weapons it booted from
the hand in the order they were shed, so the hero's main blade comes back to
hand. Each signal keeps at most ONE rope on the ground: while the
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
