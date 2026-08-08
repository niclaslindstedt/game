// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WAGON'S DRIVETRAIN — the engine, the gearbox and the air, in the units
// they are actually measured in.
//
// WHY THIS EXISTS AS PHYSICS AND NOT AS A DIAL. The road used to accelerate the
// car at a flat 260 px/s² — 22 m/s², two and a third g, a number no wheeled
// thing has ever produced — and the gearbox was a lookup table in the SOUND
// module, five speed thresholds picked so the note would sawtooth. Both worked
// on their own terms and neither was connected to anything: the dashboard could
// not show revs, because nothing was turning; the shift could not be felt,
// because it did not exist; and the pull was the same at 5 mph as at 115.
//
// So the whole thing is solved instead, out of the same seven numbers a
// manufacturer would print in a brochure. Road speed and the gear it is in give
// the CRANK SPEED; the crank speed gives the TORQUE; torque through the gearing
// gives the FORCE at the tyre; force minus the air and the tyres gives the
// ACCELERATION. The tachometer, the gear the box has chosen, the note coming
// out of the speaker and how hard the car pulls are then four readings of ONE
// model rather than four things somebody has to keep in step by hand.
//
// IT IS THE SAME RULE THE COLLISIONS ALREADY OBEY (see `DRIVE_UNITS`): real
// physics in real units, with the feel bought by moving the brochure numbers
// rather than by fudging the solve. That is what lets the car be RE-ENGINED
// rather than rebalanced — the wagon does 280 km/h now because somebody put a
// four-hundred-horsepower petrol engine and a close-ratio five-speed in it, and
// every consequence of that (five seconds to sixty, ten to a hundred, and the
// better part of a minute and a whole straight to see the last of it) falls out
// of the same solve rather than being typed in beside it.
//
// EVERYTHING HERE IS PURE AND A FUNCTION OF ROAD SPEED ALONE — no state, no
// clutch, no shift timer. That is what lets the sound, the HUD and the physics
// each ask their own question on their own tick and get answers that agree, and
// it is why the gearbox can be an AUTOMATIC without anybody storing which gear
// it is in: the box is in the lowest gear that can carry this road speed
// without passing its SHIFT POINT, which is what an automatic with the pedal
// down does anyway.
//
// AND THE SHIFT POINT IS NOT THE REDLINE. It used to be, and that one shortcut
// was the whole of why the dashboard read like nothing anybody has ever driven:
// the crank was held against the stop in every gear and a wagon pottering along
// at forty was sitting in the red paint. A real driver with the pedal flat
// changes up JUST PAST THE POWER PEAK — one more rev buys less at the tyre than
// the next ratio does — and the redline is the limit behind that, a thing you
// are told about rather than shown. So `shiftUpRpm` and `redlineRpm` are two
// different numbers, seven hundred apart, and the needle never reaches the
// second.
//
// WHERE THE NEEDLE DOES END UP IS HIGH, and that is the design rather than an
// accident of the ratios. Fifth is geared so the car runs out of road speed
// against the air (`DRIVE.topSpeedPx`) at about six thousand one of a seven
// thousand dial — seven eighths of the way round the face, plainly working,
// with the paint in sight and out of reach. A top gear that topped out at half
// revs would say the car had another gear it was not being given.

import { DRIVE, DRIVE_UNITS } from "./config.ts";

/** Gravity (m/s²) — only ever used for the tyres' rolling resistance, which is
 * a fraction of the weight on them. */
const GRAVITY = 9.81;

/** Air, at sea level on a cold morning (kg/m³). */
const AIR_DENSITY = 1.225;

/**
 * THE BROCHURE. Every number the road's acceleration is solved from, and the
 * only place any of them is written down.
 *
 * THE WAGON HAS BEEN RE-ENGINED, and every number below moved together when it
 * was. It used to be a tired oil-burner geared to loaf: all its torque under
 * three thousand, a long overdrive fifth, and out of breath a long way short of
 * the far end of its own speedometer. What is in it now is a big petrol thing
 * that wants revving — four hundred-odd horsepower peaking near six — behind a
 * CLOSE-RATIO five-speed, and the whole of the difference is that the dial's
 * last number is now reachable. It will do 280 km/h. It will take most of a
 * straight to do it, and it will be sitting high in fifth when it gets there.
 *
 * WHAT DID NOT MOVE IS THE BOTTOM OF IT. First gear's overall ratio is the one
 * the old car had to a decimal place (2.78 × 3.42 against 3.59 × 2.65), so the
 * wagon still leans back and gathers itself off the line like something heavy
 * rather than leaping. It is the top four fifths of the range that is new.
 */
export const DRIVETRAIN = {
  /** The crank's floor. It is running whether or not the wheels agree, so the
   * tachometer never reads below this and the note never stops. */
  idleRpm: 800,
  /**
   * WHERE THE BOX CHANGES UP — and it is NOT the redline, which is the whole of
   * what makes a tachometer read like one.
   *
   * The box used to shift at the stop: every gear was held to 5800 whatever the
   * engine was doing, and the crank spent an entire trip pinned against paint.
   * That is not what any car does. A driver with the pedal flat changes up JUST
   * PAST THE POWER PEAK — one more rev buys less at the tyre than the next gear
   * does — and the redline is the limit behind that, a thing you are told about
   * rather than shown.
   *
   * This engine's power peaks around fifty-five to fifty-eight hundred, so 6300
   * is where a driver holding it flat would take it, and the paint at seven
   * thousand is never reached on an undamaged car.
   *
   * THE SHIFT POINTS ARE STILL NOT AUTHORED: the box changes up wherever the
   * revs would pass THIS, so the gear spacing below is the only thing that
   * decides where the shifts land — they just land where a driver would put
   * them.
   */
  shiftUpRpm: 6300,
  /**
   * …and where the engine stops being asked at all. A limit rather than a
   * target: the box hands over seven hundred revs early and top gear runs out of
   * ROAD SPEED (`DRIVE.topSpeedPx`) nine hundred short of it, so on an undamaged
   * wagon the paint at the end of the dial is never reached.
   *
   * WHAT IS REACHED IS THE TOP OF THE USEFUL RANGE, and that is the change. Flat
   * out in fifth the needle sits at about six thousand one — seven eighths of
   * the way round its own face, high and working — where the old lump ran out of
   * everything at two thirds of that.
   */
  redlineRpm: 7000,
  /**
   * THE GEARS, first to fifth. A CLOSE-RATIO five-speed, which is what a top
   * gear tall enough for 280 km/h forces: fifth has to pull 2.96 overall at the
   * back axle, and hanging that off a first gear deep enough to move a
   * seventeen-hundred-kilo estate leaves a spread of about three to work five
   * ratios into.
   *
   * The spread still closes as it climbs, which is what makes each upshift drop
   * the crank a little less than the one before — out of first the needle falls
   * to about four and a half thousand, out of fourth to just under five.
   */
  gears: [2.78, 1.96, 1.43, 1.1, 0.864] as const,
  /** What the diff multiplies all of them by. Short, because the engine above
   * now has every interest in revving and the box has to reach 280 with only
   * five ratios in it. */
  finalDrive: 3.42,
  /** The rolling radius of a tyre (m) — a 235/65 R17, which is what is on it,
   * two of them past the wear markers. */
  tyreRadiusM: 0.36,
  /** What survives the gearbox, the diff and the driveshafts. */
  efficiency: 0.85,
  /**
   * THE TORQUE CURVE, as a peak and the shape of the hill around it.
   *
   * `torque = peak * (1 - falloff * ((rpm - peakRpm) / spreadRpm)^2)`, which is
   * a broad parabola: about 38% of peak at idle, all of it at forty-two hundred,
   * and still four fifths of it at the shift point. Five hundred and eighty
   * newton-metres, peaking a little over three hundred kilowatts — four hundred
   * horsepower — somewhere near fifty-six hundred, which is what puts the shift
   * point where it is: a driver changes up just past the power peak because one
   * more rev buys less at the tyre than the next ratio does.
   *
   * IT IS NOT THE ENGINE THE CAR LEFT THE FACTORY WITH. The old brochure said
   * 400 Nm at 2600 with the falloff arranged so it had nothing left by four
   * thousand — a lump that could not have reached the far end of this dial at
   * any gearing. This one is peakier, revs half as far again, and makes about
   * two and a third times the power at the top; the last fifty miles an hour of
   * the speedometer is entirely that difference.
   */
  peakTorqueNm: 580,
  peakTorqueRpm: 4200,
  torqueSpreadRpm: 3200,
  torqueFalloff: 0.55,
  /**
   * THE AIR IT HAS TO PUSH — drag coefficient times frontal area (m²).
   *
   * Still a tall square thing, if a slightly better-resolved one than it was:
   * 0.34 by 2.4 m², a wagon that has lost its roof rack and been dropped on its
   * springs. This is the number that makes the top of the range expensive rather
   * than free — drag goes as the square of speed and the POWER to overcome it as
   * the CUBE, so the last twenty miles an hour cost more than the first hundred,
   * and 174 is where four hundred horsepower and this much frontal area finally
   * agree with each other.
   */
  dragAreaM2: 0.82,
  /** The tyres' own toll — a fraction of the weight on them, near enough
   * constant with speed. */
  rollingResistance: 0.015,
  /** What a closed throttle costs on its own (m/s²): pumping losses and the
   * gearbox, on top of the air. A coasting car sheds speed slowly, which is
   * what makes "nothing held means carry on" honest. */
  engineBrakeMs2: 0.35,
} as const;

/** How many gears the wagon has — the gate the dashboard's gearbox draws, and
 * the count the sound's shift blip is fired against. One source, so a dial can
 * never disagree with the box. */
export const GEAR_COUNT = DRIVETRAIN.gears.length;

/** World px/s → m/s. */
function metresPerSecond(speedPx: number): number {
  return Math.abs(speedPx) * DRIVE_UNITS.mPerPx;
}

/** m/s² → world px/s², which is the unit everything that moves the car is
 * written in. */
function toPx(accelMs2: number): number {
  return accelMs2 / DRIVE_UNITS.mPerPx;
}

/** What the WHEELS are turning at (rpm) — the crank's demand before the gearing
 * multiplies it. */
function wheelRpm(speedPx: number): number {
  const circumference = 2 * Math.PI * DRIVETRAIN.tyreRadiusM;
  return (metresPerSecond(speedPx) / circumference) * 60;
}

/**
 * WHICH GEAR THE BOX HAS CHOSEN at this road speed — the lowest one that can
 * carry it without passing the SHIFT POINT, counting from zero.
 *
 * THE BOX SHIFTS ITSELF, and this is the whole of it. Nobody drives the wagon's
 * clutch — the player has a pedal and a wheel and that is the entire control
 * model — so an automatic is not a convenience here, it is the only gearbox the
 * car can have. It is also why this is a function of speed rather than a stored
 * gear: a box with no hysteresis cannot hunt, cannot be out of step with the
 * physics, and gives the sound and the dial the same answer on any tick either
 * of them cares to ask.
 */
export function gearFor(speedPx: number): number {
  const wheel = wheelRpm(speedPx);
  let gear = 0;
  while (
    gear < GEAR_COUNT - 1 &&
    wheel * DRIVETRAIN.finalDrive * (DRIVETRAIN.gears[gear] ?? 0) >
      DRIVETRAIN.shiftUpRpm
  ) {
    gear++;
  }
  return gear;
}

/**
 * What the CRANK is turning at, in the gear the box has chosen.
 *
 * Never below idle, because the engine is running whatever the wheels are
 * doing — and never past the redline either, because a limiter is a thing every
 * engine built in the last forty years has. On the shipped wagon the stop is
 * unreachable: there IS no gear above fifth, but fifth runs out of road speed
 * (`DRIVE.topSpeedPx`) nine hundred revs before the paint. A mod that gears
 * its vehicle short enough to hit it gets a limiter rather than a tachometer
 * reading past its own last number.
 */
export function engineRpm(speedPx: number): number {
  const gear = gearFor(speedPx);
  return Math.min(
    DRIVETRAIN.redlineRpm,
    Math.max(
      DRIVETRAIN.idleRpm,
      wheelRpm(speedPx) * DRIVETRAIN.finalDrive * (DRIVETRAIN.gears[gear] ?? 1),
    ),
  );
}

/** …and how far up the CURRENT gear that is: 0 at the shift into it, 1 at the
 * shift out. The number a tachometer's needle is interesting because of — road
 * speed climbs smoothly and this does not. */
export function gearRev(speedPx: number): number {
  const gear = gearFor(speedPx);
  const below = DRIVETRAIN.gears[gear - 1];
  const here = DRIVETRAIN.gears[gear] ?? 1;
  // The revs a shift into this gear drops to: the shift point scaled by how
  // close this ratio is to the one below it. First gear opens at idle instead.
  const floor =
    below === undefined
      ? DRIVETRAIN.idleRpm
      : (DRIVETRAIN.shiftUpRpm * here) / below;
  const span = Math.max(1, DRIVETRAIN.shiftUpRpm - floor);
  return Math.min(1, Math.max(0, (engineRpm(speedPx) - floor) / span));
}

/** What the engine is making at these revs (Nm) — the hill described on
 * `DRIVETRAIN.peakTorqueNm`, never negative. */
export function engineTorqueNm(rpm: number): number {
  const off = (rpm - DRIVETRAIN.peakTorqueRpm) / DRIVETRAIN.torqueSpreadRpm;
  return Math.max(
    0,
    DRIVETRAIN.peakTorqueNm * (1 - DRIVETRAIN.torqueFalloff * off * off),
  );
}

/**
 * WHAT THE TYRES CAN PUSH WITH at this road speed, as an acceleration
 * (px/s²) — torque, through the gear the box is in and the final drive, over
 * the wheel's radius, over the car's mass.
 *
 * This is the number that used to be the constant `260`, and every interesting
 * thing about the way the wagon drives now falls out of it: it is weakest at a
 * standstill (the engine is at idle and making 55% of its torque), strongest in
 * the middle of a gear, and it DROPS at every upshift — which is the pause in
 * the shove a real automatic gives you, arriving for free rather than being
 * animated.
 */
export function driveThrustPx(speedPx: number): number {
  const gear = DRIVETRAIN.gears[gearFor(speedPx)] ?? 1;
  const torque = engineTorqueNm(engineRpm(speedPx));
  const force =
    (torque * gear * DRIVETRAIN.finalDrive * DRIVETRAIN.efficiency) /
    DRIVETRAIN.tyreRadiusM;
  return toPx(force / DRIVE_UNITS.carMassKg);
}

/** WHAT THE ROAD AND THE AIR TAKE BACK (px/s²) — drag going as the square of
 * speed, plus the tyres' near-constant toll. */
export function roadDragPx(speedPx: number): number {
  const v = metresPerSecond(speedPx);
  const air = 0.5 * AIR_DENSITY * DRIVETRAIN.dragAreaM2 * v * v;
  const rolling =
    DRIVETRAIN.rollingResistance * DRIVE_UNITS.carMassKg * GRAVITY;
  return toPx((air + rolling) / DRIVE_UNITS.carMassKg);
}

/**
 * THE PEDAL FLAT TO THE FLOOR, net (px/s²) — what actually reaches the road
 * once the air has had its share.
 *
 * It goes to nothing on its own somewhere just short of the top of the dial,
 * which is what a top speed IS: the point where a car is pushing as hard as the
 * air is pushing back. `DRIVE.topSpeedPx` is still the hard ceiling above it
 * (and the one wear brings down), but on an undamaged wagon the physics gets
 * there first and the cap is never what stops you.
 */
export function throttleAccelPx(speedPx: number): number {
  return Math.max(0, driveThrustPx(speedPx) - roadDragPx(speedPx));
}

/** …AND NOTHING HELD (px/s²): the air, the tyres and a closed throttle. A
 * coasting wagon sheds speed slowly, which is what makes the road's "let go and
 * carry on" control model honest. */
export function coastDecelPx(speedPx: number): number {
  return roadDragPx(speedPx) + toPx(DRIVETRAIN.engineBrakeMs2);
}

/**
 * THE TOP SPEED THE PHYSICS ACTUALLY REACHES (px/s) — solved by walking the
 * throttle curve until it runs out of pull, rather than asserted.
 *
 * Nothing in the game reads it: it is here so a test can hold the brochure to
 * account (`tests/engine/drive_test.ts`), and so anybody who moves a ratio can
 * see in one call whether the wagon can still get out of its own way.
 */
export function solvedTopSpeedPx(): number {
  let px = 0;
  while (px < DRIVE.topSpeedPx && throttleAccelPx(px) > 0.01) px += 1;
  return px;
}
