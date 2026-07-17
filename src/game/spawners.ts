// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SPAWN POINTS (config SPAWNERS, `LevelDef.spawners`, state `SpawnerRuntime`):
// the FINITE, LOCAL horde model — the alternative to the endless `waves` stream
// (stepSpawner). Each point sleeps until the hero trips its `triggerRadius`,
// then EMITS its queued mobs a few (`perEmit`) at a time every `intervalMs`
// until it DRAINS empty — one readable wave the hero can clear and walk away
// from. Emission holds to a per-point CONCURRENT-ALIVE CAP (`maxAlive`) and only
// runs while the hero is in trigger range: at the cap (or once he steps out) the
// point pauses, then drips a fresh batch to REPLACE each kill — steady local
// pressure rather than a dumped pile — and the queue still drains as he grinds
// the cap down. A point may CHAIN off another (`after`): it arms `afterDelayMs`
// after that one drains, but only while the hero is still in its trigger range,
// so pressure follows him without a bottomless refill. This is what lets a level
// actually be CLEARED and a maze be traversed without an infinite bog. Emitted
// mobs are scaled exactly like a woken pack's (menace stage + mob level), so a
// spawner wave hits as hard as the difficulty's horde.

import { clamp, distance, type Vec2 } from "@game/lib/vec.ts";
import { SPAWNERS } from "./config.ts";
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
import type { GameState, SpawnerRuntime } from "./types.ts";
import { anyZoneContains } from "./zones.ts";

/** A spawn spot for one emitted mob: scattered within the point's `spawnRadius`
 * (sqrt for an even disc fill), rejection-sampled clear of obstacles, the map
 * edge, and no-spawn zones; falls back to the clamped anchor. Mirrors
 * `packMemberPos`. */
function emitPos(
  state: GameState,
  spawner: SpawnerRuntime,
  radius: number,
): Vec2 {
  const { width, height } = state.level;
  const def = levelDef(state.level.id);
  for (let attempt = 0; attempt < SPAWNERS.placeAttempts; attempt++) {
    const angle = state.rng() * Math.PI * 2;
    const dist = Math.sqrt(state.rng()) * spawner.spawnRadius;
    const pos = {
      x: clamp(spawner.at.x + Math.cos(angle) * dist, radius, width - radius),
      y: clamp(spawner.at.y + Math.sin(angle) * dist, radius, height - radius),
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
    x: clamp(spawner.at.x, radius, width - radius),
    y: clamp(spawner.at.y, radius, height - radius),
  };
}

/** Emit up to `limit` queued mobs from a spawner (fewer if the queue runs out),
 * scaled to the run's horde like a woken pack. `limit` is `perEmit` clamped by
 * the room left under the concurrent-alive cap. */
function emitBatch(
  state: GameState,
  spawner: SpawnerRuntime,
  limit: number,
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
      emitPos(state, spawner, enemyDef(defId).radius),
      state.rng,
      state.nextId++,
      sc.hpMult,
      menaceStage(state),
      difficultyDef(state.difficulty).menaceEffectMult,
      sc.mlvl,
      sc.banded,
    );
    state.enemies.push(enemy);
    spawner.memberIds.push(enemy.id);
    if (enemyDef(defId).role === "minion") state.pendingMinionSpawns++;
    emitted++;
  }
  return emitted;
}

/**
 * Advance every spawn point one tick: arm the ones the hero has walked into (and
 * whose chain predecessor has drained + delayed), drip their queue out on the
 * emission clock, and mark the drained ones so their chains can follow. A no-op
 * on a level that authors no spawners. Frozen poses and the victory lap never
 * arm a fresh wave (matching stepPacks).
 */
export function stepSpawners(state: GameState): void {
  const spawners = state.spawners;
  if (spawners.length === 0) return;
  const now = state.stats.timeMs;
  const canWake = !state.freeze && state.victoryCountdownMs === null;
  // Built lazily the first time an active point needs to count its own live
  // members against the alive cap — one pass over the enemy list, reused across
  // every spawner this tick (mirrors stepPacks).
  let aliveIds: Set<number> | null = null;

  for (const spawner of spawners) {
    if (spawner.status === "dormant") {
      if (!canWake) continue;
      if (distance(state.player.pos, spawner.at) > spawner.triggerRadius) {
        continue;
      }
      // Don't arm across a wall: the hero must have a clear LINE to the point,
      // so a spawn tucked behind a shelf boils up only once he rounds into view
      // of it — never a wave materialising through a solid wall beside him.
      if (!lineOfSight(state, state.player.pos, spawner.at)) continue;
      if (spawner.after !== null) {
        const pred = spawners.find((p) => p.id === spawner.after);
        if (
          !pred ||
          pred.status !== "drained" ||
          pred.drainedAtMs === null ||
          now - pred.drainedAtMs < spawner.afterDelayMs
        ) {
          continue; // chain not ready — wait (the hero is here, keep counting)
        }
      }
      spawner.status = "active";
      spawner.emitAtMs = now; // the wave boils up at once, then drips
    }

    if (spawner.status === "active") {
      // Emit ONLY while the hero is in trigger range, and only up to the
      // concurrent-alive cap: the point drips to REPLACE kills, holding steady
      // local pressure instead of dumping its whole queue at once. It pauses
      // when its live members hit `maxAlive` or the hero walks out of range,
      // and drips again as a slot frees or he returns.
      const inRange =
        distance(state.player.pos, spawner.at) <= spawner.triggerRadius;
      if (inRange) {
        // Count this point's live members ONCE from the tick's enemy snapshot,
        // then track emissions incrementally — so a multi-batch catch-up tick
        // still respects the cap (the snapshot can't see mobs it just emitted).
        let live = -1;
        // Release a batch every interval; a guard caps catch-up after a long tick.
        let batches = 0;
        while (
          now >= spawner.emitAtMs &&
          spawner.queue.length > 0 &&
          batches < 8
        ) {
          if (live < 0) {
            if (!aliveIds) aliveIds = new Set(state.enemies.map((e) => e.id));
            live = 0;
            for (const id of spawner.memberIds) if (aliveIds.has(id)) live++;
          }
          const room = spawner.maxAlive - live;
          if (room <= 0) break; // at the cap — hold until a kill frees a slot
          live += emitBatch(state, spawner, Math.min(spawner.perEmit, room));
          spawner.emitAtMs += spawner.intervalMs;
          batches++;
        }
      }
      // Clamp the clock to now whenever the point spent this tick paused (at the
      // cap or out of range) so a stretch of holding never banks a catch-up
      // burst — the drip always resumes at the normal cadence.
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
