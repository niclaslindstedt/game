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
import type { AbilityLook } from "../abilities.ts";

/**
 * Every ability id the catalog knows. The discriminant of `BossAbility`.
 *
 * The list is in TWO TIERS, and the tier is a statement about SCALE rather
 * than about which role may author one (nothing in the engine checks it — an
 * elite may carry a boss's move and a boss an elite's, and a few deliberately
 * do). A BOSS-TIER move reshapes the ARENA: the floor burns for the rest of
 * the fight, the room grows walls, the sky delivers. An ELITE-TIER move
 * reshapes the FIGHT IN FRONT OF YOU and nothing further — a ring of motes,
 * a slow underfoot, a drain that holds while you stand in it.
 *
 * The elite tier is deliberately built out of the HERO'S OWN vocabulary, and
 * that is the whole reason it reads as smaller rather than as cheaper: a
 * player who has run an ORBIT powerup, trained the Archon's flames or watched
 * a SEEKER orb chase something down already knows what a ring of motes does
 * and what a homing bolt wants. The elite is answering in a language the
 * player speaks, which is what makes a named mob feel like a rival build
 * instead of a fat minion with a new number on it.
 */
export type BossAbilityId =
  // ── BOSS TIER — set pieces that reshape the arena ──
  | "laser_eyes"
  | "flag_plant"
  | "coin_cannon"
  | "bait_drop"
  | "airstrike"
  | "call_horde"
  | "recompile"
  | "lockdown"
  // ── ELITE TIER — personal moves, the hero's own kit turned around ──
  | "orbit_guard"
  | "seeker_volley"
  | "ember_trail"
  | "shock_pulse"
  | "blink_strike"
  | "rally_cry"
  | "snare_field"
  | "siphon_tether"
  | "ward_shield"
  | "quake_line";

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
  /**
   * THE ABILITY OWNS ITS LOOK — the four-colour kit the app draws this cast in
   * (`AbilityLook`, the same shape a powerup's `look:` carries).
   *
   * It is here, on the authored ability, for exactly the reason a powerup's is
   * and a unique weapon's `fx:` is: while the mapping lived in the app keyed by
   * shipped ids, every mob that named a primitive could only ever cast it in
   * the colours of whichever mob got there first — and a MOD's elite could
   * only ever cast it in ours. With the kit on the def, THE CARTOGRAPHER's
   * ring of survey motes and RASPUTIN's ring of guttering candles are the same
   * `orbit_guard` and read as nothing alike.
   *
   * This is what makes the elite tier's signatures unique without the engine
   * growing a module per mob: the PRIMITIVE is shared, the look and the
   * numbers are the character's own. Absent falls back to a neutral kit
   * (`elite-fx.ts`), so an ability that says nothing still draws.
   */
  look?: AbilityLook;
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

/**
 * RECOMPILE — the boss starts putting itself back together, out loud.
 *
 * A machine that heals is the oldest cheap trick in the genre: the bar goes
 * back up, the player's last thirty seconds are deleted, and there is nothing
 * to do about it but hit harder. What makes this a mechanic instead is that the
 * repair is EXTERNAL and VISIBLE — the boss raises a node, and a tether runs
 * from the node to the boss for as long as the node stands.
 *
 * So the answer is in the room rather than on the damage meter: break the node
 * and the healing stops. It is the same shape as FLAG PLANT deliberately — a
 * boss that puts a killable thing on the field is a boss with an answer — and
 * a player who learned it on the moon reads this one instantly.
 */
export type RecompileAbility = AbilityBase & {
  id: "recompile";
  /** The node it raises (an EnemyDef id, cross-checked at build). */
  defId: string;
  /** How far from the boss it goes up (world px). */
  distance: number;
  /** Ms the node stands before it powers down on its own. */
  lifeMs: number;
  /** Health returned per second while the tether holds, as a fraction of the
   * boss's MAX hp — so the drain is a rate the player can out-damage rather
   * than a lump that erases a stretch of the fight in one go. */
  healFracPerSec: number;
};

/**
 * LOCKDOWN — the room stops being the room.
 *
 * Blast shutters drop in a ring around the hero, leaving exactly ONE gap. He is
 * not trapped, he is CORNERED: the way out exists, it is findable, and finding
 * it costs the seconds the boss wanted.
 *
 * The gap is what keeps this from being a punishment with no play in it. A
 * sealed box would just be a damage window; a box with a door is a question —
 * take the fight in here, or spend the time getting out and give up the ground.
 * The shutters retract on their own, so a lockdown is always a phase of the
 * fight rather than a permanent change to the arena.
 */
export type LockdownAbility = AbilityBase & {
  id: "lockdown";
  /** Radius of the ring dropped around the hero (world px). */
  radius: number;
  /** How many shutter segments the ring is built from. */
  segments: number;
  /** How wide the way out is, in DEGREES of the ring. */
  gapDeg: number;
  /** Ms the shutters stand before they retract. */
  durationMs: number;
  /** The shutter's own sprite and half-extents (world px). */
  sprite: string;
  segmentRadius: number;
};

// ─── THE ELITE TIER ─────────────────────────────────────────────────────────
// Ten primitives, each a hostile mirror of something the hero already has, and
// each drawn in the authoring mob's own `look` kit. Read the tier note on
// `BossAbilityId` first — the short version is that a boss move takes the room
// away and an elite move takes the next four seconds away.
//
// Two rules govern everything below, and both are about keeping a fight the
// player can read while 27 named mobs are casting on the same maps:
//
//   • AN ELITE MOVE HAS A LOCAL ANSWER. Step out of the ring, break the line,
//     get off the burning patch, burst the shell. Never "out-damage it" and
//     never "you should have been somewhere else forty seconds ago" — that is
//     the boss tier's privilege, because a boss is a fight you came for.
//   • AN ELITE MOVE COSTS THE MOB SOMETHING. Every one of these either roots
//     it for a windup, spends its position, or puts a thing on the field that
//     can be broken. A named mob that could cast for free while it chased you
//     is a minion with a damage aura.

/**
 * ORBIT GUARD — a ring of motes turning around the mob, biting whatever they
 * sweep through. The hero's ORBIT powerup and the Archon's orbiting flames,
 * pointed the other way.
 *
 * It is the tier's only move that is ALWAYS ON once cast, and that is what
 * makes it interesting on a melee mob: the ring does not chase, it simply
 * means the last stride into contact costs something. The answer is the same
 * one the hero's own orbit teaches from the other side — time the gap, or
 * fight it from outside the ring.
 */
export type OrbitGuardAbility = AbilityBase & {
  id: "orbit_guard";
  /** How many motes ride the ring. */
  count: number;
  /** Ring radius (world px) and how fast it turns (radians/sec). */
  radius: number;
  angularSpeed: number;
  /** How near a mote has to pass to bite (world px). */
  orbRadius: number;
  /** Damage per bite, as a fraction of the mob's `contactDamage`. */
  damageFrac: number;
  /** Ms before the ring may bite the same body again. */
  hitIntervalMs: number;
  /** Ms the ring turns before it goes out. */
  durationMs: number;
  /** How near the hero has to be before it bothers raising the ring (world px).
   * Absent derives four ring-radii from its own `radius`, which is the right
   * answer for most casters — a mob that wants to ring up early, or only at
   * contact, says so. */
  range?: number;
  /** The mote's sprite. */
  sprite: string;
};

/**
 * SEEKER VOLLEY — a handful of slow bolts that STEER after the hero. The magic
 * tree's seeker orbs, turned around.
 *
 * A straight shot is beaten by walking; a homing one is beaten by walking
 * FURTHER, or by putting a wall in the way — so it asks a different question
 * from every other hostile shot in the game. It is deliberately slow and
 * deliberately few: a fast homing bolt is just delayed damage with no play in
 * it, while a slow one the player can see turning is a thing to be kited.
 */
export type SeekerVolleyAbility = AbilityBase & {
  id: "seeker_volley";
  /** How many bolts go out. */
  count: number;
  /** Total spread of the launch fan, in DEGREES, about the locked bearing. */
  spreadDeg: number;
  /** How far the mob will open up (world px). */
  range: number;
  /** Bolt speed (world px/s) and how long one stays in the air. */
  speed: number;
  lifetimeMs: number;
  /** How hard a bolt steers (0 = straight, 1 = turns on a coin). Keep it low:
   * a bolt that cannot be outrun is not a bolt, it is a delayed hit. */
  homing: number;
  /** Damage per bolt, as a fraction of the mob's `contactDamage`. */
  damageFrac: number;
  /** The bolt's own size (world px) — its hitbox as much as its picture, so a
   * mob throwing something heavy is harder to slip past. Defaults to 4. */
  boltRadius?: number;
  /** The bolt's sprite. */
  sprite: string;
};

/**
 * EMBER TRAIL — the mob starts leaving burning ground behind it as it hunts.
 * The hero's TRAIL powerup and the Archon's immolation, turned around.
 *
 * The whole point is that it is not aimed at ANYWHERE: the mob paints its own
 * path, so where it becomes dangerous is decided by how the player has been
 * kiting it. Kite it in circles and the room fills; kite it in a straight line
 * and it costs nothing. That is a move that punishes a habit rather than a
 * moment, which is a thing the elite tier can do and the boss tier mostly
 * cannot.
 *
 * It rides `state.scorches` — the same burning floor LASER EYES lays, so the
 * hazard, its tick rule and its ground art all came free, and a player who has
 * met THE FLAGBEARER reads it instantly.
 */
export type EmberTrailAbility = AbilityBase & {
  id: "ember_trail";
  /** Ms the mob keeps painting. */
  durationMs: number;
  /** Ms between patches — with the mob's speed, this is how dense the line is. */
  dropMs: number;
  /** One patch's radius (world px) and how long it burns. */
  radius: number;
  patchMs: number;
  /** A burn's damage as a fraction of the mob's `contactDamage`, and the ms
   * between burns on a body standing in one. */
  damageFrac: number;
  tickMs: number;
  /** How near the hero has to be before it starts painting (world px). Absent
   * derives twelve patch-widths from its own `radius`. */
  range?: number;
};

/**
 * SHOCK PULSE — one ring out from the mob, right now: everything caught is hit
 * and SHOVED. The hero's PULSE powerup, turned around.
 *
 * The only move in the tier with no travel and no lingering mark, which makes
 * it the one that answers a specific player habit: standing on top of a mob to
 * out-trade it. The knockback is the mechanic rather than the damage — it puts
 * the hero back out at range, where whatever else the mob has is waiting.
 */
export type ShockPulseAbility = AbilityBase & {
  id: "shock_pulse";
  /** How far the ring reaches (world px). */
  radius: number;
  /** Damage as a fraction of the mob's `contactDamage`. */
  damageFrac: number;
  /** How hard it shoves (world px of impulse). 0 = damage only. */
  push: number;
  /** How long the shove coasts (ms) — with `push`, this is HOW FAR the hero
   * actually ends up, so the two together are the move. Defaults to 260, a
   * shunt rather than a launch. */
  pushCoastMs?: number;
};

/**
 * BLINK STRIKE — the mob is not where it was. It vanishes on the tell and
 * arrives at arm's length, already swinging.
 *
 * Every other move in the game asks the player to move; this one moves the
 * MOB, which is why it is the tier's answer to the ranged build that has been
 * walking backwards for the whole level. It is honest because the tell is the
 * longest in the tier and the arrival spot is derived from where the hero WAS
 * when the tell started — keep moving and it lands behind you, swinging at
 * nothing.
 */
export type BlinkStrikeAbility = AbilityBase & {
  id: "blink_strike";
  /** How far away it will do this from (world px). */
  range: number;
  /** How near the hero it arrives (world px). */
  arriveDistance: number;
  /** The blow it opens with, as a fraction of its `contactDamage`, and how far
   * that blow reaches from where it lands. */
  damageFrac: number;
  strikeRadius: number;
};

/**
 * RALLY CRY — it shouts, and the horde around it picks up.
 *
 * The counterweight to every other move here: it does nothing to the hero at
 * all. What it changes is the FIGHT — the minions already on screen come at
 * you faster and hit harder for a while — so the answer is a priority
 * decision rather than a dodge, which is the single most interesting thing a
 * support mob can ask for. Kill the caller and the shout stops coming.
 *
 * It buffs what is ALREADY THERE rather than summoning, deliberately: a
 * summoner adds work, a rallier makes the work you already have urgent, and
 * the second one is the one that makes a player change target.
 */
export type RallyCryAbility = AbilityBase & {
  id: "rally_cry";
  /** How far the shout carries (world px). */
  radius: number;
  /** Ms the lift lasts on each mob it reaches. */
  durationMs: number;
  /** What it multiplies on them while it holds. */
  speedMult: number;
  damageMult: number;
};

/**
 * SNARE FIELD — a patch of ground underfoot that will not let go. The hero's
 * STASIS powerup, turned around.
 *
 * It deals NO DAMAGE, and that is the design: a slow is only frightening in
 * proportion to what else is on the field, so this move's whole strength is
 * that it is cast by a mob that has friends. On its own it is an
 * inconvenience; laid under a hero who is already being flanked it is the
 * reason the flank works. The field is laid where the hero WAS, so it is
 * walked out of by a player who keeps moving and stepped into by one who
 * stands and trades.
 */
export type SnareFieldAbility = AbilityBase & {
  id: "snare_field";
  /** The field's radius (world px) and how long it lies there. */
  radius: number;
  durationMs: number;
  /** What the hero's pace is multiplied by while he stands in it (0..1). */
  slowFactor: number;
  /** How far from the mob it may be laid (world px). */
  range: number;
};

/**
 * SIPHON TETHER — a drain beam that holds while the hero stands in it: he
 * loses, the mob gains.
 *
 * RECOMPILE's little sibling, and the comparison is the point. A boss puts a
 * node on the field and the answer is in the ROOM; an elite has nothing to
 * hide behind, so the answer is the tether itself — break the line of sight or
 * get out of range and it drops. It heals as a RATE rather than a lump for the
 * same reason recompile does: a rate can be out-damaged and a lump just
 * deletes the last stretch of the fight.
 */
export type SiphonTetherAbility = AbilityBase & {
  id: "siphon_tether";
  /** How far the tether will reach, and how long it holds if unbroken. */
  range: number;
  durationMs: number;
  /** Damage per tick as a fraction of the mob's `contactDamage`, and the ms
   * between ticks. */
  damageFrac: number;
  tickMs: number;
  /** How much of what it takes it keeps, as a fraction of the damage dealt.
   * Above 1 would make the drain a net gain on a fight it is losing. */
  healFrac: number;
};

/**
 * WARD SHIELD — a shell the mob raises over itself that eats a budget of
 * damage. The hero's BARRIER powerup, turned around.
 *
 * A BUDGET, never a timer, for precisely the reason the hero's barrier is one:
 * a timed invulnerability tells the player to stop playing for three seconds,
 * while a budget tells them to spend everything they have RIGHT NOW and rewards
 * them for having saved a cooldown. It breaks loudly when it is spent, so the
 * player learns which of their buttons actually got through it.
 */
export type WardShieldAbility = AbilityBase & {
  id: "ward_shield";
  /** The damage it will eat, as a fraction of the mob's MAX hp. */
  poolFrac: number;
  /** Ms it stands before it fades, if it is never spent. */
  durationMs: number;
  /**
   * How far into its own health the fight must be before it raises the shell,
   * as a fraction of max hp. Defaults to 0.9 — deliberately generous, so the
   * shell arrives early enough to be met several times in one fight and is
   * therefore LEARNED rather than merely suffered.
   *
   * A shell raised at full health is a mob with more health, which is the one
   * thing this move must not be: the player has to see it go up in answer to
   * something they did. Author it lower for a mob that only turtles when it is
   * genuinely losing.
   */
  raiseBelowHpFrac?: number;
  /** How near the hero has to be for it to bother (world px). Defaults to 420
   * — a shell raised at an empty room is a cooldown spent on nobody. */
  range?: number;
};

/**
 * QUAKE LINE — the ground splits away from the mob along the bearing it locked,
 * fissure by fissure. The melee tree's SEISMIC proc, turned around.
 *
 * A lane rather than a circle, so it is read and answered the way the charge
 * is: the bearing locks at the tell, the fissures arrive in ORDER down the
 * line, and a step sideways is the whole answer. Arriving in order is what
 * makes it fair at range — a distant hero can see it coming for most of a
 * second, and a hero standing on top of the caster cannot, which is the
 * correct way round for a move a melee mob uses to make room.
 */
export type QuakeLineAbility = AbilityBase & {
  id: "quake_line";
  /** How many fissures open, and the gap between them (world px). */
  count: number;
  /** Gap between fissures along the lane (world px). */
  spacing: number;
  /** One fissure's reach (world px) and its damage as a fraction of the mob's
   * `contactDamage`. */
  radius: number;
  damageFrac: number;
  /** Ms between one fissure opening and the next — the lane's own rhythm. */
  stepMs: number;
};

/** One authored ability on an elite or a boss — the catalog's discriminated
 * union. Both tiers live in it: nothing in the engine asks which tier an entry
 * belongs to, and the split is a statement about scale (see `BossAbilityId`). */
export type BossAbility =
  // Boss tier.
  | LaserEyesAbility
  | FlagPlantAbility
  | CoinCannonAbility
  | BaitDropAbility
  | AirstrikeAbility
  | CallHordeAbility
  | RecompileAbility
  | LockdownAbility
  // Elite tier.
  | OrbitGuardAbility
  | SeekerVolleyAbility
  | EmberTrailAbility
  | ShockPulseAbility
  | BlinkStrikeAbility
  | RallyCryAbility
  | SnareFieldAbility
  | SiphonTetherAbility
  | WardShieldAbility
  | QuakeLineAbility;
