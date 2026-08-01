// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's FIELD READS: how the bot perceives the fight and the map —
// the local threat ring, the boss and the spawn→objective axis, the
// surround/encirclement reads, the escape-lane fan, and the retreat bearings.
// Every function here is a PURE read of the GameState (no bot memory, no
// mutation), shared by the decision modules so "near", "surrounded", and
// "open lane" mean exactly one thing across the whole autopilot.

import { clamp, distance, normalize } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import type { BotTuning } from "./tuning.ts";
import { MAP, PLAYER, SPAWNERS } from "../config/index.ts";
import { blockedByObstacle } from "../obstacles.ts";
import { difficultyDef } from "../defs/difficulties.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { weaponRangeFor } from "../items/index.ts";
import { clearOfFog, exploredRay } from "../map.ts";
import type { Enemy, GameState, Player } from "../types/index.ts";
import { inertEnemy } from "../disposition.ts";

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
  hero: Player,
  near: Enemy[],
  prefer?: Vec2 | null,
  bias = PATH_RETREAT_BIAS,
): Vec2 {
  const pos = hero.pos;
  let ax = 0;
  let ay = 0;
  for (const e of near) {
    const n = normalize(pos.x - e.pos.x, pos.y - e.pos.y);
    const d = n.len || 1;
    ax += n.x / d; // 1/d direction × 1/d weight = nearer foes weigh more
    ay += n.y / d;
  }
  const m = Math.hypot(ax, ay);
  const away = m < 1e-6 ? (prefer ?? { x: 1, y: 0 }) : { x: ax / m, y: ay / m };
  if (!prefer) return away;
  return normalize(away.x + prefer.x * bias, away.y + prefer.y * bias);
}

/** A unit heading toward SAFE ground for a retreat — BACK along the spawn→boss
 * axis (the ground behind is already cleared; the fresh spawns live ahead), or
 * toward the spawn itself on an axis-less arena. This is the "kite the pack
 * backwards, not forwards" bearing. Null when the hero is already at the back
 * of the map (nothing behind to give) or the `retreatBackBias` knob is off —
 * the caller then falls back to the classic forward (objective-ward) drift. */
export function retreatHeading(
  state: GameState,
  hero: Player,
  tune: BotTuning,
): Vec2 | null {
  if (tune.retreatBackBias <= 0) return null;
  const axis = objectiveAxis(state);
  if (axis) {
    // Already at the spawn end — backing further only finds the wall.
    if (axisProgress(axis, hero.pos) < 0.12) return null;
    return { x: -axis.dir.x, y: -axis.dir.y };
  }
  const n = normalize(
    state.playerSpawn.x - hero.pos.x,
    state.playerSpawn.y - hero.pos.y,
  );
  if (n.len < 80) return null;
  return n;
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
  /** How much of `sorted`/`distSq` this scan filled — the pooled arrays below
   * are never truncated, so every walk stops here rather than at `.length`. */
  len: number;
};

/**
 * The scan's buffers, reused across ticks. Rebuilding them per tick meant one
 * pairing object per live monster plus three fresh arrays — at horde scale the
 * simulator's single largest source of garbage, and the sim runs this every
 * tick of every run. The pairing objects are pooled and the two output arrays
 * are written in place (`len` marks the live prefix), so a steady-state horde
 * allocates nothing here at all.
 */
type ThreatEntry = { e: Enemy; dSq: number };
/** Reusable pairing objects, one per rank, grown to the horde's high-water
 * mark and never released. */
const entryPool: ThreatEntry[] = [];
/** The prefix actually being sorted this tick — the pool's objects in scan
 * order. Truncated (never rebuilt) when the horde shrinks. */
const liveEntries: ThreatEntry[] = [];
const byDistance = (a: ThreatEntry, b: ThreatEntry): number => a.dSq - b.dSq;

let threatScan: ThreatScan | null = null;

function scanThreats(state: GameState, hero: Player): ThreatScan {
  const pos = hero.pos;
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
  const enemies = state.enemies;
  let n = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i] as Enemy;
    if (inertEnemy(e)) continue;
    const dx = e.pos.x - pos.x;
    const dy = e.pos.y - pos.y;
    let entry = entryPool[n];
    if (entry === undefined) {
      entry = { e, dSq: 0 };
      entryPool[n] = entry;
    }
    entry.e = e;
    entry.dSq = dx * dx + dy * dy;
    liveEntries[n] = entry;
    n++;
  }
  // Drop last tick's tail so a shrinking horde never sorts stale ranks. The
  // pool still holds the objects, so this frees nothing and re-allocates
  // nothing — it only shortens the view.
  liveEntries.length = n;
  liveEntries.sort(byDistance);

  const fresh: ThreatScan = threatScan ?? {
    enemies,
    timeMs: 0,
    px: 0,
    py: 0,
    count: 0,
    sorted: [],
    distSq: [],
    len: 0,
  };
  fresh.enemies = enemies;
  fresh.timeMs = state.stats.timeMs;
  fresh.px = pos.x;
  fresh.py = pos.y;
  fresh.count = enemies.length;
  fresh.len = n;
  const sorted = fresh.sorted;
  const distSq = fresh.distSq;
  for (let i = 0; i < n; i++) {
    const entry = liveEntries[i] as ThreatEntry;
    sorted[i] = entry.e;
    distSq[i] = entry.dSq;
  }
  threatScan = fresh;
  return fresh;
}

/** How many entries of the (nearest-first) scan fall inside `radius`. */
function ringSize(scan: ThreatScan, radius: number): number {
  const rSq = radius * radius;
  // The scan is sorted, so the ring is a prefix.
  let n = 0;
  while (n < scan.len && (scan.distSq[n] as number) < rSq) n++;
  return n;
}

/** Non-apparition enemies within `radius`, nearest first. */
export function threatsWithin(
  state: GameState,
  hero: Player,
  radius: number,
): Enemy[] {
  const scan = scanThreats(state, hero);
  return scan.sorted.slice(0, ringSize(scan, radius));
}

/**
 * How many non-apparition enemies stand within `radius` — {@link threatsWithin}
 * without the array. Most asks are a count or an emptiness test ("is anything
 * on me?"), and those ran several times per tick purely to measure a freshly
 * sliced array.
 */
export function threatCountWithin(
  state: GameState,
  hero: Player,
  radius: number,
): number {
  return ringSize(scanThreats(state, hero), radius);
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
export function readyForBoss(
  state: GameState,
  hero: Player,
  tune: BotTuning,
): boolean {
  const boss = bossOf(state);
  if (!boss) return true;
  return hero.level >= Math.max(1, boss.mlvl - tune.bossEngageMargin);
}

/**
 * Is boss-level parity STRUCTURALLY out of reach — the boss rides the
 * player's own level, so the gap never closes however hard the hero farms?
 * True exactly on the player-relative rungs (JESUS: no authored boss level,
 * the horde at player + a non-negative offset). There the parity wait is not
 * a farm plan but a deadlock: the spawner-farm hold, the fog window, and the
 * elite-hunt gate would all idle forever while the mobs level in lockstep
 * with the hero. An AUTHORED boss keeps the plain {@link readyForBoss} wait —
 * a big-but-fixed gap is what farming (and the explore-stall fallback) is
 * for. Deliberately NOT a gap heuristic: a fixed threshold misreads a fresh
 * hero under a far-off authored boss (the leveling window) as hopeless.
 */
export function parityHopeless(state: GameState): boolean {
  const boss = bossOf(state);
  if (!boss) return false;
  return (
    boss.authoredMlvl === undefined &&
    difficultyDef(state.difficulty).mobLevelOffset >= 0
  );
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
  const n = normalize(goal.x - origin.x, goal.y - origin.y);
  if (n.len < 1) return null;
  return { origin, dir: { x: n.x, y: n.y }, len: n.len };
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
export function activeSpawnerNear(state: GameState, hero: Player): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = SPAWNER_CLEAR_RANGE;
  for (const spawner of state.spawners) {
    // Only a point that is ACTIVELY emitting holds the hero — a dormant one
    // lying ahead must not, or the next point would always pin him short of it
    // and he would never advance. It arms (→ active) as he walks into range,
    // and once it has emitted its queue (→ drained) he moves on, mopping up the
    // chasers as he goes.
    if (spawner.status !== "active" || spawner.queue.length === 0) continue;
    const d = distance(hero.pos, spawner.at);
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
export function isEncircled(
  state: GameState,
  hero: Player,
  packed: Enemy[],
): boolean {
  const pos = hero.pos;
  const cx = packed.reduce((s, e) => s + e.pos.x, 0) / packed.length;
  const cy = packed.reduce((s, e) => s + e.pos.y, 0) / packed.length;
  const r = normalize(pos.x - cx, pos.y - cy);
  if (r.len < 1) return true; // centroid on top of him → bodies all around
  // A packed foe within ~60° of the retreat direction blocks the way out.
  return packed.some((e) => {
    const n = normalize(e.pos.x - pos.x, e.pos.y - pos.y);
    return n.x * r.x + n.y * r.y > 0.5;
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
  hero: Player,
  near: Enemy[],
  avoidForward: boolean,
): number[] {
  const pos = hero.pos;
  const axis = avoidForward ? objectiveAxis(state) : null;
  // Each foe's unit bearing + distance, computed ONCE — the lane loop below
  // re-reads them 16 times, and the old per-lane hypot was the fan's hotspot
  // at horde scale.
  const ux: number[] = [];
  const uy: number[] = [];
  const invD: number[] = [];
  for (const e of near) {
    const n = normalize(e.pos.x - pos.x, e.pos.y - pos.y);
    ux.push(n.x);
    uy.push(n.y);
    invD.push(1 / (n.len || 1));
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
export function bestLanePoint(
  state: GameState,
  hero: Player,
  scores: number[],
): Vec2 {
  const pos = hero.pos;
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
  hero: Player,
  near: Enemy[],
  avoidForward = false,
): Vec2 {
  return bestLanePoint(
    state,
    hero,
    escapeLaneScores(state, hero, near, avoidForward),
  );
}

/** Is there a foe the hero could actually strike right now — in weapon range,
 * out of the fog and with a clear line? While there is, standing still is
 * FIGHTING, not being wedged, so the stall detector holds off (a boss/pack brawl
 * never trips the unstuck). The fog counts because the auto-attack will not fire
 * at anything still in it (`clearOfFog`): a hero standing over a mob he refuses
 * to shoot is wedged, and the detector has to be allowed to say so. */
export function hasReachableFoe(state: GameState, hero: Player): boolean {
  const range = weaponRangeFor(state, hero, hero.equipment.weapon);
  const rangeSq = range * range;
  const r = PLAYER.radius;
  const scan = scanThreats(state, hero);
  for (let i = 0; i < scan.len; i++) {
    if ((scan.distSq[i] as number) > rangeSq) break; // sorted — rest are farther
    const enemy = scan.sorted[i] as Enemy;
    if (!clearOfFog(state, enemy.pos)) continue;
    if (!blockedByObstacle(state, hero.pos, enemy.pos, r)) return true;
  }
  return false;
}

/**
 * THE REACH THE HERO CAN ACTUALLY FIRE AT along the bearing to `at` — his
 * weapon's effective range (`weaponRangeFor`) cut short where the FOG begins.
 *
 * Every stand-off the bot picks measures from this rather than from the weapon's
 * paper reach, because the auto-attack refuses a target that is not `clearOfFog`
 * (step/weapon.ts): across unexplored ground a long gun's range is NOT where its
 * shots land. Holding at the paper figure parks the hero beyond the light,
 * standing still and firing nothing at a mob that never closes — the same
 * mistake reading the weapon's BASE range used to make, one layer further out.
 *
 * The cut is `exploredRay` (how far the uncovered ground runs that way) less the
 * frontier band, so it grows as the hero walks and never has to be re-derived.
 * Ground explored clean to the level edge yields the weapon's own reach: there
 * is nothing hidden out there. A pure read of `state.explored` — botted runs
 * stay deterministic.
 */
export function firingReach(state: GameState, hero: Player, at: Vec2): number {
  const reach = weaponRangeFor(state, hero, hero.equipment.weapon);
  const angle = Math.atan2(at.y - hero.pos.y, at.x - hero.pos.x);
  const ray = exploredRay(state, hero.pos, angle, reach);
  if (!ray.fog) return reach;
  return Math.max(0, Math.min(reach, ray.dist - MAP.fogBand));
}

/** How far out the contact clock bothers to look (world px). A body beyond
 * this needs seconds to cross the gap however fast it runs, so it can never
 * shorten a stand the bot is weighing — and the scan is sorted, so the cutoff
 * is a clean break rather than a filter. */
const CONTACT_ETA_HORIZON = 900;

/**
 * THE STAND CLOCK — worst-case seconds until the first body is ON the hero, if
 * every foe in sight turned and ran straight at him at its own top speed (a mob
 * still sprinting its summon run-in counts at that sprint,
 * `SPAWNERS.runInSpeedMult`). Distance is measured to the contact ring
 * ({@link CONTACT_DODGE_RADIUS}), so 0 reads as "already biting"; a field where
 * nothing MOVES returns Infinity — a parked foe never arrives on its own.
 *
 * This is how long the bot may stand still, and standing is the only pace that
 * really refills the sprint pool (and the ONLY one that pays down the
 * empty-pool regen lockout — see `STAMINA.emptyRegenLockMs`), so every
 * deliberate stand asks for a window at least as long as the stand needs.
 * Deliberately pessimistic — it ignores walls, aggro state, and the fact that
 * most of a horde is asleep — because being wrong about a stand costs a free
 * hit, while being wrong the other way costs only a few points of pool.
 */
export function contactEtaSec(state: GameState, hero: Player): number {
  const scan = scanThreats(state, hero);
  const horizonSq = CONTACT_ETA_HORIZON * CONTACT_ETA_HORIZON;
  let best = Infinity;
  for (let i = 0; i < scan.len; i++) {
    const dSq = scan.distSq[i] as number;
    if (dSq > horizonSq) break; // sorted — everything past here is farther
    const enemy = scan.sorted[i] as Enemy;
    // A summoned mob still crossing its approach circle closes at the run-in
    // sprint, not its walking pace.
    const speed =
      enemy.speed *
      (enemy.approachRadius === undefined ? 1 : SPAWNERS.runInSpeedMult);
    if (speed <= 0) continue;
    const eta = Math.max(0, Math.sqrt(dSq) - CONTACT_DODGE_RADIUS) / speed;
    if (eta < best) best = eta;
  }
  return best;
}

export function nearestEnemy(
  state: GameState,
  hero: Player,
): Enemy | undefined {
  // Apparitions are untouchable scenery — a bot never fights or flees one;
  // the shared per-tick scan already filters them and sorts nearest first.
  const scan = scanThreats(state, hero);
  return scan.len > 0 ? scan.sorted[0] : undefined;
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
