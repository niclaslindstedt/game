// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The INTENDED PATH (`LevelDef.path`): an authored polyline of waypoints from
// the spawn toward the objective, threaded through the level's corridors. It is
// a pure navigation aid — it changes no simulation rule — but two systems lean
// on it: the autopilot (`bot.ts`) steers toward the current waypoint so a
// no-pathfinding runner rounds walls instead of wedging on them, and the app
// draws a "go this way" arrow toward it. Progress lives on `state.pathIndex`,
// advanced here each step as the hero reaches each node; both readers share it,
// so they never disagree. All queries no-op when the level authors no path.

import { distanceSq } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import { PATH } from "./config.ts";
import { levelDef } from "./defs/levels/index.ts";
import type { GameState } from "./types.ts";

/** The level's authored waypoints, or undefined when it declares no path. */
function pathOf(state: GameState): readonly Vec2[] | undefined {
  const path = levelDef(state.level.id).path;
  return path && path.length > 0 ? path : undefined;
}

/**
 * Advance `state.pathIndex` past every waypoint the hero has now reached
 * (within `PATH.reachRadius`), leaving it on the next unreached node — the one
 * he still has to walk to. Monotonic: it never rewinds, so being shoved back by
 * the horde keeps the same target rather than re-walking the route. A no-op on
 * a level with no path or once the last node is passed. Called once per step.
 */
export function advancePath(state: GameState): void {
  const path = pathOf(state);
  if (!path) return;
  const reachSq = PATH.reachRadius * PATH.reachRadius;
  const pos = state.player.pos;
  while (state.pathIndex < path.length) {
    const cur = path[state.pathIndex]!;
    // Reached the node → retire it.
    if (distanceSq(pos, cur) <= reachSq) {
      state.pathIndex++;
      continue;
    }
    // OVERSHOT it: he's now nearer the NEXT node than this node is — he's rounded
    // the corner without passing through the reach ring (a wide gap, or a shove).
    // Retire it anyway, so string-pulling past a waypoint never strands progress.
    const next = path[state.pathIndex + 1];
    if (next && distanceSq(pos, next) < distanceSq(cur, next)) {
      state.pathIndex++;
      continue;
    }
    break;
  }
}

/**
 * The waypoint the hero is currently steering toward — the next unreached node
 * on the intended path — or `null` when the level has no path or the hero has
 * walked the whole thing (from there, callers fall back to the raw objective).
 */
export function nextPathWaypoint(state: GameState): Vec2 | null {
  const path = pathOf(state);
  if (!path || state.pathIndex >= path.length) return null;
  return path[state.pathIndex]!;
}

/**
 * True once the hero has walked a level's WHOLE intended path — every waypoint
 * retired — which by construction lands him at the objective. The autopilot
 * reads it to COMMIT to the boss there (fight it down rather than kite its adds
 * forever). False on a level that authors no path, so it never changes the
 * open-map behavior.
 */
export function pathWalked(state: GameState): boolean {
  const path = pathOf(state);
  return path !== undefined && state.pathIndex >= path.length;
}

/** Whether the level authors an intended path at all — the gate that keeps the
 * path-aware autopilot behavior (boss-commit, retreat bias) off open maps. */
export function onPathLevel(state: GameState): boolean {
  return pathOf(state) !== undefined;
}
