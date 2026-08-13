// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VEHICLES (config CAR / SHIP below) — the hero's car and his garage
// ship, simulated as small machines rather than drawn as props. See
// `Vehicle` (types/world.ts) for what they are; this module owns the numbers
// and the physics:
//
//   - the car's WHEELS roll from `speed` (angle = distance / wheel radius),
//     so the renderer picks a spin frame instead of animating on a timer —
//     a car pushed twice as fast spins twice as fast, for free;
//   - the car's WHEEL puts the body ACROSS its own line, this tick and only
//     this tick (`applyCarWheel` — the driving minigame's own steering, shared
//     with it verbatim), and the FRONT WHEELS are the picture of it: `steer`
//     is the rack's own angle, wound on at a finite rate, stopped at a road
//     car's lock and self-centring the moment the wheel is let go. The body
//     never comes about, because it is one side-profile assembly that nothing
//     mirrors — `heading` is the axis it was parked on and never moves;
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
import { resolveObstacleBox, resolveObstacles } from "./obstacles.ts";
import { openDoor } from "./story.ts";
import { anyZoneWithin } from "./zones.ts";
import {
  CAR_FIX,
  type CarDetachable,
  type CarPanelId,
  type CarVehicle,
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
  /**
   * The blockers under the body (create.ts): columns of the DRAWN body, and the
   * radius each covers. Laid along the picture rather than along the nose:
   * `vehicleFootprint`.
   *
   * THEY COVER THE BODY; THEY DO NOT SAMPLE IT — which is the whole of what was
   * wrong with the three there used to be. Those sat on the two wheel arches and
   * the middle (−14, 0, +12), and a chain of circles hung on landmarks is not a
   * hull: it ended 3 px short of the bonnet at the nose, and it pinched 3 px in
   * at each of the two gaps between the circles, so the car's collision outline
   * was a peanut with a snub nose rather than a 48-px car.
   *
   * IT SHOWED WHERE IT MATTERS MOST — at the garage's doorway. Driven at the
   * wall stones either side of the roll-up the wagon buried the front of its
   * bonnet in the door frame before anything stopped it, because the thing
   * being stopped was a circle a whole 3 px behind the painted nose.
   *
   * So the chain spans the assembly instead: five columns at 7.5 px, radius 9,
   * which puts the outer circles' own edges on the 48-px body's ends and holds
   * the flanks to within a pixel of the drawn side. That is the same body the
   * driving minigame already solves the car as — one capsule laid along the
   * picture (`drive/impact.ts`, which reads this radius for exactly that
   * reason) — so the wagon is now the same shape in the bay and on the road.
   *
   * THE SAME CIRCLES DO BOTH JOBS, and that is load-bearing: a driving car and
   * the furniture it becomes the moment its driver steps out have to occupy the
   * same ground, or parking would jump the body a foot sideways.
   */
  footprint: {
    offsets: [-15, -7.5, 0, 7.5, 15],
    radius: 9,
    /**
     * …AND THE WHOLE CHAIN IS LIFTED THIS FAR UP-SCREEN OF THE ANCHOR, because
     * a blocker honestly under the tyres stops the hero's PICTURE a body-length
     * short of the wagon's (`FOOT_STANDOFF`, obstacles.ts): he came to rest
     * with clear floor between his boots and the wheel arch and read as
     * standing several strides in front of his own car.
     *
     * 21 puts the chain's south edge `FOOT_STANDOFF` above the tyres' contact
     * line, so his soles land a couple of px below them and he overlaps the
     * body — and the far side falls out for free, because the 48×26 picture is
     * almost exactly as tall as the blocked band is deep: walked round the
     * back he stops with his boots on the roofline instead of inside the roof.
     *
     * The DRIVEN car is solved as `hull` below and never reads this — a lift
     * is about where a man stands beside a parked wagon, not about where a
     * moving one hits a wall.
     */
    lift: 21,
  },
  /**
   * THE HULL A DRIVEN CAR IS SOLVED AS — the rectangle its picture covers,
   * half-extents ALONG the drawn body and ACROSS it, laid out as a chain of
   * boxes that TILE it (`collideCarBody`).
   *
   * IT IS THE CIRCLES ABOVE WITH THEIR CORNERS PUT BACK. A chain of discs has
   * no corners: the bonnet's two front ones are rounded off by a whole radius,
   * so a wagon driven at the roll-up's jamb at any angle other than dead square
   * comes to rest with the painted corner a couple of pixels inside the stone.
   * The circle is clear and the picture is not, and the bay's doorway is exactly
   * where a player is looking closely enough to see it.
   *
   * SAME BODY, SAME GROUND: `length` is the drawn 48, `depth` the same band the
   * footprint's discs claim (2 × radius), so the hull is the smallest rectangle
   * that holds them and the discs are the largest capsule that fits inside it.
   * The parked blockers stay DISCS — `Obstacle` only carries axis-aligned boxes
   * and a machine's picture lies on whatever bearing the camera decides — and
   * being strictly inside this hull is what keeps them honest: a car driven up
   * to a wall and switched off leaves blockers that cannot reach past where its
   * own body just stopped, so getting out never jogs it.
   *
   * `boxes` is how many pieces the chain is cut into. Each one is a query
   * against the obstacle grid's single cell, so a piece has to stay well under
   * `MAX_QUERY_RADIUS` (obstacles.ts) — five puts each at 4.8 × 9.
   */
  hull: { length: 48, depth: 18, boxes: 5 },
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
  /** The ground speed (px/s) at which the wheel GAINS its full authority — a
   * car only crosses as far as it rolls, so a standing car's wheel moves
   * nothing and a creeping one drifts across slowly. The minigame's own knob
   * (`DRIVE.laneRefSpeedPx`) at the bay's much lower top end, so the two
   * answer a thumb alike at the same fraction of their own top speed. */
  turnRefSpeed: 40,
  /**
   * THE WHEEL, WHOLE — how far the body slides ACROSS its own line per second
   * at full wheel and full authority (px/s). Scaled by `turnRefSpeed`, so a
   * parked car still cannot be crabbed sideways.
   *
   * IT IS THE DRIVING MINIGAME'S OWN LATERAL (`DRIVE.lateralPx`,
   * engine/game/drive/config.ts) AND, LIKE THE ROAD'S, IT IS THE WHOLE OF THE
   * STEERING. The wheel moves the car, this tick, and lets go of it the tick
   * the thumb does — nothing is wound on, banked or carried into the next
   * second. The bay used to spend the wheel on a NOSE as well: an invisible
   * heading (nothing anywhere draws it — render/vehicles.ts) that integrated
   * while the wheel was held and then kept pointing the speed wherever it had
   * got to, so a car went on steering itself long after W was let go. That is
   * the whole of what made the bay feel sticky beside the road, and it is
   * gone. A car's length per second: enough that the body visibly commits the
   * instant the wheel goes over, small enough that it reads as the car biting
   * rather than as crabbing.
   */
  lateralPx: 48,
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
   * THE LEVER BETWEEN THE SEATS — what the handbrake sheds per second (px/s²),
   * and it is the fastest way to stop this car by a wide margin.
   *
   * Four and a half times the pedal, which is the whole point of it: the brake
   * is what you drive with and this is what you reach for when driving is no
   * longer the plan. From the road's top end the pedal takes over three seconds
   * to bring the wagon down and this takes about two thirds of one — the
   * difference between "I am not going to make that gap" and "I am not going
   * through those people".
   */
  handbrakePx: 900,
  /**
   * …AND THE WEIGHT GOING FORWARD WITH IT (px/s² onto the front spring).
   *
   * A car stopping that hard does not stop level. The load transfers onto the
   * nose, the front springs compress and the back end comes light — which the
   * body already knows how to draw, because the suspension is two real springs
   * and the renderer pitches the whole shell between them (`drawShellLayer`).
   * So the handbrake does not animate anything: it leans on the front axle and
   * the picture follows, exactly as it does over a pothole.
   *
   * Sized against the spring rate: a steady push settles at `force / springK`,
   * so this is about two pixels of dive — enough to read at the shipped scale
   * (the drops are drawn at whole pixels) and short of the bump stop, which
   * would read as a broken axle rather than as a stop.
   */
  brakeDivePx: 190,
  /**
   * The speed below which locked wheels stop marking the road (px/s). A car
   * being dragged to a halt has already laid its skid by the time it is down to
   * a walking pace, and marks laid under a stationary car pool into a blob.
   */
  skidMinSpeed: 30,
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
  /**
   * HOW FAST A CAR PULLS AWAY when the DEPARTURE is booked by boarding rather
   * than by driving (`leaveByCar` — an `exitByCar` venue). Half the bay's top
   * end: enough that the wagon visibly moves off under the dim instead of
   * sitting there while the picture goes dark, gentle enough that it reads as
   * pulling out of a bay rather than as being fired out of one. It is also
   * deliberately UNDER `roadkillSpeed`, so a departure can never run somebody
   * over on the way past — the drive-out is where that hazard belongs.
   */
  pullAwayPx: 40,
  /** How far out a DRIVEN car trips the garage door — like a real opener,
   * well before the walking hero's own trigger (DOORS.openRadius), so the
   * roll-up has finished by the time the bumper reaches the threshold. */
  doorReach: 130,
  /**
   * The running engine's rumble cadence (ms between `carEngine` grains).
   *
   * The app answers each one with a grain THREE cadences long that HOLDS its
   * peak past the next grain's arrival, so three are always sounding and they
   * crossfade into one continuous rumble rather than putting one after another
   * — the same bed the driving minigame's engine is made of, at half the rate
   * and an octave down (`pwa/src/game/sfx/car-engine.ts`, which copies this
   * number because no module in the sound bank may import the engine; the copy
   * is pinned by `tests/content/car_engine_test.ts`).
   */
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
 * THE DIM — the handover between a driven car touching the level's road out and
 * whatever comes next (see `GameState.departure`).
 *
 * IT IS A FADE AND NOTHING ELSE, AND THAT IS THE WHOLE OF THE DESIGN. What sits
 * on the far side of the garage's tarmac is the DRIVING MINIGAME — a road, the
 * same wagon, and a minute of actually driving it — so the bumper touching the
 * road is a cue to get out of the way rather than an occasion. It used to be a
 * scene: the wheel was taken out of the player's hands, a synthetic driver held
 * the throttle flat and aimed the car at a point past the end of the road, and
 * the picture washed to black over nearly two seconds of a car driving itself.
 * That is a cutscene in front of a minigame about driving, played every single
 * time the player leaves the hub, and the second half of it says the same thing
 * the first half already did.
 *
 * So the car simply carries on at whatever it was doing — no synthetic hands,
 * no aim, no throttle — the screen dims, and the road picks it up. The app
 * paints the dim off `ms`; the clock is the only thing simulated.
 */
export const DEPARTURE = {
  /** How long the handover runs before the trip is booked (ms). Long enough to
   * read as a dim rather than a cut, short enough that nobody waits on it. */
  durationMs: 600,
  /** The fraction of the beat the dim takes to reach full black. Short of 1
   * on purpose: the picture is GONE before the run is torn down, so the swap
   * happens behind black rather than under a fade that is still lifting. */
  fadeAt: 0.8,
  /**
   * HOW FAR SHORT OF THE ROAD THE PICTURE STARTS GOING DARK (world px).
   *
   * THE DIM USED TO START AT THE TARMAC, which is half a beat too late: the
   * fade takes `durationMs * fadeAt` to reach black and the wagon is doing
   * `CAR.driveSpeed` while it runs, so the last thing the player watched was
   * his car driving a clear sixty px OUT ONTO the road, in full light, and only
   * then the lights going down. The car is supposed to be gone by then — the
   * road it is joining is a road the game does not have, and the next thing the
   * player sees is a different one entirely.
   *
   * So the beat begins that same sixty px EARLIER — `driveSpeed × durationMs ×
   * fadeAt`, which is the distance the fade costs — and the screen is black on
   * the frame the wheels reach the tarmac. Nothing else moves: the trip still
   * books at the end of the same beat, and the car still coasts under it.
   */
  dimFromPx: 64,
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
  /**
   * THE BLOCKERS UNDER THE HULL — the FEET, not the fuselage, which is the one
   * rule this footprint has ever had. A rocket is a tower a man walks UNDER;
   * what is actually on the floor with him is the ring its landing legs stand
   * on, and everything above that is picture.
   *
   * The hub's ship (`starship_home`) puts its three pads about 72 px apart, so
   * four discs of 12 tile that span end to end and nothing between the legs is
   * walkable — a gap a man could stand in the middle of would have him standing
   * inside a rocket.
   *
   * `lift` is the same allowance the wagon's chain takes (`CAR.footprint.lift`
   * and `FOOT_STANDOFF`, obstacles.ts): 27 puts the chain's south edge far
   * enough up-screen that a hero pressed against the ship has his boots on the
   * pads rather than a body-length out on the grass.
   */
  footprint: { offsets: [-24, -8, 8, 24], radius: 12, lift: 27 },
} as const;

/** The landmark kinds that stand for a vehicle, and what each mints. */
const VEHICLE_LANDMARKS: Record<string, Vehicle["kind"]> = {
  car: "car",
  rocket: "ship",
};

/** Mint a car, parked and cold, facing `heading`. Exported for the DRIVING
 * MINIGAME, which needs the same wagon on a road with no carve under it
 * (engine/game/drive/index.ts) — every other caller gets one from
 * `createVehicles` below. */
export function createCar(pos: Vec2, heading: number): CarVehicle {
  // The facing axis is settled HERE and never again — the art has one profile,
  // nothing mirrors or rotates it, and the wheel moves the BODY rather than the
  // nose (`applyCarWheel`). So the parking bearing is read for its SIDE and
  // then thrown away: the heading a car keeps for the rest of its life is the
  // axis it was parked on, dead square, which is exactly the frame the road
  // drives the same wagon in.
  const faceLeft = Math.cos(heading) < 0;
  return {
    kind: "car",
    pos: { x: pos.x, y: pos.y },
    home: { x: pos.x, y: pos.y },
    heading: faceLeft ? Math.PI : 0,
    departed: false,
    engineCueMs: 0,
    grindCueMs: 0,
    faceLeft,
    speed: 0,
    handbrake: false,
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

/**
 * WHAT THE ROAD DID TO THE WAGON, AS A THING THAT TRAVELS — the bent panels,
 * the ruined wheels, the parts working free, and the overall ladder the three
 * of them summarize.
 *
 * IT EXISTS BECAUSE THE CAR OUTLIVES EVERY OBJECT THAT HOLDS IT. A leg of the
 * road is a `DriveState`, the lot he parks on is a `GameState`, the leg home is
 * a second `DriveState` and his own drive is a third `GameState` — four objects
 * over one night, and one car. So the damage is lifted off whichever of them
 * has it and handed to the next as a parameter (`DriveParams.car`,
 * `RunParams.car`), which is the same rule everything else about a run obeys:
 * anything settled before the first tick is a parameter, never a mutation
 * afterwards.
 *
 * WHAT IS NOT IN HERE IS THE BLOOD. Where a body landed on the paint is a FILM
 * the app lays over the panel art (`pwa/src/game/drive-screen/car-soak.ts`) and
 * the engine has never known the car can get dirty; it rides beside this on the
 * app's own side of the same two seams. The dents are simulation, the mess is
 * presentation, and they are carried apart for that reason rather than by
 * accident.
 *
 * DELIBERATELY NOT THE WHOLE CAR. The springs, the rack, the roll angle and the
 * dangle oscillators are all where-it-happens-to-be-this-tick state that settles
 * on its own, and carrying them across would hand the next leg a body
 * mid-bounce.
 */
export type CarDamage = {
  panels: Record<CarPanelId, number>;
  wheelStates: [number, number];
  fixes: Record<CarDetachable, number>;
  wear: number;
};

/** Lift the condition off a car — what {@link applyCarDamage} puts back. */
export function readCarDamage(car: CarVehicle): CarDamage {
  return {
    panels: { ...car.panels },
    wheelStates: [car.wheelStates[0], car.wheelStates[1]],
    fixes: { ...car.fixes },
    wear: car.wear,
  };
}

/**
 * …and put it back on the next car to stand for the same wagon. Everything
 * unnamed is left exactly as `createCar` minted it, so a partial record (an old
 * save, a wire frame from a build that knew fewer panels) lands as a
 * factory-straight car rather than as an undefined damage rung nothing has a
 * sprite for.
 */
export function applyCarDamage(car: CarVehicle, damage: CarDamage): void {
  for (const panel of CAR.panels) {
    const rung = damage.panels?.[panel];
    if (typeof rung === "number") {
      car.panels[panel] = Math.max(0, Math.min(3, Math.round(rung)));
    }
  }
  for (const axle of [0, 1] as const) {
    const wheel = damage.wheelStates?.[axle];
    if (typeof wheel === "number") {
      car.wheelStates[axle] = Math.max(0, Math.min(3, Math.round(wheel)));
      // A wheel that is GONE has no spring left to it — the corner sits on the
      // bump stop, exactly as `detachWheel` leaves it. Without this the next
      // leg opens with the body level on an axle that is not there.
      if (car.wheelStates[axle] === 3) {
        car.suspension[axle] = CAR.maxCompress;
        car.suspensionVel[axle] = 0;
      }
    }
  }
  for (const part of CAR.detachables) {
    const fix = damage.fixes?.[part];
    if (typeof fix === "number") {
      car.fixes[part] = Math.max(0, Math.min(CAR_FIX.gone, Math.round(fix)));
    }
  }
  if (typeof damage.wear === "number") car.wear = Math.max(0, damage.wear);
}

function createShip(pos: Vec2, sprite: string): ShipVehicle {
  return {
    kind: "ship",
    pos: { x: pos.x, y: pos.y },
    sprite,
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
    } else if (kind === "ship") {
      // A landmark's `sprite` defaults to its kind, exactly as the renderer
      // reads it (`LevelDef.landmarks`) — a venue that names no hull gets the
      // one the id names.
      vehicles.push(createShip(mark.pos, mark.sprite ?? mark.kind));
    }
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
 * …AND A STEP UP THE PICTURE, as a point on the floor — `alongBody`'s other
 * axis, and the one a `footprint.lift` is spent on.
 *
 * The projection turns and then squashes, so the world bearing that comes out
 * VERTICAL on screen is a right angle from `billboardBearing()` at every yaw.
 * Unlike the along axis it is not unit-preserving — the squash is exactly what
 * this axis takes — so a lift is a world distance chosen against the shipped
 * `DEFAULT_PITCH`, the same way `PLAYER.footLift` is.
 */
export function acrossBody(pos: Vec2, up: number): Vec2 {
  const bearing = billboardBearing() + Math.PI / 2;
  return {
    x: pos.x - Math.cos(bearing) * up,
    y: pos.y - Math.sin(bearing) * up,
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
 *
 * …AND THE WHOLE CHAIN SITS `lift` PX UP THE PICTURE FROM THE ANCHOR, which is
 * the other half of standing a man against a machine rather than a stride in
 * front of one — see each footprint's own `lift` and `FOOT_STANDOFF`
 * (obstacles.ts).
 */
export function vehicleFootprint(
  vehicle: Vehicle,
): { pos: Vec2; radius: number }[] {
  const print = vehicle.kind === "car" ? CAR.footprint : SHIP.footprint;
  const base = acrossBody(vehicle.pos, print.lift);
  return print.offsets.map((along) => ({
    pos: alongBody(base, along),
    radius: print.radius,
  }));
}

/**
 * WHERE THE HERO ACTUALLY STANDS ON HIS FIRST FRAME, given the machines parked
 * on the lot.
 *
 * Every `at: spawn` fixture hangs off the carve's landing point, and the hub's
 * wagon is one of them — parked a dozen px off it, on the roll-up's own line
 * (content/maps/garage.yaml) — so the man who owns the garage opened every visit
 * standing inside his own car, on top of its roof.
 *
 * THE STEP OUT IS ALWAYS TOWARD THE EYE, never the short way. The field is a
 * painter's stack and a machine covers the ground above its own base
 * (pwa/src/game/render.ts), so a hero nudged NORTH of the car would be a hero
 * with a roof over his head — the same first frame with the two bodies swapped.
 * South of it he is in front of the thing he is about to get into, which is
 * where a man standing at his car is, and he is still well inside
 * `boardRadius`, so the mark over the roof is up before he has moved.
 *
 * A landing clear of every machine is returned untouched, which is every venue
 * but the hub.
 */
export function landingClearOfVehicles(
  spawn: Vec2,
  vehicles: readonly Vehicle[],
): Vec2 {
  let y = spawn.y;
  for (const vehicle of vehicles) {
    for (const print of vehicleFootprint(vehicle)) {
      // His own body has to clear the blocker, not just his feet — the discs
      // are solid ground and a landing inside one starts the run wedged.
      const reach = print.radius + PLAYER.radius;
      const dx = Math.abs(spawn.x - print.pos.x);
      if (dx >= reach || spawn.y > print.pos.y + reach) continue;
      // The lowest point on this disc's own circle at the landing's column —
      // a step, not a shove: a hero pushed the disc's full radius clear of a
      // five-disc chain would end up a car's length off his own mark.
      y = Math.max(y, print.pos.y + Math.sqrt(reach * reach - dx * dx));
    }
  }
  return { x: spawn.x, y };
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
 * PRESS THE OPENER — every `approach` door within a car's reach
 * (`CAR.doorReach`) rolls up.
 *
 * Called from both ends of a car's life on a lot: the moment a driver climbs in
 * (`enterCar`) and every tick he is driving (`driveCar`). One rule, two
 * triggers, and the first exists because the second cannot be early enough — a
 * roll-up has travel to do (`DOORS.rollUpMs`) and a bay is short.
 */
function openDoorsForCar(state: GameState, car: CarVehicle): void {
  for (const door of state.doors) {
    if (!door.approach || door.open) continue;
    const d = Math.hypot(car.pos.x - door.center.x, car.pos.y - door.center.y);
    if (d <= CAR.doorReach) openDoor(state, door);
  }
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
/**
 * HOW FAR FROM A WAGON'S ANCHOR ITS OWN BLOCKERS CAN BE (world px, + a margin)
 * — what `enterCar` lifts off the field when a driver takes the wheel.
 *
 * The chain is spread `offsets` ALONG the picture and `lift` UP it, so the
 * furthest circle sits at the hypotenuse of the two. Both steps turn with the
 * camera together (`alongBody` / `acrossBody`), so this distance is the same at
 * every yaw — which is what lets one radius stand for a chain that is not
 * centred on the anchor at all.
 */
const CAR_BLOCKER_REACH =
  Math.hypot(
    Math.max(...CAR.footprint.offsets.map(Math.abs)),
    CAR.footprint.lift,
  ) + 20;

export function enterCar(state: GameState, hero: Player): boolean {
  if (!carIsWayOut(state)) return false;
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
          CAR_BLOCKER_REACH,
    );
    if (state.obstacles.length !== before) state.obstaclesVersion++;
    state.events.push({
      type: "carStarted",
      pos: { x: vehicle.pos.x, y: vehicle.pos.y },
    });
    // …AND THE OPENER GOES WITH THE KEY. The roll-up is tripped from HERE as
    // well as from the driven car below, because the two are half a second
    // apart and the door needs every one of them: a bay this snug puts the
    // bumper at the threshold well inside the chain's own travel, so a door
    // that only started moving when the wagon did was one the wagon caught.
    // Started at the cough instead, it is up and out of the way by the time
    // anybody has finished settling their thumb — which is also where a man
    // with a remote clipped to his sun visor actually presses it.
    openDoorsForCar(state, vehicle);
    // …AND ON A VENUE WHOSE WAY OUT IS THE CAR, GETTING IN IS LEAVING.
    leaveByCar(state, vehicle);
    return true;
  }
  return false;
}

/**
 * IS THE CAR THE WAY OFF THIS VENUE RIGHT NOW?
 *
 * Three surfaces read it and they must never disagree: the "you can get in
 * this" mark over the roof (pwa/src/game/render/vehicles.ts), the tap that
 * boards it, and {@link enterCar} itself — which re-checks, because the app's
 * answer is a hint and the run's is the fact.
 *
 * Two answers, and the LEVEL decides which it gets:
 *
 *   A HUB'S CAR IS ALWAYS THE WAY OUT. Home is a place you leave; the wagon
 *   sits in the bay with its door unlocked from the first frame and taking it
 *   IS the campaign's first move.
 *   AN `exitByCar` VENUE'S OPENS WHEN THE VENUE IS OVER. GOODCO's lot is where
 *   he parked, not where he is going: for the whole mission that car is a piece
 *   of the scenery he happens to own, and it becomes a door the moment
 *   PAYLOAD-1 stops moving. `staying` is the fact behind that — on this venue
 *   it is not the player's STAY choice but the objective having cleared with
 *   the field deliberately left live (`step/index.ts`), which is the same
 *   sentence: the win is banked and he is still standing on the floor.
 *
 * Either way a level with no `car` travel door has no destination to name, and
 * a car nobody can leave in is furniture.
 */
export function carIsWayOut(state: GameState): boolean {
  const def = runLevelDef(state);
  const door = (def.travelDoors ?? []).find((d) => d.id === "car");
  if (!door || door.to.length === 0) return false;
  return def.exitByCar ? state.staying : true;
}

/**
 * THE TRIP HOME, BOOKED BY THE DOOR SHUTTING — the `exitByCar` departure, and a
 * no-op on every other venue.
 *
 * A hub's car is DRIVEN out: there is a roll-up to open, a driveway to cross
 * and a road at the end of it, and the latch is touching the tarmac
 * (`driveCar`). A car park has none of that. The lot is where the mission
 * BEGAN, its edges are the carve's business rather than the mission's, and
 * "drive around a car park until the game agrees you have left" is a puzzle
 * nobody set — so on a venue whose way out is the car, the boarding is the
 * departure and the driving is the minigame on the far side of it.
 *
 * What it hands over is exactly what the roll-up hands over: the DIM
 * (`GameState.departure` — the picture goes dark over the car, and the trip
 * books when the clock runs out), with a car pulling away under it rather than
 * standing still, because a departure nothing moves during reads as a freeze.
 */
function leaveByCar(state: GameState, car: CarVehicle): void {
  const def = runLevelDef(state);
  if (!def.exitByCar || car.departed) return;
  const to = def.travelDoors?.find((d) => d.id === "car")?.to[0];
  if (!to) return;
  car.departed = true;
  car.speed = CAR.pullAwayPx;
  state.departure = { ms: 0, to, booked: false };
  // Nobody watches a handover through their own bag — the same drop the
  // roll-up's departure makes, and for the same two reasons (see `driveCar`).
  for (const p of state.players) p.screen = undefined;
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
  // The key comes out: no speed, the lever forgotten with the seat, and both
  // cue clocks re-armed so the next start coughs from the top rather than a
  // grain into an idle it left.
  car.speed = 0;
  car.handbrake = false;
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
 * (engine/game/vehicles.ts) and `stepDrive` for the same car at 174 mph
 * (engine/game/drive/index.ts).
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
  // THE DIM TAKES THE CONTROLS OFF THE CAR AND PUTS NOTHING BACK. Once the
  // bumper is on the road the player's thumb stops reaching the wagon — the
  // trip is committed and a last-instant swerve would only argue with a picture
  // already on its way out — but nothing steers it either. It coasts, dead
  // straight, for the half-second the screen takes to go dark (see DEPARTURE).
  const leaving = state.departure !== null;
  for (const vehicle of state.vehicles) {
    if (vehicle.kind !== "car") continue;
    driveCar(
      state,
      vehicle,
      dt,
      leaving
        ? COASTING
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

/**
 * HOW MUCH OF THE WHEEL A CAR THIS FAST ACTUALLY GETS — 0 standing still, 1 at
 * `refSpeed` and above. A car only turns as far as it rolls, so a parked car's
 * wheel does nothing and a creeping one comes round slowly.
 *
 * Shared by the garage and by the driving minigame, which is the point: it is
 * the one curve both of them read the wheel through (`DRIVE.laneRefSpeedPx` /
 * `CAR.turnRefSpeed`), so the two answer a thumb the same way at the same
 * fraction of their own top speed.
 */
export function wheelAuthority(speed: number, refSpeed: number): number {
  return Math.min(1, Math.abs(speed) / refSpeed);
}

/**
 * THE WHEEL, AS DISTANCE — how far the body crosses its own line this tick
 * (world px, signed the way the wheel is pushed).
 *
 * The minigame's lane change and the garage's turn-in are the same movement,
 * and since the bay stopped swinging a nose they are the same movement all the
 * way down: the wheel goes over and the body starts across NOW, it stops the
 * tick the wheel is let go, and nothing carries over. What differs between the
 * two is a pair of numbers (how far, and how fast the car must be going to earn
 * it) — which is why they travel as parameters rather than as a branch.
 */
export function carCrossing(
  speed: number,
  wheel: number,
  dt: number,
  lateralPx: number,
  refSpeed: number,
): number {
  return clamp(wheel, -1, 1) * lateralPx * wheelAuthority(speed, refSpeed) * dt;
}

/**
 * ONE TICK OF THE WHEEL — the body across, and the front wheels drawn doing it.
 * THE GARAGE AND THE DRIVING MINIGAME BOTH CALL THIS ONE FUNCTION, which is the
 * whole reason it takes parameters instead of reading `CAR`.
 *
 * `wheel` is the driver's own -1…+1 in the SCREEN's frame (-1 is up the screen,
 * whichever way the nose happens to point — see `CarControl`), and it is spent
 * in exactly two places:
 *
 *   THE BODY  — `lateralPx` of crossing, immediately, straight down the screen.
 *               This is the WHOLE of the steering. It arrives the tick the
 *               wheel goes over and it is gone the tick the wheel comes back,
 *               so a car steers exactly as long as somebody is steering it.
 *   THE RACK  — `car.steer`, walked toward the crank the driver is asking for
 *               at `CAR.steerRate` so the front wheels visibly wind on and
 *               unwind, and self-centre the moment the wheel is let go. It is
 *               simulated rather than inferred from the crossing because the
 *               renderer warps the front wheel sprite by it: a car standing
 *               still with its wheels cranked is a picture the driver expects.
 *               REVERSE cranks it the other way for the same wheel, because
 *               backing up with the rack over swings the tail.
 *
 * THERE IS NO THIRD PLACE, AND THAT IS THE FIX. The garage used to spend a
 * share of the wheel on the car's HEADING — which nothing anywhere draws
 * (render/vehicles.ts, render/night.ts: the assembly never turns) — and then
 * pointed the speed down it. So the only thing an invisible nose swing could do
 * was outlive the input that caused it: hold W for a moment and the car went on
 * curving away for as long as it kept rolling, with the player's hands off
 * everything. The road never had it, the road has always been the better car to
 * drive, and this is the difference.
 *
 * `sign` is which way the body faces (+1 nose-right, -1 nose-left) — the rack's
 * only use for it, since the crossing is already in the screen's frame.
 */
export function applyCarWheel(
  car: CarVehicle,
  wheel: number,
  dt: number,
  lateralPx: number,
  refSpeed: number,
  sign: number,
): void {
  const command = clamp(wheel, -1, 1);
  // DOWN THE SCREEN, not down a beam: the body is a side profile drawn
  // straight-on and the heading is the axis it was parked on, so "across its
  // own line" is the world's own y — the same axis `stepDrive` crosses lanes
  // on, and the same one `carKeyTarget` hands the wheel back in.
  car.pos.y += carCrossing(car.speed, command, dt, lateralPx, refSpeed);

  const roll = car.speed < 0 ? -1 : 1;
  const wantSteer = command * CAR.steerLock * sign * roll;
  const step = CAR.steerRate * dt;
  car.steer += clamp(wantSteer - car.steer, -step, step);
}

/**
 * WHAT THE DRIVER IS ASKING FOR — one push, read as a PEDAL and a WHEEL in the
 * car's own frame. The single control model, shared by the garage and by the
 * driving minigame (engine/game/drive/), so a car handles the same in both.
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
 *   A SECOND THUMB      → the handbrake, which overrules every one of the above.
 *
 * …AND THE PEDAL IS A PEDAL RATHER THAN A DIAL, which is the half that had to be
 * fixed. A part-open throttle used to name a SPEED (`min(topSpeed * pedal, …)`),
 * so a thumb dragged a little way toward the nose — the gesture that steers a
 * gentle line, and the commonest one there is — slammed the car down to a fifth
 * of its speed in a single tick. It braked harder than the brake did, from the
 * input that means ACCELERATE. Now the pedal names a RATE: any push toward the
 * nose speeds the car up, a small one slowly and a big one hard, and NOTHING on
 * that side of the pad ever takes speed off. Losing it is what the other half of
 * the pad is for, and it is graded the same way — a nudge against the nose is a
 * feathered brake and a shove is the whole of it.
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
  /** How hard the driver is on a pedal: -1 (full brake, then reverse) … +1
   * (full throttle), 0 = hold this speed. A RATE, not a speed to settle at. */
  pedal: number;
  /** -1 (nose swings up the screen) … +1 (down), 0 = straighten up. */
  wheel: number;
  /**
   * THE LEVER IS UP. Overrules the pedal outright — a driver hauling on the
   * handbrake is not asking for anything else — and stops the car at
   * `CAR.handbrakePx` with the nose diving onto its front springs.
   *
   * Optional because it is a thing you do rather than a thing you are always
   * doing: absent is off, which is what every synthetic driver, every headless
   * step and every test that predates the lever means.
   */
  handbrake?: boolean;
};

/** Read one tick's push as the pedal, the wheel and the lever. */
export function carControl(car: CarVehicle, input: GameInput): CarControl {
  // THE LEVER IS READ FIRST AND ON ITS OWN, because it is not a push: a second
  // thumb pressed anywhere is the handbrake whether or not the first one is
  // still saying something, and a driver who lets go of the pad mid-stop has
  // not let go of the lever.
  const handbrake = input.handbrake === true;
  if (!input.steering) return { pedal: 0, wheel: 0, handbrake };
  const dx = input.target.x - car.pos.x;
  const dy = input.target.y - car.pos.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1) return { pedal: 0, wheel: 0, handbrake };
  // The nose's SIDE, not its bearing: the body is one side-profile assembly
  // that never comes about, so which way it faces is a sign and nothing more.
  const nose = car.faceLeft ? -1 : 1;
  const throttle = input.throttle ?? 1;
  return {
    pedal: clamp((dx / len) * nose * throttle, -1, 1),
    wheel: clamp(dy / len, -1, 1),
    handbrake,
  };
}

/**
 * Apply one tick of pedal and wheel to a car — the shared half of the physics,
 * so the garage's pottering car and the minigame's 174 mph one answer the
 * controls identically. The CALLER owns the top speed (`topSpeed`), because
 * that is the one thing the two genuinely disagree about: a wagon pulling out of
 * a bay is capped at a crawl and the same wagon on the open road is not.
 *
 * THE PEDAL FIRST, THEN THE WHEEL — the minigame's own order, and it matters:
 * the wheel is read through the speed the pedal just settled, so a car that has
 * this instant been braked to a crawl has a crawl's authority rather than last
 * tick's.
 */
export function applyCarControl(
  car: CarVehicle,
  control: CarControl,
  dt: number,
  topSpeed: number,
  reverseSpeed: number,
): void {
  applyCarPedals(car, control, dt, topSpeed, reverseSpeed);
  applyCarWheel(
    car,
    control.wheel,
    dt,
    CAR.lateralPx,
    CAR.turnRefSpeed,
    car.faceLeft ? -1 : 1,
  );
}

/**
 * THE PEDALS AND THE LEVER — everything the driver can do about the car's
 * SPEED, in the one place, with nothing said about the nose.
 *
 * The lever wins. A handbrake is not a harder brake pedal, it is a different
 * control that takes the car away from whatever else was being asked of it, so
 * the throttle is not consulted at all while it is up — a player who hauls on it
 * with a thumb still resting toward the nose is stopping, not negotiating.
 *
 * `car.handbrake` is stamped here rather than kept by the caller because it is a
 * fact about the CAR: the renderer draws the locked wheels' marks off it, a
 * joined client is handed it in the snapshot, and both would otherwise have to
 * be told separately what the physics already knows.
 */
export function applyCarPedals(
  car: CarVehicle,
  control: CarControl,
  dt: number,
  topSpeed: number,
  reverseSpeed: number,
  pull?: CarPull,
): void {
  car.handbrake = control.handbrake === true;
  if (car.handbrake) {
    applyHandbrake(car, dt);
    return;
  }
  applyCarPedal(car, control.pedal, dt, topSpeed, reverseSpeed, pull);
}

/**
 * WHAT THE CAR HAS TO PUSH AND SLOW WITH THIS TICK (px/s²), when the flat
 * numbers on `CAR` are not the answer.
 *
 * The GARAGE has no use for it: a wagon pottering out of a bay at a walking
 * pace is a constant shove and a constant scrub, and pretending otherwise would
 * be arithmetic nobody can see. The ROAD does, because out there the pull is a
 * torque curve through a gearbox and the coast is the air (see
 * `drive/drivetrain.ts`) — the two genuinely disagree, exactly as they already
 * disagree about the top speed, so it travels the same way: as a parameter the
 * caller owns rather than a branch inside the shared physics.
 */
export type CarPull = {
  /** What the pedal buys, net of whatever is pushing back. */
  accelPx: number;
  /** …and what nothing held costs. */
  coastPx: number;
};

/**
 * ONE TICK OF THE LEVER: the car dragged down at `CAR.handbrakePx`, and its
 * weight thrown onto the nose while it happens.
 *
 * THE DIVE IS A FORCE, NOT A POSE. It is spent on the front spring's own
 * velocity — the same place a pothole's kick lands (`nudgeCar`) — so the body
 * squats over the front axle while the lever is up, rings back level when it is
 * let go, and does both through the suspension the renderer was already pitching
 * the shell between. A pose written straight into `suspension` would fight the
 * integrator and snap flat the instant a bump arrived.
 *
 * A CAR ALREADY STOPPED DOES NOT DIVE. There is no weight left to transfer, and
 * a parked wagon nodding on its nose because a thumb is resting on the screen is
 * the picture nobody asked for.
 */
function applyHandbrake(car: CarVehicle, dt: number): void {
  if (car.speed === 0) return;
  const drop = CAR.handbrakePx * dt;
  car.speed =
    car.speed > 0
      ? Math.max(0, car.speed - drop)
      : Math.min(0, car.speed + drop);
  const shift = CAR.brakeDivePx * dt;
  car.suspensionVel[1] += shift;
  car.suspensionVel[0] -= shift;
}

/** THE LOCKED WHEELS ARE MARKING THE ROAD — the car is on the lever and still
 * moving fast enough for it to show. The one question the renderers ask about a
 * handbrake, asked once here so the skid, its smoke and its noise can never
 * disagree about when a stop started. */
export function carSkidding(car: CarVehicle): boolean {
  return car.handbrake && Math.abs(car.speed) > CAR.skidMinSpeed;
}

/**
 * THE PEDAL ALONE — accelerate, brake, or hold, with nothing said about the
 * nose or the lever.
 *
 * Split out because the DRIVING MINIGAME wants exactly this half and not the
 * other: on a straight four-lane road the car changes lanes by SLIDING across
 * them rather than by turning, because the road (and the whole impact model
 * standing on it) is axis-aligned and the body is a side profile that never
 * comes about. It still visibly cranks the rack — the renderer draws `steer` —
 * it simply does not let the crank walk the heading off the road.
 *
 * HOW FAR DOWN THE PEDAL IS SETS THE RATE, NEVER THE SPEED, and that is the one
 * rule to keep hold of here (see `CarControl` for what it cost to learn). A
 * part-open throttle is a car gathering speed gently — it is not a cruise
 * control, and it can never, at any opening, take speed OFF. A part-pressed
 * brake is the same statement the other way: it scrubs proportionally, so a
 * feathered pedal trims the approach to a gap and a stamped one is the whole of
 * what the pads have. Only the LEVER stops harder (`applyHandbrake`).
 */
export function applyCarPedal(
  car: CarVehicle,
  pedal: number,
  dt: number,
  topSpeed: number,
  reverseSpeed: number,
  pull?: CarPull,
): void {
  const accel = pull?.accelPx ?? CAR.driveAccel;
  const coast = pull?.coastPx ?? CAR.idleDragPx;
  if (pedal > 0) {
    // Up through zero from a reverse, and on to the top end — one expression,
    // because backing off the reverse IS accelerating as far as the car is
    // concerned.
    car.speed = Math.min(topSpeed, car.speed + accel * pedal * dt);
  } else if (pedal < 0) {
    // Brake first, then back up — a car does not go from forward to reverse
    // through anything but a stop.
    const force = -pedal;
    car.speed =
      car.speed > 0
        ? Math.max(0, car.speed - CAR.driveBrake * force * dt)
        : Math.max(-reverseSpeed, car.speed - accel * force * dt);
  } else {
    // NOTHING HELD: carry on. Only what the air and the closed throttle take.
    const drop = coast * dt;
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
 * driveway runs onto) commits when the car TOUCHES that, because a car sitting
 * on its own drive with the roll-up open behind it has not gone anywhere yet.
 * Touching it opens the DIM (`stepDeparture`) rather than booking the trip
 * outright — half a second of the picture going dark, and then the road. A map
 * with a door and no road keeps the threshold latch (`departRadius` of an open
 * door's center); one with neither keeps the oldest latch of all
 * (`departDistance` from home). Driving circles inside, or out onto the lawn
 * through nothing, still commits nothing.
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
  // `faceLeft` and `heading` were both settled at the parking spot and neither
  // moves again: the wheel puts the BODY across rather than swinging a nose, so
  // the side-profile art is never asked to answer for a car that came about.
  // (`faceLeft` used to flip on the nose's x-sign — which is exactly the lie,
  // since NOTHING mirrors the assembly: a car that turned round drove away
  // still facing the way it came.)
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
  // a real opener's range), so the roll-up is done before the bumper is. The
  // car that was BOARDED here has already pressed it (`enterCar`); this is the
  // one that was driven up from somewhere else on the lot.
  openDoorsForCar(state, car);
  if (!car.departed) {
    const def = runLevelDef(state);
    const road = def.driveOut;
    const garageDoors = state.doors.filter((d) => d.approach);
    // THREE LATCHES, STRONGEST FIRST. A ROAD is the real departure — the car
    // has left the property. Failing that, an open garage door's threshold.
    // Failing both, the old radial latch off the parking spot.
    //
    // THE ROAD'S LATCH IS TRIPPED SHORT OF THE ROAD (`DEPARTURE.dimFromPx`),
    // because what it starts is a FADE rather than a cut: measured at the kerb
    // it left the wagon driving out onto the tarmac in full light for the whole
    // half-second the picture takes to go dark. The other two are thresholds
    // rather than edges and already have their own reach.
    const commits = road
      ? anyZoneWithin(road, car.pos, DEPARTURE.dimFromPx)
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
        // With a road there is a dim to play before the trip books: the car
        // carries on and the picture goes dark over it (`stepDeparture`).
        // Without one there is no road to be on, so the crossing books it
        // outright, exactly as it always did.
        if (road) {
          state.departure = { ms: 0, to, booked: false };
          // Nobody watches a handover through their own bag. A screen left up
          // would also halt the world (`partyBlocked`) and freeze the dim
          // half-lit, so every seat's is dropped as the road takes over.
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
 * whole back end swing through the door frame on the way out.
 *
 * SO IT IS SOLVED AS THE RECTANGLE ITS PICTURE COVERS (`CAR.hull`) — a chain of
 * boxes laid along the DRAWN body end to end, tiling it exactly, each shoved out
 * on its own and the shove carried back to the body. A corner of the lot
 * resolves because each piece is read from the position the one before it left
 * the car in.
 *
 * A CHAIN OF DISCS GOT EVERYTHING BUT THE CORNERS, which is the half a doorway
 * is made of. Discs spanning the body hold its ends and its flanks to within a
 * pixel and then round off the bonnet's two front corners by a whole radius, so
 * a wagon driven at the roll-up's jamb at any angle but dead square parked with
 * the painted corner ~2 px inside the stone. The circle was clear; the picture
 * was not, and the bay's doorway is the one place in the game a player is
 * looking closely enough to see it.
 *
 * THE PARKED BLOCKERS ARE STILL DISCS (`vehicleFootprint`) and that is not a
 * drift: `CAR.hull` is the smallest rectangle holding them, so they are strictly
 * inside the ground this pass claims. A driving car and the furniture it becomes
 * the moment its driver steps out have to occupy the same ground or parking
 * would jump the body a foot sideways — and a chain that cannot reach past where
 * the body itself just stopped never can.
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
  const leaving = state.departure !== null;
  const bearing = billboardBearing();
  const { length, depth, boxes } = CAR.hull;
  // The chain, laid end to end down the picture: `boxes` pieces that tile the
  // whole 48, each half a piece long and the body's own half-depth across.
  const half = { x: length / (boxes * 2), y: depth / 2 };
  const step = length / boxes;
  const first = (step - length) / 2;
  // The lot's own edge stops the BUMPER rather than the centre, so the clamp is
  // the piece's own half-extents projected back onto the world's axes.
  const edgeX =
    Math.abs(half.x * Math.cos(bearing)) + Math.abs(half.y * Math.sin(bearing));
  const edgeY =
    Math.abs(half.x * Math.sin(bearing)) + Math.abs(half.y * Math.cos(bearing));
  for (let i = 0; i < boxes; i++) {
    const point = alongBody(car.pos, first + i * step);
    const px = point.x;
    const py = point.y;
    resolveObstacleBox(state, point, half, bearing);
    if (!leaving) {
      point.x = clamp(point.x, edgeX, state.level.width - edgeX);
      point.y = clamp(point.y, edgeY, state.level.height - edgeY);
    }
    car.pos.x += point.x - px;
    car.pos.y += point.y - py;
  }
  // …AND A ROLL-UP THAT IS STILL ROLLING IS STILL IN THE WAY. Its obstacle
  // chain went the moment the opener fired (the slats are drawn by the
  // animation from there on), which is right for a man on foot — he ducks under
  // — and wrong for a wagon: from the bay's top end the bumper reaches the
  // threshold a good quarter-second before the last of the travel is done, so
  // the car drove out through slats that were still a third of the way down.
  // Held at the door's own line until the chain is up, which is what a driver
  // waiting for his own garage door looks like.
  for (const door of state.doors) {
    if (!door.rollingMs || !door.from || !door.to) continue;
    for (let i = 0; i < boxes; i++) {
      const point = alongBody(car.pos, first + i * step);
      const px = point.x;
      const py = point.y;
      resolveSegmentBox(
        point,
        half,
        bearing,
        door.from,
        door.to,
        door.radius ?? 8,
      );
      car.pos.x += point.x - px;
      car.pos.y += point.y - py;
    }
  }
}

/**
 * Push one piece of the car's hull off a door's own line — the shut chain a
 * roll-up still has in the air, read straight off its two ends rather than off
 * obstacles that are already gone.
 *
 * The chain is a capsule (a segment of `radius`), so the escape is the same one
 * `resolveObstacleBox` makes against a round obstacle, measured to the closest
 * point on the segment.
 */
function resolveSegmentBox(
  pos: Vec2,
  half: Vec2,
  bearing: number,
  from: Vec2,
  to: Vec2,
  radius: number,
): void {
  const ax = to.x - from.x;
  const ay = to.y - from.y;
  const len2 = ax * ax + ay * ay;
  const t =
    len2 === 0
      ? 0
      : clamp(((pos.x - from.x) * ax + (pos.y - from.y) * ay) / len2, 0, 1);
  const near = { x: from.x + ax * t, y: from.y + ay * t };
  const cos = Math.cos(bearing);
  const sin = Math.sin(bearing);
  const dx = near.x - pos.x;
  const dy = near.y - pos.y;
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const ox = lx - clamp(lx, -half.x, half.x);
  const oy = ly - clamp(ly, -half.y, half.y);
  const d2 = ox * ox + oy * oy;
  let mx: number;
  let my: number;
  if (d2 > 0) {
    if (d2 >= radius * radius) return;
    const d = Math.sqrt(d2);
    const push = (radius - d) / d;
    mx = -ox * push;
    my = -oy * push;
  } else {
    const penX = half.x + radius - Math.abs(lx);
    const penY = half.y + radius - Math.abs(ly);
    mx = penX <= penY ? (lx < 0 ? penX : -penX) : 0;
    my = penX <= penY ? 0 : ly < 0 ? penY : -penY;
  }
  pos.x += mx * cos - my * sin;
  pos.y += mx * sin + my * cos;
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
 * HANDS OFF, EVERYTHING RELEASED — what the car is handed for the length of the
 * dim (see DEPARTURE). Nothing held means "carry on as you are" everywhere else
 * in this module and it means it here too, so the wagon keeps its speed, keeps
 * its line, and straightens its wheels while the picture goes dark over it.
 *
 * Frozen and shared rather than built per tick: it is the same three constants
 * every time, and a departing car that allocated one a frame would be the only
 * thing in this file that did.
 */
const COASTING: CarControl = Object.freeze({
  pedal: 0,
  wheel: 0,
  handbrake: false,
});

/**
 * One tick of THE DIM (see `GameState.departure`). Runs from `stepVehicles`,
 * ahead of the car's own physics, and does exactly one thing: book the trip
 * when the clock runs out. The car itself is simply coasting (`COASTING`) —
 * there is nothing to steer, because the whole beat is the screen going dark.
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
