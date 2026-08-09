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
//
// **AND THEN THE AIR MOVES IT** (`smearCarSoak`), which is the piece without
// which none of the above draws a car. A strike is an EVENT on one panel, so a
// model built only out of strikes is a step function: nearly every body on this
// road is met on the bumper, the bumper saturates inside half a dozen of them,
// and the wagon reads as a drenched nose bolted to a showroom-fresh body — one
// hard seam down the middle, which is precisely the thing that stops it looking
// like blood. Blood on a car doing 120 does not stay where it landed: it
// streams back over the bonnet, up the glass, down the flank. So each panel is
// pulled toward a fraction of the one UPWIND of it, at a rate that goes with
// road speed. The strike says where it came from; the airstream says where it
// ends up, and the two together are a gradient rather than a mask.

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
  // EVERY CHAIN REACHES EVERY PANEL THE SPRAY ITSELF COULD, and the first cut
  // did not — which left exactly one part of the car clean, and one clean white
  // panel on an otherwise drenched wagon is the only part anybody looks at.
  // Nearly every body on this road is met on the BUMPER (measured: 533 of 643
  // contacts over eight legs), so the bumper's row is the only one most cars
  // ever walk, and it has to reach the lot.
  //
  // IT STILL DOES NOT REACH THE DOORS OR THE TAIL, and that is deliberate:
  // spray does not fly BACKWARDS off a nose. What puts blood back there is the
  // airstream carrying it (`smearCarSoak`), which is a different mechanism with
  // a different shape — it takes time, it needs road speed, and it can only
  // ever hand a panel less than the one ahead of it has. Adding a made-up rear
  // share here instead would wet the tail of a car that has been idling.
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
 *
 * AND IT IS THE PANEL THAT MADE CONTACT THIS PRICES, so it is what decides
 * whether the car ever gets to look like a gradient. It was twice this, and at
 * twice this the bumper went from factory to its ceiling in six bodies —
 * measured, twenty seconds into a leg the nose was at 0.86 and the doors at
 * zero. Nothing downstream can rescue that: an airstream can only smear what is
 * there, and a nose that saturates before the second crossing pins the top of
 * the gradient flat for the rest of the trip. Halved, the nose climbs over
 * about fifteen bodies, which is the whole of the first crossing — long enough
 * that the smear has laid the rest of the car in behind it.
 */
const PER_BODY = 0.05;
const PER_FORCE = 0.045;

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

/**
 * WHAT THE AIR DOES WITH IT — the panels downwind of each one, in the order the
 * stream actually goes over a car: up the nose and over the bonnet to the glass
 * and the roof, and back along the flank from the front wing to the doors and
 * the tail. Both branches end at the backside, which is where everything on a
 * car ends up.
 *
 * This is a picture of the SHELL, not of the sprite sheet, and it is the one
 * thing here that has to be re-read if a panel is ever added: the film's
 * continuity across a seam comes from these pairs being the pairs that actually
 * touch (`car_<panel>_0.yaml`: bumper x42-46, hood x30-45, front_side x30-41,
 * glass x3-33, roof x4-29, doors x14-29, backside x0-17 on the shared 48px
 * canvas — nose to the right).
 */
const DOWNWIND: Record<CarPanelId, readonly CarPanelId[]> = {
  bumper: ["hood", "front_side"],
  hood: ["glass"],
  glass: ["roof"],
  roof: ["backside"],
  front_side: ["doors"],
  doors: ["backside"],
  backside: [],
};

/** …walked NOSE FIRST, so one tick carries the film the whole length of the car
 * rather than one panel per tick. A pass that walked it the other way would
 * take seven ticks to reach the tail and would look like the blood creeping
 * forward from the boot. */
const WIND_ORDER: readonly CarPanelId[] = [
  "bumper",
  "hood",
  "front_side",
  "glass",
  "roof",
  "doors",
];

/**
 * HOW MUCH OF THE PANEL AHEAD A PANEL ENDS UP WEARING.
 *
 * The whole gradient is this number raised to the number of seams between a
 * panel and the nose: at 0.62 a drenched bumper (0.92) leaves the bonnet at
 * 0.57, the glass at 0.35, the roof at 0.22 — and, down the flank, the wing at
 * 0.57, the doors at 0.35, the tail at 0.22. That is a car that is filthy at
 * the front and grubby at the back, which is what a car that has driven through
 * a crowd looks like. Push it toward 1 and the whole shell goes one flat red;
 * push it down and the seam this exists to remove comes back.
 */
const SMEAR_CARRY = 0.62;

/** …and how fast it gets there, in soak per second of the gap still to close,
 * at full road speed. A couple of seconds to settle: fast enough that the tail
 * is never conspicuously fresh, slow enough that the blood is visibly
 * TRAVELLING rather than teleporting onto the boot lid the moment the bumper
 * takes a hit. */
const SMEAR_PER_SEC = 0.6;

/** The road speed (px/s) at which the stream is at full strength — a little
 * under half the wagon's top end, because a car at 40 mph is already moving
 * quite fast enough to blow what is on the bonnet backwards. Below it the smear
 * scales down, and a stationary car does not smear at all: blood sitting still
 * on a parked wagon has nowhere to go. */
const SMEAR_SPEED_FULL = 400;

/**
 * One tick of the airstream: pull every panel toward its share of the one ahead
 * of it.
 *
 * IT ONLY EVER RAISES. The blood streaming back off the bonnet does not leave
 * the bonnet — it is dragged over the paint behind it — so this is a floor
 * being lifted rather than a quantity being moved, and a panel already wetter
 * than its upwind neighbour (the tail of a car that has been reversing over
 * people, the underside after a long drag) keeps every drop of it.
 */
export function smearCarSoak(
  soak: CarSoak,
  speedPx: number,
  dtMs: number,
): void {
  const wind = clamp01(Math.abs(speedPx) / SMEAR_SPEED_FULL);
  if (wind <= 0) return;
  const rate = clamp01((SMEAR_PER_SEC * wind * dtMs) / 1000);
  for (const panel of WIND_ORDER) {
    const target = Math.min(SOAK_MAX, soak[panel] * SMEAR_CARRY);
    for (const onto of DOWNWIND[panel]) {
      if (soak[onto] >= target) continue;
      soak[onto] += (target - soak[onto]) * rate;
    }
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
 * **AND THE ALPHA IS SOLVED FROM THE ART RATHER THAN RAMPED BLIND, WHICH IS THE
 * DIFFERENCE BETWEEN THIS LADDER AND THE HERO'S.** His coat ramps the alpha
 * inside a rung and resets it at the top of one, which works because his rungs
 * roughly TRIPLE in coverage (5% → 14% → 23% on the head): the art more than
 * pays back the alpha reset, so he only ever darkens. The car's film could not
 * do that — its top rung is required to cover the canvas WHOLE (see
 * `car_gore_2.yaml`), so its rungs were 49% → 96% → 100% and resetting the
 * alpha against that made a panel get LIGHTER as it got bloodier: crossing 0.5
 * took one from an effective 0.86 to 0.35, and a wagon whose bonnet had just
 * climbed a rung read as CLEANER than its own windscreen. Two neighbours either
 * side of a threshold invert, which is a seam no airstream can smear out
 * because it is not in the soak at all.
 *
 * So there is ONE quantity — how much of the panel is under blood — and
 * everything else is solved from it. The soak ramps it (`filmWetness`); a rung
 * is the sparsest art that can DRAW that much; its alpha is the wetness divided
 * by what it covers. Which makes the ladder's rungs `CAR_COAT_AT` a DERIVED
 * fact rather than an authored one: a panel leaves rung 0 at the exact soak
 * where the wetness it wants outgrows what rung 0's art can paint at full
 * strength. Re-draw the art denser and the thresholds move on their own —
 * there is no second number to forget.
 */

/** What each rung's film actually covers, as a fraction of its canvas —
 * measured off `content/sprites/goodco/car_gore_<rung>.yaml` and pinned there
 * by `tests/content/car_gore_test.ts`, since it is what the whole ladder is
 * solved from. THE SPACING IS LOAD-BEARING: two rungs of near-equal coverage
 * leave the ladder nowhere to go between them. */
const CAR_FILM_COVER = [0.21, 0.58, 1];

/** The soak at which a panel is dirty at all — under it nothing is composited
 * and a clean car costs exactly what it always did. */
const CAR_FILM_FLOOR = 0.04;

/** How much of a panel is under blood at that floor, and at the ceiling. The
 * top is held under 1 for the reason `SOAK_MAX` is: a panel with no paint
 * showing anywhere stops reading as a bloodied car and starts reading as a red
 * one. */
const CAR_WET_MIN = 0.06;
const CAR_WET_MAX = 0.92;

/**
 * HOW MUCH OF THE WETNESS ARRIVES AS AN ALL-OVER WASH rather than as spatter.
 *
 * TWO LAYERS, BECAUSE BLOOD ON A CAR IS TWO THINGS — the marks, and the film of
 * it that is simply ON everything. The spatter alone is what a mask can draw
 * and it is not what a car looks like: the sparse rungs leave 40–80% of the
 * panel at FACTORY WHITE, and a hole in the film over the flank's own highlight
 * is the brightest thing on the wagon. Measured off a driven leg, that read as
 * a clean white patch on the door of a car whose bonnet was solid red — the
 * same complaint the airstream was built for, one scale down. So a share of the
 * wetness is laid as the TOP rung's art at low alpha, which covers every pixel,
 * and the rest as the spatter over it. Nothing is ever untouched; the marks
 * still read as marks.
 *
 * Small — this is a tint, not a coat of paint. Past about a third it stops
 * being blood on white paint and starts being a pink car.
 */
const CAR_WASH_SHARE = 0.3;

/** How much of a panel is under blood at a given soak — the one ramp the whole
 * ladder is solved from. */
function filmWetness(amount: number): number {
  const into = clamp01(
    (amount - CAR_FILM_FLOOR) / Math.max(1e-6, SOAK_MAX - CAR_FILM_FLOOR),
  );
  return CAR_WET_MIN + (CAR_WET_MAX - CAR_WET_MIN) * into;
}

/** …and its inverse: the soak at which the ramp reaches a given wetness. */
function soakForWetness(wet: number): number {
  const into = (wet - CAR_WET_MIN) / (CAR_WET_MAX - CAR_WET_MIN);
  return CAR_FILM_FLOOR + (SOAK_MAX - CAR_FILM_FLOOR) * into;
}

/**
 * THE LADDER'S RUNGS — the soak each rung of art starts at, DERIVED: a panel
 * leaves a rung at the moment the SPATTER it wants is more than that rung's art
 * can paint even at full alpha.
 *
 * Exported because it is the ladder, and read here for the one question that is
 * not about drawing: whether a car is dirty at all.
 */
export const CAR_COAT_AT: readonly number[] = [
  CAR_FILM_FLOOR,
  ...CAR_FILM_COVER.slice(0, -1).map((cover) =>
    soakForWetness(cover / (1 - CAR_WASH_SHARE)),
  ),
];

export function carCoat(
  soak: CarSoak,
): Partial<Record<CarPanelId, readonly CoatLayer[]>> {
  const out: Partial<Record<CarPanelId, readonly CoatLayer[]>> = {};
  for (const [panel, amount] of Object.entries(soak) as [
    CarPanelId,
    number,
  ][]) {
    const film = carFilm(amount);
    if (film.length > 0) out[panel] = film;
  }
  return out;
}

/**
 * ONE SURFACE'S FILM at one soak — the wash, the rung of spatter over it, and
 * the alphas that make the whole ladder one continuous darkening.
 *
 * Shared by the panels and the wheels, because "which rung, how hard" is the
 * same question about the same three sprites however small the thing wearing
 * them is.
 */
function carFilm(amount: number): readonly CoatLayer[] {
  if (amount < CAR_FILM_FLOOR) return [];
  const wet = filmWetness(amount);
  const spatter = wet * (1 - CAR_WASH_SHARE);
  // The SPARSEST art that can draw the spatter — which is what makes its alpha
  // land at or under 1 without a clamp doing the work.
  let rung = 0;
  while (rung + 1 < CAR_FILM_COVER.length && spatter > CAR_FILM_COVER[rung]!) {
    rung++;
  }
  return [
    // The wash first, under the marks: the top rung's art (the only one that
    // covers every pixel) laid faintly.
    {
      sprite: `car_gore_${CAR_FILM_COVER.length - 1}`,
      alpha: wet * CAR_WASH_SHARE,
    },
    {
      sprite: `car_gore_${rung}`,
      alpha: Math.min(1, spatter / CAR_FILM_COVER[rung]!),
    },
  ];
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
  return carFilm(tyre).map((layer) => ({
    ...layer,
    // WELL under the panels' own alpha. A wheel is small, dark, moving, and
    // made almost entirely of the detail that says it is a wheel — the rim,
    // the spokes, the arch of the tyre. At the panels' strength the film ate
    // all of it and left two red discs turning, which reads as a bug rather
    // than as gore. It has to stay a TYRE that is caked in something.
    alpha: layer.alpha * WHEEL_FILM,
  }));
}

/** How much of the panels' film a tyre wears — see `wheelCoat`. */
const WHEEL_FILM = 0.55;

/** Whether anything at all is dirty — so the whole composite can be skipped on
 * a car nobody has hit anything with. */
export function carIsClean(soak: CarSoak): boolean {
  return Object.values(soak).every((amount) => amount < CAR_COAT_AT[0]!);
}
