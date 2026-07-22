# Architecture

## The shape of the project

This is a **webapp-kind** project per OSS_SPEC §11.4: the deployed website
_is_ the game. There is no marketing site — every build artifact is the
playable app.

Two layers with a one-way dependency:

```
pwa/  (the app: Vite + React PWA shell, rendering, deploy concerns)
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
The def accessors read an overridable registry, so `registerDefs(...)` can
swap the active catalogs for a custom set — the engine test suites use it to
run against synthetic fixtures with no shipped content (see
`tests/engine/fixtures.ts`).

- **`src/game/config/`** — the GLOBAL balance knobs (player, jumping, XP
  curve, stat effects, loot rules), one module per system re-exported by an
  `index.ts` barrel, nothing hardcoded in logic.
- **`src/game/defs/levels/`** — the level registry. Levels are authored as
  **YAML** (`content/levels/<id>.yaml`, one file per level) and
  compiled into `src/generated/levels.ts` by
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
  track id (a key into the app's `LEVEL_TRACKS` registry — the engine stays
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
  in `crates.ts`), deliberate `walls` (segments expanded into chains of solid circles
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
  availability is the global monster-level gate, not per-level data; a
  `worldUniques` table may carry a `worldDropMult` sweetener on a farm
  venue). **Design-zone systems** (`src/game/zones.ts`) shape a map's feel:
  `safeZones` (no spawns + the horde repelled out — a breather pocket),
  `quietZones` (dead areas: no ambient horde, but authored chests + a pinned
  unique still live there), a `tempo` curve (keyframes that scale wave pressure
  over the run — build and release instead of a flat ramp), `chests` (placed
  containers with a richer haul than a crate), and `merchantSpawns` (authored
  trader spots).
- **`src/game/defs/enemies/`** — the monster catalog. Enemies are authored as
  **YAML** (`content/enemies/<biome>/<id>.yaml`, one self-describing file
  per mob, stem == id) and compiled into `src/generated/enemies.ts` by
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
  `src/game/ranged.ts`), and with `takesCover` it hides behind the level's
  solid obstacles between shots. A unique may be GUARDED
  (`EnemyDef.shieldedBy`): it cannot be hurt while any enemy with a listed
  def id lives — blows bounce with an `enemyShielded` event — so a set-piece
  boss is wired to its controllers. This game's
  actual roster (and the story it tells) is in
  [`game-content.md`](./game-content.md).
- **`src/game/defs/companions.ts`** — the companion catalog: who a spared
  unique becomes. Each def carries the sprite family (the enemy twin's), a
  base hp that grows with the companion's OWN level, a signature starting
  weapon, an optional party-wide `aura` (LUCKY's +50% magic find), an optional
  signature `nova` (RASPUTIN's FROST NOVA — a chilling pulse that damages and
  slows the foes around him), an optional signature `power` (how the companion
  gets stronger as it levels — more shotgun pellets, chain-lightning arcs, a
  wider nova, a swelling luck aura), the `joinWords` scene played the moment the
  SPARE verdict lands, and the `killQuotes` banter floated over the companion
  when its blow downs a mob.
- **`src/game/companion-stats.ts`** — pure companion stat/level/power math
  (config + def only, no engine state): the max-hp ramp, the level XP curve
  (`companionXpToLevelUp`, authored in kills like the hero's), the power RANK a
  level has reached, and the per-rank bonuses (extra pellets/chain/pierce, a
  wider/harder nova, a bigger magic-find aura). Shared by the per-tick pass, the
  kill rail that credits a companion's XP (`loot.ts`), the party's magic-find
  aura (`items.ts`), and the loadout carry — none of which it imports back.
- **`src/game/defs/story.ts`** — the story-item catalog: plot pieces
  (keycards, dossiers, recovered hardware) dropped by elites or placed in
  locked rooms. Pickups bank into `state.storyItems` (never the bag) and
  play their `lore` pages as a dialogue; an `unlocks` entry makes the item
  the key for the matching level door.
- **`src/game/defs/cutscenes.ts`** — the cutscene catalog: pure-data scenes
  (a stage of props, a cast, a beat timeline) played by the generic
  `@game/lib/cutscene` state machine. A level references scenes via its
  `prelude` field — one id, or a LIST chained back-to-back (the moon opens
  on the garage launch, then the space transit); the run then opens in the
  `cutscene` phase (the sim frozen underneath), advanced by `step()` on the
  same clock. Motion beats run on that clock — walks, fades, camera `pan`s
  (the launch's ascent: the world falls away under the climbing ship) and
  actor `shake`s (the rattling rocket) — and a stage may carry a constant
  `drift` that streams its props by per-prop `parallax` depth (the space
  transits' star field) even while a held line idles the timeline. Text
  beats crawl in letter by letter and hold until
  `tapCutscene` (JRPG-style), and `skipCutscene` bails the whole opening —
  every queued scene _and_ the hero's level-intro monologue that follows —
  landing on the level-name `title` card just before the drop. The opening
  flow is `cutscene` (if any) → `intro` (the hero's monologue) → `title`
  (the level name alone on black) → `playing`. The intro has a closing mirror: a level
  may ship `outro` pages (`LevelDef.outro`) — clearing its objective arms a
  VICTORY QUAKE (`GameState.quakeMs`, a render-side camera shake) through
  the loot-grab countdown, and the countdown then lands in the `outro`
  phase (the same black-screen paged monologue, turned by
  `advanceOutro`/`skipOutro`) before the `victory` splash.
- **`src/game/defs/equipment.ts`** — the equipment machinery. The item
  catalogs themselves are authored in YAML — one file per item under
  `content/items/<rarity>/` (`regular`/`trash` bases, `set`/`unique`/
  `legendary`/`artifact` named items, each carrying its sprite refs and a few
  sentences of `description` lore), with the make-quality axis in
  `content/item-quality.yaml` and the tier/rarity knobs in
  `content/item-rarity.yaml` — compiled by `scripts/generate-items.mjs` into
  the gitignored `src/generated/items.ts` (first in the generate chain) and
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
  budget: dropped weapons wear out per attack and break, though the starting
  sidearm and every unique/legendary find are minted unbreakable; ranged
  bases can fire pellet volleys, pierce, home, or chain), gear, the
  quality ladder (trash/regular/magic/rare/unique/legendary — each tier
  unlocks at a MONSTER LEVEL, config `LOOT.tierUnlockMlvl`; TRASH sits below
  regular, never rolls, and exists only for scripted zero-stat joke drops
  minted by a boss's forced-tier `loot.items`), and the affix
  pools magic+ items roll: magnitudes come from ilvl-gated BRACKETS
  (PoE-style generations unlocking at ilvl 1/10/22/36/52, the top one held
  near 60% of the stat soft cap), keyed to the drop's ITEM LEVEL — the
  killer's monster level minus a small weighted deficit; magic+ names are
  composed Diablo-style from those affixes. A rolled instance also grows its
  BASE with depth: armor by `ARMOR.armorPerIlvl` and weapon damage by
  `WEAPON.damagePerIlvl` per item level above the base's requirement. Two more axes complete the
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
  magic are exclusive D2-style, so magic-or-better finds, charms, and bags
  stay flat normal make with no range roll).
- **`src/game/defs/abilities.ts`** — the ability pickups: time-limited
  powers (orbiting fire orbs, storm strikes, stasis slow fields, the item
  magnet whose pull radius grows with INTELLIGENCE — and which only reels in
  gear the hero can actually keep, leaving loot a full bag has no room for
  where it lies) plus the instant
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
- **`src/game/defs/difficulties.ts`** — the difficulty ladder (EASY →
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
  hard 10, nightmare 100, JESUS uncapped), and — on EASY/MEDIUM only — how far the
  plain horde's chase speed drops once an elite or boss is ENGAGED
  (`mobPursuitNearElite`, 10%/50%, so the player can break past the swarm and
  run to the set piece). MEDIUM is the exact 1.0 baseline.
- **`src/game/abilities.ts`** — ability activation (`grantAbility`, which
  links the running copy to the dock slot it was spent from), freeing a slot
  when a power lapses or is discarded (`removeHeldSlot`, `discardHeldAbility`),
  the dock's one admission gate (`canBankAbility` — room under the cap, and a
  `uniqueHeld` power at most once), and the helpers the renderer shares
  (`orbPositions`, `stasisFactorAt`); the per-tick behavior runs inside
  `step.ts` so all damage flows through one path.
- **`src/game/spells.ts`** — the GRANTED forever powers items carry (the
  `spell`/`proc`/`sureStrike` affix kinds, config `SPELL`): deriving the
  worn loadout's granted spells (`syncItemSpells`, ranks from multiple
  sources adding), the live rank+INT-scaled numbers (`orbitSpellParams`,
  `stormSpellParams`, `stasisSpellParams`, INT shortening intervals via
  `spellIntervalScale`), proc lookups (`equippedProcs`), and the renderer's
  orb positions (`itemSpellOrbPositions`). Stepping lives in `step.ts`
  (`stepItemSpells`/`stepProcs` — procs queue on the hero's own weapon
  blows in `hitEnemy` and on enemy blows landing ON him — the D2
  "when struck" trigger, `queueStruckProcs` — and resolve after the
  combat passes).
- **`src/game/item-budget.ts`** — the bonus-budget pricing model (what a
  unique's fixed bonuses are WORTH in ilvl points, derived from the live
  combat constants). One source of truth: `scripts/weapon-ilvl.mjs` imports
  it for authoring checks, and `pickUniqueForDrop` reads it at runtime to
  derive a legendary's drop weight from its power as a POWER LAW ("stats
  determine rarity", `UNIQUE.rarityBudgetRef`/`rarityBudgetExp`): the
  roster spans a vast authored power range and the strongest are
  astronomically rare.
- **`src/game/types.ts`** — state shapes plus the `GameEvent` union: events
  are the only channel from simulation to presentation (sound, flashes);
  the engine never knows a renderer or speaker exists.
- **`src/game/create.ts`** — seeded run setup from a level def: difficulty
  bands scale with distance from the player spawn toward the objective.
- **`src/game/step.ts`** — the per-tick pipeline, in documented order:
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
  progress) → wave spawner →
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
  `input.view`) — it locks the nearest visible foe, but a desktop mouse adds an
  aim dimension: `input.aim` (the pointer's world position) biases the pick
  toward whatever the cursor points at (`AIM.biasStrength`), so foes in the
  pointer's direction outrank merely-closer ones elsewhere; the player steers,
  jumps (tap/Space), spends banked
  ability pickups (`input.useItem`), spends level-up stat points, and
  manages the inventory. Level-ups restore full health, land automatic
  base-attribute gains (see `leveling.ts` below), and celebrate first: the
  ding arms `state.levelUpFxMs` (config `LEVELING.dingCelebrationMs`) — the
  app draws the golden burn off it — and the `levelup` stat-chooser phase
  only opens once the window has burned down. Golden XP arrows are a catch-up
  faucet: a share of the current threshold while the hero is under the map and
  difficulty's `loot.arrowCapByDifficulty` level, a flat few mob kills
  (`LEVELING.arrowColdMobXpMult`, via `arrowColdXp`) once he passes it. Picked-up
  equipment that beats what is worn — and that the hero can actually WIELD, both
  the level and the attribute gate (`canEquip`) — is equipped on the spot; a
  find he is too low-level or too weak for banks until he grows into it.
- **`src/game/loot.ts`** — kill resolution: `hitEnemy` applies player
  damage (crit rolls flash the victim), pays out XP, and rolls drops —
  the level's loot table for minions (with the pity rule and the
  all-clear trophy), the def's guaranteed drops for bosses and elites.
  It also feeds the menace meter on each kill and power-scales an
  elite/boss to the player on its first blow.
- **`src/game/leveling.ts`** — the automatic base-attribute growth (the
  WoW-style ding gains, config `LEVELING.autoGainsPerLevel`): each level
  grants `round(rate × level)` points of the listed stats on its own,
  underneath the chosen point. Everything is DERIVED from `player.level`
  (`baseStatBonus`, folded into `effectiveStat`) — never written into
  `player.stats`, so a respec refunds only chosen points — and
  `autoPowerScale` expresses the damage curve those free gains produce so
  the horde's scaling can cancel it out. Two balance guards live here too:
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
- **`src/game/menace.ts`** — the escalation system: the player's rolling
  DPS/kill-rate (`tickMenace`) plus relative-overkill jolts on a killing
  blow (`bankOverkill`) bank `state.menace`, which idle time bleeds off (a
  fixed decay, also in `tickMenace`, run from `step.ts`) — but never below
  the permanent floor of the EVOLUTION RATCHET: overkills on mobs of the
  current evolution stage bank proof (`state.evoProof`; the crop's clean
  kills refund it), and enough proof lifts `state.menaceFloor` a full
  stage, at most one per `ratchetCooldownMs` — so a horde whose current
  crop keeps getting one-shot evolves stage by stage until the player's
  blows stop dropping mobs outright OR the difficulty's PEAK is reached
  (the per-rung `menaceStageCap`: easy 3, medium 5, hard 10, nightmare 100;
  JESUS uncapped — both the meter and the ratchet floor are clamped to
  `menaceCeiling`). The transient
  gain is scaled by `menaceSensitivity` — the difficulty's `menaceMult`
  times an early-game `menaceWarmup` — but the ratchet is deliberately
  difficulty-blind (warmup-damped only, up to the cap): every rung keeps
  evolving; the difficulty sizes each step (`menaceEffectMult`) and its peak
  (`menaceStageCap`), not whether it happens.
  The `menaceStage` lures a denser horde (`lureMult`, read by
  the wave spawner, its crowd growth alone capped at `lureStageCap`),
  evolves freshly-spawned minions (`evolutionHpMult`, stamped in
  `create.ts`'s `spawnEnemy` — more hp, but a WORSE loot tier roll via
  `tierPenaltyPerStage`; evolution is a challenge knob, not an xp or loot
  faucet, since kill xp is level-based), and power-matches elites/bosses when
  they engage (`enemyPowerScale`/`maybePowerScale`, called from both
  `step.ts` wake and `loot.ts` first-hit). POWERUP output — the screen-nuke
  bomb, fire orbs, and storm cell — is exempt from all of this: `hitEnemy`'s
  `noMenace` flag books its damage/kills into `state.menaceExemptDamage` /
  `menaceExemptKills` (so `step.ts` nets them out of the rolling DPS/kill-rate
  `tickMenace` reads) and makes `killEnemy` skip `bankOverkill` entirely, so a
  consumable clearing the screen never jolts, lures, or ratchets — menace
  answers only the hero's own weapon. Separately from that moment-to-moment
  heat, the hero's POWER LEVEL (`heroPowerLevel`) is simply his CHARACTER
  level: neither his gear rack nor his weapon damage toughens the horde any
  more, so out-gearing the campaign makes the fights easier (as it should)
  and the menace EVOLUTION ratchet — not an hp match — answers a steamrolling
  build. (`heroGearLevel`/`heroDamageLevel` survive only as `src/sim` analytic
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
- **`src/game/tuning.ts`** — runtime BALANCE TUNING: ~10 developer
  multipliers over the shipped config (XP gain, hero/mob damage, mob hp,
  horde size, drop rate, gear share/quality, unique drops, menace gain),
  each applied at the one read site that owns its rule so the knob moves
  every surface of the rule together. Neutral (all 1) by default and
  clamped on the way in (`setBalanceTuning`); the app persists the values
  with the settings and applies them on load, and the hidden DEVELOPER →
  BALANCE menu cycles them at runtime.
- **`src/game/hazards.ts`** — environmental hazards, both pure level data:
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
  helpless (no move/attack/cast/item — every player pass is gated on the timer)
  for `SANDSTORMS.knockoutMs` while the storm passes over him, fades, and
  vanishes; he gets up on `knockoutRecovered`. Related:
  **apparitions** (`EnemyDef.apparition`, config `APPARITION`) are
  dialogue-only figures the combat/hazard paths all skip — they rush in to
  speak like any elite, then walk off and dissolve (`apparitionVanished`).
- **`src/game/story.ts`** — the story systems: dialogue lifecycle
  (`wantsDialogue`/`startEnemyDialogue` inside the step,
  `advanceDialogue` as the player's tap, `muteDialogue` for the overlay's
  MUTE button — it latches `dialogueMuted`, silencing every in-world scene
  for the rest of the level (a fresh level un-mutes). The DISPLAY-settings
  toggles ride the same rails: `setDialogueEnabled(false)` starts every fresh
  run muted (create.ts), and `setCutscenesEnabled(false)` drops the prelude
  cutscenes at level build so a run opens straight on the intro. `dialogueContent` for the
  renderer — its `heroPages` flags mark the pages the HERO speaks in a
  two-way arrival scene, authored as `{ hero: [...] }` entries in
  `EnemyDef.dialogue`), story-item collection, and `stepDoors` (a carried key
  removes its door's obstacle chain). Dialogue freezes the run in the
  `dialogue` phase exactly like the level-up chooser. An elite/boss
  ARRIVAL scene additionally lends the stage to the bag
  (`canOpenInventory` in items.ts): `openInventory` works mid-scene so
  the player can equip a fitting weapon for the fight, and
  `closeInventory` hands the stage back to the speaker on the same page;
  every other scene (last words, thoughts, lore) stays read-only.
- **`src/game/companions.ts`** — the COMPANION system and the SPARE-or-KILL
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
  up forever across every level and difficulty. A companion beaten down in a
  swarm STAYS down (`COMPANIONS.downedCombatRadius` freezes the revive count
  while a foe is on it) until the field clears or the hero speaks to the
  wandering merchant, who stands the whole party back up
  (`reviveDownedCompanions`, called on merchant discovery / return greeting /
  shop-open — so it works in hardcore too). A spared companion's
  enemy twin is also held off the board while it rides the party (create.ts),
  so a replay never pits the hero against his own ally. The UI's
  mutators are `equipCompanionFromInventory` / `unequipCompanionToInventory`
  (weapon/helmet/chest only) and the `companion` pause-phase toggles
  `openCompanionPanel` / `closeCompanionPanel`; the party rides the loadout
  (`Loadout.companions`, with each companion's earned level and XP) between
  levels.
- **`src/game/map.ts`** — the level map and its fog of war: run-scoped
  exploration as a coarse byte grid on the state (`state.explored`, one cell
  per config `MAP.cellSize` world px), stamped as a `MAP.revealRadius` CIRCLE
  around the hero every step (`revealAround`, called from `step()`; the spawn is
  pre-revealed at creation) and queried with `isExplored` — the fog lifts along
  his path (Warcraft-style, no re-fogging), feeding both the minimap and the
  MAIN-VIEW fog of war (`render.ts` `drawFog`): everything uncovered reads
  fully clear, never-explored terrain is solid black, and the frontier between
  them is a graded ordered-dither transition band (`MAP.fogBand` wide) that also
  hides any mob standing in it or the dark beyond. A sibling render-side cull
  drops any enemy the hero has no LINE OF SIGHT to — one tucked fully behind a
  wall or boulder — reusing the engine's `lineOfSight` (`src/game/obstacles.ts`,
  the same tall-obstacle query that stops shots); a mob only peeking out from an
  edge still draws. Memorable events pin
  `state.mapMarkers` via `addMapMarker` — story-item finds (story.ts),
  unique/legendary pickups (the pickup switch in step.ts), and elite/boss
  victories including fled uniques (loot.ts). `openMap`/`closeMap` toggle the
  `map` pause phase (frozen sim, level-up priority on close) for the HUD's
  MAP button / the M key.
- **`src/game/merchant.ts`** — the WANDERING MERCHANT and his coin economy
  (config `MERCHANT` / `ECONOMY`): one trader per level (`state.merchant`,
  minted at creation on his own seeded rng stream — parked as a plain
  `rngState` number so a saved run freezes him losslessly — and never
  drawing the run's stream, so his existence reshuffles no loot roll).
  He wanders until met; the first close encounter (`stepMerchant`, inside
  the step) roots him for good, pins the map (`merchant` marker), rolls his
  stall against the hero's level, emits `merchantDiscovered`, and plays the
  level's greeting scene (`LevelDef.merchant` — sprite, name, and pages;
  the words live in `docs/manuscript.md`). A level may also list stall
  UNIQUES (`merchant.stockUniques`): named uniques the stall MAY carry,
  each rolled at the standing boss-unique odds when it stocks — the same
  rarity as a unique drop, sold across the counter instead. His ward (`repelFromMerchant`,
  called from the enemy pass) keeps the horde `MERCHANT.repelRadius` off
  the stall — bosses and apparitions excepted. `openShop`/`closeShop`
  toggle the `shop` pause phase (proximity-gated); `sellItem`/`buyStock`
  are the UI's trade mutators, and `sellValue` is the one valuation every
  price tag reads — item level × tier orders of magnitude × material
  (metal ×2, precious ×4, from the equipment defs). `repairGear` mends the
  whole kit (worn weapon + armor + every breakable bag piece, via
  `repairAll`/`repairAllCost` in items.ts) for coins, priced up by each
  piece's required level, rarity, and make (config `ECONOMY.repair`). Coins
  live on the player and ride the loadout between levels. Once the hero has
  MET a map's trader (persisted per level+difficulty in the character's
  `merchantsMet`, fed back through `createGame`'s `merchantDiscovered`),
  `revealMerchant` sets him up at the door from the first tick of every later
  visit — so a death-and-restart reaches the counter to repair — and he gives
  a per-level + per-difficulty "welcome back" line on approach
  (`LevelDef.merchant.returnGreeting` + `MERCHANT_RETURN_SENDOFF`).
- **`src/game/items.ts`** — equipment instances and the player-driven
  mutations the UI calls into: loot rolls, `equipFromInventory` /
  `unequipToInventory` / `moveInventoryItem`, the one-tap bag tools
  (`autoEquipBest` — wear the best wearable piece in every slot at once,
  weapons by the build-aware `weaponScore`; `scrapInferiorLoot` — cull every
  outgrown find), `allocateStat` (plus the
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
  `weaponRangeFor`, swing/fire cadence `weaponCooldownFor` — the catalog
  cooldown slowed by the global `WEAPON.baseCooldownMult` and quickened by the
  speed stat — and the swing cone `weaponSweepHalfAngle` that, capped by
  `maxMeleeTargets` (INT raises the cap), makes a swing cleave the nearest few
  monsters it faces), the auto-equip scoring (`weaponScore` DPS /
  `gearScore`) and the crit-inclusive `weaponDps` the item cards lead with,
  the pickup-card upgrade read (`wouldUpgradeSlot`, which scores gear SPEC-aware
  via `specGearScore` — a `+STAT` roll weighted by the hero's own allocation —
  so an off-spec find no longer flashes UPGRADE or offers a tap-to-equip),
  and the durability cycle
  (`wearEquippedWeapon` — a weapon worn to zero is NOT trashed: it falls into
  the bag as a broken, unequippable spare (`isWeaponBroken`) and the best
  wieldable bag weapon takes over, never defaulting to the sidearm while a good
  weapon remains; `wearWornArmor` — armor spends a point per landed hit
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
- **`src/game/bot.ts`** — the autopilot: pure strategies (`idle`, `rush`,
  `kite`, `boss`, `survivor`) that turn the live state into ordinary
  `GameInput`, so a bot can sit anywhere a player does — headless tests,
  the app's `?bot=` autoplay mode, and later an AI-driven second player. The
  macro plan treats the map's ELITES and boss as objectives (rough-cell
  targets it hunts once boss-ready, rushing them when leveled), marches on
  the nearest enemy after a fightless lull (the anti-loiter hunt), and takes
  an externally-pinned GPS nudge via `setBotWaypoint(bot, target)` — a world
  coordinate the bot routes to and tends toward until it arrives. Its
  positioning is data-tuned: `src/game/bot-tuning.ts` holds the `BotTuning`
  schema + neutral defaults, and `botTuningFor(levelId)` resolves the
  hand-authored `content/bot.yaml` (a global `default` layer + per-level
  overrides, compiled to `src/generated/botTuning.ts` by `make levels`, mirroring
  `ladder.yaml`). See the `bot-improvement` skill.
- **`src/game/autopilot.ts`** — AUTO PILOT, the coin-metered self-play mode:
  the player engages the engine bot on their own hero from the pause menu and
  pays for the ride in coins per SIMULATED second (`AUTOPILOT.coinsPerSecond` ×
  the speed rung; the offered rungs are `AUTOPILOT.speeds`, 1×–16×, which also
  fast-forward the app's game loop — so a faster ride pays a premium per real
  second). The engine owns the meter: `startAutopilot`/`stopAutopilot`/
  `setAutopilotSpeed` mutate the `GameState.autopilot` block and `stepAutopilot`
  bills inside `step()` (only while `playing`), disengaging with an
  `autopilotStopped` event when the purse runs dry. Routing between runs is
  `autopilotNextLevel` (a session engaged on an already-cleared level PINS to
  it and farms it forever; otherwise advance the campaign → farm the endgame
  level once the difficulty is beaten; a secret level always returns through
  its own `exitTo` door);
  the APP performs the travel and the death-restarts (GameScreen's flight
  director), reuses `botAct` for the steering, and shows the session's special
  finds in an upgrade feed (`pwa/src/game/AutopilotOverlay.tsx`).
- **`src/game/scenario.ts`** — test scenarios: `applyScenario(state, spec)`
  mutates a fresh run into an exact declared situation (hero position and
  vitals, build, gear, cleared field, silenced waves, spawned mob rings) for
  bug repros, performance probes, and visual checks. Fed by the app's
  `?scenario=` URL param and the engine test suites — a developer tool, not
  a gameplay system (see the `test-scenario` skill and
  `docs/configuration.md`).
- **`src/lib/`** — generic, game-agnostic helpers (`vec.ts`, `rng.ts`,
  `cutscene.ts` — the deterministic beat-machine cutscene player),
  imported via the `@game/lib/*` alias and earmarked for extraction into
  oss-framework once mature (extraction is then a prefix swap).
- **`src/sim/simulate.ts`** — the headless campaign simulator (see the
  `simulate-run` skill): `simulateLevel`/`simulateCampaign` drive the real
  engine — createGame, step, the autopilot, auto-equip, loadout carry —
  through whole levels and whole campaigns at full speed and return typed
  balance reports (hero/mob hp and damage, drops, weapon swaps, deaths, XP
  withheld by the per-map caps). Deliberately NOT exported from
  `src/index.ts` — the CLI (`scripts/simulate-run.mjs`, via
  `scripts/game-alias-loader.mjs` for the `@game/lib` alias) and the tests
  import it directly, so the public engine API stays what the renderer
  needs.
- **`src/index.ts`** — the public surface the app imports via `@game/core`.

`src/output.ts` remains the central output module (OSS_SPEC §19.4) through
which all diagnostic output flows: semantic helpers
(`status`/`warn`/`info`/`header`/`error`/`debug`), an always-on in-memory
log buffer (`recentLogs()`), and a debug switch (`?debug` URL param or
`setDebugEnabled`). Raw `console.*` calls outside this module fail lint.

### `pwa/` — the app

A Vite + React 19 shell that mounts the engine and owns everything
deploy-shaped:

- **`pwa/src/App.tsx`** — the app shell: splash main menu ↔ the game,
  plus the cutscene workbench route (`?cutscene=<id>`).
- **`pwa/src/game/`** — the presentation of the engine:
  `TitleScreen.tsx` (the Doom-style splash menu: starfield, logo,
  keyboard-and-pointer navigation, NEW GAME → the difficulty ladder,
  SETTINGS → controls + volumes, HOW TO PLAY → a self-playing demo run),
  `GameScreen.tsx` (canvas
  mount, fixed-timestep loop, control-scheme input mapping, HUD with hp/XP
  bars and the banked-item USE button, end-of-run splash),
  `IntroOverlay.tsx` (the level's story text box + chosen difficulty),
  `CutsceneOverlay.tsx` (draws a running scene — backdrop, props, cast,
  fade — while the engine sits in the `cutscene` phase; dialogue floats in
  a box over the stage bottom and waits for TAP, SKIP ends the scene) and
  `CutscenePreview.tsx` (the
  `?cutscene=<id>` workbench that loops one scene outside any run),
  `LevelUpOverlay.tsx` (the stat chooser shown while the engine pauses in
  `levelup`; folds into a 3×2 grid on landscape phones),
  `RespecOverlay.tsx` (the respec — a Diablo-style attribute
  screen shown in the `respec` phase, with a −/+ stepper per stat and a
  CONFIRM gate; shares the stat catalog with the level-up chooser via
  `statChoices.tsx`),
  `InventoryPanel.tsx` (the Diablo-style bag: drag-to-equip slots,
  tier-colored borders, item card, character sheet), `MapOverlay.tsx` (the
  fog-of-war level map shown in the `map` phase — one chunky pixel of
  terrain per explored fog cell, dark where the hero hasn't been, with a
  legend of event pins: story finds, elite/boss kills, the merchant, and the
  hero's own position), `render.ts` (camera +
  sprite drawing onto a world-unit canvas upscaled with `image-rendering:
pixelated`; enemies swap to generated wounded sprite variants as hp falls
  per `config.WOUNDS`, and a boss in its last stand flickers),
  `tiers.ts` (tier name colors), `sfx/` (engine events →
  synthesized 16-bit-palette sounds, organized by domain: `ui.ts`,
  `combat.ts`, `world.ts`, `pickups.ts`, `jingles.ts` behind `index.ts`),
  `music/` (one score file per track — `title.ts`, `level.ts`,
  `spacez.ts` — each holding all instruments + notes as tracker-style
  pattern data, arranged to loop at ~2 minutes; `index.ts` owns the single
  player and a `LEVEL_TRACKS` registry, so a level's `music` id selects its
  theme and `playLevelMusic(trackId)` switches cleanly between levels),
  `audio.ts` (one shared synth split into SFX/music volume views),
  `settings.ts` (persisted control-scheme + volume settings), `characters.ts`
  (persistent named **characters** — the Diablo-style save model: each hero
  owns one evolving build carried into every difficulty, plus per-difficulty
  clear/beaten bookmarks that unlock the ladder in order and open a
  difficulty's free level-select once beaten; a SOFTCORE death banks the run's
  build so the hero keeps the levels, stats and items earned it and just
  restarts the level, while HARDCORE is per-character permadeath — a death
  retires the hero for good, chosen at creation in `CharacterScreen.tsx`),
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
  registries — and the persisted unlock store built on the oss-framework
  achievements ledger; `AchievementsScreen.tsx` is the browsable shelf
  reached from the title menu's ACHIEVEMENTS screen, and
  `AchievementToast.tsx` the gold unlock banner that still fires in-run as
  badges are earned),
  `assets.ts` (loads the generated sprite atlas — one PNG + JSON source
  rects sliced into per-sprite bitmaps in a single decode — plus the pixel
  font), and `assets/` (the generated atlas + font atlas — never
  hand-edited).
- **`pwa/src/lib/`** — generic game UI plumbing imported via the
  `@ui/lib/*` alias and earmarked for oss-framework extraction:
  `game-loop.ts` (fixed-timestep rAF loop), `pointer.ts` (pointer gestures:
  hold/hover steering state, taps with finger count, press edges),
  `synth.ts` (WebAudio SFX synth with 16-bit voice features — attack
  envelopes, detuned dual oscillators, vibrato, stereo pan, biquad
  filters, and a shared SNES-style echo bus; the game ships zero audio
  files), `chiptune.ts` (the 16-bit-style music sequencer: named
  instrument patches + patterns + an order arrangement, scheduled on the
  synth), `pixel-font.ts` + `PixelText.tsx` (runtime renderer for
  the generated bitmap font), `flag-store.ts` (a persisted string-flag set
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
  The atlas and previews are both gitignored and regenerated on every build
  (`npm run assets` runs ahead of `vite`/`tsc`/`vitest`), so the pixel grids
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
  and `precache-manifest.json` at build time (the pattern is borrowed from
  the oss-framework demo). The worker precaches the app shell, parks new
  builds in `waiting`, and only takes over when the player accepts the
  update toast — a mid-run silent refresh would destroy the run.
- **`pwa/src/app/pwa.ts`** — the per-slot precache cache id shared by
  the plugin (Node side) and the app (browser side).
- **`pwa/scripts/`** — source-data extraction (§11.2), SEO generation
  (sitemap/robots/llms/404, §11.3), and the structural SEO checker
  (§11.3.10).

The app consumes
[`@niclaslindstedt/oss-framework`](https://github.com/niclaslindstedt/oss-framework)
for local-first PWA plumbing (today: the `usePwaUpdate` lifecycle hook; the
"a new version is ready" prompt itself is the game's own sprite-styled
`pwa/src/game/UpdateModal.tsx`, in place of the framework's plain
`UpdateToast`, so it matches the pixel-art dressing). Game-agnostic code is
kept in the dedicated `src/lib/` and
`pwa/src/lib/` areas so it can be extracted into the framework for reuse
in later games once it has matured through playtesting — see `AGENTS.md` for
the policy.

### `native/` — the native shell (optional third layer)

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
  native side (`native/src/nativeHaptics.ts`) and replayed on the Taptic Engine via
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
  hero, whenever — the remainder just stays banked. The web side
  (`pwa/src/game/store.ts` catalog/bank/ledger +
  `pwa/src/app/storeBridge.ts` protocol client) talks to the native half
  (`native/src/storePurchases.ts`, StoreKit / Play Billing via `expo-iap`) over
  the WebView message channel. Paid transactions stay unfinished until the
  web side persists the credit, so an interrupted purchase is redelivered on
  the next launch rather than lost; a persisted ledger of transaction keys
  keeps redelivery from double-crediting. Payment is only demanded by real
  store distributions (`EXPO_PUBLIC_STORE_PAYMENTS=required`, set solely by
  the `production` EAS profile) — dev/preview/TestFlight builds grant packs
  `FREE` through the same flow, and the DEVELOPER → FORCE STORE switch
  surfaces the free store in any browser/PWA build.

`native/app.config.js` reads brand identity from `game.config.json` (never
re-hardcoding it) and pins the EAS project id; `native/eas.json` holds the build
profiles. Builds are **manual only** — locally via `eas build`, or the
dispatch-only `.github/workflows/native-build.yml` — so paid EAS build minutes are
never spent on a push. See `native/README.md` for the full build/distribute flow.

## Deployment topology

GitHub Pages serves three deploy slots on one origin — the `siteUrl` in
`game.config.json`, a custom domain (CNAME) on the GitHub Pages origin —
assembled by a single `pages.yml` run into one artifact:

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

## Extension points (for improved mechanics)

New _content_ on an existing mechanic is pure data — a new enemy, weapon,
level, or ability is a catalog entry, no code. New _archetypes_ (a mechanic
the engine has no shape for yet) require touching a closed union and each
site that switches on it. The unions and their handler sites:

| Union (types.ts / defs)           | Members                                                             | Handler sites to extend                                                                                              |
| --------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `EnemyRole` (defs/enemies/)       | `minion` \| `elite` \| `boss`                                       | `step.ts` enemy AI (aggro/guard/boss branches, last-stand), `create.ts` boss-spawn detection, `render.ts` hp bars    |
| `AbilityKind` (defs/abilities.ts) | `orbit` \| `storm` \| `stasis` \| `nuke` \| `magnet`                | capability-object dispatch in `abilities.ts` + `step.ts`; visuals in `render.ts` `drawAbilities`                     |
| `Item["kind"]` (types.ts)         | `medkit` \| `xp` \| `repair` \| `equipment` \| `ability` \| `story` | the pickup switch in `step.ts`; the item-sprite switch in `render.ts`                                                |
| `Affix["kind"]` (types.ts)        | `damagePct` \| `maxHp` \| `crit` \| `stat`                          | the affix readers in `items.ts` (`effectiveStat`, `computeMaxHp`, `playerCritChance`, `weaponDamage`, `weaponScore`) |
| `Quality` (types.ts)              | `broken` \| `crude` \| `normal` \| `superior` \| `perfect`          | config `QUALITY.mults`/weights, `QUALITY_PREFIX` (defs/equipment.ts), the roll in `items.ts` `rollQuality`           |

**Checklist to add an archetype:** union entry → def field(s) it needs → the
`step.ts` (or `items.ts`/`abilities.ts`) handler branch → a `GameEvent`
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
  WebAudio oscillator/noise parameters in `pwa/src/game/sfx/`, and
  the background music is tracker-style score data (one file per track
  under `pwa/src/game/music/`, instruments + patterns + arrangement)
  played by a small sequencer (`@ui/lib/chiptune.ts`) on the same synth —
  the offline PWA payload stays tiny and every tune is diffable code.
