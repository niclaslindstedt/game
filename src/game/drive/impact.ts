// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT HAPPENS WHEN THE CAR HITS SOMETHING — one collision, solved properly.
//
// THE WHOLE MINIGAME IS IN THIS FILE, so it is worth saying what it does out
// loud. A wagon meeting a body is an inelastic collision between two masses,
// and every number the player feels falls out of that one sum:
//
//   HOW MUCH SPEED THE HIT COSTS   is the momentum the car hands over, which
//                                  depends on WHERE the body caught it. Square
//                                  on the nose the contact normal runs straight
//                                  down the car's own axis and the car eats the
//                                  lot; clipped on the wing the normal is
//                                  square ACROSS that axis and the car barely
//                                  notices. Nobody had to write a rule for
//                                  that — it is the dot product, and it is why
//                                  a driver who learns to clip rather than
//                                  centre gets to GOODCO quicker.
//   HOW MUCH IT BREAKS THE CAR     is the kinetic energy the crumple absorbs,
//                                  which goes as the SQUARE of the closing
//                                  speed. That single fact is the entire
//                                  difficulty curve: the car that is fun to
//                                  drive is the car that is killing itself, and
//                                  the player works that out without a word of
//                                  UI.
//   HOW HARD THE PIECES FLY        is the impulse the body took, which is the
//                                  same impulse the car lost, scaled by how
//                                  much lighter a person is. So the gore gets
//                                  more violent at speed for free, exactly as
//                                  it should.
//
// THE ROAD IS AXIS-ALIGNED, ON PURPOSE. A drive runs along ±x with lanes across
// y, and the car's nose never leaves that axis — it changes lanes by sliding
// across them, not by turning, because the body is one side-profile assembly
// that nothing mirrors or rotates (`CarVehicle.heading` never moves). So the
// geometry below is
// plain x/y rather than `alongBody`'s billboard bearing: the road IS the
// bearing at the shipped square-on camera, and a drive is not carved on a map
// that a developer's yaw knob could turn under it.

import { type Vec2 } from "@game/lib/vec.ts";

import { CAR } from "../vehicles.ts";
import { difficultyDef } from "../defs/difficulties.ts";
import type { CarPanelId, Difficulty } from "../types/index.ts";
import { DRIVE, DRIVE_UNITS } from "./config.ts";

/** Half the car's body length in world px — the 48-px assembly's own reach off
 * its anchor, which is what a bumper actually hits things with. */
const HALF_BODY = 24;
/** How far off the body's axis a thing has to be to miss (world px) — the
 * footprint radius the run's own blockers use, so the car is exactly as wide
 * here as it is when it is parked furniture. */
const BODY_RADIUS = CAR.footprint.radius;

/** One solved collision — everything both parties need to answer for it. */
export type Impact = {
  /** How much ground speed the CAR loses (world px/s, always ≥ 0). */
  speedLoss: number;
  /** The struck thing's launch velocity (world px/s, ground plane). */
  launch: Vec2;
  /**
   * THE MOMENTUM THE STRUCK THING ACTUALLY TOOK (world px/s), over its own
   * mass — the collision's answer with nothing added to it.
   *
   * `launch` is the same number PLUS the share of the car's own travel a body
   * is carried up the road on (`carryFraction`) and whatever it was already
   * doing. That is right for a person, who is scooped up and taken along; it is
   * a lie for a vehicle, which is not carried by anything — a bus with the
   * hero's carry term added to it would set off up the road at his speed for
   * having been leant on.
   *
   * So a VEHICLE's response reads this and a BODY's reads `launch`, and the
   * difference between a hatchback that is punted half a lane and a bus that
   * barely notices is nothing but `impulse / massKg` — which is the whole of
   * "their weight is of great importance", stated once, here.
   */
  dv: Vec2;
  /** The impulse the pair exchanged (N·s) — what `dv` was derived from, carried
   * for the things that are about the BLOW rather than about either party's
   * answer to it (the yaw a shove off-centre puts on, the rollover test). */
  impulse: number;
  /** …and its upward kick (px/s). */
  liftZ: number;
  /** The energy the crumple absorbed (joules) — what damages the car. */
  joules: number;
  /** Where the two of them actually touched (world px). */
  contact: Vec2;
  /** How far along the car's own body that contact sat, in px from its centre
   * and signed toward the nose — which panel wears it (`panelAt`). */
  along: number;
  /**
   * HOW SQUARE THE BLOW WAS: the contact normal read onto the nose. 1 is dead
   * centre on the bumper, 0 is a body that never got in front of the car at
   * all.
   *
   * It was always computed here and always thrown away, which was fine while
   * the only thing that read it was the car's own share of the impulse. It is
   * carried now because it is the ONE condition that decides whether somebody
   * comes out through a windscreen (`eject.ts`), and re-deriving it at the call
   * site would be a second answer to a question this function has already
   * settled — the same reason `panel` travels rather than being guessed at.
   */
  squareness: number;
  /** Which panel of the HERO's car wore it — `panelAt(along)`, carried so
   * nobody downstream has to re-derive it and disagree. */
  panel: CarPanelId;
};

/**
 * Solve the car against one round body, or return null if they never touched.
 *
 * `carPos` is the body centre at the ground line and `carDir` is +1 when the
 * nose points along +x, -1 when it points along -x (a drive's only two
 * headings). `speed` is signed the same way as `CarVehicle.speed` — along the
 * nose — so a reversing car is handled by the same sum without a special case.
 */
export function solveImpact(
  carPos: Vec2,
  carDir: 1 | -1,
  speed: number,
  bodyPos: Vec2,
  bodyVel: Vec2,
  bodyRadius: number,
  bodyMassKg: number,
  bodyHalfLength = 0,
  /**
   * HOW MUCH THE TWO OF THEM GRIND, 0 (flesh) → 1 (steel on steel).
   *
   * THE HALF OF A COLLISION THIS MODEL DID NOT HAVE, and the whole of why
   * trading paint down a flank used to do literally nothing. Everything above is
   * the NORMAL sum: energy absorbed along the contact normal, which for a
   * sideswipe is a normal running straight across the road, which the car is not
   * closing along, which is zero. So two cars could grind down each other's
   * whole length at 120 mph and the model booked no energy, no damage, no
   * sound and no mark — the struck car slid politely aside and that was the
   * event.
   *
   * A real sideswipe is not free, and what it costs is FRICTION: the two
   * surfaces are sliding past each other under load, and the work that does
   * comes out of the same kinetic energy. So a share of the TANGENTIAL energy is
   * absorbed too, and it is a share rather than the lot because most of a
   * sideswipe genuinely is survived — a clip stays a great deal cheaper than
   * centring somebody, which is the ordering the whole minigame is built on.
   *
   * IT IS A PARAMETER BECAUSE FLESH DOES NOT GRIND. A body brushed by a wing is
   * flung, not sanded, and adding a friction term to the crowd would make a
   * glancing pedestrian hit as gory as a square one — so people and lamp posts
   * pass 0 and everything with bodywork passes 1.
   */
  scrape = 0,
): Impact | null {
  // THE CONTACT POINT: the nearest spot on the car's own axis segment. The
  // segment is the 48-px body laid along the road, so a thing off the END of it
  // is met by the bumper and a thing beside it is met by the flank — and the
  // normal that comes out of this is the whole reason a glancing blow is cheap.
  const alongRaw = bodyPos.x - carPos.x;
  const along = Math.max(-HALF_BODY, Math.min(HALF_BODY, alongRaw));
  const contact: Vec2 = { x: carPos.x + along, y: carPos.y };
  // …AND THE OTHER THING IS A SEGMENT TOO, when it is long enough to matter.
  //
  // A bus is 48 px of art and used to be a 12-px circle, so the hero could put
  // his nose a third of the way into one before the model noticed. Measuring to
  // the nearest point of the struck vehicle's OWN extent rather than to its
  // centre makes a long vehicle actually long — and it costs nothing for
  // everything that is honestly a point (a person, a lamp post), which passes
  // `bodyHalfLength` of 0 and gets exactly the sum it always got.
  const nearestX = Math.max(
    bodyPos.x - bodyHalfLength,
    Math.min(bodyPos.x + bodyHalfLength, contact.x),
  );
  let nx = nearestX - contact.x;
  let ny = bodyPos.y - contact.y;
  const dist = Math.hypot(nx, ny);
  if (dist > BODY_RADIUS + bodyRadius) return null;
  if (dist < 1e-6) {
    // Dead centre — the body is UNDER the car. Push it out along the nose,
    // which is where it was going anyway.
    nx = carDir;
    ny = 0;
  } else {
    nx /= dist;
    ny /= dist;
  }

  // ── HOW FAST THE CAR'S SURFACE IS RUNNING AT THIS BODY ────────────────────
  //
  // The SWEEP, not the closing speed along the normal — and the difference is
  // the one thing about this model worth understanding.
  //
  // A car is not a point: it is a four-metre surface travelling at 53 m/s, and
  // a body standing beside its door is struck by that surface even though the
  // gap between them is not shrinking along the contact normal at all. Solved
  // as a textbook point collision, a pedestrian dead abeam has zero closing
  // speed and no impulse — so the car drove clean through the crowd at 120 and
  // nobody was touched, which is exactly what the first cut of this did.
  //
  // So the SWEEP decides whether there was a hit and how hard the body is
  // thrown, and the NORMAL'S ALIGNMENT with the nose decides how much of it
  // comes back on the car. That split is the whole feel of the minigame:
  // brushing somebody flings them and costs you nothing, centring somebody
  // costs you a fifth of your speed and a fifth of your car.
  const carVx = carDir * speed;
  const sweepPx = (carVx - bodyVel.x) * carDir;
  if (sweepPx <= 0) return null;

  // ── the sum itself, in real units ─────────────────────────────────────────
  const { mPerPx, carMassKg } = DRIVE_UNITS;
  const { restitution, speedLossScale, carryFraction, liftFraction } =
    DRIVE.impact;
  const sweepMs = sweepPx * mPerPx;
  const reducedMass = (carMassKg * bodyMassKg) / (carMassKg + bodyMassKg);
  const impulse = (1 + restitution) * reducedMass * sweepMs; // N·s
  // HOW SQUARE THE BLOW WAS: the contact normal read onto the nose. 1 is dead
  // centre on the bumper, 0 is a body that never got in front of the car at
  // all — and the car's whole answer for the collision is scaled by it. It is
  // also what decides who leaves a car through its windscreen (`eject.ts`),
  // which is why it now travels on the result.
  const alongNose = Math.abs(nx * carDir);
  const normalMs = sweepMs * alongNose;
  const kinetic = 0.5 * reducedMass * (1 - restitution ** 2);
  // THE CRUSH: energy absorbed along the contact normal, which is the collision
  // everybody means by the word.
  // …AND THE SCRAPE: the tangential share, absorbed by two surfaces grinding
  // rather than by either of them folding. Zero for anything soft, so the crowd
  // is untouched by it — see the parameter's own note.
  const tangentMs = sweepMs * Math.sqrt(Math.max(0, 1 - alongNose * alongNose));
  const joules =
    kinetic * normalMs * normalMs +
    kinetic * tangentMs * tangentMs * scrape * DRIVE.impact.scrapeFriction;

  // WHAT THE CAR LOSES. The share of the impulse that acted down its own axis.
  const carDvMs = (impulse * alongNose) / carMassKg;
  const speedLoss = (carDvMs / mPerPx) * speedLossScale;

  // WHAT THE BODY TAKES. The whole impulse the other way, over a much smaller
  // mass — plus the share of the car's own travel it is carried up the road on,
  // which is what makes a hit at 120 throw somebody a whole screen.
  const bodyDvPx = impulse / bodyMassKg / mPerPx;
  const dv: Vec2 = { x: nx * bodyDvPx, y: ny * bodyDvPx };
  const launch: Vec2 = {
    x: bodyVel.x + dv.x + carVx * carryFraction,
    y: bodyVel.y + dv.y,
  };
  return {
    speedLoss: Math.min(speedLoss, Math.abs(speed)),
    launch,
    dv,
    impulse,
    liftZ: bodyDvPx * liftFraction,
    joules,
    contact,
    along: along * carDir,
    squareness: alongNose,
    panel: panelAt(along * carDir),
  };
}

/**
 * WHICH PANEL WORE IT. `along` is px from the body's centre toward the NOSE, so
 * the ladder reads front to back — and because the contact point is where the
 * physics already put it, a car driven straight at everything ends up with a
 * destroyed bumper and straight doors, while one that has been sideswiping the
 * crowd is wrecked down one side. The damage is a record of how you drove.
 */
export function panelAt(along: number): CarPanelId {
  if (along > 16) return "bumper";
  if (along > 6) return "hood";
  if (along > -4) return "front_side";
  if (along > -16) return "doors";
  return "backside";
}

/** The mass to solve each kind of thing on the road against. */
export type ImpactMasses = {
  pedestrian: number;
  /**
   * THE RUNG'S MULTIPLIER ON A VEHICLE'S OWN MASS, rather than one mass for
   * everything with wheels.
   *
   * It has to be a multiplier now that the fleet carries its own weights
   * (`drive/fleet.ts`): the difficulty ladder is a statement about how heavy the
   * ROAD is, and applying it as a flat number would have thrown away the
   * distinction between a bus and a bicycle that the fleet exists to make.
   */
  vehicleMult: number;
  /** …and what a car left at the kerb carries on top of its own mass, laddered
   * the same way. */
  parkedExtra: number;
  /** A street light. NOT laddered: the difficulty is about what the ROAD
   * weighs, and the council's lighting is the same steel on every rung. */
  lamp: number;
  /** A person, for adding to a two-wheeler that still has one aboard — the
   * crowd's own mass, because it is one of the crowd. */
  rider: number;
};

/**
 * WHAT THE ROAD WEIGHS ON THIS RUNG — the drive's one difficulty knob.
 *
 * The collision above is a momentum sum with exactly three inputs, and only one
 * of them is honestly a property of the ROAD rather than of the car or of the
 * world's units: how much mass the wagon has to shove out of the way. So that
 * is what the ladder turns (`DifficultyDef.drive`), and turning it moves both
 * halves of the answer at once because they are the same sum — a body costs
 * more speed AND does more damage on a harder rung, in the same proportion,
 * with every ratio the model is built on left alone. See the field's own note
 * in `defs/difficulties.ts` for why it saturates faster on traffic than on the
 * crowd.
 */
export function impactMasses(difficulty: Difficulty): ImpactMasses {
  const { drive } = difficultyDef(difficulty);
  return {
    pedestrian: DRIVE_UNITS.pedestrianMassKg * drive.pedestrianMassMult,
    vehicleMult: drive.trafficMassMult,
    parkedExtra: DRIVE_UNITS.parkedExtraKg * drive.trafficMassMult,
    lamp: DRIVE_UNITS.lampPostMassKg,
    rider: DRIVE_UNITS.pedestrianMassKg * drive.pedestrianMassMult,
  };
}
