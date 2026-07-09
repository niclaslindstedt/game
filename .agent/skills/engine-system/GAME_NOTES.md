# engine-system — game-specific notes

Accumulated pattern instances for **this** game. The workflow and invariants
live in `SKILL.md`; this file is the log of how each system landed here. A
sequel truncates this file to a stub and rebuilds it as its own systems land.

## Pattern log

- **Content catalogs (2026-07, moon level):** levels/enemies/equipment are
  data registries under `src/game/defs/`; runtime entities carry a `defId`.
  New content = new entries, not engine changes. Paused sub-states (intro
  text, level-up chooser, inventory) are `GamePhase` values — `step()`
  freezes on anything but `playing`, and the UI resumes via exported
  mutators. Import `src/lib` through `@game/lib/*` (never relative) so
  oss-framework extraction stays a prefix swap.
- **Cross-level modifiers (2026-07, difficulty ladder):** a setting that
  scales EVERY level (difficulty) is its own defs catalog
  (`defs/difficulties.ts`) threaded through `createGame(seed, levelId,
  modifier)` and stored on the state (`state.difficulty`); spawn/loot code
  reads it via a lookup, never via globals. Keep the default entry an
  exact 1.0 baseline so existing tests and tuning stay untouched.
- **Player-timed consumables (2026-07, held ability items):** pickups the
  player triggers later are a queue on the player (`heldAbilities`) plus an
  input edge (`input.useItem`) consumed by a small `stepX()` — never an
  app-side mutation, so bots (`botAct` sets the edge) and tests drive the
  same path.
- **Cutscenes (2026-07, the prelude):** the beat-machine player is GENERIC
  (`src/lib/cutscene.ts`, deterministic, no RNG); scenes are data in
  `defs/cutscenes.ts`; a level opts in via `LevelDef.prelude`. The run
  opens in a `cutscene` phase advanced by `step()` on the sim clock (world
  frozen), with `tapCutscene`/`skipCutscene` mutators beside `dismissIntro`.
  Iteration tooling lives app-side: the `?cutscene=<id>` workbench + the
  beat-screenshot harness (`website/scripts/cutscene-preview.mjs`).
- **Deliberate architecture (2026-07, SPACEZ HQ walls):** hand-placed
  geometry is `LevelDef.walls` — segments expanded at creation into chains
  of overlapping obstacle circles (`buildWalls` in create.ts), so walls
  reuse ALL existing obstacle collision/AI/spawn-avoidance for free. Door
  gaps are part of the level data; scattered obstacles keep their spacing
  from walls, and walls skip the scatter clearance rules on purpose.
- **Def-driven rendering (2026-07):** decor/obstacle/landmark entities carry
  a resolved `sprite` name (landmarks also an `anchor`), the ground comes
  from a per-level `tiles` spec, and the player costume from
  `playerAppearance(state)` — so a new level/kind/biome/costume is data, not
  a `render.ts` edit.
- **Rectangular obstacles (2026-07, moon rocks):** obstacle geometry moved out
  of `step.ts` into a cohesive `src/game/obstacles.ts` (resolve/inside/
  lineOfSight/blockedBy) so the step stays under the line cap and the nuke +
  `create.ts` share one "is this blocked?" source. A round obstacle keeps its
  `radius`; a sized rock carries an optional `half` (footprint half-extents)
  and collides as a box (circle-vs-AABB push-out, segment-vs-AABB for shots).
  Pure primitives (`closestPointOnRect`, `pointRectDistanceSq`,
  `segmentIntersectsRect`) live in `@game/lib/vec.ts`. Levels author sized
  rocks with a `rockSizes`/`cell` obstacle spec; one sprite per footprint,
  named `<base>_<w>x<h>`, drawn centered — no render edit. The screen nuke now
  gates each kill on `lineOfSight`, so a rock shelters the mob behind it.
- **Event-pinned player monologue (2026-07, first moon OPTIMUSK kill):** a
  dialogue that is the HERO thinking, not a speaker on the board, is a new
  `DialogueState` source (`{ kind: "playerThought", defId }`) keyed into a
  content catalog (`defs/thoughts.ts`, same setter/accessor shape as story
  items) that carries its own speaker/portrait. The trigger is level data
  (`LevelDef.firstKillThoughts` maps enemy id → thought id) fired from the
  kill path in `loot.ts` after `startDeathWords`, guarded once-per-run by
  `state.thoughtsSeen`. `dialogueContent` grew a branch; the app's dialogue
  overlay needed no change (it renders whatever `dialogueContent` returns).
  A second trigger flavor landed later (2026-07, SpaceZ HQ intern):
  `LevelDef.firstSightThoughts` fires the same catalog on PROXIMITY instead
  of a kill — a `stepSightThoughts` pass in `step()` right after
  `stepEnemies` (so the sighting is judged on this tick's positions),
  radius-gated by `DIALOGUE.sightRadius` and sharing the `thoughtsSeen`
  ledger. Pick the pin by what the beat reacts to: seeing a thing → sight
  pin; having fought/examined it → kill pin. Two-part beats (moon wisps:
  see them, then down one) order themselves with `ThoughtTrigger.after` —
  a gated trigger holds UNSPENT until the prerequisite thought has played,
  then fires on the next qualifying kill/sighting. The gate matters because
  ranged weapons out-reach `sightRadius` (blaster 210 vs 96), so a snipe
  kill can legitimately precede the first sighting.
- **Fleeing uniques (2026-07, ELON MOSQUE):** a boss that escapes instead of
  dying is data — `EnemyDef.flees: { landmark }`. The kill path in `loot.ts`
  branches before booking the kill: the mob leaves the board, XP and
  guaranteed drops still pay, `lastWords` still play (worded as the flight),
  but the engine emits `bossFled` (never `enemyKilled`/`bossDefeated`, never
  a kill stat) and pushes the named landmark (its sprite = the landmark kind)
  where it vanished — so the rift renders through the existing data-driven
  landmark path with zero renderer edits. `killBoss` objectives clear because
  the boss is simply gone. Fixture: `test_coward`; suite:
  `tests/engine/flee_test.ts`.
- **Loadout carry-over (2026-07, Mars):** cross-level persistence is a plain
  data snapshot, not engine state — `Loadout` (types.ts) holds level, stats,
  equipment, bag and held powerups; `extractLoadout(state)` snapshots a
  finished run, `createGame(seed, level, difficulty, loadout)` dresses the
  next one in it (`applyLoadout`: ids re-minted, bag re-sized to carried
  STRENGTH, hero rested). The APP owns persistence
  (website progress.ts banks JSON per cleared level × difficulty on the
  victory event and resolves `startingLoadout` on run start). Dev jumps with
  nothing banked fall back to `deriveArrivalLoadout` — the hero's level
  derived from the earlier levels' rosters (spawn + wave XP ×
  `ARRIVAL.clearShare` through the real curve, difficulty-gated lines
  excluded), stats auto-spent round-robin, the previous level's signature
  kit. `levelsBefore` (levels/index.ts) reads the ACTIVE catalog and the
  derivation dedupes by story index, so fixture catalogs with several
  index-1 levels behave. With no loadout passed, createGame starts exactly
  as authored — engine suites stage bare without any helper.
- **Zoned terrain (2026-07, Mars desert→base):** one level with two grounds is
  presentation data, not engine work — `TileSpec.zones` (rects in world px,
  each with its own ground/patch pair) checked first by `groundTile` in
  render.ts. Collision never reads tiles, so zones are purely visual; the
  gameplay transition comes from the walls/spawn bands laid along the same
  boundary.
- **Symmetric combat rolls (2026-07, enemy dodge & miss):** the mirror of an
  existing player-side roll (hero dodges enemy → enemy dodges hero / hero
  whiffs) lives in the ONE place all player damage funnels through
  (`hitEnemy` in loot.ts), gated by an `opts.rollAccuracy` flag so only the
  WEAPON paths (`meleeSweep`, projectile hit in step.ts) roll it and conjured
  abilities (orbit/storm/nuke) bypass it and always connect. The chance
  functions (`playerMissChance`, `enemyDodgeChance`) sit beside their kin in
  items.ts and reuse the `max(0, base − stat·per)` shape of `enemyCritChance`;
  DEX drives BOTH so one stat can't zero one without the other (deliberate —
  it's a single "hit rate"). Per-enemy variation is a new optional `EnemyDef`
  field (`dodgeChance`) defaulted from config (`ACCURACY.enemyDodge`), so no
  roster edit is forced. No-damage outcomes are their own `GameEvent`s
  (`enemyMiss`/`enemyDodge`, carrying `pos`+`defId`) that the app floats as
  "MISS"/"DODGE" text (reusing the `kind:"text"` effect) with a light whiff
  sfx. Testing the dodge branch in isolation needed a nimble fixture
  (`test_dodger`, dodgeChance 0.9) because DEX trims miss and dodge together —
  you can't pin one off with a constant rng and leave the other live on a
  default-dodge foe. Adding the accuracy roll consumes rng in the weapon path,
  so content tests that relied on a point-blank/rushing elite dying on the
  first swing had to pin `state.rng = () => 0.99` (the always-land value) to
  stay deterministic.
- **Difficulty as a knob RACK (2026-07, ladder rework):** a difficulty rung
  owns the hero's opening kit (`startingWeapon`/`startingStats`, applied in
  create.ts), the horde's RELATIVE level (`mobLevelOffset` folded into
  `mobHpScaleFor` in menace.ts — one function for "difficulty toughness"
  and "the horde keeps pace with the hero"), drop-economy multipliers read
  at the roll sites (loot.ts shares, rollEquipment's armor damping),
  accuracy multipliers (dodge/miss in items.ts), and the menace meter's
  trigger/decay/effect. Per-difficulty CONTENT variants (the prelude's wall
  weapon) are separate defs resolved once by `cutsceneVariant(id,
  difficulty)` — `<id>_<difficulty>` when registered, the base otherwise —
  so the state carries a plain resolved id and renderers stay untouched.
  Plumbing knobs guard their rng draws (`uniqueDropChance` draws nothing on
  an empty `loot.uniquePool`), so a future feature costs no determinism
  churn today. App-side meta-progression (LEVEL TOKENS: clear a level, spend
  the token to unlock it on a higher rung) lives entirely in the website's
  progress store — the engine never learns tokens exist.
- **Engine tests run on synthetic fixtures (2026-07):** `tests/engine/`
  suites install content-agnostic fixtures (`tests/engine/fixtures.ts`,
  plain ids like `test_level`/`test_minion`) via the engine's `registerDefs`
  hook, so they survive content deletion. The fixtures deliberately mirror
  the shipped `moon`/`ghost`/`blaster` tuning the suites were calibrated
  against. This game's content suites live in `tests/content/` and use the
  shipped catalogs via the root `tests/helpers.ts`. The only shared id is
  `blaster` — `create.ts`/`items.ts` mint it as the built-in sidearm.
- **Fog-of-war level map (2026-07):** run-scoped exploration is a coarse
  byte grid on the state (`state.explored`, one cell per `MAP.cellSize`,
  stamped by `revealAround` right after `stepPlayer` each tick + once at
  creation around the spawn) living in a cohesive `src/game/map.ts` next to
  its phase toggles — `openMap`/`closeMap` and a `map` GamePhase that
  freezes like `inventory` (close yields to a pending level-up). Memorable
  events pin `state.mapMarkers` at their existing source of truth, not via
  events: elite/boss kills and flees in loot.ts's kill funnel, story
  pickups in `collectStoryItem` (which grew a `pos` param), unique/legendary
  pickups in stepItems' equipment branch (guarded so a bag-full refusal
  never pins). The app draws the whole map in ONE static canvas pass on
  open (`MapOverlay.tsx`) — terrain = the level's `ground.common` sprite
  per explored cell (zones honored), fog = the dark backdrop plus a
  half-shade penumbra on frontier cells — since the sim is frozen there is
  nothing to animate. Fixture: `test_elite`; suite: `tests/engine/map_test.ts`.
- **Wandering merchant (2026-07, coin economy):** a friendly NPC is NOT an
  Enemy — he is his own state slice (`state.merchant`, merchant.ts) stepped
  right after the player, so combat/loot never see him. Two determinism
  rules made him cheap to add: he rolls EVERYTHING on his own rng stream
  (parked as a plain `rngState` uint32, not a closure, so the JSON
  freeze/thaw persistence keeps working — a closure on a sub-object broke
  `persistence_test`), and his stall rolls reuse `rollEquipment` by
  swapping `state.rng` for a generator built at his parked state (park it
  back after). His discovery latch mirrors elite dialogue (radius + LOS →
  root, map pin, event, greeting via a new `DialogueState` source keyed by
  levelId); per-level persona is level DATA (`LevelDef.merchant`: sprite /
  name / greeting — manuscript rules apply to the words). The mob-repel
  ward is a radial push-out in the enemy pass beside `resolveObstacles`
  (bosses/apparitions exempt). The `shop` phase freezes like `inventory`;
  buy/sell are plain mutators; coins live on the player and ride the
  Loadout (optional field, `?? 0` for old saves). Suite:
  `tests/engine/merchant_test.ts` (incl. a counting-rng test proving zero
  main-stream draws).
- **Diablo loot economy (2026-07, weapon rework):** progression-shaped loot
  is three numbers threaded through the existing catalogs, not a new system:
  a MONSTER LEVEL stamped on every enemy at spawn (`spawnEnemy` param,
  re-stamped for elites/bosses in `maybePowerScale`), a per-def `levelReq`
  gating both the drop pool and the hero's hands (`meetsLevelReq` checked in
  auto-equip, bag-equip, and the broken-weapon fallback scan), and an ITEM
  LEVEL on each drop (mlvl − weighted deficit) that scales affix magnitudes
  (`AffixDef.perIlvl`). Tier availability became ONE config gate
  (`LOOT.tierUnlockMlvl`) + global base chances instead of per-level
  tierChances — per-level data now only says WHICH bases are thematic.
  Elite/boss "richer drops" are declarative per-tier chances that may exceed
  1.0 (`EnemyDef.loot.tierDrops`; whole part guaranteed, fraction rolled).
  Projectile identity (spread volleys, pierce, homing, chain) is data on
  `WeaponDef.projectile` handled in stepWeapon/stepProjectiles — a pierce
  shot tracks `hitIds` so it never bills a body twice. Dedicated skill:
  `weapon-system` (stat checker + arsenal sheet). App-side permanence
  (keepsake stash, hardcore death) lives entirely in website progress.ts —
  the engine never learns hardcore exists.
