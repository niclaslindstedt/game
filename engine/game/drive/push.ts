// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SHOVING THE THING IN FRONT OF YOU — the road's third contact pass, and the
// only one that is a STATE rather than an event.
//
// WHY IT IS NOT A COLLISION. `collide.ts` and `between.ts` both answer the same
// question — two bodies met, what was that worth — and both are careful to fire
// exactly once per contact (`hitCooldownMs`, `crashCooldownMs`), because a
// collision that repeats sixty times a second is not a collision, it is a
// grinder. That is precisely the right shape for a blow and precisely the wrong
// shape for what happens NEXT: the wagon is still there, still faster, and the
// wreck it just made is still directly in front of its bumper. What follows is
// not another impact. It is a push, it lasts for as long as the player keeps his
// foot in, and everything interesting about it is what changes WHILE it lasts.
//
// …AND IT MAY NEVER REACH FURTHER THAN ONE. A push is what FOLLOWS a contact, so
// the window below is the collision's own (`contactReach`) narrowed by this
// file's slack and never widened by it — see `touching` for what a wider one
// costs, and for why nothing coming the other way is ever being pushed.
//
// FOUR THINGS, AND EACH IS ONE THE PLAYER CAN FEEL:
//
//   HE CARRIES IT      the wreck is dragged up the road at his speed rather than
//                      coasting to a halt under him. It stays in the picture,
//                      filling the lane, for as long as he is behind it.
//   IT COSTS HIM       one engine is now moving two cars, so the speedometer
//                      pays the OTHER car's mass every second — a hatchback is a
//                      tax, a van is most of the throttle, a bus ends the trip.
//                      Nobody authored those three sentences; it is `massKg` in
//                      a division.
//   IT CRABS           a car with its front end folded has its wheels pointing
//                      wherever the impact left them, so being pushed does not
//                      send it straight. It walks sideways, and how fast is the
//                      whole of whether the player is past it in a second or
//                      wearing it up the road.
//   AND IT GRINDS      steel on tarmac, all the way, which the app reads off
//                      `pushMs` and answers with sparks and a noise.
//
// THE CRAB IS DERIVED, NEVER DRAWN, for the reason every cosmetic answer on this
// road is: the seeded stream lays the traffic down, so a draw spent here would
// move every car after it and a replay of the same seed would be a different
// road.

import { CAR } from "../vehicles.ts";
import { contactReach } from "./impact.ts";
import { DRIVE, DRIVE_UNITS } from "./config.ts";
import { vehicleDef } from "./fleet.ts";
import type { DriveState, DriveTraffic } from "./types.ts";

/** Half the wagon's own body length in world px — the same 48-px assembly reach
 * `solveImpact` measures its contact along, so "the bumper is touching it" means
 * the same thing in both passes. */
const HALF_BODY = 24;

/** A stable 0→1 off two integers — this road's own cosmetic dice. */
function hash(a: number, b: number): number {
  let h = Math.imul((a ^ 0x9e3779b9) + Math.imul(b, 0x27d4eb2f), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * WHICH WAY, AND HOW FAST, THIS ONE WALKS WHEN IT IS SHOVED (world px/s).
 *
 * Its own answer, off its own id, so the same car crabs the same way every time
 * it is pushed — a wreck that changed its mind about which side it was leaving
 * by would read as the road cheating rather than as a car with bent steering.
 *
 * A CAR WITH NO FRONT WHEEL BARELY CRABS AT ALL. There is nothing left to point,
 * so it ploughs — which is the worst case for the player and the reason the
 * wheels coming off is a mixed blessing rather than a bonus.
 */
function crabOf(other: DriveTraffic): number {
  const { crabMinPx, crabMaxPx, crabWheelless } = DRIVE.wreckage;
  const roll = hash(other.id, 71);
  const side = hash(other.id, 73) < 0.5 ? -1 : 1;
  const speed = crabMinPx + roll * (crabMaxPx - crabMinPx);
  const steering = other.wheelsOff === 0 ? 1 : crabWheelless;
  return side * speed * steering;
}

/**
 * ONE TICK OF THE SHOVE — called from the tick after both collision passes, so
 * what it is pushing is whatever those two left in front of the bumper.
 */
export function pushTraffic(drive: DriveState, dt: number): void {
  const { car } = drive;
  const dir = drive.params.direction;
  const { wreckage } = DRIVE;
  // HIS OWN ALONG-ROAD SPEED, signed the way the road runs — so the whole pass
  // reads the same on the leg out and the leg home, which is the class of bug
  // `direction` exists to stop.
  const mine = car.speed;
  for (const other of drive.traffic) {
    const def = vehicleDef(other.variant);
    // NOTHING WITH A RIDER ON IT, and nothing already on its side. A moped is
    // knocked flat by any contact at all (`knockDown`) and what is left is
    // debris being driven over rather than a car being shoved — a different
    // beat, already owned by `crushRemains`.
    const shovable =
      def.class !== "open" && !other.downed && !isBehind(drive, other, dir);
    if (!shovable) {
      release(other);
      continue;
    }
    // ── ARE THE TWO OF THEM ACTUALLY IN CONTACT ─────────────────────────────
    // `along` is the gap between the two bodies' ENDS and `across` the offset
    // between their axes — the same pair `solveImpact` measures its contact
    // with, so a negative `along` means the two are overlapped exactly as its
    // `nx === 0` does.
    const along =
      (other.pos.x - car.pos.x) * dir - (HALF_BODY + def.halfLengthPx);
    const across = Math.abs(other.pos.y - car.pos.y);
    // …AND THE BUMPER HAS TO BE ABLE TO REACH IT. The two knobs below are the
    // push's own slack, and slack may only ever make this window SMALLER than
    // the one the collision pass solves against — never larger. Wider by even a
    // pixel and the wagon shoves cars it has never hit: between the two windows
    // sat a crescent about the width of a wing mirror in which a car was picked
    // up, carried, and had its speed overwritten with no collision booked at
    // all — no wear, no `trafficHit`, no sound, the victim untouched — while the
    // hero was dragged from flat out down to `pushFloorPx`. An ONCOMING car
    // caught in it was simply turned round and driven along, which is the one
    // event on this road that has to be a crash.
    const reach = contactReach(def.radiusPx, DRIVE.impact.bodyBandFrac);
    const touching =
      along <= wreckage.pushGripPx &&
      along > -def.halfLengthPx &&
      across <= wreckage.pushBandPx + CAR.footprint.radius &&
      Math.hypot(Math.max(0, along), across) <= reach;
    // …AND IS HE PRESSING? Read as a SIGNED pace along his own heading, because
    // the two questions the magnitude conflates have opposite answers:
    //
    //   IT IS GOING HIS WAY, SLOWER   he is shoving it — the whole of this pass.
    //   IT IS GOING HIS WAY, FASTER   it is running away up the road, and a
    //                                 wreck ahead of the bumper is not a push.
    //   IT IS COMING THE OTHER WAY    he is not pushing it, he is HITTING it.
    //
    // The third one is why the sign matters. On magnitude a car closing at 300
    // simply read as "slower than me", so the shove took it — and `other.speed`
    // below is an assignment, so the pass reversed an oncoming car outright and
    // carried it off in the direction it had just been coming from. A head-on
    // belongs to `collide.ts`, which is the pass that charges both parties for
    // it; leaving it there is what makes the speed the wagon loses to one add up
    // to a crash instead of to nothing.
    const its = other.speed * dir;
    if (!touching || its < 0 || mine <= its * 0.98) {
      release(other);
      continue;
    }

    if (other.pushMs <= 0) other.crab = crabOf(other);
    other.pushMs += dt * 1000;
    // ── A SUSTAINED SHOVE IS ONE CONTACT ────────────────────────────────────
    // …so the collision pass must not keep booking impacts against it, and it
    // WILL if it is not told: the two bodies stay overlapped for the whole
    // push, the drag below costs the hero speed, he puts his foot down and is
    // momentarily closing again, and the moment `shuntImmuneMs` lapses that
    // reads as a fresh blow. Left alone it books a shunt every third of a second
    // for as long as the player leans on the thing — which is the identical
    // "one impact per tick" bug `hitCooldownMs` was added for in the first
    // place, arriving through a door that did not exist when it was written.
    //
    // Holding the latch down for the duration is the honest reading as well as
    // the cheap fix: he is not hitting it, he is pushing it. Back off and come
    // at it again and the gap re-opens, the latch lapses, and the next contact
    // is a genuine second collision.
    other.hitCooldownMs = Math.max(other.hitCooldownMs, DRIVE.shuntImmuneMs);

    // ── HE CARRIES IT ───────────────────────────────────────────────────────
    // Matched to his own pace rather than accelerated toward it: the two bodies
    // are in contact, so they are going the same speed by definition, and easing
    // one toward the other would let the bumper eat its way through the wreck.
    other.speed = dir * mine;
    // …AND THE PERSON IN IT IS ON THE BRAKE, for as long as this lasts and for a
    // beat afterwards (`DRIVE.drivers.brakeMs`). Two things follow, and the
    // second is the whole reason the push has an end worth playing:
    //
    //   A PUSHED VEHICLE IS NOT BEING DRIVEN, so nothing tries to put it back on
    //   a cruising pace while it is under the bumper — which is what the line
    //   here used to say by writing the shove into `cruise` itself.
    //   …AND THAT WAS A LIE THE CAR NEVER RECOVERED FROM: `cruise` is the pace
    //   its driver CHOSE, and overwriting it meant a car shoved to 120 was a car
    //   whose driver had decided to do 120, for ever. Lift off and it did not
    //   slow down at all — it drove away up the road at the speed the wagon had
    //   given it, which is the one thing nobody who has just been rear-ended
    //   does.
    //
    // Re-stamped every tick of contact rather than counted from the first, so
    // the clock starts when the bumper comes OFF it.
    other.brakeMs = DRIVE.drivers.brakeMs;

    // ── AND IT COSTS HIM, BY WHAT IT WEIGHS ─────────────────────────────────
    // The MASS SHARE of the pair: one engine is moving two cars now, so what the
    // wagon loses is its own output over `m_other / (m_car + m_other)`. That is
    // the whole of "how much speed we lose depends on the weight of the other
    // car", and it is bounded by construction — a share of what you have can
    // never be more than what you have, which a fixed deceleration per tonne
    // very much could be (and was: a bus pinned the wagon at a standstill and
    // the leg never ended).
    const share = def.massKg / (DRIVE_UNITS.carMassKg + def.massKg);
    // …AND THE THING IN FRONT HAS ITS BRAKES ON, which is a second and much
    // heavier tax while it lasts. Whoever is in that car is standing on
    // everything they have (`DRIVE.drivers.brakePx`), and the wagon is bolted to
    // it by its own bumper — so it pays the victim's deceleration over the same
    // mass share, which is what turns "I rear-ended somebody" into a thing that
    // costs the trip rather than a thing that speeds it up.
    const braked = other.brakeMs > 0 ? DRIVE.drivers.brakePx * share * dt : 0;
    const drag = car.speed * share * wreckage.pushDragPerSec * dt + braked;
    // …AND THE FLOOR ONLY EVER STOPS THE DRAG. It is a limit on what the shove
    // may TAKE, not a speed the wagon is held at: written as a plain
    // `max(floor, …)` it also raised a car that was already slower, so a player
    // standing on the brake behind a bus was dragged along at the floor with the
    // pedal buried — the one input that ends a push, answered by the push
    // refusing to end. Under the floor the shove simply costs nothing, which is
    // also what keeps a braked victim from being able to pin the wagon: you can
    // always shove the thing in front of you at a walking pace, whatever its
    // driver is doing about it.
    car.speed = Math.max(
      Math.min(car.speed, wreckage.pushFloorPx),
      car.speed - drag,
    );

    // ── AND IT WALKS OUT OF THE WAY, OR DOES NOT ────────────────────────────
    // Eased rather than set, so a wreck that has just been picked up takes a
    // moment to start going sideways — which is what makes the crab something
    // the player watches develop rather than a car that teleports off the line.
    other.slew += (other.crab - other.slew) * Math.min(1, dt * 2.4);
  }
}

/** Let one go — it is not being pushed any more. The CRAB is deliberately kept:
 * its steering is still bent, so the next shove walks it the same way. */
function release(other: DriveTraffic): void {
  other.pushMs = 0;
}

/** Is this one BEHIND the wagon? Nothing behind the bumper is being pushed by
 * it, and without the test a car the hero has just driven past — still inside
 * the along-road window on the wrong side — is dragged along by his back
 * bumper. */
function isBehind(
  drive: DriveState,
  other: DriveTraffic,
  dir: 1 | -1,
): boolean {
  return (other.pos.x - drive.car.pos.x) * dir < 0;
}
