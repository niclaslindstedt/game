// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT IS LEFT OF SOMEBODY, AND WHERE IT GOES — the road's own body physics.
//
// WHY THE ROAD NEEDED ITS OWN, when the game already has a gore system that
// takes bodies apart beautifully. Inside a run a body is opened by something
// SWUNG at it: one blow, one instant, everything in the air and back down inside
// a second, and the whole event is a picture the renderer can own by itself
// (pwa/src/game/game-screen/gore-burst.ts). A CAR IS NOT A BLOW. It is a
// four-metre surface travelling at 53 m/s that arrives, stays, and keeps going,
// so what it does to a person is a SEQUENCE rather than a moment:
//
//   IT GOES THROUGH THEM  — past `DRIVE.gore.splitJoules` the bumper takes the
//                           body in two at whatever height it caught them, and
//                           the two halves have opposite fates rather than being
//                           two of the same thing thrown twice.
//   IT CARRIES WHAT IT    — the heavy half goes UNDER, is caught, and travels
//   CAUGHT                  with the wagon for as long as friction lets it. At
//                           the top end that is a screen and a half of tarmac
//                           with somebody underneath it.
//   IT LAYS IT BACK DOWN  — the piece works free, skids out from under the back
//                           of the car, turns over, and comes to rest.
//   AND THEN DRIVES OVER  — because the road is long and pieces land on it. The
//   WHAT IT LAID DOWN       wheels find them, and that is its own moment with
//                           its own noise.
//
// Not one of those four is a moment a renderer could invent, because every one
// of them is a fact about WHERE A THING IS — and the blood the app paints has to
// land under the piece that made it. So the pieces are sim, and the app is
// handed the same deal `DriveStrike` already struck: here is a lump of a person,
// this big, at this spot, doing this; what it is MADE of is yours.
//
// NOTHING HERE SPENDS A DRAW OF `state.rng()`, and that is the same rule the
// loot toss and the run's own gore obey for the same reason: the road's seeded
// stream lays the crowd and the traffic down, so a cosmetic hop that consumed
// one would move every person after it. Every roll below is hashed off the
// victim's own id and position.

import type { Vec2 } from "@game/lib/vec.ts";

import { CAR } from "../vehicles.ts";
import { DRIVE } from "./config.ts";
import type { Impact } from "./impact.ts";
import type {
  DrivePedestrian,
  DriveRemain,
  DriveState,
  RemainPart,
} from "./types.ts";

/** Half the car's body length in world px — the same 48-px assembly reach
 * `solveImpact` measures its contact along, so a piece caught under the car is
 * caught somewhere the car actually is. */
const HALF_BODY = 24;

/**
 * HOW HARD THIS WAS, IN SPLITS. 1 is a collision exactly at the line where the
 * bumper starts going through people, so every ladder in this file reads "at the
 * split, and per unit past it" and the numbers in `DRIVE.gore` mean something
 * out loud.
 */
export function remainForce(joules: number): number {
  return joules / (DRIVE.impact.wearJoules * DRIVE.gore.splitJoules);
}

/** Whether a collision this hard takes a body in two. */
export function splitsBody(joules: number): boolean {
  return remainForce(joules) >= 1;
}

/** A stable 0→1 off a piece's own seed and a salt — the road's gore has no dice
 * of its own on purpose (see the header). */
function hash(seed: number, salt: number): number {
  let h = Math.imul(
    (seed ^ 0x9e3779b9) + Math.imul(salt, 0x27d4eb2f),
    0x85ebca6b,
  );
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** One piece, minted with everything but its physics. */
function mint(
  drive: DriveState,
  ped: DrivePedestrian,
  part: RemainPart,
  cut: number,
  seed: number,
): DriveRemain {
  return {
    id: drive.nextId++,
    kind: ped.kind,
    variant: ped.variant,
    part,
    cut,
    pos: { x: ped.pos.x, y: ped.pos.y },
    vel: { x: 0, y: 0 },
    z: 0,
    vz: 0,
    angle: 0,
    spin: 0,
    dragMs: 0,
    dragAlong: 0,
    dragAcross: 0,
    crushed: false,
    settled: false,
    seed,
  };
}

/**
 * TAKE A STRUCK BODY APART — the one entry point, called from the collision the
 * instant a person is met and nowhere else.
 *
 * `split` and `gib` are the two gore-page switches, carried on the params
 * (`DriveParams`): the first says a fast hit may take a body in TWO, the second
 * that lumps may be torn off it. Neither is asked here beyond being obeyed —
 * the gate was answered before the road existed, which is the house rule.
 *
 * Returns the pieces, which the caller pushes onto the road. The pedestrian is
 * the caller's to delete: this function does not know what a `DriveState`'s
 * crowd list is for.
 */
/**
 * HOW A BURST DIFFERS WHEN THE BODY WAS ALREADY IN THE AIR.
 *
 * A body coming apart ON THE TARMAC has half of itself caught under a car; one
 * that has just been thrown out of a windscreen has nothing under it at all, and
 * every piece of it is still travelling. So an airborne burst is the same burst
 * with two things switched off and one turned up — nothing is caught, everything
 * lifts, and it all goes further.
 */
export type BurstOptions = {
  /** How much extra lift and along-road carry every piece takes. */
  boost?: number;
  /** The body was already off the ground: nothing is caught under the car,
   * because the car is underneath it. */
  airborne?: boolean;
};

export function burstBody(
  drive: DriveState,
  ped: DrivePedestrian,
  hit: Impact,
  split: boolean,
  gib: boolean,
  options: BurstOptions = {},
): DriveRemain[] {
  const { gore } = DRIVE;
  const boost = options.boost ?? 1;
  const airborne = options.airborne ?? false;
  const force = remainForce(hit.joules);
  const seed = Math.abs(Math.round(ped.pos.x * 7 + ped.pos.y * 13)) + ped.id;
  const dir = drive.params.direction;
  const carVx = dir * drive.car.speed;
  const pieces: DriveRemain[] = [];

  // WHERE THE STEEL CAUGHT THEM. Rolled inside the band rather than fixed,
  // because a bumper is at one height and a crowd is not: the same car takes a
  // child through the chest and an old man bent over a cane through the neck.
  const cut =
    gore.cutBand.from + (gore.cutBand.to - gore.cutBand.from) * hash(seed, 3);

  const takenInTwo = split && force >= 1;
  if (takenInTwo) {
    // THE UPPER HALF GOES OVER. Under the car's own along-road speed on purpose
    // (`overRoofCarry`) — the wagon overtakes it while it is in the air, which
    // is what makes the eye read a body going over a roof with nothing anywhere
    // playing an animation of one.
    const upper = mint(drive, ped, "upper", cut, seed ^ 0x51);
    upper.vel = {
      x: carVx * (airborne ? gore.overRoofCarry * boost : gore.overRoofCarry),
      y: (hit.launch.y * 0.55 + (hash(seed, 11) - 0.5) * 40) * boost,
    };
    upper.vz =
      (gore.overRoofLiftPx.base + gore.overRoofLiftPx.perForce * force) * boost;
    upper.z = airborne ? ped.z : 4;
    upper.spin = (hash(seed, 13) < 0.5 ? -1 : 1) * (3 + force);
    pieces.push(upper);

    // …AND THE LOWER HALF GOES UNDER. No lift at all: it drops where it stood
    // and the front wheels are already there — unless the body was already off
    // the ground, in which case there is nothing to catch it ON and it simply
    // travels with everything else.
    const lower = mint(drive, ped, "lower", cut, seed ^ 0xa3);
    lower.vel = { x: carVx * 0.5 * boost, y: hit.launch.y * 0.3 * boost };
    if (airborne) {
      lower.z = ped.z;
      lower.vz = ped.vz * 0.7;
      lower.spin = (hash(seed, 19) < 0.5 ? -1 : 1) * (2 + force);
      pieces.push(lower);
    } else {
      pieces.push(catchOnCar(drive, lower, force));
    }
  } else {
    // NOT FAST ENOUGH TO GO THROUGH: knocked flat, and caught whole. This is the
    // ordinary hit and it is most of the road — the wagon does not butcher
    // everybody, it mostly just runs them down.
    const whole = mint(drive, ped, "whole", cut, seed ^ 0x7f);
    whole.vel = { x: carVx * 0.5 * boost, y: hit.launch.y * 0.4 * boost };
    whole.spin = (hash(seed, 17) < 0.5 ? -1 : 1) * 1.4;
    if (airborne) {
      whole.z = ped.z;
      whole.vz = ped.vz;
      pieces.push(whole);
    } else {
      pieces.push(catchOnCar(drive, whole, force));
    }
  }

  // THE LUMPS TORN OFF ON THE WAY PAST. These are the only gore this file makes
  // that has no job but to be in the road afterwards — they scatter, they
  // bounce, they can be run over, and they are what turns one collision into a
  // stretch of tarmac rather than a spot on it.
  if (gib) {
    const count = Math.min(
      gore.chunks.max,
      Math.round(gore.chunks.base + gore.chunks.perForce * Math.max(0, force)),
    );
    for (let i = 0; i < count; i++) {
      const chunk = mint(drive, ped, "chunk", cut, seed + i * 31);
      const spread = (hash(seed, 23 + i) - 0.5) * 2.2;
      const reach =
        (gore.chunkReachPx.base + gore.chunkReachPx.perForce * force) *
        (0.4 + 0.6 * hash(seed, 41 + i));
      // Thrown along the road with the car's own travel under them, and out
      // across it by the spread — a chunk that only went sideways would read as
      // having been dropped rather than carried.
      chunk.vel = {
        x:
          carVx *
          DRIVE.impact.carryFraction *
          (0.5 + 0.5 * hash(seed, 53 + i)) *
          boost,
        y: Math.sin(spread) * reach,
      };
      chunk.vz =
        (gore.chunkLiftPx.base + gore.chunkLiftPx.perForce * force) *
        (0.35 + 0.65 * hash(seed, 67 + i)) *
        boost;
      chunk.z = airborne ? ped.z : 3;
      chunk.spin = (hash(seed, 71 + i) < 0.5 ? -1 : 1) * (4 + force * 2);
      pieces.push(chunk);
    }
  }
  return pieces;
}

/** Snag a piece under the wagon: pinned to the car, riding along behind the
 * front axle, for as long as friction lets it. */
function catchOnCar(
  drive: DriveState,
  piece: DriveRemain,
  force: number,
): DriveRemain {
  const { gore } = DRIVE;
  piece.dragMs = Math.min(
    gore.dragMs.max,
    gore.dragMs.base + gore.dragMs.perForce * Math.max(0, force),
  );
  piece.dragAlong = gore.dragAlongPx;
  piece.dragAcross =
    (hash(piece.seed, 5) - 0.5) * 2 * gore.dragAcrossPx +
    (piece.pos.y - drive.car.pos.y) * 0.3;
  piece.spin = (hash(piece.seed, 7) < 0.5 ? -1 : 1) * 2.2;
  return piece;
}

/**
 * ONE TICK OF EVERYTHING LYING IN THE ROAD.
 *
 * Three states and they are read in this order, because a piece can only be in
 * one: CAUGHT (pinned to the car and not integrated at all), IN THE AIR
 * (ballistics), or ON THE TARMAC (friction). A settled piece is skipped
 * entirely — a road at the end of a bad minute is holding a hundred of these,
 * and the ones that have stopped moving must cost nothing.
 */
export function stepRemains(drive: DriveState, dt: number): void {
  const { gore } = DRIVE;
  const { car } = drive;
  const dir = drive.params.direction;
  for (const piece of drive.remains) {
    if (piece.settled) continue;

    if (piece.dragMs > 0) {
      // CAUGHT. It goes wherever the wagon goes — which is the whole of "it
      // drags with the car", and why there is no integration on this branch.
      piece.dragMs -= dt * 1000;
      piece.pos.x = car.pos.x + dir * piece.dragAlong;
      piece.pos.y = car.pos.y + piece.dragAcross;
      piece.z = 0;
      piece.angle += piece.spin * dt;
      // It works free when the clock runs out — or the moment the car is no
      // longer going fast enough to be dragging anything.
      if (piece.dragMs <= 0 || Math.abs(car.speed) < gore.dragMinSpeedPx) {
        piece.dragMs = 0;
        piece.vel.x = dir * car.speed * gore.dragSlip;
        piece.vel.y = piece.dragAcross * 0.6;
      }
      continue;
    }

    if (piece.z > 0 || piece.vz > 0) {
      piece.vz -= gore.gravityPx * dt;
      piece.z += piece.vz * dt;
      if (piece.z <= 0) {
        piece.z = 0;
        // Meat keeps almost nothing off the tarmac: it lands, it slaps, and the
        // little that is left is the slither before it stops. STEEL DOES NOT —
        // a torn-off wheel or a hot-box lid skips down the road, and that
        // difference is most of what tells the two materials apart in the air
        // without either of them being drawn differently.
        const bounce =
          piece.part === "machine" ? DRIVE.traffic.debrisBounce : gore.bounce;
        piece.vz = piece.vz < -70 ? -piece.vz * bounce : 0;
        const keep = piece.part === "machine" ? 0.82 : 0.6;
        piece.vel.x *= keep;
        piece.vel.y *= keep;
      }
    }

    piece.pos.x += piece.vel.x * dt;
    piece.pos.y += piece.vel.y * dt;
    const speed = Math.hypot(piece.vel.x, piece.vel.y);
    piece.angle += piece.spin * dt * Math.min(1, speed * gore.spinPerSpeed);
    if (piece.z <= 0) {
      const drag = Math.max(0, 1 - gore.dragPerSec * dt);
      piece.vel.x *= drag;
      piece.vel.y *= drag;
      if (speed < gore.restPx) {
        piece.vel.x = 0;
        piece.vel.y = 0;
        piece.settled = true;
      }
    }
  }
}

/**
 * WHAT THE WHEELS FIND — the car passing over things already lying in the road.
 *
 * It is a SECOND collision pass and deliberately not part of `solveImpact`'s.
 * That one is about momentum: two masses meeting, what the car loses, what the
 * body takes. This one is about nothing of the sort — a wagon at 120 does not
 * notice a kidney, and a kidney does not slow it down. What it does is make a
 * noise, flatten what it found, and kick it a little further up the road, which
 * is three presentation-shaped facts about a thing whose POSITION is the sim's.
 * So it is here, it costs the car nothing, and it books events rather than
 * damage.
 */
export function crushRemains(drive: DriveState): void {
  const { gore } = DRIVE;
  const { car } = drive;
  const dir = drive.params.direction;
  const speed = Math.abs(car.speed);
  // A parked wagon is not running anything over.
  if (speed < gore.dragMinSpeedPx) return;
  // The joules a crush is worth, for the app to size its noise by: it is not a
  // collision, so there is no absorbed energy to read — what a wheel finding
  // somebody is worth is how fast the wheel was going, on the same square curve
  // everything else on this road is priced on.
  const joules =
    DRIVE.impact.wearJoules *
    gore.splitJoules *
    (speed / DRIVE.topSpeedPx) ** 2;

  const underCar = (pos: Vec2, reach: number): boolean => {
    const along = pos.x - car.pos.x;
    if (Math.abs(along) > HALF_BODY) return false;
    return Math.abs(pos.y - car.pos.y) <= CAR.footprint.radius + reach;
  };

  for (const piece of drive.remains) {
    if (piece.crushed || piece.dragMs > 0 || piece.z > 2) continue;
    if (!underCar(piece.pos, gore.crushReachPx)) continue;
    piece.crushed = true;
    // Kicked along the road and pressed flat — a crushed piece has stopped
    // being a shape and started being a mark, which is the app's cue to draw it
    // as one.
    piece.vel.x = dir * speed * gore.crushShove;
    piece.vel.y *= 0.4;
    piece.vz = 0;
    piece.z = 0;
    piece.settled = false;
    drive.events.push({
      type: "bodyCrushed",
      pos: { x: piece.pos.x, y: piece.pos.y },
      joules,
    });
  }

  // THE GORE-OFF ROAD GETS THIS TOO, and that is not an oversight. A body
  // knocked down with the gore switched off is still a body lying in the road,
  // and the wheels still find it — what changes is that nothing comes apart,
  // not that the collision stops happening. The noise is not gore.
  for (const ped of drive.pedestrians) {
    if (ped.mode !== "tumbling" || ped.crushed) continue;
    if (ped.z > 2) continue;
    if (!underCar(ped.pos, gore.crushReachPx)) continue;
    ped.crushed = true;
    ped.vel.x = dir * speed * gore.crushShove;
    drive.events.push({
      type: "bodyCrushed",
      pos: { x: ped.pos.x, y: ped.pos.y },
      joules,
    });
  }

  // …AND THE COUNCIL'S LIGHTING, once it is down. A felled post is dead steel
  // lying across two lanes, and driving over one is a hollow clout rather than a
  // shear — it has already sheared. It is kicked on down the road rather than
  // being hit again, so a gutter-hugging run ends up herding one.
  for (const prop of drive.props) {
    if (!prop.felled || prop.hitCooldownMs > 0) continue;
    if (prop.z > 4) continue;
    if (!underCar(prop.pos, DRIVE.street.lampRadiusPx)) continue;
    prop.hitCooldownMs = gore.crushCooldownMs;
    prop.vel.x = dir * speed * gore.crushShove;
    prop.spin += dir * speed * DRIVE.street.lampSpinPerSpeed * 0.5;
    drive.events.push({
      type: "debrisStruck",
      pos: { x: prop.pos.x, y: prop.pos.y },
      joules,
    });
  }
}

/** Forget what is well behind the car — the same mercy the crowd gets, and the
 * same bound: a road cannot accumulate an hour of somebody. */
export function forgetRemains(drive: DriveState): void {
  const dir = drive.params.direction;
  drive.remains = drive.remains.filter(
    (piece) => (piece.pos.x - drive.car.pos.x) * dir > -DRIVE.despawnBehindPx,
  );
}
