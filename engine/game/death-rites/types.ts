// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A BOSS'S DEATH RITE IS — the shape alone, importing nothing at all.
//
// A rite is a NAMED ENTRY IN A CATALOG, exactly as a boss's set-piece abilities
// are (`mechanics/catalog.ts`), and for the same reason: a boss is a character,
// not four fields. Eleven bosses that each die by a `switch` arm is eleven
// permutations of whatever the first one did; a catalog means adding a send-off
// is a def plus, where it needs one, a module — and never a member on a type
// the whole engine reads.
//
// THE DEF IS MOSTLY DATA, AND THAT IS DELIBERATE. What differs between one
// boss's end and another's is overwhelmingly PICTURE — which pose, which
// direction the body opens, what is left on the floor — and the picture is the
// app's (`pwa/src/game/render/`). What the ENGINE owns is the choreography that
// has to be simulated: where the hero actually stands, where the horde is held,
// how long each beat runs, and what the remains are. So a rite that only looks
// different is data here and art there, and only a rite that BEHAVES
// differently earns a module (`DeathRiteDef.step`).
//
// WHY THE ENGINE OWNS ANY OF IT. The hero physically moves during a rite — he
// leaps onto the thing and puts a blade in it — and that is simulation state:
// the camera, collision, the minimap, the pointer's `toWorld` hit-testing and
// the autopilot all read `player.pos`. An app-side animation would put the
// picture and the world in different places. It also has to travel: the run
// simulates in the session server (docs/multiplayer.md), so a
// cinematic living in the renderer would show a spectator the boss simply
// vanishing. In the engine it replicates as ordinary dynamic state for free.

import type { Vec2 } from "@game/lib/vec.ts";

/**
 * A death rite's id — the value a boss's `EnemyDef.death` names.
 *
 * Deliberately a bare `string` union rather than an enum, matching every other
 * catalog key in the engine: a MOD ships its own boss, and the compiler checks
 * the name against the live catalog (`mod/catalog.json`) rather than against a
 * type it cannot extend.
 */
export type DeathRiteId = string;

/**
 * Which beat of the rite is running. The three are always in this order.
 *
 * `act` is deliberately neutral rather than named "execution": a rite covers
 * both ways a boss leaves the field, and the middle beat is the hero's blow on
 * a DEATH rite and the boss's bolt for the exit on a FLIGHT one.
 */
export type DeathRiteBeat = "stagger" | "act" | "aftermath";

/** How the hero closes the distance to the boss he is about to finish. */
export type DeathRiteApproach =
  /** He LEAPS — the existing jump system carries him (`player.z`), so the
   * takeoff and landing dust, the floor-coloured puff and the squash-and-
   * stretch on the doll all come along without this module knowing they
   * exist. The default, and the one the design brief asks for. */
  | "leap"
  /** He WALKS in, blade already up. For a boss that is a structure rather than
   * a body — nothing to land on. */
  | "stride"
  /** He stays where he is. For a boss that ends itself (a core going critical)
   * and for the censored fallback, where there is no finisher to play. */
  | "hold";

/** What the rite leaves on the floor — the level's landmark of the fight. */
export type DeathRiteRemains =
  /** Cut in two along the blow's own line. */
  | "cleave"
  /** Burst into what it was made of. */
  | "gib"
  /** A whole body, thrown and toppled — the ordinary death, and what every
   * gated-off rite falls back to. */
  | "corpse";

/**
 * One entry in the death-rite catalog.
 *
 * The three beat lengths are ADDITIVE on top of `BOSS_DEATH`'s floors rather
 * than replacements for them: a rite may take longer over its execution, never
 * skip the stagger that makes the execution legible. Same rule a boss ability's
 * `windupFloorMs` follows, and for the same reason — a tell shorter than a
 * reaction is not a tell.
 */
export type DeathRiteDef = {
  id: DeathRiteId;
  /**
   * What this ending IS, in a sentence, in the register of an item's
   * `description` — the LIBRARY prints it on the boss's bestiary page under HOW
   * IT ENDS, and nothing in the simulation reads it.
   *
   * It lives on the def rather than in the generator for the reason a power's
   * `look` does: the words and the numbers they describe should be edited in
   * one place, or a rite retimed here quietly leaves a page describing the
   * scene it used to be.
   */
  blurb: string;
  /** Extra ms on each beat, over `BOSS_DEATH`'s floor. Never negative. */
  staggerMs?: number;
  actMs?: number;
  aftermathMs?: number;
  /**
   * A FLIGHT rite: the boss does not die, it RUNS — `EnemyDef.flees`, the
   * coward that tears an exit open and bolts through it rather than being
   * finished (`bossFled` in place of the kill).
   *
   * It is in this catalog rather than in one of its own because it is the same
   * beat structure pointed the other way, and pretending otherwise would mean
   * two scenes, two phases and two skip verbs for one idea. What changes is WHO
   * MOVES: on a death rite the hero closes and the boss is still, on a flight
   * rite the boss runs and the hero is left standing. So a flight rite ignores
   * `approach`, `remains`, `standoff` and `force` — nothing is finished and
   * nothing is left — and reads `exitDistance` and `spin` instead.
   */
  flight?: boolean;
  /**
   * FLIGHT ONLY. How far from where it was beaten the boss tears its exit open
   * (world px). Far enough that the bolt is a RUN the player watches rather
   * than a step, and near enough that it stays on a phone's screen — the whole
   * beat is worth nothing if it happens off the edge of a ~422×195 view.
   */
  exitDistance?: number;
  /**
   * FLIGHT ONLY. How many full turns the boss spins through as it is drawn into
   * the exit — the twirl that takes it out of existence. The app draws it; this
   * is the number it draws.
   */
  spin?: number;
  /** How the hero gets there. Defaults to `leap`. */
  approach?: DeathRiteApproach;
  /** What is left when it is over. Defaults to `cleave`. */
  remains?: DeathRiteRemains;
  /**
   * Where the hero plants himself for the blow, as a fraction of the boss's own
   * radius. Under 1 he ends up ON the body (a leap lands astride it); over 1 he
   * stops short, which is what a rite wants when the boss is a machine too big
   * to stand on.
   */
  standoff?: number;
  /**
   * How hard the aftermath throws what is left, in the boss's own healthbars —
   * the same currency the blood and the gore ladder trade in
   * (`game-screen/blood-hit.ts`), so a rite's wreckage can never disagree with
   * the spray beside it about how bad the hit was. A scripted number, and well
   * past anything an ordinary blow reaches: this is the one blow in the fight
   * that was never in doubt.
   */
  force?: number;
  /**
   * A rite that BEHAVES differently, beyond where the hero stands and what is
   * left. Called once per tick for the whole rite with the scene's own dilated
   * dt. Most rites need none — see the header.
   */
  step?: (ctx: DeathRiteCtx, dtMs: number) => void;
};

/** What a rite's `step` hook is handed. */
export type DeathRiteCtx = {
  /** The live run. */
  state: import("../types/index.ts").GameState;
  /** Which beat is running, and how far through it (0..1). */
  beat: DeathRiteBeat;
  t: number;
  /** Where the boss fell — the rite's anchor. */
  center: Vec2;
};
