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
  normalize,
  rayRectExitDistance,
  segmentDistanceSq,
} from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import { botTuningFor } from "./state.ts";
import type { Bot } from "./state.ts";
import { PLAYER } from "../config/index.ts";
import { exploredRay } from "../map.ts";
import { onPathLevel } from "../path.ts";
import { buildNavGrid, findPath, type NavGrid } from "../pathfind.ts";
import {
  blockedByObstacle,
  insideObstacle,
  visibleObstacleEnd,
} from "../obstacles.ts";
import type { GameInput, GameState, GravityWell } from "../types/index.ts";

/** How deep into a gravity well's pull band the bot tolerates: its NO-GO ring
 * is `core + this × (reach − core)` — inside it the drag starts winning
 * against his walk. Only the inner band is forbidden (the rift's fights
 * happen AROUND its holes; an outer-band no-go would forbid the fight). */
const WELL_NO_GO_DEPTH = 0.45;

/** A well's NO-GO radius — the bot treats the inside as lethal ground: the
 * reflex dodge bolts out of it, the loot/chest logic refuses targets parked
 * inside it, and every steer bends around it. */
export function wellDangerRadius(well: GravityWell): number {
  return (
    well.coreRadius + WELL_NO_GO_DEPTH * (well.pullRadius - well.coreRadius)
  );
}

/** Does `pos` sit inside any gravity well's no-go ring? */
export function insideWellDanger(state: GameState, pos: Vec2): boolean {
  for (const well of state.wells) {
    if (distance(well.pos, pos) < wellDangerRadius(well)) return true;
  }
  return false;
}

/**
 * Does `pos` sit anywhere inside a gravity well's PULL (plus a body margin)?
 * The exclusion for DESTINATIONS the bot would walk to and then stand at — a
 * chest, a parked drop: standing anywhere in the pull means fighting the
 * drag the whole visit, and the approach wedges on the repulsion field's
 * boundary (measured: 11 wedge penalties and 3 core deaths at the rift's
 * chest-guard well). Transit may still clip a pull's outer band — only
 * loiter-destinations are held to the stricter ring.
 */
export function insideWellPull(state: GameState, pos: Vec2): boolean {
  for (const well of state.wells) {
    if (distance(well.pos, pos) < well.pullRadius + PLAYER.radius * 2)
      return true;
  }
  return false;
}

/** Peak sideways push (world px) a well bends a steering target by when the
 * hero stands at its core edge — fading quadratically to nothing at the pull
 * reach. Sized to out-shove the drag with margin at the no-go ring. */
const WELL_REPULSE_PUSH = 240;

/**
 * Bend a steering target AWAY from any gravity well whose pull the hero is
 * standing in. This runs inside {@link steer} — the one chokepoint every bot
 * branch emits movement through — so kiting, marching, loot walks, and the
 * unstuck sweep ALL organically skirt the holes instead of fighting the drag:
 * the repulsion is a smooth field (strong near the no-go ring, nothing at the
 * reach), so it bends a route around a well rather than bouncing off it. The
 * reflex bolt (`dodgeWell`) stays the hard override for a hero already sunk
 * past the ring — this field is what keeps him from sinking at all.
 */
function repelFromWells(state: GameState, target: Vec2): Vec2 {
  const p = state.player.pos;
  let x = target.x;
  let y = target.y;
  for (const well of state.wells) {
    const n = normalize(p.x - well.pos.x, p.y - well.pos.y);
    const reach = well.pullRadius + PLAYER.radius;
    if (n.len >= reach || n.len < 1e-3) continue;
    const w = (1 - n.len / reach) ** 2 * WELL_REPULSE_PUSH;
    x += n.x * w;
    y += n.y * w;
  }
  return { x, y };
}

/** Steering input toward a world position (clamped inside the level). */
export function steer(state: GameState, target: Vec2, jump = false): GameInput {
  const bent = repelFromWells(state, target);
  return {
    steering: true,
    target: {
      x: clamp(bent.x, 20, state.level.width - 20),
      y: clamp(bent.y, 20, state.level.height - 20),
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

/** How far the hero can SEE along each bearing — everything the player watching
 * this run KNOWS in that direction: the distance to the SCREEN edge (the live
 * camera rect the app stamps into `state.view`, or the phone-landscape baseline
 * centred on him when headless) UNIONED with the ground already UNCOVERED from
 * the fog that way ({@link exploredRay} — the minimap's memory of everywhere
 * he has walked), scaled by {@link BotTuning.wallSightFrac}. The eyes of the
 * wall-end sense ({@link navTarget}): a wall whose end scrolled off the screen
 * but sits on uncovered map is still a KNOWN end — a human consults the
 * minimap exactly like this — while ground never seen stays dark. */
function knownSightFrom(
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
  const maxKnown = state.level.width + state.level.height;
  return (angle) =>
    Math.max(
      rayRectExitDistance(from, angle, c, half),
      exploredRay(state, from, angle, maxKnown).dist,
    ) * frac;
}

/** Angular step of the fog-trace side scan (radians) — the same granularity
 * the engine's wall-end scan sweeps at, so the two senses agree on what
 * "along the wall" means. */
const FOG_TRACE_STEP = Math.PI / 16;
/** How far the fog-trace scan rotates per side: ≈135°, matching the wall-end
 * scan's fan, so a wall face sloping back past the shoulder is still traced. */
const FOG_TRACE_MAX_STEPS = 12;

/** The first bearing off the blocked goal line on `side` that actually LEADS
 * TO FOG: its body-width probe sweeps open, its ray reaches a fog frontier
 * before leaving the level ({@link exploredRay}), and a straight body sweep
 * can reach that frontier (fog glimpsed THROUGH a wall is not walkable
 * knowledge). Null when every bearing on the side is stone or explored out to
 * the level edge — that side provably hides no wall end. */
function fogwardBearing(
  state: GameState,
  from: Vec2,
  base: number,
  side: 1 | -1,
): { angle: number; fogDist: number } | null {
  const r = PLAYER.radius;
  const maxKnown = state.level.width + state.level.height;
  for (let k = 1; k <= FOG_TRACE_MAX_STEPS; k++) {
    const a = base + side * k * FOG_TRACE_STEP;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const p = {
      x: clamp(from.x + cos * NAV_LOOKAHEAD, 20, state.level.width - 20),
      y: clamp(from.y + sin * NAV_LOOKAHEAD, 20, state.level.height - 20),
    };
    if (insideObstacle(state, p, r)) continue;
    if (blockedByObstacle(state, from, p, r)) continue;
    const ray = exploredRay(state, from, a, maxKnown);
    if (!ray.fog) continue; // explored to the edge — nothing to learn this way
    const frontier = {
      x: clamp(from.x + cos * ray.dist, 20, state.level.width - 20),
      y: clamp(from.y + sin * ray.dist, 20, state.level.height - 20),
    };
    if (blockedByObstacle(state, from, frontier, r)) continue; // fog behind stone
    return { angle: a, fogDist: ray.dist };
  }
  return null;
}

/**
 * The SECOND OBJECTIVE at a wall whose end is nowhere on the known map: go
 * UNCOVER the fog that hides it. Scans each side of the blocked bearing for
 * an open along-the-wall heading that genuinely reaches fog
 * ({@link fogwardBearing}) and walks the side whose frontier is NEARER (the
 * sooner new ground is uncovered, the sooner the end shows) — so the hero
 * traces the wall into the dark instead of standing at it or circling. A side
 * already explored out to the level edge yields nothing (the wall provably
 * has no end that way — the "must end the other way" deduction a human makes
 * at the minimap), and the committed side is LATCHED on `bot.trace` while it
 * still leads to fog, so the trace never flip-flops mid-wall. Null when
 * neither side leads anywhere new (a sealed known pocket) — the caller falls
 * back to the deflection fan. Pure w.r.t. state + the bot's trace memory, so
 * determinism holds.
 */
function traceTowardFog(bot: Bot, state: GameState, goal: Vec2): Vec2 | null {
  const from = state.player.pos;
  const base = Math.atan2(goal.y - from.y, goal.x - from.x);
  const cw = fogwardBearing(state, from, base, 1);
  const ccw = fogwardBearing(state, from, base, -1);
  const held = bot.trace?.side;
  let pick: { angle: number; fogDist: number } | null;
  let side: 1 | -1;
  if (held === 1 && cw) {
    pick = cw; // the committed trace still leads to fog — hold it
    side = 1;
  } else if (held === -1 && ccw) {
    pick = ccw;
    side = -1;
  } else if (cw && (!ccw || cw.fogDist <= ccw.fogDist)) {
    pick = cw;
    side = 1;
  } else {
    pick = ccw;
    side = -1;
  }
  if (!pick) return null;
  bot.trace = { side };
  return {
    x: clamp(
      from.x + Math.cos(pick.angle) * NAV_LOOKAHEAD,
      20,
      state.level.width - 20,
    ),
    y: clamp(
      from.y + Math.sin(pick.angle) * NAV_LOOKAHEAD,
      20,
      state.level.height - 20,
    ),
  };
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
  // THE WALL-END SENSE — "do I know where this obstacle ends?". Ask the
  // engine for the blocking wall's known end and walk for the end that
  // turns the least off the goal bearing — what a human does at a wall.
  // "Known" is what the player watching this run knows: sight along each
  // bearing is the SCREEN edge (the camera rect the app stamps into
  // `state.view`; headless runs use the phone-landscape baseline rect)
  // unioned with the ground already UNCOVERED from the fog that way (the
  // minimap's memory — see `knownSightFrom`), so a wall end that scrolled
  // off the screen but sits on explored map still counts. An end under
  // ground never seen is unknown and the fog trace below handles it.
  // While the sweep stays blocked the chosen side is LATCHED (`bot.trace`),
  // so consecutive ticks trace the SAME way around a long wall instead of
  // oscillating between its two ends (the measured up-down jitter of the
  // memoryless deflection fan below, which stays as the last fallback for a
  // pocket with no known end and no fog to chase).
  const tune = botTuningFor(state.level.id);
  if (tune.wallSightFrac > 0) {
    const sightAt = knownSightFrom(state, from, tune.wallSightFrac);
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
    // NO END ON THE WHOLE KNOWN MAP — screen and minimap alike. Standing
    // still (or grinding the deflection fan into the stone) learns nothing:
    // the end must lie under FOG, so the fallback objective is to go UNCOVER
    // it — walk along the wall toward the nearest fog frontier until the end
    // comes into knowledge and the sense above takes over. A side whose
    // explored ground runs to the level edge with no fog left has PROVEN the
    // wall doesn't end that way, so the other side wins — the "the wall must
    // end the other way" deduction a human makes at the minimap.
    const fogward = traceTowardFog(bot, state, goal);
    if (fogward) return fogward;
  }
  const dist = distance(from, goal) || 1;
  const probe = Math.min(dist, NAV_LOOKAHEAD);
  const base = Math.atan2(goal.y - from.y, goal.x - from.x);
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
    const nd = distance(p, goal);
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

/** Stamp every gravity well's NO-GO disc onto the bot's nav grid as blocked
 * cells, so A* routes CURVE AROUND the holes instead of threading straight
 * through them. Without this a route to a target beyond a well crossed the
 * disc, the steering repulsion field cancelled the march at the boundary, and
 * the runner wedged there tick after tick (measured: 11 wedge penalties at
 * the rift's chest-guard well, run cancelled). Only the inner danger ring is
 * blocked — the outer pull band stays routable (its drag is mild and the
 * repulsion field keeps a crossing honest), so the corridors BETWEEN the
 * rift's paired wells remain open. Bot-side on purpose: the engine's grid
 * stays hazard-agnostic; the no-go read is the autopilot's judgement. */
function blockWellCells(state: GameState, grid: NavGrid): void {
  const pad = PLAYER.radius;
  for (const well of state.wells) {
    const r = wellDangerRadius(well) + pad;
    const x0 = Math.max(0, Math.floor((well.pos.x - r) / grid.cell));
    const x1 = Math.min(
      grid.cols - 1,
      Math.floor((well.pos.x + r) / grid.cell),
    );
    const y0 = Math.max(0, Math.floor((well.pos.y - r) / grid.cell));
    const y1 = Math.min(
      grid.rows - 1,
      Math.floor((well.pos.y + r) / grid.cell),
    );
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const cx = (tx + 0.5) * grid.cell - well.pos.x;
        const cy = (ty + 0.5) * grid.cell - well.pos.y;
        if (cx * cx + cy * cy < r * r) grid.walkable[ty * grid.cols + tx] = 0;
      }
    }
  }
}

/** Lazily build + cache the level's static nav grid on the bot (see the `route`
 * memory). Rebuilds on a level change. Returns the route cache. */
export function ensureRoute(
  bot: Bot,
  state: GameState,
): NonNullable<Bot["route"]> {
  if (!bot.route || bot.route.levelId !== state.level.id) {
    const grid = buildNavGrid(state);
    blockWellCells(state, grid);
    bot.route = {
      levelId: state.level.id,
      grid,
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
  const n = normalize(state.player.pos.x - from.x, state.player.pos.y - from.y);
  return { x: from.x + n.x * dist, y: from.y + n.y * dist };
}

/** Keep a circle-strafe target this far off the level edge/wall — enough that a
 * strafe never noses the hero into a corner it then has to unwedge from. */
const ORBIT_CLEARANCE = 44;

/**
 * A weapon-range hold that ORBITS the target instead of standing on it: the same
 * `dist` radius as {@link holdOff}, but advanced tangentially around `center` by
 * `step` radians in the bot's committed orbit direction, so the hero
 * circle-strafes at range. The auto-aimed weapon still tracks the nearest foe
 * (step/), so DPS is unchanged — but a hero who keeps sliding laterally slips
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
