// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The simulation step. Called with a fixed timestep by the app's game loop;
// mutates the state in place and records what happened in `state.events` so
// the app layer can play sounds and flash effects. Order per step: player
// steering + jump physics → weapon auto-attack → abilities (orbs, storms,
// stasis) → projectiles → enemies (aggro, elite ambush/dialogue, boss guard
// AI, contact damage) → menace decay → wave spawner (the escalating horde) →
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
  magnetRadius,
  orbPositions,
  stasisFactorAt,
} from "./abilities.ts";
import {
  ENEMY_AI,
  HELD_ITEMS,
  JUMP,
  LAST_STAND,
  LEVELING,
  MEDKIT,
  PLAYER,
  PROJECTILE,
  RUN,
  STAMINA,
  STATS,
} from "./config.ts";
import { spawnEnemy } from "./create.ts";
import { abilityDef } from "./defs/abilities.ts";
import { cutsceneDef } from "./defs/cutscenes.ts";
import {
  difficultyDef,
  meetsMinDifficulty,
  scaledMobCount,
} from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { weaponDef } from "./defs/equipment.ts";
import { levelDef } from "./defs/levels/index.ts";
import {
  addToInventory,
  armorInfo,
  effectiveStat,
  enemyCritChance,
  equipmentName,
  isBetterEquipment,
  maxMeleeTargets,
  playerDodgeChance,
  playerSpeed,
  recomputeMaxHp,
  recomputeMaxStamina,
  refreshArmor,
  repairEquippedWeapon,
  restoreArmor,
  syncInventoryCapacity,
  weaponCooldownFor,
  weaponDamage,
  weaponRangeFor,
  weaponSweepHalfAngle,
  wearEquippedWeapon,
} from "./items.ts";
import { grantXp, hitEnemy, unspawnedMinions } from "./loot.ts";
import {
  blockedByObstacle,
  insideObstacle,
  lineOfSight,
  resolveObstacles,
} from "./obstacles.ts";
import {
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
  stepSightThoughts,
  tryOpeningStrike,
  wantsDialogue,
} from "./story.ts";
import type {
  Enemy,
  GameInput,
  GameState,
  Item,
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

  // Snapshot cumulative output so the menace tick can read this step's damage
  // and kills as rates (see tickMenace) — the meter heats from what the player
  // is actually putting out, not from any single blow.
  const damageBefore = state.stats.damageDealt;
  const killsBefore = state.stats.kills;

  stepPlayer(state, input, dt, dtMs);
  stepUseItem(state, input);
  stepWeapon(state, input, dtMs);
  stepAbilities(state, dt, dtMs);
  stepProjectiles(state, dt, dtMs);
  stepEnemies(state, dt, dtMs);
  // Sight-pinned inner monologues fire on this tick's positions — after the
  // horde has moved, so "the hero sees one" means it is actually on screen.
  stepSightThoughts(state, levelDef(state.level.id).firstSightThoughts);
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
    return state.enemies.length === 0 && unspawnedMinions(state) === 0;
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
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).role !== "minion") continue;
    alive++;
    if (distance(enemy.pos, state.player.pos) <= ENEMY_AI.nearRadius) near++;
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
    // more hp, more xp, better loot (see menace.ts / spawnEnemy). On top of the
    // difficulty's flat hp lever, fold in the player-LEVEL toughness floor so a
    // levelled hero meets a sturdier swarm even when the meter is cold.
    state.enemies.push(
      spawnEnemy(
        defId,
        pos,
        state.rng,
        state.nextId++,
        difficultyDef(state.difficulty).mobHpMult * mobLevelScale(state),
        menaceStage(state),
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
    const drain =
      STAMINA.drainPerSec / (1 + staminaStat * STAMINA.drainReductionPerPoint);
    player.stamina = Math.max(0, player.stamina - drain * dt);
  } else {
    const walkFactor = player.moving ? STAMINA.walkRegenFactor : 1;
    const regen =
      STAMINA.regenPerSec *
      (1 + staminaStat * STAMINA.regenPerPoint) *
      walkFactor;
    player.stamina = Math.min(player.maxStamina, player.stamina + regen * dt);
  }

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
 * Spend one carried ability pickup on the `useItem` input edge. By default
 * the oldest banked ability kicks in; `useItemIndex` names a specific slot
 * (the powerup dock), and removing it shifts the rest down so the dock stays
 * packed oldest-first. grantAbility emits the abilityStarted event. With
 * empty hands, or an out-of-range index, the input is a quiet no-op / oldest.
 */
function stepUseItem(state: GameState, input: GameInput): void {
  if (!input.useItem) return;
  const held = state.player.heldAbilities;
  const index =
    input.useItemIndex !== undefined &&
    input.useItemIndex >= 0 &&
    input.useItemIndex < held.length
      ? input.useItemIndex
      : 0;
  const [defId] = held.splice(index, 1);
  if (!defId) return;
  const def = abilityDef(defId);
  if (def.nuke) {
    detonateNuke(state, def.nuke.radius);
    return;
  }
  grantAbility(state, defId);
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
  const caught = state.enemies.filter(
    (enemy) =>
      enemyDef(enemy.defId).role !== "boss" &&
      distanceSq(enemy.pos, state.player.pos) <= radiusSq &&
      lineOfSight(state, state.player.pos, enemy.pos),
  );
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
  const target = nearestEnemy(
    state.enemies,
    player.pos,
    range,
    input.view,
    (enemy) => lineOfSight(state, player.pos, enemy.pos),
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
      weaponDamage(state),
      maxMeleeTargets(state),
      weapon.class,
    );
    // Wear AFTER the strike so the blow lands with the weapon that swung.
    wearEquippedWeapon(state);
    return;
  }

  state.projectiles.push({
    id: state.nextId++,
    pos: { ...player.pos },
    dir,
    speed: weapon.projectile.speed,
    radius: weapon.projectile.radius,
    damage: weaponDamage(state),
    lifetimeMs: weapon.projectile.lifetimeMs,
    weaponClass: weapon.class,
    sprite: weapon.projectile.sprite,
    // The shot leaves from the shooter's height and sinks back in flight.
    z: player.z,
  });
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
 * player and inside `halfAngle` of the aim `dir`, each for `damage` (crits
 * roll per hit inside hitEnemy). The nearest monster — the aim — always sits
 * at the cone's centre, so a swing never whiffs the target it locked onto;
 * the arc just lets it cleave whatever else it faces. A monster touching the
 * player has no meaningful bearing and is always in reach. Walls still block:
 * a monster behind cover is spared even inside the cone. Iterates a snapshot
 * because hitEnemy removes the slain from state.enemies.
 */
function meleeSweep(
  state: GameState,
  dir: Vec2,
  range: number,
  halfAngle: number,
  damage: number,
  maxTargets: number,
  weaponClass: WeaponClass,
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
    const radius = enemyDef(enemy.defId).radius;
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
    hitEnemy(
      state,
      (eligible[i] as (typeof eligible)[number]).enemy,
      damage,
      weaponClass,
      { rollAccuracy: true },
    );
  }
}

function nearestEnemy(
  enemies: Enemy[],
  from: Vec2,
  range: number,
  view?: GameInput["view"],
  clear?: (enemy: Enemy) => boolean,
): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDistSq = range * range;
  for (const enemy of enemies) {
    if (view && !insideView(enemy.pos, view)) continue;
    const d = distanceSq(from, enemy.pos);
    // `clear` (line of sight) is checked lazily — only for candidates that
    // would actually win — so its cost scales with improvements, not with
    // the whole horde.
    if (d <= bestDistSq && (!clear || clear(enemy))) {
      best = enemy;
      bestDistSq = d;
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
          const victim = state.enemies.find(
            (enemy) =>
              distance(enemy.pos, orb) <=
              enemyDef(enemy.defId).radius + def.orbit!.orbRadius,
          );
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
      const pull = def.magnet.pullSpeed * dt;
      for (const item of state.items) {
        if (distance(item.pos, player.pos) > reach) continue;
        item.pos = moveToward(item.pos, player.pos, pull);
      }
    }
  }

  for (let i = player.abilities.length - 1; i >= 0; i--) {
    const ability = player.abilities[i] as (typeof player.abilities)[number];
    if (ability.remainingMs > 0) continue;
    player.abilities.splice(i, 1);
    state.events.push({ type: "abilityEnded", defId: ability.defId });
  }
}

function stepProjectiles(state: GameState, dt: number, dtMs: number): void {
  const survivors = [];
  for (const projectile of state.projectiles) {
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

    const hit = state.enemies.find(
      (enemy) =>
        distance(enemy.pos, projectile.pos) <=
        enemyDef(enemy.defId).radius + projectile.radius,
    );
    if (!hit) {
      survivors.push(projectile);
      continue;
    }
    hitEnemy(state, hit, projectile.damage, projectile.weaponClass, {
      rollAccuracy: true,
    });
  }
  state.projectiles = survivors;
}

function stepEnemies(state: GameState, dt: number, dtMs: number): void {
  const player = state.player;

  for (const enemy of state.enemies) {
    enemy.contactCooldownMs = Math.max(0, enemy.contactCooldownMs - dtMs);
    if (enemy.critFlashMs) {
      enemy.critFlashMs = Math.max(0, enemy.critFlashMs - dtMs);
    }
    moveEnemy(state, enemy, dt);
  }

  separateEnemies(state);

  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
    // Grounded monsters never clear an obstacle — even the jumpable ones.
    // Ghostly monsters drift straight through instead.
    if (!def.phasing) resolveObstacles(state, enemy.pos, def.radius);
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

    // Monsters drift along the ground — a player at the top of a moon jump
    // sails clean over their grasp.
    const touching =
      player.z <= JUMP.dodgeHeight &&
      distance(enemy.pos, player.pos) <= def.radius + PLAYER.radius;
    if (touching && enemy.contactCooldownMs <= 0) {
      // The swing is spent whether it lands or is dodged, so the same foe
      // can't re-swing next frame after a sidestep.
      enemy.contactCooldownMs = def.contactCooldownMs;
      // Pre-combat grace while the weapon is holstered: no blow lands until the
      // scripted vanguard's soft first swing draws it. That swing arms the hero
      // and plays his thought (story.ts); every other touch here is harmless.
      if (player.disarmed) {
        tryOpeningStrike(state, enemy);
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
      // The suit's plating soaks its grade's share of the physical hit, up to
      // whatever armor is left; the rest bites into HP. A bare hero (no
      // armored suit) takes the blow in full.
      const armor = armorInfo(state);
      let hpDamage = damage;
      if (armor && player.armor > 0) {
        const soaked = Math.min(
          Math.round(damage * armor.reduction),
          player.armor,
        );
        player.armor -= soaked;
        hpDamage = damage - soaked;
      }
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
          const d = distance(a.pos, b.pos);
          if (d >= cell || d === 0) continue;
          const push = (cell - d) / 2;
          const dir = direction(a.pos, b.pos);
          a.pos.x -= dir.x * push;
          a.pos.y -= dir.y * push;
          b.pos.x += dir.x * push;
          b.pos.y += dir.y * push;
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
    if (!enemy.awake) {
      enemy.awake =
        enemy.hp < enemy.maxHp ||
        (distance(player.pos, enemy.pos) < def.ai.aggroRadius && senses());
      if (!enemy.awake) return;
      // Just woke: power-match the player before the ambush rush lands.
      maybePowerScale(state, enemy);
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

  // Minions: an aggro latch. Waking needs the player in range AND in sight;
  // once awake the chase holds even when a wall breaks line of sight — only
  // escaping the radius entirely puts the monster back to sleep.
  const inRange = distance(player.pos, enemy.pos) < def.ai.aggroRadius;
  if (!inRange) {
    enemy.awake = false;
  } else if (!enemy.awake) {
    enemy.awake = enemy.hp < enemy.maxHp || senses();
  }

  if (inRange && enemy.awake) {
    enemy.pos = moveToward(enemy.pos, player.pos, speed * dt);
  } else if (distance(enemy.pos, enemy.home) > 4) {
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
  state.items = state.items.filter((item) => {
    const overlapping =
      distance(item.pos, player.pos) <= MEDKIT.radius + PLAYER.radius;
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
    // with the threshold, so arrows keep paying toward level-ups all run.
    if (item.kind === "xp") {
      state.stats.itemsCollected++;
      state.events.push({
        type: "itemCollected",
        kind: "xp",
        name: "GOLDEN ARROW",
      });
      grantXp(
        state,
        Math.max(1, Math.round(player.xpToNext * LEVELING.arrowXpShare)),
      );
      return false;
    }

    // Repair kits mend the equipped weapon and top up a worn suit's plating;
    // with neither to restore they stay on the ground for when something has
    // actually taken a beating.
    if (item.kind === "repair") {
      const mended = repairEquippedWeapon(state);
      const rearmored = restoreArmor(state);
      if (!mended && !rearmored) return true;
      state.stats.itemsCollected++;
      state.events.push({
        type: "itemCollected",
        kind: "repair",
        name: "REPAIR KIT",
      });
      return false;
    }

    // Story items are plot, not gear: banked in state.storyItems (never
    // the bag) and their lore plays as a dialogue on the spot.
    if (item.kind === "story") {
      collectStoryItem(state, item.defId);
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
      // Donning a fresh suit on pickup must re-arm its plating, or the armor bar
      // stays stuck at 0 until the next manual equip — the same refresh the
      // inventory equip path runs. A +STRENGTH piece can also widen the bag, so
      // grow it to match (both mirror `equipFromInventory`).
      if (slot === "suit") refreshArmor(state);
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
        name: equipmentName(item.equipment),
      });
      state.events.push({ type: "autoEquipped", defId: item.equipment.defId });
      return false;
    }
    if (!addToInventory(state, item.equipment)) return true;
    state.stats.itemsCollected++;
    state.events.push({
      type: "itemCollected",
      kind: "equipment",
      tier: item.equipment.tier,
      name: equipmentName(item.equipment),
    });
    return false;
  });
  if (displaced.length > 0) state.items.push(...displaced);
}
