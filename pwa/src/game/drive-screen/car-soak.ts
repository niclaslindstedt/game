// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WAGON WEARS IT TOO — how filthy each panel of the car has got, and where
// on it a body actually put the blood.
//
// IT IS THE HERO'S COAT, ON A CAR, and that is deliberate down to the file
// shape. `game-screen/hero-soak.ts` keeps five numbers for five gear slots and
// `render/hero-coat.ts` masks one set of authored art to whatever he happens to
// be wearing; this keeps SEVEN numbers for the seven body panels and masks one
// set of authored film to whichever panel is being drawn. Same ladder
// (`soak-ladder.ts`), same `multiply`-then-gloss composite, same reason: a
// bloodied twin of every panel at every damage rung is 84 sprites nobody would
// keep in step, and a `multiply` over the panel's own art keeps the outline and
// the paint colour showing through the mess.
//
// **WHERE IT LANDS IS THE PHYSICS' ANSWER, NOT A GUESS.** The engine already
// works out which panel a collision sat on — it is how the DAMAGE is booked
// (`panelAt(hit.along)`, engine/game/drive/impact.ts) — and now carries it out on
// `DriveStrike.panel`. So the blood and the dents accumulate on the same panels
// for the same reason, and a car that has been hitting things square arrives
// with a destroyed, drenched bumper and clean straight doors, while one that has
// been sideswiping the crowd is wrecked and filthy down one side. The damage was
// already a record of how you drove; this makes it a legible one.
//
// **AND A BODY CLIMBS THE CAR.** A hit square on the nose does not stay on the
// nose: the body is scooped up the bonnet, into the windscreen, and — if it was
// fast enough to come apart — over the roof. That is one chain
// (`CLIMB`), walked with a share that falls at each step and is scaled by how
// hard the body was thrown UP (`DriveStrike.vz`), which is why the roof of a
// car driven carefully stays clean for a whole leg and the roof of one driven
// flat out through a blockade does not.

import type { CarPanelId } from "@game/core";

import { clamp01 } from "@game/lib/vec.ts";
import { type CoatLayer } from "../render/soak-ladder.ts";

/** How filthy each panel is, 0 (factory) to 1 (you cannot see the paint). */
export type CarSoak = Record<CarPanelId, number>;

/** A wagon nobody has hit anything with yet. */
export function cleanCar(): CarSoak {
  return {
    bumper: 0,
    hood: 0,
    glass: 0,
    roof: 0,
    front_side: 0,
    doors: 0,
    backside: 0,
  };
}

/**
 * WHERE A BODY SPRAYS FROM THE PANEL THAT HIT IT — every panel it reaches, and
 * what share of the blood each one gets.
 *
 * A body met on the BUMPER is scooped onto the bonnet, sprays the wings either
 * side of the nose, goes up the windscreen and — if it was thrown properly —
 * over the roof; one caught on a FRONT WING goes down the flank instead. Every
 * row starts with the panel that made contact, which always wears the most.
 */
const SPRAY: Record<CarPanelId, readonly (readonly [CarPanelId, number])[]> = {
  // EVERY CHAIN REACHES EVERY PANEL IT PHYSICALLY COULD, and the first cut did
  // not — which left exactly one part of the car clean, and one clean white
  // panel on an otherwise drenched wagon is the only part anybody looks at.
  // Nearly every body on this road is met on the BUMPER (measured: 49 of 55
  // contacts over a leg), so the bumper's row is the only one most cars ever
  // walk, and it has to reach the lot.
  //
  // THE SHARES ARE WRITTEN DOWN RATHER THAN DERIVED FROM A POSITION, which is
  // what this replaced. A single falloff raised to the step index means
  // inserting a panel anywhere in a row silently starves everything after it —
  // adding the front wings in the right place cost the windscreen more than
  // half its blood and left the roof at a twentieth, with nothing in the code
  // saying so. A share per panel is the picture, stated.
  bumper: [
    ["bumper", 1],
    ["hood", 0.55],
    ["front_side", 0.4],
    ["glass", 0.4],
    ["roof", 0.22],
  ],
  hood: [
    ["hood", 1],
    ["glass", 0.5],
    ["front_side", 0.3],
    ["roof", 0.2],
  ],
  glass: [
    ["glass", 1],
    ["roof", 0.4],
  ],
  roof: [["roof", 1]],
  // The flanks: a body clipped on a wing goes DOWN the side of the car rather
  // than over the top of it. These are the rows that never reach the roof.
  front_side: [
    ["front_side", 1],
    ["doors", 0.45],
    ["backside", 0.2],
  ],
  doors: [
    ["doors", 1],
    ["front_side", 0.3],
    ["backside", 0.3],
  ],
  backside: [
    ["backside", 1],
    ["doors", 0.3],
  ],
};

/**
 * HOW MUCH ONE BODY IS WORTH, at the split line and per unit of force past it.
 *
 * Small, and it has to be: the road hands out about fifty bodies a leg, so a
 * figure that looked right on one collision has the wagon painted solid red by
 * the first crossing. A player driving properly should reach GOODCO with a
 * bloodied nose and readable paint everywhere else; ploughing a blockade at 120
 * is what earns a car you cannot see out of.
 */
const PER_BODY = 0.1;
const PER_FORCE = 0.09;

/**
 * HOW FAR UP THE CAR A BODY HAS TO BE THROWN before the panels past the one it
 * hit get anything (px/s of lift), and the lift at which they get all of it.
 *
 * `DriveStrike.vz` is the impulse's own upward share (`liftFraction`), so this
 * costs nothing to ask and is already ordered the way the picture needs: a body
 * nudged at 20 mph slumps off the bumper, one met at 120 goes up the glass.
 *
 * MEASURED, because the first guess at the top end was wrong by most of the
 * range. A leg's worth of real strikes carries a lift of 47 to 153 px/s, median
 * 97 — so a ceiling of 220 meant the median body only ever spent a THIRD of its
 * spray past the bumper, and a wagon that had driven through fifty people
 * arrived with a clean roof. The band is the band the road actually produces.
 */
const CLIMB_VZ_MIN = 40;
const CLIMB_VZ_FULL = 130;

/**
 * …and how much of the underside a piece being DRAGGED wets per second. The back
 * of the car is what is actually in it, so that is where it goes — and it is a
 * rate rather than a hit, because a drag is the one thing on this road that is
 * still happening a second after it started.
 *
 * SMALL, AND IT HAD TO COME DOWN A LONG WAY. At six tenths a second a single
 * drag saturated the rear of the car before it had finished, so the wagon
 * arrived at the first crossing with a drenched backside, clean doors and a
 * spotless nose — precisely inside out, since the nose is what actually hits
 * people. A drag is a smear from something wedged underneath, not a bucket.
 */
const DRAG_PER_SEC = 0.09;

/** Nothing may reach a full 1: blood soaks INTO paint, and a panel at full
 * strength stops reading as a bloody car and starts reading as a red one — the
 * same ceiling the hero's own coat is held under. */
const SOAK_MAX = 0.92;

/**
 * Book one collision against the car.
 *
 * `panel` is where the physics put the contact, `vz` how hard the body was
 * thrown up, and `force` the collision in `remainForce` units (1 = the split
 * line). Everything else is the chain above.
 */
export function soakCarFromStrike(
  soak: CarSoak,
  panel: CarPanelId,
  vz: number,
  force: number,
): void {
  const amount = PER_BODY + PER_FORCE * Math.max(0, force);
  // How much of the CLIMB the body earned. A body that barely left the ground
  // wets the panel it hit and nothing else.
  const climb = clamp01((vz - CLIMB_VZ_MIN) / (CLIMB_VZ_FULL - CLIMB_VZ_MIN));
  const spray = SPRAY[panel] ?? [[panel, 1] as const];
  for (const [step, [wearer, share]] of spray.entries()) {
    // The panel that made contact takes its share whatever happened; every
    // other one is scaled by how far the body was actually thrown, so a wagon
    // nudging people at 20 mph wears its bumper and nothing else.
    const got = share * (step === 0 ? 1 : climb);
    if (got <= 0) continue;
    soak[wearer] = Math.min(SOAK_MAX, soak[wearer] + amount * got);
  }
}

/** …and one tick of whatever is being dragged along underneath. */
export function soakCarFromDrag(soak: CarSoak, dtMs: number): void {
  const amount = (DRAG_PER_SEC * dtMs) / 1000;
  soak.backside = Math.min(SOAK_MAX, soak.backside + amount);
  soak.doors = Math.min(SOAK_MAX, soak.doors + amount * 0.5);
}

/**
 * THE FILM EACH PANEL WEARS — the ladder, in the shape `drawCarAssembly` takes.
 *
 * `soak-ladder.ts`'s own rungs and alpha ramp, on the car's own art: the panel
 * darkens continuously and only CHANGES ART when it has genuinely climbed a
 * rung, which is what makes three rungs read as a build-up rather than as three
 * costumes. A panel under the first rung contributes nothing at all, so a clean
 * car composites nothing and costs exactly what it always did.
 *
 * THE RUNGS SIT LOW ON PURPOSE. Only the FIRST rung's art leaves real paintwork
 * showing between the spatter, and only it is meant to — a car a few bodies in
 * should plainly still be a white hatchback with blood on it. Everything above
 * covers, so the thresholds are set where a panel that has been hit a handful
 * of times has already climbed off the sparse rung: a wagon that reads as
 * covered in blood with white pixels punched through it reads as a rendering
 * fault rather than as a car nobody has washed.
 */
export const CAR_COAT_AT = [0.05, 0.22, 0.5];
const CAR_ALPHA_MIN = 0.35;
const CAR_ALPHA_MAX = 0.9;

export function carCoat(
  soak: CarSoak,
): Partial<Record<CarPanelId, readonly CoatLayer[]>> {
  const out: Partial<Record<CarPanelId, readonly CoatLayer[]>> = {};
  for (const [panel, amount] of Object.entries(soak) as [
    CarPanelId,
    number,
  ][]) {
    if (amount < CAR_COAT_AT[0]!) continue;
    let rung = 0;
    while (rung + 1 < CAR_COAT_AT.length && amount >= CAR_COAT_AT[rung + 1]!) {
      rung++;
    }
    const from = CAR_COAT_AT[rung]!;
    const to = CAR_COAT_AT[rung + 1] ?? 1;
    const into = clamp01((amount - from) / Math.max(1e-6, to - from));
    out[panel] = [
      {
        sprite: `car_gore_${rung}`,
        alpha: CAR_ALPHA_MIN + (CAR_ALPHA_MAX - CAR_ALPHA_MIN) * into,
      },
    ];
  }
  return out;
}

/**
 * THE FILM ON THE TYRES, off the carry the road already keeps
 * (`DriveGoreState.tyre` — what the wheels are still printing on the tarmac).
 *
 * ONE RECORD, TWO PICTURES, and that is the point: the blood the wheels are
 * leaving BEHIND and the blood that is visibly ON them are the same blood, so
 * they run out together. A tyre still printing tread down the road and drawn
 * factory-clean is the feature contradicting itself in one frame.
 */
export function wheelCoat(tyre: number): readonly CoatLayer[] {
  if (tyre < CAR_COAT_AT[0]!) return [];
  let rung = 0;
  while (rung + 1 < CAR_COAT_AT.length && tyre >= CAR_COAT_AT[rung + 1]!)
    rung++;
  return [
    {
      sprite: `car_gore_${rung}`,
      // WELL under the panels' own alpha. A wheel is small, dark, moving, and
      // made almost entirely of the detail that says it is a wheel — the rim,
      // the spokes, the arch of the tyre. At the panels' strength the film ate
      // all of it and left two red discs turning, which reads as a bug rather
      // than as gore. It has to stay a TYRE that is caked in something.
      alpha: (CAR_ALPHA_MIN + (CAR_ALPHA_MAX - CAR_ALPHA_MIN) * tyre) * 0.55,
    },
  ];
}

/** Whether anything at all is dirty — so the whole composite can be skipped on
 * a car nobody has hit anything with. */
export function carIsClean(soak: CarSoak): boolean {
  return Object.values(soak).every((amount) => amount < CAR_COAT_AT[0]!);
}
