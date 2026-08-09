// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// How the horde enters the field: camping pressure, the nuke aftermath,
// placed packs, spawn points, and the rare/unique mob encounters.

/**
 * CAMPING PRESSURE — the anti-farm rules layered over the wave spawner (see
 * stepSpawner). A player who parks in one spot stops being fed: after a grace
 * period the horde loses interest — the live floor AND the timed budget stream
 * fade out, the field drains, and the only arrivals left are a slow BECKONING
 * trickle walking in from the direction of the objective (the living boss, or
 * the nearest remaining elite), luring the player onward. Moving again resets
 * the camp clock and the flood resumes — the deferred budget was never
 * canceled, only held. And once a killBoss level's wave budget is fully spent,
 * a thin endless STRAGGLER stream keeps arriving from that same objective
 * direction, so the map never goes dead-empty on the walk to the boss
 * (clearAll levels stay finite — they must be clearable). Units: world px, ms.
 */
export const CAMPING = {
  /** The player counts as camped while staying within this radius of where he
   * last settled; stepping outside it re-anchors and resets the clock. Sized
   * to most of a phone screen: kiting a wave around one arena is normal
   * fighting, not camping — only genuinely holding the same ground counts. */
  campRadius: 160,
  /** Camping is free for this long — the fight comes to him as usual. A
   * generous grace: a pitched minute-long battle on one screen is the game
   * working, and the starvation must never bite it. */
  graceMs: 45_000,
  /** …then the floor and the budget stream fade to nothing over this window. */
  fadeMs: 15_000,
  /** While starved, one beckoning mob arrives this often (from the objective
   * direction, drawn from the normal wave budget). */
  beaconEveryMs: 2_800,
  /** Half-angle (deg) of the arrival cone around the objective bearing — the
   * trickle reads as a stream from ONE direction, not a ring. */
  directionSpreadDeg: 60,
  /** Cadence of the endless post-budget straggler stream (killBoss levels). */
  stragglerEveryMs: 4_000,
  /** Stragglers only arrive while fewer minions than this are near the player
   * — a thin stream that keeps the walk alive, never a second flood. */
  stragglerMinAlive: 8,
} as const;

/**
 * NUKE AFTERMATH — the screen-nuke is a PANIC BUTTON, so its blast must buy
 * real breathing room, not just a redrawn screen. Without this the live floor
 * refills the ring the instant the pack dies (see stepSpawner) — the cleared
 * mobs "reset to the outer skirts" and, if a swarm had heated the meter, come
 * back EVOLVED — so the bomb that was meant to save you doomed you instead. The
 * aftermath fixes both halves: `calmMs` holds every spawner refill after a
 * detonation so the field stays clear long enough to break contact and lose the
 * pack, and the transient menace heat is cooled to the earned permanent floor
 * (the ratchet the player's own overkill locked in still stands) so the horde
 * that eventually returns is no denser or tougher than the run's baseline. Then
 * `recoverMs` eases the near-floor back from empty to full so the swarm WALKS
 * back in at the normal rate instead of snapping onto the player in a single
 * frame the instant the calm ends. Ms.
 */
export const NUKE = {
  /** The blast's damage, expressed as a multiple of the MEAN current hp of
   * every monster it catches on screen. At 2 (200%) it wipes the rank and file
   * — anything at or below twice the average — outright while only chunking the
   * far heavier elites and bosses, so a lone set-piece foe still has to be worn
   * down by hand. The blow rolls a crit like any other, so a lucky bomb bites
   * deeper. Applied in `detonateNuke`. */
  meanHpDamageMult: 2,
  /** How long the spawner holds all refills after a nuke — long enough to run
   * out of the cleared screen and shake the pursuit, tuned to the phone view. */
  calmMs: 4_000,
  /** After the calm, the live near-floor ramps 0→1 back to full over this
   * window rather than refilling to `minAlive` in one frame — so the bomb's
   * breather tapers into the normal horde instead of dumping the whole floor's
   * worth of mobs on the player at once. */
  recoverMs: 3_000,
} as const;

/**
 * PLACED PACKS — the level-design counter to the survivors-style horde (see
 * stepPacks). A pack is a fixed cluster of monsters pinned to a spot on the
 * map that sleeps until the player walks near it: closing to `triggerRadius`
 * of the anchor spawns the pack's members in a ring around it and they give
 * chase at once; killing every member CLEARS that patch of ground. Where the
 * wave spawner funnels the whole level to a camper standing still, packs
 * reward MOVEMENT — the map is cleared by walking it, one encounter at a
 * time. Distances are world px. Per-pack overrides live on the LevelDef.
 */
export const PACKS = {
  /** How close (world px) the player must get to a pack's anchor before it
   * wakes. Sized to about a phone screen-width ahead so the cluster boils up
   * as the player advances into it, not while it is still off-screen. A pack
   * may override this with its own `triggerRadius`. */
  triggerRadius: 260,
  /** Members spawn scattered within this radius of the pack anchor — a tight
   * knot the player meets as one group, not a thin ring around himself. A
   * pack may override with its own `spawnRadius`. */
  spawnRadius: 120,
  /** Rejection-sampling attempts per member to find a spawn spot inside the
   * scatter radius that clears obstacles and the map edge before giving up
   * and placing it on the anchor. */
  placeAttempts: 12,
} as const;

/**
 * SPAWN POINTS (`LevelDef.spawners` / spawners.ts): the FINITE, LOCAL horde
 * model — the alternative to the endless `waves` stream. A spawner sleeps at a
 * spot until the hero closes to `triggerRadius`, then EMITS its authored mob
 * count a few at a time (`perEmit` every `intervalMs`) until it DRAINS empty —
 * one readable wave the hero can clear and walk away from. A spawner may CHAIN
 * off another (`after`): it arms `chainDelayMs` after that one drains, but only
 * while the hero is still in range — so pressure follows him without an infinite
 * refill. The design lever for a level that can actually be CLEARED (and, in a
 * maze, traversed without a bottomless bog). Counts scale with difficulty
 * (`scaledMobCount`). These are the defaults; each spawner may override them.
 */
export const SPAWNERS = {
  /** How close (world px) the hero must get to arm a spawner — about a phone
   * screen-width ahead, so a wave boils up as he advances into it. */
  triggerRadius: 300,
  /** Emitted mobs scatter within this radius (world px) of the spawn point. */
  spawnRadius: 110,
  /** Time (ms) between emission ticks while a spawner drains. */
  intervalMs: 650,
  /** Mobs released per emission tick. */
  perEmit: 3,
  /** Per-point CONCURRENT-ALIVE CAP: the most of a point's own live members it
   * lets stand at once. While the field is full it PAUSES, then drips a fresh
   * batch to REPLACE each kill — holding steady local pressure instead of
   * dumping its whole queue in a pile. The queue still drains (and the point's
   * chain still follows) as the hero grinds the cap down. */
  maxAlive: 14,
  /** Default delay (ms) after a spawner drains before a chained one arms —
   * only counted while the hero is in the chained spawner's trigger range. */
  chainDelayMs: 4000,
  /** Rejection-sampling attempts per mob to find a spot clear of obstacles and
   * the map edge before falling back to the anchor. */
  placeAttempts: 12,
  /**
   * SUMMON-IN behaviour. A spawner no longer pops its mobs into existence on
   * screen: it SUMMONS them just OUTSIDE the camera and they RUN IN toward the
   * hero at a sprint (`runInSpeedMult` × their speed), dropping to their normal
   * pace only once they cross the APPROACH CIRCLE around him — a circle as wide
   * as the SHORTER viewport dimension (height in landscape, width in portrait),
   * so a mob reaches full speed just as it comes into view.
   */
  /** Sprint multiplier on a summoned mob's speed while it runs in from
   * off-screen, before it reaches the approach circle. */
  runInSpeedMult: 1.8,
  /** Approach-circle radius (world px) used HEADLESS — engine suites and a
   * `--view off` sim run carry no camera, so the live "shorter viewport
   * dimension" is unavailable and this stands in for it. (The sim's normal run
   * is NOT headless: it stamps a real rect, `SIM_VIEW_DEFAULT`.)
   *
   * NOTE THE UNITS: the phone baseline's shorter axis is ~260 WORLD units, not
   * the 195 CANVAS px it is drawn in — the pitch divides the depth axis
   * (render/tilt.ts `worldViewRect`). This 200 was set against the canvas
   * figure and is deliberately left alone: it is a no-camera fallback that
   * every idle-lethality baseline (tests/content/balance_test.ts) is measured
   * under, so moving it is a balance change to be made and re-measured on
   * purpose, not a units correction. */
  approachRadiusFallback: 200,
  /** Extra world px beyond the camera's half-diagonal a summoned mob is placed,
   * so it starts fully off-screen regardless of the arrival bearing. */
  spawnMargin: 48,
  /** The summon bearing (hero → spawn point) is scattered by up to ±half this
   * many radians, so a batch fans into view rather than filing in single-file. */
  summonArcRad: 2.1,
  /** A summoned member counts toward the alive cap while it is alive AND within
   * `approachRadius × this` of the hero. Past that it has been left behind (the
   * hero ran off) and the point drips a replacement — the fight follows him. */
  leashMult: 2.5,
  /**
   * POST-KILL RESPAWN DELAY. Once a point has filled to its alive cap, a killed
   * (or left-behind) member is not replaced instantly — the point waits this
   * long before summoning the next mob in from off-screen. This is the base
   * (medium, first map, far from the boss); the resolved delay SHRINKS with
   * difficulty (`DifficultyDef.spawnerRespawnMult`), with proximity to the
   * level's boss (`bossProximityMin`), and as the campaign progresses
   * (`mapProgressionMin`) — so later maps and the rooms around each boss refill
   * relentlessly. A spawner may author its own base (`SpawnerSpec.respawnDelayMs`),
   * which the same factors still scale.
   */
  respawnDelayMs: 2200,
  /** Floor (ms) on the resolved post-kill respawn delay after every factor is
   * applied — the fastest any point may refill. */
  respawnDelayMin: 250,
  /**
   * THE LANDING RAMP. How far out from the hero's own spawn the horde is
   * THINNED, as a fraction of the spawn→objective axis (the same `bandReach`
   * yardstick the boss-proximity factor uses). A point sitting on the landing
   * gets the full softening (`DifficultyDef.landingAliveMin`); the effect ramps
   * linearly to nothing at this distance, so the map opens at something close to
   * a walk-on and thickens as the hero commits to it.
   *
   * The reason it is a FRACTION and not a radius: a generated carve is roughly
   * twice the authored map's area, so a fixed radius would soften a quarter of
   * an authored map and a tenth of a carved one — the opening ramp would mean
   * something different on every map and every size. Priced off the axis, one
   * number means "the first fifth of the journey" everywhere.
   *
   * This exists because the density ladder's thicker crowd lands hardest exactly
   * where the hero is weakest: at level 1, with the rung's starting weapon and
   * nothing found yet. Measured, a magic build on HARD spiralled on roughly half
   * of its seeds — swarmed before it could arm itself, so it never got off its
   * opening weapon. The horde is meant to be a wall LATER, not on the doorstep.
   */
  landingReach: 0.34,
  /** The respawn-delay multiplier for a point sitting ON the level's boss (0
   * distance). Ramps linearly up to 1× at the boss's distance from the hero's
   * spawn, so the boss bay refills far faster than the opening rooms. */
  bossProximityMin: 0.5,
  /** The respawn-delay multiplier on the LAST map of the campaign; the first map
   * is 1× and every map between interpolates — the "maps get progressively
   * harder" lever, tightening the refill cadence map by map. */
  mapProgressionMin: 0.6,
  /**
   * ALARM WINDOW (ms). A mob wired to a spawn point (`SpawnSpec.alarms`)
   * that WAKES on the hero RAISES THE ALARM: the point activates at once —
   * range, sight, chain gate, and the active cap notwithstanding — and pours
   * its summons at the hero for this long even while he is outside its
   * trigger radius (a couple of batches: the squad that answers the call).
   * When the window closes with the hero still out of range, the point falls
   * back to dormant and waits to be tripped the ordinary way.
   */
  alarmWindowMs: 8000,
} as const;

/**
 * HELLGATES (`SpawnerSpec.hellgate` / spawners.ts, mobs flagged
 * `EnemyDef.hellborn`) — the RAMPAGE-ONLY spawn points. A hellgate is an
 * ordinary spawn point with three differences, all keyed to the menace meter
 * (see menace.ts):
 *
 *  1. IT IS SHUT until the rampage reaches `openStage`. Below that it is
 *     invisible to the arming pass however close the hero stands, so a map's
 *     hellgates are content a calm run never meets. Levels also gate them to
 *     `minDifficulty: nightmare`, so they exist only on the top two rungs.
 *  2. IT ESCALATES WITH THE METER. Every stage past `openStage` widens the
 *     gate's alive cap, thickens each batch, shortens the interval between
 *     batches and the post-kill refill, and lets MORE gates burn at once — so
 *     a deep rampage is answered by a screen that fills faster than it can be
 *     cleared. Bounded by `globalMaxAlive` (all gates together) so the
 *     spectacle can't outrun the frame budget.
 *  3. IT NEVER RUNS DRY while the rampage holds: a drained gate re-queues its
 *     authored mix (`SpawnerRuntime.refill`) instead of closing for good, and
 *     only falls back to dormant once the meter cools below `openStage` — so
 *     the gates are a tap the player opens by being terrifying and closes by
 *     calming down (or, once the evolution ratchet has locked the floor above
 *     the threshold, never closes again).
 *
 * The reward side lives in loot.ts: a `hellborn` kill is EXEMPT from the
 * evolution tier penalty the rest of the rampaged horde eats, and its drop
 * rolls MULTIPLY with the stage (`dropMult` + `dropMultPerStage`, paid out in
 * whole payouts like a rare mob's) — so the deeper the rampage, the better
 * the hellgates farm.
 */
export const HELLGATES = {
  /** The rampage stage a hellgate opens at — the default `openStage` a level
   * may override per point. Sits above the incidental heat an ordinary fight
   * banks, so the gates read as an answer to a genuine rampage. */
  openStage: 3,
  /** Live members ONE gate allows at its `openStage`, before the escalation
   * below — a touch under the ordinary point's cap, since a gate's mobs are
   * elite-sized. */
  maxAlive: 8,
  /** Extra live members per rampage stage past `openStage`. */
  alivePerStage: 0.6,
  /** Ceiling on one gate's live members however deep the rampage runs. */
  maxAliveCap: 34,
  /** ALL gates together may not hold more live hellborn than this — the frame
   * budget's backstop. The ordinary horde still spawns on top of it. */
  globalMaxAlive: 90,
  /** Members released per batch at `openStage`. */
  perEmit: 2,
  /** Extra members per batch per rampage stage. */
  perEmitPerStage: 0.12,
  /** Ceiling on one batch's size. */
  perEmitCap: 9,
  /** Ms between batches at `openStage`. */
  intervalMs: 900,
  /** The batch interval is divided by `1 + stagesOver × this`, floored at
   * `intervalMinMs` — a deep rampage pours instead of dripping. */
  intervalShrinkPerStage: 0.06,
  /** Floor (ms) on the batch interval. */
  intervalMinMs: 140,
  /** Post-kill refill wait (ms) at `openStage`, shrunk by the same per-stage
   * divisor and floored at `respawnDelayMinMs`. */
  respawnDelayMs: 1800,
  /** Floor (ms) on the post-kill refill wait. */
  respawnDelayMinMs: 120,
  /** Gates allowed to burn at once at `openStage` — its own budget, counted
   * separately from `DifficultyDef.activeSpawnerCap`, so opening the gates
   * never starves the ordinary horde's pacing. */
  activeCap: 2,
  /** One more simultaneous gate per this many stages past `openStage`. */
  activeCapStagesPerSlot: 8,
  /** Ceiling on simultaneously burning gates. */
  activeCapMax: 12,
  /** How far (world px) a hellgate reaches to open. Wider than an ordinary
   * point's trigger: a gate tearing open half a screen away is the beat. */
  triggerRadius: 420,
  /** Added to a hellborn kill's drop CHANCE per rampage stage past `openStage`
   * (before the payout multiplier below). */
  dropBonusPerStage: 0.01,
  /** Added to a hellborn kill's TIER roll per rampage stage past `openStage` —
   * the rampage-scaled reward that replaces the evolution penalty. */
  tierBonusPerStage: 0.012,
  /** Cap on the stage count feeding `dropBonusPerStage`/`tierBonusPerStage`, so
   * an uncapped JESUS rampage can't make every drop a guaranteed rare. */
  bonusStageCap: 24,
  /** A hellborn kill's drop-roll multiplier at `openStage` — whole payouts,
   * exactly like a rare mob's `dropMult` (see `dropMinionLoot`). */
  dropMult: 2.5,
  /** Extra drop-roll multiplier per rampage stage past `openStage`. */
  dropMultPerStage: 0.18,
  /** Ceiling on a hellborn kill's payout count. */
  maxDropRolls: 7,
} as const;

/**
 * RARE & UNIQUE MOBS — Diablo-style special monsters laced into the levels
 * (see `EnemyDef.rarity` and `LevelDef.rareSpawns`). A RARE mob is a
 * generically-named oddity ("WANDERING TOURIST") that turns up about once per
 * map, solo or as a small pack; a UNIQUE mob is a NAMED, one-of-a-kind figure
 * that only appears on a fraction of runs and is always alone. Both are
 * MINION-role defs authored at ordinary minion numbers — the engine applies
 * the whole tier here at spawn (`spawnEnemy`), so every rare/unique rides the
 * same multipliers: tougher (hp), meaner (contact damage), levels ahead of
 * the horde for the loot gates (`levelBonus`), and far richer drop rolls
 * (`dropMult` multiplies the per-kill drop chance, every whole 1.0 of the
 * product a guaranteed payout — see `dropMinionLoot`). Like elites/bosses
 * they power-match the hero when the fight opens (`maybePowerScale`), so a
 * late-campaign rare is a real fight, not a placed-at-level-1 speed bump.
 */
export const RARE_MOBS = {
  /** The per-tier multipliers over the def's authored minion baseline. */
  tuning: {
    rare: {
      /** Hp multiplier — a rare mob is a genuine fight, not fodder. */
      hpMult: 5,
      /**
       * Kill-XP multiplier over a same-level minion's level-based payout
       * (`mobLevelXp`). Kill XP is now level-based, not hp-proportional, so a
       * rare's reward needs its own lever — set to match the old hp-driven
       * reward (it carried `hpMult`× the xp when xp tracked hp). A rare shows
       * up ~once per map and can't be farmed, so a fat single payout is worth
       * it without making mob-skipping the optimal XP route.
       */
      xpMult: 5,
      /** Contact-damage multiplier (folded into the mob's `contactMult`). */
      damageMult: 1.5,
      /** Multiplies the per-kill drop chance (~20× the rank and file). */
      dropMult: 20,
      /** Monster levels above the horde baseline (reaches tier gates early). */
      levelBonus: 2,
      /** Added to each equipment payout's tier roll. */
      tierBonus: 0.1,
    },
    unique: {
      hpMult: 10,
      xpMult: 10,
      damageMult: 2,
      dropMult: 100,
      levelBonus: 4,
      tierBonus: 0.2,
    },
  },
  /**
   * Chance the level's encounter of each tier exists at all, rolled once at
   * level creation: a rare shows up on most runs ("maybe once per map"), a
   * unique on about one run in five.
   */
  encounterChance: { rare: 0.8, unique: 0.2 },
  /**
   * Distance band the encounter is placed in, as fractions of the spawn→
   * objective axis (same yardstick as `SpawnSpec.band`) — off the doorstep,
   * but not camped on the boss.
   */
  band: [0.25, 0.9] as [number, number],
  /** Pack members scatter this far (world px) around the encounter anchor. */
  packScatter: 26,
  /** Ceiling on one kill's drop payouts, however high the multiplied chance
   * runs (LUCK and the dev drop-rate knob multiply in) — a loot burst, not a
   * carpet. */
  maxDropRolls: 8,
} as const;
