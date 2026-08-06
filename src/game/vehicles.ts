// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VEHICLES (config CAR / SHIP below) — the hero's car and his garage
// ship, simulated as small machines rather than drawn as props. See
// `Vehicle` (types/world.ts) for what they are; this module owns the numbers
// and the physics:
//
//   - the car's WHEELS roll from `speed` (angle = distance / wheel radius),
//     so the renderer picks a spin frame instead of animating on a timer —
//     a car pushed twice as fast spins twice as fast, for free;
//   - the car's FRONT WHEELS also STEER: `steer` is the rack's own angle,
//     wound on at a finite rate and stopped at a road car's lock, and the
//     nose comes round in proportion to it and to the roll. The nose stops
//     at the beam (`maxYaw`) because the body is one side-profile assembly
//     that nothing mirrors — the car steers up and down the screen and backs
//     up, but it never comes about;
//   - the car's SUSPENSION is two damped springs, one per axle, integrated
//     every tick. Parked they settle to rest; `nudgeCar` gives an axle a
//     shove (the minigame's potholes) and the body bobs the way a
//     thirty-year-old wagon should;
//   - the ship's ENGINE answers `thrust` — engine state, not an animation
//     flag, so the flying minigame throttles the same field the launch
//     will read.
//
// The MINIGAMES plug in here rather than beside it: throttle writes
// `speed`/`thrust`, crashes write `wear` and `nudgeCar`, climbing in writes
// `driver`. Nothing in this module reads the rng — a vehicle is
// deterministic clockwork, so it can never shift a loot roll however hard
// it is driven.
//
// A vehicle exists where the CARVE says one stands: `createVehicles` reads
// the level's landmarks (`car` → the car, `rocket` → the ship), keeps the
// landmark as the travel door's tap anchor, and the renderer draws the
// assembly in the landmark's place (pwa/src/game/render/vehicles.ts).
//
// …and the ground a machine BLOCKS is the ground its picture stands on, which
// is not the ground its nose points at: `alongBody` below is the one place
// that conversion happens, and `vehicleFootprint` is the rule.

import { clamp, type Vec2 } from "@game/lib/vec.ts";

import { MERCHANT, PLAYER } from "./config/index.ts";
import { runLevelDef } from "./defs/levels/index.ts";
import type { LevelDef } from "./defs/levels/types.ts";
import { billboardBearing } from "./flags.ts";
import { killMerchant } from "./merchant.ts";
import { resolveObstacles } from "./obstacles.ts";
import { openDoor } from "./story.ts";
import { anyZoneContains, zonesBounds, type Zone } from "./zones.ts";
import {
  CAR_FIX,
  type CarDetachable,
  type CarVehicle,
  type DepartureState,
  type GameInput,
  type GameState,
  type Player,
  type ShipVehicle,
  type Vehicle,
  type WheelDebris,
} from "./types/index.ts";

export const CAR = {
  /** The panels the body is assembled from, rear to front — every panel
   * sprite shares one 48x26 canvas, so the renderer stacks them at a single
   * base anchor and any one can be swapped for a bashed variant alone. */
  panels: [
    "backside",
    "doors",
    "hood",
    "front_side",
    "bumper",
    "roof",
    "glass",
  ] as const,
  /** Wheel centers, px ALONG THE DRAWN BODY from its center: [rear, front]
   * (the art pins them at columns 10 and 36 of the 48-wide canvas). Columns of
   * the assembly, never a step across the floor — see `alongBody`. */
  wheelOffsets: [-14, 12],
  /** Wheel radius (world px) — converts speed into roll. */
  wheelRadius: 5,
  /** Spring rate (1/s²) and damping (1/s): under-damped on purpose, so a
   * nudge reads as a bob-and-settle rather than a dead thunk. */
  springK: 90,
  springDamping: 7,
  /** The axle's travel limit (px) — a spring never buries the body. */
  maxCompress: 3,
  /** The blockers under the body (create.ts): columns of the DRAWN body — the
   * wheel arches and the middle between them — and the radius each covers.
   * Laid along the picture rather than along the nose: `vehicleFootprint`. */
  footprint: { offsets: [-14, 0, 12], radius: 9 },
  /** The parts that can work free of the body (the fix ladder). */
  detachables: ["doors", "hood", "bumper", "roof"] as const,
  /** The dangle oscillator: a hinge is floppier than an axle spring, so it
   * swings slower and rings longer than the suspension does. */
  dangleK: 30,
  dangleDamping: 2.5,
  /** How hard the suspension's motion shakes the hung parts (unitless). */
  dangleDrive: 0.8,
  /** A LOOSE part only RATTLES — its swing is pinched to about a pixel;
   * a DANGLING one gets the full arc. */
  looseSwing: 1,
  dangleSwing: 3,
  /** Where each shed part lands relative to the body center — deterministic
   * (a crash sheds the same wreck every replay; no rng, ever). */
  shedAt: {
    doors: { x: 6, y: 14 },
    hood: { x: 20, y: 12 },
    bumper: { x: 26, y: 8 },
    roof: { x: -8, y: 16 },
  } as Record<CarDetachable, Vec2>,
  /** How close a hero must stand to climb in (`enterCar`). */
  boardRadius: 44,
  /** The drive's numbers: top speed (px/s), throttle ramp and brake/coast
   * (px/s²). Deliberately gentle — this is pulling out of the garage, not
   * the driving minigame (a later phase owns that). */
  driveSpeed: 130,
  driveAccel: 260,
  driveBrake: 200,
  /** Reverse tops out slower — nobody backs out of a garage at road speed. */
  reverseSpeed: 70,
  /** The wheel: how fast the nose swings at full authority (rad/s), and the
   * ground speed (px/s) at which steering GAINS that full authority — a car
   * only turns as far as it rolls, so a standing car's wheel does nothing
   * and a creeping one comes around slowly. */
  turnRate: 3,
  turnRefSpeed: 40,
  /** THE LOCK — how far the front wheels may ever be cranked off the body's
   * centreline (rad). A road car's rack stops at about a third of a right
   * angle and so does this one, so a target further round than the lock is
   * not a sharper turn: it is the same turn, held longer. */
  steerLock: Math.PI * 0.19,
  /** How fast the rack moves (rad/s) — straight to full lock in about a
   * fifth of a second, and the rate it walks back to centre at when the wheel
   * is let go. Finite on purpose: the crank is the thing the renderer draws,
   * and a wheel that snapped between angles would strobe rather than steer. */
  steerRate: 3,
  /**
   * THE YAW STOP — how far off its own facing axis the nose may ever come
   * (rad), measured from the side the car was parked on.
   *
   * The body is drawn from ONE side-profile assembly and is never mirrored,
   * so a car free to come about drove away still facing the way it came —
   * the sprite cannot turn around, so the car may not either. Just short of
   * square: the nose swings all the way up and down the screen, which is the
   * whole of steering left and right in a side view, and stops before the
   * beam where a side-on car has no profile left to show at all. Getting back
   * the other way is what REVERSE is for.
   */
  maxYaw: Math.PI * 0.48,
  /**
   * THE HANDBRAKE-OFF DRAG — what a car with NOTHING held sheds per second
   * (px/s²), and it is deliberately almost nothing.
   *
   * A released wheel does not stop the car. Letting go means "carry on as you
   * are": the car holds its speed and straightens up, exactly like taking your
   * hands off at a cruise. Braking is a thing you ASK for (the pedal the other
   * way), not something that happens to you the moment you stop asking for
   * throttle — which is what makes a minute of road playable with one thumb,
   * and what makes the garage and the road the same car to drive.
   */
  idleDragPx: 6,
  /** How far out of the driver's door a hero steps when he gets out
   * (`exitCar`, world px, abeam the nose) — clear of the body he was just
   * inside, so the shove-out has nothing left to do in the common case. */
  stepOut: 16,
  /** Driving this far from `home` books the departure (`carDeparted`) on a
   * map with neither a ROAD OUT (`LevelDef.driveOut`) nor a garage door; with
   * a door and no road, the departure is the door's own threshold instead
   * (`departRadius` of its center, once open). A road wins over both. */
  departDistance: 150,
  departRadius: 30,
  /** How far out a DRIVEN car trips the garage door — like a real opener,
   * well before the walking hero's own trigger (DOORS.openRadius), so the
   * roll-up has finished by the time the bumper reaches the threshold. */
  doorReach: 130,
  /** The running engine's rumble cadence (ms between `carEngine` grains —
   * the app's putter is a touch longer, so grains overlap seamlessly). */
  engineCueMs: 210,
  /** A bare axle's spark cadence (ms between `carGrind` bursts under way),
   * and the speed below which dragging steel stops sparking. */
  grindCueMs: 90,
  grindMinSpeed: 8,
  /**
   * The speed above which the bumper KILLS the man it hits
   * (`runDownMerchant`). A car creeping out of its own bay is a car being
   * parked — somebody standing in front of it gets leaned on, not run over —
   * so the threshold sits well above the crawl and well under the pace of a
   * car that has committed to the road.
   */
  roadkillSpeed: 45,
} as const;

/**
 * THE DRIVE-OUT — the departure beat between a driven car reaching the level's
 * road out and the next level being built (see `GameState.departure`).
 *
 * It exists because a cut is not a departure. The trip used to book the instant
 * the bumper crossed the garage door, and the frame after it the hero was
 * somewhere else entirely — the car never went anywhere, it was merely switched
 * off in its own driveway. So the road is where the level lets go, and letting
 * go takes a moment: the wheel comes out of the player's hands, the car drives
 * on down the tarmac, and the picture washes to black over it. The app paints
 * the wash off `ms`; everything else here is simulation.
 */
export const DEPARTURE = {
  /** How long the whole beat runs before the trip is booked (ms). Long enough
   * that the car visibly gets down the road and short enough that a player who
   * has driven this door fifty times is not made to sit through a cutscene. */
  durationMs: 1700,
  /** The fraction of the beat the wash takes to reach full black. Short of 1
   * on purpose: the picture is GONE before the run is torn down, so the swap
   * happens behind black rather than under a fade that is still lifting. */
  fadeAt: 0.8,
  /** How far beyond the end of the road the car is aimed (world px) — a target
   * off the map, so the car drives at it flat out instead of easing onto a
   * point it is about to reach. */
  overshoot: 260,
  /**
   * The most the departing car's steer point may sit off its own nose (rad).
   *
   * KEEPS THE THROTTLE DOWN WHILE THE NOSE COMES ROUND, and that is the whole
   * reason this knob exists. The pedal is the push read ALONG the nose
   * (`carControl`), so a target square off the bumper is all wheel and no
   * throttle — and a car joins a road across it, so the road's far end IS a
   * right angle off the bumper. Aimed straight at it the departing car slowed
   * itself to a halt, and a stopped car cannot turn at all, so it sat on the
   * tarmac with its indicator on until the screen went black. Aiming at a lead
   * point held near the nose keeps most of the push on the accelerator, and the
   * nose comes round on an arc — which is how a car turns onto a road anyway.
   */
  steerArc: Math.PI * 0.3,
  /** How far ahead of the bumper that lead point is thrown (world px). */
  lead: 300,
} as const;

/** The shed wheel's highway physics: gravity, the bounce's keep-fraction,
 * how much ground speed each floor hit scrubs, and rolling drag. */
export const WHEEL_DEBRIS = {
  gravity: 500,
  /** Vertical restitution — each bounce keeps half the fall. */
  bounce: 0.5,
  /** Ground-speed fraction kept through a floor hit. */
  gripLoss: 0.85,
  /** Rolling drag (1/s) while on the floor. */
  rollDrag: 0.9,
  /** Below these, the wheel settles for good. */
  restSpeed: 4,
  restHeight: 0.5,
} as const;

export const SHIP = {
  /** One blocker under the hull — a rocket stands on its own pad. */
  footprint: { offsets: [0], radius: 10 },
} as const;

/** The landmark kinds that stand for a vehicle, and what each mints. */
const VEHICLE_LANDMARKS: Record<string, Vehicle["kind"]> = {
  car: "car",
  rocket: "ship",
};

/** Mint a car, parked and cold, facing `heading`. Exported for the DRIVING
 * MINIGAME, which needs the same wagon on a road with no carve under it
 * (src/game/drive/index.ts) — every other caller gets one from
 * `createVehicles` below. */
export function createCar(pos: Vec2, heading: number): CarVehicle {
  // The facing axis is settled HERE and never again: the art has one profile,
  // so the yaw stop holds the nose on whichever side the car was parked
  // facing (see `CAR.maxYaw` / `steerCar`), and a parking bearing already
  // past the stop is brought back onto it rather than driven off it.
  const faceLeft = Math.cos(heading) < 0;
  return {
    kind: "car",
    pos: { x: pos.x, y: pos.y },
    home: { x: pos.x, y: pos.y },
    heading: clampYaw(heading, faceLeft),
    departed: false,
    engineCueMs: 0,
    grindCueMs: 0,
    faceLeft,
    speed: 0,
    wheelAngle: 0,
    steer: 0,
    suspension: [0, 0],
    suspensionVel: [0, 0],
    wear: 0,
    driver: null,
    // Factory straight, all round: the minigame's crashes move these.
    panels: {
      backside: 0,
      doors: 0,
      roof: 0,
      hood: 0,
      front_side: 0,
      bumper: 0,
      glass: 0,
    },
    wheelStates: [0, 0],
    // Everything bolted down tight; the fix ladder climbs from here.
    fixes: { doors: 0, hood: 0, bumper: 0, roof: 0 },
    dangle: { doors: 0, hood: 0, bumper: 0, roof: 0 },
    dangleVel: { doors: 0, hood: 0, bumper: 0, roof: 0 },
  };
}

function createShip(pos: Vec2): ShipVehicle {
  return {
    kind: "ship",
    pos: { x: pos.x, y: pos.y },
    faceLeft: false,
    speed: 0,
    thrust: 0,
    wear: 0,
    driver: null,
  };
}

/** Mint the level's vehicles from its carved landmarks — parked, cold,
 * nobody driving. Empty on every map that pins none (all but the garage).
 * The car parks NOSE TOWARD the garage door when the level hangs one, so
 * the first W the player ever presses drives at the way out. */
export function createVehicles(
  def: Pick<LevelDef, "landmarks" | "doors">,
): Vehicle[] {
  const vehicles: Vehicle[] = [];
  const garage = (def.doors ?? []).find((d) => d.opens === "approach");
  for (const mark of def.landmarks) {
    const kind = VEHICLE_LANDMARKS[mark.kind];
    if (kind === "car") {
      const heading = garage
        ? Math.atan2(
            (garage.from.y + garage.to.y) / 2 - mark.pos.y,
            (garage.from.x + garage.to.x) / 2 - mark.pos.x,
          )
        : 0;
      vehicles.push(createCar(mark.pos, heading));
    } else if (kind === "ship") vehicles.push(createShip(mark.pos));
  }
  return vehicles;
}

/**
 * A COLUMN OF THE DRAWN MACHINE, as a point on the floor.
 *
 * `along` is px along the assembly's own picture from its centre — a wheel
 * arch, a lamp, a body blocker — and the picture lies across the ground on the
 * bearing the camera decides (`billboardBearing`, flags.ts). At the shipped
 * square-on camera that bearing is +x and this is the plain `pos.x + along`
 * these sums all used to be.
 */
export function alongBody(pos: Vec2, along: number): Vec2 {
  const bearing = billboardBearing();
  return {
    x: pos.x + Math.cos(bearing) * along,
    y: pos.y + Math.sin(bearing) * along,
  };
}

/**
 * The blockers a vehicle parks on `state.obstacles` (kind "vehicle" — the
 * obstacle pass skips them; the assembly is drawn by the vehicle renderer).
 *
 * THEY LIE UNDER THE MACHINE AS DRAWN, WHICH IS NOT ALONG ITS NOSE. The car is
 * one side-profile assembly hung off a single anchor and drawn dead straight-on
 * (pwa/src/game/render/vehicles.ts): 48 px of body across the screen, whatever
 * the heading says the nose is doing. So the ground it visibly covers is the
 * strip along `billboardBearing()`, and `CAR.footprint.offsets` are columns of
 * that picture — the same numbers as the wheel arches, because the projection
 * carries a step along that bearing to the same number of screen px.
 *
 * Walked down the HEADING instead — which is how these started life — the chain
 * turned under a car whose picture never turns, and it did so in two ways that
 * read identically from inside the game: a nose swung up the screen laid the
 * blockers at a right angle to the drawn body, and once the camera took a yaw
 * even a PARKED car's chain stood off its own picture at the yaw's own angle. In
 * both the hero walks through the drawn bonnet and is stopped by open floor half
 * a car away, and hops onto a roof that is not there.
 */
export function vehicleFootprint(
  vehicle: Vehicle,
): { pos: Vec2; radius: number }[] {
  const print = vehicle.kind === "car" ? CAR.footprint : SHIP.footprint;
  return print.offsets.map((along) => ({
    pos: alongBody(vehicle.pos, along),
    radius: print.radius,
  }));
}

/**
 * Park a vehicle's blockers back on the field — the same circles `create.ts`
 * lays under a machine when the level is built, minted fresh at wherever it
 * now stands. Used when a driver gets out (`exitCar`): a car left in the
 * middle of the drive is furniture again, exactly as the one that was never
 * driven is.
 *
 * The obstacle array is REPLACED rather than pushed into, because the spatial
 * index caches on the array's identity (see obstacles.ts) — a mutation in
 * place would leave every query reading a grid that has never heard of these.
 * The caller owns the `obstaclesVersion` bump.
 */
function parkVehicle(state: GameState, vehicle: Vehicle): void {
  state.obstacles = state.obstacles.concat(
    vehicleFootprint(vehicle).map((print) => ({
      id: state.nextId++,
      kind: "vehicle",
      sprite: "",
      pos: print.pos,
      radius: print.radius,
      jumpable: vehicle.kind === "car",
    })),
  );
}

/** Shove a car's axle (rear, front — px/s downward). The springs answer,
 * and every loose or dangling part gets shaken by the same hit. */
export function nudgeCar(car: CarVehicle, rear: number, front: number): void {
  car.suspensionVel[0] += rear;
  car.suspensionVel[1] += front;
  const kick = (Math.abs(rear) + Math.abs(front)) * CAR.dangleDrive;
  for (const part of CAR.detachables) {
    if (
      car.fixes[part] === CAR_FIX.loose ||
      car.fixes[part] === CAR_FIX.dangling
    ) {
      car.dangleVel[part] += kick;
    }
  }
}

/**
 * Tear a detachable part clean off: its fix jumps to GONE (the bay sprite
 * draws in its place) and the piece itself lands beside the car as decor —
 * `car_shed_<part>` on the floor plane, at the part's own deterministic
 * spot. Idempotent: a part already gone sheds nothing twice.
 */
export function shedPart(
  state: GameState,
  car: CarVehicle,
  part: CarDetachable,
): void {
  if (car.fixes[part] === CAR_FIX.gone) return;
  car.fixes[part] = CAR_FIX.gone;
  car.dangle[part] = 0;
  car.dangleVel[part] = 0;
  const at = CAR.shedAt[part];
  const flip = car.faceLeft ? -1 : 1;
  state.decor.push({
    kind: `car_shed_${part}`,
    sprite: `car_shed_${part === "doors" ? "door" : part}`,
    pos: { x: car.pos.x + at.x * flip, y: car.pos.y + at.y },
  });
}

/**
 * Tear a wheel off its axle — like dropping a wheel on a highway: the axle
 * drops to the bump stop (wheelState 3, nothing to draw there any more) and
 * the wheel itself becomes bouncing debris, launched with the crash's own
 * kick (`vel`, px/s on the ground plane — the caller knows the impact; no
 * rng here). It bounces, sheds speed on every floor hit, rolls out and
 * settles wherever the physics says it stops.
 */
export function detachWheel(
  state: GameState,
  car: CarVehicle,
  axle: 0 | 1,
  vel: Vec2,
): void {
  const state0 = car.wheelStates[axle] as number;
  if (state0 === 3) return;
  car.wheelStates[axle] = 3;
  // The corner slams onto the bump stop and the body jolts — and bare
  // steel meeting the road throws its first, hardest shower of sparks.
  car.suspension[axle] = CAR.maxCompress;
  car.suspensionVel[axle] = 0;
  state.events.push({
    type: "carGrind",
    pos: alongBody(car.pos, CAR.wheelOffsets[axle] ?? 0),
    intensity: 1,
  });
  const kick = Math.hypot(vel.x, vel.y);
  state.wheelDebris.push({
    // The wheel becomes a body of its own here and keeps a world anchor from
    // now on — but it LEAVES from its arch, which is a column of the picture.
    pos: alongBody(car.pos, CAR.wheelOffsets[axle] ?? 0),
    vel: { x: vel.x, y: vel.y },
    z: CAR.wheelRadius,
    // A harder hit throws the wheel higher — the pop off the hub.
    vz: Math.min(120, 40 + kick * 0.4),
    angle: car.wheelAngle,
    wheelState: state0,
    settled: false,
  });
}

/**
 * Climb into the car and turn the key — the tap-the-car verb (`enterCar`).
 *
 * The acting hero must be standing AT the car (`boardRadius` — the server
 * revalidates what the app's tap already checked) and the seat must be
 * empty. Boarding starts the engine on the spot: the `carStarted` event
 * carries the cough-and-catch to the app, and everything that shows the
 * engine running — the lights, the body shiver, the idle rumble — keys off
 * `driver` being set rather than off any second flag.
 *
 * The car's own footprint blockers come OFF the field when it becomes a
 * moving thing (they were parked-furniture; a driving car that pushed its
 * own wall ahead of itself could never move), and `obstaclesVersion` bumps
 * so the autopilot's nav grid hears about the opened floor.
 */
export function enterCar(state: GameState, hero: Player): boolean {
  for (const vehicle of state.vehicles) {
    if (vehicle.kind !== "car" || vehicle.driver !== null) continue;
    const d = Math.hypot(
      hero.pos.x - vehicle.pos.x,
      hero.pos.y - vehicle.pos.y,
    );
    if (d > CAR.boardRadius) continue;
    vehicle.driver = state.players.indexOf(hero);
    const before = state.obstacles.length;
    state.obstacles = state.obstacles.filter(
      (o) =>
        o.kind !== "vehicle" ||
        Math.hypot(o.pos.x - vehicle.pos.x, o.pos.y - vehicle.pos.y) >
          CAR.footprint.radius + 20,
    );
    if (state.obstacles.length !== before) state.obstaclesVersion++;
    state.events.push({
      type: "carStarted",
      pos: { x: vehicle.pos.x, y: vehicle.pos.y },
    });
    return true;
  }
  return false;
}

/**
 * Switch the engine off and get out — the tap-the-car verb again, read the
 * other way round (`exitCar`).
 *
 * A car you can climb into and not climb out of is a trap: the only way out of
 * the driver's seat used to be to drive the whole way to the road and commit
 * the trip, so a player who boarded to see what it did was stuck in the hub's
 * one vehicle until he left the level in it. Tapping the car he is sitting in
 * is the same gesture that put him there, so it is the one that takes him out.
 *
 * Whoever is at the wheel is the ACTING hero, never a seat named by the caller.
 * The car becomes furniture again where it now stands (`parkVehicle` — the
 * mirror of the blockers `enterCar` lifted, and `obstaclesVersion` bumps so the
 * autopilot's nav grid hears about the wall that just appeared), and the hero
 * steps out abeam the nose and is shoved clear of anything he would be standing
 * in — the car he just left included.
 */
export function exitCar(state: GameState, hero: Player): boolean {
  const seat = state.players.indexOf(hero);
  if (seat < 0) return false;
  const car = state.vehicles.find(
    (v): v is CarVehicle => v.kind === "car" && v.driver === seat,
  );
  if (!car) return false;
  car.driver = null;
  // The key comes out: no speed, and both cue clocks re-armed so the next
  // start coughs from the top rather than a grain into an idle it left.
  car.speed = 0;
  car.engineCueMs = 0;
  car.grindCueMs = 0;
  parkVehicle(state, car);
  state.obstaclesVersion++;
  const side = car.heading - Math.PI / 2;
  hero.pos.x = clamp(
    car.pos.x + Math.cos(side) * CAR.stepOut,
    PLAYER.radius,
    state.level.width - PLAYER.radius,
  );
  hero.pos.y = clamp(
    car.pos.y + Math.sin(side) * CAR.stepOut,
    PLAYER.radius,
    state.level.height - PLAYER.radius,
  );
  resolveObstacles(state, hero.pos, PLAYER.radius);
  state.events.push({
    type: "carStopped",
    pos: { x: car.pos.x, y: car.pos.y },
  });
  return true;
}

/**
 * ONE CAR'S OWN CLOCKWORK — the roll, the springs and the hung parts, with no
 * world around it at all.
 *
 * Split out of `stepVehicles` because the DRIVING MINIGAME needs exactly this
 * and nothing else it does. On the road there is no level: no obstacle chain to
 * shove the body out of, no garage door to trip, no departure to book, no seat
 * to pin a driver into — but the wagon still has to bob over what it hits, spin
 * its wheels from its own speed, and rattle a bumper that is working free, or it
 * stops reading as the same car that pulled out of the bay. So the body's
 * physics lives here, taking a car and a timestep, and BOTH callers run it:
 * `stepVehicles` for a parked or pottering car inside a run
 * (src/game/vehicles.ts) and `stepDrive` for the same car at 120 mph
 * (src/game/drive/index.ts).
 *
 * Semi-implicit Euler throughout — stable at the fixed step — and every clamp
 * kills the velocity with it, so nothing rings against its own limits.
 */
export function integrateCarBody(car: CarVehicle, dt: number): void {
  if (car.speed !== 0) {
    const tau = Math.PI * 2;
    car.wheelAngle =
      (((car.wheelAngle + (car.speed / CAR.wheelRadius) * dt) % tau) + tau) %
      tau;
  }
  let shake = 0;
  for (let axle = 0; axle < 2; axle++) {
    // An axle whose wheel is gone sits on the bump stop; nothing to spring.
    if (car.wheelStates[axle] === 3) {
      car.suspension[axle] = CAR.maxCompress;
      car.suspensionVel[axle] = 0;
      continue;
    }
    const s = car.suspension[axle] as number;
    const v = car.suspensionVel[axle] as number;
    const accel = -CAR.springK * s - CAR.springDamping * v;
    let vel = v + accel * dt;
    let pos = s + vel * dt;
    if (pos < 0) {
      pos = 0;
      vel = Math.max(0, vel);
    } else if (pos > CAR.maxCompress) {
      pos = CAR.maxCompress;
      vel = Math.min(0, vel);
    }
    // Snap the tail of the wobble to dead rest, so a parked car's
    // snapshot deltas go quiet instead of carrying micro-motion forever.
    if (Math.abs(pos) < 0.01 && Math.abs(vel) < 0.01) {
      pos = 0;
      vel = 0;
    }
    car.suspension[axle] = pos;
    car.suspensionVel[axle] = vel;
    shake += Math.abs(vel);
  }
  // The hung parts ride the same bumps: a spring under load shakes every
  // loose or dangling part; LOOSE stays pinched to a rattle, DANGLING
  // gets the whole arc. Bolted (or gone) parts never move.
  for (const part of CAR.detachables) {
    const fix = car.fixes[part];
    if (fix !== CAR_FIX.loose && fix !== CAR_FIX.dangling) {
      continue;
    }
    const swing = fix === CAR_FIX.loose ? CAR.looseSwing : CAR.dangleSwing;
    const s = car.dangle[part] as number;
    const v = (car.dangleVel[part] as number) + shake * CAR.dangleDrive;
    const accel = -CAR.dangleK * s - CAR.dangleDamping * v;
    let vel = v + accel * dt;
    let pos = s + vel * dt;
    if (pos > swing) {
      pos = swing;
      vel = Math.min(0, vel);
    } else if (pos < -swing) {
      pos = -swing;
      vel = Math.max(0, vel);
    }
    if (Math.abs(pos) < 0.01 && Math.abs(vel) < 0.01) {
      pos = 0;
      vel = 0;
    }
    car.dangle[part] = pos;
    car.dangleVel[part] = vel;
  }
}

/**
 * One tick of vehicle clockwork: roll the car's wheels from its speed,
 * settle its springs, swing whatever hangs off it, and bounce any wheel
 * that came off (all semi-implicit Euler — stable at the fixed step, and
 * every clamp kills the velocity so nothing rings against its limits).
 * The ship needs no integration parked: `thrust` is state the renderer
 * reads, and the flying minigame will drive it directly.
 */
export function stepVehicles(
  state: GameState,
  dtMs: number,
  inputs?: (seat: number) => GameInput,
): void {
  const dt = dtMs / 1000;
  stepDeparture(state, dtMs);
  // THE DRIVE-OUT TAKES THE WHEEL. While the departure beat runs the car steers
  // itself down the road, whatever the player's thumb is doing — fed in as a
  // synthetic input rather than as a second movement path, so the car that
  // drives away is the same car, with the same arcs, grip and body.
  const scene = state.departure;
  for (const vehicle of state.vehicles) {
    if (vehicle.kind !== "car") continue;
    driveCar(
      state,
      vehicle,
      dt,
      scene
        ? departureControl(vehicle, scene)
        : inputs && vehicle.driver !== null
          ? carControl(vehicle, inputs(vehicle.driver))
          : null,
    );
    // The running engine's rumble cadence: one grain every `engineCueMs`
    // while somebody is at the wheel, its intensity the throttle's answer —
    // idle putters, flat out roars. Same overlapping-grain trick as the
    // stampede's approach rumble.
    if (vehicle.driver !== null) {
      vehicle.engineCueMs -= dtMs;
      if (vehicle.engineCueMs <= 0) {
        vehicle.engineCueMs += CAR.engineCueMs;
        state.events.push({
          type: "carEngine",
          pos: { x: vehicle.pos.x, y: vehicle.pos.y },
          intensity: Math.min(1, Math.abs(vehicle.speed) / CAR.driveSpeed),
        });
      }
    }
    // THE LAST STAND: a bare axle under way drags steel on the road, and
    // steel on the road SPARKS — one burst per cadence per missing wheel,
    // hotter the faster the wreck is still going.
    if (
      Math.abs(vehicle.speed) > CAR.grindMinSpeed &&
      vehicle.wheelStates.some((w) => w === 3)
    ) {
      vehicle.grindCueMs -= dtMs;
      if (vehicle.grindCueMs <= 0) {
        vehicle.grindCueMs += CAR.grindCueMs;
        const intensity = Math.min(1, Math.abs(vehicle.speed) / CAR.driveSpeed);
        vehicle.wheelStates.forEach((w, axle) => {
          if (w !== 3) return;
          state.events.push({
            type: "carGrind",
            pos: alongBody(vehicle.pos, CAR.wheelOffsets[axle] ?? 0),
            intensity,
          });
        });
      }
    } else {
      vehicle.grindCueMs = 0;
    }
    // …and what the bumper found on the way. Read here rather than inside
    // `driveCar` so it covers the DRIVE-OUT too, which is the whole reason it
    // exists: the departure beat aims the car straight down the road the hub's
    // dealer paces, and a man standing on that tarmac is standing in front of
    // a car nobody is steering any more.
    runDownMerchant(state, vehicle);
    integrateCarBody(vehicle, dt);
  }
  for (const wheel of state.wheelDebris) {
    if (wheel.settled) continue;
    stepWheelDebris(wheel, dt);
  }
}

/** Shortest signed angle from `from` to `to`, in (-π, π]. */
function angleDiff(to: number, from: number): number {
  const tau = Math.PI * 2;
  let d = (to - from) % tau;
  if (d > Math.PI) d -= tau;
  if (d <= -Math.PI) d += tau;
  return d;
}

/** A bearing held inside the yaw stop, on the side the body faces
 * (`CAR.maxYaw`) — and normalized around that axis while it is there, so a
 * heading never accumulates turns it is not allowed to have made. */
function clampYaw(heading: number, faceLeft: boolean): number {
  const axis = faceLeft ? Math.PI : 0;
  return axis + clamp(angleDiff(heading, axis), -CAR.maxYaw, CAR.maxYaw);
}

/**
 * THE RACK AND THE YAW STOP — one tick of the front wheels, and what the nose
 * does about them.
 *
 * `wantSteer` is what the DRIVER is asking for: the bearing error, cranked no
 * further than the lock. `car.steer` is where the wheels actually are, walked
 * toward it at `CAR.steerRate` rather than snapped, so they visibly wind on
 * and unwind — and walk back to centre the moment the wheel is let go, the
 * way a real rack self-centres. That angle is the one the renderer warps the
 * front wheel sprite by, which is why it is simulated state rather than
 * something the app infers from the turn: a car standing still with its wheels
 * cranked is a picture the driver expects to see.
 *
 * The NOSE then comes round in proportion to the crank AND the roll — full
 * lock at a crawl turns almost nothing (`turnRefSpeed`, the same authority the
 * heading always had, now read through the rack), and REVERSE turns it the
 * other way for the same crank, because backing up with the wheel cranked left
 * swings the tail left.
 *
 * …and it stops at the beam (`CAR.maxYaw`). A driver asking for more than the
 * stop has left STRAIGHTENS UP rather than sitting on a lock he is getting
 * nothing for — a car pinned against its own limit with the wheels hard over
 * reads as a broken steering column.
 */
function steerCar(car: CarVehicle, wantSteer: number, dt: number): void {
  const roll = car.speed < 0 ? -1 : 1;
  const off = angleDiff(car.heading, car.faceLeft ? Math.PI : 0);
  const pushing = wantSteer * roll;
  if (
    (off >= CAR.maxYaw && pushing > 0) ||
    (off <= -CAR.maxYaw && pushing < 0)
  ) {
    wantSteer = 0;
  }
  const step = CAR.steerRate * dt;
  car.steer += clamp(wantSteer - car.steer, -step, step);
  const authority = Math.min(1, Math.abs(car.speed) / CAR.turnRefSpeed);
  const swing =
    CAR.turnRate * dt * authority * (car.steer / CAR.steerLock) * roll;
  car.heading = clampYaw(car.heading + swing, car.faceLeft);
}

/**
 * WHAT THE DRIVER IS ASKING FOR — one push, read as a PEDAL and a WHEEL in the
 * car's own frame. The single control model, shared by the garage and by the
 * driving minigame (src/game/drive/), so a car handles the same in both.
 *
 * THE MODEL IS THE ARCADE ONE, AND IT IS THE RIGHT ONE FOR THIS CAR, because
 * the car is drawn in SIDE PROFILE and can never come about (`CAR.maxYaw`). So
 * the screen has a permanent meaning: the way the nose points is FORWARD, the
 * other way is SLOW DOWN, and up and down the screen are the wheel.
 *
 *   ALONG THE NOSE      → throttle. Nose-right, that is a push right; nose-left
 *                         it is a push LEFT. "Drag the pad the way the car is
 *                         pointing" is the whole of the accelerator, and it is
 *                         the same gesture on both legs of the drive.
 *   AGAINST THE NOSE    → brake, and then reverse.
 *   ACROSS IT           → the wheel: up swings the nose up the screen, down
 *                         swings it down.
 *   NOTHING AT ALL      → carry on. The car HOLDS its speed and straightens up.
 *
 * That last line is the one that changed, and it is the important one. The car
 * used to coast to a standstill the instant nothing was held, which meant the
 * throttle had to be held down for the entire length of a drive just to stay
 * moving, and letting go to think was the same input as braking. Now letting go
 * means what it means in a car: you keep going. Stopping is something you ask
 * for. (`CAR.idleDragPx` is the whisper of drag left on top — a released car
 * loses about six px/s each second, so it eventually rolls to rest in a garage
 * over many seconds rather than never.)
 *
 * The push arrives as `GameInput.target`, which is read as a DIRECTION off the
 * car rather than as a destination to chase — the app simply points it where the
 * player is pushing (player-input.ts), and one composer serves the pad, the
 * stick and the pointer alike.
 *
 * …and the KEYBOARD is the one control that is NOT a push, which the app settles
 * before this ever sees it (`carKeyControl` / `carKeyTarget`,
 * pwa/src/game/car-keys.ts). D is the accelerator, A the brake, W and S the
 * wheel, whichever way the nose happens to be pointing: a key is a control on
 * the car, and a pedal that became the brake because the car came about is a
 * pedal nobody can drive with. The app hands the result back as a target laid
 * out along the nose, so what arrives here is the same push it always was.
 */
export type CarControl = {
  /** -1 (full brake / reverse) … +1 (full throttle), 0 = hold this speed. */
  pedal: number;
  /** -1 (nose swings up the screen) … +1 (down), 0 = straighten up. */
  wheel: number;
};

/** Read one tick's push as the pedal and the wheel. */
export function carControl(car: CarVehicle, input: GameInput): CarControl {
  if (!input.steering) return { pedal: 0, wheel: 0 };
  const dx = input.target.x - car.pos.x;
  const dy = input.target.y - car.pos.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1) return { pedal: 0, wheel: 0 };
  // The nose's SIDE, not its bearing: the body is one side-profile assembly
  // that never comes about, so which way it faces is a sign and nothing more.
  const nose = car.faceLeft ? -1 : 1;
  const throttle = input.throttle ?? 1;
  return {
    pedal: clamp((dx / len) * nose * throttle, -1, 1),
    wheel: clamp(dy / len, -1, 1),
  };
}

/**
 * Apply one tick of pedal and wheel to a car — the shared half of the physics,
 * so the garage's pottering car and the minigame's 120 mph one answer the
 * controls identically. The CALLER owns the top speed (`topSpeed`), because
 * that is the one thing the two genuinely disagree about: a wagon pulling out of
 * a bay is capped at a crawl and the same wagon on the open road is not.
 */
export function applyCarControl(
  car: CarVehicle,
  control: CarControl,
  dt: number,
  topSpeed: number,
  reverseSpeed: number,
): void {
  applyCarPedal(car, control.pedal, dt, topSpeed, reverseSpeed);
  // The wheel: the crank the driver is asking for, held at the lock. Reversing
  // works the rack the other way round, because backing up with the wheel over
  // swings the tail — `steerCar` owns that half.
  const roll = car.speed < 0 ? -1 : 1;
  steerCar(car, clamp(control.wheel, -1, 1) * CAR.steerLock * roll, dt);
}

/**
 * THE PEDAL ALONE — accelerate, brake, or hold, with nothing said about the
 * nose.
 *
 * Split out because the DRIVING MINIGAME wants exactly this half and not the
 * other: on a straight four-lane road the car changes lanes by SLIDING across
 * them rather than by turning, because the road (and the whole impact model
 * standing on it) is axis-aligned and the body is a side profile that never
 * comes about. It still visibly cranks the rack — the renderer draws `steer` —
 * it simply does not let the crank walk the heading off the road.
 */
export function applyCarPedal(
  car: CarVehicle,
  pedal: number,
  dt: number,
  topSpeed: number,
  reverseSpeed: number,
): void {
  if (pedal > 0) {
    car.speed = Math.min(topSpeed * pedal, car.speed + CAR.driveAccel * dt);
  } else if (pedal < 0) {
    // Brake first, then back up — a car does not go from forward to reverse
    // through anything but a stop.
    car.speed =
      car.speed > 0
        ? Math.max(0, car.speed - CAR.driveBrake * dt)
        : Math.max(reverseSpeed * pedal, car.speed - CAR.driveAccel * dt);
  } else {
    // NOTHING HELD: carry on. Only the whisper of drag.
    const drop = CAR.idleDragPx * dt;
    car.speed =
      car.speed > 0
        ? Math.max(0, car.speed - drop)
        : Math.min(0, car.speed + drop);
  }
}

/**
 * CAR PHYSICS inside a run — the controls above, plus everything that only
 * exists because there is a level around the car.
 *
 * The body collides: `resolveObstacles` shoves it out of walls and
 * furniture with its own radius, so the shut garage door really is shut.
 *
 * THE DEPARTURE: a driven car near a garage door (an `approach` DoorState)
 * rolls it open, but the door is no longer where the trip books. A map with a
 * ROAD OUT (`LevelDef.driveOut` — the strip of public tarmac the garage's
 * driveway runs onto) commits when the car reaches THAT, because a car sitting
 * on its own drive with the roll-up open behind it has not gone anywhere yet.
 * Reaching it opens the DRIVE-OUT beat (`stepDeparture`) rather than booking
 * the trip outright. A map with a door and no road keeps the threshold latch
 * (`departRadius` of an open door's center); one with neither keeps the oldest
 * latch of all (`departDistance` from home). Driving circles inside, or out
 * onto the lawn through nothing, still commits nothing.
 */
function driveCar(
  state: GameState,
  car: CarVehicle,
  dt: number,
  control: CarControl | null,
): void {
  if (car.driver === null || !control) return;
  applyCarControl(car, control, dt, CAR.driveSpeed, CAR.reverseSpeed);
  if (car.speed !== 0) {
    car.pos.x += Math.cos(car.heading) * car.speed * dt;
    car.pos.y += Math.sin(car.heading) * car.speed * dt;
    // The body is a body: walls, furniture and the lot's own boundary shove it
    // out, so the shut garage door (its obstacle chain) really stops the bumper.
    collideCarBody(state, car);
  }
  // `faceLeft` was settled at the parking spot and never moves again: the yaw
  // stop holds the nose on its own side of the beam, so the side-profile art
  // is never asked to answer for a car that came about. (It used to flip on
  // the nose's x-sign — which is exactly the lie, since NOTHING mirrors the
  // assembly: a car that turned round drove away still facing the way it came.)
  // The driver rides IN the car: his body lands exactly where the car
  // ends the tick (the party loop already pinned him before the move —
  // this is the post-move half, so nothing ever reads him a tick behind).
  const driver = state.players[car.driver];
  if (driver) {
    driver.pos.x = car.pos.x;
    driver.pos.y = car.pos.y;
  }
  // A driven car pulling up rolls the garage door open — same opener the
  // walking hero triggers in stepDoors, but from further out (`doorReach`,
  // a real opener's range), so the roll-up is done before the bumper is.
  for (const door of state.doors) {
    if (!door.approach || door.open) continue;
    const d = Math.hypot(car.pos.x - door.center.x, car.pos.y - door.center.y);
    if (d <= CAR.doorReach) openDoor(state, door);
  }
  if (!car.departed) {
    const def = runLevelDef(state);
    const road = def.driveOut;
    const garageDoors = state.doors.filter((d) => d.approach);
    // THREE LATCHES, STRONGEST FIRST. A ROAD is the real departure — the car
    // has left the property. Failing that, an open garage door's threshold.
    // Failing both, the old radial latch off the parking spot.
    const commits = road
      ? anyZoneContains(road, car.pos)
      : garageDoors.length > 0
        ? garageDoors.some(
            (d) =>
              d.open &&
              Math.hypot(car.pos.x - d.center.x, car.pos.y - d.center.y) <=
                CAR.departRadius,
          )
        : Math.hypot(car.pos.x - car.home.x, car.pos.y - car.home.y) >
          CAR.departDistance;
    if (commits) {
      // The car door's destination is the level's own to name — the door
      // whose id is the car landmark's kind, same lookup the tap uses.
      const door = def.travelDoors?.find((d) => d.id === "car");
      const to = door?.to[0];
      if (to) {
        car.departed = true;
        // With a road there is a beat to play before the trip books: the car
        // drives on and the picture goes to black (`stepDeparture`). Without
        // one there is nowhere to drive to, so the crossing books it outright,
        // exactly as it always did.
        if (road) {
          state.departure = {
            ms: 0,
            to,
            target: roadTarget(road, car.pos),
            booked: false,
          };
          // Nobody watches a departure through their own bag. A screen left up
          // would also halt the world (`partyBlocked`) and freeze the beat
          // mid-fade, so every seat's is dropped as the wheel is taken.
          for (const p of state.players) p.screen = undefined;
        } else
          state.events.push({
            type: "carDeparted",
            pos: { x: car.pos.x, y: car.pos.y },
            to,
          });
      }
    }
  }
}

/**
 * THE CAR COLLIDES AS A CAR, NOT AS A DOT.
 *
 * A single circle at the body's centre was wrong in both directions and both
 * showed: a 48-px wagon is more than twice as long as it is wide, so one circle
 * fat enough to hold the flanks let a nose driven at a wall bury a third of the
 * bonnet in it, and one small enough to fit through the bay's doorway let the
 * whole back end swing through the door frame on the way out. So the pass runs
 * the SAME circles the parked car blocks the floor with (`vehicleFootprint`),
 * laid along the DRAWN body: rear, middle, front, each shoved out on its own and
 * the shove carried back to the body. A corner resolves because each point is
 * read from the position the one before it left the car in.
 *
 * The same circles is the load-bearing half — a driving car and the furniture it
 * becomes the moment its driver steps out have to occupy the same ground, or
 * parking would jump the body a foot sideways.
 *
 * THE LOT IS FINITE TOO. Nothing pins an obstacle along the map's outer edge —
 * the hero is held in by an explicit clamp in his own step (step/player.ts) —
 * so a car that only ever asked the obstacle field where it could go drove off
 * the map entirely, out into the black past the verge. The same clamp is
 * applied here, per body point, so the boundary stops the BUMPER rather than
 * the centre and a car pulled up against it stays wholly on the lot.
 *
 * …except during THE DRIVE-OUT, which is the one time the car is SUPPOSED to
 * leave: the beat aims it at a point well off the map on purpose and the
 * picture washes to black over it (see DEPARTURE), so a boundary clamp would
 * park the departing car against the edge of the world with a second of fade
 * still to run.
 */
function collideCarBody(state: GameState, car: CarVehicle): void {
  const r = CAR.footprint.radius;
  const leaving = state.departure !== null;
  for (const along of CAR.footprint.offsets) {
    const point = alongBody(car.pos, along);
    const px = point.x;
    const py = point.y;
    resolveObstacles(state, point, r);
    if (!leaving) {
      point.x = clamp(point.x, r, state.level.width - r);
      point.y = clamp(point.y, r, state.level.height - r);
    }
    car.pos.x += point.x - px;
    car.pos.y += point.y - py;
  }
}

/**
 * THE ONE THING ON THE LOT A CAR CAN HIT.
 *
 * The trader is not an obstacle — the horde is pushed off his pitch and the
 * body of a car is resolved against walls and furniture, so a merchant has
 * never had to answer for anything moving. A hub whose dealer works the ROAD
 * changes that: the drive-out runs straight down his beat, and a car that
 * passed through him would be the loudest missing rule on the map.
 *
 * Read against the SAME circles the body blocks the floor with
 * (`vehicleFootprint`), so what hits him is the drawn car rather than a dot at
 * its centre, and only above `CAR.roadkillSpeed` — a car being parked leans on
 * people, it does not kill them. `killMerchant` owns everything that follows.
 */
function runDownMerchant(state: GameState, car: CarVehicle): void {
  const merchant = state.merchant;
  if (merchant.dead) return;
  if (Math.abs(car.speed) < CAR.roadkillSpeed) return;
  const reach = CAR.footprint.radius + MERCHANT.radius;
  for (const along of CAR.footprint.offsets) {
    const point = alongBody(car.pos, along);
    if (
      Math.hypot(point.x - merchant.pos.x, point.y - merchant.pos.y) <= reach
    ) {
      killMerchant(state);
      return;
    }
  }
}

/**
 * Where a departing car is aimed: down the middle of the road, past whichever
 * of its two ends is FARTHER off — the longer runway, so the last thing on
 * screen is a car still going rather than one that ran out of tarmac.
 *
 * Derived from the road's own bounds and the car's position, so it costs no rng
 * draw and lands the same way on every client that simulates the same tick.
 */
function roadTarget(road: readonly Zone[], from: Vec2): Vec2 {
  const bounds = zonesBounds(road);
  if (!bounds) return { ...from };
  const { minX, minY, maxX, maxY } = bounds;
  // A road runs along its LONG axis; the target is the far end of that axis,
  // held on the strip's centre line so the car straightens up as it goes.
  const alongY = maxY - minY >= maxX - minX;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  // AWAY from the half the car came in on: a car that joins the road in its
  // southern half has the whole northern length to drive, and aiming it at the
  // near end instead parks it against the map's edge with a second of fade
  // still to run.
  //
  // …and a QUARTER of the road's width to the right of that, which is the lane.
  // Aimed down the middle the car drives away straddling the painted line, and
  // a centre line is the one piece of road furniture every player reads without
  // being told. Right-hand traffic, like the pickup it is.
  const quarter = (alongY ? maxX - minX : maxY - minY) / 4;
  if (alongY) {
    const north = from.y > midY;
    return {
      x: midX + (north ? quarter : -quarter),
      y: north ? minY - DEPARTURE.overshoot : maxY + DEPARTURE.overshoot,
    };
  }
  const west = from.x > midX;
  return {
    x: west ? minX - DEPARTURE.overshoot : maxX + DEPARTURE.overshoot,
    y: midY + (west ? -quarter : quarter),
  };
}

/**
 * THE DEPARTING CAR'S OWN HANDS ON THE WHEEL — full throttle down the road, and
 * the wheel taking whatever error is left between the nose and the road's end.
 *
 * IT IS EXPRESSED IN THE CAR'S FRAME, and that is the whole reason it is not
 * just a synthetic `GameInput`. The player's push is read on the SCREEN
 * (`carControl`): the horizontal axis is the accelerator and the vertical is the
 * wheel, which is the right model for a side-profile car a thumb is steering.
 * The drive-out is not a thumb — it is a script that means "keep your foot down
 * and aim there" — and fed through the screen-frame reading it lost its own
 * throttle the moment the nose came round toward the road, because a car
 * pointing up the screen has almost no horizontal component left to read a
 * pedal off. It slowed to a crawl on the tarmac with the fade already running.
 *
 * So the beat asks for the two things directly: the pedal flat, and the wheel
 * proportional to the bearing error (held at `DEPARTURE.steerArc`, so the nose
 * comes round on an arc — which is how a car joins a road anyway).
 */
function departureControl(car: CarVehicle, scene: DepartureState): CarControl {
  const want = Math.atan2(
    scene.target.y - car.pos.y,
    scene.target.x - car.pos.x,
  );
  const err = angleDiff(want, car.heading);
  return { pedal: 1, wheel: clamp(err / DEPARTURE.steerArc, -1, 1) };
}

/**
 * One tick of THE DRIVE-OUT (see `GameState.departure`). Runs from
 * `stepVehicles`, ahead of the car's own physics, and does two things: hold the
 * throttle down toward the end of the road — the steering itself is `driveCar`'s,
 * fed a synthetic input, so the departing car obeys exactly the physics the
 * player was just driving — and book the trip when the clock runs out.
 */
function stepDeparture(state: GameState, dtMs: number): void {
  const scene = state.departure;
  if (!scene || scene.booked) return;
  scene.ms += dtMs;
  if (scene.ms < DEPARTURE.durationMs) return;
  scene.booked = true;
  const car = state.vehicles.find((v) => v.kind === "car");
  state.events.push({
    type: "carDeparted",
    pos: car ? { x: car.pos.x, y: car.pos.y } : { x: 0, y: 0 },
    to: scene.to,
  });
}

/** One tick of a shed wheel's highway bounce (see `WheelDebris`). */
function stepWheelDebris(wheel: WheelDebris, dt: number): void {
  wheel.vz -= WHEEL_DEBRIS.gravity * dt;
  wheel.z += wheel.vz * dt;
  const speed = Math.hypot(wheel.vel.x, wheel.vel.y);
  if (wheel.z <= 0) {
    wheel.z = 0;
    if (wheel.vz < 0) {
      // The floor hit: keep half the fall, scrub some ground speed.
      wheel.vz = -wheel.vz * WHEEL_DEBRIS.bounce;
      wheel.vel.x *= WHEEL_DEBRIS.gripLoss;
      wheel.vel.y *= WHEEL_DEBRIS.gripLoss;
      if (wheel.vz < WHEEL_DEBRIS.gravity * dt * 2) wheel.vz = 0;
    }
    // Rolling on the floor: drag walks it to a stop.
    const drag = Math.max(0, 1 - WHEEL_DEBRIS.rollDrag * dt);
    wheel.vel.x *= drag;
    wheel.vel.y *= drag;
    if (wheel.vz === 0 && speed < WHEEL_DEBRIS.restSpeed) {
      wheel.vel.x = 0;
      wheel.vel.y = 0;
      wheel.settled = true;
      return;
    }
  }
  wheel.pos.x += wheel.vel.x * dt;
  wheel.pos.y += wheel.vel.y * dt;
  // A flat doesn't spin on the axle and doesn't roll on the run-out either;
  // sound rubber and a bent rim keep turning as long as they move.
  if (wheel.wheelState !== 1 && speed > 0) {
    const tau = Math.PI * 2;
    wheel.angle =
      (((wheel.angle + (speed / CAR.wheelRadius) * dt) % tau) + tau) % tau;
  }
}
