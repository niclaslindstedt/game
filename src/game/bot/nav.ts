// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's MOVEMENT PRIMITIVES: how a decided destination becomes a
// steering input. The local layer (`steer`/`navTarget`/`navSteer`) rounds the
// wall 140px ahead; the global layer (`routeTarget`/`routeSteer` over the
// cached A* route, see pathfind.ts) threads the whole level; `holdOff`/
// `orbitHold` are the weapon-range holds a fight steers with. Pure w.r.t. the
// GameState — the only mutation is the bot's own route/trace memory, so botted
// runs stay deterministic.

import {
  clamp,
  distance,
  rayRectExitDistance,
  segmentDistanceSq,
} from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import { botTuningFor } from "./state.ts";
import type { Bot } from "./state.ts";
import { PLAYER } from "../config/index.ts";
import { onPathLevel } from "../path.ts";
import { buildNavGrid, findPath } from "../pathfind.ts";
import {
  blockedByObstacle,
  insideObstacle,
  visibleObstacleEnd,
} from "../obstacles.ts";
import type { GameInput, GameState } from "../types.ts";

/** Steering input toward a world position (clamped inside the level). */
export function steer(state: GameState, target: Vec2, jump = false): GameInput {
  return {
    steering: true,
    target: {
      x: clamp(target.x, 20, state.level.width - 20),
      y: clamp(target.y, 20, state.level.height - 20),
    },
    jump,
  };
}

/** How far ahead the wall-avoidance probe casts a candidate heading. */
const NAV_LOOKAHEAD = 140;
/** Candidate heading deflections (radians) fanned out from the straight bearing,
 * nearest-to-straight first so the hero deflects as little as the wall demands. */
const NAV_DEFLECTIONS = [
  0,
  0.6,
  -0.6,
  1.15,
  -1.15,
  1.7,
  -1.7,
  2.3,
  -2.3,
  Math.PI,
];

/** The visible world HALF-EXTENTS assumed when no camera rect has been
 * reported (`state.view` absent — headless tests, the sim): the
 * phone-landscape baseline (~844×390 CSS at the app's VIEW_SCALE of 2 →
 * world half-view ≈ 211×97, the same reference the spawn distances are tuned
 * against). */
const FALLBACK_VIEW_HALF = { x: 211, y: 97 };

/** How far the hero can SEE along each bearing — the distance from `from` to
 * the SCREEN edge in that direction: the live camera rect the app stamps into
 * `state.view`, or the phone-landscape baseline centred on him when headless,
 * scaled by {@link BotTuning.wallSightFrac}. The eyes of the wall-end sense
 * ({@link navTarget}): the bot knows exactly what a player watching the
 * screen knows, on every device and orientation. */
function screenSightFrom(
  state: GameState,
  from: Vec2,
  frac: number,
): (angle: number) => number {
  const view = state.view;
  const c = view
    ? { x: view.x + view.width / 2, y: view.y + view.height / 2 }
    : from;
  const half = view
    ? { x: view.width / 2, y: view.height / 2 }
    : FALLBACK_VIEW_HALF;
  return (angle) => rayRectExitDistance(from, angle, c, half) * frac;
}

/**
 * A no-pathfinding runner's LOCAL wall avoidance: turn a raw nav goal into a
 * steering sub-target the hero can actually walk to without wedging on a shelf.
 * If his body can sweep straight to the goal, aim straight; otherwise fan
 * candidate headings out from the direct bearing and pick the openest one that
 * still makes progress — so a shelf between him and the next waypoint gets
 * ROUNDED instead of pressed into. This is what unsticks a hero the horde has
 * shoved off the corridor into a wall pocket (straight-line steering there just
 * grinds him into the wall forever). Used for the TRAVEL goals (path/boss/escape)
 * AND the fight give-ground/drift/hold-off moves, so a retreat under pressure
 * rounds a scattered rock instead of wedging on it. Gated to path levels (an open
 * map's wall-slide handles the odd ridge, and deflecting there only wanders), and
 * falls back to the raw goal when nothing is clear (better to nudge than freeze).
 */
export function navTarget(bot: Bot, state: GameState, goal: Vec2): Vec2 {
  // Wall avoidance is a MAZE tactic — it's for the authored-path levels whose
  // corridors a straight steer would wedge on. On an open map (no path) the
  // engine's wall-slide already carries a straight steer past the odd ridge, and
  // deflecting there only wanders, so keep the old behaviour.
  if (!onPathLevel(state)) return goal;
  const from = state.player.pos;
  const r = PLAYER.radius;
  // A clear body-width sweep straight to the goal → just go (and release any
  // latched wall trace — the wall is behind him).
  if (!blockedByObstacle(state, from, goal, r)) {
    bot.trace = null;
    return goal;
  }
  // THE WALL-END SENSE — "can I see where this obstacle ends?". Ask the
  // engine for the blocking wall's visible end and walk for the end that
  // turns the least off the goal bearing — what a human does at a wall.
  // "Visible" is the real thing: sight along each bearing is the distance to
  // the actual SCREEN edge (the camera rect the app stamps into
  // `state.view`; headless runs use the phone-landscape baseline rect), so
  // the bot knows exactly what a player watching the screen knows — a wall
  // end past the screen edge is unknown and the fallbacks below handle it.
  // While the sweep stays blocked the chosen side is LATCHED (`bot.trace`),
  // so consecutive ticks trace the SAME way around a long wall instead of
  // oscillating between its two ends (the measured up-down jitter of the
  // memoryless deflection fan below, which stays as the fallback for a
  // pocket with no visible end).
  const tune = botTuningFor(state.level.id);
  if (tune.wallSightFrac > 0) {
    const sightAt = screenSightFrom(state, from, tune.wallSightFrac);
    const end = visibleObstacleEnd(
      state,
      from,
      goal,
      r,
      sightAt,
      bot.trace?.side ?? 0,
    );
    if (end) {
      bot.trace = { side: end.side };
      return end.point;
    }
  }
  const dx = goal.x - from.x;
  const dy = goal.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const probe = Math.min(dist, NAV_LOOKAHEAD);
  const base = Math.atan2(dy, dx);
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  for (const off of NAV_DEFLECTIONS) {
    const a = base + off;
    const p = {
      x: clamp(from.x + Math.cos(a) * probe, 20, state.level.width - 20),
      y: clamp(from.y + Math.sin(a) * probe, 20, state.level.height - 20),
    };
    if (insideObstacle(state, p, r)) continue;
    if (blockedByObstacle(state, from, p, r)) continue;
    // Prefer a step that (a) can then SEE the goal (rounds the corner) and (b)
    // ends closer to it, penalising a bigger turn so we deflect minimally.
    const nd = Math.hypot(goal.x - p.x, goal.y - p.y);
    const sees = blockedByObstacle(state, p, goal, r) ? 0 : 1000;
    const score = sees - nd - Math.abs(off) * 40;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best ?? goal;
}

/** Steer toward a TRAVEL goal with local wall avoidance (see {@link navTarget}) —
 * the movement equivalent of {@link steer} for the short reactive FIGHT moves
 * (give-ground, edge-drift, punch-out) that steer a fixed distance, not toward a
 * far goal. Long-haul travel uses {@link routeSteer} (global A*) instead. */
export function navSteer(
  bot: Bot,
  state: GameState,
  goal: Vec2,
  jump = false,
): GameInput {
  return steer(state, navTarget(bot, state, goal), jump);
}

// === GLOBAL PATHFINDING TRAVEL (see pathfind.ts) ===
// The macro-travel primitive: instead of only sliding along the walls it can see
// ~140px ahead (navTarget), the bot plans a real A* ROUTE across the whole level
// to any goal — a chest deep in a walled pocket, an elite two basins over, the
// boss — and follows it. This is what lets a level be validated WITHOUT hand-
// authoring a bot path: the runner finds its own way to every reachable thing.

/** Retire a route waypoint once the hero is this close (world px). */
const ROUTE_REACH = 48;
/** Replan when the goal has moved more than this from the planned goal. */
export const ROUTE_REPLAN_GOAL = 80;
/** Replan when the hero has been shoved this far off the planned route. */
const ROUTE_STRAY = 170;

/** Lazily build + cache the level's static nav grid on the bot (see the `route`
 * memory). Rebuilds on a level change. Returns the route cache. */
export function ensureRoute(
  bot: Bot,
  state: GameState,
): NonNullable<Bot["route"]> {
  if (!bot.route || bot.route.levelId !== state.level.id) {
    bot.route = {
      levelId: state.level.id,
      grid: buildNavGrid(state),
      goal: { x: 0, y: 0 },
      path: [],
      index: 0,
    };
  }
  return bot.route;
}

/** How far the hero sits from the nearest remaining route segment — the "shoved
 * off the corridor" gauge that forces a replan. */
function strayedFromRoute(rc: NonNullable<Bot["route"]>, from: Vec2): boolean {
  if (rc.index >= rc.path.length) return true;
  let bestSq = Infinity;
  let prev = from;
  for (let i = rc.index; i < rc.path.length; i++) {
    const node = rc.path[i]!;
    const dSq = segmentDistanceSq(from, prev, node);
    if (dSq < bestSq) bestSq = dSq;
    prev = node;
  }
  return bestSq > ROUTE_STRAY * ROUTE_STRAY;
}

/**
 * The immediate world sub-target to steer toward on the A* route to `goal`:
 * (re)plans a route when the cache is stale, retires reached waypoints, then
 * STRING-PULLS to the furthest waypoint still in clear line of body-sight — so
 * the hero cuts straight across open ground and only kinks at the turning points
 * the walls actually force. Falls back to the raw goal when it's unreachable
 * (let the local steering try). Pure w.r.t. state + the bot's route memory.
 */
export function routeTarget(bot: Bot, state: GameState, goal: Vec2): Vec2 {
  const rc = ensureRoute(bot, state);
  const from = state.player.pos;
  // String-pull integrity: the next unretired waypoint must be REACHABLE in a
  // straight body-width sweep from where the hero actually stands. When the
  // horde shoves him into a wall pocket the corridor doesn't see, he can sit
  // WITHIN the stray band yet have a thin wall between him and the waypoint —
  // steering at it just grinds him into the wall (the measured wedge loop).
  // A blocked next waypoint means the plan's premise failed: replan from HERE,
  // so A* routes him around the wall he's actually behind.
  const nextBlocked =
    rc.index < rc.path.length &&
    blockedByObstacle(state, from, rc.path[rc.index]!, PLAYER.radius);
  const stale =
    rc.path.length === 0 ||
    distance(goal, rc.goal) > ROUTE_REPLAN_GOAL ||
    strayedFromRoute(rc, from) ||
    nextBlocked;
  if (stale) {
    const path = findPath(rc.grid, from, goal);
    rc.goal = { x: goal.x, y: goal.y };
    rc.path = path ?? [];
    rc.index = 0;
    if (!path) return goal; // walled off — nudge straight and hope
  }
  while (
    rc.index < rc.path.length &&
    distance(from, rc.path[rc.index]!) <= ROUTE_REACH
  )
    rc.index++;
  if (rc.index >= rc.path.length) return goal;
  const r = PLAYER.radius;
  let target = rc.path[rc.index]!;
  for (let i = rc.path.length - 1; i >= rc.index; i--) {
    if (!blockedByObstacle(state, from, rc.path[i]!, r)) {
      target = rc.path[i]!;
      break;
    }
  }
  return target;
}

/** Steer toward a far TRAVEL goal along a global A* route (see {@link routeTarget})
 * — the macro-travel movement primitive that rounds every wall on the way, not
 * just the one 140px ahead. The route's sub-target still runs through the
 * local {@link navTarget} (a no-op on a clear sweep): when the plan falls back
 * to a raw goal (A* found no path) or the string-pull goes stale, the
 * wall-end sense traces the blocker instead of grinding into it. */
export function routeSteer(
  bot: Bot,
  state: GameState,
  goal: Vec2,
  jump = false,
): GameInput {
  return steer(
    state,
    navTarget(bot, state, routeTarget(bot, state, goal)),
    jump,
  );
}

/** The remaining A* route length from the hero through the cached route to its
 * goal (world px) — the TRUE "how far to actually reach it", which (unlike
 * euclidean distance) reflects the up-and-around a wall forces. */
export function remainingRoute(
  rc: NonNullable<Bot["route"]>,
  from: Vec2,
): number {
  if (rc.index >= rc.path.length) return distance(from, rc.goal);
  let len = distance(from, rc.path[rc.index]!);
  for (let i = rc.index; i < rc.path.length - 1; i++)
    len += distance(rc.path[i]!, rc.path[i + 1]!);
  return len;
}

/** Total route length of an A* waypoint list from `from` (world px) — the cost
 * used to pick the NEAREST reachable content piece. */
export function routeLength(from: Vec2, path: Vec2[]): number {
  let len = 0;
  let prev = from;
  for (const p of path) {
    len += distance(prev, p);
    prev = p;
  }
  return len;
}

/** The point `dist` away from `from`, on the player's side of it. */
export function holdOff(state: GameState, from: Vec2, dist: number): Vec2 {
  const dx = state.player.pos.x - from.x;
  const dy = state.player.pos.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / d) * dist, y: from.y + (dy / d) * dist };
}

/** Keep a circle-strafe target this far off the level edge/wall — enough that a
 * strafe never noses the hero into a corner it then has to unwedge from. */
const ORBIT_CLEARANCE = 44;

/**
 * A weapon-range hold that ORBITS the target instead of standing on it: the same
 * `dist` radius as {@link holdOff}, but advanced tangentially around `center` by
 * `step` radians in the bot's committed orbit direction, so the hero
 * circle-strafes at range. The auto-aimed weapon still tracks the nearest foe
 * (step.ts), so DPS is unchanged — but a hero who keeps sliding laterally slips
 * the enemy fire aimed at his CURRENT spot (leading is partial even on the hard
 * rungs — ranged.ts), instead of eating every shot planted on the hold point.
 *
 * The orbit sense is per-bot memory and REVERSES when the next arc would run
 * into a wall or the map edge — a human circling one way until the room ends,
 * then the other. With both ways blocked (a tight pocket) it falls back to a
 * straight radial hold. `step` ≤ 0 disables the orbit (the classic stand-still
 * hold). Pure w.r.t. state + the bot's `orbitSign`, so determinism holds.
 */
export function orbitHold(
  bot: Bot,
  state: GameState,
  center: Vec2,
  dist: number,
  step: number,
): Vec2 {
  if (step <= 0) return holdOff(state, center, dist);
  const p = state.player.pos;
  const ang = Math.atan2(p.y - center.y, p.x - center.x);
  if (bot.orbitSign === undefined) bot.orbitSign = 1;
  const r = PLAYER.radius;
  for (const sign of [bot.orbitSign, -bot.orbitSign]) {
    const a = ang + step * sign;
    const pt = {
      x: center.x + Math.cos(a) * dist,
      y: center.y + Math.sin(a) * dist,
    };
    const edge = Math.min(
      pt.x,
      state.level.width - pt.x,
      pt.y,
      state.level.height - pt.y,
    );
    if (edge < ORBIT_CLEARANCE) continue; // strafing into the level edge
    if (insideObstacle(state, pt, r)) continue; // into a rock/wall
    if (blockedByObstacle(state, p, pt, r)) continue; // a wall in the way
    bot.orbitSign = sign;
    return pt;
  }
  return holdOff(state, center, dist); // hemmed in → back straight out/in
}
