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
//
// HELLGATES (config HELLGATES, `SpawnerSpec.hellgate`, marked by
// `SpawnerRuntime.openStage`) are the same machinery driven by the MENACE meter
// instead of by proximity alone. A gate is INVISIBLE to the arming pass until
// the rampage reaches its `openStage` — so on a calm run the whole system may as
// well not exist — and from there every stage past that threshold makes it
// WORSE: `hellgateTuning` re-derives its alive cap, batch size, batch interval
// and post-kill refill from the live stage each tick, and `hellgateActiveCap`
// lets more gates burn at once, all from their OWN budget so the ordinary
// horde's pacing is untouched. A gate never runs dry while the meter holds (it
// re-queues its authored `refill` mix); it falls back to dormant only once the
// rampage cools below its threshold, ready to tear open again. What comes
// through is `hellborn` — elite-sized, map-unique, and the one crop whose drops
// get BETTER with the rampage instead of worse (see `dropMinionLoot`).

import { clamp, distance, distanceSq, type Vec2 } from "@game/lib/vec.ts";
import { HELLGATES, SPAWNERS } from "./config/index.ts";
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
import type { Enemy, GameState, SpawnerRuntime } from "./types/index.ts";
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

/** Is this point a HELLGATE (config HELLGATES)? Marked by carrying an
 * `openStage` — the rampage stage it stays shut below (see create.ts). */
function isHellgate(spawner: SpawnerRuntime): boolean {
  return (spawner.openStage ?? 0) > 0;
}

/**
 * How many rampage STAGES this gate is open BY: the live menace stage minus its
 * `openStage`, floored at 0. Every hellgate escalation reads this one number, so
 * "deeper rampage = worse gate" is a single monotone dial rather than a rule per
 * knob. Negative (the meter below the threshold) means the gate is SHUT.
 */
function stagesOver(state: GameState, spawner: SpawnerRuntime): number {
  return menaceStage(state) - (spawner.openStage ?? 0);
}

/**
 * The live emission tuning one HELLGATE runs at, re-derived from the rampage
 * every tick (config HELLGATES): the deeper the meter, the WIDER its alive cap,
 * the THICKER each batch, and the SHORTER both the gap between batches and the
 * post-kill refill wait. The two time knobs share one divisor
 * (`1 + over × intervalShrinkPerStage`) so cadence tightens as one motion; every
 * value is bounded so a stage-100 nightmare (or an uncapped JESUS rampage)
 * saturates into a flood rather than diverging.
 */
function hellgateTuning(
  state: GameState,
  spawner: SpawnerRuntime,
): {
  maxAlive: number;
  perEmit: number;
  intervalMs: number;
  respawnMs: number;
} {
  const over = Math.max(0, stagesOver(state, spawner));
  const speedup = 1 + over * HELLGATES.intervalShrinkPerStage;
  return {
    maxAlive: Math.min(
      HELLGATES.maxAliveCap,
      Math.round(HELLGATES.maxAlive + over * HELLGATES.alivePerStage),
    ),
    perEmit: Math.min(
      HELLGATES.perEmitCap,
      Math.round(HELLGATES.perEmit + over * HELLGATES.perEmitPerStage),
    ),
    intervalMs: Math.max(
      HELLGATES.intervalMinMs,
      Math.round(HELLGATES.intervalMs / speedup),
    ),
    respawnMs: Math.max(
      HELLGATES.respawnDelayMinMs,
      Math.round(HELLGATES.respawnDelayMs / speedup),
    ),
  };
}

/** How many HELLGATES may burn at once right now: `HELLGATES.activeCap` plus a
 * slot per `activeCapStagesPerSlot` stages of rampage past the deepest open
 * gate's threshold, capped at `activeCapMax`. Its own budget — the rung's
 * `activeSpawnerCap` governs the ordinary points and is left to them. */
function hellgateActiveCap(state: GameState): number {
  const stage = menaceStage(state);
  const over = Math.max(0, stage - HELLGATES.openStage);
  return Math.min(
    HELLGATES.activeCapMax,
    HELLGATES.activeCap +
      Math.floor(over / Math.max(1, HELLGATES.activeCapStagesPerSlot)),
  );
}

/** Live HELLBORN mobs on the board — the ALL-GATES-TOGETHER ceiling
 * (`HELLGATES.globalMaxAlive`) the frame budget leans on, counted once per tick
 * and spent down as the gates emit. The ordinary horde is not counted: it has
 * its own pacing and the gates are additive pressure on top of it. */
function countHellborn(state: GameState): number {
  let n = 0;
  for (const e of state.enemies) if (enemyDef(e.defId).hellborn) n++;
  return n;
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
  // A HELLGATE answers to the rampage meter alone — no sentry can shout one
  // open ahead of its `openStage`.
  if (isHellgate(spawner) && stagesOver(state, spawner) < 0) return;
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
  // Ordinary points and HELLGATES draw on SEPARATE budgets: a rampage tearing
  // gates open must not starve the maze's own pacing, and the rung's
  // `activeSpawnerCap` must not throttle the spectacle the meter earned.
  let active = 0;
  let activeGates = 0;
  for (const s of spawners) {
    if (s.status !== "active") continue;
    if (isHellgate(s)) activeGates++;
    else active++;
  }
  let room = cap === undefined ? Infinity : cap - active;
  let gateRoom = hellgateActiveCap(state) - activeGates;
  if (room <= 0 && gateRoom <= 0) return;

  const eligible: { spawner: SpawnerRuntime; dist: number; gate: boolean }[] =
    [];
  for (const spawner of spawners) {
    if (spawner.status !== "dormant") continue;
    const gate = isHellgate(spawner);
    // A hellgate is simply not there until the rampage reaches its threshold.
    if (gate && stagesOver(state, spawner) < 0) continue;
    const dist = distance(state.player.pos, spawner.at);
    if (dist > spawner.triggerRadius) continue;
    if (!lineOfSight(state, state.player.pos, spawner.at)) continue;
    if (!chainReady(spawner, spawners, now)) continue;
    eligible.push({ spawner, dist, gate });
  }
  // Nearest first, so each budget always fills with the points the hero is
  // standing among — the ones farther off wait their turn.
  eligible.sort((a, b) => a.dist - b.dist);
  for (const { spawner, gate } of eligible) {
    if (gate) {
      if (gateRoom <= 0) continue;
      gateRoom--;
    } else {
      if (room <= 0) continue;
      room--;
    }
    spawner.status = "active";
    spawner.emitAtMs = now; // the wave boils up at once, then drips
    // A gate TEARING OPEN is a beat in its own right — the app sounds it and
    // washes the screen, so the player reads the rampage's answer arriving
    // rather than just noticing the horde got worse.
    if (gate) {
      state.events.push({
        type: "hellgateOpened",
        pos: { ...spawner.at },
        stage: menaceStage(state),
      });
    }
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
 *
 * A HELLGATE takes three extra turns here, all off the live rampage stage: its
 * cadence is re-derived every tick (`hellgateTuning`), its queue RE-FILLS rather
 * than draining while the meter holds, and it SHUTS — back to dormant, its live
 * mobs left to be fought — the moment the rampage cools below its threshold.
 * The global hellborn ceiling (`HELLGATES.globalMaxAlive`) is counted once and
 * spent across every gate, so the whole system's contribution to the field is
 * bounded however many gates the hero has standing open.
 */
// Scratch for stepSpawners' live-member lookup (valid only within one call).
const enemyScratch = new Map<number, Enemy>();

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
  // The all-gates hellborn budget, counted lazily (only once a gate is actually
  // burning) and spent down as gates emit this tick.
  let hellbornRoom: number | null = null;

  for (const spawner of spawners) {
    const gate = isHellgate(spawner);
    if (gate && spawner.status !== "dormant") {
      // THE RAMPAGE COOLED: the gate closes. Back to dormant (not drained — a
      // gate is never finished) with a fresh mix queued, so it tears open again
      // the next time the meter climbs back to its threshold. Whatever it
      // already let through stays on the board to be fought.
      if (stagesOver(state, spawner) < 0) {
        spawner.status = "dormant";
        spawner.alarmedUntilMs = null;
        spawner.queue = [...(spawner.refill ?? [])];
        spawner.lastLive = 0;
        continue;
      }
      // Never runs dry while it holds: re-queue the authored mix in place of
      // draining, and re-derive the whole cadence from the live rampage stage.
      if (spawner.queue.length === 0)
        spawner.queue = [...(spawner.refill ?? [])];
      const tuning = hellgateTuning(state, spawner);
      spawner.maxAlive = tuning.maxAlive;
      spawner.perEmit = tuning.perEmit;
      spawner.intervalMs = tuning.intervalMs;
      spawner.respawnDelayMs = tuning.respawnMs;
      if (hellbornRoom === null) {
        hellbornRoom = HELLGATES.globalMaxAlive - countHellborn(state);
      }
      // At the global ceiling the gate simply holds this tick — the field is as
      // full of hellborn as the frame budget allows.
      if (hellbornRoom <= 0) {
        if (now > spawner.emitAtMs) spawner.emitAtMs = now;
        continue;
      }
      spawner.maxAlive = Math.min(spawner.maxAlive, hellbornRoom);
    }
    if (spawner.status === "active") {
      const emittedBefore = spawner.memberIds.length;
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
          // Module-scratch, filled in place: a fresh Map (plus the mapped
          // entry array) per tick of an active point was steady GC pressure
          // at horde scale.
          enemyScratch.clear();
          for (const e of state.enemies) enemyScratch.set(e.id, e);
          enemyById = enemyScratch;
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
      // Spend what this gate let through out of the all-gates budget, so several
      // open gates share one ceiling instead of each filling to it.
      if (gate && hellbornRoom !== null) {
        hellbornRoom -= spawner.memberIds.length - emittedBefore;
      }
      // An emptied point is DRAINED (its chain may follow). A HELLGATE is never
      // finished — it re-queues at the top of the next tick and keeps pouring
      // while the rampage holds — so it stays active instead.
      if (spawner.queue.length === 0 && !gate) {
        spawner.status = "drained";
        spawner.drainedAtMs = now;
      }
    }
  }
  // Drop the scratch's Enemy refs so slain mobs aren't pinned until the next
  // active-point tick.
  enemyScratch.clear();
}

/**
 * Foes a level's spawn points still OWE — every mob queued in a point that has
 * not drained yet. Folded into the HUD's remaining-foe total (like a dormant
 * pack's unspawned members), so the "STAFF: N" readout counts the whole level's
 * horde, not just what is currently on screen.
 *
 * HELLGATES are excluded: their queue re-fills forever while the rampage holds,
 * so counting it would both inflate the readout by a fixed amount on every
 * nightmare run and make the number meaningless the moment a gate opens. What a
 * gate has already let through is alive on the board and counted there.
 */
export function unspawnedFromSpawners(state: GameState): number {
  let owed = 0;
  for (const spawner of state.spawners) {
    if ((spawner.openStage ?? 0) > 0) continue;
    owed += spawner.queue.length;
  }
  return owed;
}
