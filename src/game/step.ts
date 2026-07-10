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
  grantAbility,
  isSlotActive,
  magnetRadius,
  orbPositions,
  removeHeldSlot,
  stasisFactorAt,
} from "./abilities.ts";
import {
  AIM,
  APPARITION,
  ENEMY_AI,
  HELD_ITEMS,
  JUMP,
  LAST_STAND,
  LOOT,
  MEDKIT,
  PLAYER,
  PROJECTILE,
  RUN,
  STAMINA,
  STATS,
  WEAPON,
} from "./config.ts";
import { maybeCompanionQuote, stepCompanions } from "./companions.ts";
import { stepAsteroids, stepWells } from "./hazards.ts";
import { spawnEnemy } from "./create.ts";
import { abilityDef } from "./defs/abilities.ts";
import { cutsceneDef } from "./defs/cutscenes.ts";
import {
  difficultyDef,
  meetsMinDifficulty,
  scaledMobCount,
} from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { weaponCritMult, weaponDef } from "./defs/equipment.ts";
import { levelDef } from "./defs/levels/index.ts";
import {
  addToInventory,
  armorReduction,
  effectiveStat,
  enemyCritChance,
  equipmentName,
  isBetterEquipment,
  maxMeleeTargets,
  playerDodgeChance,
  playerSpeed,
  recomputeMaxHp,
  recomputeMaxStamina,
  repairEquippedWeapon,
  repairWornArmor,
  restoreStamina,
  syncInventoryCapacity,
  weaponCooldownFor,
  weaponRangeFor,
  rollWeaponHit,
  weaponSweepHalfAngle,
  wearEquippedWeapon,
  wearWornArmor,
  wouldUpgradeSlot,
} from "./items.ts";
import { arrowXpShareAt } from "./leveling.ts";
import { grantXp, hitEnemy, unspawnedMinions } from "./loot.ts";
import { revealAround } from "./map.ts";
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
  collectStoryItem,
  startEnemyDialogue,
  stepDoors,
  stepOpeningStrike,
  stepSightThoughts,
  wantsDialogue,
} from "./story.ts";
import type {
  Enemy,
  Equipment,
  GameInput,
  GameState,
  Item,
  Projectile,
  WeaponClass,
} from "./types.ts";

/** Advance the simulation by `dtMs` milliseconds. */
export function step(state: GameState, input: GameInput, dtMs: number): void {
  state.events = [];

  // The prelude scene runs on the same clock as the sim (deterministic,
  // headless-testable); the world stays frozen until it plays out.
  if (state.phase === "cutscene") {
    if (state.cutscene && !state.cutscene.done) {
      stepCutscene(state.cutscene, cutsceneDef(state.cutscene.defId), dtMs);
    }
    if (!state.cutscene || state.cutscene.done) {
      state.cutscene = null;
      state.phase = "intro";
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

  // Snapshot cumulative output so the menace tick can read this step's damage
  // and kills as rates (see tickMenace) — the meter heats from what the player
  // is actually putting out, not from any single blow.
  const damageBefore = state.stats.damageDealt;
  const killsBefore = state.stats.kills;

  stepPlayer(state, input, dt, dtMs);
  // Walking lifts the fog of war around wherever the hero now stands.
  revealAround(state, state.player.pos);
  // The wandering merchant strolls (and may be MET) on this tick's player
  // position — right after the hero moves, so the meeting judges what the
  // player actually sees.
  stepMerchant(state, dt, dtMs);
  stepUseItem(state, input);
  stepWeapon(state, input, dtMs);
  stepAbilities(state, dt, dtMs);
  stepProjectiles(state, dt, dtMs);
  stepEnemies(state, dt, dtMs);
  // The party acts on the tick's final enemy positions: regroup, fight,
  // soak contact blows, stand back up (see companions.ts).
  stepCompanions(state, dt, dtMs);
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
    state.stats.damageDealt - damageBefore,
    state.stats.kills - killsBefore,
  );
  stepSpawner(state);
  stepItems(state);
  stepDoors(state);

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
  }
  if (state.victoryCountdownMs !== null) {
    state.victoryCountdownMs -= dtMs;
    if (state.victoryCountdownMs <= 0) {
      state.victoryCountdownMs = 0;
      state.phase = "victory";
      state.events.push({ type: "victory" });
    }
  }
}

/** Has the level's objective been met? */
function objectiveCleared(state: GameState): boolean {
  const objective = levelDef(state.level.id).objective;
  if (objective.type === "clearAll") {
    // Apparitions never count as foes — an unvisited (hence unvanished)
    // dialogue figure must not hold a cleared field hostage.
    return (
      !state.enemies.some((e) => !enemyDef(e.defId).apparition) &&
      unspawnedMinions(state) === 0
    );
  }
  return !state.enemies.some((e) => enemyDef(e.defId).role === "boss");
}

/**
 * The horde spawner, three pressures stacked. (1) Each wave-budget line
 * streams its count in over its time window, eased quadratically, so the
 * ramp ends in an overwhelming flood. (2) Walking the level spends
 * moveSpawnCredit — every `moveSpawnEvery` px stirs one extra monster
 * awake. (3) A live floor (`minAlive`) pulls spawns forward whenever the
 * field goes quiet, so there is always a pack on screen. All three draw
 * from the same finite budget; spawns land in a ring just outside the
 * player's view and give chase at once; the live cap defers (never
 * cancels) what the field can't hold.
 */
function stepSpawner(state: GameState): void {
  const waves = levelDef(state.level.id).waves;
  if (!waves) return;
  // Difficulty scales the horde: every budget line grows by the mob
  // multiplier, and the live cap/floor stretch so the bigger budget can
  // actually crowd the field instead of queueing behind medium's cap. Menace
  // stacks on top — a rampaging player lures a denser, bigger crowd (lureMult
  // ≥ 1), so the floor and cap both swell with the escalation.
  const aliveMult = difficultyDef(state.difficulty).aliveMult * lureMult(state);
  const maxAlive = Math.round(waves.maxAlive * aliveMult);
  const minAlive = Math.round(waves.minAlive * aliveMult);

  let alive = 0;
  let near = 0; // minions close enough to count as "on the player's screen"
  const nearRadiusSq = ENEMY_AI.nearRadius * ENEMY_AI.nearRadius;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).role !== "minion") continue;
    alive++;
    if (distanceSq(enemy.pos, state.player.pos) <= nearRadiusSq) near++;
  }

  const t = state.stats.timeMs;
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
}

/** Pull one monster forward from the earliest unfinished budget line. */
function spawnFromBudget(
  state: GameState,
  waves: NonNullable<ReturnType<typeof levelDef>["waves"]>,
): boolean {
  for (let i = 0; i < waves.budget.length; i++) {
    const entry = waves.budget[i] as (typeof waves.budget)[number];
    if (!meetsMinDifficulty(state.difficulty, entry.minDifficulty)) continue;
    const spawned = state.waveSpawned[i] ?? 0;
    if (spawned >= scaledMobCount(entry.count, state.difficulty)) continue;
    if (!spawnWaveEnemy(state, entry.enemy)) return false;
    state.waveSpawned[i] = spawned + 1;
    return true;
  }
  return false;
}

/**
 * Drop one wave monster into the spawn ring around the player. Near a wall
 * the clamped ring can collapse onto the player — rejection-sample a few
 * angles and defer the spawn (false) rather than place an unfair one.
 */
function spawnWaveEnemy(state: GameState, defId: string): boolean {
  const def = enemyDef(defId);
  for (let attempts = 0; attempts < 8; attempts++) {
    const angle = state.rng() * Math.PI * 2;
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
 * The screen-nuke pickup: every non-boss monster within the radius, and not
 * behind a rock, dies on the spot. A tall obstacle stops the blast the same
 * way it stops a shot — a mob sheltered behind the stone rides it out. Kills
 * flow through hitEnemy, so XP, loot rolls, the pity rule, and the all-clear
 * trophy all behave exactly as if the player had done it the hard way.
 */
function detonateNuke(state: GameState, radius: number): void {
  state.events.push({ type: "nuke", pos: { ...state.player.pos } });
  const radiusSq = radius * radius;
  const caught = state.enemies.filter((enemy) => {
    const def = enemyDef(enemy.defId);
    return (
      def.role !== "boss" &&
      !def.apparition &&
      distanceSq(enemy.pos, state.player.pos) <= radiusSq &&
      lineOfSight(state, state.player.pos, enemy.pos)
    );
  });
  for (const enemy of caught) {
    hitEnemy(state, enemy, enemy.hp);
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
      weaponCritMult(weapon),
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
    projectile.critMult = weaponCritMult(weapon);
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
          hitEnemy(state, victim, def.orbit.damage, "magic");
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
        hitEnemy(state, victim, def.storm.damage, "magic");
      }
    }

    // The magnet: drops caught in the field fly at the player. Actual
    // pickup stays stepItems' job once they arrive within reach.
    if (def.magnet) {
      const reach = magnetRadius(state, def);
      const reachSq = reach * reach;
      const pull = def.magnet.pullSpeed * dt;
      for (const item of state.items) {
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
    // sails clean over their grasp.
    const touchReach = def.radius + PLAYER.radius;
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
      const damage = Math.round(
        def.contactDamage *
          (enemy.contactMult ?? 1) *
          (crit ? STATS.critMultiplier : 1) *
          (lastStand ? LAST_STAND.damageMultiplier : 1),
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
  // Stasis fields slow whatever crawls inside them — bosses included.
  const speed = enemy.speed * stasisFactorAt(player, enemy.pos);
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
    const rushSpeed =
      (def.ai.rushSpeed ?? def.speed) * stasisFactorAt(player, enemy.pos);
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
      (def.ai.rushSpeed ?? def.speed) * stasisFactorAt(player, enemy.pos);
    const gap = distance(enemy.pos, player.pos) - (def.radius + PLAYER.radius);
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
    enemy.pos = moveToward(enemy.pos, player.pos, speed * dt);
  } else if (distanceSq(enemy.pos, enemy.home) > 16) {
    enemy.pos = moveToward(
      enemy.pos,
      enemy.home,
      speed * (def.ai.returnSpeedFactor ?? 0.5) * dt,
    );
  }
}

function stepItems(state: GameState): void {
  const player = state.player;
  // Pieces displaced by an auto-equip with a full bag fall back to the
  // ground — collected here so the filter pass isn't mutated mid-flight.
  const displaced: Item[] = [];
  const pickupReach = MEDKIT.radius + PLAYER.radius;
  const pickupReachSq = pickupReach * pickupReach;
  state.items = state.items.filter((item) => {
    const overlapping = distanceSq(item.pos, player.pos) <= pickupReachSq;
    if (!overlapping) return true;

    if (item.kind === "medkit") {
      player.hp = Math.min(player.maxHp, player.hp + MEDKIT.heal);
      state.stats.itemsCollected++;
      state.events.push({
        type: "itemCollected",
        kind: "medkit",
        name: "MEDKIT",
      });
      return false;
    }

    // The golden arrow: a share of the current level's XP bar. It scales
    // with the threshold so arrows keep triggering dings all run, but the
    // share TAPERS with level (arrowXpShareAt) — a full quarter-level early,
    // a thin sliver near the cap — so arrows carry the onboarding and then
    // recede, leaving the long climb to the kill grind.
    if (item.kind === "xp") {
      state.stats.itemsCollected++;
      state.events.push({
        type: "itemCollected",
        kind: "xp",
        name: "GOLDEN ARROW",
      });
      grantXp(
        state,
        Math.max(1, Math.round(player.xpToNext * arrowXpShareAt(player.level))),
      );
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

    // Energy drinks reset the sprint pool to full; with nothing to top up (a
    // rested hero) they stay on the ground, like a repair kit on a pristine
    // weapon, so the drink waits for when the legs have actually gone.
    if (item.kind === "drink") {
      if (!restoreStamina(state)) return true;
      state.stats.itemsCollected++;
      state.events.push({
        type: "itemCollected",
        kind: "drink",
        name: "ENERGY DRINK",
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
    // at the carry cap they stay on the ground like an overflowing drop.
    if (item.kind === "ability") {
      if (state.player.heldAbilities.length >= HELD_ITEMS.cap) return true;
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
    // finds go into the bag, staying grounded when it's full.
    if (isBetterEquipment(state, item.equipment)) {
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
      equipped: false,
      upgrade: bagUpgrade,
    });
    return false;
  });
  if (displaced.length > 0) state.items.push(...displaced);
}
