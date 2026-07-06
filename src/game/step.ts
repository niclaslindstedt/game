// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The simulation step. Called with a fixed timestep by the app's game loop;
// mutates the state in place and records what happened in `state.events` so
// the app layer can play sounds and flash effects. Order per step: player
// steering + jump physics → weapon auto-attack → projectiles → enemies
// (aggro, boss guard AI, contact damage) → item pickups → objective check →
// win/lose. Kills grant XP proportional to the victim's max hp; level-ups
// pause the run in the `levelup` phase until `allocateStat` spends the
// point(s).

import {
  clamp,
  direction,
  distance,
  distanceSq,
  moveToward,
  type Vec2,
} from "@game/lib/vec.ts";
import {
  ENEMY_AI,
  JUMP,
  LEVELING,
  LOOT,
  MEDKIT,
  PLAYER,
  RUN,
  STATS,
} from "./config.ts";
import { enemyDef, type EnemyDef } from "./defs/enemies.ts";
import { weaponDef } from "./defs/equipment.ts";
import { levelDef } from "./defs/levels.ts";
import {
  addToInventory,
  dropChance,
  enemyCritChance,
  playerCritChance,
  rollEquipment,
  weaponDamage,
} from "./items.ts";
import type { Enemy, GameInput, GameState } from "./types.ts";

/** Advance the simulation by `dtMs` milliseconds. */
export function step(state: GameState, input: GameInput, dtMs: number): void {
  state.events = [];
  if (state.phase !== "playing") return;

  const dt = dtMs / 1000;
  state.stats.timeMs += dtMs;

  stepPlayer(state, input, dt, dtMs);
  stepWeapon(state, dtMs);
  stepProjectiles(state, dt, dtMs);
  stepEnemies(state, dt, dtMs);
  stepItems(state);

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
  if (objective.type === "clearAll") return state.enemies.length === 0;
  return !state.enemies.some((e) => enemyDef(e.defId).role === "boss");
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
    const next = moveToward(player.pos, input.target, PLAYER.speed * dt);
    player.facing = direction(before, input.target);
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
 * The character fights autonomously with whatever is in the weapon slot:
 * melee weapons strike the nearest monster in reach directly, the rest fire
 * a projectile at it.
 */
function stepWeapon(state: GameState, dtMs: number): void {
  const player = state.player;
  player.weaponCooldownMs = Math.max(0, player.weaponCooldownMs - dtMs);
  if (player.weaponCooldownMs > 0) return;

  const weapon = weaponDef(player.equipment.weapon.defId);
  const target = nearestEnemy(state.enemies, player.pos, weapon.range);
  if (!target) return;

  player.weaponCooldownMs = weapon.cooldownMs;
  if (!weapon.projectile) {
    state.events.push({ type: "swing" });
    hitEnemy(state, target, weaponDamage(state));
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
  });
  state.stats.shotsFired++;
  state.events.push({ type: "shot", weaponClass: weapon.class });
}

function nearestEnemy(
  enemies: Enemy[],
  from: Vec2,
  range: number,
): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDistSq = range * range;
  for (const enemy of enemies) {
    const d = distanceSq(from, enemy.pos);
    if (d <= bestDistSq) {
      best = enemy;
      bestDistSq = d;
    }
  }
  return best;
}

/**
 * Apply one player hit: roll the crit (LUCK), deal damage, and on a kill
 * grant XP proportional to max hp and roll loot. Bosses' guaranteed drops
 * come from their def; the victory countdown starts once the objective
 * clears at the end of the step.
 */
function hitEnemy(state: GameState, enemy: Enemy, baseDamage: number): void {
  const crit = state.rng() < playerCritChance(state);
  const damage = Math.round(baseDamage * (crit ? STATS.critMultiplier : 1));
  enemy.hp -= damage;
  state.stats.damageDealt += damage;

  if (enemy.hp > 0) {
    state.events.push({ type: "enemyHit", pos: { ...enemy.pos }, crit });
    return;
  }

  const def = enemyDef(enemy.defId);
  state.enemies.splice(state.enemies.indexOf(enemy), 1);
  state.stats.kills++;
  state.events.push({
    type: "enemyKilled",
    pos: { ...enemy.pos },
    defId: enemy.defId,
  });

  grantXp(state, def.xp ?? Math.round(enemy.maxHp * LEVELING.xpPerHp));

  if (def.loot) {
    dropGuaranteedLoot(state, def, enemy.pos);
  } else if (state.rng() < dropChance(state)) {
    // Regular monsters sometimes leave something behind; LUCK widens the
    // odds and sweetens the tier roll.
    const pos = { ...enemy.pos };
    if (state.rng() < LOOT.equipmentShare) {
      state.items.push({
        id: state.nextId++,
        kind: "equipment",
        pos,
        equipment: rollEquipment(state),
      });
    } else {
      state.items.push({ id: state.nextId++, kind: "medkit", pos });
    }
    state.events.push({ type: "itemDropped", pos });
  }

  if (def.role === "boss") {
    state.events.push({ type: "bossDefeated", pos: { ...enemy.pos } });
  }
}

/** Bosses always pay out: their def pins the drops, scattered around them. */
function dropGuaranteedLoot(state: GameState, def: EnemyDef, at: Vec2): void {
  const loot = def.loot;
  if (!loot) return;
  const scatter = (): Vec2 => ({
    x: clamp(at.x + (state.rng() - 0.5) * 90, 16, state.level.width - 16),
    y: clamp(at.y + (state.rng() - 0.5) * 90, 16, state.level.height - 16),
  });
  const drops: ("weapon" | "gear")[] = [
    ...Array<"weapon">(loot.weapons).fill("weapon"),
    ...Array<"gear">(loot.gear).fill("gear"),
  ];
  for (const slot of drops) {
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos: scatter(),
      equipment: rollEquipment(state, { slot, tierBonus: loot.tierBonus }),
    });
  }
  for (let i = 0; i < loot.medkits; i++) {
    state.items.push({ id: state.nextId++, kind: "medkit", pos: scatter() });
  }
  state.events.push({ type: "itemDropped", pos: { ...at } });
}

/** Award XP; each threshold crossed banks a stat point and pauses the run. */
function grantXp(state: GameState, amount: number): void {
  const player = state.player;
  player.xp += amount;
  state.stats.xpGained += amount;
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level++;
    player.xpToNext = Math.round(
      LEVELING.baseXpToLevel * Math.pow(LEVELING.xpGrowth, player.level - 1),
    );
    player.pendingStatPoints += LEVELING.statPointsPerLevel;
    state.events.push({ type: "levelUp", level: player.level });
  }
  if (player.pendingStatPoints > 0) state.phase = "levelup";
}

function stepProjectiles(state: GameState, dt: number, dtMs: number): void {
  const survivors = [];
  for (const projectile of state.projectiles) {
    projectile.pos.x += projectile.dir.x * projectile.speed * dt;
    projectile.pos.y += projectile.dir.y * projectile.speed * dt;
    projectile.lifetimeMs -= dtMs;

    const outOfBounds =
      projectile.pos.x < 0 ||
      projectile.pos.y < 0 ||
      projectile.pos.x > state.level.width ||
      projectile.pos.y > state.level.height;
    if (projectile.lifetimeMs <= 0 || outOfBounds) continue;

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
    moveEnemy(state, enemy, dt);
  }

  // Push overlapping monsters apart so packs spread instead of collapsing
  // into a single stacked blob. O(n²) is fine for a few dozen enemies.
  for (let i = 0; i < state.enemies.length; i++) {
    for (let j = i + 1; j < state.enemies.length; j++) {
      const a = state.enemies[i];
      const b = state.enemies[j];
      if (!a || !b) continue;
      const d = distance(a.pos, b.pos);
      if (d >= ENEMY_AI.separation || d === 0) continue;
      const push = (ENEMY_AI.separation - d) / 2;
      const dir = direction(a.pos, b.pos);
      a.pos.x -= dir.x * push;
      a.pos.y -= dir.y * push;
      b.pos.x += dir.x * push;
      b.pos.y += dir.y * push;
    }
  }

  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
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

    // Monsters drift along the ground — a player at the top of a moon jump
    // sails clean over their grasp.
    const touching =
      player.z <= JUMP.dodgeHeight &&
      distance(enemy.pos, player.pos) <= def.radius + PLAYER.radius;
    if (touching && enemy.contactCooldownMs <= 0) {
      const crit = state.rng() < enemyCritChance(state, def.critChance);
      const damage = Math.round(
        def.contactDamage * (crit ? STATS.critMultiplier : 1),
      );
      player.hp -= damage;
      player.hurtFlashMs = 250;
      enemy.contactCooldownMs = def.contactCooldownMs;
      state.stats.damageTaken += damage;
      state.events.push({ type: "playerHurt", crit });
    }
  }
}

/**
 * Enemy AI: haunt the spawn point, chase when the player wanders close,
 * drift home when they escape. Bosses guard their post instead — they wake
 * when the player nears it (or once wounded) but never stray past their
 * leash.
 */
function moveEnemy(state: GameState, enemy: Enemy, dt: number): void {
  const player = state.player;
  const def = enemyDef(enemy.defId);

  if (def.role === "boss") {
    const awake =
      enemy.hp < enemy.maxHp ||
      distance(player.pos, enemy.home) < def.ai.aggroRadius ||
      distance(player.pos, enemy.pos) < def.ai.aggroRadius;
    const leashed =
      def.ai.leashRadius !== undefined &&
      distance(enemy.pos, enemy.home) > def.ai.leashRadius;
    const target = awake && !leashed ? player.pos : enemy.home;
    enemy.pos = moveToward(enemy.pos, target, enemy.speed * dt);
    return;
  }

  if (distance(player.pos, enemy.pos) < def.ai.aggroRadius) {
    enemy.pos = moveToward(enemy.pos, player.pos, enemy.speed * dt);
  } else if (distance(enemy.pos, enemy.home) > 4) {
    enemy.pos = moveToward(
      enemy.pos,
      enemy.home,
      enemy.speed * (def.ai.returnSpeedFactor ?? 0.5) * dt,
    );
  }
}

function stepItems(state: GameState): void {
  const player = state.player;
  state.items = state.items.filter((item) => {
    const overlapping =
      distance(item.pos, player.pos) <= MEDKIT.radius + PLAYER.radius;
    if (!overlapping) return true;

    if (item.kind === "medkit") {
      player.hp = Math.min(player.maxHp, player.hp + MEDKIT.heal);
      state.stats.itemsCollected++;
      state.events.push({ type: "itemCollected", kind: "medkit" });
      return false;
    }

    // Equipment goes into the bag; with a full bag it stays on the ground.
    if (!addToInventory(state, item.equipment)) return true;
    state.stats.itemsCollected++;
    state.events.push({
      type: "itemCollected",
      kind: "equipment",
      tier: item.equipment.tier,
    });
    return false;
  });
}
