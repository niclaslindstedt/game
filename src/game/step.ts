// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The simulation step. Called with a fixed timestep by the app's game loop;
// mutates the state in place and records what happened in `state.events` so
// the app layer can play sounds and flash effects. Order per step: player
// steering → weapon auto-fire → projectiles → enemies → item pickups →
// win/lose check.

import {
  clamp,
  direction,
  distance,
  distanceSq,
  moveToward,
  type Vec2,
} from "../lib/vec.ts";
import { ENEMY, MEDKIT, PLAYER, WEAPON } from "./config.ts";
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
  } else if (state.enemies.length === 0) {
    state.phase = "victory";
    state.events.push({ type: "victory" });
  }
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

/** The character fights autonomously: fire at the nearest enemy in range. */
function stepWeapon(state: GameState, dtMs: number): void {
  const player = state.player;
  player.weaponCooldownMs = Math.max(0, player.weaponCooldownMs - dtMs);
  if (player.weaponCooldownMs > 0) return;

  const target = nearestEnemy(state.enemies, player.pos, WEAPON.range);
  if (!target) return;

  state.projectiles.push({
    id: state.nextId++,
    pos: { ...player.pos },
    dir: direction(player.pos, target.pos),
    lifetimeMs: WEAPON.projectileLifetimeMs,
  });
  player.weaponCooldownMs = WEAPON.cooldownMs;
  state.stats.shotsFired++;
  state.events.push({ type: "shot" });
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

function stepProjectiles(state: GameState, dt: number, dtMs: number): void {
  const survivors = [];
  for (const projectile of state.projectiles) {
    projectile.pos.x += projectile.dir.x * WEAPON.projectileSpeed * dt;
    projectile.pos.y += projectile.dir.y * WEAPON.projectileSpeed * dt;
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
        ENEMY.radius + WEAPON.projectileRadius,
    );
    if (!hit) {
      survivors.push(projectile);
      continue;
    }

    hit.hp -= WEAPON.damage;
    state.stats.damageDealt += WEAPON.damage;
    if (hit.hp <= 0) {
      state.enemies.splice(state.enemies.indexOf(hit), 1);
      state.stats.kills++;
      state.events.push({ type: "enemyKilled", pos: { ...hit.pos } });
    } else {
      state.events.push({ type: "enemyHit", pos: { ...hit.pos } });
    }
  }
  state.projectiles = survivors;
}

function stepEnemies(state: GameState, dt: number, dtMs: number): void {
  const player = state.player;

  for (const enemy of state.enemies) {
    enemy.contactCooldownMs = Math.max(0, enemy.contactCooldownMs - dtMs);
    enemy.pos = moveToward(enemy.pos, player.pos, enemy.speed * dt);
  }

  // Push overlapping enemies apart so the pack spreads instead of collapsing
  // into a single stacked blob. O(n²) is fine for a handful of enemies.
  for (let i = 0; i < state.enemies.length; i++) {
    for (let j = i + 1; j < state.enemies.length; j++) {
      const a = state.enemies[i];
      const b = state.enemies[j];
      if (!a || !b) continue;
      const d = distance(a.pos, b.pos);
      if (d >= ENEMY.separation || d === 0) continue;
      const push = (ENEMY.separation - d) / 2;
      const dir = direction(a.pos, b.pos);
      a.pos.x -= dir.x * push;
      a.pos.y -= dir.y * push;
      b.pos.x += dir.x * push;
      b.pos.y += dir.y * push;
    }
  }

  for (const enemy of state.enemies) {
    enemy.pos.x = clamp(
      enemy.pos.x,
      ENEMY.radius,
      state.level.width - ENEMY.radius,
    );
    enemy.pos.y = clamp(
      enemy.pos.y,
      ENEMY.radius,
      state.level.height - ENEMY.radius,
    );

    const touching =
      distance(enemy.pos, player.pos) <= ENEMY.radius + PLAYER.radius;
    if (touching && enemy.contactCooldownMs <= 0) {
      player.hp -= ENEMY.contactDamage;
      player.hurtFlashMs = 250;
      enemy.contactCooldownMs = ENEMY.contactCooldownMs;
      state.stats.damageTaken += ENEMY.contactDamage;
      state.events.push({ type: "playerHurt" });
    }
  }
}

function stepItems(state: GameState): void {
  const player = state.player;
  state.items = state.items.filter((item) => {
    const overlapping =
      distance(item.pos, player.pos) <= MEDKIT.radius + PLAYER.radius;
    if (!overlapping) return true;

    player.hp = Math.min(player.maxHp, player.hp + MEDKIT.heal);
    state.stats.itemsCollected++;
    state.events.push({ type: "itemCollected", kind: item.kind });
    return false;
  });
}
