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
  NUKE,
  PACKS,
  PLAYER,
  PROJECTILE,
  RUN,
  SPAWNERS,
  SPELL,
  STAMINA,
  STATS,
  TEMPO,
  WEAPON,
  ZONES,
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
import { stepAutopilot } from "./autopilot.ts";
import {
  stepAsteroids,
  stepCraters,
  stepHayBalls,
  stepKnockback,
  stepSandstorms,
  stepStampedes,
  stepWells,
} from "./hazards.ts";
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
  absorbPlayerDamage,
  bankConsumable,
  bankMedkit,
  consumableName,
  consumeManaPotion,
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
  consumeRepairKit,
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
import { enqueueSpell, stepRegen, stepSpellQueue } from "./sorcery.ts";
import { arrowColdXp, arrowXpShareAt } from "./leveling.ts";
import {
  grantXp,
  hitEnemy,
  packsCleared,
  queueStruckProcs,
  unspawnedMinions,
} from "./loot.ts";
import {
  cratesInCone,
  crateHitByCircle,
  damageCrate,
  nearestCrate,
} from "./crates.ts";
import { revealAround } from "./map.ts";
import {
  mechDamageMult,
  mechSpeedMult,
  stepEnemyMechanics,
} from "./mechanics.ts";
import { repelFromMerchant, stepMerchant } from "./merchant.ts";
import { advancePath } from "./path.ts";
import { raiseAlarm, stepSpawners } from "./spawners.ts";
import { stepPatrol, strollAtWork } from "./working.ts";
import { anyZoneContains, repelFromZones } from "./zones.ts";
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
  resolveMobScaling,
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
  // Cool down the recurring "these enemies are pathetic" cap-farm mutter so it
  // recurs every so often on an out-levelled map, not on every kill (see
  // maybeCapThought).
  if (state.capThoughtMs > 0) {
    state.capThoughtMs = Math.max(0, state.capThoughtMs - dtMs);
  }
  // The victory quake burns down alongside the countdown that armed it (the
  // renderer jitters the camera off this — see GameState.quakeMs).
  if (state.quakeMs > 0) {
    state.quakeMs = Math.max(0, state.quakeMs - dtMs);
  }
  // The AUTO PILOT meter bills on game time — only while `playing`, so paused
  // phases, dialogues and the shop never drain the purse (see autopilot.ts).
  stepAutopilot(state, dtMs);

  // Snapshot cumulative output so the menace tick can read this step's damage
  // and kills as rates (see tickMenace) — the meter heats from what the HERO is
  // actually putting out, not from any single blow. The menace-exempt counters
  // are snapshotted alongside so non-hero output is subtracted out: neither a
  // screen-nuke/damage powerup nor a COMPANION's attacks escalate the horde.
  const damageBefore = state.stats.damageDealt;
  const killsBefore = state.stats.kills;
  const exemptDamageBefore = state.menaceExemptDamage;
  const exemptKillsBefore = state.menaceExemptKills;

  stepPlayer(state, input, dt, dtMs);
  // Mark off the intended-path waypoints the hero just reached, so the autopilot
  // and the guidance arrow both target the next leg (harmless with no path).
  advancePath(state);
  // Playing lifts the fog of war as a CIRCLE sweeping the hero's path
  // (Warcraft-style, no re-fogging): a `MAP.revealRadius` disc around him is
  // uncovered every tick, so the map (and minimap) show exactly where he has
  // walked, not the whole camera view. Everything uncovered reads fully clear
  // in the main view; only the exploration frontier stipples (see render.ts /
  // MAP.fogBand).
  revealAround(state, state.player.pos);
  // The wandering merchant strolls (and may be MET) on this tick's player
  // position — right after the hero moves, so the meeting judges what the
  // player actually sees. A scenario FREEZE (state.freeze — the developer
  // pose switch) holds the world's actors entirely: the merchant stops
  // wandering (and can't be discovered mid-pose), the horde neither moves,
  // strikes, nor fires — while the hero stays fully playable.
  if (!state.freeze) stepMerchant(state, dt, dtMs);
  // A KNOCKED-OUT hero (a sand storm downed him) can take no action: no
  // spending a held power, no potions/kits, no casting. His pools still regen
  // and his already-running powers still tick below — only the player-DRIVEN
  // passes sit out. `stepPlayer` (above) has already frozen his movement and
  // ticked the timer; the flag it reads is the same `knockoutMs`.
  const incapacitated = state.player.knockoutMs > 0;
  if (!incapacitated) {
    stepUseItem(state, input);
    stepUseConsumables(state, input);
    // A spell-bar press ENQUEUES its slot; the queue then drains one cast per
    // global cooldown while mana lasts (mana/cooldown/unlock gated in
    // sorcery.ts), so a press casts ONCE and a chain of presses fires in order
    // — never a spell held "on" until the pool empties.
    if (input.castSpell) enqueueSpell(state, input.castSpellIndex ?? 0);
    stepSpellQueue(state);
  }
  // SPIRIT-driven mana/health regen, the shield timer, and spell cooldowns all
  // tick here — every playing frame, before the combat passes read the pools.
  stepRegen(state, dt, dtMs);
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
  if (!state.freeze) stepCompanions(state, input, dt, dtMs);
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
  stepWells(state, dt);
  stepAsteroids(state, dt, dtMs);
  stepHayBalls(state, dt, dtMs);
  stepSandstorms(state, dt, dtMs);
  stepStampedes(state, dt, dtMs);
  // Meteor-blast knockback settles after the hazards fire, so an impulse armed
  // by an impact this tick lands its first shove the same frame; a flung mob's
  // AI (moveEnemy) sat the fling out. Crater scars age down alongside.
  stepKnockback(state, dt, dtMs);
  stepCraters(state, dtMs);
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
  // The farm-proof survival clock. The wall clock (stats.timeMs, ticked at the
  // top) still runs every frame for the sub-systems; this one only advances
  // while a fight is LIVE — a foe on the field, or within the post-kill grace
  // tail (refreshed on every kill in killEnemy). A cleared field bleeds the
  // tail down and then stops the clock, so survival time can't be milked by
  // loitering. It is what the high-score board banks.
  if (state.combatGraceMs > 0) {
    state.combatGraceMs = Math.max(0, state.combatGraceMs - dtMs);
  }
  if (state.enemies.length > 0 || state.combatGraceMs > 0) {
    state.stats.combatMs += dtMs;
  }
  // The run's high-water menace, banked for the score board (read after this
  // tick's tickMenace has settled the meter).
  const stage = menaceStage(state);
  if (stage > state.stats.peakMenace) state.stats.peakMenace = stage;
  stepPacks(state);
  // The camera rect sizes the approach circle and the off-screen summon distance
  // so mobs run into view instead of popping on screen; headless callers have no
  // view and fall back to the phone baseline (see summonGeometry).
  stepSpawners(state, input.view);
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
  // the loot. Once the player has chosen to STAY (the win already banked),
  // the countdown never re-arms — the still-cleared objective must not yank
  // the victory menu back up; the boss-corpse tap re-opens it instead.
  if (
    !state.staying &&
    state.victoryCountdownMs === null &&
    objectiveCleared(state)
  ) {
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

  // NUKE AFTERMATH (config NUKE, set by detonateNuke): hold EVERY refill —
  // floor, walk-credit, timed stream, trickle — while the post-blast calm
  // runs, so the screen a screen-nuke just cleared stays clear long enough to
  // break away instead of the ring repopulating on the spot. The wave budget
  // is only deferred, never canceled (the window math is monotone), so the
  // held flood resumes intact once the calm burns down.
  state.nukeCalmMs = Math.max(0, state.nukeCalmMs - dtMs);
  if (state.nukeCalmMs > 0) {
    // Fleeing during the calm still banks walk-credit (stepPlayer), but the
    // cap below is never reached while we bail out here — so a multi-second
    // run would bank an UNBOUNDED pile that dumps straight to maxAlive the
    // instant the calm ends, slamming the screen fuller than the bomb left it
    // ("they respawn more than I killed"). Clamp it to the same ceiling a
    // normal flee banks, so refills resume at the ordinary walk rate.
    state.moveSpawnCredit = Math.min(
      state.moveSpawnCredit,
      waves.moveSpawnEvery * 8,
    );
    return;
  }
  // The calm has burned off: now the RECOVERY window runs (config NUKE), easing
  // the near-floor back 0→1 to full so the swarm walks back in at the normal
  // rate instead of the whole floor snapping onto the player in one frame.
  state.nukeRecoverMs = Math.max(0, state.nukeRecoverMs - dtMs);
  const nukeRecover =
    NUKE.recoverMs > 0 ? 1 - state.nukeRecoverMs / NUKE.recoverMs : 1;

  // Difficulty scales the horde: every budget line grows by the mob
  // multiplier, and the live cap/floor stretch so the bigger budget can
  // actually crowd the field instead of queueing behind medium's cap. Menace
  // stacks on top — a rampaging player lures a denser, bigger crowd (lureMult
  // ≥ 1), so the floor and cap both swell with the escalation.
  // The level's TEMPO curve scales the whole pressure envelope over the run —
  // a lull dips both cap and floor, a surge lifts them (LevelDef.tempo). Flat 1
  // when the level authors no curve.
  const tempo = tempoIntensity(state);
  const aliveMult =
    difficultyDef(state.difficulty).aliveMult *
    lureMult(state) *
    BALANCE.hordeSize *
    tempo;
  const maxAlive = Math.round(waves.maxAlive * aliveMult);
  // The floor starves as the player camps: a parked hero watches his
  // surroundings drain instead of farming an endless refill. The post-nuke
  // recovery ramp tapers it the same way for a few seconds after the calm, so
  // the cleared screen refills gradually rather than all at once.
  const minAlive = Math.round(
    waves.minAlive * aliveMult * (1 - starvation) * nukeRecover,
  );

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
 * Is `pos` inside a design zone that forbids procedural spawns — a safe zone
 * (kept clear, and the horde repelled out) or a quiet zone (a dead area with no
 * ambient horde)? The shared exclusion the wave spawner and pack scatter both
 * honor (see zones.ts). Authored set pieces and packs pinned by `at` ignore it.
 */
function insideNoSpawnZone(state: GameState, pos: Vec2): boolean {
  const def = levelDef(state.level.id);
  return (
    anyZoneContains(def.safeZones, pos) || anyZoneContains(def.quietZones, pos)
  );
}

/**
 * The current wave-pressure multiplier from the level's `tempo` curve
 * (LevelDef.tempo): the piecewise-linear intensity at the run's progress
 * through `waves.rampDurationMs`, clamped to config TEMPO. A level with no
 * tempo curve stays at baseline 1 — today's flat behavior — so this is neutral
 * everywhere it is read.
 */
function tempoIntensity(state: GameState): number {
  const def = levelDef(state.level.id);
  const tempo = def.tempo;
  if (!tempo || tempo.length === 0) return 1;
  const dur = def.waves?.rampDurationMs ?? 1;
  const p = clamp(state.stats.timeMs / Math.max(1, dur), 0, 1);
  let value = (tempo[0] as (typeof tempo)[number]).intensity;
  for (let i = 0; i < tempo.length; i++) {
    const cur = tempo[i] as (typeof tempo)[number];
    if (p <= cur.at) {
      if (i === 0) {
        value = cur.intensity;
        break;
      }
      const prev = tempo[i - 1] as (typeof tempo)[number];
      const span = Math.max(1e-6, cur.at - prev.at);
      const f = (p - prev.at) / span;
      value = prev.intensity + (cur.intensity - prev.intensity) * f;
      break;
    }
    value = cur.intensity; // past the last authored point → hold its level
  }
  return clamp(value, TEMPO.min, TEMPO.max);
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
    // Never stream the horde into a safe or quiet region (see zones.ts).
    if (insideNoSpawnZone(state, pos)) continue;
    // Stamp the current menace stage: a mob spawned into a rampage evolves —
    // more hp (a challenge knob; kill xp is level-based, and evolved drops roll
    // WORSE, see menace.ts / spawnEnemy), hitting as hard as the difficulty's
    // menaceEffectMult says. The base hp is the
    // horde's RELATIVE level: the player's live level plus the difficulty's
    // offset (mobLevelScale), so the swarm keeps its distance as he grows.
    // Hard-coded level (the level default) sets hp + mlvl; else player-relative.
    // The menace evolution stage still stacks its extra hp on top.
    const wsc = resolveMobScaling(
      levelDef(state.level.id).mobLevels,
      state.difficulty,
      state.player.level,
      state.rng,
      mobLevelScale(state),
      currentMobLevel(state),
    );
    state.enemies.push(
      spawnEnemy(
        defId,
        pos,
        state.rng,
        state.nextId++,
        wsc.hpMult,
        menaceStage(state),
        difficultyDef(state.difficulty).menaceEffectMult,
        wsc.mlvl,
        wsc.banded,
      ),
    );
    // Book the spawn for the menace CLEARANCE gate (minions only — the horde
    // whose ebb and flow the gate weighs against the hero's kill rate).
    if (def.role === "minion") state.pendingMinionSpawns++;
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
      const psc = resolveMobScaling(
        levelDef(state.level.id).mobLevels,
        state.difficulty,
        state.player.level,
        state.rng,
        mobLevelScale(state),
        currentMobLevel(state),
      );
      const enemy = spawnEnemy(
        member.enemy,
        packMemberPos(state, pack, radius),
        state.rng,
        state.nextId++,
        psc.hpMult,
        menaceStage(state),
        difficultyDef(state.difficulty).menaceEffectMult,
        psc.mlvl,
        psc.banded,
      );
      state.enemies.push(enemy);
      pack.memberIds.push(enemy.id);
      // A woken pack member counts toward the clearance gate like a wave spawn.
      if (enemyDef(member.enemy).role === "minion") state.pendingMinionSpawns++;
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
    if (!insideObstacle(state, pos, radius) && !insideNoSpawnZone(state, pos))
      return pos;
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

  // KNOCKED OUT (a sand storm caught him): the hero lies prone and HELPLESS on
  // the floor. Hold him flat and still, tick the timer, and bail before any
  // input is read — no move, jump, or velocity — so every downstream pass
  // (weapon, spells, items, all gated on `knockoutMs`) sits out too. He is
  // still fully open to the horde while he's down. He gets up the instant the
  // timer lapses, emitting the "up you get" cue.
  if (player.knockoutMs > 0) {
    player.vel.x = 0;
    player.vel.y = 0;
    player.z = 0;
    player.vz = 0;
    player.knockoutMs = Math.max(0, player.knockoutMs - dtMs);
    if (player.knockoutMs === 0) {
      state.events.push({ type: "knockoutRecovered", pos: { ...player.pos } });
    }
    return;
  }

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

  // Stamina scales with PACE, and MOVING only ever spends it. Standing still
  // (not moving) takes the full breather (rate = 1, the sole way to refill). A
  // moving hero reads his analogue throttle straight onto the drain: the rate
  // runs linearly from 0 at a standstill down to runRateFactor (a flat sprint
  // burns the whole base drain) at full throttle — so the drain tracks the
  // stick from zero and the instant he pushes off he is spending, never
  // regaining. The STAMINA stat deepens the reserve (computeMaxStamina) and,
  // here, both slows the drain and quickens the regen. A JUMP takeoff also
  // spends the pool (jumpCost), and any draining pace or jump that bottoms it
  // out freezes regen for a beat (emptyRegenLockMs) — so the hero can't
  // tap-run/tap-jump on fumes and must stand it off and wait the beat out.
  const staminaStat = effectiveStat(state, "stamina");
  // A jump only fires from the ground AND only when the sprint pool can cover
  // its takeoff cost — a winded hero (too little stamina to pay `jumpCost`)
  // can't hop and must walk it off, the same way an empty pool caps him to a
  // jog. Gated on the pool as it stands at the FRAME START (before this frame's
  // run drain), so it reads the same value the caller sees. The takeoff physics
  // below share this flag.
  const jumping =
    input.jump &&
    player.z === 0 &&
    player.stamina >= STAMINA.jumpCost * player.maxStamina;
  let rate = 1;
  if (player.moving) {
    rate = throttle * STAMINA.runRateFactor;
  }
  const draining = rate < 0;
  if (draining) {
    // Draining — harder difficulties wind the hero a touch faster
    // (staminaDrainMult); the STAMINA stat slows the burn.
    const drain =
      (-rate *
        STAMINA.drainPerSec *
        difficultyDef(state.difficulty).staminaDrainMult) /
      (1 + staminaStat * STAMINA.drainReductionPerPoint);
    player.stamina = Math.max(0, player.stamina - drain * dt);
  }
  if (jumping) {
    // A hop costs a flat slice of the FULL pool per takeoff, independent of dt.
    player.stamina = Math.max(
      0,
      player.stamina - STAMINA.jumpCost * player.maxStamina,
    );
  }
  // A draining pace or a jump that bottoms the pool out arms the regen lockout;
  // a later run/jump that re-empties it re-arms the full window.
  if ((draining || jumping) && player.stamina <= 0) {
    state.staminaRegenLockMs = STAMINA.emptyRegenLockMs;
  }
  // Recover only while standing still (moving keeps `rate` ≤ 0, so this only
  // adds stamina at the full standstill rate of 1), when no jump fired this
  // frame, and once the lockout has lapsed — the STAMINA stat quickens it.
  if (!draining && !jumping && state.staminaRegenLockMs <= 0) {
    const regen =
      rate * STAMINA.regenPerSec * (1 + staminaStat * STAMINA.regenPerPoint);
    player.stamina = Math.min(player.maxStamina, player.stamina + regen * dt);
  }
  state.staminaRegenLockMs = Math.max(0, state.staminaRegenLockMs - dtMs);

  // Track how long the pool has sat BONE-DRY so the stamina-drink mercy roll can
  // ramp its chance with time stranded (see `staminaDrinkChance`); any stamina
  // back resets it, so catching a breath drops straight back to the baseline.
  state.staminaEmptyMs = player.stamina <= 0 ? state.staminaEmptyMs + dtMs : 0;

  // Jump: only from the ground. Gravity is the level's — the moon's low g
  // turns the same takeoff into a high, floaty arc.
  if (jumping) {
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
 * Spend a stacked consumable on the player's input edge: `useMedkit` heals with
 * the best-quality kit held, `useStaminaPotion` refills the sprint pool, and
 * `useRepairKit` mends the whole kit (and re-equips durability-booted weapons).
 * All three are quiet no-ops when nothing is held or there is nothing to top up
 * (see consumeMedkit / consumeStaminaPotion / consumeRepairKit), so a mistap
 * never wastes a kit.
 */
function stepUseConsumables(state: GameState, input: GameInput): void {
  if (input.useMedkit) consumeMedkit(state);
  if (input.useStaminaPotion) consumeStaminaPotion(state);
  if (input.useManaPotion) consumeManaPotion(state);
  if (input.useRepairKit) consumeRepairKit(state);
}

/**
 * The screen-nuke pickup: a blast over the radius that hits EVERY monster it
 * reaches — minion, elite, or boss, no one exempt — for 200% of the mean health
 * of the mobs on screen (`NUKE.meanHpDamageMult`). That mean is low against a
 * horde of rank and file, so the blast wipes them outright, while the far
 * heavier elites and bosses are only chunked — the set-piece fights still have
 * to be finished by hand. A tall obstacle stops the blast the same way it stops
 * a shot — a mob sheltered behind the stone rides it out. Damage flows through
 * hitEnemy, so the blow can CRIT like any other and XP, loot rolls, the pity
 * rule, and the all-clear trophy all behave exactly as if the player had done
 * it the hard way — except the screen-nuke slices themselves (`noNukeDrop`): a
 * bomb's kills never chain into another bomb.
 */
function detonateNuke(state: GameState, radius: number): void {
  state.events.push({ type: "nuke", pos: { ...state.player.pos } });
  const radiusSq = radius * radius;
  const caught = state.enemies.filter((enemy) => {
    const def = enemyDef(enemy.defId);
    return (
      !def.apparition &&
      distanceSq(enemy.pos, state.player.pos) <= radiusSq &&
      lineOfSight(state, state.player.pos, enemy.pos)
    );
  });
  // Flat blast damage: NUKE.meanHpDamageMult (200%) of the MEAN current hp of
  // everything caught. Snapshot the mean BEFORE any blow lands so a lone
  // heavyweight can't be measured against its own already-chunked bar, and so
  // every mob in the blast takes the same size hit.
  const meanHp =
    caught.length > 0
      ? caught.reduce((sum, enemy) => sum + enemy.hp, 0) / caught.length
      : 0;
  const blast = meanHp * NUKE.meanHpDamageMult;
  for (const enemy of caught) {
    hitEnemy(state, enemy, blast, undefined, {
      noNukeDrop: true,
      noMenace: true,
    });
  }
  // THE AFTERMATH (config NUKE): a screen-nuke is a panic button, so it buys
  // real breathing room. Open the calm window — stepSpawner holds every refill
  // while it runs, so the ring can't instantly repopulate the screen the blast
  // just cleared — and cool the transient menace heat down to the earned
  // permanent floor (the ratchet the player's own overkill locked in still
  // stands), dumping the banked walk-credit lure too. Together the pack the
  // player fled from stays gone long enough to lose, and the horde that does
  // return is no denser or more evolved than the run's baseline — the bomb
  // helps instead of dooming the run. The recovery window arms alongside the
  // calm and only starts counting once the calm burns off: it eases the near-
  // floor back from empty to full so the swarm WALKS back in at the ordinary
  // rate rather than the whole floor snapping onto the player the instant the
  // hold releases ("they respawn more than I killed").
  state.nukeCalmMs = NUKE.calmMs;
  state.nukeRecoverMs = NUKE.recoverMs;
  state.menace = state.menaceFloor;
  state.moveSpawnCredit = 0;
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
  // Knocked out cold: no swings from a hero flat on his back. The cooldown
  // holds where it froze, so the blade is ready the moment he stands.
  if (player.knockoutMs > 0) return;
  player.weaponCooldownMs = Math.max(0, player.weaponCooldownMs - dtMs);
  if (player.weaponCooldownMs > 0) return;
  // Manual fire (input.fire === false): the trigger is up, so the attack
  // waits — past the cooldown tick above, keeping the weapon ready to fire
  // the instant the player presses.
  if (input.fire === false) return;

  const equipped = player.equipment.weapon;
  const weapon = weaponDef(equipped.defId);
  // Airborne over the fight: a melee weapon can't reach the grounded horde
  // while the hero floats above it — the same z rule (JUMP.dodgeHeight) that
  // lets enemies pass beneath him stays his blade. The cooldown keeps ticking
  // down mid-air (decremented above), so the swing is ready the instant he
  // lands. Ranged and magic still fire from height (shots leave at his z).
  if (!weapon.projectile && player.z > JUMP.dodgeHeight) return;
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
  // With no foe in reach, the auto-attack turns on the nearest breakable CRATE
  // and smashes it open for loot. Enemies always win the pick above; a crate is
  // only chased once none are targetable, so a lone crate in a cleared room
  // still gets cracked while combat is never diverted onto a box.
  const targetPos =
    target?.pos ?? nearestCrate(state, player.pos, range, input.view)?.pos;
  if (!targetPos) return;

  // The speed stat quickens the cadence: DEX (melee & ranged) and INT (magic)
  // each drop the effective cooldown as they rise.
  player.weaponCooldownMs = weaponCooldownFor(state, equipped);
  const dir = direction(player.pos, targetPos);
  if (!weapon.projectile) {
    // A swing cleaves a cone: the nearest monster is the aim, and every other
    // monster within reach and inside the weapon's arc is struck in the same
    // blow — but only the nearest `maxMeleeTargets` of them (INT raises that
    // cap). A blade sweeps a wide slash; a spear thrusts a narrow cone far.
    const half = weaponSweepHalfAngle(state, equipped);
    const swingEvent = {
      type: "swing" as const,
      pos: { ...player.pos },
      dir,
      range,
      arc: half * 2,
      // Filled in by meleeSweep below with the uncapped eligible count.
      targets: 0,
    };
    state.events.push(swingEvent);
    swingEvent.targets = meleeSweep(
      state,
      dir,
      range,
      half,
      equipped,
      maxMeleeTargets(state),
      weapon.class,
      weaponCritMult(state, equipped),
    );
    // The same swing smashes any breakable crate inside its cone — free
    // collateral in a fight, and the whole point of a swing aimed at a crate.
    // Each box rolls its own weapon blow, exactly like a cleaved mob.
    for (const crate of cratesInCone(state, player.pos, dir, range, half)) {
      damageCrate(state, crate, rollWeaponHit(state, equipped).damage);
    }
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
  // One id for the whole trigger pull: every pellet shares it, so the ranged AoE
  // calibration can group a volley's hits and count the DISTINCT foes it reached
  // (see each hit's `enemyHit.fromVolley`). Marks the hero's shots only.
  const volley = state.nextId++;
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
      volley,
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
): number {
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
  // The UNCAPPED eligible count (all foes in the cone, before the maxTargets
  // trim) — the geometry × density read the AoE calibration buckets by arc.
  return eligible.length;
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
      // No foe in the way: a hero shot that overlaps a breakable crate smashes
      // it instead of sailing over (a crate is jumpable, so `blockedByObstacle`
      // above lets the shot through to here). A piercing round bites the box and
      // flies on; anything else is spent on it.
      const crate = crateHitByCircle(state, projectile.pos, projectile.radius);
      if (crate) {
        damageCrate(state, crate, projectile.damage);
        if (projectile.pierceLeft && projectile.pierceLeft > 0) {
          projectile.pierceLeft--;
          survivors.push(projectile);
        }
        continue;
      }
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
      // A companion's shot is booked for the run but kept OUT of the menace
      // meter — menace answers an overpowered hero, not a helpful party (see
      // `noMenace` in hitEnemy); the hero's own shots heat it as always.
      noMenace: projectile.companionId !== undefined,
      // Credit a companion's shot-kill toward its own leveling (loot.ts).
      companionId: projectile.companionId,
      // Ranged AoE telemetry: which trigger pull this hit belongs to (hero
      // shots only — companion shots carry no volley).
      volley: projectile.volley,
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
      {
        critMult: projectile.critMult,
        damageRoll: projectile.damageRoll,
        // A chained leap inherits the source shot's menace attribution: a
        // companion's chain never heats the meter (see the projectile hit) —
        // and credits its kills to the same companion.
        noMenace: projectile.companionId !== undefined,
        companionId: projectile.companionId,
        // Same volley as the shot that grounded it — chained foes count toward
        // the volley's distinct-target reach.
        volley: projectile.volley,
      },
    );
  }
}

function stepEnemies(state: GameState, dt: number, dtMs: number): void {
  const player = state.player;

  // On the gentle rungs the plain horde loses its legs the moment the player
  // ENGAGES an elite or boss, so he can push through the swarm to the set piece
  // instead of being dog-piled at it (mobPursuitNearElite). "Engaged" means the
  // encounter has actually started — the set piece is awake (elites latch it),
  // wounded, or the player has walked inside its aggro range — not merely that
  // one sleeps somewhere on the map (which would slow the whole level and gut
  // the "idle play loses" promise). Computed once per tick; apparitions are
  // ghosts, not a fight, so they never count.
  const setPieceEngaged =
    (difficultyDef(state.difficulty).mobPursuitNearElite ?? 1) < 1 &&
    state.enemies.some((e) => {
      const d = enemyDef(e.defId);
      if (d.apparition || (d.role !== "elite" && d.role !== "boss")) {
        return false;
      }
      return (
        e.awake === true ||
        e.hp < e.maxHp ||
        distance(player.pos, e.pos) < d.ai.aggroRadius ||
        distance(player.pos, e.home) < d.ai.aggroRadius
      );
    });

  for (const enemy of state.enemies) {
    enemy.contactCooldownMs = Math.max(0, enemy.contactCooldownMs - dtMs);
    if (enemy.critFlashMs) {
      enemy.critFlashMs = Math.max(0, enemy.critFlashMs - dtMs);
    }
    // The FROST CHILL a companion's nova stamped runs down here; its slow is
    // read live in moveEnemy while it lasts (chillFactorFor).
    if (enemy.chillMs) {
      enemy.chillMs = Math.max(0, enemy.chillMs - dtMs);
    }
    if (enemy.vanishMs !== undefined) {
      enemy.vanishMs = Math.max(0, enemy.vanishMs - dtMs);
    }
    moveEnemy(state, enemy, dt, setPieceEngaged);
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
    // SAFE ZONES keep the trash horde out of the pocket (see zones.ts): only
    // the minion swarm is ejected — set pieces (elites/bosses) hold their
    // authored posts, so a safe zone must be authored clear of them.
    if (def.role === "minion") {
      repelFromZones(
        levelDef(state.level.id).safeZones,
        enemy.pos,
        def.radius + ZONES.repelMargin,
      );
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
      // The magical ward soaks its share first (and every hit pauses SPIRIT
      // health regen — see `absorbPlayerDamage`).
      player.hp -= absorbPlayerDamage(state, hpDamage);
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
/** The frost-chill slow a companion's nova stamped on `enemy`: its
 * `chillFactor` while `chillMs` runs, 1 otherwise. Multiplies onto the stasis
 * factor at every move site, so a chilled mob inside a stasis field crawls. */
function chillFactorFor(enemy: Enemy): number {
  return (enemy.chillMs ?? 0) > 0 ? (enemy.chillFactor ?? 1) : 1;
}

function moveEnemy(
  state: GameState,
  enemy: Enemy,
  dt: number,
  setPieceEngaged: boolean,
): void {
  const player = state.player;
  const def = enemyDef(enemy.defId);
  // A meteor blast flung this mob: while the launch coasts (stepKnockback owns
  // the movement) the AI sits out, so the fling reads as a fling instead of the
  // chase immediately fighting it back.
  if (enemy.knockMs && enemy.knockMs > 0) return;
  // Set-piece mechanics first (mechanics.ts): a mob rooted in a telegraph
  // windup or riding a charge dash is owned by the mechanic this tick.
  if (stepEnemyMechanics(state, enemy, dt, dt * 1000)) return;
  // Stasis fields (and a companion's frost chill) slow whatever crawls inside
  // them — bosses included. An enraged set piece runs hot (mechSpeedMult).
  const speed =
    enemy.speed *
    stasisFactorAt(state, enemy.pos) *
    chillFactorFor(enemy) *
    mechSpeedMult(enemy, def);
  const senses = () =>
    def.phasing === true || lineOfSight(state, enemy.pos, player.pos);

  // SUMMONED reinforcements (spawners.ts) RUN IN from off-screen at a sprint —
  // straight at the hero, ignoring line of sight, since they were called to him —
  // until they cross the APPROACH CIRCLE stamped at summon time (the shorter
  // viewport dimension). On crossing it they shed the marker and fall through to
  // their normal role AI at their own pace; they were summoned awake, so a minion
  // engages at once instead of dozing at the post it never had.
  if (enemy.approachRadius !== undefined) {
    if (
      distanceSq(enemy.pos, player.pos) >
      enemy.approachRadius * enemy.approachRadius
    ) {
      enemy.pos = moveToward(
        enemy.pos,
        player.pos,
        speed * SPAWNERS.runInSpeedMult * dt,
      );
      return;
    }
    enemy.approachRadius = undefined;
    enemy.awake = true;
  }

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
      if (!enemy.awake) {
        // A patrolling elite (the manager pacing his floor) walks its route;
        // a working one (the janitor mopping his patch) potters around its
        // post — either way the wake check above reads its live pos, so the
        // dormant motion never blunts the ambush.
        if (enemy.patrol) {
          stepPatrol(state, enemy, speed, dt);
        } else if (def.ai.idle === "work") {
          strollAtWork(state, enemy, def.radius, speed, dt);
        }
        return;
      }
      // Just woke: power-match the player before the ambush rush lands —
      // unless it is an apparition, which never fights anything. An
      // alarm-linked speaker calls its spawn point as the scene springs.
      if (!def.apparition) maybePowerScale(state, enemy);
      raiseAlarm(state, enemy);
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
      (def.ai.rushSpeed ?? def.speed) *
      stasisFactorAt(state, enemy.pos) *
      chillFactorFor(enemy);
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
      (def.ai.rushSpeed ?? def.speed) *
      stasisFactorAt(state, enemy.pos) *
      chillFactorFor(enemy);
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

  // Minions aggro on RANGE *and* a clear LINE. Waking needs the hero in range
  // and in sight; and the chase now needs that sight to HOLD — a wall between
  // the monster and the hero breaks the aggro, so it drifts back home instead of
  // grinding into the wall toward a hero it can't see. A hero who rounds a shelf
  // out of view leaves the patch quiet; step back into the lane and it re-locks.
  // (In the open, sight is always clear, so the horde chases as relentlessly as
  // before — only walls change anything.)
  const inRange =
    distanceSq(player.pos, enemy.pos) < def.ai.aggroRadius * def.ai.aggroRadius;
  const sees = senses();
  if (!inRange) {
    enemy.awake = false;
  } else if (!enemy.awake) {
    enemy.awake = enemy.hp < enemy.maxHp || sees;
    // An alarm-linked mob (a stationed foreman, a patrolling sentry) calls
    // its spawn point the moment it wakes — see raiseAlarm in spawners.ts.
    if (enemy.awake) raiseAlarm(state, enemy);
  }

  if (inRange && enemy.awake && sees) {
    // Gentle-rung mercy: once the player has engaged an elite/boss the plain
    // horde crawls (easy 10%, medium 50%) so he can break for the set piece.
    const pursuit = setPieceEngaged
      ? (difficultyDef(state.difficulty).mobPursuitNearElite ?? 1)
      : 1;
    enemy.pos = moveToward(
      enemy.pos,
      flankTarget(state, enemy),
      speed * pursuit * dt,
    );
  } else if (enemy.patrol) {
    // A PATROLLER walks its authored route while dormant (and resumes it
    // when a chase breaks) — the WoW-style wandering sentry.
    stepPatrol(state, enemy, speed, dt);
  } else if (def.ai.idle === "work") {
    // Off the clock — back to work: the dormant stroll around `home` replaces
    // the frozen stand-still (and the beeline home after a broken chase), so
    // the night shift reads as a crew working the floor.
    strollAtWork(state, enemy, def.radius, speed, dt);
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
  // Floating above the ground: the hero can't scoop loot mid-jump — a drop is
  // grabbed only once he's back down (the same z rule that stays his blade and
  // lets him clear the well pull). The magnet may still reel drops toward him
  // while airborne, but they wait on the ground until he lands to be taken.
  const airborne = player.z > JUMP.dodgeHeight;
  state.items = state.items.filter((item) => {
    // A mercy drop still riding its angel down is airborne: count off the
    // delivery, and until it lands it can't be picked up (the magnet leaves it
    // alone too — see stepAbilities). The renderer draws the descent off the
    // same timer; here it only gates the grab.
    if (item.deliverMs !== undefined && item.deliverMs > 0) {
      item.deliverMs = Math.max(0, item.deliverMs - dtMs);
      return true;
    }
    // Mid-jump the hero floats past the drop without taking it — hold it on
    // the ground until he lands (airborne short-circuits the reach test).
    const overlapping =
      !airborne && distanceSq(item.pos, player.pos) <= pickupReachSq;
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

    // The stack-and-spend consumables — repair kits, energy drinks (stamina
    // potions), and blue gatorade (mana potions) — STASH into the consumable
    // dock (stacking, capped at CONSUMABLES.stackCap) rather than firing on
    // contact; the hero spends one on his own call (useRepairKit /
    // useStaminaPotion / useManaPotion). A full stack turns the pickup away:
    // it stays on the ground.
    if (
      item.kind === "repair" ||
      item.kind === "drink" ||
      item.kind === "mana"
    ) {
      if (!bankConsumable(state, item.kind)) return true;
      state.stats.itemsCollected++;
      state.events.push({
        type: "itemCollected",
        kind: item.kind,
        name: consumableName(item.kind),
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
