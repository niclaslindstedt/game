// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Projectile flight and impact: the shared spatial hit grid, homing steer,
// pierce, and chain lightning. Part of the step pipeline (see ./index.ts).

import { direction, distanceSq, type Vec2 } from "@game/lib/vec.ts";
import { maybeCompanionQuote } from "../companions.ts";
import { PROJECTILE, WEAPON } from "../config/index.ts";
import { crateHitByCircle, damageCrate } from "../crates.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { hitEnemy } from "../loot.ts";
import { blockedByObstacle } from "../obstacles.ts";
import { resolveHostileHit } from "../ranged.ts";
import type { Enemy, GameState, Projectile } from "../types/index.ts";

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

export function stepProjectiles(
  state: GameState,
  dt: number,
  dtMs: number,
): void {
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
      // shots only — companion shots carry no volley). The volley doubles as
      // the menace ATTACK id: a spread's pellets share it, so a shotgun blast
      // is judged once per trigger pull, not once per pellet (bankOverkill).
      volley: projectile.volley,
      attack: projectile.volley,
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
        // the volley's distinct-target reach, and menace judges the whole
        // chain as the one trigger pull it came from.
        volley: projectile.volley,
        attack: projectile.volley,
      },
    );
  }
}
