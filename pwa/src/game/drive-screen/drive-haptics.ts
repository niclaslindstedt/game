// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A COLLISION FEELS LIKE IN THE HAND — the road's own vibration
// vocabulary, and the pick.
//
// IT IS `drive-sounds.ts` FOR THE OTHER SENSE, and deliberately built the same
// way. The shared surface (`../haptics.ts`) owns one thing — a motor and a
// player toggle — exactly as `sfx/` owns a synth; every decision about what a
// road collision is WORTH belongs out here with the road, so deleting this
// folder deletes the feature and leaves nothing behind to tidy up.
//
// THREE DECISIONS LIVE HERE, and all three are about the same problem: a drive
// books a collision every couple of seconds, several a second inside a
// blockade, and a motor has no mix to hide in.
//
//   HOW HARD WAS IT  is the collision's own absorbed energy (`DriveEvent.joules`)
//                    against what a full-force hit of that KIND costs the wagon
//                    — `forceOf` and its two shares, the very numbers the sparks
//                    and the frame-shake are priced on. Nothing here re-decides
//                    what a heavy hit is.
//   WHOSE HIT WAS IT is proximity to the wagon. The road crashes WITHOUT the
//                    hero (`engine/game/drive/between.ts` — a pile-up he never
//                    touched is the best obstacle this minigame has), and a
//                    phone that jumped for two strangers meeting a quarter of a
//                    mile up the carriageway would be lying about what just
//                    happened to the player.
//   HOW OFTEN AT ALL is the rate limit, capped in the FUNNEL rather than at the
//                    callers — the same rule `sfx/cues.ts` learned from
//                    footsteps, and for the same reason: the caller is a fixed
//                    step running sixty times a second.
//
// THE MOTOR HAS ONE VOICE, so a tick that books six collisions buzzes ONCE, for
// the hardest of them. `navigator.vibrate` REPLACES the running pattern rather
// than queuing it, so six calls would leave only the last one — the sixth
// event, not the biggest — which is how a van met head-on ends up feeling like
// the pedestrian who happened to be booked after it.

import type { DriveEvent, DriveState } from "@game/core";

import { haptics } from "../haptics.ts";

import { BODY_FULL_SHARE, forceOf, SMASH_FULL_SHARE } from "./drive-fx.ts";

/**
 * HOW NEAR THE WAGON A COLLISION HAS TO BE TO BE FELT (world px).
 *
 * Read off the fleet's own art, like the windscreen's height beside it: nothing
 * on this road is more than 21 px of half-length (`fleet.ts`), so the hero's own
 * contacts — which are solved AT the bumper — all land inside a wagon-plus-one
 * of his centre, and a crash between two other cars a lane and two car-lengths
 * away lands outside it. It is deliberately generous rather than tight: a
 * stranger's car going over immediately beside the player is a thing he would
 * feel through the road, and the failure worth avoiding is the far one.
 */
const FEEL_REACH_PX = 56;

/** A wheel going over something already down. Flat and small on purpose: it is
 * the one beat on this road that fires several times a second (a blockade), and
 * what it has to say is "you are still driving through this", not "a collision
 * happened". */
const CRUSH_FORCE = 0.18;
/** Dead steel kicked further down the tarmac — a hollow clout with nothing
 * giving way, so it never grows however fast it is met. */
const DEBRIS_FORCE = 0.25;
/** The hero's own car folding a rung, and a part tearing off it. The shed is
 * the bigger of the two for the same reason it throws the bigger shower: a
 * panel bends, a wing leaves. */
const PANEL_FORCE = 0.3;
const SHED_FORCE = 0.5;
/** …and somebody else's car climbing a rung, which he feels through his own
 * bumper rather than through their bodywork. */
const TRAFFIC_BENT_FORCE = 0.4;
/** The engine dying under him. Heavy, and not a collision at all — the one buzz
 * on this road that says the trip is over rather than that something was hit. */
const BREAKDOWN_FORCE = 0.8;
/** A bumper going THROUGH somebody. The floor under it is the point: a body
 * coming apart has no gentle version, which is the same call the split SOUND
 * makes about its own shelf. */
const SPLIT_FLOOR = 0.5;

/**
 * HOW HARD ONE EVENT HIT, 0..1 — and 0 for everything that is not a blow.
 *
 * The terminal beats (a car on its roof, a car finished, a machine in two) are
 * FULL FORCE whatever the arithmetic says, which is the one place here the
 * joules are not consulted and is the same exception `pickSmash` documents: a
 * 14 kg bicycle destroyed utterly cannot put enough energy through the sum to
 * reach the top of the scale at any speed the wagon can do, and what happened
 * is still total.
 *
 * THE LAYERED BEATS ANSWER 0 — the glass out of a frame, a body through a
 * windscreen, somebody dead in their seat. Every one of them rides a collision
 * that is already in this same tick and already being felt, and the tick buzzes
 * for its hardest event; giving them a force of their own would only let the
 * trimming outweigh the crash it came off.
 */
export function driveHitForce(event: DriveEvent): number {
  switch (event.type) {
    case "pedestrianHit":
    case "occupantThrown":
      return forceOf(event.joules, BODY_FULL_SHARE);
    case "bodySplit":
      return Math.max(SPLIT_FLOOR, forceOf(event.joules, BODY_FULL_SHARE));
    case "bodyCrushed":
      return CRUSH_FORCE;
    case "debrisStruck":
      return DEBRIS_FORCE;
    case "trafficHit":
    case "machineDown":
    case "lampFelled":
      return forceOf(event.joules, SMASH_FULL_SHARE);
    // THE FULL THUMP, and the two new ones belong in it: an END GOING IN is a
    // write-off, because the body has folded far enough to change shape — the
    // same structural event the three above it are — and a FUEL TANK is the one
    // thing out here the hero feels without having touched anything at all.
    case "trafficRolled":
    case "trafficWrecked":
    case "machineSnapped":
    case "endSmashed":
      return 1;
    // …AND THE ONE THING ABOVE FULL FORCE. A tank going up is already the top of
    // the scale; the RARE one that puts a pressure ring across the whole frame
    // and the street lights out with it has to be felt as a different SIZE of
    // event rather than as the same buzz again, and the only way a motor can say
    // that is to keep going. See `QUAKE_AT`.
    case "trafficExploded":
      return event.big ? QUAKE_FORCE : 1;
    // A wheel leaving is a clunk of steel rather than a collision — the debris
    // shelf, which is the same weight as clouting a felled lamp post.
    case "wheelTorn":
      return DEBRIS_FORCE;
    case "trafficBent":
      return TRAFFIC_BENT_FORCE;
    case "panelBent":
      return PANEL_FORCE;
    case "partShed":
      return SHED_FORCE;
    case "breakdown":
      return BREAKDOWN_FORCE;
    default:
      // Everything with no `pos` at all (the monologue, the gate, the finish,
      // the fade) and everything that rides a blow already being felt.
      return 0;
  }
}

// ── THE PATTERN ────────────────────────────────────────────────────────────
// THREE SHAPES UP THE RANGE, because past a point a longer single pulse stops
// reading as heavier and starts reading as a drone — the lesson the hero's own
// damage buzz already learned, and the same answer: split it. A clip is one
// flick, a real collision is a THUD-thud, and a terminal one is a rolling
// three-beat crunch. The native bridge picks a Taptic weight off each pulse's
// LENGTH (`native/src/native-haptics.ts`), so a full-force hit's pulses all
// clear its Heavy-impact threshold and a graze's do not — which is the whole of
// "the harder the more vibration" on a device that has no such dial.
const BASE_MS = 12;
const SPAN_MS = 92;
/** Where one pulse becomes two, and two become three. */
const SPLIT_AT = 0.45;
const ROLL_AT = 0.85;
/**
 * …AND THE FOURTH SHAPE, WHICH ONLY ONE EVENT ON THIS ROAD CAN REACH.
 *
 * THE SCALE STOPS AT 1 FOR EVERYTHING ELSE, on purpose: a car on its roof, a
 * machine in two and a fuel tank are all "the biggest thing that can happen",
 * and giving them different weights would be inventing a difference the player
 * cannot feel. The RARE big blast is a genuinely different size of event — a
 * ring across the whole frame, the street lights going out either side of the
 * road — and a motor has exactly one way to say bigger once it is already at
 * full amplitude, which is to KEEP GOING.
 *
 * So this one gets a rolling five-beat that runs about a third of a second
 * rather than the roll's fifth of one: the hit, and then the ground under it not
 * settling. It is deliberately unreachable by arithmetic — `driveHitForce`
 * returns it for one event and nothing else can climb to it — because a haptic
 * that ordinary play can wander into is a phone that buzzes.
 */
const QUAKE_AT = 1.2;
const QUAKE_FORCE = 1.5;

/**
 * HOW OFTEN THE ROAD MAY BUZZ AT ALL.
 *
 * Driving through a blockade books a wheel over a body several times a second
 * and would otherwise leave the motor simply switched on, which is not feedback
 * — it is a phone buzzing. Eleven a second is about the ceiling at which
 * separate knocks are still separate knocks.
 */
const MIN_GAP_MS = 90;
/**
 * …AND WHAT MAY CUT IN EARLY. A gap alone would swallow the one event that most
 * needs to be felt: a van met head-on in the middle of a crowd, arriving while
 * the last body's flick still holds the gate. So a blow this much HARDER than
 * the one holding it preempts — a STEP rather than a factor, so a ladder of
 * near-identical knocks cannot walk its way through.
 */
const PREEMPT_STEP = 0.25;

/** When the road last buzzed (drive-clock ms) and how hard — the two rules
 * above, kept in the funnel exactly as `sfx/cues.ts` keeps its own. */
let lastAtMs = -Infinity;
let lastForce = 0;

/** Forget the limiter — a fresh leg, or a test. The road heals itself anyway
 * (see the rewound clock in `feelDrive`); this is for a caller that would
 * rather say so. */
export function resetDriveHaptics(): void {
  lastAtMs = -Infinity;
  lastForce = 0;
}

/**
 * Buzz one collision, weighed by its own force.
 *
 * @param force 0..1 — see `driveHitForce`
 * @param nowMs the DRIVE's own clock, passed in rather than read (the contract
 *              `playCue` uses), so the limiter freezes with the road while a
 *              line is up and a test can drive it
 * @returns whether anything was asked of the motor
 */
export function playDriveHitHaptic(force: number, nowMs: number): boolean {
  if (!haptics.active) return false;
  if (!(force > 0)) return false;
  // A restart lays a fresh road at ms 0, so the clock can run BACKWARDS under
  // us — which would otherwise gate the whole new leg until it had driven past
  // where the old one crashed.
  if (nowMs < lastAtMs) resetDriveHaptics();
  if (nowMs - lastAtMs < MIN_GAP_MS && force < lastForce + PREEMPT_STEP) {
    return false;
  }
  const f = Math.min(QUAKE_FORCE, force);
  lastAtMs = nowMs;
  lastForce = f;
  const on = Math.round(BASE_MS + Math.min(1, f) * SPAN_MS);
  if (f >= QUAKE_AT) {
    // THE GROUND NOT SETTLING. Five beats, opening on a pulse half again as long
    // as anything else out here can ask for and dying away over a third of a
    // second — long enough to be a rumble rather than a knock, short enough that
    // it is over before the wave it belongs to has crossed the frame.
    haptics.vibrate([
      Math.round(on * 1.5),
      30,
      on,
      35,
      Math.round(on * 0.75),
      45,
      Math.round(on * 0.5),
      60,
      Math.round(on * 0.3),
    ]);
  } else if (f >= ROLL_AT) {
    haptics.vibrate([on, 40, Math.round(on * 0.7), 45, Math.round(on * 0.45)]);
  } else if (f >= SPLIT_AT) {
    haptics.vibrate([on, 32, Math.round(on * 0.55)]);
  } else {
    haptics.vibrate(on);
  }
  return true;
}

/**
 * HOW HARD THIS BLOW LANDED ON THE HERO'S OWN CAR, 0..1 — the force above,
 * with the road's collisions that were nothing to do with him taken out.
 *
 * TWO SENSES READ THIS, which is why it is a function rather than two loops.
 * The road crashes WITHOUT the hero (`engine/game/drive/between.ts` — a pile-up
 * he never touched is the best obstacle this minigame has), so both the motor
 * in his hand and the wagon's OWN noise (`carAnswerSound`, drive-sounds.ts)
 * have to ask the same question before they answer: a phone that jumped, or a
 * chassis that boomed, for two strangers meeting a quarter of a mile up the
 * carriageway would be lying about what just happened to the player.
 */
export function feltForce(drive: DriveState, event: DriveEvent): number {
  if (!("pos" in event)) return 0;
  if (Math.abs(event.pos.x - drive.car.pos.x) > FEEL_REACH_PX) return 0;
  if (Math.abs(event.pos.y - drive.car.pos.y) > FEEL_REACH_PX) return 0;
  return driveHitForce(event);
}

/**
 * ONE TICK OF THE ROAD, FELT — the hardest thing that happened to the wagon
 * this step, buzzed once.
 *
 * Read off `drive.events` AFTER the drain rather than inside it, for the reason
 * the blackout beside it is: the drain is what a tick LOOKS AND SOUNDS like and
 * BOTH hosts run it unchanged, while a buzz is for the hand that is actually
 * holding the wheel. A display case has no hands, and an unattended road (the
 * attract loop, a playtest, a screenshot recipe) has no thumb to buzz — the
 * screen's own `auto` rule, the same one that already takes away the pause card
 * and the high-score board.
 */
export function feelDrive(drive: DriveState): void {
  let hardest = 0;
  for (const event of drive.events) {
    const force = feltForce(drive, event);
    if (force > hardest) hardest = force;
  }
  if (hardest > 0) playDriveHitHaptic(hardest, drive.ms);
}
