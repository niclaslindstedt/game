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
// The grid's occupied cell bounds — the stop line for the expanding-ring
// nearest search (hitGridNearest) once every occupied cell is behind it.
let hitGridMinX = 0;
let hitGridMaxX = 0;
let hitGridMinY = 0;
let hitGridMaxY = 0;
// Bucket arrays recycled across ticks: the grid is rebuilt every tick that has
// projectiles in flight, and minting a fresh array per occupied cell at 60Hz
// is measurable GC pressure at horde scale.
const bucketPool: Enemy[][] = [];

function buildHitGrid(state: GameState): void {
  for (const bucket of hitGrid.values()) {
    bucket.length = 0;
    bucketPool.push(bucket);
  }
  hitGrid.clear();
  hitGridMaxRadius = 0;
  hitGridMinX = Infinity;
  hitGridMaxX = -Infinity;
  hitGridMinY = Infinity;
  hitGridMaxY = -Infinity;
  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
    // Apparitions can't be hit — leaving them out makes every query skip-free.
    if (def.apparition) continue;
    if (def.radius > hitGridMaxRadius) hitGridMaxRadius = def.radius;
    const cx = Math.floor(enemy.pos.x / HIT_CELL);
    const cy = Math.floor(enemy.pos.y / HIT_CELL);
    if (cx < hitGridMinX) hitGridMinX = cx;
    if (cx > hitGridMaxX) hitGridMaxX = cx;
    if (cy < hitGridMinY) hitGridMinY = cy;
    if (cy > hitGridMaxY) hitGridMaxY = cy;
    // Same collision-free key as the separation grid: positions are clamped
    // to the level, so cell columns stay well under 2¹⁶.
    const key = cx * 65536 + cy;
    const bucket = hitGrid.get(key);
    if (bucket) bucket.push(enemy);
    else {
      const fresh = bucketPool.pop() ?? [];
      fresh.push(enemy);
      hitGrid.set(key, fresh);
    }
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
      steerProjectile(projectile, dt);
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

/**
 * The nearest live foe to `pos` (by center distance), skipping ids in `skip` —
 * an expanding-ring sweep over the shared hit grid, so a homing volley over a
 * big horde stops paying O(projectiles × horde) full scans per tick. Ring r's
 * cells all lie at least (r−1)·HIT_CELL away, so the sweep stops as soon as
 * the best find can't be beaten by anything further out (or the rings have
 * passed every occupied cell).
 */
function hitGridNearest(pos: Vec2, skip: number[] | undefined) {
  if (hitGrid.size === 0) return undefined;
  const kx = Math.floor(pos.x / HIT_CELL);
  const ky = Math.floor(pos.y / HIT_CELL);
  let best: Enemy | undefined;
  let bestDistSq = Infinity;
  const scanCell = (cx: number, cy: number): void => {
    const bucket = hitGrid.get(cx * 65536 + cy);
    if (!bucket) return;
    for (const enemy of bucket) {
      if (enemy.hp <= 0) continue; // slain this tick — stale bucket entry
      if (skip?.includes(enemy.id)) continue;
      const dSq = distanceSq(enemy.pos, pos);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = enemy;
      }
    }
  };
  const maxRing = Math.max(
    Math.abs(kx - hitGridMinX),
    Math.abs(kx - hitGridMaxX),
    Math.abs(ky - hitGridMinY),
    Math.abs(ky - hitGridMaxY),
  );
  scanCell(kx, ky);
  for (let r = 1; r <= maxRing; r++) {
    // Everything in this ring or beyond is at least this far away — if the
    // best find already beats that, no further ring can improve on it.
    const floor = (r - 1) * HIT_CELL;
    if (bestDistSq <= floor * floor) break;
    for (let cx = kx - r; cx <= kx + r; cx++) {
      scanCell(cx, ky - r);
      scanCell(cx, ky + r);
    }
    for (let cy = ky - r + 1; cy <= ky + r - 1; cy++) {
      scanCell(kx - r, cy);
      scanCell(kx + r, cy);
    }
  }
  return best;
}

/** Curve a homing projectile toward the nearest living, un-pierced foe: the
 * heading turns at most `homing` radians/s toward the bearing. */
function steerProjectile(projectile: Projectile, dt: number): void {
  const best = hitGridNearest(projectile.pos, projectile.hitIds);
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
  // Candidates come off the shared hit grid (cells within the chain range)
  // instead of filtering the whole horde per grounded bolt — the grid already
  // excludes apparitions, and stale slain entries are skipped by hp.
  const candidates: Enemy[] = [];
  const reach = Math.ceil(WEAPON.chainRange / HIT_CELL);
  const kx = Math.floor(hit.pos.x / HIT_CELL);
  const ky = Math.floor(hit.pos.y / HIT_CELL);
  for (let cx = kx - reach; cx <= kx + reach; cx++) {
    for (let cy = ky - reach; cy <= ky + reach; cy++) {
      const bucket = hitGrid.get(cx * 65536 + cy);
      if (!bucket) continue;
      for (const enemy of bucket) {
        if (enemy === hit || enemy.hp <= 0) continue;
        if (projectile.hitIds?.includes(enemy.id)) continue;
        if (distanceSq(enemy.pos, hit.pos) > rangeSq) continue;
        candidates.push(enemy);
      }
    }
  }
  const targets = candidates
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
