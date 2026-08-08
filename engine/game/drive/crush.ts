// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW A VEHICLE BREAKS — the algorithms for taking somebody else's car apart.
//
// WHAT WAS MISSING, AND WHY IT READ AS THIN. The road already priced a
// collision properly (`impact.ts`) and already remembered what it had cost
// (`DriveTraffic.wear`, a ladder of three derived pictures). What it did with
// the answer was: slide the struck car sideways out of its lane. That is one
// verb, it is the same verb for a bicycle and for a bus, and it is why a
// full-speed head-on into a hatchback and a lazy nudge into the same hatchback
// looked like the same event happening at two speeds.
//
// A COLLISION IS FOUR THINGS AT ONCE, and this file is the four:
//
//   IT FOLDS      A crumple zone is a spring that does not come back. It eats
//                 energy over a DISTANCE, so the depth an end folds in is the
//                 absorbed energy over the force the structure holds with — and
//                 the force a structure holds with goes with its mass. Nobody
//                 authored "a bus dents less"; a bus resists nine times as hard
//                 because it weighs nine times as much, and the same sum gives
//                 both answers.
//   ITS GLASS GOES  Glass is not structure. It is out at a fraction of the
//                 energy the body needs to bend, which is why every real
//                 collision photograph has windows missing from a car that is
//                 otherwise straight.
//   IT SPINS      An impulse that does not pass through the centre of mass is a
//                 torque. Where the blow landed is already solved (`Impact.
//                 along` → the contact point), so the lever arm is free, and a
//                 car clipped on the corner spins out while the same car met
//                 dead in the door does not. Nobody has to write "corner hits
//                 spin cars".
//   IT GOES OVER  A wheeled thing tips when the sideways shove at its centre of
//                 mass beats what the outside wheels hold it down with. That is
//                 a Δv threshold scaled by how high the weight is carried
//                 (`DriveVehicleDef.topHeavy`), and it is the whole of why a van
//                 rolls and a low sports car of the same weight slides.
//
// EVERY ONE OF THEM IS DIVIDED BY THE VEHICLE'S OWN MASS, which is the answer to
// "their weight is of great importance": the same blow folds a moped flat,
// shortens a hatchback by a foot, marks a van and is not noticed by a bus, and
// none of those four sentences exists anywhere as a rule. There is one sum and
// four weights.
//
// NOTHING HERE SPENDS A DRAW OF THE ROAD'S RNG, for the reason nothing in the
// drive's presentation does: the seeded stream lays the crowd and the traffic
// down, so a cosmetic hop that consumed one would shift every roll after it.

import { DRIVE, DRIVE_UNITS } from "./config.ts";
import { vehicleDef } from "./fleet.ts";
import type { Impact } from "./impact.ts";
import type { DriveTraffic } from "./types.ts";

/**
 * HOW DEEP THIS BLOW FOLDS THE STRUCTURE, in world px — energy over the force
 * the body resists with, which is `forceNPerKg` times what the body weighs.
 *
 * Exported because it is the number worth testing on its own: it is real
 * physics in real units, and a test that pins "the same joules folds a moped
 * ten times as far as it folds a bus" is pinning the whole design of this file.
 */
export function crushDepthPx(massKg: number, joules: number): number {
  const holdN = DRIVE.crush.forceNPerKg * Math.max(1, massKg);
  return joules / holdN / DRIVE_UNITS.mPerPx;
}

/**
 * FOLD THE END THAT WAS HIT.
 *
 * `fromX` is where the blow came from, and which END that is depends on which
 * way the vehicle is pointing — the identical reasoning `breakTrafficLamps`
 * already uses, and for the identical reason: the road runs both ways and an
 * oncoming car is drawn flipped, so a hit "on the left" is a nose for half the
 * traffic and a tail for the other half.
 *
 * Returns how much fold this blow actually added (px), which is what the caller
 * prices the SHED off — a hit that could not fold the thing any further did not
 * break anything else off it either.
 */
export function crushVehicle(
  other: DriveTraffic,
  joules: number,
  fromX: number,
): number {
  const def = vehicleDef(other.variant);
  const cap = def.halfLengthPx * DRIVE.crush.maxShare;
  const depth = crushDepthPx(def.massKg, joules);
  const hitLeft = fromX < other.pos.x;
  const nose = hitLeft === other.faceLeft;
  const was = nose ? other.crushNose : other.crushTail;
  const now = Math.min(cap, was + depth);
  if (nose) other.crushNose = now;
  else other.crushTail = now;
  return now - was;
}

/**
 * TAKE THE GLASS OUT, if the blow was worth it. Returns whether this is the
 * blow that did it, so the caller raises the noise exactly once.
 */
export function shatterGlass(other: DriveTraffic, force: number): boolean {
  if (other.glassOut) return false;
  if (force < DRIVE.crush.glassForce) return false;
  other.glassOut = true;
  return true;
}

/**
 * WOULD THIS PUT IT OVER?
 *
 * The lateral Δv it just took, in real m/s, against what its own shape can
 * stand. `topHeavy` of 0 is an `open` vehicle, which does not tip because it is
 * already going down by a different rule — and returning false for it here is
 * what keeps the two answers from both firing on one moped.
 */
export function tipsOver(other: DriveTraffic, hit: Impact): boolean {
  const def = vehicleDef(other.variant);
  if (def.topHeavy <= 0) return false;
  if (other.downed) return false;
  const lateralMs = Math.abs(hit.dv.y) * DRIVE_UNITS.mPerPx;
  return lateralMs * def.topHeavy >= DRIVE.crush.tipMs;
}

/**
 * PUT IT OVER — off its wheels, into the air, and turning.
 *
 * It becomes `downed`, which is the state a dropped moped has always used: an
 * object on the tarmac running on ballistics and friction rather than a vehicle
 * steering itself. That reuse is the point rather than an economy — a rolling
 * estate and a sliding bicycle are the same problem, and the physics that was
 * already written for one is exactly right for the other.
 *
 * WHICH WAY IT GOES is away from whatever hit it, for the same reason a shunt
 * is: a car rolling back INTO the wagon that just clipped it is the one outcome
 * nobody reads as having been sent there.
 */
export function tipVehicle(
  other: DriveTraffic,
  hit: Impact,
  awayFrom: number,
): void {
  const { crush } = DRIVE;
  const lateralMs = Math.abs(hit.dv.y) * DRIVE_UNITS.mPerPx;
  const side = other.pos.y >= awayFrom ? 1 : -1;
  other.downed = true;
  other.rolls++;
  // HELD TO THE SAME LATERAL SPEED A SHUNT IS, and for a reason that is about
  // legibility rather than physics: the sum's raw answer for a full-flank clip
  // at the top end is over 300 px/s, which carries the vehicle across two lanes
  // and onto the verge inside a fifth of a second — so the most dramatic thing
  // on the road happens too fast to watch. A rollover still ENDS on the verge;
  // it takes long enough getting there to be seen.
  // …and never under the speed it takes to get out from under the wagon, which
  // is the floor every shove keeps now that nothing is placed clear on the spot
  // (`separationPx`). A car that went over and then sat exactly where it was
  // would be rolled again by the same bumper a breath later.
  other.slew =
    side *
    Math.min(
      DRIVE.shuntMaxPx,
      Math.max(DRIVE.separationPx, Math.abs(hit.dv.y) * crush.rollSlew),
    );
  other.spin =
    side * Math.min(crush.maxRollSpin, lateralMs * crush.rollSpinPerMs);
  other.vz = Math.min(crush.maxRollLiftPx, lateralMs * crush.rollLiftPerMs);
  other.z = Math.max(other.z, 1);
  other.hitCooldownMs = DRIVE.shuntImmuneMs;
}

/**
 * HOW MANY PIECES COME OFF A CAR THAT HAS JUST FOLDED — zero until it has
 * genuinely folded, then a count off the force, capped.
 *
 * A CAR SHEDS THE SAME WAY A MOTORCYCLE DOES, through `tearMachine`, and the
 * pieces are cut out of the car's own art. That is the whole reason the road can
 * throw a recognisable piece of a police car down the tarmac without a single
 * sprite being authored for it — and it is the same seam a mod's own vehicle
 * arrives through.
 */
export function shedCount(force: number): number {
  const { crush } = DRIVE;
  if (force < crush.shedForce) return 0;
  return Math.min(
    crush.shedMax,
    Math.round(1 + crush.shedPerForce * (force - crush.shedForce)),
  );
}

/**
 * HOW MUCH OF ITS OWN LENGTH THIS VEHICLE HAS LOST AT EACH END, 0 → 1 — the
 * renderer's read of the fold, and the reason it lives here rather than in the
 * app: the depth is solved in world px against the vehicle's own extent, and
 * the app has no business re-deriving either number.
 */
export function crushShare(other: DriveTraffic): {
  nose: number;
  tail: number;
} {
  const def = vehicleDef(other.variant);
  const reach = Math.max(1, def.halfLengthPx);
  const draw = DRIVE.crush.drawShare;
  return {
    nose: Math.min(1, (other.crushNose / reach) * draw),
    tail: Math.min(1, (other.crushTail / reach) * draw),
  };
}
