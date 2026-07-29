// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BOSS ABILITY CATALOG — the authored shapes. A boss's set-piece moves used
// to be a CLOSED union of four (`charge`, `slam`, `enrage`, `summon` — see
// EnemyMechanics), so every boss in the game was a permutation of the same four
// and a new idea meant widening a type the whole engine reads. An ability is
// now a NAMED entry in a catalog: authored as data here, stepped by one module
// under src/game/mechanics/, registered by id. Adding one is a variant below
// plus a module beside its siblings — nothing else in the engine changes.
//
// These are TYPES ONLY, and they live under defs/ rather than beside the step
// code because `EnemyDef` references them: mechanics/ imports defs/, so defs/
// importing mechanics/ back would close a cycle.
//
// EVERY ability obeys the same THREE-BEAT CONTRACT, which is what makes a fight
// learnable instead of a coin flip:
//   1. TELL     — the boss strikes a CAST POSE (its own sprite, `castSprite`)
//                 and the app stings a cue. Fixed `windupMs`, never rolled, so
//                 the rhythm is the same every time.
//   2. CAST     — the move commits to a world marker the player can read (the
//                 beam's aiming line, the flag going into the ground). The
//                 marker is DIEGETIC — a thing in the fiction, not a ring.
//   3. RESOLVE  — damage lands, the FX plays, the cooldown starts.
// The tell always precedes the marker, so the boss's own body is the first
// warning; a player who watches the boss beats a player who watches the floor.

import type { Difficulty } from "../../types/core.ts";

/** Every ability id the catalog knows. The discriminant of `BossAbility`. */
export type BossAbilityId =
  | "laser_eyes"
  | "flag_plant"
  | "coin_cannon"
  | "bait_drop"
  | "airstrike"
  | "call_horde";

/** What every authored ability carries, whatever it does. */
type AbilityBase = {
  /**
   * Ms between casts, counted from the moment the last one RESOLVED. Authored
   * per boss (the same ability is slower on its first outing than on its
   * rematch), never rolled.
   */
  cooldownMs: number;
  /**
   * The windup the boss stands in before the move commits — the readable tell.
   * A constant on purpose: a rolled windup is unlearnable.
   */
  windupMs: number;
  /**
   * The LOWEST difficulty rung this ability appears on (compared on
   * `DifficultyDef.index`). Absent = every rung. This is how nightmare and
   * JESUS get to be categorically harder rather than merely statier: the base
   * kit is the fight everyone learns, and the top rungs ADD a move to it.
   */
  minDifficulty?: Difficulty;
  /**
   * A ms floor and a scalar the top rungs squeeze the windup with, so a move
   * the player has learned gets FASTER without ever becoming undodgeable.
   * `windupMs × mult`, clamped up to `windupFloorMs`. Absent = no squeeze.
   */
  windupFloorMs?: number;
  /**
   * The line the boss speaks the FIRST time it casts this, and only the first
   * time (see `EnemyMech.abilityCast`). One page of the ordinary dialogue
   * machinery — free teaching, delivered by the character rather than by a
   * tutorial box. Manuscript-governed like every other spoken line.
   */
  bark?: string[];
};

/**
 * LASER EYES — a sweeping beam that BURNS THE FLOOR. The boss locks its aim on
 * the hero, holds the cast pose while its eyes light, then sweeps a beam
 * through `sweepDeg` about that locked bearing over `sweepMs`. Anything the
 * beam crosses is burned; the ground it crosses keeps burning as SCORCH
 * patches (`state.scorches`) for `scorchMs` afterwards.
 *
 * The scorch is the point. A beam alone is one dodge; a beam that leaves the
 * floor on fire means the ARENA is consumed as the fight runs long, so a slow
 * kill costs the player their room to stand. The answer is always the same and
 * always available: get out of the lane, and don't stand in what's burning.
 */
export type LaserEyesAbility = AbilityBase & {
  id: "laser_eyes";
  /** How far the beam reaches (world px). */
  range: number;
  /** Total arc swept, in DEGREES, centred on the bearing locked at the tell. */
  sweepDeg: number;
  /** How long the sweep takes. Longer = more readable, easier to walk out of. */
  sweepMs: number;
  /** Half-width of the beam (world px) — how thick the burning lane is. */
  beamWidth: number;
  /** Damage per hit as a fraction of the boss's `contactDamage`. */
  damageFrac: number;
  /** Ms between successive burns on the same body (the beam is a DoT, not a
   * one-shot — standing in it is what hurts). */
  hitIntervalMs: number;
  /** How long the ground the beam crossed keeps burning. */
  scorchMs: number;
  /** A scorch tick's damage, as a fraction of the boss's `contactDamage`. */
  scorchDamageFrac: number;
  /** Ms between scorch burns on a body standing in one. */
  scorchTickMs: number;
  /** Radius of one laid scorch patch (world px). */
  scorchRadius: number;
};

/**
 * FLAG PLANT — the summon with an ANSWER. Every summoner in the game is a tap
 * the player can only out-DPS: adds arrive, you kill adds, more arrive. Here
 * the boss drives its flag into the ground as a STRUCTURE, and the adds come
 * out of the flag rather than out of the boss. The flag is a real, stationary,
 * killable body (`defId` — an ordinary EnemyDef with no legs and no bite), so
 * the read is "break the thing that is making these" and the player who works
 * it out stops the tap instead of racing it.
 *
 * The boss will not plant a second while one still stands, so the ability is
 * self-limiting without a cap that needs explaining.
 */
export type FlagPlantAbility = AbilityBase & {
  id: "flag_plant";
  /** The stationary body planted — an EnemyDef id (cross-checked at build). */
  defId: string;
  /** How far in front of the boss it goes in (world px). */
  distance: number;
  /** Ms the flag stands before it rots away on its own, if left alone. */
  lifeMs: number;
};

/**
 * COIN CANNON — a fan of spinning coins that RICOCHET off the walls.
 *
 * A straight shot is answered by standing behind something, which is the end of
 * the thought. A shot that comes off the wall means the cover is not the answer
 * and the room is part of the fight: the safe spot is wherever the geometry
 * isn't pointing, and it moves as the hero does. That is the whole reason this
 * exists rather than a bigger `EnemyDef.ranged`.
 *
 * It is a FAN rather than a stream so the read is a shape, not a stream of
 * individual dodges: the gaps between the coins are the answer, and they are
 * visible the instant the volley leaves.
 */
export type CoinCannonAbility = AbilityBase & {
  id: "coin_cannon";
  /** How many coins go out per volley. */
  count: number;
  /** Total spread of the fan, in DEGREES, centred on the locked bearing. */
  spreadDeg: number;
  /** How far the cannon will open up (world px). */
  range: number;
  /** Coin speed (world px/s) and how long one stays in the air. */
  speed: number;
  lifetimeMs: number;
  /** Damage per coin as a fraction of the boss's `contactDamage`. */
  damageFrac: number;
  /** How many walls one coin may come off before it is spent. 0 = no bounce. */
  bounces: number;
};

/**
 * PUMP AND DUMP — bait that looks exactly like loot.
 *
 * The boss hurls a scatter of coins onto the floor. They lie there glinting,
 * shaped like every pickup the player has been trained for ten levels to run
 * at. Get close and they go off.
 *
 * The cruelty is the point, and so is the fairness: they are laid in a visible
 * throw the player can watch land, they arm on a delay long enough to walk back
 * out of, and they burn out on their own. A player who is paying attention
 * loses nothing at all; a player running on the pickup reflex pays once and
 * then knows.
 */
export type BaitDropAbility = AbilityBase & {
  id: "bait_drop";
  /** How many piles go down. */
  count: number;
  /** How far from the boss they scatter (world px). */
  spread: number;
  /** Ms before a pile can go off — the walk-away window. */
  armMs: number;
  /** Ms a pile lies there once armed, before it goes cold. */
  lifeMs: number;
  /** How near the hero has to come to set one off (world px). */
  triggerRadius: number;
  /** Blast radius and its damage, as a fraction of the boss's contact damage. */
  blastRadius: number;
  damageFrac: number;
};

/**
 * ORBITAL DELIVERY — an airstrike, in the company's own language.
 *
 * The boss calls in a drop, and pods come down on marks around the hero: each
 * one telegraphs with the same firming ground shadow a falling meteor uses
 * (`state.asteroids`, which is exactly what these ARE — the system already
 * knows how to drop something from the sky onto a readable mark and blast it),
 * then lands, blows, and POPS OPEN, so the crater is also a spawn.
 *
 * Reusing the meteor is not a shortcut, it is the point: the player already
 * knows how to read that shadow, so a brand-new move is legible the first time
 * it is used.
 */
export type AirstrikeAbility = AbilityBase & {
  id: "airstrike";
  /** How many pods come down. */
  count: number;
  /** How far around the hero the marks scatter (world px). */
  spread: number;
  /** Ms each pod spends falling — the ground shadow's whole warning. */
  fallMs: number;
  /** Blast radius, and its damage as a fraction of the boss's contact damage. */
  blastRadius: number;
  damageFrac: number;
  /** What climbs out of each pod (an EnemyDef id), and how many. Omit for a
   * pod that is only ordnance. */
  hatch?: string;
  hatchCount?: number;
};

/**
 * CALL OF INCELS — the boss calls its followers, and they come at a dead run.
 *
 * The engine already has a herd that charges the field in a lane, telegraphs
 * itself with approach dust, tramples what it hits and knocks the hero flat
 * (`LevelDef.stampedes`) — but only as scenery a MAP turns on. Here a BOSS
 * calls one, on purpose, at the moment of its choosing, which turns a piece of
 * background weather into a move with an author behind it.
 *
 * The answer is the one the stampede already taught: get out of the lane.
 */
export type CallHordeAbility = AbilityBase & {
  id: "call_horde";
  /** How many herds are called at once. */
  waves: number;
  /** Ms between them, so a multi-wave call arrives as a rhythm to step through
   * rather than one indivisible wall. */
  waveGapMs: number;
  /** Which runners turn up — a sprite family prefix (`<sprite>_0..2`). Omitted
   * falls back to the level's own stampede look. */
  runnerSprite?: string;
};

/** One authored ability on a boss — the catalog's discriminated union. */
export type BossAbility =
  | LaserEyesAbility
  | FlagPlantAbility
  | CoinCannonAbility
  | BaitDropAbility
  | AirstrikeAbility
  | CallHordeAbility;
