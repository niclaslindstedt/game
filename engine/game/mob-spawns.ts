// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MOB POSTS (config MOB_SPAWNS, `LevelDef.mobSpawns`, state `MobSpawnState`):
// the ONE-MOB-PER-SPAWN model — the WoW garrison the STATIC PARTS maps field
// instead of knot spawn points.
//
// Every mob on such a floor is an INDIVIDUAL with a post: it is spawned
// dormant at level creation, standing (or walking its patrol beat) exactly
// where its part's author put it, and it wakes the ordinary way — aggro and
// line of sight. What this module owns is the other half of the model: the
// RESPAWN. A post is VACATED the moment its occupant dies or is DRAGGED off
// its leash chasing a hero (the user-visible difference from the knots: pull
// a room across the map and the room fills back in behind you). A vacated
// post starts the run's respawn clock — the authored base scaled by the
// difficulty's `spawnerRespawnMult`, the same ladder the spawn points refill
// on, so higher rungs repopulate faster — and when the clock runs out a fresh
// occupant stands the post, dormant, exactly where the last one stood.
//
// Two guards keep it honest:
//
//   NO POP-INS. A due respawn is HELD while any hero stands within
//   `MOB_SPAWNS.clearRadius` of the post — a mob must never blink into being
//   in front of somebody looking at the spot. The clock stays expired; the
//   mob stands up the moment the hero steps away. (Standing ON a post to hold
//   it down is legitimate play — that is a hero guarding a grave.)
//
//   A `clearAll` LEVEL NEVER RESPAWNS. An objective that counts every foe
//   dead cannot be asked of a floor that refills; the posts spawn their first
//   watch and then stand down.
//
// Determinism: creation-time placement rides `createGame`'s main stream like
// every placed mob; the respawn itself draws `state.rng` at runtime, which is
// dynamic, server-authoritative state exactly like the spawn points' summons.

import { distance } from "@game/lib/vec.ts";
import { MOB_SPAWNS } from "./config/index.ts";
import { spawnEnemy } from "./create.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { runLevelDef } from "./defs/levels/index.ts";
import {
  currentMobLevel,
  menaceStage,
  mobLevelScale,
  resolveMobScaling,
} from "./menace.ts";
import { insideObstacle } from "./obstacles.ts";
import { anyHeroWithin } from "./party.ts";
import type { Enemy, GameState, MobSpawnState } from "./types/index.ts";

/**
 * Stand a fresh occupant on a post — dormant, homed there, linked back.
 *
 * The FIRST watch is spawned by `create.ts` on the creation stream (like every
 * placed mob); this is the runtime refill, and it deliberately mirrors what
 * creation stamps — post link, patrol beat, dormancy — so the replacement is
 * indistinguishable from the mob it replaces.
 */
function standPost(state: GameState, post: MobSpawnState): Enemy {
  const sc = resolveMobScaling(
    post.mobLevels ?? runLevelDef(state).mobLevels,
    state.difficulty,
    // The party's level for the relative fallback; posts almost always carry
    // an authored band, so this is the same read the spawn points make.
    state.players.reduce((top, p) => Math.max(top, p.level), 1),
    state.rng,
    mobLevelScale(state),
    currentMobLevel(state),
  );
  const at = clearSpot(state, post, enemyDef(post.enemy).radius);
  const enemy = spawnEnemy(
    post.enemy,
    { x: at.x, y: at.y },
    state.rng,
    state.nextId++,
    sc.hpMult,
    menaceStage(state),
    sc.mlvl,
    sc.banded,
  );
  // Dormant at its post: it wakes on aggro like any placed mob — never
  // summoned-in awake the way a spawn point's members are.
  enemy.post = post.id;
  if (post.patrol && post.patrol.length > 0) {
    enemy.patrol = [
      { x: post.at.x, y: post.at.y },
      ...post.patrol.map((p) => ({ x: p.x, y: p.y })),
    ];
    enemy.patrolIndex = 1;
    enemy.patrolDir = 1;
  }
  state.enemies.push(enemy);
  post.mobId = enemy.id;
  post.respawnAtMs = null;
  if (enemyDef(post.enemy).role === "minion") state.pendingMinionSpawns++;
  return enemy;
}

/** A spot on (or spiralled just off) the post that is clear of obstacles — the
 * furniture may have grown since creation (`obstaclesVersion` movers). */
function clearSpot(
  state: GameState,
  post: MobSpawnState,
  radius: number,
): { x: number; y: number } {
  if (!insideObstacle(state, post.at, radius)) return post.at;
  for (let ring = 1; ring <= 4; ring++) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const pos = {
        x: post.at.x + Math.cos(angle) * ring * 20,
        y: post.at.y + Math.sin(angle) * ring * 20,
      };
      if (!insideObstacle(state, pos, radius)) return pos;
    }
  }
  return post.at;
}

/**
 * The per-tick pass: vacate posts whose occupant died or was dragged off, and
 * refill the vacant ones whose clock has run out.
 */
export function stepMobSpawns(state: GameState): void {
  if (state.mobSpawns.length === 0) return;
  const now = state.stats.timeMs;
  // One id → enemy map per tick, so a floor of two hundred posts costs a walk
  // of the enemy list rather than two hundred of them.
  const byId = new Map<number, Enemy>();
  for (const enemy of state.enemies) byId.set(enemy.id, enemy);
  // An objective that counts every foe dead cannot be asked of a floor that
  // refills: the posts spawn their first watch and stand down.
  const respawns = runLevelDef(state).objective.type !== "clearAll";
  for (const post of state.mobSpawns) {
    if (post.mobId !== null) {
      const mob = byId.get(post.mobId);
      if (
        mob &&
        (!mob.awake || distance(mob.pos, post.at) <= MOB_SPAWNS.leashRadius)
      )
        continue;
      // Killed, or awake and dragged past the leash: the post is vacated and
      // the clock starts. A dragged occupant keeps living wherever the fight
      // takes it — the post just stops being its home.
      if (mob) mob.post = undefined;
      post.mobId = null;
      post.respawnAtMs = respawns ? now + post.respawnMs : null;
      continue;
    }
    if (post.respawnAtMs === null || now < post.respawnAtMs) continue;
    // NO POP-INS: held — not cleared — while somebody is close enough to watch.
    if (anyHeroWithin(state, post.at, MOB_SPAWNS.clearRadius)) continue;
    standPost(state, post);
  }
}
