// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Obstacle geometry: the collision push-out, the spawn-overlap test, and the
// swept line-of-sight/shot query the simulation runs against solid features.
// A round obstacle collides as its `radius`; a rock carries a rectangular
// `half` footprint and collides as that box. Extracted from step.ts so the
// step stays readable and the nuke and level generator can share one source of
// truth for "is this blocked?".

import {
  closestPointOnRect,
  direction,
  distance,
  distanceSq,
  pointRectDistanceSq,
  segmentDistanceSq,
  segmentIntersectsRect,
  type Vec2,
} from "@game/lib/vec.ts";
import { OBSTACLES } from "./config.ts";
import type { GameState } from "./types.ts";

/**
 * Push a circular body out of every obstacle it overlaps. A body at height
 * `z` above OBSTACLES.clearHeight sails over jumpable obstacles; nothing
 * clears the tall ones. Monsters never leave the ground, so every obstacle
 * blocks them.
 */
export function resolveObstacles(
  state: GameState,
  pos: Vec2,
  radius: number,
  z = 0,
): void {
  for (const obstacle of state.obstacles) {
    if (obstacle.jumpable && z > OBSTACLES.clearHeight) continue;
    if (obstacle.half) {
      resolveRect(pos, radius, obstacle.pos, obstacle.half);
      continue;
    }
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

/** Push a circular body of `radius` out of the axis-aligned box (`center`,
 * `half`) along the shortest escape. */
function resolveRect(
  pos: Vec2,
  radius: number,
  center: Vec2,
  half: Vec2,
): void {
  const q = closestPointOnRect(pos, center, half);
  if (q.x !== pos.x || q.y !== pos.y) {
    // Center sits outside the box: push out along the vector to the closest
    // point until the circle just clears it.
    const dx = pos.x - q.x;
    const dy = pos.y - q.y;
    const d = Math.hypot(dx, dy);
    if (d >= radius || d === 0) return;
    pos.x = q.x + (dx / d) * radius;
    pos.y = q.y + (dy / d) * radius;
    return;
  }
  // Center is inside the box: eject along the axis of least penetration.
  const dx = pos.x - center.x;
  const dy = pos.y - center.y;
  const penX = half.x - Math.abs(dx);
  const penY = half.y - Math.abs(dy);
  if (penX <= penY) {
    pos.x = center.x + (dx < 0 ? -1 : 1) * (half.x + radius);
  } else {
    pos.y = center.y + (dy < 0 ? -1 : 1) * (half.y + radius);
  }
}

/** Is a circle at `pos` overlapping any obstacle (spawn placement check)? */
export function insideObstacle(
  state: GameState,
  pos: Vec2,
  radius: number,
): boolean {
  for (const obstacle of state.obstacles) {
    if (obstacle.half) {
      if (
        pointRectDistanceSq(pos, obstacle.pos, obstacle.half) <
        radius * radius
      ) {
        return true;
      }
      continue;
    }
    const min = obstacle.radius + radius;
    if (distanceSq(pos, obstacle.pos) < min * min) return true;
  }
  return false;
}

/**
 * Does a straight shot from `from` to `to` clear every TALL obstacle? Walls,
 * server racks, boulders, and rocks eat bullets; the low, jumpable ones
 * (desks, hop-rocks, craters) never block — shots fly over them just like a
 * jumping player.
 */
export function lineOfSight(state: GameState, from: Vec2, to: Vec2): boolean {
  return !blockedByObstacle(state, from, to, 0);
}

/** Does the swept path `from`→`to` (a circle of `radius`) hit a tall
 * obstacle? */
export function blockedByObstacle(
  state: GameState,
  from: Vec2,
  to: Vec2,
  radius: number,
): boolean {
  for (const obstacle of state.obstacles) {
    if (obstacle.jumpable) continue;
    if (obstacle.half) {
      // The swept circle vs the box: inflate the box by the radius (rounded
      // corners squared off — a hair conservative there, which only ever
      // stops a shot a touch early).
      const inflated = {
        x: obstacle.half.x + radius,
        y: obstacle.half.y + radius,
      };
      if (segmentIntersectsRect(from, to, obstacle.pos, inflated)) return true;
      continue;
    }
    const min = obstacle.radius + radius;
    if (segmentDistanceSq(from, to, obstacle.pos) < min * min) return true;
  }
  return false;
}

/** Half-extents that bound a rock footprint of `w`×`h` cells at `cell` px. */
export function rockHalf(w: number, h: number, cell: number): Vec2 {
  return { x: (w * cell) / 2, y: (h * cell) / 2 };
}

/** Bounding (circumscribed) radius of a rectangular footprint — the coarse
 * cull/spacing radius stored on the obstacle. */
export function boundingRadius(half: Vec2): number {
  return Math.hypot(half.x, half.y);
}
