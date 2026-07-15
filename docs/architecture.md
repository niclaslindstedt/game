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
The def accessors read an overridable registry, so `registerDefs(...)` can
swap the active catalogs for a custom set — the engine test suites use it to
run against synthetic fixtures with no shipped content (see
`tests/engine/fixtures.ts`).

- **`src/game/config.ts`** — the GLOBAL balance knobs (player, jumping, XP
  curve, stat effects, loot rules), nothing hardcoded in logic.
- **`src/game/defs/levels/`** — the level registry: one `LevelDef` per file
  (`spacez_hq.ts`, `moon.ts`, …) merged and ordered by `levels/index.ts`
  (which owns `LEVELS`, `LEVEL_ORDER`, `levelDef`; the split keeps each
  level's ~250 lines under the source-size cap as the campaign grows).
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
  circle), deliberate `walls` (segments expanded into chains of solid circles
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
  venue).
- **`src/game/defs/enemies/`** — the monster catalog, split one file per
  roster (`spacez.ts`, `moon.ts`, …) merged into `ENEMY_DEFS` by
  `enemies/index.ts` (which throws on a duplicate id): stats, AI radii,
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
  base hp that grows with the hero's level, a signature starting weapon, an
  optional party-wide `aura` (LUCKY's +50% magic find), the `joinWords`
  scene played the moment the SPARE verdict lands, and the `killQuotes`
  banter floated over the companion when its blow downs a mob.
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
- **`src/game/defs/equipment.ts`** — weapons (melee/ranged/magic classes,
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
  with the killer's monster level, scaling its damage/armor/durability/value
  — config `QUALITY`; craftsmanship and magic are exclusive D2-style, so
  magic-or-better finds, charms, and bags stay normal make).
- **`src/game/defs/abilities.ts`** — the ability pickups: time-limited
  powers (orbiting fire orbs, storm strikes, stasis slow fields, the item
  magnet whose pull radius grows with INTELLIGENCE — and which only reels in
  gear the hero can actually keep, leaving loot a full bag has no room for
  where it lies) plus the instant
  screen nuke (wipes every horde minion on screen — elites and bosses are
  immune — its drop rate kept rare by `LOOT.nukeShare`, and its own kills
  never chain: a nuke blast's loot rolls skip both screen-nuke slices, so a
  bomb can't pay out another bomb). As a panic button it also buys real
  breathing room — the AFTERMATH (`NUKE.calmMs`, `detonateNuke` →
  `stepSpawner`): after a blast the spawner holds every refill for a short
  calm so the cleared screen stays clear long enough to break away instead of
  the live floor instantly repopulating the ring, and the transient menace heat
  is cooled to the earned permanent floor (the ratchet stands) with the banked
  walk-credit lure dumped, so the horde that returns is no denser or more
  evolved than the run's baseline. The ONE NUKE rule (`canDropNuke`) gates
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
  per-difficulty prelude variant — and `startingStats`), spawn counts and
  the wave spawner's live cap, the horde's RELATIVE level (`mobLevelOffset`
  — every monster spawns at player level + offset, hp shifted per level by
  `MENACE.mobHpPerLevel`), the drop economy (medkit/armor/powerup
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
  decay → placed packs (waking clusters the hero nears) → wave spawner →
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
  `create.ts`'s `spawnEnemy` — more hp, hence more xp, but a WORSE loot
  tier roll via `tierPenaltyPerStage`, so a rampage levels rather than
  farms), and — with the hero's power — power-matches elites/bosses when
  they engage (`enemyPowerScale`/`maybePowerScale`, called from both
  `step.ts` wake and `loot.ts` first-hit). POWERUP output — the screen-nuke
  bomb, fire orbs, and storm cell — is exempt from all of this: `hitEnemy`'s
  `noMenace` flag books its damage/kills into `state.menaceExemptDamage` /
  `menaceExemptKills` (so `step.ts` nets them out of the rolling DPS/kill-rate
  `tickMenace` reads) and makes `killEnemy` skip `bankOverkill` entirely, so a
  consumable clearing the screen never jolts, lures, or ratchets — menace
  answers only the hero's own weapon. Separately from that
  moment-to-moment heat, the hero's POWER LEVEL (`heroPowerLevel`: the
  character level, the gear rack's averaged total ilvl (`heroGearLevel`),
  or the equipped weapon's calculated output mapped onto the mob-hp curve
  (`heroDamageLevel` — the level whose typical minion the weapon's
  sustained DPS would fell in `damageLevelKillSec` seconds, so an absurd
  `damage`/`damagePct` roll ilvl never priced in still reads as the power
  it actually swings), whichever is highest — so a decked-out hero meets a
  horde levelled to what he actually wields. The DAMAGE term is DAMPENED to
  `MENACE.damageLevelTracking` (0.2, ×the `mobDamageTracking` balance knob)
  of its excess over the character level: a full 1:1 hp match pinned
  time-to-kill flat and stopped a strong build ever OVERKILLING, which
  starved the menace/evolution ratchet — the endgame's real challenge — so
  the horde now only lag-follows a fifth of the hero's dps and the ratchet
  answers the runaway instead) gives every minion a
  non-decaying toughness floor at spawn (`mobLevelScale`, folded into
  `spawnEnemy`'s hp mult) and richer drops (`mobLevelTierBonus`, added to
  the loot tier roll), so a levelled hero keeps meeting a proportionally
  sturdier, better-paying horde. The LOOT gates deliberately key to the
  CHARACTER level alone (the monster level `currentMobLevel` stamps, which
  decides base `levelReq`, tier unlocks, and the dropped item's own
  level): the gear and damage reads buy toughness and xp, never better
  drops, so one hot find can't roll itself an even better successor and
  leapfrog the difficulty ladder. The kill side pays by the same honesty:
  `overkillEfficiency` scales a kill's xp AND its drop roll by
  `maxHp / damage` once the blow exceeds the full bar (2× the bar → half,
  3× → a third), so farming mobs far beneath you is deliberately
  unrewarding. Both the minion floor and the elite/boss power-match
  multiply by `autoPowerScale` (leveling.ts) — the free per-level stat
  gains cancel out against the crowd, so only chosen points, gear, and
  skill pull ahead.
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
  player/enemies/items toward their core — minions are devoured there
  (`wellSwallowed`: no kill, no XP, no loot, so a hole can't be farmed),
  the player burns on a damage tick, dragged items park on the rim, and a
  jump clears the pull entirely — and the **asteroid rain**
  (`LevelDef.asteroids`, config `ASTEROIDS`): rocks spawned on a ring past
  the screen edge streak across the player (one strike per rock, jumpable,
  armor reduces) and shove minions aside unharmed. Related:
  **apparitions** (`EnemyDef.apparition`, config `APPARITION`) are
  dialogue-only figures the combat/hazard paths all skip — they rush in to
  speak like any elite, then walk off and dissolve (`apparitionVanished`).
- **`src/game/story.ts`** — the story systems: dialogue lifecycle
  (`wantsDialogue`/`startEnemyDialogue` inside the step,
  `advanceDialogue` as the player's tap, `muteDialogue` for the overlay's
  MUTE button — it latches `dialogueMuted`, silencing every in-world scene
  for the rest of the level (a fresh level un-mutes), `dialogueContent` for the
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
  picks fights inside the hero's engagement bubble, strikes/shoots on the
  weapon's cadence (shots ride the ordinary projectile pass, tagged
  `companionId` for kill-quote attribution), soaks the horde's contact
  swings against helmet+chest armor, and beats companions DOWN — never
  dead — until they stand back up on their own. Companion auras
  (`CompanionDef.aura` — LUCKY's +50% magic find, read by items.ts
  `magicFindBonus` inside every tier roll) go silent while downed. The UI's
  mutators are `equipCompanionFromInventory` / `unequipCompanionToInventory`
  (weapon/helmet/chest only) and the `companion` pause-phase toggles
  `openCompanionPanel` / `closeCompanionPanel`; the party rides the loadout
  (`Loadout.companions`) between levels.
- **`src/game/map.ts`** — the level map and its fog of war: run-scoped
  exploration as a coarse byte grid on the state (`state.explored`, one cell
  per config `MAP.cellSize` world px), stamped around the hero every step
  (`revealAround`, called from `step()`; the spawn is pre-revealed at
  creation) and queried with `isExplored`. Memorable events pin
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
  the app's `?bot=` autoplay mode, and later an AI-driven second player.
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
- **`website/src/lib/`** — generic game UI plumbing imported via the
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
- **`website/scripts/asset-tools/` + `sprite-data/` +
  `generate-assets.mjs`** — the pixel-asset pipeline (`make assets`):
  sprites are character grids organized in per-family modules, each with a
  local palette scope merged with a shared core (`sprite-data/core.mjs`),
  rendered into one sprite atlas (PNG + JSON source rects) plus previews
  (per-family contact sheets, film strips, palette sheet, font specimen).
  The atlas and previews are both gitignored and regenerated on every build
  (`npm run assets` runs ahead of `vite`/`tsc`/`vitest`), so the pixel grids
  are the only committed source of truth (§11.2). Wound styles derive from the
  enemy catalog's `gore` field and role; contrast lints flag sprites that
  dissolve into their family's ground and wound overlays that don't read.
  See the `pixel-assets` skill.
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
for local-first PWA plumbing (today: the `usePwaUpdate` lifecycle hook; the
"a new version is ready" prompt itself is the game's own sprite-styled
`website/src/game/UpdateModal.tsx`, in place of the framework's plain
`UpdateToast`, so it matches the pixel-art dressing). Game-agnostic code is
kept in the dedicated `src/lib/` and
`website/src/lib/` areas so it can be extracted into the framework for reuse
in later games once it has matured through playtesting — see `AGENTS.md` for
the policy.

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
SFX mapping in `website/`. The `noFallthroughCasesInSwitch` /
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
  WebAudio oscillator/noise parameters in `website/src/game/sfx/`, and
  the background music is tracker-style score data (one file per track
  under `website/src/game/music/`, instruments + patterns + arrangement)
  played by a small sequencer (`@ui/lib/chiptune.ts`) on the same synth —
  the offline PWA payload stays tiny and every tune is diffable code.
