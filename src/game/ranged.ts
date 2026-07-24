// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ranged enemies: shooters (`EnemyDef.ranged`) that fire hostile projectiles
// at the player, and the hide-and-peek cover dance the `takesCover` ones play
// between shots. Movement is decided here (called from moveEnemy in step/);
// firing runs as its own pass after the horde has moved (stepRangedAttacks);
// the shots themselves ride the ordinary projectile pass flagged `hostile`
// and resolve against the player in resolveHostileHit (called from
// stepProjectiles). Shared choreography numbers live in config ENEMY_RANGED.

import { direction, distance, moveToward, type Vec2 } from "@game/lib/vec.ts";
import { ENEMY_RANGED, JUMP, PLAYER } from "./config/index.ts";
import { difficultyDef } from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import {
  absorbPlayerDamage,
  armorReduction,
  playerDodgeChance,
  wearWornArmor,
} from "./items/index.ts";
import { queueStruckProcs } from "./loot.ts";
import { lineOfSight } from "./obstacles.ts";
import { BALANCE } from "./tuning.ts";
import { createProjectile } from "./projectile.ts";
import type { Enemy, GameState, Projectile } from "./types/index.ts";

/**
 * Move one awake SHOOTER for this tick. Two moods, split by the reload:
 * with the shot nearly ready (inside `peekWindowMs`) it works for the kill —
 * closes to its hold range and steps sideways out of cover until it can see
 * the player; freshly fired (`takesCover` only) it scrambles to put the
 * nearest solid obstacle between itself and the player. A shooter without
 * `takesCover` simply holds its distance like a gunslinger on main street.
 * Returns having fully handled the enemy's movement.
 */
export function moveRangedEnemy(
  state: GameState,
  enemy: Enemy,
  speed: number,
  dt: number,
): void {
  const def = enemyDef(enemy.defId);
  const ranged = def.ranged;
  if (!ranged) return;
  const player = state.player;
  const hold = ranged.range * ENEMY_RANGED.holdRangeFraction;
  const dist = distance(enemy.pos, player.pos);
  const reloading =
    (enemy.rangedCooldownMs ?? 0) > ENEMY_RANGED.peekWindowMs &&
    ranged.takesCover === true;

  if (reloading) {
    // The hide: dive for the far side of the nearest solid rock. With no
    // cover in reach, just back off toward the hold range instead.
    const cover = coverPoint(state, enemy);
    if (cover) {
      enemy.pos = moveToward(enemy.pos, cover, speed * dt);
      return;
    }
    if (dist < hold) {
      const away = direction(player.pos, enemy.pos);
      enemy.pos.x += away.x * speed * dt;
      enemy.pos.y += away.y * speed * dt;
    }
    return;
  }

  // The peek: get the player in range and in sight, then stand and shoot.
  if (dist > ranged.range || dist > hold) {
    enemy.pos = moveToward(enemy.pos, player.pos, speed * dt);
    return;
  }
  if (!lineOfSight(state, enemy.pos, player.pos)) {
    // Blocked at holding distance: sidestep along the circle around the
    // player until the rock is out of the firing line. Constant direction
    // (clockwise) so the step never oscillates.
    const toEnemy = direction(player.pos, enemy.pos);
    const side = { x: -toEnemy.y, y: toEnemy.x };
    enemy.pos.x += side.x * speed * dt;
    enemy.pos.y += side.y * speed * dt;
    return;
  }
  if (dist < hold * 0.6) {
    // Too close for comfort: a shooter is not a brawler, back up a step.
    const away = direction(player.pos, enemy.pos);
    enemy.pos.x += away.x * speed * dt;
    enemy.pos.y += away.y * speed * dt;
  }
}

/**
 * The far side of the nearest solid (non-jumpable) obstacle within
 * `coverSearchRadius`: the spot where the rock sits between shooter and
 * player. Null when nothing solid is in reach.
 */
function coverPoint(state: GameState, enemy: Enemy): Vec2 | null {
  const def = enemyDef(enemy.defId);
  const player = state.player;
  let best: { pos: Vec2; radius: number } | null = null;
  let bestDist: number = ENEMY_RANGED.coverSearchRadius;
  for (const obstacle of state.obstacles) {
    if (obstacle.jumpable) continue;
    const d = distance(obstacle.pos, enemy.pos);
    if (d >= bestDist) continue;
    best = { pos: obstacle.pos, radius: obstacle.radius };
    bestDist = d;
  }
  if (!best) return null;
  const away = direction(player.pos, best.pos);
  const standOff = best.radius + def.radius + ENEMY_RANGED.coverGap;
  return {
    x: best.pos.x + away.x * standOff,
    y: best.pos.y + away.y * standOff,
  };
}

/**
 * The firing pass, run after the horde has moved (so aim is judged on this
 * tick's final positions): every awake shooter whose reload has run down,
 * whose target is in range and in sight, pulls the trigger — a hostile
 * projectile aimed at the player, riding the ordinary projectile pass.
 * The reload clock ticks here for every shooter, hidden or not.
 */
export function stepRangedAttacks(state: GameState, dtMs: number): void {
  const player = state.player;
  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
    const ranged = def.ranged;
    if (!ranged) continue;
    enemy.rangedCooldownMs = Math.max(0, (enemy.rangedCooldownMs ?? 0) - dtMs);
    if (enemy.rangedCooldownMs > 0) continue;
    // Sleeping shooters hold their fire: elites wake by the ordinary ambush
    // rules, bosses are judged awake by proximity or a wound (moveEnemy).
    if (def.role === "elite" && !enemy.awake) continue;
    if (
      def.role === "boss" &&
      enemy.hp >= enemy.maxHp &&
      distance(player.pos, enemy.home) >= def.ai.aggroRadius &&
      distance(player.pos, enemy.pos) >= def.ai.aggroRadius
    ) {
      continue;
    }
    const dist = distance(enemy.pos, player.pos);
    if (dist > ranged.range) continue;
    if (!lineOfSight(state, enemy.pos, player.pos)) continue;
    enemy.rangedCooldownMs = ranged.cooldownMs;
    // TARGET LEADING (the hard rungs' smarter shooters): aim ahead of a
    // running hero by the shot's time-of-flight — half the firing solution
    // from hard, the full one from nightmare (config ENEMY_RANGED.lead*). A
    // standing hero's vel is zero, so he is aimed at dead-on on every rung.
    const index = difficultyDef(state.difficulty).index;
    const lead =
      index >= ENEMY_RANGED.leadFullFromIndex
        ? 1
        : index >= ENEMY_RANGED.leadFromIndex
          ? ENEMY_RANGED.leadFactor
          : 0;
    const flight = dist / ranged.projectile.speed;
    const aim = {
      x: player.pos.x + player.vel.x * flight * lead,
      y: player.pos.y + player.vel.y * flight * lead,
    };
    const dir = direction(enemy.pos, aim);
    const spec = ranged.projectile;
    const shot = createProjectile({
      id: state.nextId++,
      pos: { ...enemy.pos },
      dir,
      speed: spec.speed,
      radius: spec.radius,
      damage: ranged.damage,
      lifetimeMs: spec.lifetimeMs,
      // Hostile shots aren't a weapon class; "ranged" only picks a fallback
      // sprite/sound family in the app.
      weaponClass: "ranged",
      sprite: spec.sprite,
      hostile: true,
      sourceMlvl: enemy.mlvl,
      sourceDefId: enemy.defId,
      z: 0,
    });
    state.projectiles.push(shot);
    state.events.push({
      type: "enemyShot",
      pos: { ...enemy.pos },
      dir,
      defId: enemy.defId,
    });
  }
}

/**
 * Resolve a hostile projectile against the PLAYER for this tick. Returns
 * true when the shot is spent (it connected) — the caller drops it. A
 * jumping hero sails over the shot exactly like he clears enemy contact;
 * a grounded one may still DODGE it (DEXTERITY), and worn armor turns its
 * share against the shooter's level, wearing a point like any landed blow.
 */
export function resolveHostileHit(
  state: GameState,
  projectile: Projectile,
): boolean {
  const player = state.player;
  if (player.z > JUMP.dodgeHeight) return false;
  const reach = projectile.radius + PLAYER.radius;
  const dx = player.pos.x - projectile.pos.x;
  const dy = player.pos.y - projectile.pos.y;
  if (dx * dx + dy * dy > reach * reach) return false;
  if (state.rng() < playerDodgeChance(state)) {
    state.events.push({ type: "playerDodge", pos: { ...player.pos } });
    return true;
  }
  // Same developer mob-damage knob the contact path applies (step/), so
  // hostile shots and blows scale as one.
  const damage = Math.round(projectile.damage * BALANCE.mobDamage);
  const hpDamage = Math.max(
    0,
    Math.round(
      damage * (1 - armorReduction(state, projectile.sourceMlvl ?? 1)),
    ),
  );
  wearWornArmor(state);
  player.hp -= absorbPlayerDamage(state, hpDamage);
  player.hurtFlashMs = 250;
  state.stats.damageTaken += damage;
  state.events.push({
    type: "playerHurt",
    crit: false,
    cause: projectile.sourceDefId,
  });
  // The shot that lands may cast back (the D2 "when struck" procs). The
  // shooter isn't tracked on the projectile, so a bolt grounds in the
  // nearest foe to the hero instead.
  queueStruckProcs(state);
  return true;
}
