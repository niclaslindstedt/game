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
import {
  clamp,
  direction,
  distance,
  moveToward,
  vec,
  type Vec2,
} from "@game/lib/vec.ts";
import {
  ASTEROIDS,
  HAY_BALLS,
  JUMP,
  KNOCKBACK,
  PLAYER,
  SANDSTORMS,
  STAMPEDES,
  WELLS,
} from "./config/index.ts";
import { difficultyDef } from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { levelDef, type LevelDef } from "./defs/levels/index.ts";
import {
  absorbPlayerDamage,
  armorReduction,
  wearWornArmor,
} from "./items/index.ts";
import { currentMobLevel } from "./menace.ts";
import { resolveObstacles } from "./obstacles.ts";
import { startPlayerThought } from "./story.ts";
import type {
  Asteroid,
  Enemy,
  GameState,
  GravityWell,
  HayBall,
  SandStorm,
  Stampede,
  StampedeRunner,
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
function hurtPlayer(state: GameState, damage: number, cause: string): void {
  const player = state.player;
  const hpDamage = Math.max(
    0,
    Math.round(damage * (1 - armorReduction(state, currentMobLevel(state)))),
  );
  wearWornArmor(state);
  player.hp -= absorbPlayerDamage(state, hpDamage);
  player.hurtFlashMs = 250;
  state.stats.damageTaken += damage;
  state.events.push({ type: "playerHurt", crit: false, cause });
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
 * Advance the meteor strikes: spawn on the level's `everyMs` cadence (capped
 * at ASTEROIDS.maxAlive falling at once), age each rock's fall timer, and
 * DETONATE it on impact — the blast vaporizes minions at its lethal core,
 * flings everything else (and the grounded hero) to the sides, bites the hero
 * by how near the centre he stood, and scars the surface with a crater. A
 * falling rock is airborne, so it touches nothing until it lands; the fall
 * timer IS the telegraph window. Elites and bosses are flung but never killed
 * by the blast; apparitions are mist.
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

  const survivors: Asteroid[] = [];
  for (const rock of state.asteroids) {
    rock.ageMs += dtMs;
    if (rock.ageMs >= rock.fallMs) {
      explodeAsteroid(state, rock, spec?.struckThought);
    } else {
      survivors.push(rock);
    }
  }
  state.asteroids = survivors;
}

/**
 * Detonate one meteor at its impact point: emit the blast event, vaporize
 * minions in the lethal core (an environmental kill — no XP, loot or menace,
 * like a well swallow), FLING every other body the shockwave touches (surviving
 * minions and elites — a boss plants its feet, see KNOCKBACK.roleScale) outward
 * to the sides, catch the grounded hero for a distance-scaled bite AND a shove,
 * and leave a crater. Airborne (a well-timed jump) clears the blast like it
 * clears enemy contact.
 */
function explodeAsteroid(
  state: GameState,
  rock: Asteroid,
  struckThought: string | undefined,
): void {
  const center = rock.target;
  const radius = rock.blastRadius;
  const killRadius = radius * ASTEROIDS.killFraction;
  state.events.push({
    type: "asteroidImpact",
    pos: { ...center },
    radius,
  });

  // Sweep the horde: collect the core kills (spliced after the pass so the
  // loop never mutates the array under itself), fling the survivors.
  const vaporized: Enemy[] = [];
  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
    if (def.apparition) continue;
    const d = distance(center, enemy.pos);
    if (d > radius + def.radius) continue;
    if (def.role === "minion" && d <= killRadius) {
      vaporized.push(enemy);
      continue;
    }
    // The shockwave flings the survivor straight out from ground zero, harder
    // the nearer it stood; heavier set pieces ride it less (a boss not at all).
    const falloff = Math.max(0, 1 - d / radius);
    const roleScale = KNOCKBACK.roleScale[def.role];
    launchEnemy(enemy, center, ASTEROIDS.knockbackSpeed * falloff * roleScale);
  }
  for (const enemy of vaporized) {
    const i = state.enemies.indexOf(enemy);
    if (i >= 0) state.enemies.splice(i, 1);
    state.events.push({
      type: "asteroidKill",
      pos: { ...enemy.pos },
      defId: enemy.defId,
    });
  }

  // The grounded hero: a bite scaled by how near the centre he stood, plus the
  // same outward fling. A jump at the moment of impact sails clear of it all.
  const player = state.player;
  const dp = distance(center, player.pos);
  if (player.z <= JUMP.dodgeHeight && dp <= rock.blastRadius + PLAYER.radius) {
    const falloff = Math.max(0, 1 - dp / (rock.blastRadius + PLAYER.radius));
    const frac = difficultyDef(state.difficulty).asteroidDamageFrac;
    hurtPlayer(
      state,
      Math.max(1, Math.round(player.maxHp * frac * falloff)),
      "hazard:asteroid",
    );
    launchPlayer(player, center, ASTEROIDS.knockbackSpeed * falloff);
    // First blast to catch the hero this run pauses for the "watch out" read.
    maybeHazardThought(state, struckThought);
  }

  spawnCrater(state, rock);
}

/** Arm an outward KNOCKBACK impulse on a mob (an asteroid blast flung it):
 * point it straight away from `from` at `speed` px/s and start its coast
 * timer. `moveEnemy` sits the AI out while `knockMs > 0`, and `stepKnockback`
 * coasts and decays it. A zero/negative speed (a boss, or the blast's rim) is
 * a no-op. */
function launchEnemy(enemy: Enemy, from: Vec2, speed: number): void {
  if (speed <= 0) return;
  let dir = direction(from, enemy.pos);
  if (dir.x === 0 && dir.y === 0) dir = { x: 1, y: 0 };
  enemy.knockVel = { x: dir.x * speed, y: dir.y * speed };
  enemy.knockMs = ASTEROIDS.knockbackMs;
}

/** Arm the same outward impulse on the hero — he coasts along it (on top of
 * whatever he steers) until it bleeds out. */
function launchPlayer(
  player: GameState["player"],
  from: Vec2,
  speed: number,
): void {
  if (speed <= 0) return;
  let dir = direction(from, player.pos);
  if (dir.x === 0 && dir.y === 0) dir = { x: 1, y: 0 };
  player.knockVel = { x: dir.x * speed, y: dir.y * speed };
  player.knockMs = ASTEROIDS.knockbackMs;
}

/** Scar the surface where a meteor struck. Levels whose ground can't hold a
 * crater (`asteroids.craterSprites` unset — a floorless void) leave none; the
 * blast's own flash is the whole mark there. The oldest scar retires once the
 * field is full so a long run never piles them up. */
function spawnCrater(state: GameState, rock: Asteroid): void {
  const sprites = levelDef(state.level.id).asteroids?.craterSprites;
  if (!sprites || sprites.length === 0) return;
  const sprite =
    sprites[Math.floor(state.rng() * sprites.length) % sprites.length]!;
  if (state.craters.length >= ASTEROIDS.maxCraters) state.craters.shift();
  state.craters.push({
    id: state.nextId++,
    pos: { ...rock.target },
    radius: rock.blastRadius * ASTEROIDS.craterFraction,
    ageMs: 0,
    ttlMs: ASTEROIDS.craterMs,
    sprite,
    angle: state.rng() * Math.PI * 2,
  });
}

/**
 * Advance the KNOCKBACK impulses armed by meteor blasts: coast the hero and
 * every flung mob along their launch velocity, bleeding the speed down (an
 * e-folding decay, so the fling is fast then eases) and clamping to the level
 * bounds and around obstacles. When a body's coast timer lapses the impulse is
 * cleared. Runs after the hazards so a blast this tick lands its first shove
 * the same frame; `moveEnemy` sits a mob's AI out while its timer is live so
 * the fling reads instead of the chase fighting it.
 */
export function stepKnockback(
  state: GameState,
  dt: number,
  dtMs: number,
): void {
  const decay = Math.exp(-dtMs / ASTEROIDS.knockbackTauMs);
  const player = state.player;
  if (player.knockMs > 0) {
    player.pos.x = clamp(
      player.pos.x + player.knockVel.x * dt,
      PLAYER.radius,
      state.level.width - PLAYER.radius,
    );
    player.pos.y = clamp(
      player.pos.y + player.knockVel.y * dt,
      PLAYER.radius,
      state.level.height - PLAYER.radius,
    );
    resolveObstacles(state, player.pos, PLAYER.radius);
    player.knockVel.x *= decay;
    player.knockVel.y *= decay;
    player.knockMs = Math.max(0, player.knockMs - dtMs);
    if (player.knockMs === 0) {
      player.knockVel.x = 0;
      player.knockVel.y = 0;
    }
  }

  for (const enemy of state.enemies) {
    if (!enemy.knockMs || enemy.knockMs <= 0 || !enemy.knockVel) continue;
    const def = enemyDef(enemy.defId);
    enemy.pos.x = clamp(
      enemy.pos.x + enemy.knockVel.x * dt,
      def.radius,
      state.level.width - def.radius,
    );
    enemy.pos.y = clamp(
      enemy.pos.y + enemy.knockVel.y * dt,
      def.radius,
      state.level.height - def.radius,
    );
    resolveObstacles(state, enemy.pos, def.radius);
    enemy.knockVel.x *= decay;
    enemy.knockVel.y *= decay;
    enemy.knockMs = Math.max(0, enemy.knockMs - dtMs);
    if (enemy.knockMs === 0) {
      enemy.knockMs = undefined;
      enemy.knockVel = undefined;
    }
  }
}

/** Advance the crater scars: age each, retiring one once its life runs out.
 * The renderer fades it over the final `craterFadeMs`. Cosmetic only. */
export function stepCraters(state: GameState, dtMs: number): void {
  if (state.craters.length === 0) return;
  const survivors = [];
  for (const crater of state.craters) {
    crater.ageMs += dtMs;
    if (crater.ageMs < crater.ttlMs) survivors.push(crater);
  }
  state.craters = survivors;
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

/**
 * Advance the rolling hay bales: mint on the level's `everyMs` cadence (capped
 * at HAY_BALLS.maxAlive in flight), roll each straight to the left, SHOVE the
 * grounded hero left every tick it overlaps (nicking a very slight flat hp the
 * first time, once per bale), plow minions out of the path unharmed, and
 * despawn bales that have left the player's stage. A jump (z above
 * JUMP.dodgeHeight) clears a bale like it clears enemy contact.
 */
export function stepHayBalls(state: GameState, dt: number, dtMs: number): void {
  const spec = levelDef(state.level.id).hayBalls;
  if (spec) {
    state.hayBallTimerMs -= dtMs;
    if (
      state.hayBallTimerMs <= 0 &&
      state.hayBalls.length < HAY_BALLS.maxAlive
    ) {
      spawnHayBall(state);
      state.hayBallTimerMs = randomRange(
        state.rng,
        spec.everyMs[0],
        spec.everyMs[1],
      );
    }
  }
  if (state.hayBalls.length === 0) return;

  const player = state.player;
  const grounded = player.z <= JUMP.dodgeHeight;
  const survivors: HayBall[] = [];
  for (const ball of state.hayBalls) {
    ball.pos.x -= ball.speed * dt;

    // Contact: while the grounded hero overlaps a bale it SHOVES him left every
    // tick (so a bale caught in the lane drags him back down the street), and
    // nicks a very slight flat hp the FIRST time — one bite per bale. Stepping
    // out of the lane, or jumping the bale, is the only way to stop the push.
    if (
      grounded &&
      distance(ball.pos, player.pos) <= ball.radius + PLAYER.radius
    ) {
      player.pos.x = Math.max(
        PLAYER.radius,
        player.pos.x - HAY_BALLS.knockback * dt,
      );
      if (!ball.struck) {
        ball.struck = true;
        player.hp -= Math.max(1, HAY_BALLS.damage);
        player.hurtFlashMs = 250;
        state.stats.damageTaken += HAY_BALLS.damage;
        state.events.push({ type: "hayBallHit", pos: { ...ball.pos } });
      }
    }

    // Minions in the path are shoved aside, not hurt — the bale plows the crowd
    // open, which reads as impact without minting farmable kills.
    for (const enemy of state.enemies) {
      const def = enemyDef(enemy.defId);
      if (def.role !== "minion" || def.apparition) continue;
      const gap = def.radius + ball.radius;
      const d = distance(enemy.pos, ball.pos);
      if (d >= gap || d === 0) continue;
      const push = direction(ball.pos, enemy.pos);
      enemy.pos.x += push.x * (gap - d);
      enemy.pos.y += push.y * (gap - d);
    }

    if (distance(ball.pos, player.pos) <= HAY_BALLS.despawnDistance) {
      survivors.push(ball);
    }
  }
  state.hayBalls = survivors;
}

/** Mint one hay bale just past the right screen edge, in its own lane. */
function spawnHayBall(state: GameState): void {
  const pos = vec(
    state.player.pos.x + HAY_BALLS.spawnDistance,
    state.player.pos.y +
      randomRange(state.rng, -HAY_BALLS.laneJitter, HAY_BALLS.laneJitter),
  );
  state.hayBalls.push({
    id: state.nextId++,
    pos,
    speed: randomRange(state.rng, HAY_BALLS.speed[0], HAY_BALLS.speed[1]),
    radius: randomRange(state.rng, HAY_BALLS.radius[0], HAY_BALLS.radius[1]),
    spin: randomRange(state.rng, 4, 9),
    struck: false,
  });
}

/**
 * Mint one meteor: a target patch within `targetJitter` of the player, an
 * entry point offset up-range along a fresh random bearing (so rocks rain from
 * every angle), and a fall timer. The entry is clamped to the level bounds so
 * the shadow never streaks in from off the map; the renderer reads the same
 * `entry`/`target`/`ageMs` to draw the slant and the firming ground shadow.
 */
function spawnAsteroid(state: GameState): void {
  const target = vec(
    clamp(
      state.player.pos.x +
        randomRange(state.rng, -ASTEROIDS.targetJitter, ASTEROIDS.targetJitter),
      0,
      state.level.width,
    ),
    clamp(
      state.player.pos.y +
        randomRange(state.rng, -ASTEROIDS.targetJitter, ASTEROIDS.targetJitter),
      0,
      state.level.height,
    ),
  );
  const bearing = state.rng() * Math.PI * 2;
  const entry = vec(
    target.x + Math.cos(bearing) * ASTEROIDS.entryGroundDist,
    target.y + Math.sin(bearing) * ASTEROIDS.entryGroundDist,
  );
  state.asteroids.push({
    id: state.nextId++,
    target,
    entry,
    fallMs: randomRange(state.rng, ASTEROIDS.fallMs[0], ASTEROIDS.fallMs[1]),
    ageMs: 0,
    blastRadius: randomRange(
      state.rng,
      ASTEROIDS.blastRadius[0],
      ASTEROIDS.blastRadius[1],
    ),
    rockRadius: randomRange(
      state.rng,
      ASTEROIDS.rockRadius[0],
      ASTEROIDS.rockRadius[1],
    ),
    spin: randomRange(state.rng, -3, 3),
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
      hurtPlayer(
        state,
        Math.max(1, Math.round(player.maxHp * frac)),
        "hazard:sandstorm",
      );
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

/**
 * Whether a point sits inside a herd's collision band — an axis-aligned box
 * around the anchor (`bandHalfDepth` along the charge, `bandHalfHeight` across
 * it), grown by the caught body's own `pad` radius. The whole wall shares one
 * band, so a body can't slip between two runners.
 */
function inHerdBand(herd: Stampede, pos: Vec2, pad: number): boolean {
  return (
    Math.abs(pos.x - herd.pos.x) <= STAMPEDES.bandHalfDepth + pad &&
    Math.abs(pos.y - herd.pos.y) <= STAMPEDES.bandHalfHeight + pad
  );
}

/**
 * The current approach-rumble intensity (0..1): how loud the herd's roll of
 * feet should read this tick. While a herd charges it fades with the NEAREST
 * herd's distance — full-throated as the wall passes the hero (distance→0),
 * gone once it is `rumbleRange` off. With no herd on the field yet but one DUE
 * within `warnMs`, it swells from silence up to `warnPeak` as the spawn nears —
 * so the floor is already rumbling before the wall appears. Otherwise silent.
 */
function stampedeRumbleIntensity(state: GameState, hasSpec: boolean): number {
  if (state.stampedes.length > 0) {
    let nearest = Infinity;
    for (const herd of state.stampedes) {
      nearest = Math.min(nearest, distance(herd.pos, state.player.pos));
    }
    return clamp(1 - nearest / STAMPEDES.rumbleRange, 0, 1);
  }
  if (
    hasSpec &&
    state.stampedes.length < STAMPEDES.maxAlive &&
    state.stampedeTimerMs > 0 &&
    state.stampedeTimerMs <= STAMPEDES.warnMs
  ) {
    const nearness = 1 - state.stampedeTimerMs / STAMPEDES.warnMs;
    return STAMPEDES.warnPeak * nearness;
  }
  return 0;
}

/** Grains below this intensity fall under the floor and emit no rumble. */
const STAMPEDE_RUMBLE_FLOOR = 0.05;

/**
 * The hero's progress through the level along the spawn→boss run, 0..1. Uses
 * the horizontal axis (the campaign floors read left-to-right, spawn on the
 * left, boss on the right), so it is a stable "how far into the level am I"
 * gauge that a weaving up-and-down path can't fool. Falls back to the level
 * width when there is no boss to aim at.
 */
function heroRunProgress(state: GameState): number {
  const def = levelDef(state.level.id);
  const boss = def.spawns.find(
    (s) => "at" in s && enemyDef(s.enemy).role === "boss",
  );
  const spawnX = state.playerSpawn.x;
  const targetX = boss && "at" in boss ? boss.at.x : def.width;
  const span = targetX - spawnX;
  if (span <= 0) return 1;
  return clamp((state.player.pos.x - spawnX) / span, 0, 1);
}

/**
 * Advance the employee stampedes: light the approach-dust telegraph as a herd
 * nears (rolling the lane it locks onto), mint a herd on the level's `everyMs`
 * cadence (capped at STAMPEDES.maxAlive in flight) down that lane, charge each
 * straight to the LEFT at great speed, BOWL OVER minions caught in its band
 * (flung aside and knocked out for a few seconds — no damage, no XP, no loot, no
 * kill, so it can't be farmed and doesn't thin the horde), shove elites/bosses
 * out of the wall, strike the grounded hero ONCE (a flat max-hp bite AND a
 * knockdown, `Player.knockoutMs`), and despawn a herd once it has charged clear
 * of the player's stage. A jump (z above JUMP.dodgeHeight) sails over the whole
 * wall; a hero already down is never trampled twice. Apparitions are mist.
 * Ignores obstacles and level bounds. Held back below the level's stampede
 * `afterProgress` gate (see `heroRunProgress`).
 */
export function stepStampedes(
  state: GameState,
  dt: number,
  dtMs: number,
): void {
  const spec = levelDef(state.level.id).stampedes;
  // Hold the whole hazard back until the hero has crossed the level's
  // `afterProgress` gate (the second-half beat of an onboarding floor). The
  // countdown is FROZEN below the gate — so the first herd arrives a full
  // interval AFTER the crossing, not the instant it is reached — and the
  // approach rumble stays silent until then.
  const gated = spec !== undefined && (spec.afterProgress ?? 0) > 0;
  const armed = !gated || heroRunProgress(state) >= (spec?.afterProgress ?? 0);
  if (spec && armed) {
    state.stampedeTimerMs -= dtMs;

    // APPROACH TELEGRAPH — the wall is SEEN coming: once the countdown enters
    // its (difficulty-scaled) lead window and a herd can mint, light the dust and
    // ROLL THE LANE NOW, so the telegraph marks the exact band the wall will
    // charge down (`spawnStampede` then mints on that same y). Age it each tick.
    const leadMs =
      STAMPEDES.telegraphMs *
      difficultyDef(state.difficulty).stampedeTelegraphMult;
    if (
      state.stampedeWarn === null &&
      state.stampedes.length < STAMPEDES.maxAlive &&
      state.stampedeTimerMs > 0 &&
      state.stampedeTimerMs <= leadMs
    ) {
      state.stampedeWarn = {
        y:
          state.player.pos.y +
          randomRange(state.rng, -STAMPEDES.laneJitter, STAMPEDES.laneJitter),
        leadMs,
        ageMs: 0,
      };
    } else if (state.stampedeWarn !== null) {
      state.stampedeWarn.ageMs += dtMs;
    }

    if (
      state.stampedeTimerMs <= 0 &&
      state.stampedes.length < STAMPEDES.maxAlive
    ) {
      // Mint on the telegraphed lane (falling back to a fresh roll if the timer
      // outran the whole lead window in one tick), then clear the spent warn.
      spawnStampede(state, state.stampedeWarn?.y);
      state.stampedeWarn = null;
      state.stampedeTimerMs = randomRange(
        state.rng,
        spec.everyMs[0],
        spec.everyMs[1],
      );
    }
  }

  // The approach rumble: emit a low-roll grain on the `rumbleEveryMs` cadence,
  // scaled by the current intensity — audible before the wall appears (the warn
  // window) and all through the charge. Runs even with no herd on the field yet
  // (the pre-spawn swell), so it sits ahead of the spawn/despawn bookkeeping.
  // Silent below the `afterProgress` gate — the floor stays quiet until the
  // hazard can actually roll.
  if (spec && armed) {
    state.stampedeRumbleMs -= dtMs;
    if (state.stampedeRumbleMs <= 0) {
      state.stampedeRumbleMs = STAMPEDES.rumbleEveryMs;
      const intensity = stampedeRumbleIntensity(state, true);
      if (intensity > STAMPEDE_RUMBLE_FLOOR) {
        state.events.push({ type: "stampedeRumble", intensity });
      }
    }
  }

  if (state.stampedes.length === 0) return;

  const player = state.player;
  const grounded = player.z <= JUMP.dodgeHeight;
  const survivors: Stampede[] = [];
  for (const herd of state.stampedes) {
    herd.pos.x -= herd.speed * dt;

    // Trample the grounded hero once: a flat bite of his max hp AND a knockdown
    // (prone for `knockdownMs`). A jump clears the whole wall, and a hero
    // already down is left where he lies — one herd can't chain-lock him.
    if (
      !herd.struck &&
      grounded &&
      player.knockoutMs <= 0 &&
      inHerdBand(herd, player.pos, PLAYER.radius)
    ) {
      herd.struck = true;
      const frac = difficultyDef(state.difficulty).stampedeDamageFrac;
      hurtPlayer(
        state,
        Math.max(1, Math.round(player.maxHp * frac)),
        "hazard:stampede",
      );
      player.knockoutMs = STAMPEDES.knockdownMs;
      state.events.push({ type: "stampedeHit", pos: { ...player.pos } });
      maybeHazardThought(state, spec?.struckThought);
    }

    // Everything in the wall's path is knocked OVER, never out of existence: a
    // MINION is BOWLED over — flung aside along the charge (and out to the nearer
    // band edge) and left KNOCKED OUT for a few seconds (`trampleStunMs` on its
    // `knockMs`, so `moveEnemy` sits its AI out and `stepKnockback` coasts the
    // fling), scrambling back up after. No damage, no kill, no farm — the herd
    // doesn't thin the horde. An elite or boss holds its ground and is only shoved
    // clear of the band. One knockdown per pass: a mob already down is left be.
    for (const enemy of state.enemies) {
      const def = enemyDef(enemy.defId);
      if (def.apparition) continue;
      if (!inHerdBand(herd, enemy.pos, def.radius)) continue;
      const up = enemy.pos.y >= herd.pos.y ? 1 : -1;
      if (def.role === "minion") {
        if (enemy.knockMs && enemy.knockMs > 0) continue; // already bowled over
        enemy.knockVel = {
          x: -STAMPEDES.tramplePush,
          y: up * STAMPEDES.tramplePush * 0.5,
        };
        enemy.knockMs = STAMPEDES.trampleStunMs;
        state.events.push({
          type: "stampedeTrample",
          pos: { ...enemy.pos },
          defId: enemy.defId,
        });
      } else {
        // Shove a heavier foe to the nearer edge of the band (out of the wall),
        // carrying it a touch along the charge — knocked over, not killed.
        const edge = herd.pos.y + up * (STAMPEDES.bandHalfHeight + def.radius);
        enemy.pos.y +=
          (edge - enemy.pos.y) * Math.min(1, (STAMPEDES.speed[0] * dt) / 40);
        enemy.pos.x -= herd.speed * dt * 0.4;
      }
    }

    if (distance(herd.pos, player.pos) <= STAMPEDES.despawnDistance) {
      survivors.push(herd);
    }
  }
  state.stampedes = survivors;
}

/** Mint one herd of runners just past the right screen edge, in its own band —
 * the five staffers spread across the wall (evenly across the band's height
 * with a little jitter) and staggered back along the charge into a ragged
 * column, each wearing one of the three employee looks. */
function spawnStampede(state: GameState, laneY?: number): void {
  const pos = vec(
    state.player.pos.x + STAMPEDES.spawnDistance,
    // The telegraphed lane (locked when the dust lit) if there is one, else a
    // fresh roll — so the wall arrives exactly where the approach-dust warned.
    laneY ??
      state.player.pos.y +
        randomRange(state.rng, -STAMPEDES.laneJitter, STAMPEDES.laneJitter),
  );
  const runners: StampedeRunner[] = [];
  const n: number = STAMPEDES.runnerCount;
  const span = STAMPEDES.bandHalfHeight - STAMPEDES.runnerRadius;
  for (let i = 0; i < n; i++) {
    // Evenly across the band's height (top to bottom), jittered a few px so the
    // rank isn't a ruler-straight line, and staggered back to the right so the
    // wall reads as a charging column rather than one flat rank.
    const t = n === 1 ? 0.5 : i / (n - 1);
    const dy = -span + t * span * 2 + randomRange(state.rng, -6, 6);
    const dx =
      (i % 2 === 0 ? 0 : STAMPEDES.runnerStaggerX) +
      randomRange(state.rng, 0, STAMPEDES.runnerStaggerX);
    runners.push({
      dx,
      dy,
      variant: Math.floor(state.rng() * 3) % 3,
      phase: state.rng(),
    });
  }
  state.stampedes.push({
    id: state.nextId++,
    pos,
    speed: randomRange(state.rng, STAMPEDES.speed[0], STAMPEDES.speed[1]),
    runners,
    struck: false,
  });
}
