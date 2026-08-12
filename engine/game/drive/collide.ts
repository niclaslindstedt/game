// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EVERYTHING THE CAR TOUCHED THIS TICK — the road's one collision pass, and
// what each of the four populations on it does about being hit.
//
// WHY IT IS ITS OWN FILE. It came out of `drive/index.ts`, which had grown past
// the thousand-line cap (§20.5) with this pass as much the largest thing in it —
// and the split is by CONCERN rather than by line count, because the two halves
// are genuinely different jobs. `index.ts` is the TICK: pedals, wheel, spawners,
// the beats, the verdict. This is the CONTACT, and it is the only place in the
// drive that reads one population's state and writes another's.
//
// FOUR POPULATIONS, AND THE ORDER THEY ARE ASKED IN MATTERS ONCE: the bumper
// reaches a thing before the axles do, so the wheels' own pass (`crushRemains`)
// runs after this one and a body knocked down this tick is run over on a later
// one, rather than being met and crushed in the same instant.
//
//   THE CROWD      a person, met by a bumper — `remains.ts` for what is left
//   THE TRAFFIC    a vehicle, which answers with the whole breaking model
//   THE KERB       the furniture: a parked car, and a street light
//   THE HERO       what all of the above costs HIM (`damage`)
//
// THE KERB'S CAR AND THE ROAD'S CAR ANSWER THE SAME WAY, and that is the one
// thing this file exists to guarantee. They did not use to: a moving car got the
// momentum sum, the fold, the glass and the roll, while a PARKED one got a
// one-shot nudge sideways of a fixed number of pixels — because a parked car was
// a `DriveProp`, and a prop has no velocity, no crush, no spin and nothing to
// roll. So the first thing a struck parked car does now is stop being furniture
// (`unparkCar`), and from that instant both go through `breakCar` — one
// function, called from two places, which is the only way the two can be kept
// from drifting apart again.

import { CAR, nudgeCar } from "../vehicles.ts";
import type { CarDetachable } from "../types/index.ts";
import { DRIVE, DRIVE_OUTCOME } from "./config.ts";
import { impactMasses, solveImpact } from "./impact.ts";
import {
  crushVehicle,
  shatterGlass,
  shedCount,
  tipsOver,
  tipVehicle,
} from "./crush.ts";
import { bodyMassMult } from "./crowd.ts";
import { burstBody, splitsBody } from "./remains.ts";
import { fellLamp, propRadius } from "./street.ts";
import {
  breakTrafficLamps,
  knockDown,
  shunt,
  trafficMass,
  unparkCar,
} from "./traffic.ts";
import { vehicleDef } from "./fleet.ts";
import { smashEnd, turnedRound, wreckTotally } from "./wreckage.ts";
import {
  ejectOccupants,
  ejectRider,
  snapMachine,
  tearMachine,
  wreckForce,
} from "./eject.ts";
import type { Impact } from "./impact.ts";
import type { DriveState, DriveTraffic } from "./types.ts";

/**
 * Everything the car touched this tick.
 *
 * `heroSafe` is THE APPROACH, and it is the whole of what the outskirts needed.
 * Out there the wagon is HELD (`DRIVE.opening.handsOff`): the pedal is not
 * connected, the speed is pinned at `entrySpeedPx`, and the player has the wheel
 * for the last second and nothing else. So the tick used to skip this pass
 * entirely — and the oncoming traffic laid down at the gate, which closes on him
 * at the SUM of both speeds and reaches him well before he reaches the gate,
 * went straight THROUGH the car. The first thing the minigame showed a player
 * was its own worst bug.
 *
 * Running the pass with the hero exempt is the honest fix rather than a
 * suppression: the other vehicle answers for the collision in full — it is
 * written off, it folds, it sheds, it is punted, its people leave — and the
 * wagon takes no wear and loses no speed, because it is not being driven yet and
 * a leg that opens by handing the player a bent car and a lost second is not a
 * fair shot at the road. Everything the flag touches is the HERO's half of the
 * answer and nothing else.
 */
export function collide(drive: DriveState, heroSafe = false): void {
  const { car } = drive;
  const dir = drive.params.direction;
  // WHAT THE ROAD WEIGHS ON THIS RUNG, read once for the tick rather than once
  // per body — the difficulty ladder's whole footprint inside the minigame.
  const mass = impactMasses(drive.params.difficulty);

  for (const ped of drive.pedestrians) {
    if (ped.mode === "tumbling") continue;
    const hit = solveImpact(
      car.pos,
      dir,
      car.speed,
      ped.pos,
      ped.vel,
      DRIVE.pedestrianRadiusPx,
      // WHAT THIS PARTICULAR PERSON WEIGHS — the rung's own figure for a body,
      // times THEIR OWN BUILD (`bodyMassMult`, crowd.ts): the old woman is
      // three-quarters of it and the man carrying everything he owns is a third
      // over. It is the same index the player is looking at, so the blow the
      // wheel feels and the person on the bonnet are one thing.
      //
      // …AND ONE OF THE GLUED IS NOT A PEDESTRIAN'S WEIGHT ON TOP OF THAT,
      // which is the whole difference between a wall and a thicker crowd — see
      // `DRIVE.blockade.massMult`. The two multiply rather than one replacing
      // the other: the resin is what the road is holding on to, the body is
      // still a body, and the sound bank needs them kept apart.
      mass.pedestrian *
        bodyMassMult(ped.kind, ped.variant) *
        (ped.kind === "glued" ? DRIVE.blockade.massMult : 1),
    );
    if (!hit) continue;
    // …AND THE CROWD'S OWN SHARE OF THE VOLUME KNOB. A person is five percent
    // of the wagon, which is the bottom of a range the road's one scale cannot
    // price at both ends — see `DRIVE.impact.crowdSpeedLossScale`. It is the
    // SPEED only: the energy, and so the damage, is untouched.
    const loss = spend(
      drive,
      hit.speedLoss * DRIVE.impact.crowdSpeedLossScale,
      heroSafe,
    );
    if (!ped.counted) {
      ped.counted = true;
      drive.bodies++;
    }
    drive.events.push({
      type: "pedestrianHit",
      pos: { x: hit.contact.x, y: hit.contact.y },
      joules: hit.joules,
      kind: ped.kind,
      variant: ped.variant,
    });
    const { gib, split } = drive.params;
    if (gib || split) {
      // THE BODY COMES APART, so the person leaves the crowd — but not the
      // road. What replaces them is `remains`: the pieces, with physics of
      // their own, which the wagon then drags, drops and drives over
      // (`remains.ts`). The STRIKE is still handed over as well, because the
      // instant of the collision is a picture in its own right — the spray, the
      // shower of what was inside — and that one is the app's alone.
      const cutInTwo = split && splitsBody(hit.joules);
      drive.strikes.push({
        id: ped.id,
        pos: { x: ped.pos.x, y: ped.pos.y },
        vel: { x: hit.launch.x, y: hit.launch.y },
        vz: hit.liftZ,
        joules: hit.joules,
        kind: ped.kind,
        variant: ped.variant,
        panel: hit.panel,
        split: cutInTwo,
      });
      const pieces = burstBody(drive, ped, hit, split, gib);
      drive.remains.push(...pieces);
      if (cutInTwo) {
        drive.events.push({
          type: "bodySplit",
          pos: { x: hit.contact.x, y: hit.contact.y },
          joules: hit.joules,
        });
      }
      // Something is under the car and travelling with it — the noise of a body
      // being carried rather than met, which is a different sound and a beat
      // later than the thud.
      if (pieces.some((piece) => piece.dragMs > 0)) {
        drive.events.push({
          type: "bodyCaught",
          pos: { x: hit.contact.x, y: hit.contact.y },
          joules: hit.joules,
          kind: ped.kind,
          variant: ped.variant,
        });
      }
      ped.mode = "tumbling";
      ped.z = -1; // flagged for removal below — it is gone, not lying there
    } else {
      // GORE OFF: nobody comes apart. They are knocked off their feet and
      // tumble to the side of the road, which is a genuinely different physical
      // outcome rather than the same one drawn quietly — see `PedestrianMode`.
      ped.mode = "tumbling";
      ped.vel.x = hit.launch.x;
      ped.vel.y = hit.launch.y;
      ped.vz = hit.liftZ;
      ped.z = 0.01;
    }
    damage(drive, hit, 1, loss, heroSafe);
  }
  drive.pedestrians = drive.pedestrians.filter((ped) => ped.z >= 0);

  // Machines that came apart in the middle this tick — they are dropped from
  // the traffic AFTER the walk, because removing from a list being iterated is
  // how a collision quietly starts skipping the vehicle behind the one it just
  // destroyed.
  const snapped = new Set<number>();

  // ── EVERYTHING ELSE WITH WHEELS ───────────────────────────────────────────
  // One collision, three quite different answers, and which one a vehicle gives
  // is a property of the vehicle rather than a branch on its id: what it
  // WEIGHS decides how far it goes, what CLASS it is decides whether it is
  // shoved or knocked over, and who is ON or IN it decides who leaves.
  for (const other of drive.traffic) {
    if (other.hitCooldownMs > 0) continue;
    const def = vehicleDef(other.variant);
    const hit = solveImpact(
      car.pos,
      dir,
      car.speed,
      other.pos,
      { x: other.speed, y: other.slew },
      def.radiusPx,
      trafficMass(other, mass.rider) * mass.vehicleMult,
      def.halfLengthPx,
      // STEEL ON STEEL: a clip down the flank grinds, and the friction is
      // absorbed by both of them. Without it a sideswipe at the top end was
      // free (`DRIVE.impact.scrapeFriction`).
      1,
      // …AND ONLY THE BOTTOM OF EITHER BODY IS ON THE ROAD. Two vehicles are
      // both mostly air above the sills as far as the lanes are concerned —
      // see `DRIVE.impact.bodyBandFrac`, which the crowd and the lamp posts
      // deliberately do not get.
      DRIVE.impact.bodyBandFrac,
    );
    if (!hit) continue;
    const loss = spend(drive, hit.speedLoss, heroSafe);
    drive.shunts++;
    // ONE CONTACT IS ONE IMPACT — and the cooldown is stamped HERE, before the
    // three answers below, because it used to be stamped inside them and one
    // path had no answer at all.
    //
    // A machine that is ALREADY DOWN takes neither branch: it cannot be knocked
    // over twice, and a light one at low speed is under the force that snaps it
    // — so a bicycle lying in the road that the wagon was sitting on top of was
    // collided with EVERY TICK, sixty times a second, each one booking a shunt,
    // an event and a sound for a blow worth almost no energy at all. It went
    // unnoticed while the road was empty enough that the wagon rarely came to
    // rest on anything; filling the lanes made it constant, and it is the
    // spawner that found it rather than caused it.
    other.hitCooldownMs = DRIVE.shuntImmuneMs;
    drive.events.push({
      type: "trafficHit",
      pos: { x: hit.contact.x, y: hit.contact.y },
      joules: hit.joules,
      class: def.class,
    });
    // …and its lamps at that end go with the paint.
    breakTrafficLamps(other, car.pos.x);
    // WAS IT ALREADY DEAD BEFORE THIS BLOW? Read HERE, because `hurtTraffic` is
    // about to answer it differently — see `breakCar`'s `wasWrecked`.
    const wasWrecked = other.wrecked;
    hurtTraffic(drive, other, hit);

    const force = wreckForce(other, hit.joules);

    if (def.class === "open") {
      // A CAR MEETING A BICYCLE PUTS THE BICYCLE ON ITS SIDE. There is no
      // version of this that is a shove — so the machine goes down and starts
      // shedding itself, and the person on it leaves by an entirely different
      // door.
      drive.remains.push(...ejectRider(drive, other, hit));
      if (force >= DRIVE.traffic.snapForce) {
        // …AND PAST A LINE IT STOPS BEING A VEHICLE AT ALL. The spine goes, the
        // two ends go their own ways, and the machine leaves `traffic`
        // entirely — there is nothing left for the road to steer or shunt.
        //
        // PAST A SECOND LINE IT IS NOT WRECKAGE, IT IS A CLOUD. The halves
        // still go, because the silhouette of half a moped is what tells the
        // player WHAT he just destroyed; everything else is opened right up.
        // This is the ladder the request asked for by name — knocked over,
        // broken in half, and obliterated — and every rung of it is the same
        // force divided by the machine's own mass.
        const gone = force >= DRIVE.traffic.obliterateForce;
        const scale = gone ? DRIVE.traffic.obliterateScale : 1;
        drive.remains.push(...snapMachine(drive, other, hit, force));
        drive.remains.push(
          ...tearMachine(
            drive,
            other,
            hit,
            force,
            gone ? Math.round(DRIVE.traffic.debris.max * scale) : undefined,
            scale,
          ),
        );
        snapped.add(other.id);
      } else if (!other.downed && force >= DRIVE.traffic.downWear) {
        knockDown(other, hit.dv.y, hit.liftZ, car.pos.y);
        drive.remains.push(...tearMachine(drive, other, hit, force));
        drive.events.push({
          type: "machineDown",
          pos: { x: hit.contact.x, y: hit.contact.y },
          joules: hit.joules,
        });
      }
    } else {
      // ANYTHING WITH A ROOF — and the SAME function the kerb's parked cars go
      // through, which is the point of it being a function at all.
      breakCar(drive, other, hit, force, wasWrecked);
    }
    // The hero's own car takes the exchange properly, which is what makes
    // trading paint the expensive mistake it should be.
    damage(drive, hit, DRIVE.impact.trafficWearScale, loss, heroSafe);
  }

  if (snapped.size > 0) {
    drive.traffic = drive.traffic.filter((other) => !snapped.has(other.id));
  }

  // ── THE KERB ──────────────────────────────────────────────────────────────
  // The furniture, which is the same collision again against two things that
  // answer for it very differently. Note what is NOT special-cased: a parked
  // car costs more than the van you were tailgating because it is STILL, so the
  // sweep is the hero's whole speed rather than the difference — the sum
  // already knows, and there is no "parked cars hurt more" rule anywhere.
  //
  // Cars that have stopped being parked this tick — dropped from `props` AFTER
  // the walk, for the reason the snapped machines are: removing from a list
  // being iterated is how a collision quietly starts skipping the piece behind
  // the one it just moved.
  const unparkedProps = new Set<number>();
  for (const prop of drive.props) {
    if (prop.hitCooldownMs > 0) continue;
    if (prop.felled) continue;
    const parked = prop.kind === "parked_car";
    // A parked car is one of the FLEET with the handbrake on, so it argues with
    // the bumper using its own mass rather than a single "parked car" number —
    // which is why shunting a parked bus is a mistake you make once.
    const parkedDef = parked ? vehicleDef(prop.variant) : null;
    const hit = solveImpact(
      car.pos,
      dir,
      car.speed,
      prop.pos,
      { x: 0, y: 0 },
      parkedDef ? parkedDef.radiusPx : propRadius(prop.kind),
      parkedDef
        ? parkedDef.massKg * mass.vehicleMult + mass.parkedExtra
        : mass.lamp,
      parkedDef ? parkedDef.halfLengthPx : 0,
      // A parked car grinds like any other; a lamp post is a column that shears
      // rather than a surface that scrapes, and it is met square nearly every
      // time anyway.
      parked ? 1 : 0,
      // …and it is a CAR, so only the bottom of it is on the road. A LAMP POST
      // is a column from the pavement to well above the roof line and takes the
      // whole body of the wagon — which is the difference the band is for.
      parked ? DRIVE.impact.bodyBandFrac : 1,
    );
    if (!hit) continue;
    const loss = spend(drive, hit.speedLoss, heroSafe);
    if (parked) {
      drive.shunts++;
      // IT IS A CAR, SO IT TAKES IT LIKE ONE — which it could not do while it
      // was furniture. It stops being parked (`unparkCar`), joins the traffic,
      // and goes through the SAME `breakCar` the road's own cars do: it folds
      // at the end that was hit, loses its glass, sheds pieces of itself, is
      // punted, spun, and put on its roof if the blow beat its wheels. The one
      // thing it does not do is empty, because nobody was sitting in it.
      //
      // The handbrake and the kerb behind its wheels were priced into the mass
      // of THIS blow (`impactMasses.parkedExtra`) and are gone from the next
      // one, which is correct: by then the thing is rolling.
      const unparked = unparkCar(drive, prop);
      unparked.hitCooldownMs = DRIVE.shuntImmuneMs;
      breakTrafficLamps(unparked, car.pos.x);
      hurtTraffic(drive, unparked, hit);
      breakCar(drive, unparked, hit, wreckForce(unparked, hit.joules));
      unparkedProps.add(prop.id);
      drive.events.push({
        type: "trafficHit",
        pos: { x: hit.contact.x, y: hit.contact.y },
        joules: hit.joules,
        // A parked car is one of the FLEET with the handbrake on, so it answers
        // this the same way a moving one does — including the parked BUS, which
        // is the thing on this kerb worth shouting about.
        class: parkedDef?.class ?? "car",
      });
      damage(drive, hit, DRIVE.impact.trafficWearScale, loss, heroSafe);
      continue;
    }
    drive.posts++;
    fellLamp(prop, hit.launch, hit.liftZ);
    drive.events.push({
      type: "lampFelled",
      pos: { x: hit.contact.x, y: hit.contact.y },
      joules: hit.joules,
    });
    damage(drive, hit, DRIVE.impact.lampWearScale, loss, heroSafe);
  }

  if (unparkedProps.size > 0) {
    drive.props = drive.props.filter((prop) => !unparkedProps.has(prop.id));
  }
}

/**
 * TAKE THE SPEED THE BLOW COST OFF THE SPEEDOMETER, and answer with how much
 * actually came off.
 *
 * The clamp is why it is a function: a hit can be worth more speed than the car
 * has (a parked bus met at the top end is worth several times it), and what the
 * body of the car then feels is the speed it LOST rather than the speed the sum
 * asked for. Reading that back at every call site is how the shove and the
 * speedometer end up disagreeing.
 *
 * `safe` is the APPROACH (see `collide`), where the wagon is being held at a
 * fixed cruise and nothing it meets may slow it down. It answers ZERO rather
 * than the raw loss, so the body of the car does not dip either — a nose that
 * dived for a hit the speedometer never felt would be the two halves of the
 * picture disagreeing.
 */
function spend(drive: DriveState, loss: number, safe = false): number {
  if (safe) return 0;
  const { car } = drive;
  const had = Math.abs(car.speed);
  car.speed = Math.max(0, had - loss);
  return had - car.speed;
}

/**
 * WHAT A HIT DOES TO THE CAR — the wear, the panel that wore it, the shove the
 * body takes, the parts that work free, and the moment the whole thing gives up.
 *
 * The WEAR is driven by ABSORBED ENERGY rather than by a hit count, which is the
 * difference between "the car breaks after twenty people" and "the car breaks
 * after twenty people AT THIS SPEED". The second one is a game. The SHOVE is
 * driven by the speed the car lost, which is a different quantity and belongs to
 * a different question — see `DRIVE.impact.nudgePerLoss`.
 */
function damage(
  drive: DriveState,
  hit: Impact,
  scale: number,
  loss: number,
  /** THE APPROACH — the wagon wears none of it. See `collide`'s `heroSafe`: the
   * car is not the player's yet, so a leg cannot open by charging him for a
   * collision he had no pedal to avoid. */
  safe = false,
): void {
  if (safe) return;
  const { car } = drive;
  const { joules, along } = hit;
  const share = (joules / DRIVE.impact.wearJoules) * scale;
  const before = car.wear;
  car.wear = Math.min(1, car.wear + share);

  // The panel that actually took it climbs its own ladder — the collision's own
  // answer, carried on the hit, rather than a second derivation of it.
  const { panel } = hit;
  drive.panelJoules[panel] += share;
  const rung = rungFor(drive.panelJoules[panel], DRIVE.panelRungs);
  if (rung > (car.panels[panel] ?? 0)) {
    car.panels[panel] = rung;
    drive.events.push({
      type: "panelBent",
      pos: { x: car.pos.x, y: car.pos.y },
    });
  }
  // Glass goes with the front of the car — a bonnet that has taken this much is
  // not sitting under an intact windscreen.
  if (panel === "hood" || panel === "bumper") {
    car.panels.glass = Math.max(car.panels.glass, Math.min(3, rung));
  }

  // The body takes the blow visibly: the springs get shoved by the DECELERATION
  // — the mass is still going and the wheels are not — and every loose or
  // dangling part is shaken by the same hit.
  const kick = loss * DRIVE.impact.nudgePerLoss;
  nudgeCar(car, along < 0 ? kick : kick * 0.4, along < 0 ? kick * 0.4 : kick);

  // THE FIX LADDER — the parts working free as the whole car gives up. Ordered
  // by what has been doing the work: the bumper first, then the bonnet, then
  // the doors, and the roof last because a roof only goes when everything else
  // already has.
  const order: CarDetachable[] = ["bumper", "hood", "doors", "roof"];
  order.forEach((part, index) => {
    const start = DRIVE.fixRungs[0] ?? 0.45;
    const step = ((DRIVE.fixRungs[2] ?? 0.86) - start) / order.length;
    const climbAt = start + index * step;
    const level = rungFor(car.wear - climbAt, [0, 0.06, 0.13]);
    if (level > (car.fixes[part] ?? 0)) {
      car.fixes[part] = level;
      drive.events.push({
        type: "partShed",
        pos: { x: car.pos.x, y: car.pos.y },
      });
    }
  });

  // A wheel goes late and hard — the moment the wreck starts dragging steel.
  if (car.wear > 0.92 && car.wheelStates[1] !== 3) {
    detachDriveWheel(drive, 1);
  }

  if (before < DRIVE.breakdownWear && car.wear >= DRIVE.breakdownWear) {
    drive.outcome = DRIVE_OUTCOME.broken;
    drive.outcomeMs = 0;
    drive.events.push({
      type: "breakdown",
      pos: { x: car.pos.x, y: car.pos.y },
    });
  }
}

/**
 * WHAT A BLOW DOES TO ANYTHING WITH A ROOF — the whole answer, in one place,
 * because there are two callers and they must never diverge.
 *
 * The two are the ROAD's cars and the KERB's. They used to be written out
 * separately, which is how one of them ended up with the entire breaking model
 * and the other with a twenty-two-pixel hop sideways; a parked car is a
 * `DriveTraffic` by the time it reaches here (`unparkCar`), so there is nothing
 * left to tell them apart and no second copy to keep in step.
 *
 * The cooldown is NOT stamped here — it belongs to the contact rather than to
 * the answer, and the collision pass stamps it on every population at the top
 * (see "ONE CONTACT IS ONE IMPACT").
 */
function breakCar(
  drive: DriveState,
  other: DriveTraffic,
  hit: Impact,
  force: number,
  /**
   * WHETHER IT WAS ALREADY A WRECK BEFORE THIS BLOW — which is NOT the same
   * question as `other.wrecked`, because `hurtTraffic` has already run by the
   * time this is called and may have answered it a moment ago.
   *
   * The difference is the whole point. A car that has been standing dead in a
   * lane since some earlier hit is not shunted again — it is scenery, and it has
   * already gone where it was going. A car that THIS blow has just written off
   * is emphatically shoved: it was hit hard enough to be destroyed, so it is
   * also hit hard enough to be moved, and reading the flag after the fact meant
   * the single hardest collision on the road produced no shove at all. That went
   * unnoticed while a write-off took several blows to arrive at; at the top of
   * this dial it arrives in ONE, so a car met flat out simply stopped dead where
   * it stood.
   */
  wasWrecked = false,
): void {
  const { car } = drive;
  // WHAT IT WAS DOING BEFORE ANY OF THIS — the one reading `turnedRound` below
  // needs and the only place it still exists, because the punt is about to
  // overwrite it (`shunt`).
  const wasDoing = other.speed;
  const hitLeft = car.pos.x < other.pos.x;
  const hitNose = hitLeft === other.faceLeft;
  /** A REAR-ENDING IS THE DIFFERENCE OF THE TWO SPEEDS. `hit.joules` already
   * contains exactly that closing-speed sum; these geometry checks only say
   * that the energy arrived squarely at the tail rather than along a wing. */
  const hardRear =
    !hitNose &&
    hit.approach >= 0 &&
    hit.squareness >= DRIVE.drivers.rearEndSquare &&
    force >= DRIVE.wreckage.rearAxleForce;
  // ── WHAT THE STRUCTURE DID ──────────────────────────────────────────────
  // The body FOLDS at the end that was hit, by a depth the collision's own
  // energy buys against the vehicle's own stiffness (`crush.ts`) — so the same
  // blow shortens a hatchback by a foot and marks a bus.
  const folded = crushVehicle(other, hit.joules, car.pos.x);
  // …AND PAST A SHARE OF WHAT THAT END COULD FOLD AT ALL, IT IS STOVE IN. The
  // latch the picture reads for the rest of the leg: the vehicle swaps to that
  // END's authored crash art, the wheel under it is thrown, and whatever fuel
  // the fold has just opened up may find the sparks it threw (`wreckage.ts`).
  smashEnd(
    drive,
    other,
    hit,
    car.pos.x,
    hardRear,
    hardRear,
    hardRear ? false : undefined,
  );
  // Its glass is not structure and goes long before the body does.
  if (shatterGlass(other, hit)) {
    drive.events.push({
      type: "glassSmashed",
      pos: { x: other.pos.x, y: other.pos.y },
      joules: hit.joules,
    });
  }
  // …and a car that has genuinely folded throws pieces of ITSELF down the road,
  // cut out of its own art by the same tear a motorcycle uses.
  const shed = folded > 0 ? shedCount(force) : 0;
  if (shed > 0) {
    drive.remains.push(...tearMachine(drive, other, hit, force, shed));
  }

  // ── AND WHAT THE WHOLE VEHICLE DID ──────────────────────────────────────
  // It is already a mechanical wreck now; momentum still decides where that
  // wreck goes. It is punted up the road, slewed out of the lane and spun about
  // the point it was struck at, all off the sum's own answer over its own mass.
  if (!other.downed) {
    if (!wasWrecked) shunt(other, hit, car.pos.y);
    // …UNLESS THE SHOVE BEAT ITS OWN WHEELS, in which case it is not being
    // shunted anywhere. It is going over.
    if (tipsOver(other, hit)) {
      tipVehicle(other, hit, car.pos.y);
      drive.events.push({
        type: "trafficRolled",
        pos: { x: other.pos.x, y: other.pos.y },
        joules: hit.joules,
      });
    }
  }
  if (hardRear && !other.downed) {
    const { wreckage } = DRIVE;
    // THE AXLE AND THE SHELL PART COMPANY. The wheels were minted above from
    // the car's PRE-impact speed; now the body spends its remaining motion in
    // the fold and on the bare rear frame. Marking it wrecked prevents a driver
    // from calmly accelerating a wheel-less shell back to cruise speed.
    other.wrecked = true;
    other.wear = Math.max(1, other.wear);
    other.rung = Math.max(3, other.rung);
    other.speed *= wreckage.rearShellSpeedKeep;
    other.brakeMs = DRIVE.drivers.brakeMs;
    // FIRST THE BACK RISES, THEN IT SITS DOWN. The positive body-frame kick
    // raises the tail; the missing-axle rest angle in `traffic.ts` pulls it the
    // other way and leaves the rear metal on the road after the bounce.
    const toNose = other.faceLeft ? -1 : 1;
    other.spin +=
      toNose * wreckage.rearShellPitch * Math.min(1.6, 0.65 + force);
  }
  // ── AND THE ONE BLOW NOTHING SURVIVES ───────────────────────────────────
  // IT TURNED THE THING ROUND. Read off the punt rather than off the geometry,
  // because that is the honest test and it needs no threshold: a car that was
  // coming the other way and is now going back down its own lane has had every
  // scrap of its momentum taken off it and replaced, and a vehicle does not do
  // that to another vehicle gently. So it is the maximum — both ends in, both
  // axles out, the tank gone — whether or not the wagon met it dead square, and
  // whatever the combustion lottery would have said (`wreckTotally`).
  if (turnedRound(wasDoing, other.speed)) {
    wreckTotally(drive, other, hit, car.pos.x);
  }
  // …AND THE PEOPLE INSIDE COME OUT THROUGH THE SCREEN, if the blow was square
  // enough — or die in their seats if it was merely hard enough. Both
  // conditions live in `eject.ts`, and a parked car simply has nobody in it.
  drive.remains.push(...ejectOccupants(drive, other, hit, car.pos.x));
}

/** Which rung a running total has climbed to. */
function rungFor(total: number, rungs: readonly number[]): number {
  let rung = 0;
  for (const at of rungs) if (total >= at) rung++;
  return rung;
}

/**
 * WHAT A HIT DOES TO SOMEBODY ELSE'S VEHICLE — the other half of the trade the
 * hero has always been the only loser in.
 *
 * A CLOSED CAR IS FINISHED BY ANY COLLISION. Five miles an hour is enough: the
 * engine dies, the body swaps to its broken art and the road gets a wreck rather
 * than a live car politely shoved ahead. The hero's wagon is the deliberate
 * videogame exception; its long wear ladder still lives in `damage()` above.
 *
 * Open machines retain the force ladder because their outcomes are different:
 * knocked down, snapped, or obliterated. `wreckForce` still scales those by the
 * machine's own mass, so a bicycle and a motorcycle do not answer alike.
 *
 * EXPORTED FOR THE OTHER COLLISION PASS. Two vehicles that hit each other
 * (`between.ts`) answer for it exactly the way one hit by the wagon does — same
 * ladder, same rungs, same write-off, same people leaving through the same
 * glass — and the only way to guarantee that is for there to be one of this
 * function rather than two. `fromX` is WHO HIT IT, which is the hero for every
 * caller in this file and the other vehicle for the caller next door: it is what
 * decides which end somebody comes out of.
 */
export function hurtTraffic(
  drive: DriveState,
  other: DriveTraffic,
  hit: Impact,
  fromX = drive.car.pos.x,
): void {
  if (other.wrecked) return;
  const force = wreckForce(other, hit.joules);
  const closedCar = vehicleDef(other.variant).class !== "open";
  other.wear = closedCar ? 1 : Math.min(2, other.wear + force);
  const rung = rungFor(other.wear, DRIVE.traffic.rungs);
  if (rung > other.rung) {
    other.rung = rung;
    drive.events.push({
      type: "trafficBent",
      pos: { x: hit.contact.x, y: hit.contact.y },
      joules: hit.joules,
    });
  }
  if (other.wear < 1) return;
  // FINISHED. The engine dies, the thing coasts to a halt in whatever lane it
  // was in, and the road has an obstacle in it nobody placed — which is the
  // whole payoff, and the reason a driver who spends the trip smashing traffic
  // arrives at a road he made worse.
  other.wrecked = true;
  other.slew = 0;
  drive.events.push({
    type: "trafficWrecked",
    pos: { x: other.pos.x, y: other.pos.y },
    joules: hit.joules,
  });
  // …AND A WRITE-OFF ALWAYS HAS AN END STOVE IN, whatever the fold depth says.
  // The two are different currencies: `wear` is absorbed energy over the whole
  // vehicle and this ladder reads it, while `crushNose`/`crushTail` are LENGTHS
  // at one end. A car sideswiped down its whole flank, or clipped a dozen times
  // on alternate corners, arrives here with neither end near the fold line — so
  // it used to stand dead in a live lane, plainly finished, wearing straight
  // ends and both of its wheels. That was the commonest wreck on the road and it
  // is exactly the picture the crash art exists to replace.
  const hitLeft = fromX < other.pos.x;
  const directEnd =
    hit.squareness >= DRIVE.drivers.rearEndSquare
      ? hitLeft === other.faceLeft
      : undefined;
  smashEnd(drive, other, hit, fromX, true, false, directEnd);
  drive.remains.push(
    ...tearMachine(drive, other, hit, wreckForce(other, hit.joules)),
  );
  // THE BREAKDOWN RULE IS NOT AN EJECTION RULE. A five-mile-an-hour contact is
  // enough to kill this non-hero car mechanically, but it is not enough to
  // throw or kill everybody inside it. Only a physically terminal blow forces
  // the cabin empty, through the screen if the blow permits and dead in the
  // seat if it does not. Ordinary low-speed occupants still answer the real
  // force and angle in `breakCar`.
  if (force >= 1) {
    drive.remains.push(...ejectOccupants(drive, other, hit, fromX, true));
  }
}

/** Throw a wheel — the run's own `detachWheel` needs a `GameState` for the
 * spark event and the debris list, so the drive does the same two things
 * against its own. */
function detachDriveWheel(drive: DriveState, axle: 0 | 1): void {
  const { car } = drive;
  const was = car.wheelStates[axle] as number;
  if (was === 3) return;
  car.wheelStates[axle] = 3;
  car.suspension[axle] = CAR.maxCompress;
  car.suspensionVel[axle] = 0;
  const dir = drive.params.direction;
  drive.wheelDebris.push({
    pos: {
      x: car.pos.x + (CAR.wheelOffsets[axle] ?? 0) * dir,
      y: car.pos.y,
    },
    vel: { x: dir * car.speed * 0.6, y: car.speed * 0.15 },
    z: CAR.wheelRadius,
    vz: Math.min(120, 40 + car.speed * 0.2),
    angle: car.wheelAngle,
    wheelState: was,
    settled: false,
  });
}
