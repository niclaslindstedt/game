// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The wave spawner — the escalating ambient horde (see stepSpawner's doc
// comment for the pressure model). Part of the step pipeline (see ./index.ts).

import { clamp, distance, distanceSq, type Vec2 } from "@game/lib/vec.ts";
import { CAMPING, ENEMY_AI, NUKE, TEMPO } from "../config/index.ts";
import { spawnEnemy } from "../create.ts";
import {
  difficultyDef,
  meetsMinDifficulty,
  scaledMobCount,
} from "../defs/difficulties.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { levelDef } from "../defs/levels/index.ts";
import { unspawnedMinions } from "../loot.ts";
import {
  currentMobLevel,
  lureMult,
  menaceStage,
  mobLevelScale,
  resolveMobScaling,
} from "../menace.ts";
import { insideObstacle } from "../obstacles.ts";
import { BALANCE } from "../tuning.ts";
import type { GameState } from "../types.ts";
import { anyZoneContains } from "../zones.ts";

/**
 * The horde spawner, three pressures stacked plus two anti-camp flows.
 * (1) Each wave-budget line streams its count in over its time window,
 * eased quadratically, so the ramp ends in an overwhelming flood.
 * (2) Walking the level spends moveSpawnCredit — every `moveSpawnEvery` px
 * stirs one extra monster awake. (3) A live floor (`minAlive`) pulls spawns
 * forward whenever the field goes quiet, so there is always a pack on
 * screen. All three draw from the same finite budget; spawns land in a ring
 * just outside the player's view and give chase at once; the live cap
 * defers (never cancels) what the field can't hold.
 *
 * CAMPING starves the first and third pressures (config CAMPING): a player
 * who parks in one spot stops being fed after a grace period — the floor
 * fades out and the timed stream holds — and the only arrivals left are a
 * slow BECKONING trickle walking in from the objective's direction, luring
 * him onward. Moving re-anchors the camp clock and the held flood resumes.
 * And once a killBoss level's budget is fully spent, a thin endless
 * STRAGGLER stream keeps arriving from that same direction, so the walk to
 * the boss never crosses a dead-empty map.
 */
export function stepSpawner(state: GameState, dtMs: number): void {
  const waves = levelDef(state.level.id).waves;
  if (!waves) return;

  // The camp clock: staying inside campRadius of where the player last
  // settled counts up; stepping out re-anchors and resets. Starvation eases
  // 0→1 across the fade window once the grace runs out.
  if (distance(state.player.pos, state.campAnchor) > CAMPING.campRadius) {
    state.campAnchor = { ...state.player.pos };
    state.campMs = 0;
  } else {
    state.campMs += dtMs;
  }
  const starvation = clamp(
    (state.campMs - CAMPING.graceMs) / CAMPING.fadeMs,
    0,
    1,
  );
  state.trickleMs = Math.max(0, state.trickleMs - dtMs);

  // NUKE AFTERMATH (config NUKE, set by detonateNuke): hold EVERY refill —
  // floor, walk-credit, timed stream, trickle — while the post-blast calm
  // runs, so the screen a screen-nuke just cleared stays clear long enough to
  // break away instead of the ring repopulating on the spot. The wave budget
  // is only deferred, never canceled (the window math is monotone), so the
  // held flood resumes intact once the calm burns down.
  state.nukeCalmMs = Math.max(0, state.nukeCalmMs - dtMs);
  if (state.nukeCalmMs > 0) {
    // Fleeing during the calm still banks walk-credit (stepPlayer), but the
    // cap below is never reached while we bail out here — so a multi-second
    // run would bank an UNBOUNDED pile that dumps straight to maxAlive the
    // instant the calm ends, slamming the screen fuller than the bomb left it
    // ("they respawn more than I killed"). Clamp it to the same ceiling a
    // normal flee banks, so refills resume at the ordinary walk rate.
    state.moveSpawnCredit = Math.min(
      state.moveSpawnCredit,
      waves.moveSpawnEvery * 8,
    );
    return;
  }
  // The calm has burned off: now the RECOVERY window runs (config NUKE), easing
  // the near-floor back 0→1 to full so the swarm walks back in at the normal
  // rate instead of the whole floor snapping onto the player in one frame.
  state.nukeRecoverMs = Math.max(0, state.nukeRecoverMs - dtMs);
  const nukeRecover =
    NUKE.recoverMs > 0 ? 1 - state.nukeRecoverMs / NUKE.recoverMs : 1;

  // Difficulty scales the horde: every budget line grows by the mob
  // multiplier, and the live cap/floor stretch so the bigger budget can
  // actually crowd the field instead of queueing behind medium's cap. Menace
  // stacks on top — a rampaging player lures a denser, bigger crowd (lureMult
  // ≥ 1), so the floor and cap both swell with the escalation.
  // The level's TEMPO curve scales the whole pressure envelope over the run —
  // a lull dips both cap and floor, a surge lifts them (LevelDef.tempo). Flat 1
  // when the level authors no curve.
  const tempo = tempoIntensity(state);
  const aliveMult =
    difficultyDef(state.difficulty).aliveMult *
    lureMult(state) *
    BALANCE.hordeSize *
    tempo;
  const maxAlive = Math.round(waves.maxAlive * aliveMult);
  // The floor starves as the player camps: a parked hero watches his
  // surroundings drain instead of farming an endless refill. The post-nuke
  // recovery ramp tapers it the same way for a few seconds after the calm, so
  // the cleared screen refills gradually rather than all at once.
  const minAlive = Math.round(
    waves.minAlive * aliveMult * (1 - starvation) * nukeRecover,
  );

  let alive = 0;
  let near = 0; // minions close enough to count as "on the player's screen"
  const nearRadiusSq = ENEMY_AI.nearRadius * ENEMY_AI.nearRadius;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).role !== "minion") continue;
    alive++;
    if (distanceSq(enemy.pos, state.player.pos) <= nearRadiusSq) near++;
  }

  // A fully-starved camper also pauses the timed stream — the horde loses
  // interest in a parked target. The window math is monotone, so nothing is
  // canceled: the held backlog floods back in the moment he moves on.
  const t = state.stats.timeMs;
  if (starvation < 1) {
    outer: for (let i = 0; i < waves.budget.length; i++) {
      const entry = waves.budget[i] as (typeof waves.budget)[number];
      // A budget line below its difficulty gate never streams in.
      if (!meetsMinDifficulty(state.difficulty, entry.minDifficulty)) continue;
      const count = scaledMobCount(entry.count, state.difficulty);
      const spawned = state.waveSpawned[i] ?? 0;
      if (spawned >= count) continue;

      const start = entry.window[0] * waves.rampDurationMs;
      const end = entry.window[1] * waves.rampDurationMs;
      const progress = clamp((t - start) / Math.max(1, end - start), 0, 1);
      const eased = progress * progress;
      let due = Math.floor(count * eased) - spawned;

      while (due-- > 0 && alive < maxAlive) {
        if (!spawnWaveEnemy(state, entry.enemy)) break outer;
        state.waveSpawned[i] = (state.waveSpawned[i] ?? 0) + 1;
        alive++;
      }
    }
  }

  // Movement pressure: spend the walked distance banked by stepPlayer.
  while (state.moveSpawnCredit >= waves.moveSpawnEvery && alive < maxAlive) {
    if (!spawnFromBudget(state, waves)) break;
    state.moveSpawnCredit -= waves.moveSpawnEvery;
    alive++;
  }
  // A capped field must not bank an instant flood for later.
  state.moveSpawnCredit = Math.min(
    state.moveSpawnCredit,
    waves.moveSpawnEvery * 8,
  );

  // The floor: while the budget lasts, the player's surroundings never go
  // quiet — spawns land in the ring, inside the near-count radius.
  while (near < minAlive && alive < maxAlive) {
    if (!spawnFromBudget(state, waves)) break;
    near++;
    alive++;
  }

  // The trickle flows: a starved camper is BECKONED — one budget mob at a
  // time walks in from the objective's direction — and a spent budget on a
  // killBoss level leaves an endless thin STRAGGLER stream from the same
  // bearing, so the field is never dead. Both hold once the objective clears.
  if (
    state.victoryCountdownMs === null &&
    state.trickleMs <= 0 &&
    alive < maxAlive
  ) {
    const budgetLeft = unspawnedMinions(state) > 0;
    if (starvation > 0 && budgetLeft) {
      if (spawnFromBudget(state, waves, spawnGoal(state))) {
        state.trickleMs = CAMPING.beaconEveryMs;
      }
    } else if (
      !budgetLeft &&
      levelDef(state.level.id).objective.type === "killBoss" &&
      near < CAMPING.stragglerMinAlive
    ) {
      if (spawnStraggler(state, waves, spawnGoal(state))) {
        state.trickleMs = CAMPING.stragglerEveryMs;
      }
    }
  }
}

/**
 * Where the player SHOULD be going — the bearing the beckoning trickle and
 * the straggler stream arrive from: the nearest living boss, else the nearest
 * living elite (the remaining set pieces ARE the level's to-do list). Null
 * when neither stands; the trickle then falls back to the plain ring.
 */
function spawnGoal(state: GameState): Vec2 | null {
  let boss: Vec2 | null = null;
  let elite: Vec2 | null = null;
  let bossDistSq = Infinity;
  let eliteDistSq = Infinity;
  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
    if (def.apparition) continue;
    if (def.role === "boss") {
      const d = distanceSq(enemy.pos, state.player.pos);
      if (d < bossDistSq) {
        bossDistSq = d;
        boss = enemy.pos;
      }
    } else if (def.role === "elite") {
      const d = distanceSq(enemy.pos, state.player.pos);
      if (d < eliteDistSq) {
        eliteDistSq = d;
        elite = enemy.pos;
      }
    }
  }
  return boss ?? elite;
}

/** Pull one monster forward from the earliest unfinished budget line.
 * `toward` biases the spawn ring toward that bearing (see spawnWaveEnemy). */
function spawnFromBudget(
  state: GameState,
  waves: NonNullable<ReturnType<typeof levelDef>["waves"]>,
  toward: Vec2 | null = null,
): boolean {
  for (let i = 0; i < waves.budget.length; i++) {
    const entry = waves.budget[i] as (typeof waves.budget)[number];
    if (!meetsMinDifficulty(state.difficulty, entry.minDifficulty)) continue;
    const spawned = state.waveSpawned[i] ?? 0;
    if (spawned >= scaledMobCount(entry.count, state.difficulty)) continue;
    if (!spawnWaveEnemy(state, entry.enemy, toward)) return false;
    state.waveSpawned[i] = spawned + 1;
    return true;
  }
  return false;
}

/**
 * Mint one EXTRA monster beyond the wave budget — the endless straggler
 * stream that keeps a killBoss level's field alive once the budget is spent.
 * Draws a kind from the difficulty-eligible budget lines so the stragglers
 * look like the level's own horde; never books against `waveSpawned`.
 */
function spawnStraggler(
  state: GameState,
  waves: NonNullable<ReturnType<typeof levelDef>["waves"]>,
  toward: Vec2 | null,
): boolean {
  const pool = waves.budget.filter((entry) =>
    meetsMinDifficulty(state.difficulty, entry.minDifficulty),
  );
  if (pool.length === 0) return false;
  const entry = pool[
    Math.floor(state.rng() * pool.length)
  ] as (typeof pool)[number];
  return spawnWaveEnemy(state, entry.enemy, toward);
}

/**
 * Is `pos` inside a design zone that forbids procedural spawns — a safe zone
 * (kept clear, and the horde repelled out) or a quiet zone (a dead area with no
 * ambient horde)? The shared exclusion the wave spawner and pack scatter both
 * honor (see zones.ts). Authored set pieces and packs pinned by `at` ignore it.
 */
export function insideNoSpawnZone(state: GameState, pos: Vec2): boolean {
  const def = levelDef(state.level.id);
  return (
    anyZoneContains(def.safeZones, pos) || anyZoneContains(def.quietZones, pos)
  );
}

/**
 * The current wave-pressure multiplier from the level's `tempo` curve
 * (LevelDef.tempo): the piecewise-linear intensity at the run's progress
 * through `waves.rampDurationMs`, clamped to config TEMPO. A level with no
 * tempo curve stays at baseline 1 — today's flat behavior — so this is neutral
 * everywhere it is read.
 */
function tempoIntensity(state: GameState): number {
  const def = levelDef(state.level.id);
  const tempo = def.tempo;
  if (!tempo || tempo.length === 0) return 1;
  const dur = def.waves?.rampDurationMs ?? 1;
  const p = clamp(state.stats.timeMs / Math.max(1, dur), 0, 1);
  let value = (tempo[0] as (typeof tempo)[number]).intensity;
  for (let i = 0; i < tempo.length; i++) {
    const cur = tempo[i] as (typeof tempo)[number];
    if (p <= cur.at) {
      if (i === 0) {
        value = cur.intensity;
        break;
      }
      const prev = tempo[i - 1] as (typeof tempo)[number];
      const span = Math.max(1e-6, cur.at - prev.at);
      const f = (p - prev.at) / span;
      value = prev.intensity + (cur.intensity - prev.intensity) * f;
      break;
    }
    value = cur.intensity; // past the last authored point → hold its level
  }
  return clamp(value, TEMPO.min, TEMPO.max);
}

/**
 * Drop one wave monster into the spawn ring around the player. Near a wall
 * the clamped ring can collapse onto the player — rejection-sample a few
 * angles and defer the spawn (false) rather than place an unfair one.
 * `toward` narrows the ring to a cone around that bearing (the beckoning
 * trickle arrives from where the player should be going); the last attempts
 * fall back to the full ring so a goal against a wall can't wedge the spawn.
 */
function spawnWaveEnemy(
  state: GameState,
  defId: string,
  toward: Vec2 | null = null,
): boolean {
  const def = enemyDef(defId);
  for (let attempts = 0; attempts < 8; attempts++) {
    const angle =
      toward && attempts < 5
        ? Math.atan2(
            toward.y - state.player.pos.y,
            toward.x - state.player.pos.x,
          ) +
          (state.rng() * 2 - 1) * ((CAMPING.directionSpreadDeg * Math.PI) / 180)
        : state.rng() * Math.PI * 2;
    const ring =
      ENEMY_AI.minSpawnDistance + state.rng() * ENEMY_AI.spawnRingWidth;
    const pos = {
      x: clamp(
        state.player.pos.x + Math.cos(angle) * ring,
        def.radius,
        state.level.width - def.radius,
      ),
      y: clamp(
        state.player.pos.y + Math.sin(angle) * ring,
        def.radius,
        state.level.height - def.radius,
      ),
    };
    if (distance(pos, state.player.pos) < ENEMY_AI.minSpawnDistance) continue;
    if (insideObstacle(state, pos, def.radius)) continue;
    // Never stream the horde into a safe or quiet region (see zones.ts).
    if (insideNoSpawnZone(state, pos)) continue;
    // Stamp the current menace stage: a mob spawned into a rampage evolves —
    // more hp (a challenge knob; kill xp is level-based, and evolved drops roll
    // WORSE, see menace.ts / spawnEnemy), hitting as hard as the difficulty's
    // menaceEffectMult says. The base hp is the
    // horde's RELATIVE level: the player's live level plus the difficulty's
    // offset (mobLevelScale), so the swarm keeps its distance as he grows.
    // Hard-coded level (the level default) sets hp + mlvl; else player-relative.
    // The menace evolution stage still stacks its extra hp on top.
    const wsc = resolveMobScaling(
      levelDef(state.level.id).mobLevels,
      state.difficulty,
      state.player.level,
      state.rng,
      mobLevelScale(state),
      currentMobLevel(state),
    );
    state.enemies.push(
      spawnEnemy(
        defId,
        pos,
        state.rng,
        state.nextId++,
        wsc.hpMult,
        menaceStage(state),
        difficultyDef(state.difficulty).menaceEffectMult,
        wsc.mlvl,
        wsc.banded,
      ),
    );
    // Book the spawn for the menace CLEARANCE gate (minions only — the horde
    // whose ebb and flow the gate weighs against the hero's kill rate).
    if (def.role === "minion") state.pendingMinionSpawns++;
    return true;
  }
  return false;
}
