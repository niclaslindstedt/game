// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SPAWN POINTS (config SPAWNERS, `LevelDef.spawners`, state `SpawnerRuntime`):
// the FINITE, LOCAL horde model — the alternative to the endless `waves` stream
// (stepSpawner). Each point sleeps until the hero trips its `triggerRadius`,
// then SUMMONS its queued mobs a few (`perEmit`) at a time every `intervalMs`
// until it DRAINS empty — one readable wave the hero can clear and walk away
// from. A summoned mob is never popped onto the screen: it appears just
// OFF-SCREEN and RUNS IN toward the hero at a sprint (`runInSpeedMult`),
// dropping to its normal pace only once it crosses the APPROACH CIRCLE — a
// circle as wide as the shorter viewport dimension (see `moveEnemy`) — so the
// horde streams into view instead of blinking into being at the hero's elbow.
// Emission holds to a per-point CONCURRENT-ALIVE CAP (`maxAlive`) and only runs
// while the hero is in trigger range: at the cap (or once he steps out) the
// point pauses, then — after a POST-KILL RESPAWN DELAY (`respawnDelayMs`,
// shortened by difficulty, boss proximity, and campaign progress) — summons a
// fresh mob to REPLACE each kill, so the field refills at a tunable, escalating
// cadence rather than instantly. The queue still drains as the hero grinds the
// cap down. The cap counts only members still in the fight (alive AND within a
// leash of the hero); one left far behind is treated as gone, so the point
// summons a replacement to keep pressure where he stands. A point may CHAIN off
// another (`after`): it arms `afterDelayMs` after that one drains, but only
// while the hero is still in its trigger range, so pressure follows him without
// a bottomless refill. This is what lets a level actually be CLEARED and a maze
// be traversed without an infinite bog. Summoned mobs are scaled exactly like a
// woken pack's (menace stage + mob level), so a spawner wave hits as hard as the
// difficulty's horde.
//
// A point only ARMS when the hero has a clear LINE OF SIGHT to it (never a wave
// through a wall), and only up to the rung's simultaneous-active cap
// (`DifficultyDef.activeSpawnerCap`): when more points are in range than the cap
// allows, the ones CLOSEST to the hero light and the rest wait dormant until an
// active wave drains and frees a slot — so a maze keeps the pressure where he
// stands instead of igniting every spawner around him at once. An omitted cap
// (JESUS) is uncapped.

import { clamp, distance, distanceSq, type Vec2 } from "@game/lib/vec.ts";
import { SPAWNERS } from "./config/index.ts";
import { spawnEnemy } from "./create.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { difficultyDef } from "./defs/difficulties.ts";
import { levelDef } from "./defs/levels/index.ts";
import {
  currentMobLevel,
  menaceStage,
  mobLevelScale,
  resolveMobScaling,
} from "./menace.ts";
import { insideObstacle, lineOfSight } from "./obstacles.ts";
import type { Enemy, GameState, SpawnerRuntime } from "./types.ts";
import { anyZoneContains } from "./zones.ts";

/** The camera rect a spawner reads to place its summons off-screen and size the
 * approach circle. Only the dimensions matter here. */
type ViewSize = { width: number; height: number };

/** The SUMMON GEOMETRY for this tick's camera (config SPAWNERS): the approach
 * circle a running-in mob slows down at, the off-screen distance it is summoned
 * at, and the leash radius the alive cap counts members within. Derived once per
 * tick from the shorter viewport dimension; headless (no camera) falls back to
 * the phone baseline. */
function summonGeometry(view?: ViewSize): {
  approachRadius: number;
  spawnDist: number;
  countRadius: number;
} {
  const approachRadius = view
    ? Math.min(view.width, view.height)
    : SPAWNERS.approachRadiusFallback;
  const halfDiag = view
    ? Math.hypot(view.width, view.height) / 2
    : SPAWNERS.approachRadiusFallback;
  return {
    approachRadius,
    spawnDist: halfDiag + SPAWNERS.spawnMargin,
    countRadius: approachRadius * SPAWNERS.leashMult,
  };
}

/** An OFF-SCREEN spawn spot for one summoned mob: placed `spawnDist` from the
 * hero along the bearing FROM him TOWARD the spawn point (so a point's mobs pour
 * in from its side of the field), scattered within `summonArcRad`, and
 * rejection-sampled clear of obstacles, the map edge, and no-spawn zones. The
 * mob then RUNS IN toward the hero (moveEnemy) until it crosses the approach
 * circle. Falls back to the clamped bearing spot. */
function emitPos(
  state: GameState,
  spawner: SpawnerRuntime,
  radius: number,
  spawnDist: number,
): Vec2 {
  const { width, height } = state.level;
  const def = levelDef(state.level.id);
  const player = state.player.pos;
  const dx = spawner.at.x - player.x;
  const dy = spawner.at.y - player.y;
  // Bearing from the hero toward the point; if he is basically ON it, a summon
  // has no meaningful "from" direction — pick a random one so mobs still ring in.
  const baseAngle =
    Math.hypot(dx, dy) > 1 ? Math.atan2(dy, dx) : state.rng() * Math.PI * 2;
  for (let attempt = 0; attempt < SPAWNERS.placeAttempts; attempt++) {
    const angle = baseAngle + (state.rng() - 0.5) * SPAWNERS.summonArcRad;
    const pos = {
      x: clamp(player.x + Math.cos(angle) * spawnDist, radius, width - radius),
      y: clamp(player.y + Math.sin(angle) * spawnDist, radius, height - radius),
    };
    if (
      !insideObstacle(state, pos, radius) &&
      !anyZoneContains(def.safeZones, pos) &&
      !anyZoneContains(def.quietZones, pos)
    ) {
      return pos;
    }
  }
  return {
    x: clamp(
      player.x + Math.cos(baseAngle) * spawnDist,
      radius,
      width - radius,
    ),
    y: clamp(
      player.y + Math.sin(baseAngle) * spawnDist,
      radius,
      height - radius,
    ),
  };
}

/** Emit up to `limit` queued mobs from a spawner (fewer if the queue runs out),
 * scaled to the run's horde like a woken pack. `limit` is `perEmit` clamped by
 * the room left under the concurrent-alive cap. Each mob is SUMMONED off-screen
 * (`emitPos`) and marked to RUN IN toward the hero at a sprint until it crosses
 * the approach circle (`geom.approachRadius`, stamped on the enemy). */
function emitBatch(
  state: GameState,
  spawner: SpawnerRuntime,
  limit: number,
  geom: { approachRadius: number; spawnDist: number },
): number {
  const levelDefault = levelDef(state.level.id).mobLevels;
  let emitted = 0;
  for (let k = 0; k < limit && spawner.queue.length > 0; k++) {
    const defId = spawner.queue.pop()!;
    // Hard-coded level (point override → level default) sets hp + mlvl from the
    // rolled authored band; else the player-relative fallback. The menace
    // EVOLUTION stage still stacks its extra hp on top, exactly as for a wave.
    const sc = resolveMobScaling(
      spawner.mobLevels ?? levelDefault,
      state.difficulty,
      state.player.level,
      state.rng,
      mobLevelScale(state),
      currentMobLevel(state),
    );
    const enemy = spawnEnemy(
      defId,
      emitPos(state, spawner, enemyDef(defId).radius, geom.spawnDist),
      state.rng,
      state.nextId++,
      sc.hpMult,
      menaceStage(state),
      difficultyDef(state.difficulty).menaceEffectMult,
      sc.mlvl,
      sc.banded,
    );
    // Summoned to attack: it sprints in from off-screen and is already awake, so
    // the instant it reaches the circle it engages instead of dozing at its post.
    enemy.approachRadius = geom.approachRadius;
    enemy.awake = true;
    state.enemies.push(enemy);
    spawner.memberIds.push(enemy.id);
    if (enemyDef(defId).role === "minion") state.pendingMinionSpawns++;
    emitted++;
  }
  return emitted;
}

/** Is this chained point's predecessor drained and past its `afterDelayMs`? A
 * point with no `after` is always ready; a broken/unfinished chain waits. */
function chainReady(
  spawner: SpawnerRuntime,
  spawners: SpawnerRuntime[],
  now: number,
): boolean {
  if (spawner.after === null) return true;
  const pred = spawners.find((p) => p.id === spawner.after);
  return (
    !!pred &&
    pred.status === "drained" &&
    pred.drainedAtMs !== null &&
    now - pred.drainedAtMs >= spawner.afterDelayMs
  );
}

/**
 * RAISE THE ALARM: a waking mob wired to a spawn point (`Enemy.alarms`, from
 * the level's `SpawnSpec.alarms`) activates it at once — range, sight, chain
 * gate, and the rung's active cap notwithstanding — and opens the ALARM
 * WINDOW (`SPAWNERS.alarmWindowMs`) during which the point emits at the hero
 * even while he is outside its trigger radius: the worker who spots the
 * intruder and calls the floor, the patrolling sentry who pulls the camp.
 * One-shot per mob (the link is cleared), a no-op on a point already active
 * or drained, and the app is told (`spawnerAlarmed`) so the beat can be sold.
 */
export function raiseAlarm(state: GameState, enemy: Enemy): void {
  const id = enemy.alarms;
  if (id === undefined) return;
  enemy.alarms = undefined;
  const spawner = state.spawners.find((s) => s.id === id);
  if (!spawner || spawner.status !== "dormant") return;
  const now = state.stats.timeMs;
  spawner.status = "active";
  spawner.emitAtMs = now;
  spawner.alarmedUntilMs = now + SPAWNERS.alarmWindowMs;
  state.events.push({ type: "spawnerAlarmed", pos: { ...enemy.pos } });
}

/**
 * Arm the dormant points the hero has walked into — but only up to this rung's
 * simultaneous-active cap (`activeSpawnerCap`), and preferring the ones CLOSEST
 * to him. A point is eligible only if it is in trigger range, in clear LINE OF
 * SIGHT (never a wave through a wall), and its chain predecessor has drained +
 * delayed. When more points are eligible than the cap has room for, the nearest
 * arm and the rest stay dormant until an active wave drains and frees a slot —
 * so a maze never lights every spawner around the hero at once. An omitted cap
 * (JESUS, test fixtures without one) is uncapped: every eligible point arms.
 */
function armEligibleSpawners(state: GameState, now: number): void {
  const spawners = state.spawners;
  const cap = difficultyDef(state.difficulty).activeSpawnerCap;
  let active = 0;
  for (const s of spawners) if (s.status === "active") active++;
  let room = cap === undefined ? Infinity : cap - active;
  if (room <= 0) return;

  const eligible: { spawner: SpawnerRuntime; dist: number }[] = [];
  for (const spawner of spawners) {
    if (spawner.status !== "dormant") continue;
    const dist = distance(state.player.pos, spawner.at);
    if (dist > spawner.triggerRadius) continue;
    if (!lineOfSight(state, state.player.pos, spawner.at)) continue;
    if (!chainReady(spawner, spawners, now)) continue;
    eligible.push({ spawner, dist });
  }
  // Nearest first, so the cap always fills with the points the hero is standing
  // among — the ones farther off wait their turn.
  eligible.sort((a, b) => a.dist - b.dist);
  for (const { spawner } of eligible) {
    if (room <= 0) break;
    spawner.status = "active";
    spawner.emitAtMs = now; // the wave boils up at once, then drips
    room--;
  }
}

/**
 * Advance every spawn point one tick: arm the ones the hero has walked into (up
 * to the rung's cap, nearest first, and whose chain predecessor has drained +
 * delayed), SUMMON their queue in from off-screen on the emission clock, and mark
 * the drained ones so their chains can follow. A no-op on a level that authors no
 * spawners. Frozen poses and the victory lap never arm a fresh wave (matching
 * stepPacks). `view` is the current camera rect (dimensions only) — it sizes the
 * approach circle and the off-screen summon distance; headless callers (bots,
 * the sim) omit it and fall back to the phone baseline.
 */
export function stepSpawners(state: GameState, view?: ViewSize): void {
  const spawners = state.spawners;
  if (spawners.length === 0) return;
  const now = state.stats.timeMs;
  const canWake = !state.freeze && state.victoryCountdownMs === null;
  if (canWake) armEligibleSpawners(state, now);
  const geom = summonGeometry(view);
  const countRadiusSq = geom.countRadius * geom.countRadius;
  // Built lazily the first time an active point needs to count its own live
  // members against the alive cap — one pass over the enemy list, reused across
  // every spawner this tick (mirrors stepPacks).
  let enemyById: Map<number, Enemy> | null = null;

  for (const spawner of spawners) {
    if (spawner.status === "active") {
      // A live ALARM WINDOW (raiseAlarm) counts as in-range: the point pours
      // its answering squad at the hero wherever he stands. When the window
      // lapses with him still outside the trigger radius, the point falls
      // back to DORMANT (keeping whatever it already emitted) and waits to be
      // tripped the ordinary way — a paused far-off point must not hold one
      // of the rung's active slots hostage.
      const alarmed =
        spawner.alarmedUntilMs !== undefined &&
        spawner.alarmedUntilMs !== null &&
        now < spawner.alarmedUntilMs;
      // Emit ONLY while the hero is in trigger range (or the alarm rings),
      // and only up to the concurrent-alive cap: the point summons
      // replacements to hold steady local pressure instead of dumping its
      // whole queue at once. It pauses when its live members hit `maxAlive`
      // or the hero walks out of range, and summons again as a slot frees or
      // he returns.
      const nearPoint =
        distance(state.player.pos, spawner.at) <= spawner.triggerRadius;
      if (nearPoint) {
        // He arrived — the alarm has done its job; from here this is an
        // ordinary active point.
        spawner.alarmedUntilMs = null;
      } else if (
        !alarmed &&
        spawner.alarmedUntilMs !== undefined &&
        spawner.alarmedUntilMs !== null
      ) {
        // The window lapsed and he never came: fall back asleep (keeping
        // whatever was emitted) rather than hold an active slot hostage.
        spawner.alarmedUntilMs = null;
        spawner.status = "dormant";
        continue;
      }
      const inRange = nearPoint || alarmed;
      if (inRange) {
        if (!enemyById) {
          enemyById = new Map(state.enemies.map((e) => [e.id, e]));
        }
        // Count this point's live members still IN THE FIGHT: alive AND within a
        // leash of the hero (summoned mobs arrive around HIM now, not at the
        // point). A member left far behind — the hero ran off and it couldn't
        // keep up — no longer counts, so the point summons a fresh one to hold
        // pressure where he stands.
        let live = 0;
        for (const id of spawner.memberIds) {
          const e = enemyById.get(id);
          if (e && distanceSq(e.pos, state.player.pos) <= countRadiusSq) {
            live++;
          }
        }
        // A member died (or was left behind) since last tick while under the cap:
        // hold the replacement for the POST-KILL RESPAWN DELAY before summoning
        // it. Set once — the deferred `emitAtMs` survives the tail clamp below
        // (it only pulls a PAST clock forward), so the wait runs down cleanly.
        if (live < spawner.lastLive && live < spawner.maxAlive) {
          spawner.emitAtMs = Math.max(
            spawner.emitAtMs,
            now + spawner.respawnDelayMs,
          );
        }
        // Release a batch every interval; a guard caps catch-up after a long tick.
        let batches = 0;
        while (
          now >= spawner.emitAtMs &&
          spawner.queue.length > 0 &&
          batches < 8
        ) {
          const room = spawner.maxAlive - live;
          if (room <= 0) break; // at the cap — hold until a kill frees a slot
          live += emitBatch(
            state,
            spawner,
            Math.min(spawner.perEmit, room),
            geom,
          );
          spawner.emitAtMs += spawner.intervalMs;
          batches++;
        }
        spawner.lastLive = live;
      }
      // Clamp the clock to now whenever the point spent this tick paused (at the
      // cap or out of range) so a stretch of holding never banks a catch-up
      // burst — the drip always resumes at the normal cadence. A respawn delay
      // scheduled in the FUTURE is left intact (the clamp only pulls forward).
      if (now > spawner.emitAtMs) spawner.emitAtMs = now;
      if (spawner.queue.length === 0) {
        spawner.status = "drained";
        spawner.drainedAtMs = now;
      }
    }
  }
}

/**
 * Foes a level's spawn points still OWE — every mob queued in a point that has
 * not drained yet. Folded into the HUD's remaining-foe total (like a dormant
 * pack's unspawned members), so the "STAFF: N" readout counts the whole level's
 * horde, not just what is currently on screen.
 */
export function unspawnedFromSpawners(state: GameState): number {
  let owed = 0;
  for (const spawner of state.spawners) owed += spawner.queue.length;
  return owed;
}
