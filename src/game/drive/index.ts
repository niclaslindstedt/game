// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRIVE — the minigame between the garage and GOODCO, and the same road
// back again.
//
// WHAT IT IS. The hero takes the car and goes to work. That is the whole of it:
// one wagon, four lanes, a minute of road, traffic that will not get out of the
// way, and the people the welfare did not reach — who are out on the tarmac
// because a road is where the cars are, and who will walk straight at him.
//
// WHAT IT IS FOR. The joke is that he never mentions it. He worries about the
// people BEFORE he meets them (`monologue`, fired on an empty road, which is the
// only place that promise is cheap to make), and afterwards he remarks on the
// RIDE — whether it was smooth, or a bit bumpy. Nothing in between. The player
// does the reflecting on his behalf, which is the only way this is funny rather
// than nasty, and it is why the arrival lines are written against a body count
// the player cannot get to zero.
//
// WHAT IT AWARDS: speed, and nothing else. No loot, no XP, no drops — which is
// exactly why a party skips it (`docs/multiplayer.md`: a beat that pays nothing
// and seats one person is not something to make seven people watch).
//
// AND IT IS PLAYED ON THE RUN'S OWN RUNG. The difficulty travels in on
// `DriveParams.difficulty` and turns exactly one thing: what the road WEIGHS
// (`impactMasses`). A body costs a MEDIUM driver about a fifth of his speed and
// a JESUS driver nearly half of it, and does proportionally more to the car on
// the way past, because both come out of the same momentum sum. Everything else
// — the course, the crowd, the traffic, the wagon — is the same on every rung.
//
// ── HOW IT SITS IN THE GAME ─────────────────────────────────────────────────
// It is NOT a `GamePhase` and NOT a level. The car reaching the garage's road
// out fires `carDeparted` exactly as it always did; the app catches it and, if
// the minigame is on and nobody else is in the session, puts a DRIVE on screen
// instead of building the destination straight away (see
// pwa/src/game/drive-screen/). When the drive arrives, the app makes the same
// crossing it would have made a minute earlier. So the campaign's shape is
// untouched: turn the setting off and the road is simply not there.
//
// ── AND IT IS DETERMINISTIC ─────────────────────────────────────────────────
// Its own seeded stream, its own clock, no `state.rng()` anywhere near it — so
// a drive replays, tests headlessly, and can never shift a loot roll however
// hard it is driven. A RESTART after a breakdown reuses the seed on purpose:
// the road that killed you is the road you get to learn.

import { createRng } from "@game/lib/rng.ts";
import { clamp } from "@game/lib/vec.ts";

import {
  applyCarPedals,
  CAR,
  carCrossing,
  createCar,
  integrateCarBody,
  nudgeCar,
  wheelAuthority,
} from "../vehicles.ts";
import type { CarDetachable, CarPanelId } from "../types/index.ts";
import { courseLength, DRIVE, DRIVE_OUTCOME } from "./config.ts";
import {
  laneCenter,
  roadEdges,
  resetCrowdMarks,
  spawnCrowd,
  stepCrowd,
} from "./crowd.ts";
import { spawnBlockade } from "./blockade.ts";
import { impactMasses, panelAt, solveImpact } from "./impact.ts";
import {
  burstBody,
  crushRemains,
  forgetRemains,
  splitsBody,
  stepRemains,
} from "./remains.ts";
import {
  fellLamp,
  firstPropSlot,
  propRadius,
  spawnProps,
  stepProps,
} from "./street.ts";
import {
  laneRunsWithHero,
  shunt,
  spawnTraffic,
  stepTraffic,
} from "./traffic.ts";
import type { DriveInput, DriveParams, DriveState } from "./types.ts";

export { courseLength, DRIVE, DRIVE_OUTCOME, DRIVE_UNITS } from "./config.ts";
export type { DriveOutcome } from "./config.ts";
export {
  crossingsBetween,
  crowdEdges,
  CROWD_VARIANTS,
  laneAt,
  laneCenter,
  roadBandEdges,
  roadEdges,
} from "./crowd.ts";
export { TRAFFIC_VARIANTS, laneRunsWithHero } from "./traffic.ts";
export { createDriveDriver, driveDriverInput } from "./driver.ts";
export { DRIVE_BOT_DEFAULTS, resolveDriveBotTuning } from "./driver-tuning.ts";
export type { DriveDriver } from "./driver.ts";
export type { DriveBotPatch, DriveBotTuning } from "./driver-tuning.ts";
export { blockadeAt, GLUED_BARKS, GLUED_VARIANTS } from "./blockade.ts";
export { impactMasses, panelAt, solveImpact } from "./impact.ts";
export type { Impact, ImpactMasses } from "./impact.ts";
export { remainForce, splitsBody } from "./remains.ts";
export type {
  DriveDirection,
  DriveEvent,
  DriveInput,
  DriveParams,
  DrivePedestrian,
  DriveProp,
  DrivePropKind,
  DriveRemain,
  DriveState,
  DriveStrike,
  DriveTraffic,
  PedestrianKind,
  PedestrianMode,
  RemainPart,
} from "./types.ts";
export { IDLE_DRIVE_INPUT } from "./types.ts";

/** Where the car sits across the road when a leg opens — the hero's own side,
 * inside lane. */
function openingLane(direction: 1 | -1): number {
  const lanes = [...Array(DRIVE.laneCount).keys()].filter((lane) =>
    laneRunsWithHero(lane, direction),
  );
  return lanes[direction === 1 ? 0 : lanes.length - 1] ?? 0;
}

/**
 * Build a drive. The car is minted by the RUN's own factory (`createCar`) so it
 * is the same object in the same shape the garage parks — this is the hero's
 * wagon, not a prop that looks like it.
 */
export function createDrive(params: DriveParams): DriveState {
  const rng = createRng(params.seed);
  const heading = params.direction === 1 ? 0 : Math.PI;
  const car = createCar(
    { x: 0, y: laneCenter(openingLane(params.direction)) },
    heading,
  );
  // It rolls onto the road already going — the player is taking over a car
  // that is already leaving, not starting one from a standstill.
  car.speed = DRIVE.topSpeedPx * 0.28;
  car.driver = 0;
  return {
    params,
    rng,
    car,
    distance: 0,
    ms: 0,
    pedestrians: [],
    remains: [],
    traffic: [],
    props: [],
    wheelDebris: [],
    strikes: [],
    events: [],
    bodies: 0,
    shunts: 0,
    posts: 0,
    topSpeed: car.speed,
    outcome: DRIVE_OUTCOME.driving,
    outcomeMs: 0,
    panelJoules: {
      backside: 0,
      doors: 0,
      roof: 0,
      hood: 0,
      front_side: 0,
      bumper: 0,
      glass: 0,
    },
    nextPedestrianAt: resetCrowdMarks(rng),
    nextTrafficAt: DRIVE.crowdStartPx * 0.5,
    nextPropSlot: firstPropSlot(car.pos.x, params.direction),
    monologueDone: false,
    blockadeDone: false,
    nextId: 1,
  };
}

/**
 * Start the leg again after a breakdown — the SAME road, because the seed is
 * the same. A restart that rolled a fresh road would make a crash pure bad luck;
 * this way the second attempt is the one where you already know what is coming
 * out of the third lane, which is the only version worth replaying.
 *
 * The monologue does NOT play again: he has already had that thought, and
 * hearing a man promise to be careful for the fourth time is a different and
 * much worse joke.
 */
export function restartDrive(previous: DriveState): DriveState {
  const next = createDrive(previous.params);
  next.monologueDone = previous.monologueDone;
  return next;
}

/**
 * ONE TICK OF THE ROAD.
 *
 * Order matters in exactly one place and it is the obvious one: the car MOVES
 * before anything is asked whether it was hit, so a collision is resolved
 * against where the bumper actually got to rather than where it was a frame
 * ago. At 624 px/s a tick's travel is ten pixels — the width of a person — so
 * testing before the move would let the crowd pass through the car at speed,
 * which is the one bug that would make the whole minigame read as broken.
 */
export function stepDrive(
  drive: DriveState,
  dtMs: number,
  input: DriveInput,
): void {
  const dt = dtMs / 1000;
  drive.ms += dtMs;
  drive.strikes.length = 0;
  drive.events.length = 0;
  const { car } = drive;
  const dir = drive.params.direction;

  if (drive.outcome !== DRIVE_OUTCOME.driving) {
    // A finished drive still has a picture to show: the wreck rolls to a stop,
    // the road keeps moving under an arriving car, and everything already in
    // the air lands where physics says.
    drive.outcomeMs += dtMs;
    // The wheel is out of the player's hands, and so is the lever: a wreck
    // coasting to a stop must not go on laying skid marks because a thumb was
    // down when the engine gave up.
    car.handbrake = false;
    if (drive.outcome === DRIVE_OUTCOME.broken && car.speed !== 0) {
      car.speed = Math.max(
        0,
        Math.abs(car.speed) - DRIVE.breakdownCoastPx * dt,
      );
    }
    advanceCar(drive, dt);
    stepCrowd(drive, dt);
    stepRemains(drive, dt);
    stepTraffic(drive, dt);
    stepProps(drive, dt);
    integrateCarBody(car, dt);
    stepDebris(drive, dt);
    return;
  }

  // ── THE PEDALS AND THE LEVER ──────────────────────────────────────────────
  // THE SAME PEDALS THE GARAGE HAS, on a much longer leash: `applyCarPedals` is
  // the run's own accelerate / brake / HOLD plus the handbrake, and the only
  // thing the road changes is the number at the top of it — which drops as the
  // car breaks up. So letting go of everything on the motorway means what it
  // means in the bay: carry on as you are. And hauling on the lever means what
  // it means in the bay too, which on a road with a wall of people across it is
  // the difference between the two endings.
  const top = DRIVE.topSpeedPx * (1 - car.wear * DRIVE.wearTopSpeedLoss);
  applyCarPedals(car, input, dt, top, DRIVE.topSpeedPx * 0.1);
  const speed = Math.abs(car.speed);
  if (speed > drive.topSpeed) drive.topSpeed = speed;

  // ── ACROSS THE LANES ──────────────────────────────────────────────────────
  // The WHEEL, answered by sliding rather than by turning. The road and the
  // whole impact model standing on it are axis-aligned, and the body is a side
  // profile that never comes about (`CAR.maxYaw`), so the car crosses lanes
  // instead of changing its heading — which is also what a lane change looks
  // like from above at 120 mph. Authority scales with ground speed for the same
  // reason the run's own steering does: a stopped car does not change lanes.
  //
  // `carCrossing` is the run's own (src/game/vehicles.ts) and the garage spends
  // it on the car's own beam — the immediacy is the SHARED half, and the axis
  // is the only thing the road and the bay disagree about.
  const authority = wheelAuthority(speed, DRIVE.laneRefSpeedPx);
  const wheel = clamp(input.wheel, -1, 1);
  car.pos.y += carCrossing(
    speed,
    wheel,
    dt,
    DRIVE.lateralPx,
    DRIVE.laneRefSpeedPx,
  );
  const edges = roadEdges();
  car.pos.y = clamp(car.pos.y, edges.top, edges.bottom);
  // …but the RACK still answers it, so the front wheel is visibly cranked the
  // way the car is going. The renderer draws `steer`, and without this it would
  // sit dead straight through the entire minigame.
  const wantSteer = wheel * CAR.steerLock * authority * dir;
  car.steer += clamp(
    wantSteer - car.steer,
    -CAR.steerRate * dt,
    CAR.steerRate * dt,
  );

  advanceCar(drive, dt);

  spawnCrowd(drive);
  spawnBlockade(drive);
  spawnTraffic(drive);
  spawnProps(drive);
  stepCrowd(drive, dt);
  stepRemains(drive, dt);
  stepTraffic(drive, dt);
  stepProps(drive, dt);
  collide(drive);
  // WHAT THE WHEELS FIND, AFTER what the bumper met — the order is the car's
  // own: the nose reaches a thing before the axles do, so a body knocked down
  // this tick is run over on a later one rather than being met and crushed in
  // the same instant, which would collapse two beats into one noise.
  crushRemains(drive);
  forgetRemains(drive);
  integrateCarBody(car, dt);
  stepDebris(drive, dt);

  // ── THE BEATS ─────────────────────────────────────────────────────────────
  if (!drive.monologueDone && drive.distance >= DRIVE.monologuePx) {
    drive.monologueDone = true;
    drive.events.push({ type: "monologue" });
  }
  if (drive.distance >= courseLength(drive.params)) {
    drive.outcome = DRIVE_OUTCOME.arrived;
    drive.outcomeMs = 0;
    drive.events.push({ type: "arrived" });
  }
}

/** Roll the car down the road and book the distance it covered. */
function advanceCar(drive: DriveState, dt: number): void {
  const { car } = drive;
  const dir = drive.params.direction;
  if (car.speed === 0) return;
  car.pos.x += dir * car.speed * dt;
  drive.distance = Math.abs(car.pos.x - car.home.x);
}

/** The thrown wheels, bouncing down the road on the run's own debris physics. */
function stepDebris(drive: DriveState, dt: number): void {
  // The car's own module owns the integration; the drive only has to keep the
  // list, because a drive has no `GameState` for `stepVehicles` to walk.
  for (const wheel of drive.wheelDebris) {
    if (wheel.settled) continue;
    stepWheel(wheel, dt);
  }
}

/** One bouncing wheel — the same numbers `WHEEL_DEBRIS` uses inside a run. */
function stepWheel(wheel: DriveState["wheelDebris"][number], dt: number): void {
  wheel.vz -= 500 * dt;
  wheel.z += wheel.vz * dt;
  if (wheel.z <= 0) {
    wheel.z = 0;
    wheel.vz = -wheel.vz * 0.5;
    wheel.vel.x *= 0.85;
    wheel.vel.y *= 0.85;
    if (wheel.vz < 4) wheel.vz = 0;
  }
  wheel.pos.x += wheel.vel.x * dt;
  wheel.pos.y += wheel.vel.y * dt;
  const drag = Math.max(0, 1 - 0.9 * dt);
  wheel.vel.x *= drag;
  wheel.vel.y *= drag;
  wheel.angle += (Math.hypot(wheel.vel.x, wheel.vel.y) / CAR.wheelRadius) * dt;
  if (Math.hypot(wheel.vel.x, wheel.vel.y) < 4 && wheel.z <= 0.5) {
    wheel.settled = true;
  }
}

/** Everything the car touched this tick. */
function collide(drive: DriveState): void {
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
      // ONE OF THE GLUED IS NOT A PEDESTRIAN'S WEIGHT, and that is the whole
      // difference between a wall and a thicker crowd — see
      // `DRIVE.blockade.massMult`.
      ped.kind === "glued"
        ? mass.pedestrian * DRIVE.blockade.massMult
        : mass.pedestrian,
    );
    if (!hit) continue;
    car.speed = Math.max(0, Math.abs(car.speed) - hit.speedLoss);
    if (!ped.counted) {
      ped.counted = true;
      drive.bodies++;
    }
    drive.events.push({
      type: "pedestrianHit",
      pos: { x: hit.contact.x, y: hit.contact.y },
      joules: hit.joules,
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
        panel: panelAt(hit.along),
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
    damage(drive, hit.joules, hit.along, 1);
  }
  drive.pedestrians = drive.pedestrians.filter((ped) => ped.z >= 0);

  for (const other of drive.traffic) {
    if (other.hitCooldownMs > 0) continue;
    const hit = solveImpact(
      car.pos,
      dir,
      car.speed,
      other.pos,
      { x: other.speed, y: other.slew },
      CAR.footprint.radius,
      mass.traffic,
    );
    if (!hit) continue;
    car.speed = Math.max(0, Math.abs(car.speed) - hit.speedLoss);
    drive.shunts++;
    // A SHOVE, NOT A WRECK: it slews out of the lane and scrubs off. The hero's
    // own car takes the exchange properly, which is what makes trading paint
    // the expensive mistake it should be.
    shunt(other, hit.launch.y, car.pos.y);
    drive.events.push({
      type: "trafficHit",
      pos: { x: hit.contact.x, y: hit.contact.y },
      joules: hit.joules,
    });
    damage(drive, hit.joules, hit.along, DRIVE.impact.trafficWearScale);
  }

  // ── THE KERB ──────────────────────────────────────────────────────────────
  // The furniture, which is the same collision again against two things that
  // answer for it very differently. Note what is NOT special-cased: a parked
  // car costs more than the van you were tailgating because it is STILL, so the
  // sweep is the hero's whole speed rather than the difference — the sum
  // already knows, and there is no "parked cars hurt more" rule anywhere.
  for (const prop of drive.props) {
    if (prop.hitCooldownMs > 0) continue;
    if (prop.felled) continue;
    const parked = prop.kind === "parked_car";
    const hit = solveImpact(
      car.pos,
      dir,
      car.speed,
      prop.pos,
      { x: 0, y: 0 },
      propRadius(prop.kind),
      parked ? mass.parked : mass.lamp,
    );
    if (!hit) continue;
    car.speed = Math.max(0, Math.abs(car.speed) - hit.speedLoss);
    if (parked) {
      drive.shunts++;
      // It is a car, so it takes it like one: shoved out of its space, scrubbed
      // and settling. The handbrake is already priced into its mass.
      prop.hitCooldownMs = DRIVE.shuntImmuneMs;
      prop.pos.y += Math.sign(prop.pos.y - car.pos.y || 1) * DRIVE.separationPx;
      drive.events.push({
        type: "trafficHit",
        pos: { x: hit.contact.x, y: hit.contact.y },
        joules: hit.joules,
      });
      damage(drive, hit.joules, hit.along, DRIVE.impact.trafficWearScale);
      continue;
    }
    drive.posts++;
    fellLamp(prop, hit.launch, hit.liftZ);
    drive.events.push({
      type: "lampFelled",
      pos: { x: hit.contact.x, y: hit.contact.y },
      joules: hit.joules,
    });
    damage(drive, hit.joules, hit.along, DRIVE.impact.lampWearScale);
  }
}

/**
 * WHAT A HIT DOES TO THE CAR — the wear, the panel that wore it, the parts that
 * work free, and the moment the whole thing gives up.
 *
 * Everything here is driven by ABSORBED ENERGY rather than by a hit count, which
 * is the difference between "the car breaks after twenty people" and "the car
 * breaks after twenty people AT THIS SPEED". The second one is a game.
 */
function damage(
  drive: DriveState,
  joules: number,
  along: number,
  scale: number,
): void {
  const { car } = drive;
  const share = (joules / DRIVE.impact.wearJoules) * scale;
  const before = car.wear;
  car.wear = Math.min(1, car.wear + share);

  // The panel that actually took it climbs its own ladder.
  const panel = panelAt(along);
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

  // The body takes the blow visibly: the springs get shoved, and every loose or
  // dangling part is shaken by the same hit.
  const kick = share * DRIVE.impact.nudgePerWear;
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

/** Which rung a running total has climbed to. */
function rungFor(total: number, rungs: readonly number[]): number {
  let rung = 0;
  for (const at of rungs) if (total >= at) rung++;
  return rung;
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

/**
 * HOW HE READ THE TRIP — which of his arrival lines this drive earned, as the
 * id of the thought to play.
 *
 * IT READS THE WHOLE DRIVE, not the body count. What the road hands back is
 * five numbers — the clock, the car's own wear, the cars he shoved, the street
 * lights he took out, and the people — and the line he says is about whichever
 * of them is most REMARKABLE, in the order below. That order is the joke's
 * machinery: the car, the clock, the other drivers and the council's lighting
 * all outrank the crowd, because those are the four things a man notices on a
 * commute. A body only ever reaches him as road surface.
 *
 * Kept in the engine rather than app-side so the sim, the tests and the
 * manuscript all agree about where each line sits — and because a headless
 * drive (a balance pass, a soak) can ask what the trip was worth without a
 * renderer.
 */
export function driveVerdict(drive: DriveState): string {
  const { verdict } = DRIVE;
  const { bodies, shunts, posts } = drive;
  // A GENUINELY CLEAN RUN, first because it is the rarest thing on this road by
  // a long way: not a person, not a car, not a post, and the wagon unmarked.
  if (bodies === 0 && shunts === 0 && posts === 0 && drive.car.wear < 0.02) {
    return "drive_arrive_clean";
  }
  // The car, if it barely made it. Nothing else gets a word in.
  if (drive.car.wear >= verdict.wreckWear) return "drive_arrive_wreck";
  // Then the two things that are somebody ELSE's property, which is the only
  // category of damage he has ever been able to see.
  if (posts >= verdict.posts && posts >= shunts) return "drive_arrive_posts";
  if (shunts >= verdict.cars) return "drive_arrive_cars";
  // Then the clock, at either end of it.
  if (drive.ms <= verdict.quickMs) return "drive_arrive_quick";
  if (drive.ms >= verdict.slowMs) return "drive_arrive_slow";
  // And finally the road surface, which is where the people went.
  return bodies >= verdict.bumpyBodies
    ? "drive_arrive_bumpy"
    : "drive_arrive_some";
}

/** The speed the HUD says out loud, in the unit the top end is authored in. */
export function driveMph(drive: DriveState): number {
  return Math.round(
    (Math.abs(drive.car.speed) / DRIVE.topSpeedPx) * DRIVE.topSpeedMph,
  );
}

/** Re-exported so the app can name a panel without importing the engine's whole
 * type barrel. */
export type { CarPanelId };
