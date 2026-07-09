// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Environmental hazards: gravity wells (black holes) and the asteroid rain.
// Both are pure level data — `LevelDef.wells` places the holes and
// `LevelDef.asteroids` turns the rocks on — stepped from step() while the
// run is `playing`, so any level can adopt either without engine changes.
// Neither system flows through hitEnemy: a hole DEVOURS minions (no kill,
// no XP, no loot) and a rock only SHOVES them, so environmental deaths can
// never be farmed for drops or heat the menace meter.

import { randomRange } from "@game/lib/rng.ts";
import { direction, distance, moveToward, vec } from "@game/lib/vec.ts";
import { ASTEROIDS, JUMP, PLAYER, WELLS } from "./config.ts";
import { difficultyDef } from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { levelDef, type LevelDef } from "./defs/levels/index.ts";
import { armorInfo } from "./items.ts";
import { startPlayerThought } from "./story.ts";
import type { Asteroid, Enemy, GameState, GravityWell } from "./types.ts";

/** Resolve the level def's well specs against the config WELLS defaults. */
export function buildWells(def: LevelDef, takeId: () => number): GravityWell[] {
  return (def.wells ?? []).map((well) => ({
    id: takeId(),
    pos: { ...well.pos },
    pullRadius: well.pullRadius ?? WELLS.pullRadius,
    coreRadius: well.coreRadius ?? WELLS.coreRadius,
    pullSpeed: well.pullSpeed ?? WELLS.pullSpeed,
    coreDps: well.coreDps ?? WELLS.coreDps,
  }));
}

/** The pull (px/s) a well exerts at distance `d`: peak at the core's edge,
 * linear falloff to zero at the reach. */
function pullAt(well: GravityWell, d: number): number {
  return well.pullSpeed * (1 - d / well.pullRadius);
}

/**
 * Environmental damage to the player: the suit's plating soaks its grade's
 * share like any physical hit, the rest bites into HP — but there is no
 * crit, no dodge and no last-stand math; a hazard is impartial. Shared by
 * the well core burn and the asteroid strike.
 */
function hurtPlayer(state: GameState, damage: number): void {
  const player = state.player;
  const armor = armorInfo(state);
  let hpDamage = damage;
  if (armor && player.armor > 0) {
    const soaked = Math.min(Math.round(damage * armor.reduction), player.armor);
    player.armor -= soaked;
    hpDamage = damage - soaked;
  }
  player.hp -= hpDamage;
  player.hurtFlashMs = 250;
  state.stats.damageTaken += damage;
  state.events.push({ type: "playerHurt", crit: false });
}

/**
 * Advance the gravity wells: drag the grounded player (burning them in the
 * core, ticked at WELLS.tickMs), drag enemies (devouring minions that reach
 * the core), and drag loose items until they park on the rim. Apparitions
 * are immaterial and ignore the pull entirely; a jumping player sails over
 * it (the same z rule that clears enemy contact).
 */
export function stepWells(state: GameState, dt: number, dtMs: number): void {
  if (state.wells.length === 0) return;
  state.wellTickMs = Math.max(0, state.wellTickMs - dtMs);
  const player = state.player;
  const airborne = player.z > JUMP.dodgeHeight;

  for (const well of state.wells) {
    // The player: dragged while grounded, burned in the core.
    if (!airborne) {
      const d = distance(player.pos, well.pos);
      if (d < well.pullRadius) {
        player.pos = moveToward(player.pos, well.pos, pullAt(well, d) * dt);
        if (
          state.wellTickMs <= 0 &&
          distance(player.pos, well.pos) <= well.coreRadius
        ) {
          state.wellTickMs = WELLS.tickMs;
          hurtPlayer(
            state,
            Math.max(1, Math.round(well.coreDps * (WELLS.tickMs / 1000))),
          );
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

    // Items: dragged in but never destroyed — they park on the rim, so the
    // event horizon hoards a loot pile the player can dare the pull for.
    for (const item of state.items) {
      const d = distance(item.pos, well.pos);
      if (d >= well.pullRadius || d <= WELLS.itemRestRadius) continue;
      const step = Math.min(pullAt(well, d) * dt, d - WELLS.itemRestRadius);
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
      maybeAsteroidThought(state, spec?.struckThought);
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
 * The first asteroid strike's inner monologue (a level's
 * `asteroids.struckThought`): the first time a rock lands on the hero this
 * run, fire its thought exactly once (tracked in `state.thoughtsSeen`, the
 * same ledger as the kill/sight pins). Silent for a level with no
 * `struckThought`, once it has already played, or while a scene is up.
 */
function maybeAsteroidThought(
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
