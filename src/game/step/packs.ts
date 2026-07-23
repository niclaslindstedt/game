// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Placed packs — the movement-driven designed encounters (see stepPacks's doc
// comment). Part of the step pipeline (see ./index.ts).

import { clamp, distance, type Vec2 } from "@game/lib/vec.ts";
import { PACKS } from "../config/index.ts";
import { spawnEnemy } from "../create.ts";
import { difficultyDef, resolvePackCount } from "../defs/difficulties.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { levelDef, type PackSpec } from "../defs/levels/index.ts";
import {
  currentMobLevel,
  menaceStage,
  mobLevelScale,
  resolveMobScaling,
} from "../menace.ts";
import { insideObstacle } from "../obstacles.ts";
import type { GameState, PackState } from "../types/index.ts";
import { insideNoSpawnZone } from "./spawner.ts";

/**
 * PLACED PACKS (config PACKS / `LevelDef.packs`): the movement-driven counter
 * to the survivors-style wave horde. Each pack SLEEPS on its patch of ground
 * until the player closes to its trigger radius, then WAKES — its members
 * spawn scattered around the anchor and give chase at once — and once every
 * woken member is dead the pack is CLEARED for good. A map built from packs is
 * emptied by WALKING it, one designed encounter at a time, instead of farmed
 * from a standstill. Dormant packs still count as unspawned foes, so a
 * `clearAll` level isn't won until every pack has been reached and wiped.
 */
// Scratch for stepPacks' live-id gather (valid only within one call).
const aliveScratch = new Set<number>();

export function stepPacks(state: GameState): void {
  const packs = state.packs;
  if (packs.length === 0) return;
  const specs = levelDef(state.level.id).packs ?? [];
  // A frozen pose (scenario staging) or the post-objective victory lap never
  // wakes a fresh fight; already-active packs still resolve their clears.
  const canWake = !state.freeze && state.victoryCountdownMs === null;
  // Built lazily and only when an active pack needs it: the set of live enemy
  // ids, so "are any of this pack's members still up?" is O(members), not
  // O(members × enemies) every tick. The set itself is module-scratch, filled
  // in place — building a fresh Set (plus a mapped id array) every tick of an
  // active pack fight was steady GC pressure at horde scale.
  let aliveIds: Set<number> | null = null;
  for (let i = 0; i < packs.length; i++) {
    const pack = packs[i] as PackState;
    if (pack.status === "dormant") {
      if (
        canWake &&
        distance(state.player.pos, pack.at) <= pack.triggerRadius
      ) {
        wakePack(state, pack, specs[i] as PackSpec);
      }
    } else if (pack.status === "active") {
      if (!aliveIds) {
        aliveScratch.clear();
        for (const e of state.enemies) aliveScratch.add(e.id);
        aliveIds = aliveScratch;
      }
      if (!pack.memberIds.some((id) => aliveIds!.has(id))) {
        pack.status = "cleared";
        const remaining = packs.filter((p) => p.status !== "cleared").length;
        state.events.push({
          type: "packCleared",
          pos: { ...pack.at },
          remaining,
        });
      }
    }
  }
}

/**
 * Wake one dormant pack: mint every member scattered around the anchor and set
 * it fighting. Members spawn at the horde's live relative level and current
 * menace stage (like a wave spawn), so a pack reached late in a long run is
 * still a threat rather than trivial fodder. A pack that resolves to zero
 * members on this rung is marked cleared without a peep.
 */
function wakePack(state: GameState, pack: PackState, spec: PackSpec): void {
  for (const member of spec.members) {
    const count = resolvePackCount(member.count, state.difficulty);
    const radius = enemyDef(member.enemy).radius;
    for (let n = 0; n < count; n++) {
      const psc = resolveMobScaling(
        levelDef(state.level.id).mobLevels,
        state.difficulty,
        state.player.level,
        state.rng,
        mobLevelScale(state),
        currentMobLevel(state),
      );
      const enemy = spawnEnemy(
        member.enemy,
        packMemberPos(state, pack, radius),
        state.rng,
        state.nextId++,
        psc.hpMult,
        menaceStage(state),
        difficultyDef(state.difficulty).menaceEffectMult,
        psc.mlvl,
        psc.banded,
      );
      state.enemies.push(enemy);
      pack.memberIds.push(enemy.id);
      // A woken pack member counts toward the clearance gate like a wave spawn.
      if (enemyDef(member.enemy).role === "minion") state.pendingMinionSpawns++;
    }
  }
  if (pack.memberIds.length > 0) {
    pack.status = "active";
    state.events.push({
      type: "packAwoken",
      pos: { ...pack.at },
      count: pack.memberIds.length,
    });
  } else {
    pack.status = "cleared";
  }
}

/**
 * A spawn spot for one pack member: uniformly scattered within the pack's
 * `spawnRadius` of its anchor (sqrt for an even fill of the disc, not a
 * center-heavy clump), rejection-sampled to clear obstacles and the map edge.
 * Falls back to the clamped anchor rather than fail — a stacked spawn is
 * better than a missing member the clear count would wait on forever.
 */
function packMemberPos(
  state: GameState,
  pack: PackState,
  radius: number,
): Vec2 {
  const { width, height } = state.level;
  for (let attempt = 0; attempt < PACKS.placeAttempts; attempt++) {
    const angle = state.rng() * Math.PI * 2;
    const dist = Math.sqrt(state.rng()) * pack.spawnRadius;
    const pos = {
      x: clamp(pack.at.x + Math.cos(angle) * dist, radius, width - radius),
      y: clamp(pack.at.y + Math.sin(angle) * dist, radius, height - radius),
    };
    if (!insideObstacle(state, pos, radius) && !insideNoSpawnZone(state, pos))
      return pos;
  }
  return {
    x: clamp(pack.at.x, radius, width - radius),
    y: clamp(pack.at.y, radius, height - radius),
  };
}
