// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The simulation step. Called with a fixed timestep by the app's game loop;
// mutates the state in place and records what happened in `state.events` so
// the app layer can play sounds and flash effects. Order per step: player
// steering + jump physics → the wandering merchant (stroll / the meeting —
// merchant.ts) → weapon auto-attack → abilities (orbs, storms,
// stasis) → projectiles → enemies (aggro, elite ambush/dialogue, boss guard
// AI, contact damage) → hazards (gravity wells, asteroids — hazards.ts) →
// menace decay → wave spawner (the escalating horde) →
// item pickups → locked doors → objective check → win/lose. Kill resolution,
// loot rolls, and the menace meter live in loot.ts + menace.ts; dialogue and
// door rules in story.ts. Level-ups pause the
// run in the `levelup` phase until `allocateStat` spends the point(s);
// dialogue pauses it in `dialogue` until tapped through.

import { stepCutscene } from "@game/lib/cutscene.ts";
import {
  clamp,
  direction,
  distance,
  distanceSq,
  moveToward,
  type Vec2,
} from "@game/lib/vec.ts";
import {
  canBankAbility,
  grantAbility,
  abilityPowerScale,
  isSlotActive,
  magnetRadius,
  orbPositions,
  removeHeldSlot,
  stasisFactorAt,
} from "./abilities.ts";
import {
  AIM,
  APPARITION,
  CAMPING,
  ENEMY_AI,
  GATES,
  JUMP,
  LAST_STAND,
  LOOT,
  MAGIC_CRIT,
  MEDKIT,
  PACKS,
  PLAYER,
  PROJECTILE,
  RUN,
  SPELL,
  STAMINA,
  STATS,
  WEAPON,
} from "./config.ts";
import {
  boltProcDamage,
  itemSpellOrbPositions,
  novaProcParams,
  orbitSpellParams,
  stormSpellParams,
  syncItemSpells,
} from "./spells.ts";
import { maybeCompanionQuote, stepCompanions } from "./companions.ts";
import { stepAsteroids, stepWells } from "./hazards.ts";
import { spawnEnemy } from "./create.ts";
import { abilityDef } from "./defs/abilities.ts";
import { cutsceneDef } from "./defs/cutscenes.ts";
import {
  difficultyDef,
  meetsMinDifficulty,
  resolvePackCount,
  scaledMobCount,
} from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { weaponDef } from "./defs/equipment.ts";
import { levelDef, type PackSpec } from "./defs/levels/index.ts";
import {
  addToInventory,
  canCollectEquipment,
  armorReduction,
  effectiveStat,
  enemyCritChance,
  bankMedkit,
  bankStaminaPotion,
  consumeMedkit,
  consumeStaminaPotion,
  equipmentName,
  isAutoEquipEnabled,
  isBetterEquipment,
  maxMeleeTargets,
  medkitTierIndex,
  playerDodgeChance,
  playerSpeed,
  recomputeMaxHp,
  recomputeMaxStamina,
  repairEquippedWeapon,
  repairWornArmor,
  syncInventoryCapacity,
  weaponCooldownFor,
  weaponCritMult,
  weaponRangeFor,
  rollWeaponHit,
  weaponSweepHalfAngle,
  wearEquippedWeapon,
  wearWornArmor,
  wouldUpgradeSlot,
} from "./items.ts";
import { arrowColdXp, arrowXpShareAt } from "./leveling.ts";
import {
  grantXp,
  hitEnemy,
  packsCleared,
  queueStruckProcs,
  unspawnedMinions,
} from "./loot.ts";
import { revealAround } from "./map.ts";
import {
  mechDamageMult,
  mechSpeedMult,
  stepEnemyMechanics,
} from "./mechanics.ts";
import { repelFromMerchant, stepMerchant } from "./merchant.ts";
import {
  blockedByObstacle,
  insideObstacle,
  lineOfSight,
  resolveObstacles,
} from "./obstacles.ts";
import {
  currentMobLevel,
  lureMult,
  maybePowerScale,
  menaceStage,
  mobLevelScale,
  tickMenace,
} from "./menace.ts";
import {
  moveRangedEnemy,
  resolveHostileHit,
  stepRangedAttacks,
} from "./ranged.ts";
import {
  advanceCutsceneChain,
  collectStoryItem,
  startEnemyDialogue,
  stepDoors,
  stepGates,
  stepOpeningStrike,
  stepSightThoughts,
  wantsDialogue,
} from "./story.ts";
import { BALANCE } from "./tuning.ts";
import type {
  Enemy,
  Equipment,
  GameInput,
  GameState,
  Item,
  PackState,
  Projectile,
  WeaponClass,
} from "./types.ts";

/** Advance the simulation by `dtMs` milliseconds. */
export function step(state: GameState, input: GameInput, dtMs: number): void {
  state.events = [];

  // The prelude scenes run on the same clock as the sim (deterministic,
  // headless-testable); the world stays frozen until the chain plays out.
  if (state.phase === "cutscene") {
    if (state.cutscene && !state.cutscene.done) {
      stepCutscene(state.cutscene, cutsceneDef(state.cutscene.defId), dtMs);
    }
    if (!state.cutscene || state.cutscene.done) {
      advanceCutsceneChain(state);
    }
    return;
  }

  if (state.phase !== "playing") return;

  const dt = dtMs / 1000;
  state.stats.timeMs += dtMs;
  // The ding celebration: a fresh level-up burns on the hero for a beat
  // (golden pillar + fanfare) before the stat chooser pauses the run. The
  // window only ticks while `playing`, so a dialogue or pause that cuts in
  // merely postpones the chooser rather than racing it.
  if (state.levelUpFxMs > 0) {
    state.levelUpFxMs = Math.max(0, state.levelUpFxMs - dtMs);
    if (state.levelUpFxMs === 0 && state.player.pendingStatPoints > 0) {
      state.phase = "levelup";
    }
  }
  // Cool down the "bags are full" nudge so a player parked on uncarriable loot
  // gets one cue, not one per frame (see stepItems).
  if (state.bagFullHintCooldownMs > 0) {
    state.bagFullHintCooldownMs = Math.max(
      0,
      state.bagFullHintCooldownMs - dtMs,
    );
  }
  // The victory quake burns down alongside the countdown that armed it (the
  // renderer jitters the camera off this — see GameState.quakeMs).
  if (state.quakeMs > 0) {
    state.quakeMs = Math.max(0, state.quakeMs - dtMs);
  }

  // Snapshot cumulative output so the menace tick can read this step's damage
  // and kills as rates (see tickMenace) — the meter heats from what the player
  // is actually putting out, not from any single blow. The powerup-exempt
  // counters are snapshotted alongside so bomb/ability output is subtracted
  // out: a screen-nuke or damage powerup never escalates the horde.
  const damageBefore = state.stats.damageDealt;
  const killsBefore = state.stats.kills;
  const exemptDamageBefore = state.menaceExemptDamage;
  const exemptKillsBefore = state.menaceExemptKills;

  stepPlayer(state, input, dt, dtMs);
  // Walking lifts the fog of war around wherever the hero now stands.
  revealAround(state, state.player.pos);
  // The wandering merchant strolls (and may be MET) on this tick's player
  // position — right after the hero moves, so the meeting judges what the
  // player actually sees. A scenario FREEZE (state.freeze — the developer
  // pose switch) holds the world's actors entirely: the merchant stops
  // wandering (and can't be discovered mid-pose), the horde neither moves,
  // strikes, nor fires — while the hero stays fully playable.
  if (!state.freeze) stepMerchant(state, dt, dtMs);
  stepUseItem(state, input);
  stepUseConsumables(state, input);
  stepWeapon(state, input, dtMs);
  stepAbilities(state, dt, dtMs);
  // The forever spells worn gear grants (the `spell` affix) tick beside the
  // timed powers — same rails, no expiry.
  stepItemSpells(state, dt, dtMs);
  stepProjectiles(state, dt, dtMs);
  if (!state.freeze) {
    stepEnemies(state, dt, dtMs);
    // Shooters pull their triggers on the tick's final positions — after the
    // horde has moved, so the aim is judged on what the player actually sees.
    stepRangedAttacks(state, dtMs);
  }
  // The party acts on the tick's final enemy positions: regroup, fight,
  // soak contact blows, stand back up (see companions.ts). A freeze poses
  // the party with the rest of the world's actors.
  if (!state.freeze) stepCompanions(state, dt, dtMs);
  // Procs queued by this tick's combat — the hero's weapon blows (melee
  // sweep, his projectiles) AND the blows that landed ON him (contact,
  // mechanic slams, hostile shots — the "when struck" trigger) — resolve
  // HERE, after every pass that iterates the enemy list has finished: a
  // nova's kills must never splice that list out from under a sweep.
  stepProcs(state);
  // Magic crit BLOBS queued by this tick's magic crits burst here, on the same
  // rails and for the same reason as procs — after every enemy-list pass.
  stepMagicCritBlobs(state);
  // Environmental hazards act on this tick's positions, after everyone has
  // moved: the wells drag (and devour), the asteroids fly (and strike).
  stepWells(state, dt, dtMs);
  stepAsteroids(state, dt, dtMs);
  // Sight-pinned inner monologues fire on this tick's positions — after the
  // horde has moved, so "the hero sees one" means it is actually on screen.
  stepSightThoughts(state, levelDef(state.level.id).firstSightThoughts);
  // The scripted vanguard's proximity draws the blade (SpaceZ HQ's
  // `openingStrike`) — judged after the horde has moved and after the sighting
  // beat above, so the "look at this place" read always lands first.
  stepOpeningStrike(state);
  tickMenace(
    state,
    dtMs,
    state.stats.damageDealt -
      damageBefore -
      (state.menaceExemptDamage - exemptDamageBefore),
    state.stats.kills -
      killsBefore -
      (state.menaceExemptKills - exemptKillsBefore),
  );
  stepPacks(state);
  stepSpawner(state, dtMs);
  stepItems(state, dtMs);
  stepDoors(state);
  stepGates(state);

  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.phase = "defeat";
    state.events.push({ type: "defeat" });
    return;
  }

  // The level ends a beat after the objective clears, leaving time to grab
  // the loot.
  if (state.victoryCountdownMs === null && objectiveCleared(state)) {
    state.victoryCountdownMs = RUN.victoryDelayMs;
    // A level with an epilogue goes out with a bang: the world quakes
    // through the whole loot-grab window, and the black-screen outro takes
    // the stage when the countdown runs out.
    if ((levelDef(state.level.id).outro?.length ?? 0) > 0) {
      state.quakeMs = RUN.victoryDelayMs;
    }
  }
  if (state.victoryCountdownMs !== null) {
    state.victoryCountdownMs -= dtMs;
    if (state.victoryCountdownMs <= 0) {
      state.victoryCountdownMs = 0;
      // The quake ends with the countdown — the black-screen outro (and the
      // splash behind it) sit on steady ground.
      state.quakeMs = 0;
      state.events.push({ type: "victory" });
      // A level that ships an outro reads its epilogue before the splash:
      // the `outro` phase mirrors the intro's black-screen pages
      // (advanceOutro turns them; past the last page comes `victory`).
      const outro = levelDef(state.level.id).outro;
      state.phase = outro && outro.length > 0 ? "outro" : "victory";
    }
  }
}

/** Has the level's objective been met? */
function objectiveCleared(state: GameState): boolean {
  const objective = levelDef(state.level.id).objective;
  if (objective.type === "reachExit") {
    // The bossless form: standing at the exit door ends the level. Deliberate
    // contact — the radius is a doorstep, not a drive-by.
    return (
      distance(state.player.pos, objective.at) <=
      (objective.radius ?? GATES.exitRadius)
    );
  }
  if (objective.type === "clearAll") {
    // Apparitions never count as foes — an unvisited (hence unvanished)
    // dialogue figure must not hold a cleared field hostage. Every placed
    // pack must also be reached and wiped: a dormant cluster is unspawned
    // foes the player still owes.
    return (
      !state.enemies.some((e) => !enemyDef(e.defId).apparition) &&
      unspawnedMinions(state) === 0 &&
      packsCleared(state)
    );
  }
  return !state.enemies.some((e) => enemyDef(e.defId).role === "boss");
}

/**
 * The horde spawner, three pressures stacked plus two anti-camp flows.
 * (1) Each wave-budget line streams its count in over its time window,
 * eased quadratically, so the ramp ends in an overwhelming flood.
 * (2) Walking the level spends moveSpawnCredit — every `moveSpawnEvery` px
 * stirs one extra monster awake. (3) A live floor (`minAlive`) pulls spawns
 * forward whenever the field goes quiet, so there is always a pack on
 * screen. All three draw from the same finite budget; spawns land in a ring
 * just outside the player's view and give chase at once; the live cap
 * defers (never cancels) what the field can't hold.
 *
 * CAMPING starves the first and third pressures (config CAMPING): a player
 * who parks in one spot stops being fed after a grace period — the floor
 * fades out and the timed stream holds — and the only arrivals left are a
 * slow BECKONING trickle walking in from the objective's direction, luring
 * him onward. Moving re-anchors the camp clock and the held flood resumes.
 * And once a killBoss level's budget is fully spent, a thin endless
 * STRAGGLER stream keeps arriving from that same direction, so the walk to
 * the boss never crosses a dead-empty map.
 */
function stepSpawner(state: GameState, dtMs: number): void {
  const waves = levelDef(state.level.id).waves;
  if (!waves) return;

  // The camp clock: staying inside campRadius of where the player last
  // settled counts up; stepping out re-anchors and resets. Starvation eases
  // 0→1 across the fade window once the grace runs out.
  if (distance(state.player.pos, state.campAnchor) > CAMPING.campRadius) {
    state.campAnchor = { ...state.player.pos };
    state.campMs = 0;
  } else {
    state.campMs += dtMs;
  }
  const starvation = clamp(
    (state.campMs - CAMPING.graceMs) / CAMPING.fadeMs,
    0,
    1,
  );
  state.trickleMs = Math.max(0, state.trickleMs - dtMs);

  // Difficulty scales the horde: every budget line grows by the mob
  // multiplier, and the live cap/floor stretch so the bigger budget can
  // actually crowd the field instead of queueing behind medium's cap. Menace
  // stacks on top — a rampaging player lures a denser, bigger crowd (lureMult
  // ≥ 1), so the floor and cap both swell with the escalation.
  const aliveMult =
    difficultyDef(state.difficulty).aliveMult *
    lureMult(state) *
    BALANCE.hordeSize;
  const maxAlive = Math.round(waves.maxAlive * aliveMult);
  // The floor starves as the player camps: a parked hero watches his
  // surroundings drain instead of farming an endless refill.
  const minAlive = Math.round(waves.minAlive * aliveMult * (1 - starvation));

  let alive = 0;
  let near = 0; // minions close enough to count as "on the player's screen"
  const nearRadiusSq = ENEMY_AI.nearRadius * ENEMY_AI.nearRadius;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).role !== "minion") continue;
    alive++;
    if (distanceSq(enemy.pos, state.player.pos) <= nearRadiusSq) near++;
  }

  // A fully-starved camper also pauses the timed stream — the horde loses
  // interest in a parked target. The window math is monotone, so nothing is
  // canceled: the held backlog floods back in the moment he moves on.
  const t = state.stats.timeMs;
  if (starvation < 1) {
    outer: for (let i = 0; i < waves.budget.length; i++) {
      const entry = waves.budget[i] as (typeof waves.budget)[number];
      // A budget line below its difficulty gate never streams in.
      if (!meetsMinDifficulty(state.difficulty, entry.minDifficulty)) continue;
      const count = scaledMobCount(entry.count, state.difficulty);
      const spawned = state.waveSpawned[i] ?? 0;
      if (spawned >= count) continue;

      const start = entry.window[0] * waves.rampDurationMs;
      const end = entry.window[1] * waves.rampDurationMs;
      const progress = clamp((t - start) / Math.max(1, end - start), 0, 1);
      const eased = progress * progress;
      let due = Math.floor(count * eased) - spawned;

      while (due-- > 0 && alive < maxAlive) {
        if (!spawnWaveEnemy(state, entry.enemy)) break outer;
        state.waveSpawned[i] = (state.waveSpawned[i] ?? 0) + 1;
        alive++;
      }
    }
  }

  // Movement pressure: spend the walked distance banked by stepPlayer.
  while (state.moveSpawnCredit >= waves.moveSpawnEvery && alive < maxAlive) {
    if (!spawnFromBudget(state, waves)) break;
    state.moveSpawnCredit -= waves.moveSpawnEvery;
    alive++;
  }
  // A capped field must not bank an instant flood for later.
  state.moveSpawnCredit = Math.min(
    state.moveSpawnCredit,
    waves.moveSpawnEvery * 8,
  );

  // The floor: while the budget lasts, the player's surroundings never go
  // quiet — spawns land in the ring, inside the near-count radius.
  while (near < minAlive && alive < maxAlive) {
    if (!spawnFromBudget(state, waves)) break;
    near++;
    alive++;
  }

  // The trickle flows: a starved camper is BECKONED — one budget mob at a
  // time walks in from the objective's direction — and a spent budget on a
  // killBoss level leaves an endless thin STRAGGLER stream from the same
  // bearing, so the field is never dead. Both hold once the objective clears.
  if (
    state.victoryCountdownMs === null &&
    state.trickleMs <= 0 &&
    alive < maxAlive
  ) {
    const budgetLeft = unspawnedMinions(state) > 0;
    if (starvation > 0 && budgetLeft) {
      if (spawnFromBudget(state, waves, spawnGoal(state))) {
        state.trickleMs = CAMPING.beaconEveryMs;
      }
    } else if (
      !budgetLeft &&
      levelDef(state.level.id).objective.type === "killBoss" &&
      near < CAMPING.stragglerMinAlive
    ) {
      if (spawnStraggler(state, waves, spawnGoal(state))) {
        state.trickleMs = CAMPING.stragglerEveryMs;
      }
    }
  }
}

/**
 * Where the player SHOULD be going — the bearing the beckoning trickle and
 * the straggler stream arrive from: the nearest living boss, else the nearest
 * living elite (the remaining set pieces ARE the level's to-do list). Null
 * when neither stands; the trickle then falls back to the plain ring.
 */
function spawnGoal(state: GameState): Vec2 | null {
  let boss: Vec2 | null = null;
  let elite: Vec2 | null = null;
  let bossDistSq = Infinity;
  let eliteDistSq = Infinity;
  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
    if (def.apparition) continue;
    if (def.role === "boss") {
      const d = distanceSq(enemy.pos, state.player.pos);
      if (d < bossDistSq) {
        bossDistSq = d;
        boss = enemy.pos;
      }
    } else if (def.role === "elite") {
      const d = distanceSq(enemy.pos, state.player.pos);
      if (d < eliteDistSq) {
        eliteDistSq = d;
        elite = enemy.pos;
      }
    }
  }
  return boss ?? elite;
}

/** Pull one monster forward from the earliest unfinished budget line.
 * `toward` biases the spawn ring toward that bearing (see spawnWaveEnemy). */
function spawnFromBudget(
  state: GameState,
  waves: NonNullable<ReturnType<typeof levelDef>["waves"]>,
  toward: Vec2 | null = null,
): boolean {
  for (let i = 0; i < waves.budget.length; i++) {
    const entry = waves.budget[i] as (typeof waves.budget)[number];
    if (!meetsMinDifficulty(state.difficulty, entry.minDifficulty)) continue;
    const spawned = state.waveSpawned[i] ?? 0;
    if (spawned >= scaledMobCount(entry.count, state.difficulty)) continue;
    if (!spawnWaveEnemy(state, entry.enemy, toward)) return false;
    state.waveSpawned[i] = spawned + 1;
    return true;
  }
  return false;
}

/**
 * Mint one EXTRA monster beyond the wave budget — the endless straggler
 * stream that keeps a killBoss level's field alive once the budget is spent.
 * Draws a kind from the difficulty-eligible budget lines so the stragglers
 * look like the level's own horde; never books against `waveSpawned`.
 */
function spawnStraggler(
  state: GameState,
  waves: NonNullable<ReturnType<typeof levelDef>["waves"]>,
  toward: Vec2 | null,
): boolean {
  const pool = waves.budget.filter((entry) =>
    meetsMinDifficulty(state.difficulty, entry.minDifficulty),
  );
  if (pool.length === 0) return false;
  const entry = pool[
    Math.floor(state.rng() * pool.length)
  ] as (typeof pool)[number];
  return spawnWaveEnemy(state, entry.enemy, toward);
}

/**
 * Drop one wave monster into the spawn ring around the player. Near a wall
 * the clamped ring can collapse onto the player — rejection-sample a few
 * angles and defer the spawn (false) rather than place an unfair one.
 * `toward` narrows the ring to a cone around that bearing (the beckoning
 * trickle arrives from where the player should be going); the last attempts
 * fall back to the full ring so a goal against a wall can't wedge the spawn.
 */
function spawnWaveEnemy(
  state: GameState,
  defId: string,
  toward: Vec2 | null = null,
): boolean {
  const def = enemyDef(defId);
  for (let attempts = 0; attempts < 8; attempts++) {
    const angle =
      toward && attempts < 5
        ? Math.atan2(
            toward.y - state.player.pos.y,
            toward.x - state.player.pos.x,
          ) +
          (state.rng() * 2 - 1) * ((CAMPING.directionSpreadDeg * Math.PI) / 180)
        : state.rng() * Math.PI * 2;
    const ring =
      ENEMY_AI.minSpawnDistance + state.rng() * ENEMY_AI.spawnRingWidth;
    const pos = {
      x: clamp(
        state.player.pos.x + Math.cos(angle) * ring,
        def.radius,
        state.level.width - def.radius,
      ),
      y: clamp(
        state.player.pos.y + Math.sin(angle) * ring,
        def.radius,
        state.level.height - def.radius,
      ),
    };
    if (distance(pos, state.player.pos) < ENEMY_AI.minSpawnDistance) continue;
    if (insideObstacle(state, pos, def.radius)) continue;
    // Stamp the current menace stage: a mob spawned into a rampage evolves —
    // more hp, more xp, better loot (see menace.ts / spawnEnemy), hitting as
    // hard as the difficulty's menaceEffectMult says. The base hp is the
    // horde's RELATIVE level: the player's live level plus the difficulty's
    // offset (mobLevelScale), so the swarm keeps its distance as he grows.
    state.enemies.push(
      spawnEnemy(
        defId,
        pos,
        state.rng,
        state.nextId++,
        mobLevelScale(state),
        menaceStage(state),
        difficultyDef(state.difficulty).menaceEffectMult,
        currentMobLevel(state),
      ),
    );
    return true;
  }
  return false;
}

/**
 * PLACED PACKS (config PACKS / `LevelDef.packs`): the movement-driven counter
 * to the survivors-style wave horde. Each pack SLEEPS on its patch of ground
 * until the player closes to its trigger radius, then WAKES — its members
 * spawn scattered around the anchor and give chase at once — and once every
 * woken member is dead the pack is CLEARED for good. A map built from packs is
 * emptied by WALKING it, one designed encounter at a time, instead of farmed
 * from a standstill. Dormant packs still count as unspawned foes, so a
 * `clearAll` level isn't won until every pack has been reached and wiped.
 */
function stepPacks(state: GameState): void {
  const packs = state.packs;
  if (packs.length === 0) return;
  const specs = levelDef(state.level.id).packs ?? [];
  // A frozen pose (scenario staging) or the post-objective victory lap never
  // wakes a fresh fight; already-active packs still resolve their clears.
  const canWake = !state.freeze && state.victoryCountdownMs === null;
  // Built lazily and only when an active pack needs it: the set of live enemy
  // ids, so "are any of this pack's members still up?" is O(members), not
  // O(members × enemies) every tick.
  let aliveIds: Set<number> | null = null;
  for (let i = 0; i < packs.length; i++) {
    const pack = packs[i] as PackState;
    if (pack.status === "dormant") {
      if (
        canWake &&
        distance(state.player.pos, pack.at) <= pack.triggerRadius
      ) {
        wakePack(state, pack, specs[i] as PackSpec);
      }
    } else if (pack.status === "active") {
      if (!aliveIds) aliveIds = new Set(state.enemies.map((e) => e.id));
      if (!pack.memberIds.some((id) => aliveIds!.has(id))) {
        pack.status = "cleared";
        const remaining = packs.filter((p) => p.status !== "cleared").length;
        state.events.push({
          type: "packCleared",
          pos: { ...pack.at },
          remaining,
        });
      }
    }
  }
}

/**
 * Wake one dormant pack: mint every member scattered around the anchor and set
 * it fighting. Members spawn at the horde's live relative level and current
 * menace stage (like a wave spawn), so a pack reached late in a long run is
 * still a threat rather than trivial fodder. A pack that resolves to zero
 * members on this rung is marked cleared without a peep.
 */
function wakePack(state: GameState, pack: PackState, spec: PackSpec): void {
  for (const member of spec.members) {
    const count = resolvePackCount(member.count, state.difficulty);
    const radius = enemyDef(member.enemy).radius;
    for (let n = 0; n < count; n++) {
      const enemy = spawnEnemy(
        member.enemy,
        packMemberPos(state, pack, radius),
        state.rng,
        state.nextId++,
        mobLevelScale(state),
        menaceStage(state),
        difficultyDef(state.difficulty).menaceEffectMult,
        currentMobLevel(state),
      );
      state.enemies.push(enemy);
      pack.memberIds.push(enemy.id);
    }
  }
  if (pack.memberIds.length > 0) {
    pack.status = "active";
    state.events.push({
      type: "packAwoken",
      pos: { ...pack.at },
      count: pack.memberIds.length,
    });
  } else {
    pack.status = "cleared";
  }
}

/**
 * A spawn spot for one pack member: uniformly scattered within the pack's
 * `spawnRadius` of its anchor (sqrt for an even fill of the disc, not a
 * center-heavy clump), rejection-sampled to clear obstacles and the map edge.
 * Falls back to the clamped anchor rather than fail — a stacked spawn is
 * better than a missing member the clear count would wait on forever.
 */
function packMemberPos(
  state: GameState,
  pack: PackState,
  radius: number,
): Vec2 {
  const { width, height } = state.level;
  for (let attempt = 0; attempt < PACKS.placeAttempts; attempt++) {
    const angle = state.rng() * Math.PI * 2;
    const dist = Math.sqrt(state.rng()) * pack.spawnRadius;
    const pos = {
      x: clamp(pack.at.x + Math.cos(angle) * dist, radius, width - radius),
      y: clamp(pack.at.y + Math.sin(angle) * dist, radius, height - radius),
    };
    if (!insideObstacle(state, pos, radius)) return pos;
  }
  return {
    x: clamp(pack.at.x, radius, width - radius),
    y: clamp(pack.at.y, radius, height - radius),
  };
}

function stepPlayer(
  state: GameState,
  input: GameInput,
  dt: number,
  dtMs: number,
): void {
  const player = state.player;
  player.hurtFlashMs = Math.max(0, player.hurtFlashMs - dtMs);
  player.moving = false;

  // A gentle nudge of the dpad walks slowly; a full push runs. The throttle
  // never fully stops the walk (a held-but-centered finger still creeps) and
  // defaults to full speed for headless callers that omit it.
  const throttle = clamp(input.throttle ?? 1, 0, 1);
  // An empty stamina pool caps the top speed to a winded jog until it recovers.
  const staminaFactor = player.stamina > 0 ? 1 : STAMINA.emptySpeedFactor;
  // Standing still until proven moving — the realized velocity the smart
  // shooters lead with (stepRangedAttacks) must read zero for a parked hero.
  player.vel.x = 0;
  player.vel.y = 0;

  if (
    input.steering &&
    distance(player.pos, input.target) > PLAYER.arriveRadius
  ) {
    const before = player.pos;
    const next = moveToward(
      player.pos,
      input.target,
      playerSpeed(state) * throttle * staminaFactor * dt,
    );
    if (dt > 0) {
      player.vel.x = (next.x - before.x) / dt;
      player.vel.y = (next.y - before.y) / dt;
    }
    player.facing = direction(before, input.target);
    // The sprite flip only follows decisively horizontal movement —
    // near-vertical steering would otherwise mirror-flicker every step.
    if (Math.abs(player.facing.x) >= PLAYER.faceFlipMinX) {
      player.faceLeft = player.facing.x < 0;
    }
    // Walking stirs the horde: bank the distance for the wave spawner.
    state.moveSpawnCredit += distance(before, next);
    player.pos = next;
    player.moving = true;
  }

  // Stamina: a decisive run spends it; a walk and standing both recover it,
  // but a walk only half as fast (walkRegenFactor) since a stroll is a lesser
  // breather than a full stop. The STAMINA stat deepens the reserve
  // (computeMaxStamina) and, here, both slows the drain and quickens the regen.
  const staminaStat = effectiveStat(state, "stamina");
  const running = player.moving && throttle > STAMINA.runThreshold;
  if (running) {
    // Harder difficulties wind the hero a touch faster (staminaDrainMult).
    const drain =
      (STAMINA.drainPerSec * difficultyDef(state.difficulty).staminaDrainMult) /
      (1 + staminaStat * STAMINA.drainReductionPerPoint);
    player.stamina = Math.max(0, player.stamina - drain * dt);
  } else {
    const walkFactor = player.moving ? STAMINA.walkRegenFactor : 1;
    const regen =
      STAMINA.regenPerSec *
      (1 + staminaStat * STAMINA.regenPerPoint) *
      walkFactor;
    player.stamina = Math.min(player.maxStamina, player.stamina + regen * dt);
  }

  // Track how long the pool has sat BONE-DRY so the stamina-drink mercy roll can
  // ramp its chance with time stranded (see `staminaDrinkChance`); any stamina
  // back resets it, so catching a breath drops straight back to the baseline.
  state.staminaEmptyMs = player.stamina <= 0 ? state.staminaEmptyMs + dtMs : 0;

  // Jump: only from the ground. Gravity is the level's — the moon's low g
  // turns the same takeoff into a high, floaty arc.
  if (input.jump && player.z === 0) {
    player.vz = JUMP.velocity;
    player.z = player.vz * dt;
    state.events.push({ type: "jump" });
  } else if (player.z > 0 || player.vz !== 0) {
    player.vz -= state.level.gravity * dt;
    player.z += player.vz * dt;
    if (player.z <= 0) {
      player.z = 0;
      player.vz = 0;
      state.events.push({ type: "land" });
    }
  }

  // Solid ground features: only jumpable ones can be cleared, and only
  // while actually high enough — landing on one pushes the player off it.
  resolveObstacles(state, player.pos, PLAYER.radius, player.z);

  // The level is finite: clamp to its bounds.
  player.pos.x = clamp(
    player.pos.x,
    PLAYER.radius,
    state.level.width - PLAYER.radius,
  );
  player.pos.y = clamp(
    player.pos.y,
    PLAYER.radius,
    state.level.height - PLAYER.radius,
  );
}

/**
 * Spend one banked ability pickup on the `useItem` input edge. By default the
 * oldest still-banked slot kicks in; `useItemIndex` names a specific dock slot.
 * A slot whose power is already running is skipped (it counts down in place),
 * and an index landing on one — or out of range — falls back to the oldest
 * banked slot; with none banked the input is a quiet no-op.
 *
 * A spent power does NOT leave its slot: it keeps counting down there (linked
 * via ActiveAbility.slot) and only frees the slot when it lapses, so the dock
 * stays full while it runs. The instant NUKE is the exception — it fires and
 * vacates its slot at once. grantAbility emits the abilityStarted event; a
 * non-stackable power already running refuses to re-activate (grantAbility
 * returns false), leaving its pickup banked rather than wasted.
 */
function stepUseItem(state: GameState, input: GameInput): void {
  if (!input.useItem) return;
  const held = state.player.heldAbilities;
  const wanted = input.useItemIndex;
  const usable =
    wanted !== undefined &&
    wanted >= 0 &&
    wanted < held.length &&
    !isSlotActive(state, wanted);
  const index = usable
    ? wanted
    : held.findIndex((_, i) => !isSlotActive(state, i));
  if (index < 0) return;
  const defId = held[index];
  if (!defId) return;
  const def = abilityDef(defId);
  if (def.nuke) {
    removeHeldSlot(state, index);
    detonateNuke(state, def.nuke.radius);
    return;
  }
  // The slot keeps its powerup while the copy runs; grantAbility links the copy
  // to `index`. A refused re-activation (a running non-stackable power) starts
  // nothing and leaves the slot as it was.
  grantAbility(state, defId, index);
}

/**
 * Spend a stacked consumable on the player's input edge: `useMedkit` heals
 * with the best-quality kit held, `useStaminaPotion` refills the sprint pool.
 * Both are quiet no-ops when nothing is held or there is nothing to top up
 * (see consumeMedkit / consumeStaminaPotion), so a mistap never wastes a kit.
 */
function stepUseConsumables(state: GameState, input: GameInput): void {
  if (input.useMedkit) consumeMedkit(state);
  if (input.useStaminaPotion) consumeStaminaPotion(state);
}

/**
 * The screen-nuke pickup: every horde minion within the radius, and not
 * behind a rock, dies on the spot. Elites and bosses shrug it off — the
 * set-piece fights are meant to be fought, not skipped, so the blast only
 * clears the rank and file. A tall obstacle stops the blast the same way it
 * stops a shot — a mob sheltered behind the stone rides it out. Kills flow
 * through hitEnemy, so XP, loot rolls, the pity rule, and the all-clear
 * trophy all behave exactly as if the player had done it the hard way —
 * except the screen-nuke slices themselves (`noNukeDrop`): a bomb's kills
 * never chain into another bomb.
 */
function detonateNuke(state: GameState, radius: number): void {
  state.events.push({ type: "nuke", pos: { ...state.player.pos } });
  const radiusSq = radius * radius;
  const caught = state.enemies.filter((enemy) => {
    const def = enemyDef(enemy.defId);
    return (
      def.role === "minion" &&
      !def.apparition &&
      distanceSq(enemy.pos, state.player.pos) <= radiusSq &&
      lineOfSight(state, state.player.pos, enemy.pos)
    );
  });
  for (const enemy of caught) {
    hitEnemy(state, enemy, enemy.hp, undefined, {
      noNukeDrop: true,
      noMenace: true,
    });
  }
}

/**
 * The character fights autonomously with whatever is in the weapon slot:
 * melee weapons strike the nearest monster in reach directly, the rest fire
 * a projectile at it. Only monsters inside the current view (input.view)
 * are targets — the character never shoots at enemies the player can't see.
 */
function stepWeapon(state: GameState, input: GameInput, dtMs: number): void {
  const player = state.player;
  // Holstered on levels with a scripted opening strike: the auto-attack sits
  // out entirely until the vanguard's first swing draws the blade (story.ts).
  if (player.disarmed) return;
  player.weaponCooldownMs = Math.max(0, player.weaponCooldownMs - dtMs);
  if (player.weaponCooldownMs > 0) return;

  const equipped = player.equipment.weapon;
  const weapon = weaponDef(equipped.defId);
  // No target through a wall: the character never wastes a swing or a shot
  // on a monster it can't actually reach. INTELLIGENCE widens every weapon's
  // reach, so a high-INT build strikes from a touch further out.
  const range = weaponRangeFor(state, equipped);
  // A desktop mouse tilts the pick toward whatever the cursor points at (a unit
  // bearing from the hero); a pointer resting on the hero has no bearing, so the
  // zero vector below falls straight back to the nearest foe.
  const aim = input.aim ? direction(player.pos, input.aim) : undefined;
  const target = nearestEnemy(
    state.enemies,
    player.pos,
    range,
    input.view,
    (enemy) => lineOfSight(state, player.pos, enemy.pos),
    aim,
  );
  if (!target) return;

  // The speed stat quickens the cadence: DEX (melee & ranged) and INT (magic)
  // each drop the effective cooldown as they rise.
  player.weaponCooldownMs = weaponCooldownFor(state, equipped);
  const dir = direction(player.pos, target.pos);
  if (!weapon.projectile) {
    // A swing cleaves a cone: the nearest monster is the aim, and every other
    // monster within reach and inside the weapon's arc is struck in the same
    // blow — but only the nearest `maxMeleeTargets` of them (INT raises that
    // cap). A blade sweeps a wide slash; a spear thrusts a narrow cone far.
    const half = weaponSweepHalfAngle(state, equipped);
    state.events.push({
      type: "swing",
      pos: { ...player.pos },
      dir,
      range,
      arc: half * 2,
    });
    meleeSweep(
      state,
      dir,
      range,
      half,
      equipped,
      maxMeleeTargets(state),
      weapon.class,
      weaponCritMult(state, equipped),
    );
    // Wear AFTER the strike so the blow lands with the weapon that swung.
    wearEquippedWeapon(state);
    return;
  }

  // One trigger pull, `count` projectiles: a single shot flies straight at
  // the aim; a shotgun's volley fans its pellets evenly across `spreadDeg`
  // around it. Every pellet carries the weapon's full per-hit damage, each
  // rolled INDEPENDENTLY inside the weapon's variance band — so a volley's
  // pellets bite for a spread of numbers, not one repeated figure. The fan
  // itself is the falloff (fewer pellets connect at range).
  const spec = weapon.projectile;
  const count = Math.max(1, spec.count ?? 1);
  const spread = ((spec.spreadDeg ?? 0) * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const offset = count > 1 ? (i / (count - 1) - 0.5) * spread : 0;
    const cos = Math.cos(offset);
    const sin = Math.sin(offset);
    const pelletDir = {
      x: dir.x * cos - dir.y * sin,
      y: dir.x * sin + dir.y * cos,
    };
    const hit = rollWeaponHit(state, equipped);
    const projectile: Projectile = {
      id: state.nextId++,
      pos: { ...player.pos },
      dir: pelletDir,
      speed: spec.speed,
      radius: spec.radius,
      damage: hit.damage,
      damageRoll: hit.roll,
      lifetimeMs: spec.lifetimeMs,
      weaponClass: weapon.class,
      sprite: spec.sprite,
      // The shot leaves from the shooter's height and sinks back in flight.
      z: player.z,
    };
    if (spec.pierce) projectile.pierceLeft = spec.pierce;
    if (spec.homing) projectile.homing = spec.homing;
    if (spec.chain) projectile.chain = spec.chain;
    projectile.critMult = weaponCritMult(state, equipped);
    state.projectiles.push(projectile);
  }
  state.stats.shotsFired++;
  state.events.push({
    type: "shot",
    weaponClass: weapon.class,
    pos: { ...player.pos },
    dir,
  });
  wearEquippedWeapon(state);
}

/**
 * Resolve a melee swing's cone: strike every monster within `range` of the
 * player and inside `halfAngle` of the aim `dir`. Each body takes its OWN
 * damage roll (crits roll per hit inside hitEnemy too), so one swing bites a
 * crowd for a spread of numbers rather than stamping the same figure on all of
 * them. The nearest monster — the aim — always sits at the cone's centre, so a
 * swing never whiffs the target it locked onto; the arc just lets it cleave
 * whatever else it faces. A monster touching the player has no meaningful
 * bearing and is always in reach. Walls still block: a monster behind cover is
 * spared even inside the cone. Iterates a snapshot because hitEnemy removes the
 * slain from state.enemies.
 */
function meleeSweep(
  state: GameState,
  dir: Vec2,
  range: number,
  halfAngle: number,
  weapon: Equipment,
  maxTargets: number,
  weaponClass: WeaponClass,
  critMult: number,
): void {
  const player = state.player;
  const rangeSq = range * range;
  const cosHalf = Math.cos(halfAngle);
  // Gather every foe the cone can reach, then strike only the `maxTargets`
  // NEAREST of them: the swing catches the crowd closest to the blade, and
  // the locked-on target (always the nearest) is guaranteed among them.
  // Collecting first — instead of hitting inside the loop — keeps the cap
  // honest even though hitEnemy mutates state.enemies as foes fall.
  const eligible: { enemy: Enemy; distSq: number }[] = [];
  for (const enemy of state.enemies) {
    const dx = enemy.pos.x - player.pos.x;
    const dy = enemy.pos.y - player.pos.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > rangeSq) continue;
    const def = enemyDef(enemy.defId);
    // The blade sweeps clean through an apparition — nothing to strike.
    if (def.apparition) continue;
    const radius = def.radius;
    // Overlapping the player: no bearing to test, always struck. Otherwise the
    // enemy must fall inside the cone (compare cosines, no atan2 needed).
    if (distSq > radius * radius) {
      const dist = Math.sqrt(distSq);
      const dot = (dx * dir.x + dy * dir.y) / dist;
      if (dot < cosHalf) continue;
    }
    if (!lineOfSight(state, player.pos, enemy.pos)) continue;
    eligible.push({ enemy, distSq });
  }
  eligible.sort((a, b) => a.distSq - b.distSq);
  for (let i = 0; i < eligible.length && i < maxTargets; i++) {
    // Roll each body's blow on its own so a cleave lands a spread of numbers.
    const { damage, roll } = rollWeaponHit(state, weapon);
    hitEnemy(
      state,
      (eligible[i] as (typeof eligible)[number]).enemy,
      damage,
      weaponClass,
      { rollAccuracy: true, critMult, damageRoll: roll },
    );
  }
}

function nearestEnemy(
  enemies: Enemy[],
  from: Vec2,
  range: number,
  view?: GameInput["view"],
  clear?: (enemy: Enemy) => boolean,
  aim?: Vec2,
): Enemy | undefined {
  const rangeSq = range * range;
  // With a pointer bearing (desktop mouse) the pick is scored by distance
  // AND alignment with the cursor, so the aimed-at foe wins over a closer one
  // off to the side; without it (or a zero bearing) it's the plain nearest.
  const aimed = aim !== undefined && (aim.x !== 0 || aim.y !== 0);
  let best: Enemy | undefined;
  let bestScore = aimed ? Infinity : rangeSq;
  for (const enemy of enemies) {
    if (view && !insideView(enemy.pos, view)) continue;
    // Apparitions are never targets — the weapon (and the storm) look
    // straight through them at the real crowd.
    if (enemyDef(enemy.defId).apparition) continue;
    const dSq = distanceSq(from, enemy.pos);
    if (dSq > rangeSq) continue;
    let score = dSq;
    if (aimed) {
      const dist = Math.sqrt(dSq);
      // Alignment of the foe's bearing with the cursor's: 1 dead ahead of the
      // pointer, −1 directly behind the hero from it. A foe on top of the hero
      // has no bearing — count it perfectly aligned so a point-blank threat is
      // never pushed away by the bias.
      const dot =
        dist === 0
          ? 1
          : ((enemy.pos.x - from.x) * aim.x + (enemy.pos.y - from.y) * aim.y) /
            dist;
      score = dist * (1 + AIM.biasStrength * (1 - dot) * 0.5);
    }
    // `clear` (line of sight) is checked lazily — only for candidates that
    // would actually win — so its cost scales with improvements, not with
    // the whole horde.
    if (score <= bestScore && (!clear || clear(enemy))) {
      best = enemy;
      bestScore = score;
    }
  }
  return best;
}

/** Is a world position on screen (inside the camera rect)? */
function insideView(pos: Vec2, view: NonNullable<GameInput["view"]>): boolean {
  return (
    pos.x >= view.x &&
    pos.x <= view.x + view.width &&
    pos.y >= view.y &&
    pos.y <= view.y + view.height
  );
}

/**
 * Advance the player's time-limited abilities: orbit orbs sweep and mangle
 * what they touch, storms strike the nearest monster on an interval, and
 * expired abilities fall away. (Stasis fields act inside moveEnemy.) All
 * damage flows through hitEnemy, so crits, XP, and loot work unchanged.
 */
function stepAbilities(state: GameState, dt: number, dtMs: number): void {
  const player = state.player;
  if (player.abilities.length === 0) return;

  // The conjured powers' damage scale (level ramp × INT — abilityPowerScale):
  // catalog numbers are level-1 values; this keeps a powerup meaning the same
  // fraction of a level-appropriate healthbar all campaign.
  const power = abilityPowerScale(state);

  for (const ability of player.abilities) {
    ability.remainingMs -= dtMs;
    ability.cooldownMs = Math.max(0, ability.cooldownMs - dtMs);
    const def = abilityDef(ability.defId);

    if (def.orbit) {
      ability.angle += def.orbit.angularSpeed * dt;
      if (ability.cooldownMs <= 0) {
        let struck = false;
        for (const orb of orbPositions(player, ability)) {
          let victim: Enemy | undefined;
          for (const enemy of state.enemies) {
            const enemyDefData = enemyDef(enemy.defId);
            if (enemyDefData.apparition) continue;
            const reach = enemyDefData.radius + def.orbit.orbRadius;
            if (distanceSq(enemy.pos, orb) <= reach * reach) {
              victim = enemy;
              break;
            }
          }
          if (!victim) continue;
          // Conjured abilities crit off INTELLIGENCE, like the magic they are.
          // A powerup's kills stay out of the menace meter (`noMenace`).
          hitEnemy(state, victim, def.orbit.damage * power, "magic", {
            noMenace: true,
          });
          struck = true;
        }
        if (struck) ability.cooldownMs = def.orbit.hitCooldownMs;
      }
    }

    if (def.storm && ability.cooldownMs <= 0) {
      const victim = nearestEnemy(state.enemies, player.pos, def.storm.range);
      if (victim) {
        ability.cooldownMs = def.storm.intervalMs;
        state.events.push({ type: "lightning", pos: { ...victim.pos } });
        hitEnemy(state, victim, def.storm.damage * power, "magic", {
          noMenace: true,
        });
      }
    }

    // The magnet: drops caught in the field fly at the player. Actual
    // pickup stays stepItems' job once they arrive within reach.
    if (def.magnet) {
      const reach = magnetRadius(state, def);
      const reachSq = reach * reach;
      const pull = def.magnet.pullSpeed * dt;
      for (const item of state.items) {
        // A drop still being flown in by its angel is airborne — the magnet
        // can't reel a gift out of the guardian's hands (see stepItems).
        if (item.deliverMs !== undefined && item.deliverMs > 0) continue;
        // Gear the hero can't keep — a find that neither auto-equips nor fits
        // the bag — is left where it lies; reeling it in would only pile
        // uncollectable loot at his feet (stepItems turns it away on arrival).
        if (
          item.kind === "equipment" &&
          !canCollectEquipment(state, item.equipment)
        )
          continue;
        if (distanceSq(item.pos, player.pos) > reachSq) continue;
        item.pos = moveToward(item.pos, player.pos, pull);
      }
    }
  }

  for (let i = player.abilities.length - 1; i >= 0; i--) {
    const ability = player.abilities[i] as (typeof player.abilities)[number];
    if (ability.remainingMs > 0) continue;
    player.abilities.splice(i, 1);
    state.events.push({ type: "abilityEnded", defId: ability.defId });
    // The power is done: free its dock slot at last, closing the row up so the
    // rest shift down (and keeping every other running copy's slot link true).
    if (ability.slot !== undefined) removeHeldSlot(state, ability.slot);
  }
}

/**
 * Advance the GRANTED SPELLS worn gear carries (the `spell` affix — see
 * spells.ts and config `SPELL`): the loadout is reconciled first, then the
 * forever orbit sweeps and the forever storm strikes exactly like their
 * pickup twins (stasis acts inside moveEnemy via `stasisFactorAt`). One
 * deliberate difference from the pickups: NO `noMenace` — a granted spell is
 * the hero's permanent build power, so its output heats the menace meter
 * like any weapon blow, where a temporary powerup's is exempted.
 */
function stepItemSpells(state: GameState, dt: number, dtMs: number): void {
  syncItemSpells(state);
  const player = state.player;
  if (player.itemSpells.length === 0) return;

  const power = abilityPowerScale(state);

  for (const spell of player.itemSpells) {
    spell.cooldownMs = Math.max(0, spell.cooldownMs - dtMs);

    if (spell.spell === "orbit") {
      const params = orbitSpellParams(state, spell.rank);
      spell.angle += params.angularSpeed * dt;
      if (spell.cooldownMs <= 0) {
        let struck = false;
        for (const orb of itemSpellOrbPositions(state, player, spell)) {
          let victim: Enemy | undefined;
          for (const enemy of state.enemies) {
            const enemyDefData = enemyDef(enemy.defId);
            if (enemyDefData.apparition) continue;
            const reach = enemyDefData.radius + params.orbRadius;
            if (distanceSq(enemy.pos, orb) <= reach * reach) {
              victim = enemy;
              break;
            }
          }
          if (!victim) continue;
          hitEnemy(state, victim, params.damage * power, "magic");
          struck = true;
        }
        if (struck) spell.cooldownMs = params.hitCooldownMs;
      }
    }

    if (spell.spell === "storm" && spell.cooldownMs <= 0) {
      const params = stormSpellParams(state, spell.rank);
      const victim = nearestEnemy(state.enemies, player.pos, params.range);
      if (victim) {
        spell.cooldownMs = params.intervalMs;
        state.events.push({ type: "lightning", pos: { ...victim.pos } });
        hitEnemy(state, victim, params.damage * power, "magic");
      }
    }
  }
}

/**
 * Resolve the PROCS this tick's weapon blows queued (`proc` affixes — see
 * `queueWeaponProcs` in loot.ts): a BOLT grounds in the triggering victim if
 * it still stands (else the nearest foe to where it fell), a NOVA bursts
 * around the trigger point and bills everything inside the ring. Drained
 * AFTER the attack passes so the extra kills never mutate the enemy list
 * under a sweep in progress — and since only `rollAccuracy` blows queue
 * procs, a proc's own hits can never proc again.
 */
function stepProcs(state: GameState): void {
  if (state.pendingProcs.length === 0) return;
  const queue = state.pendingProcs;
  state.pendingProcs = [];
  const power = abilityPowerScale(state);

  for (const proc of queue) {
    if (proc.spell === "bolt") {
      const target =
        state.enemies.find((e) => e.id === proc.enemyId) ??
        nearestEnemy(state.enemies, proc.pos, SPELL.bolt.range);
      if (!target) continue;
      state.events.push({ type: "lightning", pos: { ...target.pos } });
      hitEnemy(state, target, boltProcDamage(proc.rank) * power, "magic");
      continue;
    }
    // NOVA: snapshot the victims first — hitEnemy splices the slain.
    const params = novaProcParams(proc.rank);
    state.events.push({
      type: "nova",
      pos: { ...proc.pos },
      radius: params.radius,
    });
    const reachSq = params.radius * params.radius;
    const victims = state.enemies.filter(
      (enemy) =>
        !enemyDef(enemy.defId).apparition &&
        distanceSq(enemy.pos, proc.pos) <= reachSq,
    );
    for (const victim of victims) {
      hitEnemy(state, victim, params.damage * power, "magic");
    }
  }
}

/**
 * Burst the MAGIC CRIT BLOBS this tick's magic crits queued (config
 * `MAGIC_CRIT`): each detonates a small arcane splash around the struck foe,
 * billing the nearest few OTHERS (the crit victim already took the blow) for a
 * fraction of it. INTELLIGENCE grows the reach and the target count, both
 * firmly capped — the baseline reward stays small, and screen-shaping AoE is
 * left to unique/legendary item powers. Drained after `stepProcs` so the extra
 * kills never mutate the enemy list under a sweep; the splash hits omit
 * `rollAccuracy`, so a blob never blobs or procs again. Reuses the violet
 * `nova` burst for its visual — a local arcane shockwave.
 */
function stepMagicCritBlobs(state: GameState): void {
  if (state.pendingCritBlobs.length === 0) return;
  const queue = state.pendingCritBlobs;
  state.pendingCritBlobs = [];
  const int = effectiveStat(state, "intelligence");
  const radius = Math.min(
    MAGIC_CRIT.blobRadiusMax,
    MAGIC_CRIT.blobRadius + int * MAGIC_CRIT.blobRadiusPerInt,
  );
  const maxTargets = Math.min(
    MAGIC_CRIT.blobTargetsMax,
    Math.floor(MAGIC_CRIT.blobTargets + int * MAGIC_CRIT.blobTargetsPerInt),
  );
  const reachSq = radius * radius;
  for (const blob of queue) {
    state.events.push({ type: "nova", pos: { ...blob.pos }, radius });
    if (maxTargets <= 0) continue;
    // The nearest OTHER foes to the burst — the crit victim already ate the
    // blow, so it is excluded. Snapshot + sort so the cap is honest even as
    // hitEnemy splices the slain.
    const victims = state.enemies
      .filter(
        (enemy) =>
          enemy.id !== blob.victimId &&
          !enemyDef(enemy.defId).apparition &&
          distanceSq(enemy.pos, blob.pos) <= reachSq,
      )
      .sort((a, b) => distanceSq(a.pos, blob.pos) - distanceSq(b.pos, blob.pos))
      .slice(0, maxTargets);
    const damage = blob.blowDamage * MAGIC_CRIT.blobDamageFrac;
    for (const victim of victims) {
      hitEnemy(state, victim, damage, "magic");
    }
  }
}

// Spatial hash for the projectile↔enemy hit tests, rebuilt on each tick that
// has projectiles in flight and shared by every projectile that tick. Without
// it each projectile scans the whole horde (O(projectiles × enemies) with a
// sqrt and two def lookups per candidate) — the tick's hotspot under a
// shotgun volley at horde scale.
const hitGrid = new Map<number, Enemy[]>();
const HIT_CELL = 32;
// Largest enemy radius seen while building the grid — sets how many
// neighboring cells a query must sweep to be exhaustive.
let hitGridMaxRadius = 0;

function buildHitGrid(state: GameState): void {
  hitGrid.clear();
  hitGridMaxRadius = 0;
  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
    // Apparitions can't be hit — leaving them out makes every query skip-free.
    if (def.apparition) continue;
    if (def.radius > hitGridMaxRadius) hitGridMaxRadius = def.radius;
    // Same collision-free key as the separation grid: positions are clamped
    // to the level, so cell columns stay well under 2¹⁶.
    const key =
      Math.floor(enemy.pos.x / HIT_CELL) * 65536 +
      Math.floor(enemy.pos.y / HIT_CELL);
    const bucket = hitGrid.get(key);
    if (bucket) bucket.push(enemy);
    else hitGrid.set(key, [enemy]);
  }
}

/** The first live enemy within `radius` of `pos` (grid query), skipping ids
 * in `skip` (a piercing shot's already-billed bodies). */
function hitGridFind(
  pos: Vec2,
  radius: number,
  skip: number[] | undefined,
): Enemy | undefined {
  const range = Math.max(1, Math.ceil((hitGridMaxRadius + radius) / HIT_CELL));
  const kx = Math.floor(pos.x / HIT_CELL);
  const ky = Math.floor(pos.y / HIT_CELL);
  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      const bucket = hitGrid.get((kx + dx) * 65536 + (ky + dy));
      if (!bucket) continue;
      for (const enemy of bucket) {
        // Slain earlier this tick: spliced from state.enemies (hitEnemy) but
        // still in the bucket — hp ≤ 0 marks the stale entry.
        if (enemy.hp <= 0) continue;
        const reach = enemyDef(enemy.defId).radius + radius;
        if (distanceSq(enemy.pos, pos) > reach * reach) continue;
        if (skip?.includes(enemy.id)) continue;
        return enemy;
      }
    }
  }
  return undefined;
}

function stepProjectiles(state: GameState, dt: number, dtMs: number): void {
  if (state.projectiles.length === 0) return;
  // Enemies don't move during this step, so one grid serves every projectile.
  buildHitGrid(state);
  const survivors = [];
  for (const projectile of state.projectiles) {
    // A homing shot steers toward the nearest living foe each tick, its turn
    // capped by the def's rate — a smart dart curves onto a strafing target,
    // it doesn't teleport. Foes already pierced through are dead to it.
    if (projectile.homing) {
      steerProjectile(state, projectile, dt);
    }
    const from = { x: projectile.pos.x, y: projectile.pos.y };
    projectile.pos.x += projectile.dir.x * projectile.speed * dt;
    projectile.pos.y += projectile.dir.y * projectile.speed * dt;
    // Shots fired mid-jump sink back to ground level (visual only).
    projectile.z = Math.max(0, projectile.z - PROJECTILE.zFallSpeed * dt);
    projectile.lifetimeMs -= dtMs;

    const outOfBounds =
      projectile.pos.x < 0 ||
      projectile.pos.y < 0 ||
      projectile.pos.x > state.level.width ||
      projectile.pos.y > state.level.height;
    if (projectile.lifetimeMs <= 0 || outOfBounds) continue;

    // Tall obstacles eat shots — swept over the whole tick's travel so a
    // fast bullet can't tunnel through a thin wall between two ticks.
    if (blockedByObstacle(state, from, projectile.pos, projectile.radius)) {
      continue;
    }

    // A HOSTILE shot (an enemy's — see EnemyDef.ranged) never touches the
    // horde: it resolves against the player alone and is spent on contact.
    if (projectile.hostile) {
      if (!resolveHostileHit(state, projectile)) survivors.push(projectile);
      continue;
    }

    const hit = hitGridFind(
      projectile.pos,
      projectile.radius,
      projectile.hitIds,
    );
    if (!hit) {
      survivors.push(projectile);
      continue;
    }
    // A companion's shot never misses (no DEXTERITY to earn accuracy back
    // with — see Projectile.companionId); the hero's rolls as always. Kills
    // by a tagged shot may float the shooter's quote.
    const killsBefore = state.stats.kills;
    hitEnemy(state, hit, projectile.damage, projectile.weaponClass, {
      rollAccuracy: projectile.companionId === undefined,
      critMult: projectile.critMult,
      damageRoll: projectile.damageRoll,
    });
    if (
      projectile.companionId !== undefined &&
      state.stats.kills > killsBefore
    ) {
      const shooter = state.companions.find(
        (c) => c.id === projectile.companionId,
      );
      if (shooter) maybeCompanionQuote(state, shooter);
    }
    // Chain lightning: the first body grounds the bolt, and the current
    // leaps on to the nearest fresh foes in range — each leap softened by
    // `chainDamageFrac` and always connecting (the arc found its own path).
    if (projectile.chain) {
      chainLightning(state, projectile, hit);
    }
    // A piercing round spends one body and keeps flying; anything else is
    // done. The struck foe is remembered (it may survive the blow) so the
    // shot never bills the same body twice while passing through it.
    if (projectile.pierceLeft && projectile.pierceLeft > 0) {
      projectile.pierceLeft--;
      (projectile.hitIds ??= []).push(hit.id);
      survivors.push(projectile);
    }
  }
  state.projectiles = survivors;
}

/** Curve a homing projectile toward the nearest living, un-pierced foe: the
 * heading turns at most `homing` radians/s toward the bearing. */
function steerProjectile(
  state: GameState,
  projectile: Projectile,
  dt: number,
): void {
  let best: Enemy | undefined;
  let bestDistSq = Infinity;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).apparition) continue;
    if (projectile.hitIds?.includes(enemy.id)) continue;
    const dSq = distanceSq(enemy.pos, projectile.pos);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      best = enemy;
    }
  }
  if (!best) return;
  const want = direction(projectile.pos, best.pos);
  const current = Math.atan2(projectile.dir.y, projectile.dir.x);
  const target = Math.atan2(want.y, want.x);
  // Shortest angular route, clamped to this tick's turn budget.
  let delta = target - current;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const maxTurn = (projectile.homing ?? 0) * dt;
  const turned = current + Math.max(-maxTurn, Math.min(maxTurn, delta));
  projectile.dir = { x: Math.cos(turned), y: Math.sin(turned) };
}

/** Leap a struck bolt's current to the nearest fresh foes within
 * `WEAPON.chainRange` of the body it grounded in — up to `chain` of them,
 * each for `chainDamageFrac` of the blow, always connecting. Emits a
 * `lightning` event per leap so the app flashes the arc. */
function chainLightning(
  state: GameState,
  projectile: Projectile,
  hit: Enemy,
): void {
  const leaps = projectile.chain ?? 0;
  const rangeSq = WEAPON.chainRange * WEAPON.chainRange;
  const targets = state.enemies
    .filter(
      (enemy) =>
        enemy !== hit &&
        !enemyDef(enemy.defId).apparition &&
        !projectile.hitIds?.includes(enemy.id) &&
        distanceSq(enemy.pos, hit.pos) <= rangeSq,
    )
    .sort((a, b) => distanceSq(a.pos, hit.pos) - distanceSq(b.pos, hit.pos))
    .slice(0, leaps);
  for (const target of targets) {
    state.events.push({ type: "lightning", pos: { ...target.pos } });
    hitEnemy(
      state,
      target,
      projectile.damage * WEAPON.chainDamageFrac,
      projectile.weaponClass,
      { critMult: projectile.critMult, damageRoll: projectile.damageRoll },
    );
  }
}

function stepEnemies(state: GameState, dt: number, dtMs: number): void {
  const player = state.player;

  for (const enemy of state.enemies) {
    enemy.contactCooldownMs = Math.max(0, enemy.contactCooldownMs - dtMs);
    if (enemy.critFlashMs) {
      enemy.critFlashMs = Math.max(0, enemy.critFlashMs - dtMs);
    }
    if (enemy.vanishMs !== undefined) {
      enemy.vanishMs = Math.max(0, enemy.vanishMs - dtMs);
    }
    moveEnemy(state, enemy, dt);
  }

  // Apparitions whose linger ran out dissolve off the board.
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i] as Enemy;
    if (enemy.vanishMs === undefined || enemy.vanishMs > 0) continue;
    state.enemies.splice(i, 1);
    state.events.push({
      type: "apparitionVanished",
      pos: { ...enemy.pos },
      defId: enemy.defId,
    });
  }

  separateEnemies(state);

  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
    // Grounded monsters never clear an obstacle — even the jumpable ones.
    // Ghostly monsters drift straight through instead.
    if (!def.phasing) resolveObstacles(state, enemy.pos, def.radius);
    // The merchant's ward shoos the horde off his stall (ghosts included —
    // the ward is not a wall). Bosses are too massive, apparitions too
    // immaterial; everything else keeps its distance.
    if (def.role !== "boss" && !def.apparition) {
      repelFromMerchant(state, enemy.pos);
    }
    enemy.pos.x = clamp(
      enemy.pos.x,
      def.radius,
      state.level.width - def.radius,
    );
    enemy.pos.y = clamp(
      enemy.pos.y,
      def.radius,
      state.level.height - def.radius,
    );

    // Speakers with an unplayed scene stop the world once they're visibly
    // close: elites at the end of their rush, bosses at the stare-down.
    if (def.role !== "minion" && wantsDialogue(state, enemy)) {
      startEnemyDialogue(state, enemy);
    }

    // An apparition's touch is cold air — no contact damage, ever.
    if (def.apparition) continue;

    // Monsters drift along the ground — a player at the top of a moon jump
    // sails clean over their grasp. The reach is pulled in a little under the
    // bodies' touching distance (contactReachMult), so a foe must press into
    // the hero to bite — a last-instant sidestep is a clean escape, not a graze.
    const touchReach = (def.radius + PLAYER.radius) * PLAYER.contactReachMult;
    const touching =
      player.z <= JUMP.dodgeHeight &&
      distanceSq(enemy.pos, player.pos) <= touchReach * touchReach;
    if (touching && enemy.contactCooldownMs <= 0) {
      // The swing is spent whether it lands or is dodged, so the same foe
      // can't re-swing next frame after a sidestep.
      enemy.contactCooldownMs = def.contactCooldownMs;
      // Pre-combat grace while the weapon is holstered: no blow lands. The
      // blade is drawn by the scripted vanguard's PROXIMITY, not its touch (see
      // stepOpeningStrike, run each tick above), so every contact in this window
      // is a harmless bump — including the vanguard's own, until it has closed
      // in and armed the hero.
      if (player.disarmed) {
        continue;
      }
      // A nimble hero sidesteps the blow entirely: no HP, no armor, no hit.
      // DEXTERITY drives it, LUCK nudges it (see `playerDodgeChance`).
      if (state.rng() < playerDodgeChance(state)) {
        state.events.push({ type: "playerDodge", pos: { ...player.pos } });
        continue;
      }
      const crit = state.rng() < enemyCritChance(state, def.critChance);
      // A boss backed into its last stand hits like a cornered animal.
      const lastStand =
        def.role === "boss" && enemy.hp <= enemy.maxHp * LAST_STAND.hpFraction;
      // A power-matched elite/boss hits harder too (contactMult, softened —
      // set once when it engaged; 1 for un-scaled mobs and every minion).
      // Its set-piece mechanics stack on top: the charge's impact while
      // dashing, the enrage's fury once turned (mechDamageMult).
      const damage = Math.round(
        def.contactDamage *
          (enemy.contactMult ?? 1) *
          mechDamageMult(enemy, def) *
          (crit ? STATS.critMultiplier : 1) *
          (lastStand ? LAST_STAND.damageMultiplier : 1) *
          BALANCE.mobDamage,
      );
      // Worn armor turns its share of the physical blow — the D2 curve
      // against THIS attacker's level (see armorReduction) — and the hit
      // wears every worn piece a point, whether or not it turned much.
      const hpDamage = Math.max(
        0,
        Math.round(damage * (1 - armorReduction(state, enemy.mlvl))),
      );
      wearWornArmor(state);
      player.hp -= hpDamage;
      player.hurtFlashMs = 250;
      state.stats.damageTaken += damage;
      state.events.push({ type: "playerHurt", crit });
      // The landed blow may cast back — the D2 "when struck" procs.
      queueStruckProcs(state, enemy);
    }
  }
}

// Spatial hash reused across steps: at horde scale (hundreds alive) the old
// all-pairs separation is the tick's hotspot, and reusing the map keeps
// per-tick allocation down to the bucket arrays.
const separationGrid = new Map<number, Enemy[]>();

/**
 * Push overlapping monsters apart so packs spread instead of collapsing
 * into a single stacked blob. Neighbors are found through a uniform grid
 * (cell = separation distance): any pair closer than one cell shares a
 * cell or sits in adjacent ones, so only those pairs are tested.
 */
function separateEnemies(state: GameState): void {
  // Packs may overlap a bit (ENEMY_AI.overlapFraction) so a kited horde
  // bunches into one clump instead of a rigid crystal.
  const cell = ENEMY_AI.separation * (1 - ENEMY_AI.overlapFraction);
  // Level width caps near a few thousand px, so cell columns stay < 2¹⁶
  // and this key never collides.
  const keyOf = (x: number, y: number) =>
    Math.floor(x / cell) * 65536 + Math.floor(y / cell);

  separationGrid.clear();
  for (const enemy of state.enemies) {
    const key = keyOf(enemy.pos.x, enemy.pos.y);
    const bucket = separationGrid.get(key);
    if (bucket) bucket.push(enemy);
    else separationGrid.set(key, [enemy]);
  }

  for (const a of state.enemies) {
    const kx = Math.floor(a.pos.x / cell);
    const ky = Math.floor(a.pos.y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = separationGrid.get((kx + dx) * 65536 + (ky + dy));
        if (!bucket) continue;
        for (const b of bucket) {
          if (b.id <= a.id) continue; // handle each pair once
          const dx = b.pos.x - a.pos.x;
          const dy = b.pos.y - a.pos.y;
          const dSq = dx * dx + dy * dy;
          if (dSq >= cell * cell || dSq === 0) continue;
          const d = Math.sqrt(dSq);
          // Push strength divided by d folds the direction normalization in.
          const push = (cell - d) / 2 / d;
          a.pos.x -= dx * push;
          a.pos.y -= dy * push;
          b.pos.x += dx * push;
          b.pos.y += dy * push;
        }
      }
    }
  }
}

/**
 * Enemy AI: haunt the spawn point, chase when the player wanders close,
 * drift home when they escape. Waking on proximity needs line of sight —
 * a wall the player can't jump over also hides them (ghostly monsters
 * sense straight through; wounds wake anything). Bosses guard their post
 * instead — they wake when the player nears it (or once wounded) but never
 * stray past their leash. Elites sleep at their post until the player comes
 * close (or hurts them), then rush into view for their scene and hunt
 * forever after.
 */
function moveEnemy(state: GameState, enemy: Enemy, dt: number): void {
  const player = state.player;
  const def = enemyDef(enemy.defId);
  // Set-piece mechanics first (mechanics.ts): a mob rooted in a telegraph
  // windup or riding a charge dash is owned by the mechanic this tick.
  if (stepEnemyMechanics(state, enemy, dt, dt * 1000)) return;
  // Stasis fields slow whatever crawls inside them — bosses included. An
  // enraged set piece runs hot (mechSpeedMult).
  const speed =
    enemy.speed * stasisFactorAt(state, enemy.pos) * mechSpeedMult(enemy, def);
  const senses = () =>
    def.phasing === true || lineOfSight(state, enemy.pos, player.pos);

  if (def.role === "boss") {
    const awake =
      enemy.hp < enemy.maxHp ||
      ((distance(player.pos, enemy.home) < def.ai.aggroRadius ||
        distance(player.pos, enemy.pos) < def.ai.aggroRadius) &&
        senses());
    // The stare-down is the fight starting: match the player's power now, so
    // the boss is worthy whether the player opens with a shot or a charge.
    if (awake) maybePowerScale(state, enemy);
    // A SHOOTER boss (the zAI controllers) fights at range once woken: hold
    // distance, peek for the shot, hide behind the rocks between shots. Its
    // cover dance replaces the leash — cover-seeking keeps it near its post.
    // An unplayed speaker still closes in first (the stare-down needs the
    // speak radius), exactly like an elite's rush.
    const speechPending = !enemy.spoke && (def.dialogue?.length ?? 0) > 0;
    if (awake && def.ranged && !speechPending) {
      moveRangedEnemy(state, enemy, speed, dt);
      return;
    }
    const leashed =
      def.ai.leashRadius !== undefined &&
      distance(enemy.pos, enemy.home) > def.ai.leashRadius;
    const target = awake && !leashed ? player.pos : enemy.home;
    enemy.pos = moveToward(enemy.pos, target, speed * dt);
    return;
  }

  if (def.role === "elite") {
    // An apparition that has had its scene walks off into the noise and
    // dissolves — the vanish countdown arms here, on the first playing tick
    // after the dialogue closed, and stepEnemies removes it at zero.
    if (def.apparition && enemy.spoke) {
      enemy.vanishMs ??= APPARITION.lingerMs;
      const away = direction(player.pos, enemy.pos);
      enemy.pos.x += away.x * speed * dt;
      enemy.pos.y += away.y * speed * dt;
      return;
    }
    if (!enemy.awake) {
      enemy.awake =
        enemy.hp < enemy.maxHp ||
        (distance(player.pos, enemy.pos) < def.ai.aggroRadius && senses());
      if (!enemy.awake) return;
      // Just woke: power-match the player before the ambush rush lands —
      // unless it is an apparition, which never fights anything.
      if (!def.apparition) maybePowerScale(state, enemy);
    }
    // The rush: an unplayed speaker closes in far faster than it fights,
    // so the scene starts seconds after the ambush springs. Once it has
    // spoken (or never had lines) it settles into its fighting speed.
    const rushing = !enemy.spoke && (def.dialogue?.length ?? 0) > 0;
    // A SHOOTER that has said its piece fights at range instead of charging:
    // hold distance, peek for the shot, and (takesCover) hide behind the
    // rocks between shots — see moveRangedEnemy in ranged.ts.
    if (!rushing && def.ranged) {
      moveRangedEnemy(state, enemy, speed, dt);
      return;
    }
    const rushSpeed =
      (def.ai.rushSpeed ?? def.speed) * stasisFactorAt(state, enemy.pos);
    enemy.pos = moveToward(
      enemy.pos,
      player.pos,
      (rushing ? rushSpeed : speed) * dt,
    );
    return;
  }

  // The scripted vanguard (openingStrike): it HOLDS at its post until the
  // opening survey beat has played, then breaks from the pack and sprints the
  // still-holstered hero down, STOPPING the instant it's next to him — its
  // harmless swing is what draws the blade (story.ts). Holding until the beat
  // means the scene always reads in order: the "look at this place" monologue
  // first, THEN the lone scientist rushing in and striking — never a rusher
  // that beats the hero's first read to him and sits glued while the gate is
  // shut. Parking at contact (instead of charging on) means it can't clip
  // through the hero and shove him around while it waits to strike. Once the
  // blade is out (`!disarmed`) it drops the sprint and falls through to the
  // normal minion chase at its plain `speed`, a lab scientist the armed hero
  // cuts down.
  if (enemy.vanguard && player.disarmed) {
    const opening = levelDef(state.level.id).openingStrike;
    // Hold at the post while the strike's ordering gate is still shut — the
    // rush waits on the hero's opening read, so he isn't rushed before he has
    // even looked around.
    if (opening?.after && !state.thoughtsSeen.includes(opening.after)) {
      return;
    }
    const rushSpeed =
      (def.ai.rushSpeed ?? def.speed) * stasisFactorAt(state, enemy.pos);
    // Close to the same tightened contact distance the damage test uses, so a
    // rusher settles exactly where it can actually bite (not a hair short of it).
    const gap =
      distance(enemy.pos, player.pos) -
      (def.radius + PLAYER.radius) * PLAYER.contactReachMult;
    if (gap > 0) {
      enemy.pos = moveToward(
        enemy.pos,
        player.pos,
        Math.min(rushSpeed * dt, gap),
      );
    }
    return;
  }

  // Minions: an aggro latch. Waking needs the player in range AND in sight;
  // once awake the chase holds even when a wall breaks line of sight — only
  // escaping the radius entirely puts the monster back to sleep.
  const inRange =
    distanceSq(player.pos, enemy.pos) < def.ai.aggroRadius * def.ai.aggroRadius;
  if (!inRange) {
    enemy.awake = false;
  } else if (!enemy.awake) {
    enemy.awake = enemy.hp < enemy.maxHp || senses();
  }

  if (inRange && enemy.awake) {
    enemy.pos = moveToward(enemy.pos, flankTarget(state, enemy), speed * dt);
  } else if (distanceSq(enemy.pos, enemy.home) > 16) {
    enemy.pos = moveToward(
      enemy.pos,
      enemy.home,
      speed * (def.ai.returnSpeedFactor ?? 0.5) * dt,
    );
  }
}

/**
 * Where a chasing minion actually steers: the player, or — from
 * `ENEMY_AI.flankFromIndex` up the difficulty ladder — a point rotated off
 * the direct bearing by up to `flankAngleDeg`, each mob to its own
 * deterministic side (its id's parity), the angle easing out as it closes so
 * the pack fans into an envelope at range and still converges for the bite.
 * The gentle rungs keep the honest straight-line conga.
 */
function flankTarget(state: GameState, enemy: Enemy): Vec2 {
  const player = state.player;
  if (difficultyDef(state.difficulty).index < ENEMY_AI.flankFromIndex) {
    return player.pos;
  }
  const dx = enemy.pos.x - player.pos.x;
  const dy = enemy.pos.y - player.pos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 24) return player.pos; // at the bite — go straight in
  // Ease the rotation off as the mob closes (full at ~3 screens, none at
  // contact), and alternate sides by id parity so the pack splits pincer-like.
  const ease = Math.min(1, dist / 360);
  const side = enemy.id % 2 === 0 ? 1 : -1;
  const angle = ((ENEMY_AI.flankAngleDeg * Math.PI) / 180) * ease * side;
  // Rotate the player-to-enemy bearing and aim at the point the same
  // distance out along it — walking that ray closes distance while drifting
  // around the flank.
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: player.pos.x + (dx * cos - dy * sin) * 0.5,
    y: player.pos.y + (dx * sin + dy * cos) * 0.5,
  };
}

function stepItems(state: GameState, dtMs: number): void {
  const player = state.player;
  // Pieces displaced by an auto-equip with a full bag fall back to the
  // ground — collected here so the filter pass isn't mutated mid-flight.
  const displaced: Item[] = [];
  const pickupReach = MEDKIT.radius + PLAYER.radius;
  const pickupReachSq = pickupReach * pickupReach;
  state.items = state.items.filter((item) => {
    // A mercy drop still riding its angel down is airborne: count off the
    // delivery, and until it lands it can't be picked up (the magnet leaves it
    // alone too — see stepAbilities). The renderer draws the descent off the
    // same timer; here it only gates the grab.
    if (item.deliverMs !== undefined && item.deliverMs > 0) {
      item.deliverMs = Math.max(0, item.deliverMs - dtMs);
      return true;
    }
    const overlapping = distanceSq(item.pos, player.pos) <= pickupReachSq;
    if (!overlapping) return true;

    if (item.kind === "medkit") {
      // D2-style tiered kits stack into the consumable dock, one stack per
      // quality (config MEDKIT.tiers); the hero spends them on his own call
      // (consumeMedkit), best-quality first. A stack already at its cap turns
      // the kit away — it stays on the ground. Untiered items (minted before
      // tiers shipped) read as the lightest kit.
      const tierIndex = medkitTierIndex(item.tier);
      if (!bankMedkit(state, tierIndex)) return true;
      state.stats.itemsCollected++;
      state.events.push({
        type: "itemCollected",
        kind: "medkit",
        name: (MEDKIT.tiers[tierIndex] ?? MEDKIT.tiers[0]).name,
      });
      return false;
    }

    // The golden arrow: a CATCH-UP faucet. While the hero is still under the
    // level a normal run of this map/difficulty leaves him at, it pays a share
    // of the current level's XP bar — tapering with level (arrowXpShareAt), a
    // full quarter-level early down to a sliver — so arrows carry the
    // onboarding and speed an under-levelled hero up to where the content
    // belongs. ONCE he hits that cap the arrow goes COLD (arrowColdXp: a flat
    // few mob kills), so replaying old maps can't arrow-boost him past their
    // tier. A rung with no cap entry never goes cold.
    if (item.kind === "xp") {
      state.stats.itemsCollected++;
      const cap = levelDef(state.level.id).loot.arrowCapByDifficulty?.[
        state.difficulty
      ];
      // Resolve the award once so the same figure both banks XP and floats up
      // off the hero's head as blue "+N XP" combat text.
      const xpGain =
        cap !== undefined && player.level >= cap
          ? arrowColdXp(player.level)
          : Math.max(
              1,
              Math.round(player.xpToNext * arrowXpShareAt(player.level)),
            );
      state.events.push({
        type: "itemCollected",
        kind: "xp",
        name: "GOLDEN ARROW",
        xp: xpGain,
      });
      grantXp(state, xpGain);
      return false;
    }

    // Repair kits mend the equipped weapon and every worn armor piece —
    // waking any broken piece back up. With nothing short they stay on the
    // ground for when something has actually taken a beating.
    if (item.kind === "repair") {
      const mended = repairEquippedWeapon(state);
      const rearmored = repairWornArmor(state);
      if (!mended && !rearmored) return true;
      state.stats.itemsCollected++;
      state.events.push({
        type: "itemCollected",
        kind: "repair",
        name: "REPAIR KIT",
      });
      return false;
    }

    // Energy drinks (stamina potions) stack into the consumable dock and are
    // spent on the player's call (consumeStaminaPotion) to refill the sprint
    // pool. A full stack turns the drink away — it stays on the ground.
    if (item.kind === "drink") {
      if (!bankStaminaPotion(state)) return true;
      state.stats.itemsCollected++;
      state.events.push({
        type: "itemCollected",
        kind: "drink",
        name: "STAMINA POTION",
      });
      return false;
    }

    // Story items are plot, not gear: banked in state.storyItems (never
    // the bag) and their lore plays as a dialogue on the spot.
    if (item.kind === "story") {
      collectStoryItem(state, item.defId, item.pos);
      return false;
    }

    // Ability pickups are banked for the `useItem` input (never the bag);
    // at the carry cap — or a second `uniqueHeld` power like the NUKE while
    // one is already docked — they stay on the ground like an overflowing drop.
    if (item.kind === "ability") {
      if (!canBankAbility(state, item.defId)) return true;
      state.player.heldAbilities.push(item.defId);
      state.stats.itemsCollected++;
      state.events.push({
        type: "itemCollected",
        kind: "ability",
        name: abilityDef(item.defId).name,
      });
      return false;
    }

    // Equipment better than what's worn is equipped on the spot; the old
    // piece heads for the bag, or the ground when the bag is full. Lesser
    // finds go into the bag, staying grounded when it's full. When the player
    // has turned auto-equip off (a setting), even a genuine upgrade banks to
    // the bag instead — the card still flags it so they can equip it by hand.
    if (isAutoEquipEnabled() && isBetterEquipment(state, item.equipment)) {
      const slot = item.equipment.slot;
      const previous =
        slot === "weapon" ? player.equipment.weapon : player.equipment[slot];
      if (slot === "weapon") {
        player.equipment.weapon = item.equipment;
        player.weaponCooldownMs = 0;
      } else {
        player.equipment[slot] = item.equipment;
      }
      recomputeMaxHp(state);
      recomputeMaxStamina(state);
      // A +STRENGTH piece can widen the bag, so grow it to match (mirrors
      // `equipFromInventory`).
      syncInventoryCapacity(state);
      if (previous && !addToInventory(state, previous)) {
        displaced.push({
          id: state.nextId++,
          kind: "equipment",
          pos: { ...player.pos },
          equipment: previous,
        });
      }
      state.stats.itemsCollected++;
      state.events.push({
        type: "itemCollected",
        kind: "equipment",
        tier: item.equipment.tier,
        quality: item.equipment.quality,
        name: equipmentName(item.equipment),
        defId: item.equipment.defId,
        itemId: item.equipment.id,
        uniqueId: item.equipment.uniqueId,
        // Worn on the spot — the auto-equip path only ever fires on a genuine
        // upgrade, so the card badges it EQUIPPED, not tap-to-equip.
        equipped: true,
        upgrade: true,
      });
      state.events.push({ type: "autoEquipped", defId: item.equipment.defId });
      return false;
    }
    // A bagged find might still out-score the worn piece (a passive charm the
    // auto-equip rule leaves alone) — probe before it lands so the card can
    // flag it as an upgrade to tap.
    const bagUpgrade = wouldUpgradeSlot(state, item.equipment);
    if (!addToInventory(state, item.equipment)) {
      // Bag full: the piece stays grounded. Nudge the player to make room —
      // a thought over the hero and a pulse on the bag button — throttled so
      // standing on the loot doesn't fire it every tick.
      if (state.bagFullHintCooldownMs <= 0) {
        state.bagFullHintCooldownMs = LOOT.bagFullHintCooldownMs;
        state.events.push({
          type: "pickupBlocked",
          reason: "bagFull",
          pos: { ...player.pos },
        });
      }
      return true;
    }
    state.stats.itemsCollected++;
    state.events.push({
      type: "itemCollected",
      kind: "equipment",
      tier: item.equipment.tier,
      quality: item.equipment.quality,
      name: equipmentName(item.equipment),
      defId: item.equipment.defId,
      itemId: item.equipment.id,
      uniqueId: item.equipment.uniqueId,
      equipped: false,
      upgrade: bagUpgrade,
    });
    return false;
  });
  if (displaced.length > 0) state.items.push(...displaced);
}
