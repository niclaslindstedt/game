// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Environmental hazards: gravity wells (black holes) and the asteroid rain.
// Both are pure level data — `LevelDef.wells` places the holes and
// `LevelDef.asteroids` turns the rocks on — stepped from step() while the
// run is `playing`, so any level can adopt either without engine changes.
// Neither system flows through hitEnemy: a hole DEVOURS minions (no kill,
// no XP, no loot) — and the grounded hero too, an instant death — while a
// rock only SHOVES them, so environmental deaths can never be farmed for
// drops or heat the menace meter.

import { randomRange } from "@game/lib/rng.ts";
import { direction, distance, moveToward, vec } from "@game/lib/vec.ts";
import { ASTEROIDS, JUMP, PLAYER, SANDSTORMS, WELLS } from "./config.ts";
import { difficultyDef } from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { levelDef, type LevelDef } from "./defs/levels/index.ts";
import { absorbPlayerDamage, armorReduction, wearWornArmor } from "./items.ts";
import { currentMobLevel } from "./menace.ts";
import { startPlayerThought } from "./story.ts";
import type {
  Asteroid,
  Enemy,
  GameState,
  GravityWell,
  SandStorm,
} from "./types.ts";

/** Resolve the level def's well specs against the config WELLS defaults. */
export function buildWells(def: LevelDef, takeId: () => number): GravityWell[] {
  return (def.wells ?? []).map((well) => ({
    id: takeId(),
    pos: { ...well.pos },
    pullRadius: well.pullRadius ?? WELLS.pullRadius,
    coreRadius: well.coreRadius ?? WELLS.coreRadius,
    pullSpeed: well.pullSpeed ?? WELLS.pullSpeed,
    lootRadius: well.lootRadius ?? WELLS.lootRadius,
  }));
}

/** The pull (px/s) a well exerts on the player/enemies at distance `d`: peak
 * at the core's edge, linear falloff to zero at the reach. */
function pullAt(well: GravityWell, d: number): number {
  return well.pullSpeed * (1 - d / well.pullRadius);
}

/** The pull (px/s) a well exerts on loose LOOT at distance `d`: eased so it
 * crawls at the far edge of `lootRadius` (about a screen away) and quickens
 * toward the core — the falloff SQUARED, "slow from the edges, then faster". */
function lootPullAt(well: GravityWell, d: number): number {
  const t = 1 - d / well.lootRadius;
  return WELLS.lootPullSpeed * t * t;
}

/**
 * Environmental damage to the player: worn armor turns its share like any
 * physical hit (judged against the live horde level — a hazard has no level
 * of its own) and wears a point, the rest bites into HP — but there is no
 * crit, no dodge and no last-stand math; a hazard is impartial. Used by the
 * asteroid strike (the well core is instant death, not a scaled bite).
 */
function hurtPlayer(state: GameState, damage: number): void {
  const player = state.player;
  const hpDamage = Math.max(
    0,
    Math.round(damage * (1 - armorReduction(state, currentMobLevel(state)))),
  );
  wearWornArmor(state);
  player.hp -= absorbPlayerDamage(state, hpDamage);
  player.hurtFlashMs = 250;
  state.stats.damageTaken += damage;
  state.events.push({ type: "playerHurt", crit: false });
}

/**
 * Advance the gravity wells: drag the grounded player (DEVOURING him — instant
 * death — if the pull drags him into the core), drag enemies (devouring
 * minions that reach the core), and drag loose loot from a wider reach until
 * it parks on the rim. Apparitions are immaterial and ignore the pull
 * entirely. A jump no longer sails clean over a hole: airborne the hero still
 * DRIFTS toward the core (a fraction of the ground pull, `airPullFraction`)
 * and the hole's gravity FIGHTS his hop (`jumpGravity` heaped on `vz`), so he
 * jumps less high the nearer the horizon — but he is out of the core's reach,
 * so only the grounded hero can be swallowed.
 */
export function stepWells(state: GameState, dt: number): void {
  if (state.wells.length === 0) return;
  const player = state.player;
  const airborne = player.z > JUMP.dodgeHeight;

  for (const well of state.wells) {
    // A hole already claimed the hero this tick: the run is dropping to
    // `defeat`, so leave the corpse where it fell and skip the rest.
    if (player.hp <= 0) break;
    const d = distance(player.pos, well.pos);
    if (airborne) {
      // Over the hole: still tugged toward the core (weaker than grounded)
      // and the hole's gravity drags the jump back down early. No swallow —
      // he floats above it.
      if (d < well.pullRadius) {
        const frac = 1 - d / well.pullRadius;
        player.pos = moveToward(
          player.pos,
          well.pos,
          pullAt(well, d) * WELLS.airPullFraction * dt,
        );
        player.vz -= WELLS.jumpGravity * frac * dt;
      }
    } else {
      // The player: dragged while grounded, DEVOURED at the core — instant
      // death. Getting stuck in a black hole is the price of a loot dash gone
      // wrong; the defeat check downstream this same tick ends the run.
      if (d < well.pullRadius) {
        player.pos = moveToward(player.pos, well.pos, pullAt(well, d) * dt);
        if (distance(player.pos, well.pos) <= well.coreRadius) {
          player.hp = 0;
          player.hurtFlashMs = 250;
          state.events.push({ type: "wellDeath", pos: { ...well.pos } });
          break;
        }
      }
    }

    // Enemies: dragged like the player; a MINION that reaches the core is
    // devoured — collected first, removed after, so the drag loop never
    // mutates the array it iterates.
    const swallowed: Enemy[] = [];
    for (const enemy of state.enemies) {
      const def = enemyDef(enemy.defId);
      if (def.apparition) continue;
      const d = distance(enemy.pos, well.pos);
      if (d >= well.pullRadius) continue;
      enemy.pos = moveToward(enemy.pos, well.pos, pullAt(well, d) * dt);
      if (
        def.role === "minion" &&
        distance(enemy.pos, well.pos) <= well.coreRadius
      ) {
        swallowed.push(enemy);
      }
    }
    for (const enemy of swallowed) {
      state.enemies.splice(state.enemies.indexOf(enemy), 1);
      state.events.push({
        type: "wellSwallowed",
        pos: { ...enemy.pos },
        defId: enemy.defId,
      });
    }

    // Loot: pulled from a WIDER reach (`lootRadius`, about a screen away) but
    // never destroyed — it parks on the rim, so the event horizon hoards a
    // loot pile the player can dare the pull for. The tug eases in: a crawl
    // from the far edge, quickening toward the core.
    for (const item of state.items) {
      const d = distance(item.pos, well.pos);
      if (d >= well.lootRadius || d <= WELLS.itemRestRadius) continue;
      const step = Math.min(lootPullAt(well, d) * dt, d - WELLS.itemRestRadius);
      item.pos = moveToward(item.pos, well.pos, step);
    }
  }
}

/**
 * Advance the asteroid rain: spawn on the level's `everyMs` cadence (capped
 * at ASTEROIDS.maxAlive in flight), fly each rock straight, strike the
 * grounded player once per rock, plow minions out of the path unharmed, and
 * despawn rocks that have left the player's stage. Elites and bosses hold
 * their ground; apparitions are mist.
 */
export function stepAsteroids(
  state: GameState,
  dt: number,
  dtMs: number,
): void {
  const spec = levelDef(state.level.id).asteroids;
  if (spec) {
    state.asteroidTimerMs -= dtMs;
    if (
      state.asteroidTimerMs <= 0 &&
      state.asteroids.length < ASTEROIDS.maxAlive
    ) {
      spawnAsteroid(state);
      state.asteroidTimerMs = randomRange(
        state.rng,
        spec.everyMs[0],
        spec.everyMs[1],
      );
    }
  }
  if (state.asteroids.length === 0) return;

  const player = state.player;
  const survivors: Asteroid[] = [];
  for (const rock of state.asteroids) {
    rock.pos.x += rock.dir.x * rock.speed * dt;
    rock.pos.y += rock.dir.y * rock.speed * dt;

    // One blow per rock; a jump sails over it like it clears enemy contact.
    // The bite scales with the rung — a fraction of the hero's max hp, never
    // less than a point (see DifficultyDef.asteroidDamageFrac).
    if (
      !rock.struck &&
      player.z <= JUMP.dodgeHeight &&
      distance(rock.pos, player.pos) <= rock.radius + PLAYER.radius
    ) {
      rock.struck = true;
      const frac = difficultyDef(state.difficulty).asteroidDamageFrac;
      hurtPlayer(state, Math.max(1, Math.round(player.maxHp * frac)));
      // First rock to land this run pauses for the "watch out for these" read.
      maybeHazardThought(state, spec?.struckThought);
    }

    // Minions in the path are shoved aside, not hurt — the rock plows the
    // crowd open, which reads as impact without minting farmable kills.
    for (const enemy of state.enemies) {
      const def = enemyDef(enemy.defId);
      if (def.role !== "minion" || def.apparition) continue;
      const gap = def.radius + rock.radius;
      const d = distance(enemy.pos, rock.pos);
      if (d >= gap || d === 0) continue;
      const push = direction(rock.pos, enemy.pos);
      enemy.pos.x += push.x * (gap - d);
      enemy.pos.y += push.y * (gap - d);
    }

    if (distance(rock.pos, player.pos) <= ASTEROIDS.despawnDistance) {
      survivors.push(rock);
    }
  }
  state.asteroids = survivors;
}

/**
 * A hazard's first-strike inner monologue (a level's
 * `asteroids.struckThought` / `sandstorms.struckThought`): the first time the
 * hazard lands on the hero this run, fire its thought exactly once (tracked in
 * `state.thoughtsSeen`, the same ledger as the kill/sight pins). Silent for a
 * level with no such thought, once it has already played, or while a scene is
 * up.
 */
function maybeHazardThought(
  state: GameState,
  thought: string | undefined,
): void {
  if (!thought || state.dialogue !== null) return;
  if (state.thoughtsSeen.includes(thought)) return;
  state.thoughtsSeen.push(thought);
  startPlayerThought(state, thought);
}

/** Mint one rock on the spawn ring, aimed across the player with scatter. */
function spawnAsteroid(state: GameState): void {
  const angle = state.rng() * Math.PI * 2;
  const pos = vec(
    state.player.pos.x + Math.cos(angle) * ASTEROIDS.ringDistance,
    state.player.pos.y + Math.sin(angle) * ASTEROIDS.ringDistance,
  );
  const target = vec(
    state.player.pos.x +
      randomRange(state.rng, -ASTEROIDS.targetJitter, ASTEROIDS.targetJitter),
    state.player.pos.y +
      randomRange(state.rng, -ASTEROIDS.targetJitter, ASTEROIDS.targetJitter),
  );
  state.asteroids.push({
    id: state.nextId++,
    pos,
    dir: direction(pos, target),
    speed: randomRange(state.rng, ASTEROIDS.speed[0], ASTEROIDS.speed[1]),
    radius: randomRange(state.rng, ASTEROIDS.radius[0], ASTEROIDS.radius[1]),
    spin: randomRange(state.rng, -3, 3),
    struck: false,
  });
}

/**
 * Advance the sand storms (config SANDSTORMS; a level turns them on with
 * LevelDef.sandstorms): spawn on the level's `everyMs` cadence (capped at
 * SANDSTORMS.maxAlive in flight), drift each gust straight and SLOW — slow
 * enough that stepping aside is the whole defence — shove minions out of the
 * path unharmed like an asteroid, and CATCH the grounded hero once: a
 * difficulty-scaled bite of his max hp PLUS a knockout (he drops prone and
 * helpless for `knockoutMs`). A caught storm then fades out over `fadeMs` as it
 * passes over the fallen hero and despawns; a storm that misses despawns once
 * it has left the player's stage. A jump sails clear like it clears a rock, and
 * a hero already knocked out is never caught a second time (no chain-lock).
 * Elites and bosses hold their ground; apparitions are mist.
 */
export function stepSandstorms(
  state: GameState,
  dt: number,
  dtMs: number,
): void {
  const spec = levelDef(state.level.id).sandstorms;
  if (spec) {
    state.sandstormTimerMs -= dtMs;
    if (
      state.sandstormTimerMs <= 0 &&
      state.sandstorms.length < SANDSTORMS.maxAlive
    ) {
      spawnSandstorm(state);
      state.sandstormTimerMs = randomRange(
        state.rng,
        spec.everyMs[0],
        spec.everyMs[1],
      );
    }
  }
  if (state.sandstorms.length === 0) return;

  const player = state.player;
  const survivors: SandStorm[] = [];
  for (const storm of state.sandstorms) {
    storm.pos.x += storm.dir.x * storm.speed * dt;
    storm.pos.y += storm.dir.y * storm.speed * dt;

    // Catch the grounded hero once. A jump (z above dodgeHeight) rides over the
    // gust like a rock, and a hero already down is left where he lies — one
    // storm can't chain-lock him, and neither can a second gust piling on.
    if (
      !storm.struck &&
      player.knockoutMs <= 0 &&
      player.z <= JUMP.dodgeHeight &&
      distance(storm.pos, player.pos) <= storm.radius + PLAYER.radius
    ) {
      storm.struck = true;
      storm.fadeMs = SANDSTORMS.fadeMs;
      const frac = difficultyDef(state.difficulty).sandstormDamageFrac;
      hurtPlayer(state, Math.max(1, Math.round(player.maxHp * frac)));
      player.knockoutMs = SANDSTORMS.knockoutMs;
      state.events.push({ type: "sandstormHit", pos: { ...player.pos } });
      // First storm to down the hero this run pauses for the "watch out" read.
      maybeHazardThought(state, spec?.struckThought);
    }

    // Minions in the path are shoved aside, not hurt — the gust plows the crowd
    // open, which reads as a real storm without minting farmable kills.
    for (const enemy of state.enemies) {
      const def = enemyDef(enemy.defId);
      if (def.role !== "minion" || def.apparition) continue;
      const gap = def.radius + storm.radius;
      const d = distance(enemy.pos, storm.pos);
      if (d >= gap || d === 0) continue;
      const push = direction(storm.pos, enemy.pos);
      enemy.pos.x += push.x * (gap - d);
      enemy.pos.y += push.y * (gap - d);
    }

    // A struck storm thins out as it drifts on; when the fade runs out it is
    // spent and drops. An unstruck storm lives until it leaves the stage.
    if (storm.fadeMs !== null) {
      storm.fadeMs -= dtMs;
      if (storm.fadeMs <= 0) continue;
    }
    if (distance(storm.pos, player.pos) <= SANDSTORMS.despawnDistance) {
      survivors.push(storm);
    }
  }
  state.sandstorms = survivors;
}

/** Mint one storm on the spawn ring, aimed across the player with scatter. */
function spawnSandstorm(state: GameState): void {
  const angle = state.rng() * Math.PI * 2;
  const pos = vec(
    state.player.pos.x + Math.cos(angle) * SANDSTORMS.ringDistance,
    state.player.pos.y + Math.sin(angle) * SANDSTORMS.ringDistance,
  );
  const target = vec(
    state.player.pos.x +
      randomRange(state.rng, -SANDSTORMS.targetJitter, SANDSTORMS.targetJitter),
    state.player.pos.y +
      randomRange(state.rng, -SANDSTORMS.targetJitter, SANDSTORMS.targetJitter),
  );
  state.sandstorms.push({
    id: state.nextId++,
    pos,
    dir: direction(pos, target),
    speed: randomRange(state.rng, SANDSTORMS.speed[0], SANDSTORMS.speed[1]),
    radius: randomRange(state.rng, SANDSTORMS.radius[0], SANDSTORMS.radius[1]),
    spin: state.rng() * Math.PI * 2,
    struck: false,
    fadeMs: null,
  });
}
