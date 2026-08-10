// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT IS LEFT OF THE CAR YOU HIT — the end that went in, the wheel that left,
// and the fire that found the fuel.
//
// WHY IT IS ITS OWN FILE. `crush.ts` answers what a blow does to a vehicle's
// SHAPE, in the instant of the blow: it folds, its glass goes, it spins, it goes
// over. Everything here happens on a different clock. An end being stove in is a
// LATCH the picture reads for the rest of the leg; a wheel leaving is a body the
// road then carries on its own physics; and a fire is a process — it catches, it
// takes hold, and a few seconds later the tank decides. None of those is
// expressible as "what this collision was worth", which is the whole of what
// `crush.ts` is for.
//
// THREE THINGS, AND THE ORDER THEY HAPPEN IN IS THE POINT:
//
//   THE END GOES IN   past a share of what that end could fold at all, it stops
//                     being a dented car and becomes a wrecked one — and the app
//                     swaps in the authored crash art for that END rather than a
//                     dent rung over the whole body (`smashEnd`).
//   THE WHEEL LEAVES  almost always, because that is what a front-end collision
//                     does to a wheel, and because a wheel bouncing away down the
//                     road is the one piece of a crash that keeps going after the
//                     noise has stopped (`shedEndWheel`).
//   THE FUEL FINDS IT sometimes. A ruptured line under a folded wing, lit by the
//                     sparks the fold threw; then it takes hold, and then the
//                     tank has an opinion (`stepFires`).
//
// NOTHING HERE SPENDS A DRAW OF `state.rng()`, the same rule the crush, the gore
// and the loot toss obey and for the same reason: the road's seeded stream lays
// the crowd and the traffic down, so a cosmetic hop that consumed one would move
// every body and every car after it. Every roll below is hashed off the
// vehicle's own id — and, where it has to change over time, off its own burn
// clock as well.

import { DRIVE, DRIVE_OUTCOME, DRIVE_UNITS } from "./config.ts";
import { vehicleDef } from "./fleet.ts";
import { wreckForce } from "./eject.ts";
import type { Impact } from "./impact.ts";
import type { DriveState, DriveTraffic } from "./types.ts";

/** A stable 0→1 off two integers — this road's own cosmetic dice. */
function hash(a: number, b: number): number {
  let h = Math.imul((a ^ 0x9e3779b9) + Math.imul(b, 0x27d4eb2f), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * IS THIS END STOVE IN YET — the threshold the whole picture hangs off.
 *
 * Measured against what that end could fold AT ALL rather than against a fixed
 * depth, so it means the same thing on a moped and on a bus: a third of the way
 * to structurally finished. A bus's third is a great deal more absorbed energy
 * than a hatchback's, which is correct and is the fleet's own mass doing it.
 */
function smashedYet(other: DriveTraffic, depth: number): boolean {
  const def = vehicleDef(other.variant);
  const cap = def.halfLengthPx * DRIVE.crush.maxShare;
  return depth >= cap * DRIVE.wreckage.smashShare;
}

/**
 * WHICH END TOOK IT, AND WHAT THAT COSTS — called once per blow, after the fold
 * has been solved.
 *
 * `fromX` is where the blow came from, and which END that is depends on which
 * way the vehicle is pointing — the identical reasoning `crushVehicle` and
 * `breakTrafficLamps` already use, and for the identical reason: the road runs
 * both ways, so a hit "on the left" is a nose for half the traffic and a tail
 * for the other half.
 */
export function smashEnd(
  drive: DriveState,
  other: DriveTraffic,
  hit: Impact,
  fromX: number,
): void {
  const hitLeft = fromX < other.pos.x;
  const nose = hitLeft === other.faceLeft;
  const depth = nose ? other.crushNose : other.crushTail;
  if (!smashedYet(other, depth)) return;
  if (nose ? other.smashNose : other.smashTail) return;
  if (nose) other.smashNose = true;
  else other.smashTail = true;
  drive.events.push({
    type: "endSmashed",
    pos: { x: hit.contact.x, y: hit.contact.y },
    joules: hit.joules,
  });
  shedEndWheel(drive, other, nose, hit);
  igniteFrom(drive, other, hit);
}

/**
 * THROW THE WHEEL UNDER THE END THAT WENT IN.
 *
 * WHERE IT GOES IS THE COLLISION'S OWN ANSWER, not a scatter. A wheel is torn
 * off by a load that arrived along the road, so it leaves along the road: it
 * keeps most of what the car it was bolted to was doing, takes the along-road
 * share of the blow on top, and is kicked ACROSS by whatever lateral Δv the same
 * blow had. That is why a wheel off a car met head-on comes back over the
 * wagon's roof while one off a car clipped on the corner skitters into the
 * gutter — two quite different sights out of one sum, with no rule for either.
 *
 * It rolls, so it is handed to the run's own `WheelDebris` physics (bounce,
 * roll-out, friction, settle) exactly as one off the hero's own axle is. The
 * road already draws that list; nothing new had to learn what a wheel is.
 */
export function shedEndWheel(
  drive: DriveState,
  other: DriveTraffic,
  nose: boolean,
  hit: Impact,
): void {
  const bit = nose ? 1 : 2;
  if ((other.wheelsOff & bit) !== 0) return;
  // ALMOST ALWAYS — and the "almost" is what stops a lane of wrecks reading as
  // one repeated event. Hashed off the vehicle's own id and which end it is, so
  // it is settled the same way on a replay of the same seed.
  if (hash(other.id, nose ? 17 : 29) < DRIVE.wreckage.wheelKeep) return;
  other.wheelsOff |= bit;

  const def = vehicleDef(other.variant);
  // WHERE THAT WHEEL ACTUALLY IS. The axle sits about two thirds of the way out
  // from the middle, and which way "out" is depends on the facing — the same
  // body-ends-not-screen-ends rule the crush and the lamps keep.
  const toNose = other.faceLeft ? -1 : 1;
  const along = def.halfLengthPx * 0.62 * (nose ? toNose : -toNose);
  const { wheelThrowPx, wheelLiftPx } = DRIVE.wreckage;
  const force = Math.min(2, wreckForce(other, hit.joules));
  const spin = hash(other.id, nose ? 31 : 37);
  drive.wheelDebris.push({
    pos: { x: other.pos.x + along, y: other.pos.y },
    vel: {
      // It keeps most of the car's own travel and takes the blow's along-road
      // share on top, which is what sends a wheel off a head-on back UP the road
      // toward the thing that hit it.
      x: other.speed * 0.75 + hit.dv.x * 0.5,
      // …and is kicked across by the lateral half of the same blow, with a
      // little of its own so a dead-square hit still throws it off the axis.
      y: hit.dv.y * 0.6 + (spin - 0.5) * wheelThrowPx * (0.4 + force * 0.5),
    },
    z: DRIVE_UNITS.mPerPx > 0 ? 4 : 4,
    vz:
      wheelLiftPx *
      (0.35 + 0.65 * hash(other.id, nose ? 41 : 43)) *
      (0.5 + force * 0.5),
    angle: spin * Math.PI * 2,
    // A wheel that has been through this is not a round one any more, unless it
    // was a light hit — the same two-picture ladder the hero's own thrown wheels
    // read (`WheelDebris.wheelState`).
    wheelState: force > 0.6 ? 1 : 0,
    settled: false,
  });
  drive.events.push({
    type: "wheelTorn",
    pos: { x: other.pos.x + along, y: other.pos.y },
    joules: hit.joules,
  });
}

/**
 * DID THE FUEL FIND THE SPARKS — asked once, on the blow that stove the end in.
 *
 * ASKED THERE AND NOWHERE ELSE, on purpose. A fire wants a ruptured line and an
 * ignition source in the same place, and the moment a structure folds far enough
 * to matter is the only moment on this road where both are guaranteed. Rolling
 * for it on every contact instead would put a lane of burning cars behind any
 * player who spent a minute trading paint, which is a road on fire rather than a
 * collision.
 */
function igniteFrom(drive: DriveState, other: DriveTraffic, hit: Impact): void {
  if (other.fire > 0) return;
  const force = wreckForce(other, hit.joules);
  const chance = Math.min(0.9, force * DRIVE.wreckage.firePerForce);
  if (hash(other.id, 53) >= chance) return;
  catchFire(drive, other, hit.contact);
}

/**
 * LIGHT ONE — the one door into the burn, so a fire started by a blow and a fire
 * started by the car next to it going up are the same thing.
 */
export function catchFire(
  drive: DriveState,
  other: DriveTraffic,
  at: { x: number; y: number },
): void {
  if (other.fire > 0 || other.blown) return;
  // It starts as a flicker under a wing, never as a burning car: the whole value
  // of the beat is watching it take.
  other.fire = 0.12;
  other.fireMs = 0;
  drive.events.push({
    type: "trafficFire",
    pos: { x: at.x, y: at.y },
    joules: 0,
  });
}

/**
 * ONE TICK OF EVERY FIRE ON THE ROAD — it takes hold, and then the tank decides.
 *
 * A WALK OF THE ROAD RATHER THAN AN ANSWER TO AN EVENT, for the reason the
 * wreck smoke is one: a fire is not an instant. It catches on the tick of a
 * collision and then does its own thing for the next several seconds while the
 * player drives away from it, and the only place that can live is a pass over
 * the state on the fixed step.
 */
export function stepFires(drive: DriveState, dt: number): void {
  const { wreckage } = DRIVE;
  for (const other of drive.traffic) {
    if (other.fire <= 0) continue;
    other.fireMs += dt * 1000;
    if (other.blown) {
      // Past the bang it burns itself out rather than staying lit for the leg —
      // there is nothing left in it to burn.
      other.fire = Math.max(0, other.fire - dt * 0.22);
      continue;
    }
    other.fire = Math.min(1, other.fire + dt * wreckage.fireGrowPerSec);
    if (other.fire < wreckage.blowAtFire) continue;
    if (other.fireMs < wreckage.blowAfterMs) continue;
    // WHETHER IT GOES UP AT ALL. Hashed off the vehicle AND its own burn clock,
    // quantised to a tenth of a second — so it is a per-tick roll that costs the
    // road's stream nothing and replays identically on the same seed.
    const tick = Math.floor(other.fireMs / 100);
    if (hash(other.id * 131 + tick, 67) >= wreckage.blowChancePerSec * dt) {
      continue;
    }
    explode(drive, other);
  }
}

/**
 * THE TANK GOES — the biggest single thing that happens on this road, and the
 * only one that reaches the hero without him touching anything.
 *
 * FOUR THINGS AT ONCE, and they are four because an explosion is not a bigger
 * collision: the vehicle is finished, whatever is standing in the fireball is
 * shoved, whatever is standing in it may CATCH (which is how a pile-up becomes a
 * chain), and the hero wears a share of it as wear on his own car. The last one
 * is the reason a burning wreck is a thing to drive away from rather than a
 * thing to watch.
 */
function explode(drive: DriveState, other: DriveTraffic): void {
  const { wreckage } = DRIVE;
  other.blown = true;
  other.fire = 1;
  other.glassOut = true;
  other.wrecked = true;
  drive.events.push({
    type: "trafficExploded",
    pos: { x: other.pos.x, y: other.pos.y },
    joules: DRIVE.impact.wearJoules * wreckage.blastWear,
  });

  // ── WHAT IS STANDING IN IT ────────────────────────────────────────────────
  for (const near of drive.traffic) {
    if (near.id === other.id) continue;
    const dx = near.pos.x - other.pos.x;
    const dy = near.pos.y - other.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist > wreckage.blastReachPx) continue;
    const share = 1 - dist / wreckage.blastReachPx;
    const def = vehicleDef(near.variant);
    // Over its own mass, like everything else out here — a blast that moved a
    // bus and a bicycle equally would be the one sum on this road that had
    // forgotten what the fleet is for.
    const shove =
      (wreckage.blastShovePx * share * DRIVE_UNITS.trafficMassKg) /
      Math.max(1, def.massKg);
    near.slew += (dy >= 0 ? 1 : -1) * shove;
    near.speed += (dx >= 0 ? 1 : -1) * shove * 0.4;
    near.vz = Math.max(near.vz, shove * 0.35);
    // …AND THE CHAIN. A car sitting in somebody else's fireball is a car with
    // fuel in it and a fire around it; nothing else on this road can light one,
    // which is exactly why a row of wrecks going up one after another is worth
    // the trip back.
    if (share > 0.45) catchFire(drive, near, near.pos);
  }

  // ── AND WHAT IT COSTS THE HERO ────────────────────────────────────────────
  const { car } = drive;
  const reach = Math.hypot(car.pos.x - other.pos.x, car.pos.y - other.pos.y);
  if (reach > wreckage.blastReachPx) return;
  const share = 1 - reach / wreckage.blastReachPx;
  const before = car.wear;
  car.wear = Math.min(1, car.wear + wreckage.blastWear * share);
  if (before < DRIVE.breakdownWear && car.wear >= DRIVE.breakdownWear) {
    drive.outcome = DRIVE_OUTCOME.broken;
    drive.outcomeMs = 0;
    drive.events.push({
      type: "breakdown",
      pos: { x: car.pos.x, y: car.pos.y },
    });
  }
}
