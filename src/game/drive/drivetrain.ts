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
// rather than by fudging the solve. A wagon that reached 60 in three seconds
// and then had nothing left is not a car anybody has driven; one that takes
// nine seconds to get there, spends the next twenty crawling up to a hundred,
// and never quite sees the top of the dial is exactly the car the joke needs.
//
// EVERYTHING HERE IS PURE AND A FUNCTION OF ROAD SPEED ALONE — no state, no
// clutch, no shift timer. That is what lets the sound, the HUD and the physics
// each ask their own question on their own tick and get answers that agree, and
// it is why the gearbox can be an AUTOMATIC without anybody storing which gear
// it is in: the box is in the lowest gear that can carry this road speed
// without passing the redline, which is what an automatic at full throttle
// does anyway.

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
 * The car is a tired, heavy, tall thing with a big-ish engine that does its
 * best work high up and nothing much below three thousand — which is precisely
 * why it is slow away from the lights and still, given a long enough road, sees
 * the far end of the speedometer.
 */
export const DRIVETRAIN = {
  /** The crank's floor. It is running whether or not the wheels agree, so the
   * tachometer never reads below this and the note never stops. */
  idleRpm: 800,
  /**
   * …and where it stops being asked. THE SHIFT POINTS ARE NOT AUTHORED: the box
   * changes up wherever the revs would pass this, which is what makes the gear
   * spacing below the only thing that decides where the shifts land.
   */
  redlineRpm: 5800,
  /**
   * THE GEARS, first to fifth. A five-speed with the usual closing spread: the
   * bottom two are gone almost at once, fourth is where most of a trip is
   * spent, and fifth is a long overdrive that flatters the fuel figure and
   * leaves nothing at all in reserve.
   */
  gears: [4.2, 2.49, 1.67, 1.24, 1.0] as const,
  /** What the diff multiplies all of them by. */
  finalDrive: 3.73,
  /** The rolling radius of a tyre (m) — a 235/65 R17, which is what is on it,
   * two of them past the wear markers. */
  tyreRadiusM: 0.36,
  /** What survives the gearbox, the diff and the driveshafts. */
  efficiency: 0.85,
  /**
   * THE TORQUE CURVE, as a peak and the shape of the hill around it.
   *
   * `torque = peak * (1 - falloff * ((rpm - peakRpm) / spreadRpm)^2)`, which is
   * a broad parabola: about 45% of peak at idle, all of it at four thousand,
   * and most of it still there at the redline. THE FALLOFF IS THE WHOLE
   * CHARACTER OF THE CAR — a flat curve would make it quick away from a
   * standstill, and this one deliberately does not: in first gear at walking
   * pace the engine is down near a hundred newton-metres and the wagon simply
   * will not go.
   */
  peakTorqueNm: 240,
  peakTorqueRpm: 4200,
  torqueSpreadRpm: 3400,
  torqueFalloff: 0.55,
  /**
   * THE AIR IT HAS TO PUSH — drag coefficient times frontal area (m²).
   *
   * A brick with a roof rack: 0.40 by 2.5 m². This is the number that makes the
   * top of the range expensive rather than free — drag goes as the square of
   * speed and the POWER to overcome it as the cube, so the last twenty miles an
   * hour cost more than the first eighty.
   */
  dragAreaM2: 1.0,
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
 * carry it without passing the redline, counting from zero.
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
      DRIVETRAIN.redlineRpm
  ) {
    gear++;
  }
  return gear;
}

/** What the CRANK is turning at, in the gear the box has chosen — never below
 * idle, because the engine is running whatever the wheels are doing. */
export function engineRpm(speedPx: number): number {
  const gear = gearFor(speedPx);
  return Math.max(
    DRIVETRAIN.idleRpm,
    wheelRpm(speedPx) * DRIVETRAIN.finalDrive * (DRIVETRAIN.gears[gear] ?? 1),
  );
}

/** …and how far up the CURRENT gear that is: 0 at the shift into it, 1 at the
 * shift out. The number a tachometer's needle is interesting because of — road
 * speed climbs smoothly and this does not. */
export function gearRev(speedPx: number): number {
  const gear = gearFor(speedPx);
  const below = DRIVETRAIN.gears[gear - 1];
  const here = DRIVETRAIN.gears[gear] ?? 1;
  // The revs a shift into this gear drops to: the redline scaled by how close
  // this ratio is to the one below it. First gear opens at idle instead.
  const floor =
    below === undefined
      ? DRIVETRAIN.idleRpm
      : (DRIVETRAIN.redlineRpm * here) / below;
  const span = Math.max(1, DRIVETRAIN.redlineRpm - floor);
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
 * standstill (the engine is at idle and making 45% of its torque), strongest in
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
