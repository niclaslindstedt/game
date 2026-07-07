// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The simulation step. Called with a fixed timestep by the app's game loop;
// mutates the state in place and records what happened in `state.events` so
// the app layer can play sounds and flash effects. Order per step: player
// steering + jump physics → weapon auto-attack → abilities (orbs, storms,
// stasis) → projectiles → enemies (aggro, elite ambush/dialogue, boss guard
// AI, contact damage) → wave spawner (the escalating horde) → item pickups →
// locked doors → objective check → win/lose. Kill resolution and loot rolls
// live in loot.ts; dialogue and door rules in story.ts. Level-ups pause the
// run in the `levelup` phase until `allocateStat` spends the point(s);
// dialogue pauses it in `dialogue` until tapped through.

import { stepCutscene } from "@game/lib/cutscene.ts";
import {
  clamp,
  direction,
  distance,
  distanceSq,
  moveToward,
  segmentDistanceSq,
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
  OBSTACLES,
  PLAYER,
  PROJECTILE,
  RUN,
  STATS,
} from "./config.ts";
import { spawnEnemy } from "./create.ts";
import { abilityDef } from "./defs/abilities.ts";
import { cutsceneDef } from "./defs/cutscenes.ts";
import { difficultyDef, scaledMobCount } from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies.ts";
import { weaponDef } from "./defs/equipment.ts";
import { levelDef } from "./defs/levels.ts";
import {
  addToInventory,
  enemyCritChance,
  equipmentName,
  isBetterEquipment,
  playerSpeed,
  recomputeMaxHp,
  repairEquippedWeapon,
  weaponDamage,
  wearEquippedWeapon,
} from "./items.ts";
import { grantXp, hitEnemy, unspawnedMinions } from "./loot.ts";
import {
  collectStoryItem,
  startEnemyDialogue,
  stepDoors,
  wantsDialogue,
} from "./story.ts";
import type { Enemy, GameInput, GameState, Item } from "./types.ts";

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

  stepPlayer(state, input, dt, dtMs);
  stepUseItem(state, input);
  stepWeapon(state, input, dtMs);
  stepAbilities(state, dt, dtMs);
  stepProjectiles(state, dt, dtMs);
  stepEnemies(state, dt, dtMs);
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
  // actually crowd the field instead of queueing behind medium's cap.
  const aliveMult = difficultyDef(state.difficulty).aliveMult;
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
    state.enemies.push(
      spawnEnemy(
        defId,
        pos,
        state.rng,
        state.nextId++,
        difficultyDef(state.difficulty).mobHpMult,
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

  if (
    input.steering &&
    distance(player.pos, input.target) > PLAYER.arriveRadius
  ) {
    const before = player.pos;
    // A gentle nudge of the dpad walks slowly; a full push runs. The throttle
    // never fully stops the walk (a held-but-centered finger still creeps)
    // and defaults to full speed for headless callers that omit it.
    const throttle = clamp(input.throttle ?? 1, 0, 1);
    const next = moveToward(
      player.pos,
      input.target,
      playerSpeed(state) * throttle * dt,
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
 * Push a circular body out of every obstacle it overlaps. A body at height
 * `z` above OBSTACLES.clearHeight sails over jumpable obstacles; nothing
 * clears the tall ones. Monsters never leave the ground, so every obstacle
 * blocks them.
 */
function resolveObstacles(
  state: GameState,
  pos: Vec2,
  radius: number,
  z = 0,
): void {
  for (const obstacle of state.obstacles) {
    if (obstacle.jumpable && z > OBSTACLES.clearHeight) continue;
    const min = obstacle.radius + radius;
    if (distanceSq(pos, obstacle.pos) >= min * min) continue;
    const d = distance(pos, obstacle.pos);
    if (d === 0) {
      pos.x = obstacle.pos.x + min; // dead-center: pick a side, any side
      continue;
    }
    const dir = direction(obstacle.pos, pos);
    pos.x = obstacle.pos.x + dir.x * min;
    pos.y = obstacle.pos.y + dir.y * min;
  }
}

/** Is a circle at `pos` overlapping any obstacle (spawn placement check)? */
function insideObstacle(state: GameState, pos: Vec2, radius: number): boolean {
  for (const obstacle of state.obstacles) {
    const min = obstacle.radius + radius;
    if (distanceSq(pos, obstacle.pos) < min * min) return true;
  }
  return false;
}

/**
 * Does a straight shot from `from` to `to` clear every TALL obstacle? Walls,
 * server racks, and boulders eat bullets; the low, jumpable ones (desks,
 * rocks) never block — shots fly over them just like a jumping player.
 */
function lineOfSight(state: GameState, from: Vec2, to: Vec2): boolean {
  return !blockedByObstacle(state, from, to, 0);
}

/** Does the swept path `from`→`to` (a circle of `radius`) hit a tall obstacle? */
function blockedByObstacle(
  state: GameState,
  from: Vec2,
  to: Vec2,
  radius: number,
): boolean {
  for (const obstacle of state.obstacles) {
    if (obstacle.jumpable) continue;
    const min = obstacle.radius + radius;
    if (segmentDistanceSq(from, to, obstacle.pos) < min * min) return true;
  }
  return false;
}

/**
 * Spend one carried ability pickup on the `useItem` input edge: the oldest
 * banked ability kicks in (grantAbility emits the abilityStarted event).
 * With empty hands the input is a quiet no-op.
 */
function stepUseItem(state: GameState, input: GameInput): void {
  if (!input.useItem) return;
  const defId = state.player.heldAbilities.shift();
  if (!defId) return;
  const def = abilityDef(defId);
  if (def.nuke) {
    detonateNuke(state, def.nuke.radius);
    return;
  }
  grantAbility(state, defId);
}

/**
 * The screen-nuke pickup: every non-boss monster within the radius dies on
 * the spot. Kills flow through hitEnemy, so XP, loot rolls, the pity rule,
 * and the all-clear trophy all behave exactly as if the player had done it
 * the hard way.
 */
function detonateNuke(state: GameState, radius: number): void {
  state.events.push({ type: "nuke", pos: { ...state.player.pos } });
  const radiusSq = radius * radius;
  const caught = state.enemies.filter(
    (enemy) =>
      enemyDef(enemy.defId).role !== "boss" &&
      distanceSq(enemy.pos, state.player.pos) <= radiusSq,
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
  player.weaponCooldownMs = Math.max(0, player.weaponCooldownMs - dtMs);
  if (player.weaponCooldownMs > 0) return;

  const weapon = weaponDef(player.equipment.weapon.defId);
  // No target through a wall: the character never wastes a swing or a shot
  // on a monster it can't actually reach.
  const target = nearestEnemy(
    state.enemies,
    player.pos,
    weapon.range,
    input.view,
    (enemy) => lineOfSight(state, player.pos, enemy.pos),
  );
  if (!target) return;

  player.weaponCooldownMs = weapon.cooldownMs;
  if (!weapon.projectile) {
    state.events.push({ type: "swing" });
    hitEnemy(state, target, weaponDamage(state));
    // Wear AFTER the strike so the blow lands with the weapon that swung.
    wearEquippedWeapon(state);
    return;
  }

  state.projectiles.push({
    id: state.nextId++,
    pos: { ...player.pos },
    dir: direction(player.pos, target.pos),
    speed: weapon.projectile.speed,
    radius: weapon.projectile.radius,
    damage: weaponDamage(state),
    lifetimeMs: weapon.projectile.lifetimeMs,
    weaponClass: weapon.class,
    // The shot leaves from the shooter's height and sinks back in flight.
    z: player.z,
  });
  state.stats.shotsFired++;
  state.events.push({ type: "shot", weaponClass: weapon.class });
  wearEquippedWeapon(state);
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
          hitEnemy(state, victim, def.orbit.damage);
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
        hitEnemy(state, victim, def.storm.damage);
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
    hitEnemy(state, hit, projectile.damage);
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
      const crit = state.rng() < enemyCritChance(state, def.critChance);
      // A boss backed into its last stand hits like a cornered animal.
      const lastStand =
        def.role === "boss" && enemy.hp <= enemy.maxHp * LAST_STAND.hpFraction;
      const damage = Math.round(
        def.contactDamage *
          (crit ? STATS.critMultiplier : 1) *
          (lastStand ? LAST_STAND.damageMultiplier : 1),
      );
      player.hp -= damage;
      player.hurtFlashMs = 250;
      enemy.contactCooldownMs = def.contactCooldownMs;
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

    // Repair kits mend the equipped weapon; with nothing to repair they
    // stay on the ground for when the edge has actually dulled.
    if (item.kind === "repair") {
      if (!repairEquippedWeapon(state)) return true;
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
