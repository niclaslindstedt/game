// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The DORMANT "AT WORK" stroll (`EnemyDef.ai.idle === "work"`, tuning
// `ENEMY_AI.work`): a mob that is asleep at its post potters around its `home`
// instead of standing frozen — walk a short leg, stand a beat at the bench,
// walk again — so a staffed venue (the GOODCO assembly floor) reads as people
// working the place, not statues waiting for a fight. Called from `moveEnemy`
// (step/) ONLY on dormant ticks: waking (aggro radius + line of sight,
// wounds) and the woken fight are exactly as before, and a mob whose chase
// breaks strolls back toward its patch at work pace instead of beelining.
//
// Determinism: each stroller draws from its OWN parked rng stream
// (`Enemy.workRng`, the merchant-wander pattern) lazily seeded from its id —
// so the shuffle never touches the run's shared stream (staged tests and
// replays stay byte-stable) and a serialized run resumes the exact stroll.

import { createRngFromState, rngState } from "@game/lib/rng.ts";
import { clamp, distance, moveToward, type Vec2 } from "@game/lib/vec.ts";

import { ENEMY_AI } from "./config/index.ts";
import type { Enemy, GameState } from "./types/index.ts";

/** One draw off the mob's private work stream: rebuild the generator at its
 * parked state, pull a float, park the advanced state back. Lazily seeded
 * from the mob's id on the first draw. */
function draw(enemy: Enemy): number {
  const rng = createRngFromState(enemy.workRng ?? enemy.id ^ 0x9e3779b9);
  const value = rng();
  enemy.workRng = rngState(rng);
  return value;
}

/**
 * Advance one dormant tick of the stroll: stand out the current pause, or
 * walk the current leg, or roll a new leg near `home`. `speed` is the mob's
 * live speed with the field effects (stasis, chill) already folded in;
 * `radius` its body radius (level-edge margin). A leg that terrain refuses
 * (wedged on a jig, a wall) simply times out and re-rolls — obstacle push-out
 * runs in the shared pass after all movement, like every other mob.
 */
export function strollAtWork(
  state: GameState,
  enemy: Enemy,
  radius: number,
  speed: number,
  dt: number,
): void {
  const W = ENEMY_AI.work;
  const dtMs = dt * 1000;
  if (enemy.workPauseMs !== undefined && enemy.workPauseMs > 0) {
    enemy.workPauseMs = Math.max(0, enemy.workPauseMs - dtMs);
    return;
  }
  const pace = Math.max(1, speed * W.speedFactor);
  if (!enemy.workTarget) {
    const angle = draw(enemy) * Math.PI * 2;
    const reach = W.range[0] + draw(enemy) * (W.range[1] - W.range[0]);
    const margin = radius + 4;
    // Legs radiate from HOME (not the current spot), so a mob chased off its
    // patch drifts back to work instead of wandering ever further afield.
    enemy.workTarget = {
      x: clamp(
        enemy.home.x + Math.cos(angle) * reach,
        margin,
        state.level.width - margin,
      ),
      y: clamp(
        enemy.home.y + Math.sin(angle) * reach,
        margin,
        state.level.height - margin,
      ),
    };
    enemy.workLegMs =
      (distance(enemy.pos, enemy.workTarget) / pace) * 1000 * W.legSlackMult;
  }
  const target = enemy.workTarget;
  enemy.pos = moveToward(enemy.pos, target, pace * dt);
  enemy.workLegMs = (enemy.workLegMs ?? 0) - dtMs;
  if (distance(enemy.pos, target) < 2 || enemy.workLegMs <= 0) {
    enemy.workTarget = undefined;
    enemy.workPauseMs = W.idleMs[0] + draw(enemy) * (W.idleMs[1] - W.idleMs[0]);
  }
}

/**
 * Advance one dormant tick of a ROAM (`EnemyDef.ai.idle === "roam"`, tuning
 * `ENEMY_AI.roam`): the stroll above at the scale of the WHOLE MAP — a long
 * leg to anywhere on the floor, a pause, another one — so the body genuinely
 * crosses the venue instead of orbiting a patch of it.
 *
 * The difference from `strollAtWork` is entirely in where the leg is aimed:
 * from the mob's CURRENT position out to an absolute spot on the level, rather
 * than a short hop radiating from `home`. That is what a quest means when it
 * asks for somebody who has to be FOUND — his pin on the minimap records where
 * he was seen, and by the time the hero walks back he is a district away.
 *
 * Same private stream, same wedge handling: a leg terrain refuses simply times
 * out and re-rolls, and the shared obstacle push-out runs after all movement.
 */
export function roamTheMap(
  state: GameState,
  enemy: Enemy,
  radius: number,
  speed: number,
  dt: number,
): void {
  const R = ENEMY_AI.roam;
  const dtMs = dt * 1000;
  if (enemy.workPauseMs !== undefined && enemy.workPauseMs > 0) {
    enemy.workPauseMs = Math.max(0, enemy.workPauseMs - dtMs);
    return;
  }
  const pace = Math.max(1, speed * R.speedFactor);
  if (!enemy.workTarget) {
    const margin = radius + 4;
    // Anywhere on the floor, drawn straight rather than as an offset from a
    // home the roamer conceptually does not have. A minimum leg keeps him from
    // rolling a destination he is already standing on and pausing on the spot.
    let target: Vec2 | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = {
        x: clamp(
          draw(enemy) * state.level.width,
          margin,
          state.level.width - margin,
        ),
        y: clamp(
          draw(enemy) * state.level.height,
          margin,
          state.level.height - margin,
        ),
      };
      if (distance(enemy.pos, candidate) >= R.minLeg) {
        target = candidate;
        break;
      }
      target = candidate;
    }
    enemy.workTarget = target as Vec2;
    enemy.workLegMs =
      (distance(enemy.pos, enemy.workTarget) / pace) * 1000 * R.legSlackMult;
  }
  const target = enemy.workTarget;
  enemy.pos = moveToward(enemy.pos, target, pace * dt);
  enemy.workLegMs = (enemy.workLegMs ?? 0) - dtMs;
  if (distance(enemy.pos, target) < 2 || enemy.workLegMs <= 0) {
    enemy.workTarget = undefined;
    enemy.workPauseMs = R.idleMs[0] + draw(enemy) * (R.idleMs[1] - R.idleMs[0]);
  }
}

/**
 * Advance one dormant tick of a PATROL (`Enemy.patrol`, config
 * `ENEMY_AI.patrol`): walk toward the current waypoint at the route pace,
 * ping-pong at the ends, and skip ahead when wedged (no net progress toward
 * the waypoint for `stuckMs` — scattered furniture sits on authored routes,
 * and the shared obstacle push-out runs after all movement, so the walker
 * detects the wedge by its stalled approach instead). Deterministic and
 * rng-free: a patrol never draws a stream.
 */
export function stepPatrol(
  state: GameState,
  enemy: Enemy,
  speed: number,
  dt: number,
): void {
  const route = enemy.patrol;
  if (!route || route.length < 2) return;
  const P = ENEMY_AI.patrol;
  const dtMs = dt * 1000;
  const pace = Math.max(1, speed * P.speedFactor);
  const index = Math.min(enemy.patrolIndex ?? 1, route.length - 1);
  const target = route[index] as Vec2;
  enemy.pos = moveToward(enemy.pos, target, pace * dt);
  const d = distance(enemy.pos, target);
  if (enemy.patrolBestDist === undefined || d < enemy.patrolBestDist - 0.5) {
    enemy.patrolBestDist = d;
    enemy.patrolStuckMs = 0;
  } else {
    enemy.patrolStuckMs = (enemy.patrolStuckMs ?? 0) + dtMs;
  }
  if (d <= P.reach || (enemy.patrolStuckMs ?? 0) >= P.stuckMs) {
    let dir = enemy.patrolDir ?? 1;
    if (index + dir < 0 || index + dir >= route.length) dir = -dir as 1 | -1;
    enemy.patrolDir = dir;
    enemy.patrolIndex = index + dir;
    enemy.patrolBestDist = undefined;
    enemy.patrolStuckMs = 0;
  }
}
