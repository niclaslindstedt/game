// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT IS AT THE END OF THE ROAD — GOODCO, seen from outside its fence.
//
// THE FINISH LINE IS NOT THE ARRIVAL, and this file is the stretch between the
// two. The clock stops and the town stops at the same world x; then the wheel
// comes off the player and the car rolls in past a palisade fence, a staff lot,
// three windowless halls with the plant humming on their roofs — and, standing
// behind the lot with a gantry up its side, the thing the whole game is
// eventually about. The hero says which of those two he has noticed.
//
// WHY IT IS A SECOND PLANNER AND NOT A DISTRICT OF THE FIRST. `town-plan.ts`
// lays out a STREET: a plot grid, a roster of archetypes, a wear ladder, a
// gradient that slides from one end of the road to the other, and a hash that
// makes no two of them the same. None of that describes a business park, which
// is the opposite kind of place in every one of those respects — it is a small
// number of very large objects, laid out ONCE, deliberately, in an arrangement
// that has to read the same way every single time because it is the last thing
// the minigame shows and the first thing the next level is standing in. A
// company's own site is not procedural. So this is a FIXED dressing, written
// down in the order the car meets it.
//
// IT SHARES THE TOWN'S OUTPUT SHAPE (`TownProp`) AND NOTHING ELSE, which is the
// whole reason it can exist at all without touching the renderer: a planned
// piece of scenery is a key, a base, a size and a stack of sprites, and the app
// already knows how to compose and blit one of those (`drawTownProp`).
//
// NOT ONE `state.rng()` DRAW, like everything else on this tarmac — it is not
// even hashed, because there is nothing here to vary.

import { CAMPUS_ART_SIZE } from "./campus-parts.ts";
import { courseLength } from "./config.ts";
import { crowdEdges } from "./crowd.ts";
import { FLEET } from "./fleet.ts";
import type { TownProp, TownRoad } from "./town-plan.ts";

/** How big every piece of the site is — the leaf table (`campus-parts.ts`),
 * re-exported so nothing downstream has to know the generator forced it into a
 * file of its own. */
export { CAMPUS_ART_SIZE } from "./campus-parts.ts";

/** The campus's own numbers — where each piece stands, measured in world px
 * PAST THE FINISH LINE along the direction of travel. */
export const CAMPUS = {
  /** How far the fence runs, from before the finish to well past where the car
   * comes to rest. It opens BEFORE the line so the town's last building and
   * GOODCO's boundary meet rather than leaving a gap of nothing. */
  fenceFromPx: -260,
  fenceToPx: 2100,
  /** The gate and the sign, which is what the finish line actually looks like. */
  gatePx: -150,
  signPx: -60,
  /** The three halls, in the order the car passes them. */
  hallsPx: [300, 640, 1020] as const,
  /** …and the pad behind them. */
  padPx: 1240,
  /** The staff lot: parked cars from here to here, every `lotPitchPx`, in two
   * rows nose to tail — and how far the back row stands behind the front one. */
  lotFromPx: 120,
  lotToPx: 1500,
  lotPitchPx: 46,
  lotRowPx: 6,
  /** …and the masts that light it. */
  floodsPx: [200, 700, 1200] as const,

  // ── HOW FAR BACK EACH THING STANDS (world px behind the far pavement) ──────
  // The y-sort IS the depth here: a smaller y is drawn first and reads as
  // further away, so the ladder below is literally the order the eye goes
  // through the site — fence, then the cars behind it, then the halls, then the
  // pad on the skyline.
  fenceSetbackPx: 4,
  lotSetbackPx: 9,
  hallSetbackPx: 17,
  padSetbackPx: 26,
} as const;

/** The car park is dressed with the TOWN'S OWN CARS, because GOODCO's staff
 * drive what everybody else on this road drives — the ordinary saloons and
 * hatchbacks, never a bus and never somebody's moped. Named rather than filtered
 * by class so the lot cannot quietly fill up with ambulances the day one is
 * added to the fleet. */
const LOT_CARS: readonly string[] = [
  "traffic_hatch",
  "traffic_sedan",
  "traffic_estate",
  "traffic_electric",
  "traffic_suv",
  "traffic_minivan",
];

/** …resolved to sprite stems once, at module load. A name the fleet no longer
 * has is dropped rather than drawn as a hole. */
const LOT_SPRITES = LOT_CARS.filter((id) => FLEET.some((def) => def.id === id));

/** One piece, placed. `at` is world px past the finish along the leg. */
type Piece = { sprite: string; at: number; setback: number };

/** …and one of the staff's cars, which is placed the same way and DRAWN
 * differently — see `campusLot`. */
export type CampusCar = { sprite: string; x: number; y: number };

/**
 * EVERYTHING GOODCO HAS OUT HERE, in the order the car meets it — the site
 * itself, before it is turned into world coordinates.
 *
 * Written as a flat list on purpose. The arrangement is the design: a fence you
 * pass for four hundred pixels before anything appears behind it, the lot
 * opening up, the halls going by one at a time, and the pad arriving last and
 * standing over all of it. Anybody retuning that should be able to read it as a
 * sequence, which a nest of loops is not.
 */
function pieces(): Piece[] {
  const out: Piece[] = [];
  const { fenceFromPx, fenceToPx, fenceSetbackPx } = CAMPUS;
  const bay = CAMPUS_ART_SIZE.goodco_fence![0];
  for (let at = fenceFromPx; at < fenceToPx; at += bay) {
    // The gate is a hole in the fence rather than a thing hung in front of it,
    // so the bay it occupies is simply not built.
    const gateSpan = CAMPUS_ART_SIZE.goodco_gate![0];
    if (Math.abs(at - CAMPUS.gatePx) < gateSpan) continue;
    out.push({ sprite: "goodco_fence", at, setback: fenceSetbackPx });
  }
  out.push({
    sprite: "goodco_gate",
    at: CAMPUS.gatePx,
    setback: fenceSetbackPx,
  });
  out.push({
    sprite: "goodco_sign",
    at: CAMPUS.signPx,
    setback: fenceSetbackPx,
  });

  for (const at of CAMPUS.floodsPx) {
    out.push({ sprite: "goodco_flood", at, setback: CAMPUS.lotSetbackPx + 3 });
  }

  // THE HALLS — wide, tall, wide. The tall one in the middle so the roofline
  // steps up and back down rather than climbing, which is what makes three
  // boxes read as a site plan instead of a bar chart.
  const halls = ["goodco_hall", "goodco_hall_tall", "goodco_hall"] as const;
  CAMPUS.hallsPx.forEach((at, i) => {
    out.push({
      sprite: halls[i] ?? "goodco_hall",
      at,
      setback: CAMPUS.hallSetbackPx,
    });
  });

  // …AND THE PAD, on the skyline behind everything. The gantry is placed a
  // little short of the ship so the tower stands beside it rather than through
  // it, and it is drawn FIRST — a service tower is behind the stack from this
  // side of the fence.
  out.push({
    sprite: "goodco_gantry",
    at: CAMPUS.padPx - 30,
    setback: CAMPUS.padSetbackPx,
  });
  out.push({
    sprite: "goodco_rocket",
    at: CAMPUS.padPx,
    setback: CAMPUS.padSetbackPx - 1,
  });
  return out;
}

/** Built once — the site does not change, and a leg that drives it twice (out
 * and home) plans it once. */
let SITE: Piece[] | null = null;

/**
 * EVERY PIECE OF GOODCO BETWEEN TWO WORLD X, ready to be composed and blitted —
 * the campus's answer to `planTown`, and read by the same pass.
 *
 * Each piece is its own one-layer stack rather than a composed assembly, because
 * unlike a house there is nothing here to dress: a fence bay is a fence bay. The
 * `key` is still the sprite's own name, so the app's compositor caches one
 * canvas per KIND and a hundred and forty fence bays cost one.
 */
export function planCampus(
  fromX: number,
  toX: number,
  road: TownRoad,
): TownProp[] {
  SITE ??= pieces();
  const walk = crowdEdges();
  const finishX = road.direction * courseLength(road);
  const out: TownProp[] = [];
  for (const piece of SITE) {
    const size = CAMPUS_ART_SIZE[piece.sprite];
    if (!size) continue;
    const x = finishX + road.direction * piece.at;
    const [w, h] = size;
    if (x + w / 2 < fromX || x - w / 2 > toX) continue;
    out.push({
      key: piece.sprite,
      x,
      y: walk.top - piece.setback,
      w,
      h,
      layers: [{ sprite: piece.sprite, x: 0, y: 0 }],
    });
  }
  return out;
}

/**
 * THE STAFF LOT — everybody's car, parked behind the fence.
 *
 * A SEPARATE CALL FROM `planCampus`, and the reason is worth writing down
 * because it looks like an inconsistency. A planned piece of scenery carries its
 * own SIZE, because the app composes it onto a canvas of exactly that size
 * before it blits — which works for the fence and the halls, whose sizes are the
 * engine's own table. A car is not the engine's: it is one of the fleet's
 * sprites, whose grid is authored under `content/sprites/` and whose dimensions
 * nothing in here knows. Giving the planner a guess would clip somebody's van;
 * naming the sprite and letting the renderer's ordinary blit find it in the
 * atlas cannot.
 *
 * So the lot comes out as bare placements, and the road draws them with the same
 * pass it draws a parked car at the kerb with.
 *
 * TWO ROWS, NOSE TO TAIL, CYCLING THE ROSTER — offset by three so no two
 * neighbours and no two opposite each other are the same picture, which at this
 * size is the whole difference between a car park and a wallpaper tile.
 */
export function campusLot(
  fromX: number,
  toX: number,
  road: TownRoad,
): CampusCar[] {
  if (!LOT_SPRITES.length) return [];
  const walk = crowdEdges();
  const finishX = road.direction * courseLength(road);
  const out: CampusCar[] = [];
  let n = 0;
  for (
    let at = CAMPUS.lotFromPx;
    at < CAMPUS.lotToPx;
    at += CAMPUS.lotPitchPx
  ) {
    for (const [i, back] of [0, 1].entries()) {
      const sprite = LOT_SPRITES[(n + back * 3) % LOT_SPRITES.length]!;
      const x = finishX + road.direction * (at + (i * CAMPUS.lotPitchPx) / 2);
      if (x < fromX || x > toX) continue;
      out.push({
        sprite,
        x,
        y: walk.top - CAMPUS.lotSetbackPx - back * CAMPUS.lotRowPx,
      });
    }
    n++;
  }
  return out;
}

/**
 * WHERE THE CAMPUS STARTS AND STOPS IN WORLD X — what a renderer needs to know
 * before it asks for any of it, and what tells the ground pass where GOODCO's
 * own apron replaces the verge.
 *
 * Derived from the fence rather than from the finish line, because the fence is
 * what a player actually reads as the boundary of the place.
 */
export function campusSpanX(road: TownRoad): { fromX: number; toX: number } {
  const finishX = road.direction * courseLength(road);
  const a = finishX + road.direction * CAMPUS.fenceFromPx;
  const b = finishX + road.direction * CAMPUS.fenceToPx;
  return { fromX: Math.min(a, b), toX: Math.max(a, b) };
}

/** How far past the town's own end the site reaches — the run-in's length, and
 * what `DRIVE.arrival` is timed to cover. Exported for the tests, which hold the
 * two against each other rather than trusting a comment. */
export function campusRunInPx(): number {
  return CAMPUS.fenceToPx;
}
