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
// ── AND IT IS FOUR STRETCHES, NOT ONE, AND THEY ARE SYMMETRIC ───────────────
// A leg used to be one uniform road with an empty patch at the start of it, and
// then three: an outskirt, a town, and a run-in. It is FOUR now and the shape is
// a mirror, because the road is driven BOTH WAYS and a road that only reads
// right one way round is half a road. Every rule below that reads a distance is
// really asking which stretch the car is on:
//
//   THE OUTSKIRTS   0 → `cityStartPx`. Out of town: no houses, no far pavement,
//                   nobody on the tarmac, and the only traffic is the delivery
//                   trade and the cyclists on the one pavement there is. The
//                   camera opens carried ahead of the car (`DriveState.entryPx`)
//                   so the leg begins on an empty road and the wagon slides into
//                   it from behind; the wheel is the player's the moment it
//                   lands, the pedal is capped (`opening.cruisePx`) until the
//                   town, and he says what he has to say.
//   THE TOWN        `cityStartPx` → `cityEndPx`. The minigame. Everything
//                   arrives at once — the houses, the far pavement, the crowd,
//                   the lane traffic — and the CLOCK starts, which is the
//                   number the high-score board ranks (`DriveState.clockMs`).
//   THE RUN-OUT     `cityEndPx` → `courseLength`. The outskirts again, and the
//                   SAME LENGTH as the first stretch on purpose: the town ends,
//                   the clock stops, the road closes back to two lanes, and what
//                   is left is a country road the player still drives but is no
//                   longer scored on. It exists so that THE LEG DRIVEN THE OTHER
//                   WAY HAS AN OPENING — the wagon sliding into frame, the two
//                   lines said over an empty road, the town arriving in front of
//                   the player — because the stretch one leg opens over is the
//                   stretch the other leg finishes on.
//   THE RUN-IN      past the finish. The wheel comes off the player and the car
//                   rolls in on its own, past whatever is at this end of the
//                   road (`sites.ts`): GOODCO's fence with the data halls and
//                   the ship behind them, or his own gate with his own house and
//                   his own ship on the lawn. He says the one thing he has to say
//                   about it, gets out, and the picture goes out.
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
import {
  cityEndPx,
  cityStartPx,
  courseLength,
  DRIVE,
  DRIVE_OUTCOME,
} from "./config.ts";
import { coastDecelPx, rungTopSpeedPx, throttleAccelPx } from "./drivetrain.ts";
import {
  laneCenter,
  roadEdgesAt,
  roadWideningAt,
  resetCrowdMarks,
  resetThoughtDeck,
  spawnCrowd,
  stepCrowd,
} from "./crowd.ts";
import { spawnBlockade } from "./blockade.ts";
// WHAT THE CAR TOUCHED — the whole collision pass, which is its own file
// (`collide.ts`). This module is the TICK; that one is the CONTACT.
import { collide } from "./collide.ts";
// …AND WHAT THE TRAFFIC TOUCHED WITHOUT HIM. The road's second collision pass,
// which is the only one the hero is not a party to — a pile-up he did not cause
// and now has to get through (`between.ts`).
import { collideTraffic } from "./between.ts";
import { crushRemains, forgetRemains, stepRemains } from "./remains.ts";
import { firstPropSlot, spawnProps, stepProps } from "./street.ts";
import {
  haltTraffic,
  laneRunsWithHero,
  resetTrafficMarks,
  spawnTraffic,
  stepTraffic,
} from "./traffic.ts";
import { driveTripMs } from "./score.ts";
import { driveSite } from "./sites.ts";
import type { DriveInput, DriveParams, DriveState } from "./types.ts";

export {
  cityEndPx,
  cityLength,
  citySpanX,
  cityStartPx,
  courseLength,
  DRIVE,
  DRIVE_OUTCOME,
  DRIVE_UNITS,
} from "./config.ts";
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
  roadBandHalfAt,
  roadEdges,
  roadEdgesAt,
  roadWideningAt,
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
// hit. It travels through here rather than through `engine/menu.ts` for the reason
// the whole drive does: the road is run-facing, and the startup budget has no
// room for it.
export {
  TOWN_ALLEY_PX,
  TOWN_ART_SIZE,
  TOWN_DECALS,
  TOWN_DOORS,
  TOWN_FRONTS,
  TOWN_FRONTS_BREAK,
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
  townWalkwayRows,
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
  inTown,
  planTown,
  resetTownPlan,
  townDistrict,
  townRoad,
} from "./town-plan.ts";
export type { TownLayer, TownProp, TownRoad } from "./town-plan.ts";
// …AND WHAT IS AT THE END OF IT. A destination's own site is a fixed dressing
// rather than a district of the town (`sites.ts` says why), and it comes out of
// its planner in the town's own shape, so the renderer draws it with the pass it
// already had. Two of them: GOODCO at the end of the road out, and the hero's
// own lot at the end of the road back.
export {
  driveSite,
  DRIVE_SITES,
  planSite,
  siteRunInPx,
  siteSpanX,
  siteVehicles,
} from "./sites.ts";
export type {
  DriveSiteId,
  SiteGround,
  SiteLayout,
  SitePiece,
  SiteVehicle,
} from "./sites.ts";
export { CAMPUS, CAMPUS_ART_SIZE } from "./campus.ts";
export { HOMESTEAD, HOME_ART_SIZE } from "./homestead.ts";
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
  // IT IS ALREADY GOING, AND IT IS NOT YET IN THE PICTURE. The leg opens on a
  // stretch of empty road with the camera carried ahead of the car
  // (`entryPx`); what the wagon is doing under that is a steady cruise, so it
  // comes into frame from behind at a pace that reads as being caught up with
  // rather than as arriving.
  car.speed = DRIVE.opening.entrySpeedPx;
  car.driver = 0;
  const trafficMarks = resetTrafficMarks(params);
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
    nextPedestrianAt: resetCrowdMarks(rng, params),
    nextTrafficAt: trafficMarks.lanes,
    nextPavementAt: trafficMarks.pavement,
    // A fresh deck of things to be thinking, in this seed's own order — and the
    // first of them due with the first person the road puts out.
    thoughtDeck: resetThoughtDeck(params.seed),
    nextThoughtAt: cityStartPx(params),
    nextPropSlot: firstPropSlot(car.pos.x, params.direction),
    monologueDone: false,
    blockadeDone: false,
    entryPx: DRIVE.opening.entryPx,
    clockMs: 0,
    cityDone: false,
    townEndDone: false,
    sightDone: false,
    blackoutDone: false,
    nextId: 1,
  };
}

/**
 * IS THE CAR STILL ARRIVING? — the one test the whole opening hangs off.
 *
 * While it holds, the camera is carried ahead of the wagon, the pedals and the
 * wheel are not connected to anything, and the road is a picture of itself. The
 * instant it stops holding, the player has the car.
 */
export function driveArriving(drive: DriveState): boolean {
  return drive.entryPx > 0;
}

/** Is the car in the town — the stretch the clock runs over and the minigame
 * actually happens on? False on either outskirt and false once the finish is
 * behind him. */
export function driveInCity(drive: DriveState): boolean {
  return (
    drive.cityDone &&
    !drive.townEndDone &&
    drive.outcome === DRIVE_OUTCOME.driving
  );
}

/**
 * IS THE DASHBOARD UP — has the car come close enough to the town for the
 * instruments to be worth reading?
 *
 * The opening plays with no HUD over it at all: the pedal is capped, nothing is
 * scored, and three dials reporting that nothing is happening spend the one
 * thing that stretch of road has. They arrive a short way before the gate
 * (`DRIVE.opening.dashAtPx`), so the dashboard is settled by the time the clock
 * starts rather than landing on the same frame as it.
 *
 * ANSWERED HERE rather than by the app, because it is a fact about the ROAD —
 * where on the leg the minigame begins to be a minigame — and the app has two
 * hosts that would otherwise each decide it.
 */
export function driveDashUp(drive: DriveState): boolean {
  return (
    drive.cityDone ||
    drive.distance >= cityStartPx(drive.params) - DRIVE.opening.dashAtPx
  );
}

/**
 * IS THE CAR STILL BEING HELD — the approach's countdown, and the ONE test
 * everything about the opening hangs off.
 *
 * True from the first frame to the gate: the speed is the opening's own
 * (`entrySpeedPx`), the pedal reaches nothing, and the picture is a car being
 * shown to somebody rather than driven by them. False for the whole of the rest
 * of the leg, including a wreck and an arrival — both of those are the outcome's
 * business, and neither is an opening.
 *
 * ANSWERED HERE rather than by the app, for the reason `driveDashUp` is: it is a
 * fact about the ROAD, and the app has two hosts that would otherwise each
 * decide it.
 */
export function driveHandsOff(drive: DriveState): boolean {
  return DRIVE.opening.handsOff && !drive.cityDone;
}

/**
 * …AND IS THE WHEEL HIS YET — the last second of that hold.
 *
 * The dashboard's mark and the wheel's are the SAME mark (`dashAtPx`), because
 * they are one beat: the instruments slide in, the car becomes steerable, GET
 * READY is on the screen, and a second later the flag drops. A player who spends
 * that second moving into the lane he wants has done the only thing the opening
 * asks of him, and done it before anything can hit him for getting it wrong.
 */
export function driveSteerOnly(drive: DriveState): boolean {
  return driveHandsOff(drive) && driveDashUp(drive);
}

/**
 * …AND IS THE COUNTDOWN BEING SAID OUT LOUD — the GET READY beat.
 *
 * IT IS THE WIDENING (`roadWideningAt`), NOT A CLOCK. The road opens out from
 * two lanes to four over the last stretch before the first house
 * (`DRIVE.opening.widenPx`), and that taper is the first thing the player can
 * SEE of the town arriving — so it is the honest frame to say the words on. The
 * caption used to be up for the WHOLE approach, which is ten seconds of a car
 * on an empty road being told to get ready for nothing, over the top of the two
 * lines the hero is trying to say. Now it arrives with the thing it is about.
 *
 * The beats it sits between are both already named here: the widening starts it,
 * `driveSteerOnly` hands back the wheel a second out, and the gate takes the
 * caption away as the pedal and the clock arrive.
 *
 * ANSWERED HERE rather than by the app, for the reason `driveDashUp` is: it is a
 * fact about the ROAD, and the app has two hosts that would otherwise each
 * decide it.
 */
export function driveReadyUp(drive: DriveState): boolean {
  return driveHandsOff(drive) && roadWideningAt(drive.distance, drive.params);
}

/**
 * PUT THE CAR AT THE GATE — the whole opening, already over.
 *
 * WHAT A RESTART DOES, and the first reason it exists. A breakdown puts the
 * player back at the top of the SAME road, which is the right call for the road
 * and the wrong one for the approach to it: the car sliding into frame and the
 * two lines over it are an OPENING, and an opening replayed after every failure
 * is fourteen seconds of penalty on top of the penalty. So a restart begins
 * where the scoring does.
 *
 * AND THE SECOND IS EVERY HEADLESS CALLER. A test, a bench, a soak and the
 * effects gallery all want the ROAD — the crowd, the traffic, the collisions —
 * and none of them wants the three and a half seconds of scripted arrival in
 * front of it, during which the pedals are not connected to anything and the
 * spawners have laid nothing down. Exported rather than reproduced at each of
 * those call sites, because "how do you get past the opening" is exactly the
 * kind of thing four suites would answer four slightly different ways.
 *
 * It moves the car rather than the marks, because `distance` is derived from the
 * car's own travel — so putting the wagon a gate's worth down the road is
 * enough, and every spawner, every latch and the clock all agree about where it
 * is without being told twice.
 */
export function skipDriveOpening(drive: DriveState): void {
  const dir = drive.params.direction;
  drive.car.pos.x = drive.car.home.x + dir * cityStartPx(drive.params);
  drive.distance = cityStartPx(drive.params);
  drive.car.speed = DRIVE.opening.cruisePx;
  drive.entryPx = 0;
  drive.monologueDone = true;
  drive.cityDone = true;
  drive.nextPropSlot = firstPropSlot(drive.car.pos.x, dir);
}

/**
 * Start the leg again after a breakdown — the SAME road, because the seed is
 * the same. A restart that rolled a fresh road would make a crash pure bad luck;
 * this way the second attempt is the one where you already know what is coming
 * out of the third lane, which is the only version worth replaying.
 *
 * The monologue does NOT play again: he has already had that thought, and
 * hearing a man promise to be careful for the fourth time is a different and
 * much worse joke. Nor does the rest of the opening — the wagon's slide into
 * frame and the empty outskirts under it are an approach the player has already
 * watched, so a restart opens AT THE GATE (`openAtGate`) with the clock at zero
 * and the town in front of him.
 */
export function restartDrive(previous: DriveState): DriveState {
  const next = createDrive(previous.params);
  skipDriveOpening(next);
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
    // …AND AN ARRIVING ONE ROLLS IN RATHER THAN CARRYING ON AT A HUNDRED AND
    // TWENTY. The finish is not a wall: he lifts off and the car runs down the
    // site's own approach, which is what makes the last stretch read as pulling
    // into somewhere rather than as the road being switched off.
    //
    // AND IT NEVER ARRIVES AT A STANDSTILL (`rollFloorPx`). The brake below aims
    // at the site's mark so the FRAME settles on the frontage, and aims well
    // enough that a fast arrival would genuinely come to rest on it — which is
    // the one frame this beat cannot have, because the level on the far side of
    // the fade opens on a parked car and playing the parking here shows the same
    // arrival twice. So it works the speed down to a walking pace and then stops
    // working, and the picture goes out with the wagon still moving.
    if (drive.outcome === DRIVE_OUTCOME.arrived) {
      const { rollFloorPx } = DRIVE.arrival;
      if (Math.abs(car.speed) > rollFloorPx) {
        car.speed = Math.max(
          rollFloorPx,
          Math.abs(car.speed) - parkDecelPx(drive) * dt,
        );
      }
      arrivalBeats(drive);
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
  // ── THE WAGON ARRIVING ────────────────────────────────────────────────────
  // While the camera is still carried ahead of the car, nothing the player does
  // reaches it: the pedals are held at a cruise and the wheel is not connected.
  // Every control is IGNORED rather than merely unread, exactly as an
  // auto-driven road ignores a stray keypress — a thumb resting on the pad
  // during the opening must not steer a car that is being shown to somebody.
  //
  // …AND IT IS NOT ONLY THE CAMERA'S LEAD ANY MORE. The whole approach is a
  // COUNTDOWN (`DRIVE.opening.handsOff`): the speed is held from the first frame
  // to the gate, and the only thing handed back early is the WHEEL, a second out
  // (`driveSteerOnly`), so the last beat of the opening is spent picking the lane
  // to meet the town in. The pedal arrives with the clock and not a frame before
  // it, which is what makes the gate a starting flag rather than a line the
  // player crosses without noticing.
  if (drive.entryPx > 0 || driveHandsOff(drive)) {
    drive.entryPx = Math.max(0, drive.entryPx - DRIVE.opening.closePx * dt);
    car.speed = DRIVE.opening.entrySpeedPx;
    car.handbrake = false;
    // THE WHEEL, IF IT IS HIS YET — and nothing else, ever. `applyCarWheel` is
    // the same rack the town is steered on, handed the same authority, so the
    // second before the flag is genuinely the car being driven rather than a
    // preview of it.
    if (driveSteerOnly(drive)) {
      applyCarWheel(
        car,
        input.wheel,
        dt,
        DRIVE.lateralPx,
        DRIVE.laneRefSpeedPx,
        dir,
      );
      const opening = roadEdgesAt(dir * car.pos.x, drive.params);
      car.pos.y = clamp(car.pos.y, opening.top, opening.bottom);
    }
    advanceCar(drive, dt);
    spawnTraffic(drive);
    spawnProps(drive);
    stepTraffic(drive, dt);
    stepProps(drive, dt);
    integrateCarBody(car, dt);
    // THE OPENING'S OWN BEATS still land out here — his two lines and the town
    // arriving — because the approach is no longer a stretch the tick returns
    // early from before reaching them. Without this the gate is never latched on
    // a held road and the minigame simply never starts.
    openingBeats(drive, dtMs);
    return;
  }

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
  // …AND ON THE OUTSKIRTS IT IS THE OPENING'S, which is lower than either. He
  // is not in a hurry until he is in the town, nothing out here is worth
  // hurrying past, and the clock does not start for another few thousand pixels
  // — so a player who buries the pedal on the approach gains exactly nothing and
  // arrives at the gate at the speed the leg is designed to open at.
  const ceiling = drive.cityDone ? top : Math.min(top, DRIVE.opening.cruisePx);
  applyCarPedals(car, input, dt, ceiling, rungTop * 0.1, {
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
  // IT IS `applyCarWheel`, THE RUN'S OWN (engine/game/vehicles.ts), and that is
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
  // THE ROAD IS NOT THE SAME WIDTH ALL THE WAY DOWN IT. Out on the approach the
  // carriageway is the middle two lanes and the wagon is held inside them
  // (`roadEdgesAt`); it opens out to four over the last stretch before the first
  // house, and the clamp opens with it. Asked of the CAR's own position rather
  // than of `distance`, because the two part company the moment the wagon is
  // reversed or shunted backwards.
  const edges = roadEdgesAt(dir * car.pos.x, drive.params);
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
  // THE TRAFFIC AGAINST ITSELF FIRST, then the hero against whatever that left.
  // The order is the honest one: a car that has just been shunted into the lane
  // beside it is in that lane THIS tick, and the wagon arriving at it a frame
  // late is the whole reason a pile-up is worth having.
  collideTraffic(drive);
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
  openingBeats(drive, dtMs);
  if (drive.distance >= courseLength(drive.params)) {
    drive.outcome = DRIVE_OUTCOME.arrived;
    drive.outcomeMs = 0;
    // The street stopped being laid at the FAR GATE, an outskirt back
    // (`openingBeats`) — belt and braces here, because a demo course short
    // enough to put both gates in the same place can reach the finish on the
    // same tick it reaches the town's end.
    haltTraffic(drive);
    drive.events.push({ type: "arrived" });
  }
}

/**
 * THE CLOCK AND THE TWO BEATS ON THE WAY TO THE TOWN — his line, and the gate.
 *
 * ITS OWN FUNCTION BECAUSE IT IS RAISED FROM TWO PLACES, and only one of them
 * is the ordinary tick. The approach is HELD now (`handsOff`): the pedal is not
 * connected, so that stretch takes an early return out of `stepDrive` — and
 * every beat on it, up to and including the gate that ENDS the hold, lives here.
 * Left at the bottom of the tick they were unreachable from the one path that
 * needs them, and the minigame would never start.
 */
function openingBeats(drive: DriveState, dtMs: number): void {
  // THE CLOCK IS THE TOWN'S, and it is advanced here rather than derived from
  // `ms` for the reason a lap timer is its own instrument: the road's own clock
  // has been running since the first frame of an opening nobody drove, and it
  // goes on running through a run-out and an arrival nobody drives either.
  if (drive.cityDone && !drive.townEndDone) drive.clockMs += dtMs;

  if (!drive.monologueDone && drive.distance >= DRIVE.opening.sayAtPx) {
    drive.monologueDone = true;
    drive.events.push({ type: "monologue" });
  }
  // THE TOWN, ARRIVING — the one beat on this road that changes what the road
  // IS. Everything that makes the minigame a minigame starts at this mark: the
  // houses, the crowd, the traffic, the clock, and the player's own right foot.
  if (!drive.cityDone && drive.distance >= cityStartPx(drive.params)) {
    drive.cityDone = true;
    drive.events.push({ type: "cityGate" });
  }
  // …AND THE TOWN LEAVING AGAIN, which is the beat the SCORE is settled on. The
  // last house is behind him, the spawners stop serving a street that is no
  // longer being drawn, and the clock stops — a stretch of outskirt still to
  // drive, but none of it raced.
  //
  // THE STREET STOPS BEING LAID HERE rather than at the finish. Without it the
  // spawners go on putting a moped and a bus on a road with nothing on either
  // side of it, and the run-out — which is the opening the leg driven the other
  // way slides into frame over — comes with the town's traffic on it.
  if (
    drive.cityDone &&
    !drive.townEndDone &&
    drive.distance >= cityEndPx(drive.params)
  ) {
    drive.townEndDone = true;
    haltTraffic(drive);
    drive.events.push({ type: "cityEnd" });
  }
}

/**
 * HOW HARD THE WAGON IS SHEDDING SPEED ON THE RUN-IN (px/s²) — a man lifting
 * off and rolling into somewhere, and, when he has to, a man who can also see
 * the end of his own drive coming.
 *
 * `DRIVE.arrival.coastPx` IS THE FLOOR RATHER THAN THE WHOLE ANSWER, and that
 * is the point of this function. The car crosses the finish at whatever the
 * player left it at — a crawl, or a hundred and seventy — and a fixed
 * deceleration spreads where it ends up across eight hundred px of site. Which
 * puts the thing the hero TALKS about off the side of the screen about half the
 * time: HOME AT LAST said beside a stretch of fence, THERE'S GOODCO with the
 * halls already behind him. So a fast arrival brakes harder, aiming the picture
 * at the site's own mark (`SiteLayout.parkPx`).
 *
 * IT AIMS THE FRAME; IT DOES NOT PARK THE CAR. The caller floors the speed at a
 * crawl (`DRIVE.arrival.rollFloorPx`), so the wagon is still moving when the
 * fade takes it — the parking belongs to the level on the far side of the black,
 * which opens on it.
 *
 * A SLOW ARRIVAL STILL COMES UP SHORT, on purpose and unavoidably: there is no
 * accelerating on a run-in, and a man who crawled over the line has earned a
 * longer approach. Which is why the frontage either side of the mark still has
 * to be worth looking at.
 */
function parkDecelPx(drive: DriveState): number {
  const { coastPx, brakeMax } = DRIVE.arrival;
  const past = drive.distance - courseLength(drive.params);
  const remaining = driveSite(drive.params.to).parkPx - past;
  // At or past the mark there is nothing left to aim at: shed what is left.
  if (remaining <= 1) return coastPx;
  const speed = Math.abs(drive.car.speed);
  // What it would take to stop exactly on the mark from here.
  const need = (speed * speed) / (2 * remaining);
  // STILL A LONG WAY OFF — so he is not braking yet, he is rolling. This is the
  // half that fixes a SLOW arrival: a plain coast brought a car that crawled
  // over the line to a stop a couple of hundred px in, which is nowhere near
  // the frontage the run-in is about. A man rolling up his own drive keeps
  // rolling until he needs the brake.
  if (need < coastPx) return 0;
  return Math.min(need, coastPx * brakeMax);
}

/**
 * THE RUN-IN'S OWN BEATS — the sight of the place, the door opening, the
 * question, and the picture going out.
 *
 * ON THE CLOCK RATHER THAN ON A DISTANCE, which is the opposite of every other
 * beat on this road and is right for exactly one reason: the car is coasting to
 * a stop out here, so a mark measured in world px is a mark a slow enough
 * arrival never reaches. A leg that ended at 30 mph would sit in front of
 * GOODCO in silence while the board waited on a line it was never going to get.
 */
function arrivalBeats(drive: DriveState): void {
  const { arrival } = DRIVE;
  if (!drive.sightDone && drive.outcomeMs >= arrival.sightMs) {
    drive.sightDone = true;
    drive.events.push({ type: "sight" });
  }
  // …AND THEN THE FADE, WITH THE CAR STILL UNDER HIM. Nothing here stops the
  // wagon, opens its door or stands a man on the road: the arriving level opens
  // on a car already parked in a bay, so the road's last frame is a car still
  // rolling and the black is what hands the beat over.
  if (!drive.blackoutDone && drive.outcomeMs >= arrival.blackoutMs) {
    drive.blackoutDone = true;
    drive.events.push({ type: "blackout" });
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
