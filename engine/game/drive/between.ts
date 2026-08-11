// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHEN TWO OF THEM HIT EACH OTHER — the road's second collision pass, and the
// only one the hero is not a party to.
//
// WHY IT HAS TO EXIST. The moment the traffic had drivers (`ai.ts`) it had
// drivers who get it wrong: somebody pulls out on somebody, a chase comes
// through at seventy over the rest of it, a wreck stands dead in a live lane and
// the car behind it is looking at the car beside it. Without this pass every one
// of those resolves by two vehicles sliding through each other, which reads as
// the road being a painting — and it takes the best thing about a busy
// carriageway away from the player, which is that it can go wrong WITHOUT HIM. A
// pile-up he did not cause and now has to get through is the most interesting
// obstacle this minigame has, and it costs nothing to author.
//
// IT IS THE SAME SUM AS `impact.ts`, between two masses that both matter. What
// it deliberately does NOT do is re-implement what a blow means: the fold, the
// glass, the shed, the wear ladder, the write-off, the roll and the people
// coming out through the screen are all the functions the hero's own collisions
// go through, called with the other vehicle in the hero's place. So a car
// written off by a bus looks exactly like a car written off by the wagon,
// because it IS the same code — and the day somebody adds a rung to that ladder,
// both roads get it.
//
// TWO RULES THAT ARE EASY TO GET WRONG AND EXPENSIVE TO MISS:
//
//   THE HERO CAN STILL HIT IT. A pair that has just crashed is immune to EACH
//   OTHER for a moment (`DriveTraffic.crashCooldownMs`) and to nobody else. Spent
//   on the hero's own latch it would mean driving clean through the crash you
//   were braking for.
//   NOBODY IS RETIRED HERE. A machine snapped in half by the wagon leaves the
//   traffic list; one snapped by a lorry does not, because half a moped lying in
//   a live lane is exactly the obstacle this pass exists to produce. It stays,
//   it is `downed`, and the player still has to go round it.

import { DRIVE, DRIVE_UNITS } from "./config.ts";
import { crushVehicle, shatterGlass, tipsOver, tipVehicle } from "./crush.ts";
import { ejectRider, tearMachine, wreckForce } from "./eject.ts";
import { FLEET, vehicleDef } from "./fleet.ts";
import { hurtTraffic } from "./collide.ts";
import { smashEnd } from "./wreckage.ts";
import { impactMasses, panelAt, type Impact } from "./impact.ts";
import { breakTrafficLamps, knockDown, trafficMass } from "./traffic.ts";
import type { DriveState, DriveTraffic } from "./types.ts";

/** The furthest apart two vehicles' centres can be and still touch — what the
 * sweep below stops looking past. Derived from the fleet rather than written
 * down, so a longer vehicle cannot quietly fall out of its own collisions. */
const SPAN_PX = 2 * Math.max(...FLEET.map((def) => def.halfLengthPx));

/** Is this thing worth solving a collision FOR — i.e. is there anything of it
 * left to hit? A body already sliding down the tarmac still is: a moped on its
 * side is a thing the van behind it runs over. */
function present(other: DriveTraffic): boolean {
  return other.z <= 6;
}

/**
 * EVERY PAIR OF VEHICLES THAT MET THIS TICK.
 *
 * ONE SORT AND A SHORT WINDOW, rather than the every-pair walk this obviously
 * wants to be. A busy carriageway carries forty-odd vehicles and the pass runs
 * sixty times a second, so the quadratic version is sixteen hundred distance
 * tests a tick for a road on which almost nothing is ever within a car's length
 * of anything. Sorted along the road, each vehicle only has to be compared with
 * the handful that follow it inside `SPAN_PX` — which is the whole of the
 * saving, and it is the same trick the lane index uses next door.
 */
export function collideTraffic(drive: DriveState): void {
  const list = drive.traffic.filter(present);
  if (list.length < 2) return;
  list.sort((a, b) => a.pos.x - b.pos.x);
  const mass = impactMasses(drive.params.difficulty);
  for (let i = 0; i < list.length; i++) {
    const a = list[i]!;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]!;
      if (b.pos.x - a.pos.x > SPAN_PX) break;
      if (a.crashCooldownMs > 0 || b.crashCooldownMs > 0) continue;
      meet(drive, a, b, mass.vehicleMult, mass.rider);
    }
  }
}

/**
 * SOLVE ONE PAIR — or find that they never touched.
 *
 * The geometry is `solveImpact`'s, with the one difference that both parties are
 * segments here: the hero's own body is a fixed 48 px laid along the road, and
 * out in the traffic a bus meeting a moped is 44 px of vehicle meeting 20. So
 * the along-road gap is measured between the two EXTENTS and the across-road gap
 * between the two centres — and the across-road one is where the perspective
 * band applies (`DRIVE.impact.bodyBandFrac`), for exactly the reason it applies
 * to the hero: a car's picture stands up the same axis the lanes are laid
 * across, and only the bottom of it is on the ground.
 */
function meet(
  drive: DriveState,
  a: DriveTraffic,
  b: DriveTraffic,
  vehicleMult: number,
  riderMassKg: number,
): void {
  const defA = vehicleDef(a.variant);
  const defB = vehicleDef(b.variant);
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const overlapX = Math.abs(dx) - (defA.halfLengthPx + defB.halfLengthPx);
  const reachY = (defA.radiusPx + defB.radiusPx) * DRIVE.impact.bodyBandFrac;
  if (overlapX > 0 && Math.hypot(overlapX, dy) > reachY) return;
  if (overlapX <= 0 && Math.abs(dy) > reachY) return;

  // THE CONTACT NORMAL, from a toward b. Along the road where the two have
  // driven into each other end-on, across it where they are grinding down each
  // other's flank — and the one blends into the other, which is what makes a
  // corner clip spin them both.
  let nx = overlapX > 0 ? Math.sign(dx) * overlapX : 0;
  let ny = dy;
  const len = Math.hypot(nx, ny);
  if (len < 1e-6) {
    nx = Math.sign(dx) || 1;
    ny = 0;
  } else {
    nx /= len;
    ny /= len;
  }

  // ── THE SUM ───────────────────────────────────────────────────────────────
  const relX = b.speed - a.speed;
  const relY = b.slew - a.slew;
  const closingPx = -(relX * nx + relY * ny);
  if (closingPx < DRIVE.between.minClosePx) return;

  const { mPerPx } = DRIVE_UNITS;
  const { restitution } = DRIVE.between;
  const massA = trafficMass(a, riderMassKg) * vehicleMult;
  const massB = trafficMass(b, riderMassKg) * vehicleMult;
  const reduced = (massA * massB) / (massA + massB);
  const closingMs = closingPx * mPerPx;
  const impulse = (1 + restitution) * reduced * closingMs;
  const joules = 0.5 * reduced * (1 - restitution ** 2) * closingMs * closingMs;

  const contact = {
    x: a.pos.x + nx * defA.halfLengthPx,
    y: (a.pos.y + b.pos.y) / 2,
  };
  drive.events.push({ type: "trafficHit", pos: contact, joules });

  answer(
    drive,
    a,
    b,
    { nx, ny },
    -1,
    impulse / massA / mPerPx,
    joules,
    contact,
    closingPx,
  );
  answer(
    drive,
    b,
    a,
    { nx, ny },
    1,
    impulse / massB / mPerPx,
    joules,
    contact,
    closingPx,
  );

  a.crashCooldownMs = DRIVE.between.immuneMs;
  b.crashCooldownMs = DRIVE.between.immuneMs;
}

/**
 * WHAT ONE OF THE PAIR DOES ABOUT IT — the whole answer for one vehicle, handed
 * to the same functions the hero's blows are.
 *
 * `sign` is which way along the shared normal this one is pushed: −1 for the
 * vehicle the normal points away from, +1 for the one it points at. `dvPx` is
 * this one's own Δv, which is the impulse over ITS mass — so a moped meeting a
 * bus leaves at forty times the bus's answer without a word being written about
 * either of them.
 */
function answer(
  drive: DriveState,
  one: DriveTraffic,
  by: DriveTraffic,
  n: { nx: number; ny: number },
  sign: 1 | -1,
  dvPx: number,
  joules: number,
  contact: { x: number; y: number },
  closingPx: number,
): void {
  const def = vehicleDef(one.variant);
  const dv = { x: sign * n.nx * dvPx, y: sign * n.ny * dvPx };
  const hit: Impact = {
    speedLoss: 0,
    launch: { x: one.speed + dv.x, y: one.slew + dv.y },
    dv,
    impulse: dvPx,
    liftZ: Math.abs(dvPx) * DRIVE.impact.liftFraction,
    joules,
    contact: { x: contact.x, y: contact.y },
    along: (contact.x - one.pos.x) * (one.faceLeft ? -1 : 1),
    // How square the blow was, read the same way the hero's is: the normal onto
    // this vehicle's own nose.
    squareness: Math.abs(n.nx),
    panel: panelAt(0),
    // WHAT THE OTHER ONE WAS DOING along this one's heading — the fact the
    // collision destroys and so has to carry (see `Impact.approach`). It is what
    // tells a rear-ending from a head-on, and a head-on between two of them is
    // the sight this whole pass pays for.
    approach: by.speed * (one.faceLeft ? -1 : 1),
    closingPx,
  };

  breakTrafficLamps(one, by.pos.x);
  const wasWrecked = one.wrecked;
  hurtTraffic(drive, one, hit, by.pos.x);
  const force = wreckForce(one, joules);

  if (def.class === "open") {
    // A CAR MEETING A BICYCLE PUTS THE BICYCLE ON ITS SIDE, whoever is driving
    // the car. The machine goes down and the person on it leaves — the same two
    // verbs the hero's own bumper spends, because it is the same collision.
    //
    // IT IS NOT SNAPPED IN HALF HERE, and that is deliberate rather than
    // missing: a machine that comes apart leaves the traffic list, and the
    // whole point of this pass is to LEAVE things in the road. Down, shedding
    // and sliding is the obstacle; a cloud of debris is scenery.
    drive.remains.push(...ejectRider(drive, one, hit));
    if (!one.downed && force >= DRIVE.traffic.downWear) {
      knockDown(one, dv.y, hit.liftZ, by.pos.y);
      drive.remains.push(...tearMachine(drive, one, hit, force));
      drive.events.push({ type: "machineDown", pos: contact, joules });
    }
    return;
  }

  crushVehicle(one, joules, by.pos.x);
  // …AND THE SAME END THAT FOLDS IS THE END THAT STOPS BEING A CAR. Two vehicles
  // that pile into each other answer for it exactly the way one hit by the wagon
  // does — the crash art, the wheel off that axle, the fuel finding the sparks —
  // which is the whole reason `smashEnd` takes WHO HIT IT rather than assuming
  // the hero.
  smashEnd(drive, one, hit, by.pos.x);
  if (shatterGlass(one, hit)) {
    drive.events.push({ type: "glassSmashed", pos: contact, joules });
  }
  if (one.downed) return;

  // …AND WHAT THE WHOLE VEHICLE DID. Punted along the road, pushed across it,
  // and spun about the point it was struck at — the same three the hero's
  // `shunt` spends, written out here because the driver is not at the wheel of
  // a 48-px side profile and the arm is measured on its own body.
  if (!wasWrecked) {
    one.speed += dv.x;
    const push = Math.max(DRIVE.between.partPx, Math.abs(dv.y));
    one.slew += Math.sign(dv.y || (one.pos.y >= by.pos.y ? 1 : -1)) * push;
    one.slew = Math.max(
      -DRIVE.shuntMaxPx,
      Math.min(DRIVE.shuntMaxPx, one.slew),
    );
    const arm = Math.min(
      1,
      Math.abs(hit.along) / Math.max(1, def.halfLengthPx),
    );
    const yaw =
      Math.abs(dv.y) * DRIVE_UNITS.mPerPx * DRIVE.between.yawPerMs * arm;
    // …in the same band the hero's own blows turn a body through, so a car
    // knocked about by a bus and one knocked about by the wagon are the same
    // sight (`crush.minYawSpin`/`maxYawSpin`, and the spring they swing
    // against).
    one.spin +=
      Math.sign(dv.y || 1) *
      Math.min(DRIVE.between.maxYawSpin, Math.max(DRIVE.crush.minYawSpin, yaw));
  }
  if (tipsOver(one, hit)) {
    tipVehicle(one, hit, by.pos.y);
    drive.events.push({ type: "trafficRolled", pos: contact, joules });
  }
}
