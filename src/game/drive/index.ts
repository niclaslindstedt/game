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
// `DriveParams.difficulty` (`DifficultyDef.drive`) and turns three things, all
// of which come out of the ONE line the whole road is priced by — damage goes
// as the SQUARE of the closing speed:
//
//   what the road WEIGHS   `impactMasses` — a body costs a MEDIUM driver about
//                          a fifth of his speed and a JESUS driver nearly half
//                          of it, and does proportionally more to the car on
//                          the way past, out of the same momentum sum.
//   how much TRAFFIC       `trafficDensity`, dividing `DRIVE.laneTraffic` — and
//                          the ONCOMING lanes are laid twice as thin as the
//                          hero's own on every rung, because they close at the
//                          SUM of both speeds and are gone in a second and a
//                          half.
//   how fast the WAGON     `rungTopSpeedPx` — 120 mph on EASY, climbing to the
//                          car's own 174 at the top. It is a ceiling on the
//                          THROTTLE and not a change of scale: `mPerPx` is
//                          pinned, so 120 mph is 120 real miles an hour on
//                          every rung.
//
// The COURSE and the CROWD are the same on every rung.
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
  applyCarWheel,
  CAR,
  createCar,
  integrateCarBody,
} from "../vehicles.ts";
import type { CarPanelId } from "../types/index.ts";
import { courseLength, DRIVE, DRIVE_OUTCOME } from "./config.ts";
import { coastDecelPx, rungTopSpeedPx, throttleAccelPx } from "./drivetrain.ts";
import {
  laneCenter,
  roadEdges,
  resetCrowdMarks,
  resetThoughtDeck,
  spawnCrowd,
  stepCrowd,
} from "./crowd.ts";
import { spawnBlockade } from "./blockade.ts";
// WHAT THE CAR TOUCHED — the whole collision pass, which is its own file
// (`collide.ts`). This module is the TICK; that one is the CONTACT.
import { collide } from "./collide.ts";
import { crushRemains, forgetRemains, stepRemains } from "./remains.ts";
import { firstPropSlot, spawnProps, stepProps } from "./street.ts";
import {
  laneRunsWithHero,
  resetTrafficMarks,
  spawnTraffic,
  stepTraffic,
} from "./traffic.ts";
import { driveTripMs } from "./score.ts";
import type { DriveInput, DriveParams, DriveState } from "./types.ts";

export { courseLength, DRIVE, DRIVE_OUTCOME, DRIVE_UNITS } from "./config.ts";
// THE WAGON'S BROCHURE — the gearbox and the engine curve the road's pull is
// solved from, and the readings the DASHBOARD and the ENGINE NOTE are both
// taken off (`pwa/src/game/hud`, `pwa/src/game/sfx/drive.ts`). One model, read
// by the physics, the dial and the speaker alike.
export {
  coastDecelPx,
  DRIVETRAIN,
  driveThrustPx,
  engineRpm,
  engineTorqueNm,
  gearFor,
  gearRev,
  GEAR_COUNT,
  roadDragPx,
  rungTopSpeedPx,
  solvedTopSpeedPx,
  throttleAccelPx,
} from "./drivetrain.ts";
export type { DriveOutcome } from "./config.ts";
export {
  crossingsBetween,
  crowdEdges,
  CROWD_THOUGHTS,
  CROWD_VARIANTS,
  laneAt,
  laneCenter,
  roadBandEdges,
  roadEdges,
} from "./crowd.ts";
export {
  createTraffic,
  haltTraffic,
  TRAFFIC_VARIANTS,
  laneRunsWithHero,
  trafficMass,
} from "./traffic.ts";
// THE ROLLING STOCK — what every vehicle on this road weighs, how long it is,
// who is on it and how common it is. The app reads it to know which sprite a
// variant wears and where to seat a rider.
export {
  FLEET,
  PAVEMENT_SHARE,
  DRIVER_VARIANTS,
  RIDER_VARIANTS,
  rollVehicle,
  vehicleDef,
} from "./fleet.ts";
export type { DriveVehicleClass, DriveVehicleDef } from "./fleet.ts";
// THE TOWN — the backdrop's own catalog, and the street it lays out. The app
// composes what the planner hands it (`pwa/src/game/drive-screen/town-art.ts`);
// nothing in the sim reads any of it, because nothing on the far verge can be
// hit. It travels through here rather than through `src/menu.ts` for the reason
// the whole drive does: the road is run-facing, and the startup budget has no
// room for it.
export {
  TOWN_ALLEY_PX,
  TOWN_ART_SIZE,
  TOWN_DECALS,
  TOWN_DOORS,
  TOWN_FRONTS,
  TOWN_GARAGE_DOORS,
  TOWN_HOLE_STATES,
  TOWN_FRONTAGE_SETBACK_PX,
  TOWN_JUNK,
  TOWN_PLOT_PX,
  TOWN_PORCHES,
  TOWN_SETBACK_PX,
  TOWN_SIGNS,
} from "./town-parts.ts";
export type { TownDecalDef, TownHoleState, TownPartDef } from "./town-parts.ts";
export {
  TOWN,
  TOWN_COLOURWAYS,
  TOWN_VARIANTS,
  townDef,
  townHeight,
  townPorchSlot,
  townSignSlot,
  townSlots,
  townWidth,
} from "./town.ts";
export type {
  TownBuildingDef,
  TownFront,
  TownRoof,
  TownSlot,
  TownWall,
  TownWindow,
} from "./town.ts";
export {
  planTown,
  resetTownPlan,
  townDistrict,
  townRoad,
} from "./town-plan.ts";
export type { TownLayer, TownProp, TownRoad } from "./town-plan.ts";
export { wreckForce } from "./eject.ts";
export { createDriveDriver, driveDriverInput } from "./driver.ts";
export { DRIVE_BOT_DEFAULTS, resolveDriveBotTuning } from "./driver-tuning.ts";
export type { DriveDriver } from "./driver.ts";
export type { DriveBotPatch, DriveBotTuning } from "./driver-tuning.ts";
export { blockadeAt, GLUED_BARKS, GLUED_VARIANTS } from "./blockade.ts";
export { fellLamp, isMastSlot } from "./street.ts";
export { breakTrafficLamps } from "./traffic.ts";
export { impactMasses, panelAt, solveImpact } from "./impact.ts";
export type { Impact, ImpactMasses } from "./impact.ts";
// HOW A VEHICLE BREAKS — the fold, the glass, the spin and the roll. The app
// reads `crushShare` to draw the fold and nothing else here; the rest is the
// collision's own, exported so the tests can hold the physics to real units.
export {
  crushDepthPx,
  crushShare,
  crushVehicle,
  tipVehicle,
  shatterGlass,
  shedCount,
  tipsOver,
} from "./crush.ts";
export { gibsBody, remainForce, splitsBody } from "./remains.ts";
// WHAT THE LEG WAS WORTH — the arcade score the high-score board ranks, twinned
// with `driveVerdict` below (score.ts explains why both live here).
export { drivePar, driveScore, driveTripMs } from "./score.ts";
export type { DriveScorecard } from "./score.ts";
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
  const trafficMarks = resetTrafficMarks();
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
    nextTrafficAt: trafficMarks.lanes,
    nextPavementAt: trafficMarks.pavement,
    // A fresh deck of things to be thinking, in this seed's own order — and the
    // first of them due with the first person the road puts out.
    thoughtDeck: resetThoughtDeck(params.seed),
    nextThoughtAt: DRIVE.crowdStartPx,
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
 * ago. At 905 px/s a tick's travel is fifteen pixels — wider than a person — so
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
  // …and the number at the top of it is the LADDER's before it is the wear's:
  // the gentle rungs stop the wagon well short of its own top end, because
  // every hazard on this road is priced in closing speed (`rungTopSpeedPx`).
  const rungTop = rungTopSpeedPx(drive.params.difficulty);
  const top = rungTop * (1 - car.wear * DRIVE.wearTopSpeedLoss);
  // …plus the one thing the road does NOT share with the bay: the pull. Out
  // here the shove is a torque curve through an automatic gearbox and the coast
  // is the air, both solved from the wagon's own brochure
  // (`drive/drivetrain.ts`) at whatever speed it is doing this instant — so the
  // car is gutless off the line, strongest in the middle of a gear, pauses at
  // every upshift, and spends the last twenty miles an hour arguing with the
  // wind. `top` is still the ceiling, and on the gentle rungs it is now the
  // thing that actually stops you: the physics runs out of pull at about 174,
  // so anything below that is a genuine cap rather than a formality.
  applyCarPedals(car, input, dt, top, rungTop * 0.1, {
    accelPx: throttleAccelPx(car.speed),
    coastPx: coastDecelPx(car.speed),
  });
  const speed = Math.abs(car.speed);
  if (speed > drive.topSpeed) drive.topSpeed = speed;

  // ── ACROSS THE LANES ──────────────────────────────────────────────────────
  // The WHEEL, answered by sliding rather than by turning. The road and the
  // whole impact model standing on it are axis-aligned, and the body is a side
  // profile that never comes about, so the car crosses lanes instead of
  // changing its heading — which is also what a lane change looks like from
  // above at speed. Authority scales with ground speed: a stopped car does
  // not change lanes.
  //
  // IT IS `applyCarWheel`, THE RUN'S OWN (src/game/vehicles.ts), and that is
  // the whole of the steering in both places. The road and the bay differ by a
  // pair of numbers — how far the body crosses per second, and how fast it has
  // to be going to earn all of it — so those travel as parameters and the code
  // is shared verbatim. The rack it winds on is the same rack too: the renderer
  // draws `steer`, and without it the front wheel would sit dead straight
  // through the entire minigame.
  applyCarWheel(
    car,
    input.wheel,
    dt,
    DRIVE.lateralPx,
    DRIVE.laneRefSpeedPx,
    dir,
  );
  const edges = roadEdges();
  car.pos.y = clamp(car.pos.y, edges.top, edges.bottom);

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
  // category of damage he has ever been able to see. Which of the two he brings
  // up is whichever is further past ITS OWN line, never whichever is the bigger
  // number: a busy road hands out cars by the dozen and street lights three at a
  // time, so a raw `posts >= shunts` compares a tally against a tally on a
  // completely different scale and the council never gets mentioned again.
  if (posts >= verdict.posts && posts / verdict.posts >= shunts / verdict.cars)
    return "drive_arrive_posts";
  if (shunts >= verdict.cars) return "drive_arrive_cars";
  // Then the clock, at either end of it — the TRIP's clock, stopped at the
  // finish line. `drive.ms` is the road's whole lifetime and keeps running
  // through the arrival hold, so reading it directly made a 51-second leg that
  // sat on the arrival beat for a second and a half stop being a quick one
  // (`driveTripMs`, score.ts).
  const tripMs = driveTripMs(drive);
  if (tripMs <= verdict.quickMs) return "drive_arrive_quick";
  if (tripMs >= verdict.slowMs) return "drive_arrive_slow";
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
