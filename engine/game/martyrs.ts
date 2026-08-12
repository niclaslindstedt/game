// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MARTYRS — a man who is himself the weapon (config MARTYRS,
// `LevelDef.martyrs` for the cadence, `EnemyDef.martyr` for the bomb).
//
// WHAT IT IS. Somewhere out past the edge of what the hero can see, a body is
// minted at a dead run. It crosses the floor, it gets close, it SHOUTS — and
// from that moment it is a countdown that sprints. A few seconds later the
// room goes up: whatever was standing near him is gone, and a hero who did not
// clear the blast wears a bite of it.
//
// WHY IT IS AN ENEMY AND NOT A HAZARD, which is the whole design. A meteor, a
// herd and a squall are all WEATHER: they happen, and the only verb the player
// has against them is to be somewhere else. This one is a MONSTER, so every
// verb the player already owns works on it — and the fuse is a window in which
// using them PAYS. Shoot him inside it and the bomb he was carrying drops at
// his feet, every time (`martyr.dropsAbility`). Let it burn and the blast
// still clears the room for you; it just takes a bite out of you on the way
// and pays nothing. That is the trade, and it is why the mob has more health
// than the floor's rank and file: a bomber a stray shot fells is a gift, not a
// decision.
//
// THE BLAST'S KILLS ARE ENVIRONMENTAL — no XP, no loot, no menace, exactly
// like a meteor's core and a well's throat. A mob that arrives on a cadence
// and PAYS for the bodies it takes with it is an XP farm that walks to you.
//
// NOTHING HERE SPENDS `state.rng` ON PRESENTATION, and the arrival is not
// presentation: where he is minted and when the next one is owed are draws on
// the run's own stream, exactly as the stampede's lane and the meteor's patch
// are, so a seeded run stays a seeded run.

import { randomRange } from "@game/lib/rng.ts";
import { clamp, distance, vec } from "@game/lib/vec.ts";

import { JUMP, KNOCKBACK, MARTYRS, PLAYER } from "./config/index.ts";
import { spawnEnemy } from "./create.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { runLevelDef } from "./defs/levels/index.ts";
import { inert } from "./disposition.ts";
import {
  hazardFocus,
  heroRunProgress,
  hurtPlayerByHazard,
  maybeHazardThought,
} from "./hazards.ts";
import { knockEnemyBack, pushPlayer } from "./knockback.ts";
import { menaceStage, mobLevelScale, currentMobLevel } from "./menace.ts";
import { insideObstacle } from "./obstacles.ts";
import { livingHeroes, nearestHero } from "./party.ts";
import { visibleTo } from "./sight.ts";
import type { Enemy, GameState } from "./types/index.ts";

/** How far past the blast rim the fling still reaches — the shockwave is felt
 * a little beyond where it burns, which is what makes the rim readable. */
const BLAST_KNOCKBACK_SPEED = 320;
/** How long a body flung by the blast coasts before the impulse bleeds out. */
const BLAST_KNOCKBACK_MS = 420;
/** A martyr's blast core, as a fraction of its reach, when the def names none.
 * Wider than a meteor's, because a bomb worn on the body is mostly core. */
const DEFAULT_KILL_FRACTION = 0.75;
/** The last run, as a multiple of his walk, when the def names no
 * `fuseSpeedMult`. He is not trying to survive this. */
const DEFAULT_FUSE_SPEED_MULT = 1.6;

/**
 * Is this body's fuse SHORT — the shouting, flashing, seconds-from-going-off
 * kind — rather than merely walking?
 *
 * `Enemy.fuseMs` is ONE countdown that starts long and is CUT when he closes
 * (see the field's own note), so the raw number cannot answer this without the
 * def. Everything that reacts to a lit fuse asks here rather than re-deriving
 * it: the renderer's flashing tell, the autopilot's run for cover, and the
 * suites. A body that is not a martyr, or has not been stepped yet, is never
 * lit.
 */
export function martyrLit(enemy: Enemy): boolean {
  const spec = enemyDef(enemy.defId).martyr;
  return spec !== undefined && enemy.fuseMs !== undefined
    ? enemy.fuseMs <= spec.fuseMs
    : false;
}

/**
 * Advance every martyr on the board, and mint the next one when the level's
 * cadence comes round.
 *
 * Four things happen here, in this order, and the order is the beat:
 *
 *   ARRIVE   the level's `everyMs` comes up and one is minted out past the
 *            edge of sight, awake and already hunting.
 *   READ     the first one a hero actually LAYS EYES on pins the level's
 *            `martyrs.thought` — once per run, like every other pin.
 *   ARM      he closes to `triggerRadius` of a hero, shouts, and the fuse
 *            lights. From here it only counts down.
 *   GO OFF   the fuse runs out and the floor goes with it.
 *
 * Held back below the level's `afterProgress` gate, with the countdown FROZEN
 * rather than merely ignored — so the first arrival is a full interval after
 * the crossing rather than the instant it is reached. Once crossed the gate
 * LATCHES (`state.martyrsArmed`): it asks how far into the run the player is,
 * not where they are standing.
 */
export function stepMartyrs(state: GameState, dtMs: number): void {
  const spec = runLevelDef(state).martyrs;
  if (spec) {
    // THE GATE LATCHES. `afterProgress` says "not while the player is still
    // learning the floor", which is a fact about how far into the RUN they are
    // — so once they have been that far, walking back up the aisles to sell
    // loot does not turn the bombers off again. Reading the live progress every
    // tick instead made the beat a function of where the hero happened to be
    // standing: measured over a real run it left the cadence armed for a ninth
    // of the level and fired three times in fifteen minutes.
    const gate = spec.afterProgress ?? 0;
    if (!state.martyrsArmed && (gate <= 0 || heroRunProgress(state) >= gate)) {
      state.martyrsArmed = true;
    }
    if (state.martyrsArmed) {
      state.martyrTimerMs -= dtMs;
      if (state.martyrTimerMs <= 0 && liveMartyrs(state) < MARTYRS.maxAlive) {
        // A failed mint (a floor with nowhere open to stand out there) does
        // NOT re-arm the clock: the beat is owed, so it is tried again next
        // tick rather than skipped for a whole interval.
        if (spawnMartyr(state, spec.defId)) {
          state.martyrTimerMs = randomRange(
            state.rng,
            spec.everyMs[0],
            spec.everyMs[1],
          );
        }
      }
    }
  }

  // WHO GOES OFF THIS TICK, collected before anything is detonated: a blast
  // splices the bodies it burned, and mutating `state.enemies` under a loop
  // over it is how a horde silently skips half of itself.
  let spent: Enemy[] | null = null;
  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
    const martyr = def.martyr;
    if (!martyr || inert(def, enemy)) continue;

    // THE READ. Pinned on the first one a hero can actually SEE — a beat about
    // what a man is carrying is worth nothing fired at a body in the fog.
    if (
      spec?.thought &&
      livingHeroes(state).some((h) => visibleTo(state, h, enemy.pos))
    ) {
      maybeHazardThought(state, spec.thought);
    }

    // THE ONE CLOCK. It starts at the walk he is willing to make and only ever
    // counts down; a body placed by a scenario or a mod rather than by the
    // cadence above is stamped here on its first step.
    const walking = enemy.fuseMs === undefined || !martyrLit(enemy);
    enemy.fuseMs =
      (enemy.fuseMs ?? martyr.lifeMs ?? MARTYRS.walkMs) - (walking ? dtMs : 0);

    if (walking) {
      const hero = nearestHero(state, enemy.pos);
      const close =
        hero !== null && distance(hero.pos, enemy.pos) <= martyr.triggerRadius;
      // THE SWITCH CLOSES — because he got where he was going, or because he
      // ran out of willingness to keep walking. Either way it is one moment:
      // the shout, the cut fuse, and the last sprint, which is what makes the
      // shout a shot clock rather than a warning. `speed` is this body's own
      // snapshot, so raising it is permanent — which it may as well be, since
      // he has seconds to live.
      if (!close && enemy.fuseMs > martyr.fuseMs) continue;
      enemy.fuseMs = martyr.fuseMs;
      enemy.speed *= martyr.fuseSpeedMult ?? DEFAULT_FUSE_SPEED_MULT;
      enemy.awake = true;
      state.events.push({
        type: "martyrArmed",
        pos: { ...enemy.pos },
        defId: enemy.defId,
        fuseMs: martyr.fuseMs,
      });
      state.events.push({
        type: "bossBark",
        pos: { ...enemy.pos },
        defId: enemy.defId,
        lines: martyr.bark,
      });
      continue;
    }

    enemy.fuseMs -= dtMs;
    if (enemy.fuseMs <= 0) (spent ??= []).push(enemy);
  }
  for (const enemy of spent ?? []) detonateMartyr(state, enemy);
}

/** Martyrs currently on the board — the cadence's own cap reads this rather
 * than a counter, so a body killed by anything at all frees the slot. */
function liveMartyrs(state: GameState): number {
  let n = 0;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).martyr && enemy.hp > 0) n++;
  }
  return n;
}

/**
 * Mint one martyr out past the edge of what the hero can see, awake and
 * hunting. Returns false when the floor gave no open ground to stand him on —
 * the caller re-tries next tick rather than spending the interval.
 *
 * He arrives on a random BEARING rather than from the right like a herd or a
 * bale: those are lanes to step out of, and this one is a body to deal with,
 * so it may come from behind.
 */
function spawnMartyr(state: GameState, defId: string): boolean {
  const around = hazardFocus(state);
  // Nobody near enough to be arrived AT — hold the beat rather than spend it
  // on an empty corner of the map.
  if (!nearestHero(state, around)) return false;
  const def = enemyDef(defId);
  const level = runLevelDef(state);
  for (let i = 0; i < MARTYRS.spawnTries; i++) {
    const angle = state.rng() * Math.PI * 2;
    const reach =
      MARTYRS.spawnDistance + randomRange(state.rng, 0, MARTYRS.spawnJitter);
    const pos = vec(
      clamp(around.x + Math.cos(angle) * reach, 8, level.width - 8),
      clamp(around.y + Math.sin(angle) * reach, 8, level.height - 8),
    );
    if (insideObstacle(state, pos, def.radius)) continue;
    // Too near after the clamp (a hero pressed into a corner pulls the whole
    // ring inward) is a body minted IN the room rather than walking into it.
    if (distance(pos, around) < MARTYRS.minDistance) continue;
    const enemy = spawnEnemy(
      defId,
      pos,
      state.rng,
      state.nextId++,
      mobLevelScale(state),
      menaceStage(state),
      currentMobLevel(state),
    );
    // He is not here to be found asleep at a post: he walked in.
    enemy.awake = true;
    // …and the clock is already running, because he did not decide anything on
    // the way. `stepMartyrs` would stamp this on his first step anyway; doing
    // it here means the number is right from the tick he exists.
    enemy.fuseMs = def.martyr?.lifeMs ?? MARTYRS.walkMs;
    state.enemies.push(enemy);
    return true;
  }
  return false;
}

/**
 * Set one off. Everything inside the core is burned off the board (no kill, no
 * XP, no loot — see the file header), everything else in reach is flung, and
 * every GROUNDED hero the blast catches is bitten by how near the centre he
 * stood and shoved with it. A jump clears the whole thing exactly as it clears
 * a meteor: the blast is a ground event, and the hop is the answer the player
 * already owns.
 *
 * The martyr's own body leaves with the bodies it took: it is spliced HERE
 * rather than run through the kill path, because nobody killed him — which is
 * also why the charge he was carrying is not shed (that is `killEnemy`'s, and
 * it is the whole reward for shooting him first).
 */
function detonateMartyr(state: GameState, martyr: Enemy): void {
  const def = enemyDef(martyr.defId);
  const spec = def.martyr;
  if (!spec) return;
  const center = { ...martyr.pos };
  const radius = spec.blastRadius;
  const killRadius = radius * (spec.killFraction ?? DEFAULT_KILL_FRACTION);
  const self = state.enemies.indexOf(martyr);
  if (self >= 0) state.enemies.splice(self, 1);

  state.events.push({
    type: "martyrBlast",
    pos: center,
    radius,
    defId: martyr.defId,
  });

  const burned: Enemy[] = [];
  for (const enemy of state.enemies) {
    const other = enemyDef(enemy.defId);
    if (inert(other, enemy)) continue;
    const d = distance(center, enemy.pos);
    if (d > radius + other.radius) continue;
    // A minion in the core is simply gone. Everything heavier plants its feet
    // and takes the shove — the same ladder a meteor's shockwave respects, so
    // a set-piece fight is never ended by the weather walking into it.
    if (other.role === "minion" && d <= killRadius) {
      burned.push(enemy);
      continue;
    }
    const falloff = Math.max(0, 1 - d / radius);
    knockEnemyBack(
      enemy,
      center,
      BLAST_KNOCKBACK_SPEED * falloff * KNOCKBACK.roleScale[other.role],
      BLAST_KNOCKBACK_MS,
    );
  }
  for (const enemy of burned) {
    const i = state.enemies.indexOf(enemy);
    if (i >= 0) state.enemies.splice(i, 1);
    state.events.push({
      type: "martyrKill",
      pos: { ...enemy.pos },
      defId: enemy.defId,
    });
  }

  // EVERY grounded hero in reach. A blast does not pick a favourite, and this
  // one is not aimed — the man who set it off was not aiming either.
  for (const player of state.players) {
    if (player.hp <= 0) continue;
    if (player.z > JUMP.dodgeHeight) continue;
    const d = distance(center, player.pos);
    const reach = radius + PLAYER.radius;
    if (d > reach) continue;
    const falloff = Math.max(0, 1 - d / reach);
    hurtPlayerByHazard(
      state,
      player,
      Math.max(1, Math.round(player.maxHp * spec.damageFrac * falloff)),
      `hazard:martyr:${martyr.defId}`,
    );
    pushPlayer(
      player,
      center,
      BLAST_KNOCKBACK_SPEED * falloff,
      BLAST_KNOCKBACK_MS,
    );
  }
}
