# Architecture

## The shape of the project

This is a **webapp-kind** project per OSS_GAME_SPEC §11.4: the deployed website
_is_ the game. There is no marketing site — every build artifact is the
playable app.

Two layers with a one-way dependency:

```
pwa/  (the app: Vite + Preact PWA shell, rendering, deploy concerns)
   │  imports via @game/core  — the whole engine, for the RUN
   │  imports via @game/menu  — the catalogs only, for the STARTUP path
   ▼
engine/      (the engine: framework-free TypeScript game logic)
```

The engine has **two entry points**, and which one a module imports decides
what the player downloads before the menu appears. See
[Two engine entry points](#two-engine-entry-points) below.

Two further layers wrap that same built site for the storefronts — `native/`
(Expo, App Store / Play Store) and `electron/` (Steam, Windows/macOS/Linux).
Neither is an npm workspace member, neither is imported by the engine or the
app, and both answer the same bridge protocols over their own transport — one
file each under `pwa/src/app/`: the coin store, cloud save, achievements,
leaderboards and screenshots on either shell, plus mods, multiplayer and QUIT,
which only a desktop shell can honour. See their sections below.
A third, `tauri/`, is a SECOND desktop shell beside
`electron/` — same site, same protocols, the platform's own webview instead of a
bundled Chromium. It is complete and ships its own downloads, but `electron/` is
still the release package; [`desktop-shells.md`](desktop-shells.md) is how the
two are held against each other and the section below is this one's shape.

A sixth tree, `server/`, is the engine compiled for **Node** rather than for a
browser: the authoritative session server multiplayer runs the simulation in.
It ships inside the desktop app and is forked as its own process. It imports
the engine and nothing else — see [`multiplayer.md`](multiplayer.md).

### `engine/` — the simulation and its catalogs

Pure TypeScript with no UI framework and no build-tool coupling. The simulation is
deterministic by construction: `createGame(seed, levelId?, difficulty?)`
builds the level from a seeded RNG, and `step(state, input, dtMs)` advances
it with a fixed timestep — the same seed, difficulty, and input sequence
always replays the same run, which is what makes gameplay unit-testable in
plain Node and bugs reproducible.

Content is data, simulation is code: the game's levels, monsters, equipment and
cutscenes are authored as YAML under `content/`, compiled into the **catalogs**
the engine reads through `engine/game/defs/` (see
[`content-pipeline.md`](content-pipeline.md)), and referenced only ever by id.
Shipping level 12 or the hundredth weapon means authoring a file, not touching
the simulation.
The def accessors read an overridable registry, so `registerDefs(...)` can
swap the active catalogs for a custom set — the engine test suites use it to
run against synthetic fixtures with no shipped content (see
`tests/engine/fixtures.ts`).

- **`engine/game/mapgen/`** — the map generator, and the ONLY source of a map. Every
  mission ships a **v2 BLUEPRINT** (`content/maps/<id>.yaml`, compiled to
  `engine/generated/map-blueprints.ts` by `scripts/generate-maps.mjs`, part of
  `make levels`), which is a RECIPE rather than a layout — a purpose-typed object
  palette, an AREA palette saying what kinds of place the map is made of, the
  horde's breeds and the depths they hold, the cast, its extents, and the compass
  regions the boss may be hiding in. `resolveLevelDef` carves a whole `LevelDef`
  from it using the run's own seed, so the boss is somewhere new every run and
  has to be found; everything non-geometric (story, loot pools, merchant,
  hazards) is inherited from the MISSION the blueprint names — which carries no
  geometry at all (`MissionDef`, `content/levels/<id>.yaml`). Walls are DERIVED from which two kinds of
  place meet at each border, never authored. An area also says which side of a
  building's wall it is on (`space: inside | outside`), which is what lets an
  interior district be cut a second time into ROOMS (`roomSize`) with a real
  DOOR hung in every doorway (`doors`), and what lets the build refuse a prop
  whose SPRITE is authored for the other half — a car park's cars cannot scatter
  into a cleanroom. A blueprint may also pin a few rooms outright
  (`prefabs`): a fixed-size room with fixed contents, guillotined into the
  rolled carve, so a venue the player has run ten times has something in it he
  can recognise. A MOD may ship a blueprint too
  (`maps/<id>.yaml` in its folder, through the same loader and schema), which is
  why the registry is the import-free leaf `mapgen/blueprints.ts` —
  `registerDefs({ blueprints })` swaps a mod's recipes in without the def
  registry importing the carve. Nothing outside a run imports this —
  the menus reach levels through `defs/levels/summary.ts`, and pulling the
  generator onto the startup path would put the whole level catalog in the
  critical-path budget. The generator itself is the `mapgen-improvement` skill.
- **`engine/game/config/`** — the GLOBAL balance knobs (player, jumping, XP
  curve, stat effects, loot rules), one module per system re-exported by an
  `index.ts` barrel, nothing hardcoded in logic.
- **`engine/game/defs/levels/`** — the level registry. Levels are authored as
  **YAML** (`content/levels/<id>.yaml`, one file per level) and
  compiled into `engine/generated/levels.ts` by
  `scripts/generate-levels.mjs` (`make levels`, folded into
  `make assets`) — the map/atlas equivalent for levels: a schema validates
  every referenced enemy/weapon/gear/thought/story id and fails the build on a
  typo, and the generated file is gitignored + regenerated (a round-trip test
  pins it to a snapshot of the original defs). `levels/index.ts` reads the
  generated catalog and owns `LEVELS`, `LEVEL_ORDER`, `levelDef`. Read a map's
  design with the annotated renderer `make map LEVEL=<id>`
  (`scripts/map-preview.mjs` — hero path, encounters, zones, walls,
  tempo, and a played dwell/mob-density/coverage heatmap).
  SECRET venues (`SECRET_LEVEL_ORDER` — the bunker) register in `LEVELS`
  but sit OUTSIDE `LEVEL_ORDER`: no unlock chain, no NEXT LEVEL slot, no
  per-level badge — only a travel gate (or a dev warp) reaches them, and
  each shares a campaign story `index` so `levelPosition`'s interpolation
  axis never shifts. A
  level carries geometry, per-level gravity (low gravity makes jumps soar),
  biome (a `tiles` sprite spec the renderer paints from), an optional `music`
  track id, resolved against the app's own track registry by
  `playLevelMusic` (`pwa/src/game/music/index.ts`) — the engine stays
  audio-free), the hero's opening monologue (`intro`, one array of lines per
  page — a black-screen dialogue the hero speaks over before the level-name
  card drops the run in),
  an optional prelude cutscene id, landmark props, banded enemy spawns (each
  spawn/wave line may carry an optional `minDifficulty` so difficulty-gated
  content lives with the level that uses it), placed `packs` (fixed monster
  clusters pinned around the map that sleep until the hero nears them, then
  boil up and give chase — cleared by wiping them out, the movement-driven
  counter to the wave horde; on a `clearAll` level every pack must be reached
  and cleared to win), the
  objective (`killBoss` / `clearAll` / `reachExit` — the bossless form:
  standing at the exit door's `at` ends the level), solid obstacles (tall pieces block
  everyone — including sight, shots and a nuke's blast; low/jumpable ones like
  craters can be cleared by the player but never by monsters; a `rockSizes`
  spec scatters rectangular rock footprints that collide as a box, not a
  circle; a `breakable` spec marks CRATES — jumpable cover the hero's weapon
  smashes for GUARANTEED loot, tracked with break `hp` and drop/scaling rules
  in `crates.ts`; a breakable with a `loot` profile is instead a chance-based
  PROP — a vending machine, a wine rack — whose break only sometimes pays,
  with themed drop weights over the crate default), deliberate `walls` (segments expanded into chains of solid circles
  at creation — door gaps between segments carve rooms),
  locked `doors` (chains of `door_locked` obstacles tracked in
  `state.doors`, opened by carrying the matching story-item key up to
  them), latent travel `gates` (doorways to ANOTHER level: USING the
  matching bag trinket — `spendGateKey`, surfaced as the item card's USE
  row / a desktop right-click — tears the gate open beside the hero, and
  stepping in books a one-shot `gateEntered` event the app answers by
  carrying the banked build into a run of the destination; `exitTo` names
  the return leg the victory splash offers),
  hand-`placedItems` (locked-room loot, plot pieces on pedestals),
  decor, and the loot table (the level's thematic base pools — tier
  availability is the global monster-level gate, not per-level data; a farm
  venue may carry a `namedDropMult` sweetener over both the `worldUniques`
  table and the global legendary/artifact roll). **Design-zone systems** (`engine/game/zones.ts`) shape a map's feel:
  `safeZones` (no spawns + the horde repelled out — a breather pocket),
  `quietZones` (dead areas: no ambient horde, but authored chests + a pinned
  unique still live there), a `tempo` curve (keyframes that scale wave pressure
  over the run — build and release instead of a flat ramp), `chests` (placed
  containers with a richer haul than a crate), and `merchantSpawns` (authored
  trader spots).
- **`engine/game/defs/enemies/`** — the monster catalog. Enemies are authored as
  **YAML** (`content/enemies/<biome>/<id>.yaml`, one self-describing file
  per mob, stem == id) and compiled into `engine/generated/enemies.ts` by
  `scripts/generate-enemies.mjs` (`make levels`, before the level
  generator so levels can cross-ref the enemy ids) — a schema validates every
  referenced companion/unique/story/item id and fails the build on a typo or a
  duplicate id, and the generated file is gitignored + regenerated (a round-trip
  test pins it to a snapshot of the original defs). `enemies/index.ts` re-exposes
  it as `ENEMY_DEFS` (stats, AI radii,
  roles; bosses and elites pin guaranteed drops). Roles: `minion` (the
  horde), `boss` (guards the objective), and `elite` — a unique story mob
  pinned to a spot by the level def, which sleeps until the player nears,
  rushes into view at `ai.rushSpeed`, delivers its `dialogue` pages (the
  run pauses in the `dialogue` phase), then fights like a mid-boss and
  drops a signature weapon plus story items. Bosses carry longer
  `dialogue` for the stare-down before the fight. Every unique mob also
  carries `lastWords` — a short dying gasp replayed through the same
  dialogue box (an `enemyDeath` scene) as it falls, so a story death lands
  harder than a nameless minion's. A unique may instead be `spareable`: at
  0 hp it kneels for the SPARE-or-KILL verdict, and spared it joins the
  party as the named companion (see `companions.ts` below). A mob may be a
  SHOOTER (`EnemyDef.ranged`): it fires hostile projectiles at the player
  (they ride the ordinary projectile pass flagged `hostile` — walls eat
  them, a jump clears them, armor turns its share; movement/firing in
  `engine/game/ranged.ts`), and with `takesCover` it hides behind the level's
  solid obstacles between shots. A unique may be GUARDED
  (`EnemyDef.shieldedBy`): it cannot be hurt while any enemy with a listed
  def id lives — blows bounce with an `enemyShielded` event — so a set-piece
  boss is wired to its controllers. This game's
  actual roster (and the story it tells) is in
  [`game-content.md`](./game-content.md).
- **`engine/game/defs/companions.ts`** — the companion TYPES and registry: who a
  spared unique becomes. The roster itself is authored in
  `content/companions.yaml` and compiled to `engine/generated/companions.ts` by
  `scripts/generate-companions.mjs`, so a MOD ships its own recruits by putting
  that same file at its root. Each def carries the sprite family (the enemy twin's), a
  base hp that grows with the companion's OWN level, a signature starting
  weapon, an optional party-wide `aura` (LUCKY's +50% magic find), an optional
  signature `nova` (RASPUTIN's FROST NOVA — a chilling pulse that damages and
  slows the foes around him), an optional signature `power` (how the companion
  gets stronger as it levels — more shotgun pellets, chain-lightning arcs, a
  wider nova, a swelling luck aura), the `joinWords` scene played the moment the
  SPARE verdict lands, and the `killQuotes` banter floated over the companion
  when its blow downs a mob.
- **`engine/game/companion-stats.ts`** — pure companion stat/level/power math
  (config + def only, no engine state): the max-hp ramp, the level XP curve
  (`companionXpToLevelUp`, authored in kills like the hero's), the power RANK a
  level has reached, and the per-rank bonuses (extra pellets/chain/pierce, a
  wider/harder nova, a bigger magic-find aura). Shared by the per-tick pass, the
  kill rail that credits a companion's XP (`loot.ts`), the party's magic-find
  aura (`items.ts`), and the loadout carry — none of which it imports back.
- **`engine/game/defs/story.ts`** — the story-item registry: plot pieces
  (keycards, dossiers, recovered hardware) dropped by elites or placed in
  locked rooms. Pickups bank into `state.storyItems` (never the bag) and
  play their `lore` pages as a dialogue; an `unlocks` entry makes the item
  the key for the matching level door. The catalog itself is authored in
  `content/story-items.yaml`; this module owns the type and the registry, as
  `defs/thoughts.ts` does for the hero's inner monologues
  (`content/thoughts.yaml`).
- **`engine/game/defs/quests.ts` + `engine/game/quests/`** — the QUEST system: the
  errands the field's non-combatants ask of the hero, and the people who ask
  them. `defs/quests.ts` owns the two types and the two registries (a giver is a
  PERSON, and one person hands out a whole chain, so the catalogs are separate);
  the content is authored in `content/quest-givers.yaml` +
  `content/quests/<id>.yaml` and compiled by `scripts/generate-quests.mjs`,
  exactly as the story catalogs are, and a MOD's quests arrive through the same
  `registerDefs` seam. `quests/index.ts` is the orchestrator — it stands the
  givers up at level creation, derives the `!` / `?` mark over each head fresh
  every tick, opens the conversation when the player TAPS somebody — never on
  approach, which merely MEETS them (the WoW-style PICK LIST when a giver has
  more than one thing to say), keeps the tallies, and pays out; `quests/
escort.ts` walks the people an escort errand puts on the field, and
  `quests/rewards.ts` pays through the ordinary `grantXp` / `rollEquipment` /
  loot-toss machinery rather than minting anything of its own. The conversation
  is a pause phase (`quest`) like the shop, and progress is booked where it
  happens — `killEnemy` and the item pass call in, nothing scans the world (the
  three conditions with no moment to be booked at — a place stood in, a flag
  set, a level reached — are polled over the RUNNING errands only). See
  the QUESTS section of `CLAUDE.md` for the rules that are load-bearing.
- **`engine/game/quests/restock.ts`** — TOPPING THE HORDE UP FOR AN ERRAND. A
  carved map drops `waves` entirely, so its monsters are finite: an errand taken
  on ground the hero has already swept has nothing left to count, and the
  failure is silent. Accepting one therefore reads what the field can still
  deliver and queues any shortfall into the ordinary SPAWN POINTS — never onto
  the field, so the top-up inherits the whole summon machine (off-screen
  arrival, the alive caps, the level's own mob scaling, the foe readout). A
  shortfall top-up rather than a stocking pass: a map still good for the job is
  left alone, because a mob mix is a difficulty knob. See `docs/game-content.md`
  → What an errand costs.
- **`engine/game/quests/campaign.ts` + `campaign-save.ts`** — the CAMPAIGN chain:
  errands marked `campaign: true` belong to the HERO rather than to the run, so
  their log and their flags are banked on the character per difficulty and
  seeded back at run setup. The shape and the merge live in the second file, a
  LEAF whose only import is a type, because the app's roster stores this record
  and the roster is on the 170 KB startup path — which is why `@game/menu`
  re-exports it. The merge keeps the FURTHER reading of each errand, so progress
  can never walk backwards.
- **`engine/game/disposition.ts`** — WHO IS ACTUALLY IN THE FIGHT. One predicate,
  `inert`, asked by every damage pass, AoE gather, target search and foe tally:
  true for an apparition (mist) and for an un-provoked NEUTRAL mob (a bystander).
  `provokeEnemy` latches `Enemy.hostile` and the same body becomes an ordinary
  monster, which costs the combat code nothing because every site already asks
  the one predicate.
- **`engine/game/conversation.ts` + `defs/conversations.ts`** — the talks the hero
  STEERS: a tree of what a speaker says and what the hero may say back, opened
  by tapping a neutral mob and frozen in its own `talk` phase. A branch may set
  a run FLAG, provoke the speaker, hand over a quest piece, or move to another
  node — and nothing else. A conversation is DATA even though a mod may now ship
  Lua (`docs/scripting.md`): the scripting seam answers a formula's question, it
  is not a place to hang a behaviour off, and a branch that could run code would
  be a second, unbounded way for a talk to change the world. The FLAGS
  (`GameState.questFlags`) are the one thing a branch leaves behind for the rest
  of the game to read.
- **`engine/game/script/` + `engine/lib/lua/`** — THE RULES THE ENGINE HANDS OUT.
  Twelve formulas (the XP curve, what a kill pays, the horde's hp and level, the
  drop chance, the rarity roll, weapon damage, mob armor) are authored in
  `content/scripts/*.lua` and called through a sandboxed Lua VM, so a total
  conversion changes how the game WORKS rather than only what is in it. The
  split is four modules: `engine/lib/lua/` is the VM (generic — lexer, parser, tree
  walker, a stdlib whose absent half IS the security model); `script/catalog.ts`
  is an IMPORT-FREE LEAF holding what a mod registered, for the same reason
  `flags.ts` and `mapgen/blueprints.ts` are leaves — `registerDefs` is reachable
  from the startup path and the 170 KB budget has no room for an interpreter, so
  what a mod registers is SOURCE TEXT and the compile happens on the first hook
  call, inside a run; `script/env.ts` builds the frozen `game.config` /
  `game.balance` / `game.run` views; `script/host.ts` resolves a hook, contains
  its failures (a broken override falls back to the file it overrode and reports
  itself once) and memoizes the calls that read nothing but their arguments.
  `script/bindings.ts` is the ONLY place the rest of the engine touches any of
  it. → `docs/scripting.md`
- **`engine/game/defs/cutscenes.ts`** — the cutscene registry: pure-data scenes
  (a stage of props, a cast, a beat timeline) played by the generic
  `@game/lib/cutscene` state machine. A level references scenes via its
  `prelude` field — one id, or a LIST chained back-to-back (the moon opens
  on the garage launch, then the space transit); the run then opens in the
  `cutscene` phase (the sim frozen underneath), advanced by `step()` on the
  same clock. `farewell` is the same chain at the other END of a run, played
  when the objective falls and handing over to the epilogue pages and the
  splash, because a DEPARTURE belongs to the place being left: the moon's ghost
  sees the hero off the landing site rather than opening the level he flies to
  from his own lawn. Which end a chain was is `GameState.cutsceneThen`, since by
  the time one drains both look identical. A scene's dressing can also depend
  on what this run has already done — `CutsceneProp.needs` / `until` against the
  run's `cutsceneTags` (one per level cleared), which is how the launch stands
  beside a whole house the first time and a burnt one every time after. Motion beats run on that clock — walks, fades, camera `pan`s
  (the launch's ascent: the world falls away under the climbing ship), actor
  `shake`s (the rattling rocket) and `jump`s (the prelude's leap for the wall
  weapon: a rise and a fall, with the `prop` that takes the piece off the wall
  and the `hold` that puts it in his hand settling between them, at the apex —
  a jump's `lift` is HEIGHT, so an airborne actor is never re-sorted through
  the furniture it leapt from) — and a stage may carry a constant
  `drift` that streams its props by per-prop `parallax` depth (the space
  transits' star field) even while a held line idles the timeline. A prop
  marked `ground` is art that LIES on the floor rather than standing on it
  (the launch's driveway and the road across the front of the lot) and is
  painted with the floor, under the whole standing queue — a slab is
  anchored at its NEAR edge, so sorted normally it would come out in front
  of every actor walking over it. Text
  beats crawl in letter by letter and hold until
  `tapCutscene` (JRPG-style), and `skipCutscene` bails the whole opening —
  every queued scene _and_ the hero's level-intro monologue that follows —
  landing on the level-name `title` card just before the drop. The opening
  flow is `cutscene` (if any) → `intro` (the hero's monologue) → `title`
  (the level name alone on black) → `playing`; the DIALOGUE display toggle
  off drops the `intro` step, opening on the `title` card. The intro has a closing mirror: a level
  may ship `outro` pages (`LevelDef.outro`) — clearing its objective arms a
  VICTORY QUAKE (`GameState.quakeMs`, a render-side camera shake) through
  the loot-grab countdown, and the countdown then lands in the `outro`
  phase (the same black-screen paged monologue, turned by
  `advanceOutro`/`skipOutro`) before the `victory` splash.
- **`engine/game/boss-death.ts` + `engine/game/death-rites/`** — the BOSS DEATH RITE,
  the death scene's mirror image: there the horde gathers over the fallen hero,
  here the hero stands over the fallen boss. Felling a boss drops the run into
  the `bossDeath` phase (`stepBossDeath`, run ahead of the `playing` gate like
  `stepDeathScene`) for three beats — **STAGGER** (the boss on its knees and not
  yet dead, the horde held outside `BOSS_DEATH.ringRadius`, sim time dilated to
  `BOSS_DEATH.timeScale` and the camera leaning in), **ACT** (the hero's
  scripted approach on the REAL jump system, so the dust at both ends and the
  doll's squash come free, then the blow) and **AFTERMATH** (what is left
  settles). `bossDefeated`, the landmark corpse and the boss's `lastWords` all
  fire at the END of that beat rather than on the tick of the blow — putting the
  last words over the wreckage is the whole reason the beat exists — while the
  kill's XP and drops are paid out immediately, because a cinematic standing
  between the player and what they earned would be the feature taxing the win.
  A press past `BOSS_DEATH.skipGraceMs` skips it (`skipBossDeath`, a run command
  like every other scene-advance verb).
  - **WHICH send-off is a CATALOG entry, not a `switch`** — `death:` in the
    boss's YAML names a `DeathRiteDef` (`death-rites/catalog.ts`), mirroring the
    boss ABILITY catalog for the same reason: eleven bosses each dying by their
    own branch is eleven permutations of whatever the first one did. A boss that
    names none still gets the full beat, because the default reads the victim's
    own GORE FAMILY and so is already right for a body, a machine, a haunting
    and a rift-thing alike.
  - **A FLIGHT rite is the same machinery pointed the other way.** A boss with
    `flees:` (THE FOUNDER, twice) does not die: it reels, tears its exit open a
    few strides off — the landmark appears as the RUN starts, so the player
    watches him decide rather than being told where he is going — bolts for it
    with its back to the hero, and is spun out of existence at the mouth. It
    books `bossFled` and leaves no corpse. The ENDING picks the rite (`riteFor`),
    never the authored id alone: a finisher staged over a boss that was supposed
    to run has nobody left to finish.
  - **The gore gate is the app's, and the rite is not gated.** The choreography
    is identical either way; only the wreckage is mature content. The engine
    states an intent on `bossRiteStruck` and
    `pwa/src/game/game-screen/boss-rite.ts` asks the gore gate on both its axes
    (the family's own row AND whether that KIND of dismemberment is permitted),
    downgrading to
    an ordinary corpse on a refusal — the same fallback shape the incinerate
    gate takes, and for the same reason.
  - **It is a GLOBAL phase and must stay one.** The per-player UI phases are
    `Player.screen`s (`docs/multiplayer.md` → THE SCREENS ARE PER-PLAYER), but
    the group beats stay on `state.phase`; a boss's death is one of those, so
    it must not become a per-player screen.
  - **SETTINGS → GAMEPLAY → DEATH SCENES** (`deathScenes`, on by default) turns
    the rite AND the hero's own tableau off together, via
    `setDeathScenesEnabled` in the engine's import-free `flags.ts` leaf. Not a
    gore switch: it decides whether the game STOPS to show you, never what it
    shows.
- **`engine/game/death-scene.ts`** — the DEATH SCENE that mirrors the victory
  flow on the losing side. When the hero's hp hits 0 the run drops into the
  `dying` phase instead of straight to `defeat`: a dramatic tableau
  (`stepDeathScene`, run ahead of the `playing` gate) where the horde stops
  attacking and rings the fallen hero, fresh mobs wander in from the screen
  edges to fill the field, and — after `DEATH_SCENE.durationMs` (or a
  `skipDeathScene` tap, refused inside the opening `DEATH_SCENE.skipGraceMs` so
  the press that was steering when the hero fell can't dismiss the beat, and
  wired to pointer presses only — the keyboard is inert while he lies dead) —
  the run lands on the `defeat` splash. The fall emits
  `playerDeath` (the app's death sting/haptic and the bleeding
  corpse + rolling clouds it draws), the timeout emits `defeat` (the modal +
  the run banking). The engine owns only the mob choreography and the timer, so
  the whole beat stays deterministic and headless-testable; the calibration sim
  skips it (`engine/sim/simulate.ts`). App-side, the fall also clears the fight's
  COMBAT NOISE off the tableau: `pwa/src/game/render/death.ts`
  `combatNoiseFade` eases the floating damage/crit/XP layer, the shots in
  flight, and the horde's health bars to nothing over
  `COMBAT_NOISE_FADE_MS`, and `effectsClockMs` carries the effect layer on the
  scene's clock once the sim clock stops — otherwise the killing blow's own
  numbers hang frozen over the corpse for the whole beat. The camera goes DEAD
  STILL for it — `playerDeath` kills any jolt still ringing from the fight
  (`clearCameraShake`; the shake's decay rides the sim clock, which freezes
  here, so a live one would rattle the whole eight seconds) and throws none of
  its own. The drama is a slow PUSH-IN instead: `deathZoom` eases the view in on
  the body across the scene and holds it there behind the modal, applied by the
  render loop as a canvas scale about the hero's own screen point so every draw
  pass below still works in unzoomed view units.
- **`engine/game/defs/equipment.ts`** — the equipment machinery. The item
  catalogs themselves are authored in YAML — one file per item under
  `content/items/<rarity>/` (`regular`/`trash` bases, `set`/`unique`/
  `legendary`/`artifact` named items, each carrying its sprite refs and a few
  sentences of `description` lore), with the make-quality axis in
  `content/item_quality.yaml` and the tier/rarity knobs in
  `content/item_rarity.yaml` — compiled by `scripts/generate-items.mjs` into
  the gitignored `engine/generated/items.ts` (first in the generate chain) and
  wrapped here with types and lookups. The module defines weapons
  (melee/ranged/magic classes,
  each with a Diablo-style `levelReq` that gates both the drop — no monster
  below it drops the base — and the hero's own hands, plus a Diablo ATTRIBUTE
  gate that forces a build to pick a lane: melee needs STRENGTH, ranged
  DEXTERITY, magic INTELLIGENCE (`REQ_STAT`), the amount DERIVED from `levelReq`
  by `statRequirement` and checked by `meetsStatReq`/`canEquip` against the
  hero's RAW attribute — never authored per item, and it scales with the AUTO
  LEVEL STATS flag so the arsenal stays calibrated when auto-attributes toggle
  (config `STAT_REQ`); plus a durability
  budget: MELEE AND MAGIC weapons wear out per attack and break, though every
  unique/legendary find is minted unbreakable (the one
  exception is an EXECUTIONER — `WeaponDef.execute`, `items/execute.ts` — whose
  durability is a BODY COUNT rather than a swing count, because it takes a body
  outright instead of damaging it). RANGED weapons made the OTHER trade and
  carry no durability at all: they eat AMMUNITION (`WeaponDef.ammo`, config
  `AMMO` / `AMMO_KINDS`, the rules in `items/ammo.ts`), one round per TRIGGER
  PULL however many pellets that pull throws, out of a per-hero pouch
  (`Player.ammo`) that stacks each of the three kinds — `bullets` for every
  firearm, `arrows` for a drawn bow, `cells` for charged shot — to
  `AMMO.stackCap` (200) independently. A gun never breaks and never wants a
  repair kit; it runs dry, and the hero draws whatever in the bag he can still
  fire — falling back to the built-in SIDEARM when the bag holds nothing loaded
  (`swapOffDryWeapon`). Ranged
  bases can fire pellet volleys, pierce, home, or chain), gear, the
  quality ladder (`Tier`: trash/regular/magic/rare/set/unique/legendary/
  artifact — each tier
  unlocks at a MONSTER LEVEL, config `LOOT.tierUnlockMlvl`; TRASH sits below
  regular, never rolls, and exists only for scripted zero-stat joke drops
  minted by a boss's forced-tier `loot.items`), and the affix
  pools magic+ items roll: magnitudes come from ilvl-gated BRACKETS
  (PoE-style generations unlocking at ilvl 1/10/22/36/52/70/88, tracking where
  each difficulty rung's levelling lands, with the top pair carrying rolled
  gear through the ilvl 52–99 endgame), keyed to the drop's ITEM LEVEL — the
  killer's monster level minus a small weighted deficit; magic+ names are
  composed Diablo-style from those affixes. Item level buys a drop its AFFIX
  BUDGET and nothing else on the weapon side — a weapon's catalog `damage` is
  what it swings, however deep it was found; a rolled gear piece still grows
  its armor with depth (`ARMOR.armorPerIlvl`). What a WEAPON gains from rarity
  is **ENHANCED DAMAGE** (D2's `+X% Enhanced Damage`): a magic-or-better weapon
  rolls a `+%` on its base inside its tier's band (`enhancedDamage` in
  `content/item_rarity.yaml` — magic +10–50% climbing to artifact +250–700%),
  stamped at mint, frozen for life, and printed on the item card, so the one
  thing that makes a rarer weapon hit harder is a number the player can read.
  The artifact band is the widest in the game on purpose: the perfect roll is
  the endgame chase, and the menace meter — not a damage cap — is what answers
  the hero it creates. Two more axes complete the
  tables: **base grades** (`defs/grades.ts` — every pool base ships
  generated EXCEPTIONAL and ELITE versions, same look, new names, level
  requirements remapped up to 100, damage/armor re-derived on the balance
  curves; `rollEquipment` folds them into each level's pool at roll time)
  and **make quality** (every PLAIN regular-tier weapon/armor drop rolls
  BROKEN → CRUDE → NORMAL → SUPERIOR → PERFECT per instance, odds sliding
  with the killer's monster level; each quality is a RANGE, so a drop then
  rolls a specific base-value multiplier inside its band — the D2 rule that
  two SUPERIOR copies swing differently — with the bands overlapping between
  neighbours and climbing with the rank, scaling its damage/armor/durability/
  value — config `QUALITY` (`ranges`, midpoint `mults`); craftsmanship and
  magic are exclusive D2-style, so magic-or-better finds, trinkets, and bags
  stay flat normal make with no range roll).
- **`engine/game/defs/abilities.ts`** — the ability pickups' TYPES and accessors.
  The catalog itself is CONTENT: `content/powerups.yaml` (one file, a
  `powerups:` map of id → power, carrying every duration, damage figure and
  radius) is compiled into `engine/generated/powerups.ts` by
  `scripts/generate-powerups.mjs` (`make levels`, before the level generator so
  levels can cross-ref their `abilityPool` ids) and re-exposed here as
  `ABILITY_DEFS`, so a rebalance never touches engine code. A schema
  (`scripts/asset-tools/powerup-schema.mjs`) fails the build on an unknown
  `kind`, a param block that belongs to a DIFFERENT kind, a negative number, or
  an `icon`/`sprite` the atlas has never heard of; the generated file is
  gitignored + regenerated, with a snapshot test pinning the compile. The
  campaign introduces **two new powers per map** and every map's pool keeps
  what came before, so the dock's vocabulary grows the whole way down: the
  classics at GOODCO HQ (orbiting fire orbs, storm strikes, stasis slow fields,
  the item magnet whose pull radius grows with INTELLIGENCE — and which only
  reels in gear the hero can actually keep, leaving loot a full bag has no room
  for where it lies), then ION WAKE and BLAST SHIELD, MOONFALL and PALE SHROUD
  on the moon, DUST DEVIL and REACTOR SURGE on Mars, EVENT HORIZON and THE
  UNMAKING in the rift, DEAD MAN'S HAND and IRON STAMPEDE in Boot Hill, and
  CONTINUITY PROTOCOL and SENTRY GRID in the secret bunker. Plus the instant
  screen nuke (a blast dealing 200% of the mean on-screen monster health —
  `NUKE.meanHpDamageMult` — to everything it catches, no monster exempt: the low
  average wipes the horde outright while elites and bosses are only chunked, and
  the blow can crit — its drop rate kept rare by `LOOT.nukeShare`, and its own kills
  never chain: a nuke blast's loot rolls skip both screen-nuke slices, so a
  bomb can't pay out another bomb). As a panic button it also buys real
  breathing room — the AFTERMATH (`NUKE.calmMs`, `NUKE.recoverMs`,
  `detonateNuke` → `stepSpawner`): after a blast the spawner holds every refill
  for a short calm so the cleared screen stays clear long enough to break away
  instead of the live floor instantly repopulating the ring, and once the calm
  burns off a recovery ramp eases the near-floor back from empty to full so the
  swarm walks back in at the normal rate rather than the whole floor snapping
  onto the player in one frame. The transient menace heat is cooled to the
  earned permanent floor (the ratchet stands) with the banked walk-credit lure
  dumped, so the horde that returns is no denser or more evolved than the run's
  baseline. The ONE NUKE rule (`canDropNuke`) gates
  every nuke drop so at most one is ever in play: none drops while a nuke sits
  in the dock or an un-collected one still waits on screen, and a nuke that has
  drifted off screen is swept away when a fresh one drops. Levels choose which
  can drop via their
  `loot.abilityPool`. Pickups are banked into `player.heldAbilities` (up
  to `HELD_ITEMS.cap`) and spent with the `useItem` input, or dragged out
  of their dock slot to be discarded (`discardHeldAbility`) when the bank
  is full of powers you don't want. A `uniqueHeld` power (the nuke) docks
  at most once — a second pickup stays on the ground and the merchant
  refuses the sale (`canBankAbility`, the one gate every route into the
  dock shares). A spent power does not vacate its slot:
  it keeps counting down in place (`ActiveAbility.slot` links a running copy
  to its dock slot), and only when it lapses does the slot free and the rest
  shift down (`removeHeldSlot`) — so the dock stays full while a power runs
  and no new pickup can bank over it. The instant screen nuke is the
  exception: it fires and frees its slot at once. A `stackable` power (fire
  orbs, storm cell) runs several copies at once — each activation adds a
  fresh instance from its own slot, so two storm cells strike twice as often;
  a non-stackable one (the magnet) refuses to re-enable while a copy is
  running, keeping the pickup banked.
- **`engine/game/defs/talents/index.ts`** — the passive TALENT trees' TYPES, tree/
  stat wiring and registry. The catalog itself is CONTENT: `content/talents.yaml`
  (one file, a `talents:` map of id → talent) is compiled into
  `engine/generated/talents.ts` by `scripts/generate-talents.mjs` (`make levels`)
  and re-exposed here as `TALENT_DEFS`. A talent is WHAT IT CARRIES — `kind` is
  a picker label nothing branches on, while an `effect` bag of per-rank slopes,
  a `conjure` feeding an always-on granted spell, and any of eleven structured
  PROC BLOCKS (parry, volley, frost nova, …) are the behaviour. Each proc's
  chances, radii and cooldowns live in its block on the def, and the hook that
  fires it asks the catalog _which trained talent carries this block_
  (`procTalent`, `engine/game/talent-effects.ts`) rather than looking a talent up
  by id — which is what lets a mod own a proc with its own numbers. Exactly one
  talent may carry each block, enforced at build time. `engine/game/config/talents.ts`
  keeps only the shared rank ceiling, because it is the one number true of every
  talent; the point economy and spending live in `engine/game/talents.ts`.
- **`engine/game/defs/difficulties.ts`** — the difficulty ladder (EASY →
  MEDIUM → HARD → NIGHTMARE → JESUS CHRIST!), chosen on the main menu and
  layered over every level. A rung turns a whole rack of knobs: the hero's
  opening kit (`startingWeapon` — the wall weapon, mirrored by a
  per-difficulty prelude variant — and `startingStats`), spawn counts,
  the wave spawner's live cap, how many finite SPAWN POINTS may be active at
  once (`activeSpawnerCap` — only the closest, in-line-of-sight points arm;
  easy 2, medium 3, hard 4, nightmare 5, JESUS uncapped), how fast a thinned
  spawn point REFILLS (`spawnerRespawnMult` — the post-kill respawn delay
  shrinks down the ladder, easy 1.6× → jesus 0.45×; see `spawners.ts`), the
  horde's RELATIVE level (`mobLevelOffset`
  — every monster spawns at player level + offset, hp scaled per level by the
  GEOMETRIC `mobHpLevelFactor`, config `MENACE.mobHpGrowthPerLevel` — so
  hits-to-kill rises with level instead of collapsing as the hero out-damages a
  linear ramp), the drop economy (medkit/armor/powerup
  multipliers down, drop-chance/tier bonuses up — the harder rungs pay richer
  loot through their explicit `tierChanceBonus`/`lootIlvlBonus`, since the loot
  gates now key off the hero's earned LOOT level with the `mobLevelOffset`
  stripped back out, not the raw monster level), the stamina burn, dodge/miss accuracy multipliers, the
  menace meter's trigger/decay/effect/PEAK (`menaceStageCap` — easy 3, medium 5,
  hard 10, nightmare 100, JESUS uncapped, each widened by the hero's level
  headroom over the horde), and — on EASY/MEDIUM only — how far the
  plain horde's chase speed drops once an elite or boss is ENGAGED
  (`mobPursuitNearElite`, 10%/50%, so the player can break past the swarm and
  run to the set piece). MEDIUM is the exact 1.0 baseline.
- **`engine/game/abilities.ts`** — ability activation (`grantAbility`, which
  links the running copy to the dock slot it was spent from), freeing a slot
  when a power lapses or is discarded (`removeHeldSlot`, `discardHeldAbility`),
  the dock's one admission gate (`canBankAbility` — room under the cap, and a
  `uniqueHeld` power at most once), and the helpers the renderer shares
  (`orbPositions`, `stasisFactorAt`); the per-tick behavior runs inside
  `step/` so all damage flows through one path.
- **`engine/game/spells.ts`** — the GRANTED forever powers items carry (the
  `spell`/`proc`/`sureStrike` affix kinds, config `SPELL`): deriving the
  worn loadout's granted spells (`syncItemSpells`, ranks from multiple
  sources adding), the live rank+INT-scaled numbers (`orbitSpellBlock`,
  `stormSpellBlock`, `stasisSpellParams`, and the seeker/singularity/
  immolation blocks beside them, INT shortening intervals via
  `spellIntervalScale`), proc lookups (`equippedProcs`), and the renderer's
  orb positions (`itemSpellOrbPositions`). Stepping lives in `step/`
  (`stepItemSpells`/`stepProcs` — procs queue on the hero's own weapon
  blows in `hitEnemy` and on enemy blows landing ON him — the D2
  "when struck" trigger, `queueStruckProcs` — and resolve after the
  combat passes).
- **`engine/game/item-budget.ts`** — the bonus-budget pricing model (what a
  unique's fixed bonuses are WORTH in ilvl points, derived from the live
  combat constants). One source of truth: `scripts/weapon-ilvl.mjs` imports
  it for authoring checks, and `pickUniqueForDrop` reads it at runtime to
  derive a legendary's drop weight from its power as a POWER LAW ("stats
  determine rarity", `UNIQUE.rarityBudgetRef`/`rarityBudgetExp`): the
  roster spans a vast authored power range and the strongest are
  astronomically rare.
- **`engine/game/types/`** — state shapes plus the `GameEvent` union: events
  are the only channel from simulation to presentation (sound, flashes);
  the engine never knows a renderer or speaker exists.
- **`engine/game/create.ts`** — seeded run setup from a level def: difficulty
  bands scale with distance from the player spawn toward the objective.
- **`engine/game/step/`** — the per-tick pipeline: `index.ts` is the
  orchestrator, with each pass in its own module (`player.ts`, `weapon.ts`,
  `powers.ts`, `projectiles.ts`, `enemies.ts`, `spawner.ts`, `packs.ts`,
  `items.ts`). In documented order:
  player steering + jump physics (+ obstacle push-out) → use-item edge →
  weapon auto-attack (wearing the weapon's durability) → abilities →
  projectiles → enemies (aggro/guard/elite AI, dialogue triggers, contact
  damage, obstacle push-out) → hazards (gravity wells, asteroids) → menace
  decay → placed packs (waking clusters the hero nears) → finite SPAWN POINTS
  (`spawners.ts` — points that arm on approach and SUMMON their queue in from
  off-screen: a summoned mob appears just outside the camera and RUNS IN at a
  sprint until it crosses the approach circle, the shorter viewport dimension,
  then drops to its normal pace; refills a thinned wave after a post-kill
  respawn delay that shrinks with difficulty, boss proximity, and campaign
  progress; HELLGATES — `SpawnerSpec.hellgate`, config `HELLGATES` — are the
  same machinery driven by the MENACE meter instead of by proximity alone: shut
  until the rampage reaches their `openStage`, escalating their alive cap, batch
  size and cadence with every stage past it, never running dry while the meter
  holds, and shutting again when it cools. Levels gate them to NIGHTMARE and up
  and field a worse JESUS-only breed through per-member `minDifficulty`; what
  comes through is `hellborn`, the one crop whose drops get BETTER with the
  rampage instead of worse — see `dropMinionLoot`) → wave spawner →
  item pickups →
  locked doors → objective → win/lose. The wave spawner also enforces
  CAMPING PRESSURE (config `CAMPING`): a player who holds the same ground
  past a grace period stops being fed — the live floor and the timed budget
  stream fade out (deferred, not canceled) and a slow beckoning trickle
  walks in from the objective's direction instead, luring him onward; and
  once a killBoss level's wave budget is spent, a thin endless straggler
  stream keeps arriving from that same bearing so the walk to the boss
  never crosses a dead-empty map (clearAll levels stay finite). A boss at or below `LAST_STAND.hpFraction`
  multiplies its contact damage — the one-last-stand spike the renderer
  telegraphs with a flickering dying sprite. The character fights autonomously (and only
  targets monsters inside the visible view the app passes in
  `input.view`) — it locks the BEST visible foe, which is the nearest one with
  its distance weighted by ROLE (`TARGET_PRIORITY`), so an elite or a boss
  outranks the chaff standing in front of it rather than the hero spending a
  set-piece fight on whatever wandered into his face. The desktop AIM & SHOOT
  scheme adds an aim dimension on top: `input.aim` (the pointer's world
  position) biases the pick toward whatever the cursor points at
  (`AIM.biasStrength`), so foes in the pointer's direction outrank
  merely-closer ones elsewhere. It is supplied by that scheme ALONE — a
  FOLLOW CURSOR pointer is a destination rather than an aim, and reading it as
  both made the hero fire at whatever lay along his walk. Neither bias is a
  lock: a foe close enough still wins on distance. The player steers,
  jumps (tap/Space), spends banked
  ability pickups (`input.useItem`), spends level-up stat points, and
  manages the inventory. Level-ups restore full health, land automatic
  base-attribute gains (see `leveling.ts` below), and celebrate first: the
  ding arms `state.levelUpFxMs` (config `LEVELING.dingCelebrationMs`) — the
  app draws the golden burn off it — and the points BANK on the hero
  (`pendingStatPoints`). Who opens the `levelup` chooser on them depends on the
  run: SOLO it rises out of the fading glare, on the tick the window empties
  (`openLevelupAfterDing`); in a PARTY it stays banked behind the HUD's points
  pip and its player opens it when they choose (`promptPendingPoints`) — see
  [`multiplayer.md`](multiplayer.md). XP SCROLLS pay no XP at all — one
  is READ by walking over it (there is nothing to dock and nothing to spend), and
  for `scrollDurationMs` afterwards every XP that hero earns is multiplied by
  `scrollXpMult` (both authored in `content/leveling.yaml`; the window is
  `Player.xpBoostMs`, counted down in `stepTimers` and applied at the one
  `grantXp` door via `xpBoostMultiplier`, above the per-map cap so outgrown
  ground still throttles it). A second scroll REFRESHES the window rather than
  stacking, so a scroll rain buys one window rather than five. Because it
  multiplies rather than pays, it cannot distort the leveling table's
  kills-per-level: it only ever makes the same kills count twice. The app draws
  the lit window as a faint blue veil around the hero
  (`pwa/src/game/render/xp-veil.ts`). Picked-up
  equipment that beats what is worn — and that the hero can actually WIELD, both
  the level and the attribute gate (`canEquip`) — is equipped on the spot; a
  find he is too low-level or too weak for banks until he grows into it.
- **`engine/game/loot.ts`** — kill resolution: `hitEnemy` applies player
  damage (crit rolls flash the victim), pays out XP, and rolls drops —
  the level's loot table for minions (with the pity rule and the
  all-clear trophy), the def's guaranteed drops for bosses and elites.
  It also feeds the menace meter on each kill and power-scales an
  elite/boss to the player on its first blow.
- **`engine/game/items/toss.ts`** — THE D2 TOSS: every drop in the game goes
  through the one funnel (`dropItem`), which throws it clear of the body it
  came out of instead of materialising it under the corpse. `item.pos` is the
  LANDING spot from the moment the item is minted — the renderer arcs it in
  from `toss.from`, so the magnet, the pickup reach, the minimap and the bot's
  loot run need no notion of flight; airborne loot simply cannot be picked up
  or reeled in. The scatter is hash-derived off the item's id rather than
  `state.rng()`, so a seeded run rolls identically with the toss as without it.
  `stepItems` counts the arc off and emits `itemLanded` on touchdown, carrying
  the item's MATERIAL (`itemVoice` — blade / gun / wand / plate / mail /
  leather / cloth / trinket / flask / scrap / spark / relic), which is what the
  landing sound is chosen by; a magic-or-better find rings a `lootShine` over
  the top, so rarity layers onto material instead of needing one sound per
  combination.
- **`engine/game/leveling.ts`** — the automatic base-attribute growth (the
  WoW-style ding gains, config `LEVELING.autoGainsPerLevel`): each level
  grants `round(rate × level)` points of the listed stats on its own,
  underneath the chosen point. Everything is DERIVED from `player.level`
  (`baseStatBonus`, folded into `effectiveStat`) — never written into
  `player.stats`, so a respec refunds only chosen points — and
  `autoPowerScale` expresses the damage curve those free gains produce so
  the horde's scaling can cancel it out. Because that growth is derived,
  a hero who has spent nothing can still read a non-zero attribute — as can
  one carrying a passive trinket or wearing a base with a `bonuses.stats` —
  so `statBreakdown(state, hero, stat)` (items/derived.ts) itemises the four
  sources (`chosen` / `headStart` / `auto` / `gear`, plus the `pct` scaling)
  for the surface that has to explain the difference. It is bookkeeping over
  the same memoised parts `effectiveStat` reads, so the two can never
  disagree; the character sheet is its only caller. Two balance guards live
  here too:
  `diminishStat` (config `STATS.statHardCap`/`statCeilingBase`/`statTaper`,
  via `statCap(level)`) is the LEVEL-SCALED cap curve every effective-stat
  read and `autoPowerScale` run through — linear up to a ceiling that rises
  with level (a full spec realizes its raw value, undiminished) and is
  hard-capped at 250, with a diminishing tail past it so gear pushes further
  but never for free — and
  `xpLevelCap`/`xpCapMultiplier` (config `XP_CAP`) are the per-map SOFT XP
  caps: every (level × difficulty) pair has a hero-level cap XP tapers into,
  then keeps decaying reverse-exponentially (`softCapDecay`) past it —
  bottoming out at a never-zero ~1/100 `floor` trickle about two levels over
  the cap (applied in `grantXp`), so re-running an outgrown map farms loot and
  only crawls XP at a glacial pace, with no hard wall short of the global
  `maxLevel`.
- **`engine/game/menace.ts`** — the escalation system: the player's rolling
  DPS/kill-rate (`tickMenace`) plus relative-overkill jolts on a killing
  blow (`bankOverkill`) bank `state.menace`, which idle time bleeds off (a
  fixed decay, also in `tickMenace`, run from `step/`) — but never below
  the permanent floor of the EVOLUTION RATCHET: overkills on mobs of the
  current evolution stage bank proof (`state.evoProof`; the crop's clean
  kills refund it), and enough proof lifts `state.menaceFloor` a full
  stage, at most one per `ratchetCooldownMs` — so a horde whose current
  crop keeps getting one-shot evolves stage by stage until the player's
  blows stop dropping mobs outright OR the difficulty's PEAK is reached
  (the per-rung `menaceStageCap`: easy 3, medium 5, hard 10, nightmare 100,
  JESUS uncapped — PLUS `menaceLevelHeadroom`, the levels the hero has grown
  over this venue's horde, so a rung that pins its mob level lets a returning
  player spend exactly the gap he has opened; both the meter and the ratchet
  floor are clamped to `menaceCeiling`). The transient
  gain is scaled by `menaceSensitivity` — the difficulty's `menaceMult`
  times an early-game `menaceWarmup` — but the ratchet is deliberately
  difficulty-blind (warmup-damped only, up to the cap): every rung keeps
  evolving; every step is the same size — one mob LEVEL — and what the
  difficulty sets is its peak (`menaceStageCap`), not whether it happens.
  The `menaceStage` lures a denser horde (`lureMult`, read by
  the wave spawner, its crowd growth alone capped at `lureStageCap`),
  evolves freshly-spawned minions (`evolutionLevelBonus`, stamped in
  `create.ts`'s `spawnEnemy` — ONE LEVEL over their normal level per stage,
  which is the whole of it: `Enemy.mlvl` already drives hp, contact damage,
  kill xp and every loot gate, so a rampage's crop is tougher AND richer),
  and power-matches elites/bosses when
  they engage (`enemyPowerScale`/`maybePowerScale`, called from both
  `step/` wake and `loot.ts` first-hit). POWERUP output — the screen-nuke
  bomb, fire orbs, and storm cell — is exempt from all of this: `hitEnemy`'s
  `noMenace` flag books its damage/kills into `state.menaceExemptDamage` /
  `menaceExemptKills` (so `step/` nets them out of the rolling DPS/kill-rate
  `tickMenace` reads) and makes `killEnemy` skip `bankOverkill` entirely, so a
  consumable clearing the screen never jolts, lures, or ratchets — menace
  answers only the hero's own weapon. Separately from that moment-to-moment
  heat, the hero's POWER LEVEL (`heroPowerLevel`) is simply his CHARACTER
  level: neither his gear rack nor his weapon damage toughens the horde any
  more, so out-gearing the campaign makes the fights easier (as it should)
  and the menace EVOLUTION ratchet — not an hp match — answers a steamrolling
  build. (`heroGearLevel`/`heroDamageLevel` survive only as `engine/sim` analytic
  readouts.) The character level gives every minion a non-decaying toughness
  floor at spawn (`mobLevelScale`, folded into `spawnEnemy`'s hp mult) plus a
  per-mob random level BAND (`MENACE.mobLevelBand`, −3…+2 stacked on the
  difficulty offset, so a wave is a mix of levels), and richer drops
  (`mobLevelTierBonus`), so a levelled hero keeps meeting a proportionally
  sturdier, better-paying horde. Kill XP is LEVEL-based (`mobLevelXp` off the
  mob's `mlvl`, NOT its hp — a tank and a squishy of the same level pay
  alike), times a rare/unique mob's `xpMult`; elites/bosses instead pay a
  share of the hero's current level bar. LOOT keys to the mob's level too: a
  plain minion's chance at a NAMED tier (unique+) is cut to a sliver
  (`LOOT.minionNamedMult`), while rare/unique/elite/boss kills carry the
  set-piece rarity bonus, so the special fights — not trash farming — are the
  chase-gear source. The kill side pays by the same honesty:
  `overkillEfficiency` scales a kill's xp AND its drop roll by
  `maxHp / damage` once the blow exceeds the full bar (2× the bar → half,
  3× → a third), so farming mobs far beneath you is deliberately
  unrewarding. The minion hp floor multiplies by `autoPowerScale`
  (leveling.ts) — the free per-level stat gains cancel out against the crowd,
  so only chosen points, gear, and skill pull ahead.
- **`engine/game/tuning.ts`** — runtime BALANCE TUNING: ~10 developer
  multipliers over the shipped config (XP gain, hero/mob damage, mob hp,
  stamina drain, horde size, drop rate, gear share/quality, unique drops,
  menace gain),
  each applied at the one read site that owns its rule so the knob moves
  every surface of the rule together. Neutral (all 1) by default and
  clamped on the way in (`setBalanceTuning`); the app persists the values
  with the settings and applies them on load, and the hidden DEVELOPER →
  BALANCE menu cycles them at runtime.
- **`engine/game/hazards.ts`** — environmental hazards, both pure level data:
  **gravity wells** (`LevelDef.wells`, config `WELLS`) drag the grounded
  player/enemies toward their core — minions are devoured there
  (`wellSwallowed`: no kill, no XP, no loot, so a hole can't be farmed), and
  the grounded hero dragged into the core is devoured too (`wellDeath`:
  instant death). Loose loot is pulled from a wider reach (`WELLS.lootRadius`,
  about a screen away, eased so it crawls at the edge and quickens toward the
  core) and parks on the rim — a hoard the player can dare the deadly core
  for. A jump no longer clears the pull — airborne the hero still drifts
  toward the core and the hole's gravity fights his hop, so he jumps less high
  over the horizon (`WELLS.airPullFraction`/`jumpGravity`), though he floats
  above the core. The level map pins every well (`map_well`) so its road's
  hazards read at a glance — and the **meteor strikes**
  (`LevelDef.asteroids`, config `ASTEROIDS`; MOON, THE RIFT): rocks fall out of
  the sky on a slant onto a patch near the hero, telegraphed by a firming
  ground shadow, then DETONATE (`asteroidImpact`) — an AoE that vaporizes
  minions in the lethal core (`asteroidKill`, an environmental kill with no XP,
  loot or menace, like a well swallow), FLINGS everything else the shockwave
  touches — surviving minions, elites, and the grounded hero — outward to the
  sides (a decaying knockback impulse, `stepKnockback`; a boss plants its
  feet), bites the hero by how near the centre he stood
  (`DifficultyDef.asteroidDamageFrac`, distance-scaled; a jump at impact clears
  it), and leaves a fading **crater** (`Crater`; the surface's own scar
  sprites, `asteroids.craterSprites`) — and the **sand storms**
  (`LevelDef.sandstorms`, config `SANDSTORMS`; MARS): small animated dust
  gusts spawned the same way that drift across the player SLOW enough to walk
  clear of, shove minions aside, and — catching the grounded hero — strike him
  once for a difficulty-scaled bite (`DifficultyDef.sandstormDamageFrac`) AND
  KNOCK HIM OUT (`sandstormHit`; `Player.knockoutMs`): he drops prone and
  helpless (no move/attack/item — every player pass is gated on the timer)
  for `SANDSTORMS.knockoutMs` while the storm passes over him, fades, and
  vanishes; he gets up on `knockoutRecovered`. Related:
  **apparitions** (`EnemyDef.apparition`, config `APPARITION`) are
  dialogue-only figures the combat/hazard paths all skip — they rush in to
  speak like any elite, then walk off and dissolve (`apparitionVanished`).
- **`engine/game/story.ts`** — the story systems: dialogue lifecycle
  (`wantsDialogue`/`startEnemyDialogue` inside the step,
  `advanceDialogue` as the player's tap, `muteDialogue` for the overlay's
  MUTE button — it latches `dialogueMuted`, silencing every in-world scene
  for the rest of the level (a fresh level un-mutes). The DISPLAY-settings
  toggles ride the same rails: `setDialogueEnabled(false)` starts every fresh
  run muted (create.ts) — which now also skips the hero's own black-screen
  monologues, opening on the level-name `title` card instead of the `intro`
  box and dropping straight to the `victory` splash instead of the `outro`
  epilogue — and `setCutscenesEnabled(false)` drops the prelude cutscenes at
  level build so a run opens straight on the intro (or, with dialogue muted
  too, straight on the title card). `dialogueContent` for the
  renderer — one `DialogueVoice` per page, whose `hero` flag marks the pages
  the HERO speaks in a two-way arrival scene, authored as `{ hero: [...] }`
  entries in
  `EnemyDef.dialogue`), story-item collection, and `stepDoors` (a carried key
  removes its door's obstacle chain). Dialogue freezes the run in the
  `dialogue` phase exactly like the level-up chooser. An elite/boss
  ARRIVAL scene additionally lends the stage to the bag
  (`canOpenInventory` in items.ts): `openInventory` works mid-scene so
  the player can equip a fitting weapon for the fight, and
  `closeInventory` hands the stage back to the speaker on the same page;
  every other scene (last words, thoughts, lore) stays read-only. The PAUSE
  MENU is lent the stage by EVERY dialogue (`canPauseGame` in items/flow.ts):
  a speech runs for as many pages as it was written for, so ESCAPE raises the
  menu over the speaker rather than doing nothing, and RESUME hands the scene
  back on the page — and the character — it was holding. The crawl itself is
  held while any screen covers it (`useTypewriter`'s `paused`), so no line is
  printed to a stage nobody can see.
- **`engine/game/arrivals.ts`** — THE STAFF LOT, and the way into GOODCO. A level
  with `LevelDef.arrivals` on it rolls a car onto its arrival district
  (`MapArea.arrivals`) every so often; the car parks and becomes furniture,
  somebody gets out and walks the footpath to the ENTRANCE, and BADGES IN. That
  entrance is a keyed door no story item in the game unlocks, so following one
  through is not the fastest way in, it is the only one — which turns "get inside
  GOODCO" from walking at a wall until it opens into watching where the night
  shift goes. It BORROWS THE CAR WHOLE, exactly as the drive below does: a real
  `CarVehicle` through `createCar`/`integrateCarBody`, kept out of
  `state.vehicles` because everything in that list is a machine a hero may climb
  into. The lot's geometry is worked out ONCE, from the finished carve
  (`ArrivalPlan` — the lane a car can actually be driven down, the rank, the
  doorway), and nothing here draws on `state.rng`: the whole beat is
  presentation, and a draw spent on presentation shifts every loot roll after
  it. The autopilot has its own rung for it (`bot/entrance.ts`), because a bot
  that did not know the door was coming pressed the wall the objective was
  behind for the rest of the run.
- **`engine/game/drive/`** — THE DRIVE: the playable leg between the garage and
  GOODCO, and the same road home. **Not a level and not a `GamePhase`** — a
  drive is its own small world (one car, four lanes, a minute of road) with its
  own seeded rng, its own clock and no `GameState` anywhere near it, because a
  minigame that borrowed the run's state would inherit the spawner, the menace
  meter, the objective check and the autopilot and every one of them would have
  to be taught to sit it out. It BORROWS the car whole, though: the same
  `CarVehicle` the garage parks, through the same `integrateCarBody`,
  `nudgeCar` and panel/fix ladders (`vehicles.ts`), so the wagon on the road is
  the wagon in the bay. `impact.ts` is the heart of it — a real inelastic
  collision in real units, where the SWEEP of the car's flank decides whether a
  body was hit and how hard it is thrown, and the contact normal's alignment
  with the nose decides how much speed and damage the car takes back. The
  street around it is a street: pavements the crowd genuinely stands on
  (`crowdEdges`, wider than the car's own `roadEdges`), painted crossings on a
  fixed pitch that half the crowd is gathered onto (`crossingsBetween`), a town
  on one building line, and a KERB the wagon can actually hit — the lamp posts
  and parked cars of `street.ts`, derived from a hash of their own slot (no rng
  draw, the same street both ways) and materialized into `DriveState.props` as
  the road unrolls. Everybody on it, shunted traffic included, is held to those
  edges. A parked car costs far more than the van you were tailgating, because
  the collision is solved on the SWEEP and a stopped car is met at the hero's
  whole speed — and it STOPS BEING FURNITURE the moment it is touched
  (`unparkCar`), joining the traffic as a `driverless` vehicle so it folds,
  spins and rolls exactly as the road's own cars do — a `DriveProp` has no
  velocity, no crush, no yaw and nothing to roll, so a struck one could only
  ever be shifted sideways. A lamp
  post shears off its base, cartwheels down the road and takes a slice of the
  car with it — keeping the picture it was STANDING in (looked up from the foot
  it left behind, never from the flying half's own moving position) and wearing
  its derived lights-out grid, so it reads as one column breaking rather than as
  a substitution. And the auto-driver reads the furniture like everything else,
  or it settles in the gutter and grinds itself to a halt on the emptiest-looking
  line on the road.
  WHAT IS ON THE ROAD is a CATALOG rather than a variant index — `fleet.ts`,
  twenty-two vehicles each carrying its own mass, collision extent, speed band,
  spawn weight and passenger list. It has to be, because the whole minigame is a
  momentum sum and mass is its only real input: a twelve-tonne bus that answered
  a bumper the way a thirty-kilo bicycle does is the physics being told a lie.
  Everything else falls out of that one table. A vehicle keeps its OWN damage
  (`DriveTraffic.wear`) on the same absorbed-energy currency the hero's car
  does, scaled by its own mass — so the same blow writes off a moped, folds a
  hatchback and barely marks a bus — climbing three visible rungs and then dying
  in the lane it was driving in, which leaves an obstacle nobody placed. And an
  `open` vehicle (a motorcycle, a moped, a bicycle, a board — anything with
  somebody riding it in the weather) is not shunted at all: it goes DOWN, and
  past `snapForce` it stops being a vehicle and becomes two large halves of its
  own picture — with a second line past that (`obliterateForce`) where the
  halves are joined by a cloud of the machine's own steel. The delivery trade
  rides the PAVEMENT and weaves across the kerb, which is the one change that
  alters the shape of the minigame rather than its furniture — the gutter used
  to be the safe line.
  SOMEBODY IS DRIVING EVERY ONE OF THEM (`ai.ts`), or a four-lane road is four
  conveyor belts — a vehicle born on a lane centre with a speed and holding both
  until something hits it, which leaves a clear lane clear and reduces the whole
  minigame to finding the empty belt once. Five
  behaviours, and each is something the car in front of you really does: it
  WOBBLES, it FOLLOWS (imperfectly, on purpose — past its own reaction the gap is
  simply gone), it PULLS OUT for somebody slower, it GOES ROUND anything stopped
  in its lane (a parked car, a wreck) with a lean into the neighbouring lane
  rather than a lane change, and on the gentle rungs it LIFTS OFF for the car
  drawing level with it. Who is at the wheel is a TEMPER rolled per vehicle —
  most people do roughly the limit, some dawdle, some are late, and about one in
  twenty-five should not have a licence — because a road where everybody moves at
  one speed has nothing for a lane change to be FOR. And now and then somebody is
  being CHASED: a runner and one or two police cars with their blue lights on,
  which is not a new kind of traffic at all but three ordinary vehicles with
  their `urgency` wound right up. It never touches the road's dice — every
  decision is read off the state and every wobble derived from the vehicle's own
  phase, so a seeded road is still a seeded road.
  AND THEY HIT EACH OTHER (`between.ts`), which is the road's second collision
  pass and the only one the hero is not a party to. Traffic with drivers is
  traffic with drivers who get it wrong, and without this every one of those
  resolves by two vehicles sliding through each other — which reads as the road
  being a painting, and takes the best thing about a busy carriageway away from
  the player, which is that it can go wrong WITHOUT HIM. It is the same momentum
  sum between two masses that both matter, and it hands its answer to the SAME
  breaking model the hero's blows go through, so a car written off by a lorry
  folds, sheds, empties and stands dead in its lane exactly as one written off by
  the wagon does. Two rules carry it: the pair are immune to EACH OTHER for a
  moment and to nobody else (`crashCooldownMs`, a second clock — spent on the
  hero's own latch it would mean driving clean through the crash you were braking
  for), and nothing is ever RETIRED here, because a pile-up left in the road is
  the entire point.
  HOW MUCH OF A VEHICLE CAN MEET ANOTHER VEHICLE is `impact.bodyBandFrac`, and it
  is the one place the picture and the model have to be told apart. A car's
  sprite is drawn standing UP the screen — tyres at its own y, roof line most of
  a lane above it — while the axis that sprite stands up is the same axis the
  lanes are laid across, so two cars whose bodywork could not possibly touch look
  as though they are scraping down each other's flank. Only the bottom of a body
  is on the ground at all: from the tyres up to about the waistline is the part
  that occupies ROAD, and the contact test uses that share of the pair's own
  extents. Vehicles only — a person is a tall thin thing met by the whole flank
  at any height, and a lamp post is a column from the pavement to well above the
  roof.
  THE LEG IS OUTSKIRT-TOWN-OUTSKIRT-SITE, AND THE SHAPE IS A MIRROR, because the
  road is driven BOTH WAYS and a road that only reads right one way round is half
  a road. The town is bracketed by `cityStartPx` of empty road at each end
  (`cityEndPx` is the far one), so the stretch one leg OPENS over — the wagon
  sliding into frame, the two lines said to nobody, the town arriving in front of
  the player — is the stretch the other leg FINISHES on. The clock stops at the
  far gate rather than at the finish (`cityEnd`), because the run-out is road the
  player still drives and nobody races. Past the finish is the RUN-IN, and what
  stands there is the destination's own SITE (`engine/game/drive/sites.ts`): a
  layout table anchored at the finish, placed and drawn by one planner, so
  GOODCO's palisade-and-launch-stack and the hero's own picket-fence-and-bungalow
  are two rows of data rather than two code paths. A third destination is one
  more layout beside `campus.ts` and `homestead.ts` and one more line in
  `DRIVE_SITES`.
  THE APPROACH IS A COUNTDOWN. The ten seconds before the town are held: the
  speed is the road's own and the pedal reaches nothing. Its last beats are the
  road's own picture — the carriageway opens out from two lanes to four
  (`opening.widenPx`) and GET READY goes up with the taper (`driveReadyUp`),
  then one second out the WHEEL is handed back and the dashboard slides in from
  the left (`driveHandsOff` / `driveSteerOnly` / `opening.dashAtPx`). The pedal
  arrives with the clock and not a frame before it, so the gate is a starting
  flag rather than a line the player crosses without noticing. Its length is a
  DISTANCE at a held speed (`opening.cityPx` at `entrySpeedPx`), which is why the
  approach is retimed by moving one number — and `coursePx` moves with it, so the
  LEG changes length and the minigame does not: the town, which is the stretch
  the clock runs over and the board ranks, is what it has always been. WHAT SETS
  THE NUMBER is the hero's two lines: he starts as the wagon settles into frame
  (`opening.sayAtPx`) and has to be finished by the hand-over, so the approach is
  the sum of the slide-in, both pages of speech and the hand-over's own second.
  The pages are sized in the app off their own crawl (`drive-screen/bark.ts`) and
  `tests/drive_bark_test.ts` holds the two halves against each other.
  WHAT A COLLISION DOES TO THE THING IT HIT is `crush.ts`, and it is four
  answers rather than one — a lone sideways shunt makes a head-on and a nudge
  read as the same thing at two speeds. It FOLDS (a crumple zone eats
  energy over a distance, so the depth an end loses is the absorbed energy over
  the force that structure holds with, which goes with its mass — and the fold
  is kept per END, so a rear-ended car is short at the back and straight at the
  front); its GLASS goes, at a fraction of the energy the body needs to bend; it
  SPINS, because an impulse that misses the centre of mass is a torque and the
  contact point is already solved; it is PUNTED bodily up the road, which is
  `impulse / massKg` and the single biggest reason weight is now legible; and
  past a lateral Δv its own shape cannot hold (`DriveVehicleDef.topHeavy`) it
  goes OVER — a rolling estate reusing the same ballistics a dropped bicycle
  always did. A sideswipe is no longer free either: `solveImpact` absorbs a
  share of the TANGENTIAL energy for anything with bodywork
  (`impact.scrapeFriction`), because two cars grinding down each other's flanks
  at 120 booking exactly zero joules was the model's one silent hole.
  EVERY ONE OF THOSE IS A SPEED RATHER THAN A PLACEMENT, which is the other half
  of making a collision read: an instantaneous hop sideways snaps most of a lane
  across a car rear-ended dead square, where the answer is entirely along the
  road. Keeping the pair apart is `shuntImmuneMs`'s job, so the
  separation is a floor on the lateral SPEED (`separationPx`) and the vehicle
  drives itself clear over the following tenth of a second.
  WHO LEAVES A VEHICLE, AND HOW, is `eject.ts`, and it is two populations rather
  than one. A RIDER sits in the open on something lighter than they are: nothing
  holds them on, so any real contact takes them off it, and the only question is
  how far they go. An OCCUPANT is belted into a steel box with exactly one way
  out, so it takes a SQUARE blow rather than merely a hard one — which is the
  single condition that makes the sight legible instead of random, and a player
  learns inside three collisions that hitting a car head-on empties it and that
  clipping the same car does not. HOW MANY there are to leave is a RANGE on the
  def rolled per vehicle (`rollOccupants`), biased hard toward one, because
  nearly everybody on this road is alone in the car — a full estate exists, is
  genuinely worse to hit, and is rare enough to read as that car rather than as
  what estates are. A BUS is the exception at both ends: it is never one person,
  and its long band of square windows posts several of them out at once
  (`DriveVehicleDef.exits`) where a saloon's one windscreen posts two, which is
  what makes twelve and a half tonnes of it the biggest mess the minigame can
  make. But squareness decides HOW somebody leaves,
  never WHETHER they survived: past `eject.killForce` the ones the geometry will
  not post through the screen die where they sit, which the road shows the only
  way it can — blood on the windows (`DriveTraffic.gore`, the derived
  `<sprite>_gore` overlay). Either way what leaves becomes an ordinary
  `DrivePedestrian` of `kind: "rider"`, so it is counted, caught by the wheels,
  bled onto the tarmac and cut out of its own art by every system already on the
  road, none of which had to learn that riders exist.
  WHAT IT LEAVES OF SOMEBODY is the road's own body physics, and it is SIM
  rather than presentation for one reason: a car is not a blow. A sword opens a
  body in an instant and the pieces are down again inside a second, which a
  renderer can own by itself; a four-metre surface travelling at 53 m/s goes
  THROUGH a body, CARRIES what it caught, LAYS it back down somewhere else, and
  then drives over what it laid down — and every one of those is a fact about
  where a thing IS. So `remains.ts` holds the pieces (`DriveRemain`: an upper
  half thrown over the roof with less along-road speed than the car, so the
  wagon passes underneath it; a lower half caught and dragged; the lumps torn
  off on the way past; and the STEEL ones — a piece of machine, or half of one
  — which travel on the same physics and differ only in what they are made of).
  Two quite separate things take a body in two out there and only the first is a
  question about the BLOW: the BUMPER goes through somebody past
  `DRIVE.gore.splitJoules` (about sixty), and the WHEELS cut whatever they find
  lying in the road at any speed they are turning at (`severUnderWheel`) — which
  is what a slower collision leaves behind, and the reason a knocked-down body is
  not caught under the car at all. `blockade.ts` supplies most of their customers — THE
  GLUED, twenty demonstrators sitting across every lane at one point in the
  course, the one thing on this road that does not move and cannot be driven
  around. The crowd itself carries the leg's other words: forty THOUGHTS
  (`CROWD_THOUGHTS`, dealt from a per-trip deck in `crowd.ts` so no line ever
  plays twice), floated over a walker's head for well under a second each and
  written to be missed — the words are the app's (`drive-screen/placards.ts`),
  which is also where the shout-versus-thought difference lives. What any of it is MADE of is still the app's
  (`drive-screen/drive-gore.ts`), which cuts the victim's OWN sprite at the
  bumper's line with the run's own `slicedPiece` and lays the marks the road
  keeps: the splash, the drag smear, the paste under a wheel, and the tread
  prints the tyres carry out onto clean tarmac — a CARRY that runs out, exactly
  as the hero's bootprints are. Both gore-page switches ride in on
  `DriveParams` (`gib` for the lumps torn off, `split` for the bumper going
  through somebody), asked once by `driveParamsFor` and fixed for the whole
  road. The one mark on that tarmac the DRIVER makes rather than a body is
  `drive-screen/skid.ts` — the two black lines a handbrake stop scrubs off the
  back axle, laid by ground covered like every trail in this game and drawn under
  everything standing on the road, with the tyre smoke going the other way,
  through the effect layer. Its presentation lives beside it — `drive-screen/drive-fx.ts` (sparks, grit,
  shards, the wreck's smoke, the burning rubber, and a camera that moves only when
  something is actually struck; every effect is anchored to the ROAD and left
  behind except the HERO's own dead engine, whose column rides the car it came
  out of) and
  `sfx/drive.ts` (the geared engine note, made of grains on a quickening
  cadence) — with what a tick OWES those two lifted into
  `drive-screen/loop.ts` (`drainDrive`, `drawBursts`, `runEngineNote`), because
  the effects gallery's DRIVE shelf is a second host that has to drain a road
  exactly as the screen does. **A CRASHED CAR'S OWN CLOUD is the one pass in
  here that WALKS the road rather than answering an event** —
  `drive-screen/wreck-smoke.ts`, drained beside the skids and on the same fixed
  step. A vehicle that has gone over is not an instant: it slides, it stops, and
  then it sits there for the rest of the leg, so its smoke is ISSUED on a cadence
  at wherever the thing currently is (a wall of dust while it grinds, a pall
  piling up around it once it has stopped, a dead engine's wisp after that)
  rather than fired once at the spot the roll began, which is a cloud the wreck
  slides out from under. It is also where a STRANGER's wrecked engine smokes —
  a column of its own rather than the hero's following one, or every car the
  player finishes burns over the player's own bonnet. The whole frame is drawn INSIDE
  `applyWorldProjection`, because that is the space `drawWorldSprite`
  billboards into. **THERE IS NO BULLET TIME** and there must not be: a
  slow-motion beat is for a moment the player might still act on, and on a road
  laid this thick an unavoidable hit is always a second or two away — dilating
  for one interrupts the DRIVING several times a leg, and the tension here is
  the wheel and the speed. What he MAKES of the trip is not said on the road at all: `driveVerdict`
  reads the whole journey and hands the arriving run one line
  (`RunParams.arrivalThought`), spoken as the last page of the destination's
  opening monologue.
  WHAT THE CABINET MAKES OF IT is the road's OTHER end-of-trip reading, and the
  two are deliberately twins: `driveScore` (`drive/score.ts`) reads the same five
  numbers and answers with an arcade SCORE, which the arrival raises a Frogger
  board over (`drive-screen/DriveScores.tsx`) — five rows, the row you just took
  highlighted, and three letters to sign it with. It PAYS FOR THE COMMUTE and
  NOTHING FOR A PERSON: arriving, the clock against a par derived from the
  course, the top end, and the paint still on the car, less somebody else's lamp
  posts and somebody else's wings — with the body count printed on the card at a
  value of exactly zero, which is the road's own joke stated as arithmetic
  (`DRIVE.score`). The board is device-local (`pwa/src/game/drive-scores.ts`,
  carried by cloud save beside the campaign board) and is never raised for an
  AUTO-DRIVEN leg: a screen waiting on a keypress would park the attract loop
  forever, and a board full of the demo's initials is not a high-score table. Damage
  goes as the square of the closing speed, which is the whole difficulty curve
  in one line. The RUN'S RUNG rides in on `DriveParams.difficulty`
  (`DifficultyDef.drive`) and turns THREE things, all of them priced in that one
  line: what the road WEIGHS (`impactMasses`) — so a body met square at the top
  of the dial costs a MEDIUM driver about an eighth of his speed and a JESUS
  driver a third of it, and does proportionally more to the car, both out of the
  same momentum sum; HOW MUCH OTHER TRAFFIC there is (`trafficDensity`, dividing
  `DRIVE.laneTraffic` — and the ONCOMING lanes are laid twice as thin as the
  hero's own on every rung, because they close at the SUM of both speeds and are
  in shot for a second and a half); and HOW FAST THE WAGON MAY GO
  (`rungTopSpeedPx` — 120 mph on EASY climbing to the car's own 174 at the top,
  which halves the energy of every collision on the gentle rungs and buys half
  again as long to read the crowd). The COURSE and the CROWD are identical on
  every rung, and so is the world's scale: the cap is a ceiling on the throttle,
  not a change to `DRIVE_UNITS.mPerPx`, so 120 mph means 120 miles an hour
  wherever it is read.
  THE CROWD CARRIES ITS OWN SHARE OF THE VOLUME KNOB on top of that
  (`DRIVE.impact.crowdSpeedLossScale`), because a momentum transfer saturates
  against the wagon's own 1600 kg and one scale cannot price both a person and a
  bus: without it a body was arithmetically correct and, at the pace this leg is
  driven, unnoticeable. The same split runs through the picture — the frame's
  shove is measured against the worst thing that can happen to a BODY rather
  than against the collision that totals the car (`BODY_FULL_SHARE`,
  `drive-fx.ts`) — and through the wagon's own springs, which are shoved by the
  speed it LOST rather than by the wear the blow dealt. The app half is
  `pwa/src/game/drive-screen/`; whether the road is played at all is
  `driveParamsFor` (the MINIGAMES setting, and never in a party — one seat, no
  loot, no XP).
  THE ROAD HAS A SECOND DOOR: the ARCADE SHELF (`pwa/src/game/minigames.ts`,
  the main menu's MINIGAMES screen, mounted by `MinigameScreen.tsx`), which
  plays the same leg on its own for the board. It is what BEATING the game
  buys — a cabinet appears once a hero on the roster has beaten a whole
  campaign, and the rungs it may be driven on are exactly the rungs that has
  been done on (`Character.beaten`, so nothing new is stored and the shelf
  rides cloud save for free). None of `driveParamsFor`'s four gates applies
  there (`arcadeDriveParams`): there is no crossing waiting, no party, nobody
  but the player at the wheel, and the setting is a decision about the trip to
  work rather than a padlock on a cabinet. The developer tree carries the same
  shelf with its lock off — DEVELOPER → PLAYGROUND → MINIGAMES, every cabinet
  on every rung.
  A CABINET MAY ALSO OFFER VARIANTS — a second knob beside the rung, and the
  shelf's DIRECTION row. They are the CABINET's own vocabulary rather than a
  shared ladder (a difficulty means the same thing on every machine and a
  variant does not), so the shelf keeps ONE pick and every cabinet resolves it
  against its own list with a fallback to its own default (`pickVariant`) — a
  machine that has never heard of the stored id plays its first variant rather
  than refusing to start. The ROAD's two are its two ends, and each variant's id
  is the LEVEL the leg is bound for, which is exactly what `DriveParams.to`
  carries: the shelf never learns that a road has a direction at all.
  HOW THE ROAD OPENS is three moves that read as one. The bumper touches the
  garage's `driveOut` tarmac, the run's picture DIMS over a car that is simply
  coasting (`DEPARTURE`, `engine/game/vehicles.ts` — half a second, no synthetic
  driver, no aim; a car driving itself away was a cutscene about the exact
  activity the player was a half-second from doing), and the drive mounts into
  that same black behind a TITLE CARD — "ROAD TO GOODCO" or "ROAD TO HOME",
  `drive-screen/DriveIntro.tsx`, which HOLDS the road while it is up (the fixed
  step breaks on it, exactly as it does on the pause card and the board) so the
  leg's first crowd is not walked into during a title. A tap or any key takes
  it, and an `auto` road never raises it at all — the attract loop and every
  shot recipe want the road in their first frame. **The road answers the run's own binds itself**, because while a
  drive is up the run's control layer is not listening (there is no live
  `GameState` under an interlude for it to be built around): PAUSE (and ESCAPE,
  whatever the bind says), SCREENSHOT, and the auto-pause a LOST WINDOW is —
  alt-tab, a tab switch, a phone's app switcher — which also drops every held
  control, since a key the browser never delivered the `keyup` for is a wagon
  that resumes at full throttle a minute later. An `auto` road (the attract
  loop, a playtest, a shot recipe) is exempt from that last one: nothing would
  ever lift the card again. `drive/driver.ts` is the AUTO-DRIVER — the hands on the wheel
  when nobody's are: the title-screen demo, a `?bot=` playtest, `?drive&bot=1`
  in the workbench, and `make drive-bench`, which plays N seeds a rung and
  reports arrival rate, trip time, bodies and ending wear. It lives in the
  engine rather than the screen for the same two reasons everything else here
  does — the probes that want it are headless, and a road that steered
  differently on the second run would take determinism down with it — so it
  spends no `drive.rng()` draw, reads the road ACROSS rather than by lane (to
  find the gap two bodies leave between them) and nurses a bent wagon home
  instead of trying to win a leg it has already lost. Its knobs are the `drive:`
  block of `content/bot.yaml`, beside the run autopilot's. The demo drives the
  same road with the finish brought forward (`DriveParams.coursePx`), because a
  minute is a long time in an attract loop.
- **`engine/game/hero-name.ts`** — THE HERO'S OWN NAME, as authored text asks for
  it. The player names their character, and `{HERO}` is where a line means that
  name: over his own pages in every box that speaks, and inside the handful of
  lines whose speaker actually knows him. An import-free leaf, because the
  engine's dialogue path, the app's four text overlays and the library's page
  writer all resolve it. It is deliberately NOT engine state — a name changes
  no tick, so it is neither a `RunParams` field nor anything on the wire, and
  each viewer resolves it against the hero THEY are playing (which is the only
  answer that works in a party). `docs/game-content.md` has the authoring rule.
- **`engine/game/companions.ts`** — the COMPANION system and the SPARE-or-KILL
  verdict (config `COMPANIONS`): a spareable unique (`EnemyDef.spareable`)
  beaten to 0 hp kneels and pauses the run in the `choice` phase (the
  interception lives in `hitEnemy`); `resolveChoice` lands the call — KILL
  books the withheld blow through `killEnemy`, SPARE recruits the figure as
  a party companion (`recruitCompanion`, its `joinWords` scene via story.ts).
  `stepCompanions` (right after the enemy pass) walks the party's formation,
  picks fights inside the hero's engagement bubble _when he holds still_,
  strikes/shoots on the weapon's cadence (shots ride the ordinary projectile
  pass, tagged `companionId` for kill-quote attribution and XP credit), soaks
  the horde's contact swings against helmet+chest armor, and beats companions
  DOWN — never dead — until they stand back up on their own. Staying with the
  hero comes first: while he moves the party keeps formation rather than peeling
  off after a mob, and a companion he outruns to the camera's edge
  (`input.view`, `COMPANIONS.screenEdgeMargin`) latches into FOLLOW mode —
  dropping the fight to move with him until he stops. Companion auras
  (`CompanionDef.aura` — LUCKY's +50% magic find, read by items.ts
  `magicFindBonus` inside every tier roll) go silent while downed, and a
  `CompanionDef.nova` (RASPUTIN's FROST NOVA — `companionNova`) pulses a
  chilling ring on a cadence that damages and slows nearby foes (the frost
  `chillMs`/`chillFactor` read live in `moveEnemy`).
  **Companions LEVEL UP on their own** (`companion-stats.ts`): a companion earns
  its OWN levels from its OWN kills (credited on the `companionId` tag in
  `killEnemy`), decoupled from the hero, and its hp/damage and signature `power`
  grow with that level — the level and XP ride the loadout, so the party levels
  up forever across every level and difficulty.
  **THE PARTY IS ONE, AND DOWN IS DOWN** (`COMPANIONS.maxParty`): sparing a
  second spareable RETIRES the incumbent (its borrowed armor goes back to the
  bag, `companionDismissed`), and at 0 hp a companion sets `Companion.downed` —
  a flag NOTHING in the simulation ever clears. No self-revive count, no
  out-of-combat regen, no mercy at the merchant's counter, and the loadout
  carries it (`Loadout.companions[].downed`) so the walk to the next venue is
  not a free revive either. What wakes it is a bottle of SMELLING SALTS bought
  off the stall and USED from the bag (`GearDef.revive` marks the piece so a
  MOD's own works; `reviveTarget`/`spendReviveItem` are the probe and the verb,
  shaped exactly like the travel-gate key beside them), which stands it up at
  `COMPANIONS.saltsHpFraction` back at the hero's side. Filling the bar is the
  hero's own MEDKITS (`healCompanionWithMedkit` / `canHealCompanion`), spent by
  pressing the party portrait. A spared companion's
  enemy twin is also held off the board while it rides the party (create.ts),
  so a replay never pits the hero against his own ally. The UI's
  mutators are `equipCompanionFromInventory` / `unequipCompanionToInventory`
  (weapon/helmet/chest only) and the `companion` pause-phase toggles
  `openCompanionPanel` / `closeCompanionPanel`; the party rides the loadout
  (`Loadout.companions`, with each companion's earned level and XP) between
  levels.
- **`engine/game/map.ts`** — the level map and its fog of war: run-scoped
  exploration as a coarse byte grid on the state (`state.explored`, one cell
  per config `MAP.cellSize` world px), stamped as a `MAP.revealRadius` circle
  around the hero every step (`revealAround`, called from `step()`; the spawn is
  pre-revealed at creation) and queried with `isExplored` — the fog lifts along
  his path (Warcraft-style, no re-fogging), feeding both the minimap and the
  MAIN-VIEW fog of war (`render/fog.ts` `drawFog`): everything uncovered reads
  fully clear, never-explored terrain is solid black, and the frontier between
  them is a graded ordered-dither transition band (`MAP.fogBand` wide) that also
  hides any mob standing in it or the dark beyond. **THE SWEEP IS A SIGHT
  LINE, NOT A DISC**: each cell is tested with `lineOfSight`, so a wall casts a
  shadow and the ground behind it stays dark until the hero stands somewhere it
  is in view — a doorway shows him a cone of the room rather than the room, and
  the horde waiting inside is not drawn (a body appears exactly where the fog
  has lifted). The line stops `MAP.fogWallDepth` SHORT of the cell so the wall's
  own ground comes up seen: stopping it ON the wall would run a fog frontier
  down the inside face of every wall in the level, and a frontier is what the
  band stipples and what `clearOfFog` refuses to target inside of — every mob
  near a wall would go undrawn and unshootable in the room the hero is standing
  in. **ONLY ARCHITECTURE CASTS THE SHADOW**: a LONE obstacle narrow enough to
  cover one unit of ground (`OBSTACLES.loneSightSpan`) does not stop the sweep
  — it takes two obstacles in line, or one wider piece — so a field of
  scattered rocks is not a fan of dark wedges with an unshootable mob hiding in
  each (`lineOfSight`, `engine/game/obstacles.ts`, which is deliberately NOT the
  physical `blockedByObstacle` a body and a bullet ask). **And what is not drawn is
  not shot at**: `clearOfFog` (the sibling **`engine/game/fog.ts`**, which owns the
  sweep too — both are kept out of map.ts because `engine/menu.ts` re-exports
  map.ts's grid arithmetic and so puts that whole module inside the 170 KB
  critical-path budget, and the sweep would drag the collision module in with
  it) is the engine's own deterministic reading of that
  same frontier — no unexplored cell centre within `MAP.fogBand`. A hero who
  fires into the blackness is acting on knowledge the player does not have. It
  deliberately reads OFF-MAP cells as
  clear, unlike the renderer, which seeds them as frontier so a level's rim
  fogs: nothing out past the boundary is undiscovered, and fogging it would
  leave a mob pinned against the level edge untargetable for the rest of the
  run.
- **`engine/game/sight.ts`** — **CAN THIS PLAYER SEE THAT SPOT**, which is the
  question every automatic target pick actually asks, and it has TWO halves:
  `clearOfFog` above, and the EDGE OF THE SCREEN. The fog alone stopped being an
  answer within a minute of play — it never rolls back, so "explored" soon says
  yes to most of the map, and a power reaching 300 world px happily marked a
  monster two screens away on a phone whose landscape viewport is ~422×260 world
  units (the 422×195-px canvas, its depth axis divided by the pitch — see
  `docs/rendering.md`). `visibleTo(state, hero, pos)` runs both, and everything that aims on a
  hero's behalf goes through it: the auto-attack and its crate fallback, the
  conjured powers and granted spells that pick their own mark (storm, volley,
  singularity, the well's hunt), the sentry grid, a weapon proc's fresh pick, the
  companions' engage bubble, and the autopilot's `firingReach`, which shortens a
  stand-off to where its shots can actually land. WHOSE screen is the whole
  question in co-op, so the rect is per-hero (`Player.view`, stamped by `step()`
  from that seat's own `GameInput.view`); `state.view` stays seat 0's and answers
  the questions that only want "a screenful" — the spawner's off-screen summon
  distance and the bot's wall-end sense. A hero nobody reports a camera for
  (engine tests, `simulate --view none`) is not blind: the screen half abstains
  and the fog half still applies. A sibling render-side cull
  drops any enemy the hero has no LINE OF SIGHT to — one tucked fully behind a
  wall — reusing the same `lineOfSight`; a mob only peeking
  out from an edge still draws. Memorable events pin
  `state.mapMarkers` via `addMapMarker` — story-item finds (story.ts),
  unique/legendary pickups (the pickup switch in step/), and elite/boss
  victories including fled uniques (loot.ts). `openMap`/`closeMap` toggle the
  `map` pause phase (frozen sim, level-up priority on close) for the HUD's
  MAP button / the M key.
- **`engine/game/items/gold.ts`** — GOLD, the coin economy's other faucet (config
  `GOLD`): what a body was carrying, shed on the floor when it falls. One funnel
  (`dropGold`, called from `killEnemy`), and three rules. `carriesGold` decides
  WHO pays from what the roster already says — something that walks on `legs`
  and is not a `beast` is a humanoid and has pockets; a rover on treads, a
  haunting that drifts and a rift-thing do not — with `EnemyDef.wealth`
  overriding in both directions. One minion in FIVE pays, so a fight's floor
  stays blood; the size makes up for the rate. And every draw comes off
  `state.goldRng`, a third seeded stream beside `rng` and `fxRng`, so moving
  `GOLD.dropMult` reshuffles no equipment drop — which is what lets the knob be
  calibrated against the OTHER faucet (loot sales) rather than against itself.
  `goldSprite` picks the pile's rung; the app glitters it (`render/gold.ts`).
- **`engine/game/merchant.ts`** — the WANDERING MERCHANT and his coin economy
  (config `MERCHANT` / `ECONOMY`): one trader per level (`state.merchant`,
  minted at creation on his own seeded rng stream — parked as a plain
  `rngState` number so a saved run freezes him losslessly — and never
  drawing the run's stream, so his existence reshuffles no loot roll).
  He wanders until met; the first close encounter (`stepMerchant`, inside
  the step) roots him for good, pins the map (`merchant` marker), rolls his
  stall against the hero's level, emits `merchantDiscovered`, and plays the
  level's greeting scene (`LevelDef.merchant` — sprite, name, and pages;
  the words live in `docs/manuscript.md`). A venue may post him otherwise:
  `parked:` stands him at the carve's counter from the first tick, and
  `beat:` does that and then WALKS him end to end along the strip the map
  carved (districts flagged `beat: true` → `LevelDef.merchantBeat`) — the
  hub's street dealer. A walking counter owes two rules nothing else does:
  `hailMerchant` roots him where a tap landed (cleared by `closeShop`, so
  dismissing the modal puts him back on his beat), and a driven car above
  `CAR.roadkillSpeed` runs him down (`runDownMerchant` in vehicles.ts →
  `killMerchant`, which shuts the stall, drops every open counter, unpins
  the map and emits `merchantKilled`). Nothing about a merchant persists,
  so the next visit mints another one on the same pitch. `merchant.line` is
  what he says ACROSS the counter on every visit — drawn on the shop panel
  rather than through the dialogue box, which is what keeps a greeting the
  player reads constantly from being a toll booth. A level may also list stall
  UNIQUES (`merchant.stockUniques`): named uniques the stall MAY carry,
  each rolled at the standing boss-unique odds when it stocks — the same
  rarity as a unique drop, sold across the counter instead. His ward (`repelFromMerchant`,
  called from the enemy pass) keeps the horde `MERCHANT.repelRadius` off
  the stall — bosses and apparitions excepted. `openShop`/`closeShop`
  toggle the `shop` pause phase (proximity-gated); `sellItem`/`buyStock`
  are the UI's trade mutators — a sale also lands on the trader's BUY-BACK
  shelf (`MERCHANT.buybackSlots`, read with `buybackContents`, undone with
  `buybackItem` for exactly the coins it fetched, and gone with the level's
  merchant) — and `sellValue` is the one valuation every
  price tag reads — item level × tier orders of magnitude × material
  (metal ×2, precious ×4, from the equipment defs). `repairGear` mends the
  whole kit (worn weapon + armor + every breakable bag piece, via
  `repairAll`/`repairAllCost` in items/durability.ts) for coins, priced up by each
  piece's required level, rarity, and make (config `ECONOMY.repair`). Coins
  live on the player and ride the loadout between levels. Once the hero has
  MET a map's trader (persisted per level+difficulty in the character's
  `merchantsMet`, fed back through `createGame`'s `merchantDiscovered`),
  `revealMerchant` sets him up at the door from the first tick of every later
  visit — so a death-and-restart reaches the counter to repair — and he gives
  a per-level + per-difficulty "welcome back" line on approach
  (`LevelDef.merchant.returnGreeting` + `MERCHANT_RETURN_SENDOFF`).
- **`engine/game/items/`** — equipment instances and the player-driven
  mutations the UI calls into, split by concern into submodules behind an
  `index.ts` barrel (the import surface the rest of the engine reads):
  `rolling.ts` (the drop pipeline), `quality.ts` (make quality + naming),
  `derived.ts` (effective stats + pools), `durability.ts` (armor, wear,
  repair), `weapon-math.ts` (damage/reach/cadence/scoring), `combat-stats.ts`
  (crit/dodge/miss/speed), `requirements.ts` (equip gates), `auto-equip.ts`,
  `inventory.ts`, `consumables.ts`, `ammo.ts` (the pouch), `worth.ts`
  (`sellValue`), `mercy.ts`,
  `class-stats.ts`, `stat-points.ts`, `flow.ts` (phase toggles), and the three
  catalog leaves the hit paths read but do not own — `edge.ts` (does this blow
  cut, crush or shred?), `execute.ts` (does it damage a body, or take it?) and
  `burn.ts` (is this weapon FIRE — is there a body left at all?).
  Together they cover: loot rolls, `equipFromInventory` /
  `unequipToInventory` / `moveInventoryItem`, the one-tap bag tools
  (`autoEquipBest` — wear the best wearable piece in every slot at once,
  weapons by the build-aware `weaponScore`; `scrapInferiorLoot` — cull every
  outgrown find the hero can spare, which is `isTrashLoot` rather than the
  looser `isScrappableLoot` the merchant sell-run reads: a WEAPON is spared
  unless it is neither the hero's best of its class (the BACKUP ARSENAL — one
  melee, one ranged, one magic, since a gun runs out of ammunition where a
  blade cannot) nor `LOOT.trashWeaponIlvlMargin` item levels behind the weapon
  in his hand), `allocateStat` (plus the
  respec trio `beginRespec` / `deallocateStat` / `confirmRespec`),
  the derived
  stats (max hp — now STAMINA-scaled, class-aware crit chance
  `playerCritChance` — DEX for physical, INT for magic, LUCK marginal — the
  class-based crit DAMAGE `weaponCritMult` — a flat ×2 physical / ×1.5 magic
  `baseCritMult` deepened by STR on melee and INT on magic (ranged stays flat),
  with a magic single-target crit also bursting a small INT-scaled AoE blob
  (`MAGIC_CRIT`, resolved in `stepMagicCritBlobs`) — the `playerDodgeChance`
  sidestep, weapon damage (STR scales physical harder than
  INT scales magic), STR-taxed move speed, INT-scaled reach
  `weaponRangeFor` — and its honest twin `weaponFiringRange`, that paper reach
  cut down to the distance the weapon's round survives long enough to fly
  (`speed × lifetimeMs`), which is what every AUTOMATIC pick measures against
  (the auto-attack, the bot's stand-off, the character sheet's REACH) so a
  trigger is never pulled at a monster the ammunition cannot reach —,
  swing/fire cadence `weaponCooldownFor` — the weapon's own
  catalog cooldown, quickened by its
  class's attack-speed stat (DEX for melee & ranged, INT for magic; see
  `SPEED_STAT`) — and the swing cone `weaponSweepHalfAngle` that, capped by
  `maxMeleeTargets` (INT raises the cap), makes a swing cleave the nearest few
  monsters it faces), the auto-equip scoring (`weaponScore` DPS /
  `gearScore`) and the crit-inclusive `weaponDps` the item cards lead with,
  the pickup-card upgrade read (`wouldUpgradeSlot`, which scores gear SPEC-aware
  via `specGearScore` — a `+STAT` roll weighted by the hero's own allocation —
  so an off-spec find no longer flashes UPGRADE or offers a tap-to-equip),
  and the durability cycle
  (`wearEquippedWeapon` — a weapon worn to zero is NOT trashed: it falls into
  the bag as a broken, unequippable spare (`isWeaponBroken`) and the best
  wieldable bag weapon takes over, and only with nothing wieldable is the hero
  left with his BARE HANDS (`bareHands` — minted rather than carried, and never
  banked); its twin `swapOffDryWeapon` does the same for a RANGED weapon that
  ran out of AMMUNITION, narrowed to bag weapons the hero can actually fire and
  falling back to the same empty hand — which, eating nothing and breaking
  never, closes that fallback unconditionally, so a bag with nothing loaded in
  it is not the end of the line; `wearWornArmor` — armor spends a point per landed hit
  and a piece at zero goes INACTIVE (`isArmorBroken`), never trashed — and the
  stacked repair kit (`consumeRepairKit` → `repairAll`), banked into the
  consumable dock like a medkit and spent on the player's call to mend the whole
  kit (held weapon, every bag weapon, all worn armor) and re-equip the weapons
  durability booted from the hand in shed order). Worn armor sums
  into a level-scaled physical reduction (`totalArmor`/`armorReduction`,
  config `ARMOR` — the D2/WoW diminishing-returns curve). Every drop is minted with a FROZEN snapshot of its
  catalog def (`Equipment.def`), so a kept item is version-proof: rebalancing
  or deleting a base changes only new drops, never one a player already holds.
  On load the app runs each persisted instance through `adoptEquipment`, which
  parks that snapshot under a synthetic frozen id (`registerFrozenDef`) and
  re-homes the item onto it — so every stat read (`weaponDef`/`gearDef` and
  everything routing through them) resolves the item exactly as it dropped,
  even when its original base is gone. `baseDefId` sees back through the
  re-homing to the item's original base id.
- **`engine/game/bot/index.ts`** — the autopilot: pure strategies
  (`BOT_STRATEGIES` — `idle`, `rush`, `kite`, `boss`, `survivor`, plus the three
  POSTURES `aggro`/`balanced`/`flee`, which are the horde-survival read at three
  aggression levels and are what a `simulate` matrix sweeps) that turn the live
  state into ordinary
  `GameInput`, so a bot can sit anywhere a player does — headless tests,
  the app's `?bot=` autoplay mode, and later an AI-driven second player. The
  macro plan treats the map's ELITES and boss as objectives (rough-cell
  targets it hunts once boss-ready, rushing them when leveled), marches on
  the nearest enemy after a fightless lull (the anti-loiter hunt), and takes
  an externally-pinned GPS nudge via `setBotWaypoint(bot, target)` — a world
  coordinate the bot routes to and tends toward until it arrives. Every decided
  steer passes the TURN RATE LIMIT (`limitTurnRate` in `engine/game/bot/nav.ts`):
  choosing a direction starts a clock, and until it runs out the hero may
  correct, turn, or stop freely but may not turn AROUND — he stands still for the
  wait instead of strobing back and forth between two disagreeing reads (the
  reflex dodges preempt it). A goal no A\* route reaches gets one question asked
  before the sweep gives up on it: **is there a SHUT DOOR in the way that would
  open if he walked up to it** (`doorwayVia` in `engine/game/bot/nav.ts`)? The nav
  grid is built from the obstacle field, so a closed `approach` door — the
  garage's roll-up, every office door on GOODCO's floor — reads as a solid wall
  and the plan came back empty; the bot now walks to the leaf instead, which is
  what a player does, and the door's own obstacle chain vanishes on arrival.
  Its
  positioning is data-tuned: `engine/game/bot/tuning.ts` holds the `BotTuning`
  schema + neutral defaults, and `botTuningFor(levelId)` resolves the
  hand-authored `content/bot.yaml` (a global `default` layer + per-level
  overrides, compiled to `engine/generated/botTuning.ts` by `make levels`, mirroring
  `ladder.yaml`). See the `bot-improvement` skill.
- **`engine/game/bot/economy.ts`** — the autopilot's ECONOMY: the mutating half of
  playing a run, which the pure `botAct` can't do (it only produces
  `GameInput`). The HARNESSES that drive a botted run — the campaign simulator
  (`engine/sim/simulate.ts`) and the app's autoplay driver
  (`pwa/src/game/game-screen/bot-driver.ts`) — call it every tick, after
  `step()`: `botAutoEquip` wears the best banked piece in every armor/jewellery/off-hand
  slot (the bot gears itself up regardless of the human's on-pickup AUTO-EQUIP
  setting, which ships off — and it picks up a find banked while under-leveled
  the moment the hero grows into it), `cullWorstLoot` keeps a bag cell open by
  shedding the LEAST PRECIOUS piece the bag can spare — the outgrown junk
  first, and only then the cheapest KEEPER, ranked by TIER before sell value so
  a unique is never thrown away to make room for a magic — `inventoryNeedsSort`
  orders the bag like the powerup dock, and `tradeAtMerchant` runs the counter
  errand (sell → buy → mend → powerups). The WEAPON slot belongs to the POCKET
  ARSENAL (`engine/game/bot/weapon-swap.ts`, `stepBotWeaponSwap`), so the bot's
  sweep deliberately leaves the hand alone rather than flapping against it.

  **EVERY ONE OF THOSE IS A DECISION PLUS A VERB** (`engine/game/bot/intent.ts`):
  the opinion is the autopilot's and stays under `bot/`, the action is the
  hero's and travels as a run command, so an AUTO PILOT ride whose run is
  simulating in a session server sends its housekeeping instead of writing to a
  replica the next snapshot erases. See docs/multiplayer.md → "The autopilot is
  an intent".

- **`engine/game/bot/hub.ts`** — THE AUTOPILOT AT HOME. A HUB level
  (`objective.type === "hub"` — the garage, or a mod's own town) is the one
  venue whose whole content is PEOPLE AND DOORS: no knot is ever placed, nothing
  is loot, the floor starts `revealed` and the objective never clears, so every
  rung of the macro ladder answered "nothing" and `botAct`'s empty-field branch
  simply stood the hero still — engaging the AUTO PILOT in the garage did
  nothing at all. This module is the last two rungs of the ladder home needs:
  **the COUNTER** (`wantsMerchantVisit` widens at home — the stall is on the way
  to the road, so ANY junk, ANY affordable mend and any shelf the pouch has room
  for earns the walk), then **the CAR** (`enterCar`, and `driveOutInput` steers
  it down the A\* route, through the roll-up and onto the level's `driveOut`
  road, where `vehicles.ts` books the trip). The first rung — **the PEOPLE** —
  is `bot/errands.ts`'s and applies on every map. All of it travels as intents
  like every other autopilot action, through `driveBotErrands` / `runBotErrands`
  — a THIRD half of the tick, called before the other two because a hero reading
  a quest box has a SCREEN up and both of those are gated on him not having one.

  Two rules hold it together. **The press is the errand the walk is on**, never
  what happens to be in reach — the hero spawns sitting on the parking spot, so
  a reach-first ladder drove out on the first tick of every visit. And **the
  counter can never strand the ride**: standing at the stall with a want no
  trade can satisfy is written off after `HUB_SHOP_GIVEUP_MS`, so an unattended
  ride cannot burn its meter in its own driveway.

- **`engine/game/bot/errands.ts`** — THE AUTOPILOT'S QUEST PLAY: it takes work,
  does it, and hands it in. The rule used to be that TAKING an errand was the
  player's decision, so a giver was never a goal and the bot only ever finished
  what a human had already signed up for — which left the autopilot walking past
  the one part of a level with a name on it. Errands are the xp, the coins and
  the chase-tier loot a level pays over its drops, and half of what they ask for
  (`kill`, `collect`) is credited by the clearing that was going to happen
  anyway, so an errand taken ON ARRIVAL costs a walk and one left untaken throws
  the whole payout away. Three reads, in the order the macro ladder asks them:

  - **the PERSON** (`errandGiver`): the nearest reachable giver with a `!` or a
    `?`, COMMITTED until their slate clears and WRITTEN OFF if the march makes
    no headway (`trackErrandAbandon`) — the rung sits high, so a giver a carve
    walled off must never pin a run. `giverTapCommand` presses
    `talkToQuestGiver` only where the macro plan is already walking, and
    `botScreenCommand` (in `hub.ts`, since a screen is nobody's venue) works
    whatever box opens: take the offer, hand the finished errand back, sit
    through the meeting a person owes before their slate opens.
  - **the WORK** (`questObjectiveTarget`): a running errand's outstanding
    objective — a token to fetch, a breed to hunt, a spot to stand on, somebody
    to WALK to a door. Above the caches in the ladder, because an errand is
    directed where a chest is opportunistic.
  - **the TOKENS** (`questTokenWanted`): the pickup `supplies.ts` reaches for
    before anything else on the floor.

  **An escort is a walk, not a hands-off.** The escort follows the nearest hero
  a touch slower than he moves and stops dead past `escortLeashDistance`
  (`quests/escort.ts`), so doing one is two rules — head for the destination,
  turn back when they fall behind — latched with hysteresis so each leg is a
  real leg. Without it, a bot that now ACCEPTS offers would take six escort
  quests a campaign and fail every one.

  **Reachability counts the doors that open for anybody**
  (`reachableThroughDoors`, `bot/nav.ts`): every interior door on GOODCO's floor
  starts shut, so a plain `routeReachable` filter threw away all three of its
  givers on the first tick and the bot cleared the level with three `!` marks
  standing. And **a fight is not a stall**: the abandon gauge refreshes while
  anything is inside the threat ring, or the clock ran out on a march that was
  simply being fought through.

- **`engine/game/bot/weapon-swap.ts`** — THE POCKET ARSENAL: which weapon is in
  the hand, moment by moment. The hero hauls a kit — a boss ROUND, a crowd
  SPRAY, and the spare his own spec would swing (`botPocketKeepIndices`, which
  the cull and the sell-run both spare) — and the fight in front of him picks
  from it, the way a player thumbs the quick-draw switcher. Every candidate is
  priced on one number (`weaponMomentValue`): per-target DPS × the targets THE
  FIELD lets it land on, which folds in RANGE (a weapon that can't reach the
  bodies is worth nothing, and only foes inside its own reach count toward its
  crowd), SHAPE (pellets / a pierce line / chain leaps, or a blade's cone,
  capped by the mass actually standing there), and the BIG BODY (a boss/elite
  close by reads as one target, collapsing the ranking to raw per-shot damage).
  A blade hero still swings the blade whenever a body is in reach — nothing
  out-damages it there — and holds a shot everywhere else and through every
  airborne frame (melee is holstered above `JUMP.dodgeHeight`), including a
  mid-JUMP re-pick when a pack closes. Trading a weapon that is already earning
  its keep needs a clear gain (`SWAP_GAIN_MARGIN`) whenever it GIVES UP REACH,
  because the bot's standoff is derived from the held weapon's range — reaching
  farther is free, reaching less far has to pay for the ground it costs.
- **`engine/game/cache.ts`** — THE CACHE: the chest against the garage's north
  wall, and the one place a piece of gear is KEPT rather than carried.
  `CACHE.maxSlots` cells on the hero (`Player.cache`, private on the wire like
  the bag, riding the `Loadout` so it lands on the character); the FIXTURE is a
  `cache` landmark the carve reserves on the hub alone, so `GameState.cachePos`
  is null everywhere else and every verb refuses. How many of the cells are
  USABLE is `cacheSlots` — a LADDER (`DifficultyDef.cache`: 16 → 24 → 32 → 40 →
  48, a grander piece of furniture with its own name and art each rung, the last
  of them D2's own 8×6 stash) carried as a session parameter off the character's
  own HIGH-WATER MARK, so a gentler run never claws a row back. It is raised
  mid-run by `grantCache` when Ruth's THE SCALE is handed in on a deeper rung
  than the hero already had, which
  also starts the `cacheArriveMs` the app dramatizes as the thing coming into
  being (`pwa/src/game/render/conjure.ts`, over the `cacheGiven` cue). Opening it
  is the stall's own gesture — a tap on the fixture → `openCache` → the hero's
  `cache` screen (`pwa/src/game/CachePanel.tsx`), two grids where one tap moves a
  piece to the other side (`stashItem` / `takeFromCache`, first free cell either
  way, a full destination simply refused). Distinct from the vault below, which
  is a HOLDING PEN the next ride empties: the cache is the player's and nothing
  ever clears it. → `docs/game-content.md` → THE CACHE
- **`engine/game/items/vault.ts`** — THE LOST & FOUND: what the cull shed, held
  for the player to buy back. An unattended ride flies with a bag it cannot
  empty, so on a long flight it must eventually shed something the player would
  have wanted; anything MAGIC or better goes here (config `VAULT.minTier`)
  instead of being destroyed, capped at `VAULT.capacity` with the least
  precious evicted first. `reclaimCost` prices a buy-back by TIER on a steep
  ladder — ≈ ×3 a rung, 10 million coins for a magic find up to 2 billion for
  an artifact — deliberately on the AUTO PILOT meter's scale rather than the
  merchant's pocket change, so a rescue is an event, not housekeeping. The
  vault rides the `Loadout` (so it survives a multi-lap flight's level hops and
  lands on the character), the title screen's LOST & FOUND row opens
  `pwa/src/game/VaultScreen.tsx` to spend the purse on it
  (`characters.ts` `reclaimFromVault` — refused when the purse is short or the
  banked bag is full), and it is a HOLDING PEN, not a second stash: engaging
  the NEXT ride calls `clearVault` and whatever went unbought is trashed for
  good. The screen says so on its face — and so does the ride: picking a speed
  rung while the vault holds anything raises a LAST CALL first
  (`AutopilotTrashConfirm`) naming the count and the best piece, whose BUY BACK
  opens the same browser against the LIVE run (`RunVaultScreen` over the
  engine's `reclaimVaultItem` — the running purse pays, the piece lands in the
  run's own bag), so the offer can still be taken from the screen that is about
  to expire it. Only TRASH & FLY engages.
- **`engine/game/autopilot.ts`** — AUTO PILOT, the coin-metered self-play mode:
  the player engages the engine bot on their own hero from the pause menu and
  pays for the ride in coins per SIMULATED second (`AUTOPILOT.coinsPerSecond` ×
  the speed rung; the offered rungs are `AUTOPILOT.speeds`, 1×–16×, which also
  fast-forward the app's game loop — so a faster ride pays a premium per real
  second). The engine owns the meter: `startAutopilot`/`stopAutopilot`/
  `setAutopilotSpeed` mutate the `GameState.autopilot` block and `stepAutopilot`
  bills inside `step()` (only while `playing`), disengaging with an
  `autopilotStopped` event when the purse runs dry; `creditAutopilotPurse`
  refills it from outside the run (the picker's in-run coin store). Routing between runs is
  `autopilotNextLevel` (a session engaged on an already-cleared level PINS to
  it and farms it forever; otherwise advance the campaign → farm the endgame
  level once the difficulty is beaten; a secret level always returns through
  its own `exitTo` door) plus `autopilotStepUp`: BEATING the campaign RAISES
  THE DIFFICULTY rather than farming the beaten rung's rift forever — the app
  resolves which rung from the unlock graph (`nextDifficultyFor`, progress
  state the engine doesn't hold) and hands it in on the route, and a pinned
  farm or a secret-level detour suppresses it. The step-up moves the whole run,
  so GameScreen owns the LIVE difficulty as state (seeded from its prop) and
  App parks a run at `state.difficulty`.
  The APP performs the travel and the death-restarts (GameScreen's flight
  director), reuses `botAct` for the steering, and shows the session's special
  finds in an upgrade feed (`pwa/src/game/overlays/AutopilotOverlay.tsx`). The
  ride is HARMLESS TO THE BUILD: it captures the hero's chosen spec on engage
  (`captureBuildSnapshot`) and, when it stops, hands every stat/talent point the
  bot spent back as unspent points (`refundAutopilotBuild`, in
  items/stat-points.ts) — the level/xp/gear the ride won are kept, only the spec
  reverts, so paying coins to skip content never decides the build. Those
  handed-back points ride the loadout (`Loadout.pendingStatPoints`) and the run's
  opener/resume reopens the level-up chooser (`promptPendingPoints`,
  `dismissIntro`, `resumeGame`) so the player places them under their own
  control.
- **`engine/game/scenario.ts`** — test scenarios: `applyScenario(state, spec)`
  mutates a fresh run into an exact declared situation (hero position and
  vitals, build, gear, cleared field, silenced waves, spawned mob rings) for
  bug repros, performance probes, and visual checks. Fed by the app's
  `?scenario=` URL param and the engine test suites — a developer tool, not
  a gameplay system (see the `test-scenario` skill and
  `docs/configuration.md`).
- **`engine/lib/`** — generic, game-agnostic helpers (`vec.ts`, `rng.ts`,
  `cutscene.ts` — the deterministic beat-machine cutscene player — and `lua/`,
  the sandboxed VM the scripting seam runs on),
  imported via the `@game/lib/*` alias — the pool a later game keeps as-is
  while the game-specific modules around it are rewritten.
- **`engine/sim/simulate.ts`** — the headless campaign simulator (see the
  `simulate-run` skill): `simulateLevel`/`simulateCampaign` drive the real
  engine — createGame, step, the autopilot, auto-equip, loadout carry —
  through whole levels and whole campaigns at full speed and return typed
  balance reports (hero/mob hp and damage, drops, weapon swaps, deaths, XP
  withheld by the per-map caps). Deliberately NOT exported from
  `engine/index.ts` — the CLI (`scripts/simulate-run.mjs`, via
  `scripts/game-alias-loader.mjs` for the `@game/lib` alias) and the tests
  import it directly, so the public engine API stays what the renderer
  needs.
- **`engine/index.ts`** — the public surface the app imports via `@game/core`.
- **`engine/menu.ts`** — the MENU-side surface, imported via `@game/menu`. See
  below.

#### Two engine entry points

`engine/index.ts` (`@game/core`) is the engine's whole public API, simulation
included. `engine/menu.ts` (`@game/menu`) is a narrow slice of it: the catalogs
(levels, difficulties, equipment), the saved-hero math, and the engine flags
the settings screen applies — and nothing that simulates.

The split exists because an import is an import. The title menu needs a
level's NAME; reach for it through the full barrel and `createGame`, the step
pipeline, the autopilot, the loot roller, the spawners and the enemy catalog
land in the same chunk, because they are all one module graph away.
Tree-shaking does not save you here: it is global, so an export used by ANY
chunk keeps its bytes wherever its module was placed — and the module was
placed on the startup path. That was ~150 KB of JavaScript downloaded and
parsed before the player had pressed anything.

Both aliases resolve to the SAME underlying modules — there is one definition
of every symbol and nothing is duplicated in the bundle (`tests/content/
menu_entry_test.ts` asserts the two barrels hand back identical bindings).
The split is purely about which modules the startup path can REACH.

The rule: **the app shell imports `@game/menu`, the game imports
`@game/core`.** An export belongs in `menu.ts` when the title screen, the
roster, or the settings tree needs it AND it does not drag the simulation in
behind it. Two patterns keep that possible:

- **Leaf modules for flags.** The engine's runtime toggles live in
  `engine/game/flags.ts` — a module with no imports at all — because the settings
  screen applies them at startup, and keeping each setter inside the system it
  gates meant importing that system to flip a boolean.
- **Split catalogs.** The compiled content is emitted in menu-facing and
  run-facing halves: `generated/level-index.ts` (names, `foes` labels, the
  campaign order, the stamina ladders) beside `generated/levels.ts` (the full
  defs — every wall, spawner and loot table), and `generated/items.ts` (the
  weapon/gear bases) beside `generated/uniques.ts` (the named chase roster).
  The menus read the first of each pair through `defs/levels/summary.ts`.

#### Bundle budgets

`pwa/scripts/check-seo.mjs` polices the result, and since the app started
entering at the studio card (`Boot.tsx`) rather than at `App.tsx` it weighs TWO
paths rather than one — because "how long until the player sees something" and
"how long until the player can press something" stopped being the same number:

| Path                     | Budget    | Today   | What it is                                              |
| ------------------------ | --------- | ------- | ------------------------------------------------------- |
| **Card** (critical path) | 40 KB gz  | ~21 KB  | What the entry HTML pulls, before anything is on screen |
| **Menu-ready**           | 170 KB gz | ~142 KB | That plus everything `src/App.tsx` statically drags in  |

170 is web.dev's performance-budget figure, the one behind a ~5 s
time-to-interactive on a slow 3G phone, with no allowance added on top. It
stood at 200 for as long as the app rendered with React, because react-dom was
~50 KB gzipped of the path and no app-side surgery could return that; swapping
the renderer for Preact did, and the 30 KB of slack came off the budget with
it. Menu-ready is that same budget under a new name, and it is still the one
that catches a startup module reaching back through `@game/core`.

Menu-ready is measured from **Vite's build manifest** (`build.manifest` in
`pwa/vite.config.ts`) rather than from the HTML, because the HTML by design
says nothing about a chunk fetched at runtime; the walk follows `imports`
(static) and never `dynamicImports`, which is exactly what it must not count —
the game screen, the drive, the gallery, the scores. The manifest is kept out
of the service worker's precache (`pwa-plugin.ts`): it is a build artifact, and
nothing the player runs ever asks for it.

`engine/output.ts` remains the central output module (OSS_GAME_SPEC §19.4) through
which all diagnostic output flows: semantic helpers
(`status`/`warn`/`info`/`header`/`error`/`debug`), an always-on in-memory
log buffer (`recentLogs()`), and a debug switch (`?debug` URL param or
`setDebugEnabled`). Raw `console.*` calls outside this module fail lint.

### `pwa/` — the app

A Vite + Preact shell that mounts the engine and owns everything
deploy-shaped:

- **`pwa/src/Boot.tsx`** — **the entry chunk, and all of it.** The card, the
  pixel font it is drawn in, and a `lazy()` of the app shell: nothing else is
  allowed in here. The app used to enter at `App.tsx`, which meant the first
  script a player waited on carried the title menu, its settings/mods/vault
  screens, the sky, the paper doll, the roster, the parked-run reader, the
  engine's item and difficulty catalogs and the whole sprite atlas — ~139 KB
  gzipped before a pixel could be drawn. The card is up for a second or three
  regardless, so all of it now arrives DURING the card (`warmBoot`) instead of
  before it, and the card holds until it has: the menu is exactly as finished
  when the card clears as it was when it was eager. Measured as two budgets —
  see _Bundle budgets_ below.
- **`pwa/src/app-shell.ts`** — the one place `App.tsx` is imported from, so the
  renderer's `lazy()` and `warmBoot`'s prefetch name one specifier and share one
  chunk and one fetch instead of racing into two.
- **`pwa/src/App.tsx`** — the app shell: main menu ↔ the game, plus the
  three developer workbench routes, each lazily imported so its chunk folds away
  in a `__DEV_TOOLS__ = false` build — the cutscene loop (`?cutscene=<id>`), the
  effects gallery (`?effects`) and the road (`?drive`).
- **`pwa/src/game/SplashScreen.tsx`** — the STUDIO CARD the app opens on
  (`splash.ts` holds its timing rules and the warm-up it fronts). It is the
  only screen in the app that covers another LIVE one: the title menu mounts
  underneath it as its chunk lands and does its whole arrival behind it —
  the sprite atlas decode, the planet shader's chunk, and the backdrop's nine
  procedural surface bakes, which the sky would otherwise pay for one frame at
  a time as a visible stutter on the way into the menu. It clears on any input
  after a second and by itself at three — and **the two clocks answer to the
  load differently**: the AUTO-dismiss waits for it (a card that lifted itself
  onto a half-assembled menu is the thing it was added to prevent), a PRESS
  does not. A player who taps has said they are done reading, and a card that
  answers by ignoring them reads as a hung app; what they get instead is the
  Loading screen, until the shell and the atlas catch up. The minimum second is
  enforced either way, and it is not about the load at all — it is the guard
  against the press that LAUNCHED the app arriving as the press that dismisses
  the card. Every press is swallowed while it is up,
  because the menu behind it is listening. Suppressed for `?debug` / `?bot=` /
  `?skytest` / `?nosplash` so no harness pays for it — see
  `docs/configuration.md`.
  **`splash.ts` HAS NO STATIC IMPORTS BUT ONE**, and that is the rule rather
  than the tidying: everything `warmBoot` reaches is by definition something
  the card exists to load in the background, so a static import there puts it
  in front of the card instead of behind it. It also exports `splashSettled()`
  — resolved as the card leaves, immediately when a harness launch raises none
  — which is what anything the player cannot use before their first gesture
  waits on. The title THEME is the case it exists for: a score is tens of KB no
  browser will sound before that gesture, and the press that clears the card IS
  that gesture, so fetching it any earlier is bandwidth taken from the atlas
  and the app shell that ARE racing the card.
  **In a STORE SHELL it is the first thing painted**: a shell build strips the
  prerendered boot shell out of `index.html` (`VITE_SHELL_BUILD`, applied by
  `stripBootShell` in `pwa-plugin.ts`), because that markup is SEO and nothing
  crawls an asar, a `webroot.zip` or a Tauri resource bundle — all it did in
  there was flash an SEO document between the platform splash lifting and the
  card. The web keeps it: it is the crawlable copy AND what a first-time
  visitor reads while the bundle is still on the wire.
- **`pwa/src/game/`** — the presentation of the engine:
  `TitleScreen.tsx` (the Doom-style splash menu: starfield, logo,
  keyboard-and-pointer navigation, NEW GAME → the difficulty ladder,
  EXTRAS → the badges/boards/field guide, SETTINGS → seven pages of
  preferences, HOW TO PLAY → a self-playing demo run; its per-screen menu
  builders, sky backdrop, high-score board, page header, and row renderer
  live in `title-screen/`; every sub-screen opens with a `MenuHeading` — a
  large fitted title over a dim breadcrumb trail and a fading rule, with
  the brand logo shrunk and dimmed above it. The menu's SHAPE — which
  screens exist, each screen's row order, every label, icon and help line,
  and where BACK goes — is authored in `content/mainmenu.yaml` and compiled
  to `pwa/src/generated/menu.ts`; the builders supply only what a row DOES,
  matched on its id. A mod may not replace that file: the tree decides
  which screens exist at all, so the mod compiler refuses one outright.
  **The windows a RUN puts up are a different catalog and a mod may ship all of
  them**: the pause menu, the bag's frame, the map, the stall, the chooser, the
  conversations and the trade table are `content/menus/`, one file per window
  named after the `PlayerScreen` the engine parks the hero behind, compiled to
  `pwa/src/generated/ingame-menus.ts` and drawn by `pwa/src/game/menus/` —
  which is the HUD's own renderer with a backdrop and a box around it, since a
  menu ROW is a HUD node. The code-backed insides listed below are placed by
  those files as `kind: widget` and supplied by
  `game-screen/menu-panels.tsx`; MODALS stacked over them live in
  `menus/modals.ts`, raised by a press or by an authored `when:`),
  `GameScreen.tsx` (canvas
  mount, fixed-timestep loop, control-scheme input mapping, end-of-run splash;
  **the HUD it hangs over that canvas is CONTENT too** — every bar, slot,
  readout, rail and dock is authored under `content/hud/` and drawn by
  `pwa/src/game/hud/`, with only the irreducible insides (the minimap, the
  party frames, the gesture docks) code-backed as `kind: widget` in
  `hud/widgets/`),
  `overlays/IntroOverlay.tsx` (the level's story text box + chosen difficulty),
  `overlays/CutsceneOverlay.tsx` (draws a running scene — backdrop, props, cast,
  fade — while the engine sits in the `cutscene` phase; dialogue floats in
  a box over the stage bottom and waits for TAP, SKIP ends the scene) and
  `CutscenePreview.tsx` (the
  `?cutscene=<id>` workbench that loops one scene outside any run),
  `overlays/LevelUpOverlay.tsx` (the stat chooser shown while the hero's `levelup`
  screen is up; folds into a 3×2 grid on landscape phones. Its reveal lockout
  is skipped when the PLAYER opened it from the HUD's points pip — a modal
  somebody deliberately raised has no stray steering input to protect them
  from; only the ding's own reveal is frozen),
  `overlays/RespecOverlay.tsx` (the respec — a Diablo-style attribute
  screen shown in the `respec` phase, with a −/+ stepper per stat and a
  CONFIRM gate; shares the stat catalog with the level-up chooser via
  `stat-choices.tsx`),
  `InventoryPanel.tsx` (the Diablo-style bag: drag-to-equip slots,
  tier-colored borders, item card, character sheet),
  `ItemCard.tsx` (**the shared item card** — the one place a piece of
  equipment READS, so the bag's tooltip, the arsenal, the vault, the buyback
  shelf and the merchant's counter can never drift; PRESS AND HOLD one and it
  is copied to the clipboard as a picture to paste into a chat, which is
  `card-copy-gesture.ts` → `item-card-image.tsx` → `@ui/lib/dom-raster.ts`,
  re-rendering the card off screen rather than photographing the one on it —
  the bag's card is a hover tooltip a mouse dismisses by leaving the cell that
  raised it, so there the hold rides the CELL), `overlays/MapOverlay.tsx` (the
  fog-of-war level map shown in the `map` phase — one chunky pixel of
  terrain per explored fog cell, dark where the hero hasn't been, with a
  legend of event pins: story finds, elite/boss kills, the merchant, and the
  hero's own position), `render.ts` (camera +
  sprite drawing onto a world-unit canvas upscaled with `image-rendering:
pixelated`; enemies swap to generated wounded sprite variants as hp falls
  per `config.WOUNDS`, and a boss in its last stand flickers),
  `render/tilt.ts` (**the world projection** — the simulation is a flat,
  perfectly square top-down world, and this is the only thing that decides how
  it reaches the screen. Two knobs: **pitch**, how far the camera looks down, so
  the ground foreshortens and the floor rakes away from the eye; and **yaw**,
  how far it stands round from square-on, which is what turns a tiled floor into
  the diamonds people mean by "isometric". Both are live developer sliders
  (DEVELOPER → VISUALS); pitch ships at 0.75 and yaw at 0, because the wall and
  building art is drawn square-on and a turned camera leaves those sprites off
  their own collision boxes. The rule the whole thing rests on is that the
  **floor lies down and the bodies stand up**: ground decals take the projection
  whole, while anything with a body is anchored at its projected spot and drawn
  upright at full size through `billboard`, whose composite is exactly the
  identity at a whole-pixel offset so the pixel art stays crisp. The ground
  layer is baked already projected, so the per-frame blit is a 1:1 copy and the
  floor never boils as the camera pans),
  `effects-gallery/` (the developer EFFECTS GALLERY — every visual effect the
  game draws, each staged as a real fullscreen game situation by the engine's own
  scenario system and fired through the engine's own event stream, so the
  exhibits can never drift from what ships; the melee/shot/talent shelves are
  generated from `weapon-fx.ts` and the talent catalog, and
  `tests/content/effects_gallery_test.ts` fails the build when one falls behind.
  ONE CATALOG, TWO HOSTS: an `Exhibit` is a `RunExhibit` or a `DriveExhibit`
  (`exhibit-kit.ts`), and the gallery picks its host off that discriminator —
  `run-exhibit.ts` stands a `GameState` up, and the DRIVE shelf's
  `drive-exhibit.ts` stands a `DriveState` up instead, because a collision cannot
  be posed and has to be driven into. Both answer the same `ExhibitRun`, so the
  chrome, the keys, the slow-motion chip and the contact-sheet script never learn
  there are two. The road's exhibits plant a body or a van in front of the bumper
  (`drive-exhibits.ts`, pure engine — no browser, so
  `tests/content/drive_exhibits_test.ts` drives every one of them headlessly and
  fails the build when a staging stops producing the event and sound bank it
  advertises), and the take FOLLOWS the car to its collision and HOLDS there,
  because everything a hit leaves behind is anchored to the road and would
  otherwise be off the left edge 200 ms later.
  Reached from SETTINGS → DEVELOPER → GALLERIES → EFFECTS or at `?effects`),
  `tiers.ts` (tier name colors), `sfx/` (engine events →
  synthesized 16-bit-palette sounds, organized by domain: `ui.ts`,
  `combat.ts`, `world.ts`, `pickups.ts`, `jingles.ts` behind `index.ts`),
  `music/` (the player only — the scores themselves are compiled from
  `content/music/*.yaml` into the gitignored `pwa/src/generated/music/`, one
  module per track behind its own `import()` so the browser fetches the one
  it is about to play; `index.ts` owns the single player, and a level's
  `music` id selects its theme through `playLevelMusic(trackId)` — a screen
  with a theme but no `LevelDef` to hang it on names its own score through
  `playMusic(id)`, which is how the DRIVE gets one without this module
  learning that minigames exist),
  `audio.ts` (one shared synth split into SFX/music volume views),
  `settings.ts` (persisted control-scheme + volume settings), `characters.ts`
  (persistent named **characters** — the Diablo-style save model: each hero
  owns one evolving build carried into every difficulty, plus per-difficulty
  clear/beaten bookmarks that unlock the ladder in order and open a
  difficulty's free level-select once its TIER is beaten — the three starting
  lanes (easy/medium/hard) share one tier, so beating any one opens the mission
  picker on all three (grinding the last levels before nightmare goes through
  the picker, not a fresh linear run); a SOFTCORE death banks the run's
  build so the hero keeps the levels, stats and items earned it and just
  restarts the level, while HARDCORE is per-character permadeath — a death
  retires the hero for good, chosen at creation in `NewGame.tsx`),
  `highscores.ts`
  (hardcore-only, whole-campaign high scores — foes felled, combat-clock
  survival time and peak menace summed per difficulty across a campaign's maps
  and banked when it is beaten (SURVIVED) or the hero falls (FELL) — feeding the
  menu's browsable HIGH SCORES board, ranked four ways, with a per-campaign
  breakdown),
  `achievement-totals.ts` / `achievement-defs.ts` / `achievements.ts`
  (account-wide **achievements**: pure lifetime counters fed by the engine's
  per-tick events, the badge catalog — its per-level / per-difficulty /
  per-unique / per-companion groups derived from the live content
  registries — and the locally persisted unlock store;
  `AchievementsScreen.tsx` is the browsable shelf
  reached from the title menu's ACHIEVEMENTS screen — and mid-run from the
  rebindable ACHIEVEMENTS key (Y, World of Warcraft's own) or a tap on the
  unlock banner, which raises the same shelf over the run and PAUSES it
  (`game-screen/use-run-shelf.ts`, the freeze/thaw discipline the screenshot
  gallery shares) — and
  `AchievementToast.tsx` the in-run unlock celebration;
  `platform-achievements.ts` / `achievement-sync.ts`
  mirror the curated slice of the catalog into Game Center in native builds —
  see the native section below).

  **A badge's TIER is the whole design.** `AchievementDef.tier` is one of five
  effort rungs (BEGINNER → INTERMEDIATE → PRO → EXPERT → LEGEND), it is what
  the badge is worth (`ACHIEVEMENT_POINTS`, 10/25/50/100/250), and
  `achievement-tiers.ts` turns that one field into everything the celebration
  does: the banner's frame weight, halo and fleck count, how long it holds the
  screen, the chime (`sfx/jingles.ts`) and the buzz (`haptics.ts`) — and, for
  LEGEND alone, a full-screen card REVEAL instead of the corner banner, which
  is what the level cap, the campaign on its cruelest setting, every relic and
  every ally land as. Keeping the ladder in one table is what keeps it
  monotone; `tests/achievements_test.ts` pins that no counter ladder ever pays
  less for asking more, and that exactly one tier gets the reveal,
  `assets.ts` (loads the generated sprite atlas — one PNG + JSON source
  rects sliced into per-sprite bitmaps in a single decode — plus the pixel
  font), and `assets/` (the generated atlas + font atlas — never
  hand-edited).

- **`pwa/src/lib/`** — generic game UI plumbing imported via the
  `@ui/lib/*` alias (which, like `@game/lib/*`, `@game/core`, `@game/menu` and
  the three `react` entries that point at `preact/compat`, is declared in FOUR
  maps that must move together — `tsconfig.json`, `pwa/tsconfig.json`,
  `vitest.config.ts`, `pwa/vite.config.ts` — plus
  `scripts/game-alias-loader.mjs` and `tests/content/net_reachability_test.ts`;
  see `AGENTS.md` → Local reusable code):
  `game-loop.ts` (fixed-timestep rAF loop — it catches each frame's
  simulate/render half separately and always schedules the next frame, so a
  single thrown error can't silently unschedule the loop and freeze the run;
  the failure is reported through `onError` to the output channel),
  `describe-error.ts` (one readable log line out of an unknown thrown value),
  `pointer.ts` (pointer gestures:
  hold/hover steering state, taps with finger count, press edges),
  `synth.ts` (WebAudio SFX synth with 16-bit voice features — attack
  envelopes, detuned dual oscillators, vibrato, stereo pan, biquad
  filters, and a shared SNES-style echo bus; the game ships zero audio
  files), `chiptune.ts` (the 16-bit-style music sequencer: named
  instrument patches + patterns + an order arrangement, scheduled on the
  synth), `pixel-font.ts` + `PixelText.tsx` (runtime renderer for
  the generated bitmap font), `pixel-flash.ts` (a word in that font that rises
  off the point just touched and fades — raised imperatively, because the
  gestures that raise it have no render of their own), `long-press.ts` (the
  press-and-hold state machine: it tells a HOLD apart from a drag that moved
  and from a tap that must not fire twice), `dom-raster.ts` (draws a laid-out
  DOM subtree of canvases, sprites, framed panels and stroked `<svg>` gauge
  rings onto one canvas — how an item card becomes a picture; see the note in
  the file for why this cannot be html2canvas or a `<foreignObject>` when every
  word on screen is a canvas. It paints in the SCREEN's order rather than the
  markup's — every full-screen surface here is banded with a `z-index`, so a
  walk that went by document order would draw a different arrangement than the
  one being photographed),
  `flag-store.ts` (a persisted string-flag set
  with graceful no-storage fallback), `load-images.ts`.
- **`content/sprites/` + `scripts/asset-tools/` +
  `scripts/sprite-data/` + `scripts/generate-assets.mjs`** — the pixel-asset
  pipeline (`make assets`):
  each base sprite is one self-describing YAML file under `sprites/` (a
  character-grid `grid` block scalar + a concrete-hex `palette`; family
  orchestration and the shared core palette in `_family.yaml` / `_core.yaml` —
  see the `pixel-assets` skill), loaded by `sprite-data/load-yaml.mjs` and
  rendered into one sprite atlas (PNG + JSON source rects) plus previews
  (per-family contact sheets, film strips, palette sheet, font specimen).
  The atlas and previews are both gitignored and regenerated on every build —
  one of `assets` / `assets:site` / `assets:check` (the three `--previews`
  depths of `scripts/generate-content.mjs`) runs ahead of every `vite`, `tsc`
  and `vitest`, and they differ ONLY in how much of the preview set is drawn —
  so the pixel grids
  are the only committed source of truth (§11.2). Wound styles derive from the
  enemy catalog's `gore` field and role; contrast lints flag sprites that
  dissolve into their family's ground and wound overlays that don't read.
  See the `pixel-assets` skill.
- **`pwa/scripts/playtest.mjs`** — the autoplay bot that drives real
  runs headlessly through the `?debug` state hook. See the `playtest`
  skill.
- **`pwa/scripts/cutscene-preview.mjs`** — the scene review harness:
  plays one cutscene in headless Chromium via the workbench and
  screenshots every beat into `pwa/assets-preview/cutscenes/<id>/`,
  so a scene edit is reviewed like a storyboard contact sheet.
- **`pwa/pwa-plugin.ts`** — emits the service worker, `version.json`,
  and `precache-manifest.json` at build time. The worker precaches the app shell, parks new
  builds in `waiting`, and only takes over when the player accepts the
  update toast — a mid-run silent refresh would destroy the run.
  **ITS PRECACHE IS NAMED PER BUILD** (`<cacheId>-precache-<build>`), and that
  is load-bearing rather than tidy: with one cache per slot, the worker
  installing the next build wrote `index.html` into the very box the worker
  serving the game was reading it from, so a finished download made the running
  worker start answering navigations with the INCOMING shell — which asks for a
  bundle that worker does not have. Offline, that is the game opening to its own
  no-JS document with "BOOTING…" under it until the player force-quits. A build
  now writes only to its own cache, and `activate` sweeps the older ones (and a
  sibling slot's, never — see `isStalePrecache`) once it is the one in control.
  An install that cannot cache a BUILD asset fails rather than activating with a
  hole in it; only the public icons are survivable.
- **`pwa/src/app/pwa.ts`** — the per-slot precache cache id shared by
  the plugin (Node side) and the app (browser side).
- **`pwa/src/app/boot-watchdog.ts`** — THE BOOT SCREEN'S HONESTY. The
  prerendered `.prelaunch` console ends in a blinking "BOOTING…" wired to
  nothing, so a bundle that never arrives leaves the player reading a
  description of the game instead of playing it. This watches for that (a
  resource `error`, or a 20 s timeout for a fetch that hangs), performs ONE
  automatic recovery per tab — skip the waiting worker and reload, which is
  what force-quitting the app achieves the slow way — and, if the next boot
  stalls too, replaces the line with what actually happened plus TRY AGAIN and
  REINSTALL. It ships INLINE in the shell (`bootWatchdogScript` pastes
  `watchBoot.toString()`), because a watchdog inside the bundle cannot report
  the bundle not arriving; `markAppMounted()` in `main.tsx` calls it off.
- **`pwa/scripts/`** — source-data extraction (§11.2), SEO generation
  (sitemap/robots/llms/404, §11.3), and the structural SEO checker
  (§11.3.9).
- **`pwa/scripts/generate-screenshots.mjs`** — the manifest's install-prompt
  screenshots (§11.4.1), captured as REAL frames of the running game: it serves
  the build, hands a run to the engine autopilot, and shoots a live fight at the
  two form factors Chrome distinguishes (`narrow`, the reference landscape
  phone; `wide`, a desktop window). Committed output, because the manifest names
  the files — an install prompt is a promise about what the player is about to
  get, so composed marketing art has no place in that slot. Run via
  `make screenshots` (Playwright installed ephemerally, like the playtest
  harness); `check-seo` fails the build on a named file that is missing.

The app keeps its PWA update lifecycle and other game-agnostic plumbing in the
dedicated `engine/lib/` and `pwa/src/lib/` areas. This keeps the game self-contained
while preserving clear reuse boundaries — see `AGENTS.md` for the policy.

### `native/` — the native shell (the third tree)

The App Store / Play Store build lives in `native/`, an
[Expo](https://expo.dev)/React Native project that is **not** part of the npm
workspace and manages its own dependencies. It is a thin wrapper: a full-screen
[`react-native-webview`](https://github.com/react-native-webview/react-native-webview)
pointed at the deployed site (`siteUrl` from `game.config.json`), so the app
looks and plays exactly like the PWA. On top of the web game it adds the native
seams a browser can't provide on iOS:

- **Taptic haptics.** iOS WKWebView never exposes `navigator.vibrate`, so the
  engine's web haptics driver (`pwa/src/lib/haptics.ts`) no-ops there. The
  shell injects a `navigator.vibrate` polyfill (`native/src/injected.ts`) that the
  existing driver detects by feature test; every buzz is forwarded to the
  native side (`native/src/native-haptics.ts`) and replayed on the Taptic Engine via
  `expo-haptics`. No engine or pwa code changes — this is exactly the
  `setDriver`/feature-detection seam that `haptics.ts` was built for. The game's
  buzz vocabulary (`pwa/src/game/haptics.ts`) covers taking a hit (scaled to
  the share of the hp bar lost), the hero's death (the hardest rumble),
  title-menu presses, equips, and the dialogue typewriter crawl — kills
  deliberately do NOT buzz, so a busy field never becomes a motor drone. The
  native bridge maps a pulse's duration onto a Taptic impact weight, routing the
  shortest ticks (the per-letter crawl) to the gentler selection cue so a whole
  line reads as a soft chatter, not a row of knocks.
- **An audio session** (`setAudioModeAsync`) so the game's WebAudio plays
  through the iOS silent switch.
- **In-app purchases — the coin store.** The title menu's STORE row (native
  builds only) sells consumable coin packs that fund the in-game autopilot.
  A purchase lands in a device-wide **undistributed bank**; the store's
  DISTRIBUTE flow then moves any amount (a slider in 1M ticks) onto any
  hero, whenever — the remainder just stays banked. The same packs are also
  reachable **mid-run**, from the AUTO PILOT picker's STORE button
  (`pwa/src/game/overlays/CoinStoreOverlay.tsx`), because a purse too thin to
  fly is exactly where coins are wanted: that buy banks the pack and then sends
  it straight to the hero being played (`buyCoinPackForHero`) — the player
  named the recipient by buying from inside their run — and tops up the live
  run purse (`creditAutopilotPurse`) so a rung becomes affordable at once. The web side
  (`pwa/src/game/store.ts` catalog/bank/ledger +
  `pwa/src/app/store-bridge.ts` protocol client) talks to the native half
  (`native/src/store-purchases.ts`, StoreKit / Play Billing via `expo-iap`) over
  the WebView message channel. Paid transactions stay unfinished until the
  web side persists the credit, so an interrupted purchase is redelivered on
  the next launch rather than lost; a persisted ledger of transaction keys
  keeps redelivery from double-crediting. Payment is only demanded by real
  store distributions (`EXPO_PUBLIC_STORE_PAYMENTS=required`, set solely by
  the `production` EAS profile) — dev/preview/TestFlight builds grant packs
  `FREE` through the same flow, and the DEVELOPER → CHEATS → FORCE STORE switch
  surfaces the free store in any browser/PWA build.
- **Cloud save — heroes and paid coins follow the player, not the device.**
  Coin packs cost real money, so the bank they land in cannot belong to one
  phone's `localStorage`. In native builds the whole roster, the coin bank and
  the hardcore high-score board sync through the platform cloud: **iCloud
  key-value storage** on iOS, with **Game Center** naming the signed-in player
  (SETTINGS → DATA → CLOUD SAVE shows the state and syncs on demand). It syncs
  at launch, when the app changes foreground state, when the cloud reports
  another device wrote, and right after a purchase.

  It is also the store app's ONLY way to move a hero. The web's file transfer
  (EXPORT / IMPORT CHARACTER, below) is absent from native builds: the app
  mints platform achievements off a hero's progress, so a roster that can be
  handed between accounts as files — or levelled somewhere else and dropped in
  — would make a Game Center board a claim about nobody. Cloud save carries a
  roster between the player's OWN devices without ever leaving their account,
  which is the whole of what the app needs. The gate is `transferOpen`
  (`pwa/src/game/title-screen/use-character-transfer.ts`, off wherever
  `isNativeApp()`), and it drops the rows and refuses the runners behind them.

  The seam mirrors the coin store's: `pwa/src/game/cloud-save.ts` (payload +
  merge) over `pwa/src/app/cloud-bridge.ts` (protocol client) to
  `native/src/cloud-save.ts`, which moves ONE opaque string in and out of a
  `CloudProvider` (`native/src/cloud-provider.ts`). iOS's provider
  (`native/src/cloud-icloud.ts`) is backed by a local Expo module
  (`native/modules/cloud-save/`, Swift: `NSUbiquitousKeyValueStore`; the
  player's name comes from the Game Center module below); Android returns no
  provider yet, and Google Play Games
  Saved Games drops in as one more file behind the same five methods — no
  protocol, web, or merge change. The iOS capabilities come from
  `native/app.config.js` (`ios.entitlements`, skippable with
  `EXPO_PUBLIC_CLOUD_SAVE=off` for a local build on an App ID that has neither
  enabled).

  **Merging never has to make a judgement call about money.** The coin bank is
  not a stored number: it is a set of grow-only per-device counters (`credited`
  / `sent` — `CoinLedger` in `pwa/src/game/store.ts`) whose sum IS the balance,
  so two devices merge by taking the per-device maximum and a pack bought on
  either is banked on both. Heroes merge individually on an `updatedAt` stamp
  that `saveCharacters` writes only for the heroes a save actually changed
  (playing on two devices keeps both devices' work unless it is the SAME hero,
  where the more recently played version wins); deletions travel as tombstones
  so the cloud can't resurrect a hero; the score board is a union. The whole
  merge is commutative and idempotent, and payload equality is judged on
  canonical JSON (`pwa/src/lib/canonical-json.ts`) so two devices can't hand the
  same save back and forth forever. Device-shaped state — settings, key
  bindings, the active-hero selection, the parked run — deliberately stays
  local. The website is untouched: with no native shell there is no bridge, and
  every entry point is a no-op.

- **Game Center — the badge shelf reaches the player's profile.** In native
  builds the achievements the game awards are mirrored into the platform's own
  achievement service, and the ACHIEVEMENTS screen grows a GAME CENTER row that
  opens the system board. The seam is the cloud-save seam again:
  `pwa/src/game/achievement-sync.ts` (what travels, and when) over
  `pwa/src/app/achievements-bridge.ts` (protocol client) to
  `native/src/achievements.ts`, which forwards `{badge id, percent}` to an
  `AchievementsProvider` (`native/src/achievements-provider.ts`). iOS's provider
  (`native/src/achievements-gamecenter.ts`) is backed by a local Expo module
  (`native/modules/game-center/`, Swift: `GKLocalPlayer` + `GKAchievement`) that
  is also the app's ONE owner of Game Center sign-in — cloud save asks it for
  the player's name rather than authenticating twice. Play Games drops in as one
  more file behind the same five methods.

  **The mirror runs one way, and the list is curated.** The game's own ledger
  stays the source of truth and nothing is read back, so the platform can never
  grant a badge the game didn't award; because both platforms keep the highest
  percentage they have seen for an id, a report is idempotent and a failed one
  is simply retried. Game Center caps a game at 100 achievements and 1,000
  points total against the game's 249 badges, so
  `pwa/src/game/platform-achievements.ts` carries 87 of them — dropping the
  per-unique `unique_*` wall and the `equip_*` onboarding nudges, both already
  rolled up by ladders that do travel, plus every other rung of the hero
  ladder, where the stores take one every twenty levels (10/30/50/70/90) plus
  the cap — and apportions the point budget from the badges' own tiers. The resulting list is generated and committed
  (`native/store/game-center-achievements.json`, via
  `scripts/game-center-achievements.mjs`) because an achievement only exists
  once it has been created in App Store Connect. Reports are throttled to
  5-point steps and debounced, what was delivered is remembered across launches,
  and the game's own toast stays the only celebration.

- **Leaderboards — the game's board ranks the player against themselves; the
  platform's ranks them against everyone.** The achievements' twin, on the same
  seam and sharing the same sign-in: `pwa/src/game/leaderboards.ts` over
  `pwa/src/app/scores-bridge.ts` to `native/src/leaderboards.ts`, which forwards
  `{board key, whole number}` to a `LeaderboardsProvider`
  (`native/src/leaderboards-provider.ts`, Apple's in
  `leaderboards-gamecenter.ts`) — so Play Games is one more file here too. Five
  boards are published: the hardest blow ever landed, lifetime kills, the best
  kill rate held across a full ten minutes of the farm-proof combat clock, and
  the longest survival / most kills in a hardcore JESUS campaign. Every board is
  deliberately **uncapped** — a ranking of something with a ceiling (hero level,
  relics recovered, trophy points) fills with players tied at the top and stops
  ranking anything — and nothing is tracked _for_ them: each value is a record
  the game already keeps (`achievement-totals.ts`, `highscores.ts`), published
  when a run resolves and once at launch to backfill a new sign-in. A
  leaderboard is a second READER of the player's own records, never a second
  bookkeeper, so no ranking can disagree with what the game already shows him.
  The one new counter, `bestKillRate`, is a lifetime total like any other, and
  its rolling window (`pwa/src/game/kill-rate.ts` — app-layer, not engine) is
  bucketed rather than a list of kill timestamps. The platform keeps the best
  value it has ever been sent, so re-publishing is free.

  There is **no board UI**: HIGH SCORES → WORLD RANKINGS opens Game Center's own
  board. A board's portal FORMAT and the game's SCALE have to agree — a score is
  one Int64, so a rate goes out ×100 and a duration in whole seconds — so the
  format is authored and the scale derived from it
  (`pwa/src/game/platform-leaderboards.ts`), with the portal list generated and
  committed (`native/store/game-center-leaderboards.json`) and the suite failing
  on drift, exactly as for achievements.

- **Screenshots — the picture leaves the game through the platform's own share
  sheet.** The SCREENSHOT bind (ENTER in a browser, F12 in a store shell — see
  `defaultKeybindings`, because a page may not swallow the developer-tools key)
  — or, where there is no keyboard to press it on, the SHUTTER on the HUD's
  gear rail (`content/hud/elements/screenshot_slot.yaml`, gated on the
  `ui.touch` binding) — rasterizes the whole screen — world canvas
  AND interface — into a PNG, files it in a capped IndexedDB roll
  (`pwa/src/lib/shot-store.ts`), and flashes a miniature the player can press to
  freeze the run and open the gallery on it (EXTRAS → SCREENSHOTS, the same
  viewer the title menu opens — offered on every build now that every build can
  fill the roll; it was desktop-only for as long as a KEY was the only way in). **Whatever is on screen is what is in the
  picture, the DRIVE included** — the road answers the bind itself and owns the
  whole picture while it is up, so the receipt is banded above even that (the
  band map in `styles.css`) and the raster follows those bands rather than the
  markup. It offers no press there: the tap is routed by the field's own canvas,
  which the road has covered. Sending one on is the platform's answer rather
  than ours: `pwa/src/lib/share-image.ts` probes what the BROWSER can do with
  this exact file (`navigator.share` with a `files` payload, an `image/png`
  clipboard write, a download) and offers only the buttons that will work, while
  the shells answer the same question over `pwa/src/app/screenshot-bridge.ts` —
  one more protocol on the one shell channel. The native half
  (`native/src/screenshots.ts`) stages the PNG in the app's CACHE directory and
  raises the system sheet with `expo-sharing`; it deliberately does not touch the
  camera roll, because that needs the photo-library permission and the sheet's
  own "Save Image" gets the picture there with the player choosing rather than
  the game asking. **The bridge exists at all because Android has no Web Share
  API in a WebView** — on iOS the page could nearly do it alone, and on Android
  the one button a phone player most wants would simply not be offered.

`native/app.config.js` reads brand identity from `game.config.json` (never
re-hardcoding it) and pins the EAS project id; `native/eas.json` holds the build
profiles. Builds are **manual only** — locally via `eas build`, or the
dispatch-only `.github/workflows/native.yml` — so paid EAS build minutes are
never spent on a push. See `native/README.md` for the full build/distribute flow.

#### The device content switches — what the player's GUARDIAN owns

**THE DEVICE CONTENT SWITCHES — the controls the PLAYER'S GUARDIAN owns, not the
player.** Two switches on the app's own page in iOS Settings (native builds only;
a browser has no such page, so every entry point reports UNMANAGED and the game
plays whole): **MATURE CONTENT**, which gates the gore and the screen-nuke's
burning dead, and **COIN STORE**, which decides whether this install has a store
at all. Both default ON — the game ships as it was made, and a guardian turns
things off. They live OUTSIDE the game on purpose: a control reachable from
inside the thing it restricts is not a restriction, so there is no in-game row
for either, and the device's answer OUTRANKS every in-game setting and developer
flag (every GORE switch and FORCE STORE included). Same three-file seam as cloud save
and the achievements — `native/src/device-settings.ts` (bridge) over
`device-settings-provider.ts` (seam) and `device-settings-ios.ts` (Apple), backed
by `native/modules/device-settings/` (Swift: `UserDefaults`) with the page itself
written at prebuild by the local config plugin
`native/plugins/with-settings-bundle.js` — so **Android support is one new file**
plus wherever Android puts its own parental controls. Four rules:

1. **NSFW IS THE UMBRELLA GATE FOR EVERYTHING "NOT SAFE FOR KIDS", and every new
   such feature MUST hang off it.** The blood, the incinerated dead — and
   whatever comes next: dismemberment, a decapitation, swearing in the dialogue,
   drug or alcohol references, sexual content, an unusually cruel death
   animation. The test is not "is this gore", it is "would a parent handing over
   this phone want it off". Adding a second switch per new kind of content is how
   a parental control rots: the guardian answered once, years ago, and every
   feature shipped since defaults to showing them. So a new mature feature adds a
   `nsfwAllowed()` check, never a new setting — and it belongs in the same review
   as the feature, because a mature feature that ships ungated has already been
   seen by the players the switch exists for.
2. **THE GATE GOES WHERE THE THING IS DECIDED, NOT WHERE IT IS DRAWN.** `bloodBlow`
   returns null and the floor's saturation grid never records the hit; the
   `incinerated` flag is dropped at the top of the kill's fx so the blast falls
   back to the ORDINARY corpse punt-and-topple, which is what makes a censored
   nuke read as a bomb that hits hard rather than one whose victims vanish. A
   gate at the draw call leaves the state filling up invisibly and hands the
   player everything it was hiding the moment the switch comes back.
3. **IT FAILS OPEN, ALWAYS.** No native module, an Android build, a malformed
   payload, a browser: every one of those plays the full game. A guardian's
   switch is a deliberate act, honoured exactly; the ABSENCE of an answer is not
   one and must never be read as one. Note the trap this exists for: iOS does NOT
   write a `Settings.bundle` `DefaultValue` into `UserDefaults` until the page is
   visited, so the key is MISSING on every fresh install — read it as `false` and
   every player gets the censored game.
4. **THE POLICY IS IN THE PAGE BEFORE THE GAME'S FIRST FRAME.** It gates what may
   be DRAWN and which rows may be OFFERED, so it is injected onto `window` before
   the WebView loads a byte (`policyBootScript`) and read synchronously
   (`pwa/src/app/device-policy.ts`) — never awaited. A round trip would flash a
   STORE row at an install that has none. Only LATER changes travel as events,
   and the title menu rebuilds on them through the same `bumpSettings` tick its
   own settings use.

### `electron/` — the desktop shell (the fourth tree)

The **Steam** build for Windows, macOS and Linux lives in `electron/`. It is the
desktop twin of `native/` and shares its whole shape: a thin shell wrapping the
built site, copied inside it (`webroot/`, gitignored, from
`npm run electron:bundle`), self-contained and offline, updated only by shipping
a new build. Like `native/` it has its own dependency tree, its own `tsc` and —
because the root suite stops at its edge — its own vitest.

Three things are specific to the desktop:

- **The site is served from a private `game://app` scheme**, not `file://` and
  not a local HTTP server. `localStorage` is keyed by origin and the player's
  entire roster lives there, so the origin must be one stable constant for the
  life of the install; a `file://` page is an opaque origin and a server on an
  ephemeral port is a different origin each launch. The scheme also means no
  listening socket on the player's machine. `webroot.ts` maps Content-Type
  explicitly (an ES module served as the wrong type is a blank screen, not an
  error) and refuses any path that resolves outside the webroot.
- **The renderer is locked down**, deliberately departing from steamworks.js'
  own Electron instructions, which suggest `nodeIntegration: true` and
  `contextIsolation: false` so the renderer can require the native module. The
  renderer here is the entire game; it gets no Node, no `require` and its own
  isolated world. Steam lives in the main process and the page reaches it only
  through the JSON protocols it already speaks to the phone app.
- **The window remembers itself** (`window-state.ts`) — size, position,
  maximized/fullscreen. That state is kept in the shell rather than in the
  game's settings because geometry is device-shaped and the settings now ride
  cloud save; a 4K rect restored onto a laptop would be actively wrong, the same
  reasoning that keeps key bindings out of the synced payload.

The platform features ride the identical bridge → provider → platform seam the
mobile shell uses, so the web side never learns which platform answered:
**Steam Cloud** (`cloud-steam.ts`, a file store where iCloud is key-value, so
our one save key becomes one file name) and **Steam achievements**
(`achievements-steam.ts` — a switch, not a percentage, so 100 unlocks and
anything less is not reported). **Leaderboards are absent on purpose**, argued
at the seam in `leaderboards-provider.ts`: steamworks.js binds no leaderboard
API, and Steam's overlay has no leaderboard page either, so the "the platform
draws the board" rule that lets the game ship no board UI has no counterpart
here.

**Screenshots are the one platform feature where doing nothing is the right
answer**, and `screenshots-provider.ts` argues it at the seam: steamworks.js
binds no `ISteamScreenshots`, but the overlay this shell injects already hooks
Steam's own screenshot key at the swap chain, so a press files a copy in the
player's Steam library with the game entirely uninvolved. The game's bind ships
on F12 IN A SHELL to match and never grabs the key away from it (a browser tab
gets ENTER instead, where F12 belongs to the developer tools) — one press on a
Steam build gives the player Steam's copy AND the game's own, the latter in the
in-game gallery and as a real file in their pictures folder
(`electron/src/screenshots.ts`, whose `share` puts the PNG on the clipboard and
opens the file manager on it — the desktop's honest version of a share sheet).
What is actually missing is `AddScreenshotToLibrary`, and only for a build with
no overlay.

`electron-builder.config.cjs` reads brand identity from `game.config.json`
(never re-hardcoding it) and shares the mobile app's bundle id. It packages a
**directory, not an installer** — Steam distributes by uploading a directory to
a depot and its own client owns installing and updating. Linux is built too, so
the Steam Deck runs the real binary rather than the Windows one under Proton.
`.github/workflows/desktop-electron.yml` typechecks and tests the shell on every
relevant push, and packages the depot directories dispatch-only. See
`electron/README.md`.

### `tauri/` — the second desktop shell (the fifth tree)

A **second** wrapper around the same built site, beside `electron/` rather than
instead of it, so the two can be run back to back and judged against each other.
Tauri uses the platform's own webview — WebView2, WKWebView, WebKitGTK — which
takes the install from ~180 MB to about a tenth of that and the idle memory with
it, at the cost of three rendering engines instead of one, no `utilityProcess`
and no `steamworks.js`. Whether it takes over as the release package turns on
measurements; the criteria, the tools and the outcomes are
[`desktop-shells.md`](desktop-shells.md), and the machine-checked pairing
between the two trees is [`desktop-parity.md`](desktop-parity.md).

It is **Rust, in two crates**, and that split is the design rather than a layout
preference: `tauri/shell/` holds every DECISION the shell makes (webroot
resolution, window geometry, capability parsing, bridge routing) and depends on
no GUI at all, while `tauri/src-tauri/` holds every EFFECT. So the whole
decision layer is testable — `make tauri-test` — on a machine with no webview
libraries installed, which is the Rust-shaped version of the discipline
`electron/src/window-state.ts` keeps by hand. Each module in `shell/` is the
named peer of a file in `electron/src/`, so a change to one shell is a visible
gap in the other.

Three things differ from the Electron shell and all three are platform facts
rather than judgements: the origin is `game://localhost` (and
`http://game.localhost` on Windows, which is how WebView2 maps a registered
scheme); the page's globals arrive in an initialization script instead of a
preload, with one command — `shell_post` — carrying the identical JSON the other
shells carry; and the capability stamp is read with `option_env!` at compile
time, so an installed copy has nothing to edit. `pwa/` needed no change to run
inside it: `__GIS_PLATFORM__` stays `steam`, because it is the same product on
the same store, and `__GIS_SHELL__` says which binary for a bug report.

**It runs the whole game and carries every platform seam** — cloud save,
achievements, screenshots, mods, multiplayer and voice — plus a package
(`make desktop-tauri-steam` produces a depot directory, the peer of
`make desktop-steam`) and a `-tauri`-suffixed download on every release page.
**Valve's overlay is here too, on Windows**, by a route Electron does not need;
see below.

Two extra launch modes belong to it and to no other tree: `--dedicated` runs the
session server in the terminal, and `--roster-check` prints what the platform
cloud is holding — which is what reduces "a roster crosses between the two
desktop builds" from an evening's play to one command per build.

**The two features that need a second process needed a second pipe, and the
page never learned.** Electron forks the compiled session server with
`utilityProcess.fork` and transfers a `MessagePort` to the renderer; Tauri can
spawn a child and nothing more. So the server is spawned on a Node runtime the
package carries, its CONTROL channel is that child's stdio as newline-delimited
JSON (`server/shell-host.ts`, the server's third entry), and its SNAPSHOT
channel is a loopback WebSocket the PAGE opens straight to it — which keeps the
one property the `MessagePort` bought, that no game byte crosses the shell. The
page still asks `__gisShell.onNetPort` for a `MessagePort` and still gets one,
because the shell's initialization script mints the pair in the page and bridges
its own end. The mod compiler travels the same way: one compiler, spawned rather
than imported, with JSON crossing.

The platform seams are the **same three-file shape** the rest of the game uses —
bridge → provider → platform — with the split falling exactly on the crate
boundary: the bridge and the provider are decisions and live in `shell/`, and
only the third file talks to Steam. So a protocol's whole behaviour, including
the failure paths a real Steam client cannot be asked to produce on demand, is
covered by `make tauri-test`.

**Valve's overlay reaches this shell from the other end.** It is a library Steam
injects into the process, which hooks the swap chain the game presents its frames
with — and a webview shell presents none, so the hook waits for a frame that
never comes. Electron leaves one behind with two Chromium command line switches;
a platform webview has no command line, so this shell opens a transparent,
click-through window over the game and presents EMPTY frames into it at vsync
through a real in-process swap chain. Steam composites the overlay into those,
and everywhere it does not draw the sheet is transparent and the game shows
through. Windows today (`tauri-plugin-steam-overlay-surface`, MIT); the decision
of whether to raise it is `shell/src/steam.rs`'s `overlay_plan` and the wiring is
`src-tauri/src/overlay.rs`. Shift+Tab is FORWARDED rather than caught — the chord
belongs to the webview's process — which is the same shape the F11 handler
already had.

Two platform answers still come out DIFFERENT from the Electron shell's, and both
survive the overlay: the game files its own copy into the Steam screenshot
library, because Steam's key photographs the decoy's empty frames rather than the
game (Electron leaves that to the overlay outright); and leaderboards stay absent
for a different reason than they do there — the Rust binding can publish a score,
but there is no board on this platform anybody could open. `tauri/README.md` has
the argument; `desktop-shells.md` has the table.

### `server/` — the session server (the sixth tree)

The engine, compiled for Node and shipped inside the desktop app, so a
multiplayer session can simulate in a process of its own rather than in the
renderer. `electron/src/session-host.ts` forks it as a `utilityProcess`,
`electron/src/net.ts` is its bridge, and the snapshots travel to the page on a
`MessagePort` that bypasses the main process entirely.

It is one more arm of the same bridge → provider → platform shape every other
platform feature uses, with one thing deliberately NOT copied from them: the
volume. Those move a handful of JSON round trips per session; this one moves a
snapshot twenty times a second, so `__gisNet` carries only control traffic and
the game frames get their own channel.

Like `mod/`, it is at the repo's top level rather than inside `electron/`,
because it is engine code rather than shell code — and the same file is the
standalone dedicated server. `scripts/build-server.mjs` is its ship
target and `server/package.json` declares its runtime dependencies, checked
against the real import graph by `tests/content/server_deps_test.ts`. See
[`multiplayer.md`](multiplayer.md) and `server/README.md`.

### `/library/` — the generated reference site

A fourth thing ships inside every slot: **the library**, a set of static
reference documents at `/library/` compiled from the same content the game is
compiled from. Nine sections, ~570 pages, plus the landing page that leads them:

- the **bestiary** — an index grouped by venue and one page per monster,
  carrying its authored `lore` paragraph (what the thing IS — in the open,
  under the portrait, for the fodder tier as much as for a boss), its numbers,
  where it spawns, what it drops, and its dialogue behind a spoiler panel. Each venue's section lists its rank and file in the open and
  keeps the named elites and the boss waiting behind them under a cover (with
  one switch at the top that lifts them all), and the landing page's rack does
  the same — WHO ends a venue is the biggest spoiler the site holds. Where a
  monster's name travels without its venue around it — a flat rack, a `<title>`,
  a drop line naming who hands an item over — it carries the qualifier that
  tells it from its namesakes (`nameApart`), because THE FOUNDER is three
  different bosses on three different maps;
- the **allies** — an index and a page per COMPANION, the one section whose
  subject is on the hero's side: how each is recruited (beat a named elite down
  and the run stops for a SPARE-or-KILL verdict), what it brings, and what every
  rank of its signature power comes to. The training table's COLUMNS are derived
  from what the def carries — the blunderbuss grows pellets and the coil grows
  arcs, so a fixed column set would print an empty column on three of four
  pages — and every figure on it comes back from a real recruit
  (`withCompanion`, the reference hero's twin) rather than off the def: a
  companion swings through the party damper and its own training curve, so the
  weapon's catalog damage is a number no player ever sees on this side of the
  party. The index carries what is true of ALL of them and visible from inside
  the game only by inference: the formation, the engage and leash radii, the
  damper, the kneel whose count freezes while a foe is near, and the
  out-of-combat mend. What sits behind a cover is only the JOIN and the banter —
  an ally's numbers are not a spoiler, and the elite it is until you spare it
  keeps that fight's story covered on its own bestiary page;
- the **arsenal** — an index by rarity and by slot, one page per named chase
  relic (its authored bonus block, its set, the odds its tier rolls at) and one
  per base item (the figures the in-game card shows, the BROKEN-to-PERFECT
  make-quality table it rolls on, and the exceptional/elite versions it upgrades
  into — a generated grade variant has no page, it is described on the ancestor
  it was generated from). The index leads with the BASE items and climbs from
  the commonest gold to the level-99 red, because a reference index is read from
  the top and almost nobody arrives asking about an artifact;
- the **talents** — an index laying out the three passive trees (WARLORD off
  STRENGTH, WINDRUNNER off DEXTERITY, ARCHON off INTELLIGENCE) and the point
  economy they are spent from, and a page per talent: what EVERY ONE OF ITS
  RANKS actually comes to, what a maxed copy costs the build in chosen stat
  points, and the rest of its tree as the thing that rank was bought instead of.
  Every figure is asked of the accessor that owns the rule with the talent
  trained (`withTalent`), never read off the authored slope — a page printing
  `chancePerRank × rank` would say 80% where the talent's own ceiling holds a
  real hero at 75%. A CONJURATION's numbers are tabled with the very labels a
  picked-up power's block is tabled with, because a granted spell arrives at the
  same block shape by a different route. Like the powers, it exists because the
  game barely explains one: the picker shows a hero the whole tree for about as
  long as it takes to read one line, once per point;
- the **powers** — an index grouped by the venue that introduces each one, and a
  page per powerup: its authored `lore`, the numbers of every effect block it
  carries (a power is a COMPOSITION, so a page describes each block it has
  rather than the one its `kind` names), the art it puts on the field, and how
  often it turns up — its selection weight, and the share of each venue's pool
  that weight actually comes to. It is a section rather than a corner of the
  arsenal because a power has no slot, no requirement, no make quality and no
  durability: every column an item page is built from would read "—". It exists
  at all because the GAME never explains a power — it arrives as an icon, runs
  for six seconds and is gone — which makes this its only surface;
- the **mission guide** — one page per venue: what it fields on each rung, its
  roster, its loot pool and powers, its merchant, and — behind covers — its map
  and the hero's arrival monologue;
- the **errands** — an index grouped by venue and then by the person standing on
  it, a page per QUEST (what it asks, who carries the pieces it wants and at
  what odds, what it pays — with the reward's XP SHARE priced out per rung
  against the hero the ladder intends, by calling the engine's own
  `questXpReward` — and what turning it in opens), and a page per QUEST GIVER
  (their authored paragraph, their whole chain, and the fact that nothing can
  hurt them and nothing is kept off them). The nesting is the feature's own shape rather than a filing
  choice: an errand is offered on one map, a chain may not cross one, and a
  couple of people stand on every venue. The spoken half — the ask, the nag, the handover
  and an escort's two lines — sits behind a cover like any other dialogue, and
  the errand's own `lore` sits in the open above it. What no page here publishes
  is a COORDINATE: where a person stands and where an escort is being walked to
  are world pixels, and the venue's map render is the answer to "where";
- the **achievements** — an index and a page per CATEGORY of badge, which is the
  one section whose unit is a group rather than an entry: a badge is four facts
  and a sprite, and 249 pages of four facts is thin content next to the arsenal
  page that already describes the relic a trophy is for. A category page lists
  its badges the way the shelf lists them — the sprite, the name, the condition
  in the game's own words, and what it pays — except where a whole family is ONE
  condition with a different subject each time (the 149-strong relic wall, the
  companion roster), which is drawn as a RACK of the subjects with the shared
  condition stated once above it. Which badges those are is DERIVED, never
  declared: a run qualifies when every member is a one-shot whose condition is
  the same sentence once its own subject's name is taken out of it. The index
  carries the half a player cannot see from inside the game — what each effort
  tier pays and how the catalog is spread across them, and which badges reach a
  Game Center or Steam profile, since both platforms cap a list at 100 and the
  shelf is more than twice that. The links out come from `AchievementDef.subject`,
  which the badge catalog states for the four families it generates off a catalog
  (mission, difficulty, relic, companion) precisely so the library never has to
  recover the fact by pulling an id apart. Nothing here sits behind a cover: the
  game shows every condition from the first run, and covering them would tell a
  reader less than the game does;
- the **story** — a chapter per mission, plus one for the hellborn: the plot in
  prose, the scenes that play on the way in, the arrival monologue, the pinned
  thoughts, every named figure's arrival scene and last words, and the found
  lore — all of it behind covers, with one switch at the top of the page that
  lifts them all.

The nine cross-link: a monster links to what it drops, to the venue it lives on
and — when it kneels rather than dies — to the ally it becomes, an item links back to everything that pays it out, a power links to the
venues whose pools carry it and a mission's pool links back to each power it
hands out, a conjuration talent links to the pickup that puts the same thing on
the field, an errand links to the breed it sends you at and the person who asked
while a mission page names its givers, a badge links to the relic,
mission or ally it is for, an ally links back to the elite it was and to the
weapon it fights with, a mission links to all of them,
and a chapter links to the rest —
every game name in its prose is a link to that thing's page. That graph is what
lets a crawler reach the whole set
from one entry point, and what makes the library worth reading rather than a
pile of tables.

It exists because the deployed site is a canvas: a few hundred indexable words
on one page, while the repository holds a content catalog of well over two
thousand authored files and tens of
thousands of words of prose that no crawler has ever seen.

Three properties are load-bearing, and each is cheap to keep and expensive to
retrofit:

- **It is generated, never authored.** `pwa/scripts/library/` reads the
  compiled catalogs (`engine/generated/*`) for authored facts and CALLS THE ENGINE
  for derived ones — `hardMobHpScale`, `mobContactScaleFor`, `enemyKillXp` —
  through the same `scripts/game-alias-loader.mjs` seam the calculators use. No
  gameplay number is ever typed into the generator, so the library has no
  separate copy of anything to drift from. Pages are never hand-edited: a page
  changes by changing a generator. Every model FAILS THE BUILD when a def
  carries an authored field no page renders — one `*_FIELDS` allow-list per
  model (`ENEMY_FIELDS`, `WEAPON_FIELDS`, `GEAR_FIELDS`, `UNIQUE_FIELDS`,
  `LEVEL_FIELDS`, `TALENT_FIELDS`, `POWER_FIELDS`, `QUEST_FIELDS`,
  `QUEST_GIVER_FIELDS`, `COMPANION_FIELDS`, `STORY_ITEM_FIELDS`,
  `THOUGHT_FIELDS`, `CUTSCENE_BEAT_KINDS`, `ACHIEVEMENT_FIELDS`) — so a new
  authored field can't quietly vanish from hundreds of pages at once. The badge
  catalog is the one behind that contract written in TypeScript rather than
  YAML, which makes the failure quieter rather than rarer — a field added to
  `AchievementDef` compiles and ships and is simply absent.

  When a page wants to explain a number that is currently a literal buried in
  `engine/game/config/`, that number was probably content all along, and the fix is
  to lift it into an authored `content/*.yaml` with a schema and a snapshot
  guard — the migration the items, enemies, levels, powerups, ladder, leveling
  curve and bot tuning have each already been through. The library is a good
  forcing function for it: anything it struggles to explain is usually something
  the game struggles to tune. What must NOT happen is the reverse — copying
  engine _logic_ into YAML so a generator can read it more easily, which creates
  a second implementation free to drift silently.

  The arsenal is where this rule bites hardest, because a weapon's authored
  `damage` is still not the whole story of what a dropped copy swings for — the
  instance's make quality and the wielder's stats both move it. So the pages
  quote what the item CARD quotes,
  by calling the functions the card calls (`weaponDamageRange`, `weaponDps`,
  `armorValueOf`) against a REFERENCE HERO: a real `createGame` run at level 1,
  who has spent nothing, so the wielder term is exactly 1 and what comes back is
  the piece itself.

- **It loads no JavaScript, and never the game bundle.** It deliberately does
  not use `pwa-plugin.ts`'s doc-page mechanism (which copies the built
  `index.html`, inheriting the entry script and every `modulepreload`) — right
  for two pages beside the app, ruinous for hundreds. It has its own minimal
  template: one small stylesheet, one webfont. The critical-path budget keeps
  measuring the game's own preload set and is unaffected.
- **It wears the game's skin without copying it.** The window skin is inlined
  verbatim from `pwa/src/lib/pixel-panel.css` and the ITEM CARD from
  `pwa/src/lib/item-card.css` (both of which `styles.css` also imports, so one
  definition dresses both) — an arsenal page's card wears the app's own
  `.item-card` / `.tier-*` / `.card-foot` class names and is the card the game
  draws, at the size the game draws it (the 2× large-screen regime included).
  How an affix WORDS itself comes from `@ui/lib/affix-line.ts`, which ItemCard
  imports too; the tier and affix colours come from the game's own
  `pwa/src/game/tiers.ts`. The headings are the game's pixel font packed as a
  real WOFF2 from the same `GLYPHS` map as the runtime atlas
  (`scripts/asset-tools/webfont.mjs`); the sprites are `make assets`' own 8×
  previews; each venue's page background is a real patch of its floor, laid out
  by the renderer's own `groundTileName`; and a mission's MAP is the level drawn
  whole out of the game's own sprites by `scripts/level-render.mjs` (bare, with
  the dormant packs and each spawn point's queued mobs included) and shrunk to
  fit a page — the place as a player sees it, not a schematic of it.
- **The story keeps the same rule, applied to words.** A chapter's narrative
  prose comes from `docs/story.md`, the top of the story chain and the only tier
  that holds it; every LINE a chapter quotes comes from the compiled game —
  `CUTSCENE_DEFS`, a level's `intro`/`outro`, an enemy's `dialogue` and
  `lastWords`, `THOUGHT_DEFS`, `STORY_ITEM_DEFS`. It never quotes
  `docs/manuscript.md`: the manuscript is a verbatim transcription of those same
  lines, so publishing it would be publishing a copy that is free to fall
  behind. `docs/story.md` is parsed structurally rather than by a list of
  headings — a `## Level N — NAME` section is matched to the venue by NAME, a
  `## Travel — … (cutscene)` section attaches to the chapter it leads into — so
  the two tiers are checked against each other on every build: a section that
  cannot be placed, a venue written about that the game no longer ships, a venue
  the game ships that nobody wrote about, or a chapter whose scenes disagree
  with the level's own `prelude` chain each stop the build.

`pwa/scripts/generate-seo.mjs` enumerates the sitemap from the same route model
that renders the pages — so a page without an entry, or an entry without a page,
is impossible by construction — and dates each one from the git history of the
YAML it is compiled from. Each slot's service worker denies `/library/`
navigations, or the cached app shell would shadow every page in it.
`tests/content/library_test.ts` holds the whole thing to the engine.

**The title menu's LIBRARY row is the only way in.** The prerendered boot shell
carries a link too, but the app replaces that shell the moment it mounts — so
before the row existed a human never saw the link, and neither did a crawler
that runs JavaScript, which left every reference page orphaned from the site's
own front door and reachable only through the sitemap. The row leaves the app
with a plain navigation rather than routing inside it: the library is documents
that deliberately carry none of the game's JavaScript, so it cannot be a screen.

**And every page's header carries the way back.** Because the row is a real
navigation, the two builds that matter most strand a reader who follows it: the
installed PWA and the native WebView both render these pages with no address bar
and no back button, leaving an edge-swipe as the only gesture out. So a
`BACK TO GAME` button leads the header of every page, unconditionally — no
display-mode sniffing, since the pages run no JavaScript and a CSS
`display-mode` query answers `browser` inside a plain WebView anyway. The header
is `position: sticky` for the same reason: an exit at the top of a page the
reader has scrolled a thousand pixels down is not one. It sits outside `.wrap`
so the bar spans the viewport, and the section nav is the one element on these
pages allowed to scroll sideways — inside its own box, and only once it has
already dropped to a line of its own, so the PAGE never carries the overflow.

**A link OFF the site is the opposite case, and never enters the shell at all.**
The EXTRAS -> COMMUNITY row leads to the chat server the players keep, which
neither shell serves and neither can offer a way back from — a `BACK TO GAME`
header is the library's to carry because the library is ours. So both shells
intercept the navigation and hand the URL to the player's own browser instead:
`will-navigate` / `setWindowOpenHandler` on the desktop
(`electron/src/main.ts`), `onShouldStartLoadWithRequest` on the phone
(`native/App.tsx`, judging with `native/src/navigation.ts`). Same rule on the
website, where the row is a `target="_blank"` anchor: whatever the surface, a
run lives in the game's document, and steering that document at a chat invite
would throw the run away. The address itself is not in the source — it is the
`COMMUNITY_URL` repo variable (`docs/configuration.md`), because invites expire,
and a build never given one simply does not offer the row.

### The library's two picture surfaces

Every bestiary and arsenal page carries two generated images, and they are
different pictures because they are read by different things.

- **The social card** (`og-card.mjs`, `og:image`) is what a link unfurler shows:
  the subject's sprite at an integer scale, its name in its own rarity colour,
  and a rarity halo the common tiers deliberately do not get. It sits on a clean
  field — an earlier pass tiled it with the venue's floor, and at thumbnail size
  a busy texture behind the title only costs legibility.
- **The search picture** (`drop-shot.mjs` for items, `spawn-shot.mjs` for
  monsters) is what goes into Google Images, which ranks images it finds IN the
  page and reads the alt text and caption around them — `og:image` is a
  social-unfurl signal it does not reliably fetch. So these are real `<img>`
  elements, and `generate-seo.mjs` lists them in the sitemap's `image:` entries.
  An item's is THE GAME'S OWN ITEM CARD, photographed rather than redrawn, laid
  on a patch of the floor it drops on. A monster's is the mob staged on its
  venue at spawn scale — sprite and ground blown up by the SAME factor, so it
  reads as an encounter rather than a cut-out pasted on a map. A monster never
  wears the item card's frame: that frame is a promise about things you pick up.

Both are rendered by a headless browser (`card-shot.mjs`), not by sharp. They
are set in the game's own pixel font, and sharp rasterises SVG through librsvg,
which resolves fonts via fontconfig and cannot see the packed WOFF2 — every
string came out in a system sans. The item card in particular is PHOTOGRAPHED
because redrawing it would be exactly the lookalike this site exists not to
have: the shot loads the same markup, the same `item-card.css` the game imports,
and the same webfont, so the picture is the card by construction.

**The pictures are a DEPLOY-TIME step, not a per-commit one.** They are the only
part of the build that needs a browser and by far the slowest, and their answer
changes only when the content does — so `LIBRARY_IMAGES_DIR` gates them, and it
is set only by `pages.yml` and `library-images.yml`. Every other job builds with
them off, and a page then wears the site's shared default card and omits its
drop figure; `check-seo` passes either way.

They are cached rather than committed. A set is ~32 MB and git keeps every
version forever, so a few regenerations would put the repo into gigabytes. The
Actions cache is keyed on a HASH of everything the pictures are drawn from
(`content/**`, `pwa/scripts/library/**`, the two shared skins, `asset-tools/**`,
`game.config.json`), which beats a nightly rebuild in both directions: it never
regenerates a set nobody changed, and it cannot serve a stale one. What makes a
deploy correct is that `pages.yml` GENERATES on a cache miss — `library-images.yml`
only warms the keys, and cannot get ahead of a content merge, since the same push
that invalidates the key also starts the deploy. Keep the two workflows' key
expressions identical or the deploy will never hit what the warm job builds.

**THE HASH IS OF THE SLOT'S OWN CHECKOUT, which is why each slot builds on its
own runner.** A set belongs to a CONTENT STATE, and the deploy holds two of
them: `main`'s, for `/preview/`, and the release tag's, for `/`. Hashed from a
single `main` checkout — as it was while all three slots shared one runner —
the released set's key moved every time `main`'s content did, so the tag's
pictures were evicted and redrawn from scratch on every deploy: four minutes of
browser work per push, to repaint a release that had not changed. Keyed per
checkout, the tag's key is fixed between releases and hits every time. Two slots
on the same content compute the same key and share the set, which is correct —
no URL is baked into any picture.

The browser pass itself runs a LANE PER CORE (`card-shot.mjs`), and **a lane is
a whole browser** — with a pair of pages on it, the element stage and the
1200×630 frame stage, because a card job shoots both. The unit is the BROWSER
rather than the page because that is where the ceiling is: every screenshot is
marshalled over CDP by the single browser process, so adding pages to one
browser stops paying (4m52 → 3m46, and eight moved nothing) where adding
browsers keeps paying (2m36).

Encoding is picked per surface. A search shot is WebP — Google Images handles it
and it is a tenth of the PNG. A social card stays PNG, because some unfurlers
still handle WebP badly and a broken link preview costs more than the bytes; it
is quantised with DITHER, since flat 256-colour banded the card's gradient and
its rarity halo into visible rings. Together that is ~143 MB of deploy down to
~32 MB, against a 1 GB Pages budget.

**What the pages ask for is the app.** Every page ends on a call to action, and
it is the STORE build — the same game plus what a browser cannot give it. Each
storefront is pitched on what IT adds, because they do not add the same thing:
the phone build brings haptics, an audio session that plays through the ringer
switch, Game Center, and a roster and coin bank that follow the player between
devices; the desktop build brings Steam Cloud and Steam achievements, and is
bought once with no coin store in it. The two are driven by `appStoreUrl` and
`steamUrl` in `game.config.json`, each rendering NOTHING while its field is
empty: hundreds of pages carrying a dead or guessed link is worse than the same
hundreds carrying none, so filling those fields is the whole of turning them
on. The library deliberately does not advertise the free web build — the App
Store listing's own homepage link points back here, and a reference page talking
a buyer out of the purchase would close that loop the wrong way round.

Improve it with the `library-improvement` skill (generate → screenshot → judge →
fix the generator → loop).

## Deployment topology

GitHub Pages serves three deploy slots on one origin — the `siteUrl` in
`game.config.json`, a custom domain (CNAME) on the GitHub Pages origin —
assembled by a single `pages.yml` run into one artifact:

| Slot       | URL         | Source                                                                                     | Indexed        |
| ---------- | ----------- | ------------------------------------------------------------------------------------------ | -------------- |
| Production | `/`         | Highest `v*` tag (or `main` whenever no release can be rebuilt)                            | Yes            |
| Staging    | `/preview/` | `main` HEAD, every push                                                                    | No (`noindex`) |
| Branch     | `/branch/`  | Last branch parked via `workflow_dispatch`, persisted in the `branch-deploy` orphan branch | No (`noindex`) |

Each slot is built separately with its own `VITE_BASE`, gets its own service
worker scoped to its base, and a disjoint precache id (`game`,
`game-preview`, `game-branch`) so the builds never poison each other. The
production worker's scope covers the nested slots, so it carries a
navigation denylist and refuses to answer their navigations.

The precache id is a PREFIX, not a cache name: each build's worker owns
`<cacheId>-precache-<build>` and sweeps the slot's older ones on activation.
The separator is what keeps the sweep honest — `game-preview-precache-…` is not
inside `game-precache-…`, so releasing to `/` never deletes `/preview/`'s
offline copy.

**THE TWO SECONDARY SLOTS KNOW WHO IS LOOKING AT THEM.** Nobody arrives at
`/preview/` or `/branch/` by searching — they are looked at by the person who
pushed the commit — which is what makes them `noindex`, and what makes the
title footer's version a LINK there and plain text everywhere else: it opens
the exact commit the build was cut from, so "is this my change, or did I beat
the deploy here?" is a tap instead of a hash to copy and paste into a search
box. Both facts read the same predicate (`isSecondarySlot`, pwa-plugin.ts) and
the link itself is the build-time constant `__BUILD_COMMIT_URL__`, EMPTY on
every other build — so the released site ships neither the anchor nor the URL.

That commit is resolved with `git rev-parse HEAD` in the checkout, **not** from
`GITHUB_SHA`, and the distinction is the whole of whether the link is honest:
every leg builds from its own ref (the tag, the pushed sha, the dispatched
branch) while `GITHUB_SHA` is fixed to the commit that TRIGGERED the run, so a
`/branch/` build read from the environment stamps itself with whatever `main`
commit kicked the deploy off. The environment is only the fallback for a tree
with no git dir.

**THE BUILD LABEL FOLLOWS THE SAME RULE, AND ON `/` IT IS NOT COSMETIC.** The
label `version.json` publishes and the update prompt reads is the same resolved
commit, stamped into `sw.js` as its `// Build:` line — so the ROOT slot, rebuilt
from its tag on every deploy, now produces a byte-identical worker until the tag
itself moves. Taken from the environment it did the opposite: every push to
`main` restamped a build whose content had not changed, and since a worker's
bytes changing IS how a browser discovers an update, an installed home-screen
app on `/` was prompted to install what it already had. Nothing was lost by
dropping the manufactured difference, because there was never anything to
manufacture: the worker's `PRECACHE` is a list of content-hashed filenames, so a
site that really changed changes `sw.js` on its own.

**SEPARATELY MEANS ON ITS OWN RUNNER.** A run is `resolve → build (one leg per
slot, in parallel) → assemble → deploy`: `resolve` answers the one question a
leg cannot answer for itself (which tag, if any, `/` serves) and emits the slot
list as the build matrix; each leg checks out ITS OWN ref, installs that ref's
lockfile and uploads its `dist` as an artifact; `assemble` merges the artifacts
into the Pages tree. The slots share nothing but that tree, so running them one
after another inside a single job — checking the tag out over the top of `main`,
reinstalling, building, checking `main` back out — spent three builds of
wall-clock on three builds of work. `assemble` is also the only job that writes
to git, which keeps the `/branch/` slot's orphan-branch bookkeeping (persist a
freshly dispatched build, rehydrate the last one otherwise) in one place instead
of in the middle of a build.

**The production slot is REBUILT from its tag on every deploy, so a release is
only servable while today's runner can still install that tag's own lockfile.**
Nothing is archived — each run checks the tag out, runs `npm ci` against the
lockfile as it was at release time, and builds. `pages.yml` therefore checks
the resolved tag before committing to it and falls back to `main` at `/` when
it cannot be rebuilt, with a `::warning::` naming the tag; the next release
puts the root slot back on a tag. It has already happened once, to tags cut
while the repo still pulled a scoped package from a private registry CI no
longer carries a token for — npm fails on the unset variable before it reaches
the network. So: **the build must stay installable from public
registries alone**, or a release becomes unservable the moment the credential
goes away.

**One build flavour differs, and only one: the STORE UPLOAD.** The website
carries the DEVELOPER tooling — the hidden sun reveal (sixteen taps to arm, the
first ten of them answered by nothing at all, then the click race —
`use-sun-charge.ts`, `sun-race.ts`), the DEVELOPER menu tree behind it (the
PLAYGROUND warps, the CHEATS, the BALANCE and VISUALS knobs, the GALLERIES and
the `?effects` deep link, DEBUG MODE), and the build's commit hash beside the
version in the title footer (a LINK to that commit on the two secondary slots —
see above) — in **every** slot and every build: `/`, `/preview/`, `/branch/`, local
dev, the installed PWA, and every non-`production` shell build. The exception is
the binary a storefront receives, and each shell reaches it the same way: the
App Store / Play Store upload comes from the `production` EAS profile, and the
Steam depot from `electron/`'s `release:*` targets or `make desktop-tauri-steam`,
both of which run their own `bundle-web.mjs --profile production`. Each of the
three `bundle-web.mjs` scripts builds the embedded
site with `VITE_DEV_TOOLS=off`, which `pwa/vite.config.ts` turns into the
build-time literal `__DEV_TOOLS__ = false`. Because it is a literal, every gate
on it folds away and Rollup drops the tooling's modules and lazy chunks — the
surfaces are absent, not merely hidden — and the commit hash is never embedded.
`settings.ts` also resets the developer-owned settings on load in such a build
(`stripDeveloperState`), so a latched unlock, a FORCE STORE granting free coin
packs, or a set of BALANCE multipliers left by a TestFlight install on the same
device cannot govern the shipped game after an update.

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

## Extension points (for improved mechanics)

New _content_ on an existing mechanic is pure data — a new enemy, weapon,
level, or ability is a catalog entry, no code. New _archetypes_ (a mechanic
the engine has no shape for yet) require touching a closed union and each
site that switches on it. The unions and their handler sites:

| Union (types.ts / defs)           | Members                                                                                                                                                                                                                          | Handler sites to extend                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EnemyRole` (defs/enemies/)       | `minion` \| `elite` \| `boss`                                                                                                                                                                                                    | `step/` enemy AI (aggro/guard/boss branches, last-stand), `create.ts` boss-spawn detection, `render/enemies.ts` hp bars                                                                                                                                                                                                                                       |
| `AbilityKind` (defs/abilities.ts) | the `ABILITY_BLOCKS` list — `orbit` \| `storm` \| `stasis` \| `nuke` \| `magnet` \| `trail` \| `barrier` \| `rain` \| `phase` \| `well` \| `surge` \| `pulse` \| `volley` \| `turret` \| `ward` \| `singularity` \| `immolation` | capability-object dispatch in `abilities.ts` + `step/powers.ts` (the classics) / `step/powerups.ts` (the campaign powers); the passive kinds are read where they bite (`absorbPlayerDamage`, `weaponDamageFor`/`weaponCooldownFor`); visuals in `render/powerups.ts` + `render/powerup-bursts.ts` + `game-screen/powerup-aura.ts`; the schema's `KIND_BLOCKS` |
| `Item["kind"]` (types/world.ts)   | `medkit` \| `xp` \| `repair` \| `drink` \| `ammo` \| `gold` \| `equipment` \| `ability` \| `story` \| `quest`                                                                                                                    | the pickup switch in `step/items.ts`; the item-sprite switch in `render/items.ts`                                                                                                                                                                                                                                                                             |
| `Affix["kind"]` (types/core.ts)   | `damagePct` \| `maxHp` \| `maxHpPct` \| `crit` \| `armor` \| `armorPen` \| `knockback` \| `stat` \| `statPct` \| `spell` \| `proc` \| `sureStrike`                                                                               | the affix readers under `items/` (`effectiveStat`/`computeMaxHp` in `derived.ts`, `playerCritChance`/`absorbPlayerDamage` in `combat-stats.ts`, `weaponDamage`/`weaponScore` in `weapon-math.ts`), and `spells.ts` for the granted-spell/proc kinds                                                                                                           |
| `Quality` (types/core.ts)         | `broken` \| `crude` \| `normal` \| `superior` \| `perfect`                                                                                                                                                                       | config `QUALITY.mults`/weights, `QUALITY_PREFIX` (defs/equipment.ts), the roll in `items/quality.ts` `rollQuality`                                                                                                                                                                                                                                            |

**Checklist to add an archetype:** union entry → def field(s) it needs → the
`step/` (or `items/`/`abilities.ts`) handler branch → a `GameEvent`
variant if the app must react → a headless test in `tests/` → the render +
SFX mapping in `pwa/`. The `noFallthroughCasesInSwitch` /
`verbatimModuleSyntax` compiler settings make a missed switch arm a type
error, so the compiler points at every site you still owe.

## Making a sequel / new game

A sequel is a clone of this repo with the first game's content stripped and
new content built on the same engine. The mechanical playbook is the
`new-game` skill (`.agent/skills/new-game/SKILL.md`): rename via
`game.config.json`, strip the content catalogs and this game's docs/tests,
then rebuild content with the `engine-system`, `pixel-assets`,
`sound-effects`, and `playtest` skills. This game's content walkthrough lives
in [`game-content.md`](./game-content.md) so a sequel replaces it wholesale.

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
- **Generated assets over binaries** — sprites, tiles, and the UI font
  render into two atlases (sprite atlas + font atlas) that are gitignored
  and rebuilt on every build, never committed; their sources of truth are
  reviewable text (pixel grids, palette ramps, glyph definitions) rendered
  by `make assets`. Art is diffable and agent-editable like any other code,
  and the binary atlas never shows up in a diff or merge conflict.
- **Synthesized audio over audio files** — every sound is a handful of
  WebAudio oscillator/noise parameters authored in `content/sounds/`, and
  the background music is tracker-style score data (one file per track
  under `content/music/`, instruments + patterns + arrangement) played by a
  small sequencer (`@ui/lib/chiptune.ts`) on the same synth. Both compile
  into `pwa/src/generated/` like every other catalog, so the offline PWA
  payload stays tiny, every tune is a diffable text file, and a Workshop
  mod can author either.
