// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Obstacle geometry: the collision push-out, the spawn-overlap test, and the
// swept line-of-sight/shot query the simulation runs against solid features.
// A round obstacle collides as its `radius`; a rock carries a rectangular
// `half` footprint and collides as that box. Extracted from step.ts so the
// step stays readable and the nuke and level generator can share one source of
// truth for "is this blocked?".

import {
  clamp,
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
import type { GameState, Obstacle } from "./types.ts";

// ---- Spatial index --------------------------------------------------------
// Levels carry hundreds of obstacles and the queries below run per enemy (or
// per projectile) per tick, so a linear scan is O(enemies × obstacles) — the
// tick's hotspot at horde scale. The grid maps each cell to the obstacles
// whose footprint, inflated by MAX_QUERY_RADIUS, overlaps it: any query with
// radius ≤ MAX_QUERY_RADIUS then only reads the cells it touches. Obstacles
// never move; the cache keys on the array's identity, and every mutation in
// the codebase REPLACES the array (doors filter it), which invalidates the
// grid for free. Mutate-in-place would go stale — replace instead.

const GRID_CELL = 64;
/** Largest collision radius a query may pass (the biggest boss is 20). */
const MAX_QUERY_RADIUS = 32;

type ObstacleGrid = Map<number, Obstacle[]>;
const gridCache = new WeakMap<Obstacle[], ObstacleGrid>();

/** Cell key — level widths stay far below 2¹⁶ cells, so this never collides
 * (same scheme as the enemy grids in step.ts). */
function cellKey(cx: number, cy: number): number {
  return cx * 65536 + cy;
}

function gridFor(obstacles: Obstacle[]): ObstacleGrid {
  let grid = gridCache.get(obstacles);
  if (grid) return grid;
  grid = new Map();
  for (const obstacle of obstacles) {
    const hx = (obstacle.half?.x ?? obstacle.radius) + MAX_QUERY_RADIUS;
    const hy = (obstacle.half?.y ?? obstacle.radius) + MAX_QUERY_RADIUS;
    const x0 = Math.floor((obstacle.pos.x - hx) / GRID_CELL);
    const x1 = Math.floor((obstacle.pos.x + hx) / GRID_CELL);
    const y0 = Math.floor((obstacle.pos.y - hy) / GRID_CELL);
    const y1 = Math.floor((obstacle.pos.y + hy) / GRID_CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = cellKey(cx, cy);
        const bucket = grid.get(key);
        if (bucket) bucket.push(obstacle);
        else grid.set(key, [obstacle]);
      }
    }
  }
  gridCache.set(obstacles, grid);
  return grid;
}

/** The obstacles that can matter to a point query at `pos` (radius ≤
 * MAX_QUERY_RADIUS): the one cell containing it. */
function bucketAt(state: GameState, pos: Vec2): Obstacle[] | undefined {
  return gridFor(state.obstacles).get(
    cellKey(Math.floor(pos.x / GRID_CELL), Math.floor(pos.y / GRID_CELL)),
  );
}

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
  const bucket = bucketAt(state, pos);
  if (!bucket) return;
  for (const obstacle of bucket) {
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
  const bucket = bucketAt(state, pos);
  if (!bucket) return false;
  for (const obstacle of bucket) {
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
  // Sweep the cells the segment's bounding box overlaps. An obstacle can sit
  // in several of them and get re-tested — harmless for a boolean query, and
  // line-of-sight spans stay a handful of cells.
  const grid = gridFor(state.obstacles);
  const x0 = Math.floor(Math.min(from.x, to.x) / GRID_CELL);
  const x1 = Math.floor(Math.max(from.x, to.x) / GRID_CELL);
  const y0 = Math.floor(Math.min(from.y, to.y) / GRID_CELL);
  const y1 = Math.floor(Math.max(from.y, to.y) / GRID_CELL);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const bucket = grid.get(cellKey(cx, cy));
      if (!bucket) continue;
      for (const obstacle of bucket) {
        if (obstacle.jumpable) continue;
        if (obstacle.half) {
          // The swept circle vs the box: inflate the box by the radius
          // (rounded corners squared off — a hair conservative there, which
          // only ever stops a shot a touch early).
          const inflated = {
            x: obstacle.half.x + radius,
            y: obstacle.half.y + radius,
          };
          if (segmentIntersectsRect(from, to, obstacle.pos, inflated)) {
            return true;
          }
          continue;
        }
        const min = obstacle.radius + radius;
        if (segmentDistanceSq(from, to, obstacle.pos) < min * min) return true;
      }
    }
  }
  return false;
}

// ---- The wall-end sense ---------------------------------------------------
// "CAN I SEE WHERE THIS OBSTACLE ENDS?" — the query a walker asks at a wall.
// When the straight sweep to a goal is blocked, a human doesn't press into the
// stone: they look along it, spot where it visibly ends, and walk for that
// end. This is that look, as a pure geometric scan: rotate candidate bearings
// off the blocked one (both ways, nearest-first) and return the first bearing
// whose body-width sweep runs open for the whole sight distance — the wall's
// visible end on that side. Pure state + arguments, no RNG: safe for the
// deterministic autopilot, and cheap (it only runs when a sweep is blocked).

/** Angular step of the wall-end scan (radians): fine enough that a modest
 * detour angle is found near-minimal, coarse enough to keep the scan to a
 * couple dozen sweeps. */
const WALL_END_STEP = Math.PI / 16;
/** How far the scan rotates per side: 12 steps ≈ 135°, so a wall pocket whose
 * mouth sits behind the walker's shoulder is still found, while a fully
 * enclosing pocket returns null (no visible end — the caller must escalate). */
const WALL_END_MAX_STEPS = 12;
/** Margin (world px) sight points keep from the level edge, mirroring the
 * steering clamp — a "wall end" outside the play field is no end at all. */
const WALL_END_EDGE = 20;

/** A visible obstacle end: a standable point past the blocker's silhouette. */
export type ObstacleEnd = {
  /** The open point at `sight` distance along the clear bearing — steer here
   * to round the wall's end. */
  point: Vec2;
  /** Which way the detour rotates off the straight bearing: +1 = clockwise
   * (canvas +angle), -1 = counter-clockwise. */
  side: 1 | -1;
  /** How far (radians) the detour bearing turns off the straight bearing —
   * small means the wall visibly ends close to the line of travel. */
  turn: number;
};

/**
 * Where does the obstacle blocking `from`→`goal` visibly END, within `sight`
 * world px (a body of `radius`)? Returns the end whose bearing turns the
 * least off the goal line (ties broken toward the goal), or null when the
 * sweep is not blocked at all (no wall to end) or no bearing within the scan
 * fan clears (walled in past the sight radius — the caller must escalate).
 * `preferSide` pins the scan to one side while that side still has a visible
 * end — the hysteresis a caller uses to trace a long wall consistently
 * instead of flip-flopping between its two ends.
 */
export function visibleObstacleEnd(
  state: GameState,
  from: Vec2,
  goal: Vec2,
  radius: number,
  sight: number,
  preferSide: 1 | -1 | 0 = 0,
): ObstacleEnd | null {
  if (!blockedByObstacle(state, from, goal, radius)) return null;
  const base = Math.atan2(goal.y - from.y, goal.x - from.x);
  const endAt = (side: 1 | -1): ObstacleEnd | null => {
    for (let k = 1; k <= WALL_END_MAX_STEPS; k++) {
      const a = base + side * k * WALL_END_STEP;
      const p = {
        x: clamp(
          from.x + Math.cos(a) * sight,
          WALL_END_EDGE,
          state.level.width - WALL_END_EDGE,
        ),
        y: clamp(
          from.y + Math.sin(a) * sight,
          WALL_END_EDGE,
          state.level.height - WALL_END_EDGE,
        ),
      };
      if (insideObstacle(state, p, radius)) continue;
      if (blockedByObstacle(state, from, p, radius)) continue;
      return { point: p, side, turn: k * WALL_END_STEP };
    }
    return null;
  };
  // A caller tracing a wall holds its committed side while that side still
  // shows an end — switching sides mid-trace is the oscillation this exists
  // to kill.
  if (preferSide !== 0) {
    const held = endAt(preferSide);
    if (held) return held;
  }
  const cw = endAt(1);
  const ccw = endAt(-1);
  if (!cw || !ccw) return cw ?? ccw;
  if (cw.turn !== ccw.turn) return cw.turn < ccw.turn ? cw : ccw;
  return distanceSq(cw.point, goal) <= distanceSq(ccw.point, goal) ? cw : ccw;
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
