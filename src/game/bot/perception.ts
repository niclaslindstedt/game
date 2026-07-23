// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's FIELD READS: how the bot perceives the fight and the map —
// the local threat ring, the boss and the spawn→objective axis, the
// surround/encirclement reads, the escape-lane fan, and the retreat bearings.
// Every function here is a PURE read of the GameState (no bot memory, no
// mutation), shared by the decision modules so "near", "surrounded", and
// "open lane" mean exactly one thing across the whole autopilot.

import { clamp, distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import type { BotTuning } from "./tuning.ts";
import { PLAYER } from "../config/index.ts";
import { blockedByObstacle } from "../obstacles.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { weaponRangeFor } from "../items/index.ts";
import type { Enemy, GameState } from "../types/index.ts";

/** "Local pack" radius the survivor reasons about (threat, escape, powerups). */
export const THREAT_RADIUS = 320;
/** A foe this close is about to bite — hop to dodge its blow (airborne is
 * untouchable above JUMP.dodgeHeight, see step/). */
export const CONTACT_DODGE_RADIUS = 46;

/** How hard the intended-path heading biases the survivor's retreat bearing (a
 * fraction of the unit away-from-pack vector). High enough that backing off the
 * pack drifts the hero down the corridor toward the next waypoint, low enough
 * that dodging the horde still wins when the waypoint lies straight through it. */
const PATH_RETREAT_BIAS = 0.9;

/** A spawn point still owing mobs within this range keeps the hero CLEARING this
 * patch before the path lets him advance (the level's "clear the area, then move
 * on" contract) — so he levels up on the way instead of rushing under-levelled. */
const SPAWNER_CLEAR_RANGE = 540;

/** Enemies within this ring count toward being SURROUNDED. */
export const SURROUND_RADIUS = 150;

/** How far the escape steer aims down the openest lane. */
const ESCAPE_DISTANCE = 340;

/** A unit vector pointing away from the local pack, weighted so the NEAREST
 * bodies dominate the bearing (and a gap in a ring pulls the hero toward it).
 * When `prefer` is given (a unit heading toward the intended-path waypoint) the
 * retreat is BIASED toward it, so backing off the pack also walks the hero down
 * the corridor — yet `away` stays dominant, so a waypoint that lies through the
 * pack never drags him INTO it. */
export function awayFromPack(
  state: GameState,
  near: Enemy[],
  prefer?: Vec2 | null,
  bias = PATH_RETREAT_BIAS,
): Vec2 {
  const pos = state.player.pos;
  let ax = 0;
  let ay = 0;
  for (const e of near) {
    const dx = pos.x - e.pos.x;
    const dy = pos.y - e.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    ax += dx / (d * d); // 1/d direction × 1/d weight = nearer foes weigh more
    ay += dy / (d * d);
  }
  const m = Math.hypot(ax, ay);
  const away = m < 1e-6 ? (prefer ?? { x: 1, y: 0 }) : { x: ax / m, y: ay / m };
  if (!prefer) return away;
  const bx = away.x + prefer.x * bias;
  const by = away.y + prefer.y * bias;
  const bm = Math.hypot(bx, by) || 1;
  return { x: bx / bm, y: by / bm };
}

/** A unit heading toward SAFE ground for a retreat — BACK along the spawn→boss
 * axis (the ground behind is already cleared; the fresh spawns live ahead), or
 * toward the spawn itself on an axis-less arena. This is the "kite the pack
 * backwards, not forwards" bearing. Null when the hero is already at the back
 * of the map (nothing behind to give) or the `retreatBackBias` knob is off —
 * the caller then falls back to the classic forward (objective-ward) drift. */
export function retreatHeading(state: GameState, tune: BotTuning): Vec2 | null {
  if (tune.retreatBackBias <= 0) return null;
  const axis = objectiveAxis(state);
  if (axis) {
    // Already at the spawn end — backing further only finds the wall.
    if (axisProgress(axis, state.player.pos) < 0.12) return null;
    return { x: -axis.dir.x, y: -axis.dir.y };
  }
  const dx = state.playerSpawn.x - state.player.pos.x;
  const dy = state.playerSpawn.y - state.player.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 80) return null;
  return { x: dx / d, y: dy / d };
}

// ---- The per-tick threat scan -------------------------------------------
// The decision modules ask "who's near me" many times per tick (the survivor
// read, the powerup triggers, the panic checks…), and each ask used to
// re-filter and re-sort the whole enemy list with a sqrt per comparison — the
// autopilot's hotspot at horde scale. The scan instead runs ONCE per tick
// (every non-apparition foe with its squared distance, sorted nearest first)
// and every radius query serves a prefix of it. The cache keys on the sim
// clock plus the hero's position, so a fresh tick (or a teleport between
// reads) rebuilds it; nothing mutates enemy positions between the bot's reads
// within one tick, so the shared scan is exact, not approximate.
type ThreatScan = {
  enemies: Enemy[];
  timeMs: number;
  px: number;
  py: number;
  count: number;
  sorted: Enemy[];
  distSq: number[];
};
let threatScan: ThreatScan | null = null;

function scanThreats(state: GameState): ThreatScan {
  const pos = state.player.pos;
  const scan = threatScan;
  if (
    scan &&
    scan.enemies === state.enemies &&
    scan.timeMs === state.stats.timeMs &&
    scan.px === pos.x &&
    scan.py === pos.y &&
    scan.count === state.enemies.length
  ) {
    return scan;
  }
  const entries: { e: Enemy; dSq: number }[] = [];
  for (const e of state.enemies) {
    if (enemyDef(e.defId).apparition) continue;
    const dx = e.pos.x - pos.x;
    const dy = e.pos.y - pos.y;
    entries.push({ e, dSq: dx * dx + dy * dy });
  }
  entries.sort((a, b) => a.dSq - b.dSq);
  const fresh: ThreatScan = {
    enemies: state.enemies,
    timeMs: state.stats.timeMs,
    px: pos.x,
    py: pos.y,
    count: state.enemies.length,
    sorted: entries.map((x) => x.e),
    distSq: entries.map((x) => x.dSq),
  };
  threatScan = fresh;
  return fresh;
}

/** Non-apparition enemies within `radius`, nearest first. */
export function threatsWithin(state: GameState, radius: number): Enemy[] {
  const scan = scanThreats(state);
  const rSq = radius * radius;
  // The scan is sorted, so the ring is a prefix.
  let n = 0;
  while (n < scan.distSq.length && (scan.distSq[n] as number) < rSq) n++;
  return scan.sorted.slice(0, n);
}

/** The current boss enemy, if one is on the field. */
export function bossOf(state: GameState): Enemy | undefined {
  return state.enemies.find((e) => enemyDef(e.defId).role === "boss");
}

/** The current boss's position, if one is on the field. */
export function bossPos(state: GameState): Vec2 | undefined {
  return bossOf(state)?.pos;
}

/**
 * Is the hero leveled enough to STOP farming and rush the boss? True when he has
 * reached the boss's monster level minus {@link BotTuning.bossEngageMargin}
 * (default 0 — he waits for LEVEL PARITY with the boss, so he doesn't engage it
 * under-levelled) — or when the level has no boss to gate on (a reachExit map),
 * so the bot always pushes the objective there. Until then the bot keeps farming
 * the spawn-point patches to level up (see the `spawner` hold in {@link survive})
 * and discovering its side of the map. Coverage still commits the sweep to the
 * boss even short of parity ({@link macroTarget}), so this can't strand a hero
 * who tops out under the boss's level.
 */
export function readyForBoss(state: GameState, tune: BotTuning): boolean {
  const boss = bossOf(state);
  if (!boss) return true;
  return state.player.level >= Math.max(1, boss.mlvl - tune.bossEngageMargin);
}

/** The spawn→objective AXIS the exploration bands hang off — the bot's "where did
 * I start vs where's the boss" read. Origin is the player spawn (the near, t=0
 * end); the heading points at the boss (the far, t=1 end), or, before the boss is
 * on the field, the FURTHEST LANDMARK (the objective marker), so the axis is known
 * from the first tick even while the boss sleeps off-screen. Null when there's no
 * objective to orient on (an open arena with no landmark) — the caller then falls
 * back to an undirected nearest-pocket sweep. Pure, so determinism holds. */
export function objectiveAxis(
  state: GameState,
): { origin: Vec2; dir: Vec2; len: number } | null {
  const origin = state.playerSpawn;
  const goal = bossPos(state) ?? furthestLandmark(state);
  if (!goal) return null;
  const dx = goal.x - origin.x;
  const dy = goal.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  return { origin, dir: { x: dx / len, y: dy / len }, len };
}

/** How far along the spawn→boss axis a world point sits: 0 at the spawn end, 1 at
 * the boss end — the "which slice of the map is this" the exploration priority
 * bands off. Clamped, so a point behind the spawn reads 0 and one past the boss
 * reads 1. */
export function axisProgress(
  axis: { origin: Vec2; dir: Vec2; len: number },
  p: Vec2,
): number {
  const t =
    ((p.x - axis.origin.x) * axis.dir.x + (p.y - axis.origin.y) * axis.dir.y) /
    axis.len;
  return clamp(t, 0, 1);
}

/** The anchor of the nearest spawn point that still owes mobs (dormant or
 * mid-drip) within `SPAWNER_CLEAR_RANGE` of the hero, or null — the patch the
 * bot holds and clears before the path lets it advance. Null on levels that
 * author no spawners (inherently gating this behavior to spawner levels). */
export function activeSpawnerNear(state: GameState): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = SPAWNER_CLEAR_RANGE;
  for (const spawner of state.spawners) {
    // Only a point that is ACTIVELY emitting holds the hero — a dormant one
    // lying ahead must not, or the next point would always pin him short of it
    // and he would never advance. It arms (→ active) as he walks into range,
    // and once it has emitted its queue (→ drained) he moves on, mopping up the
    // chasers as he goes.
    if (spawner.status !== "active" || spawner.queue.length === 0) continue;
    const d = distance(state.player.pos, spawner.at);
    if (d < bestD) {
      best = spawner.at;
      bestD = d;
    }
  }
  return best;
}

/**
 * True when simply backing off the pack won't open a gap — foes hem the hero in
 * on the RETREAT side too (behind the direction away from the pack's centroid),
 * so he must punch through rather than hug the edge. A dense pack on ONE side
 * only is NOT encircled: he can just back off along the open lane.
 */
export function isEncircled(state: GameState, packed: Enemy[]): boolean {
  const pos = state.player.pos;
  const cx = packed.reduce((s, e) => s + e.pos.x, 0) / packed.length;
  const cy = packed.reduce((s, e) => s + e.pos.y, 0) / packed.length;
  let rx = pos.x - cx;
  let ry = pos.y - cy;
  const rd = Math.hypot(rx, ry);
  if (rd < 1) return true; // centroid on top of him → bodies all around
  rx /= rd;
  ry /= rd;
  // A packed foe within ~60° of the retreat direction blocks the way out.
  return packed.some((e) => {
    const ex = e.pos.x - pos.x;
    const ey = e.pos.y - pos.y;
    const d = Math.hypot(ex, ey) || 1;
    return (ex / d) * rx + (ey / d) * ry > 0.5;
  });
}

/** How many directions the escape fan samples around the hero. */
const ESCAPE_SAMPLES = 16;
/** A lane scoring below this pressure counts as OPEN — the openness gauge the
 * escape-route guard counts against `escapeLaneMin` (see escapeLaneScores). */
export const OPEN_LANE_SCORE = 3;
/** Extra score charged to an escape lane pointing FORWARD along the spawn→boss
 * axis (scaled by alignment): fleeing toward the objective runs into the fresh
 * spawns, so between two comparably clear lanes the backward one wins. A
 * TIEBREAKER, deliberately smaller than what one body blocking a lane costs
 * (~5+) — when the only real gap in a ring lies forward, the hero still takes
 * it rather than punching through bodies to retreat "safely". Waived when a
 * nuke is banked (the daring read). */
const ESCAPE_FORWARD_PENALTY = 4;

/**
 * Score every lane of the escape fan: enemy pressure ahead (closer and more
 * head-on foes weigh heavier), a penalty for running into the level edge, and
 * — with `avoidForward` — a penalty for lanes pointing up the spawn→boss axis
 * (safe ground lies BEHIND; the fresh spawns live ahead). Lower is opener.
 * Deterministic (fixed sample); shared by the emergency escape pick and the
 * escape-route guard so "open" means one thing.
 */
export function escapeLaneScores(
  state: GameState,
  near: Enemy[],
  avoidForward: boolean,
): number[] {
  const pos = state.player.pos;
  const axis = avoidForward ? objectiveAxis(state) : null;
  // Each foe's unit bearing + distance, computed ONCE — the lane loop below
  // re-reads them 16 times, and the old per-lane hypot was the fan's hotspot
  // at horde scale.
  const ux: number[] = [];
  const uy: number[] = [];
  const invD: number[] = [];
  for (const e of near) {
    const ex = e.pos.x - pos.x;
    const ey = e.pos.y - pos.y;
    const d = Math.hypot(ex, ey) || 1;
    ux.push(ex / d);
    uy.push(ey / d);
    invD.push(1 / d);
  }
  const scores: number[] = [];
  for (let i = 0; i < ESCAPE_SAMPLES; i++) {
    const angle = (i / ESCAPE_SAMPLES) * Math.PI * 2;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    let score = 0;
    for (let f = 0; f < ux.length; f++) {
      // How much this foe blocks THIS lane: 1 dead ahead, 0 to the side/behind.
      const ahead = (ux[f] as number) * dir.x + (uy[f] as number) * dir.y;
      if (ahead <= 0) continue; // a foe behind us doesn't block the way ahead
      // nearer + more head-on = worse
      score += ahead * ahead * THREAT_RADIUS * (invD[f] as number);
    }
    // Penalise a lane that runs into the level edge — no room to flee there.
    const tx = pos.x + dir.x * ESCAPE_DISTANCE;
    const ty = pos.y + dir.y * ESCAPE_DISTANCE;
    const margin = Math.min(
      tx,
      state.level.width - tx,
      ty,
      state.level.height - ty,
    );
    if (margin < 0)
      score += 1000; // off the map
    else if (margin < 80) score += (80 - margin) * 4; // hugging a wall
    // Fleeing FORWARD runs into the fresh spawns — charge the lane by how
    // squarely it points up the axis, so the retreat breaks backward/sideways.
    if (axis) {
      const fwd = dir.x * axis.dir.x + dir.y * axis.dir.y;
      if (fwd > 0) score += fwd * ESCAPE_FORWARD_PENALTY;
    }
    scores.push(score);
  }
  return scores;
}

/** The world point down the openest lane of a scored escape fan. */
export function bestLanePoint(state: GameState, scores: number[]): Vec2 {
  const pos = state.player.pos;
  let bestI = 0;
  let bestScore = Infinity;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i] as number;
    if (s < bestScore) {
      bestScore = s;
      bestI = i;
    }
  }
  const angle = (bestI / ESCAPE_SAMPLES) * Math.PI * 2;
  return {
    x: pos.x + Math.cos(angle) * ESCAPE_DISTANCE,
    y: pos.y + Math.sin(angle) * ESCAPE_DISTANCE,
  };
}

/**
 * Trace the best path OUT of a pack: sample directions around the hero and pick
 * the openest — the one with the least enemy pressure ahead and clear ground to
 * run into (see {@link escapeLaneScores}). With `avoidForward`, safe ground is
 * kept BEHIND the hero: a lane up the spawn→boss axis is penalised so he breaks
 * backward toward cleared ground instead of into the fresh spawns.
 */
export function bestEscapeTarget(
  state: GameState,
  near: Enemy[],
  avoidForward = false,
): Vec2 {
  return bestLanePoint(state, escapeLaneScores(state, near, avoidForward));
}

/** Is there a foe the hero could actually strike right now — in weapon range with
 * a clear line? While there is, standing still is FIGHTING, not being wedged, so
 * the stall detector holds off (a boss/pack brawl never trips the unstuck). */
export function hasReachableFoe(state: GameState): boolean {
  const range = weaponRangeFor(state, state.player.equipment.weapon);
  const rangeSq = range * range;
  const r = PLAYER.radius;
  const scan = scanThreats(state);
  for (let i = 0; i < scan.sorted.length; i++) {
    if ((scan.distSq[i] as number) > rangeSq) break; // sorted — rest are farther
    const enemy = scan.sorted[i] as Enemy;
    if (!blockedByObstacle(state, state.player.pos, enemy.pos, r)) return true;
  }
  return false;
}

export function nearestEnemy(state: GameState): Enemy | undefined {
  // Apparitions are untouchable scenery — a bot never fights or flees one;
  // the shared per-tick scan already filters them and sorts nearest first.
  return scanThreats(state).sorted[0];
}

/** The landmark furthest from the player spawn — the objective's marker. */
export function furthestLandmark(state: GameState): Vec2 | undefined {
  let best: Vec2 | undefined;
  let bestD = -1;
  for (const landmark of state.landmarks) {
    const d = distance(landmark.pos, state.playerSpawn);
    if (d > bestD) {
      best = landmark.pos;
      bestD = d;
    }
  }
  return best;
}
