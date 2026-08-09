// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GOODCO, SEEN FROM OUTSIDE ITS FENCE — the site at the end of the road out,
// written down in the order the car meets it.
//
// The car rolls in past a palisade fence, a staff lot, three windowless halls
// with the plant humming on their roofs — and, standing behind the lot with a
// gantry up its side, the thing the whole game is eventually about. The hero
// says which of those two he has noticed.
//
// WHY IT IS ITS OWN THING AND NOT A DISTRICT OF THE TOWN. `town-plan.ts` lays
// out a STREET: a plot grid, a roster of archetypes, a wear ladder, a gradient
// that slides from one end of the road to the other, and a hash that makes no
// two of them the same. None of that describes a business park, which is the
// opposite kind of place in every one of those respects — it is a small number
// of very large objects, laid out ONCE, deliberately, in an arrangement that has
// to read the same way every single time because it is the last thing the
// minigame shows and the first thing the next level is standing in. A company's
// own site is not procedural.
//
// WHAT IS IN HERE IS THE ARRANGEMENT AND NOTHING ELSE. Placing it, drawing it
// and asking where it starts are `sites.ts`, which does the identical job for
// the hero's own front garden at the other end of the same road.

import { CAMPUS_ART_SIZE } from "./campus-parts.ts";
import { FLEET } from "./fleet.ts";
import type { SiteLayout, SitePiece } from "./sites.ts";

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
  /** …and the pad behind them. Close enough behind the last hall to be in the
   * frame when the wagon stops (`parkPx` plus the camera's own lead) — the hero
   * says which of the two he has noticed, and for years the answer was neither
   * because the ship was four hundred px past the edge of the picture. */
  padPx: 1160,
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

/**
 * EVERYTHING GOODCO HAS OUT HERE, in the order the car meets it.
 *
 * Written as a flat list on purpose. The arrangement is the design: a fence you
 * pass for four hundred pixels before anything appears behind it, the lot
 * opening up, the halls going by one at a time, and the pad arriving last and
 * standing over all of it. Anybody retuning that should be able to read it as a
 * sequence, which a nest of loops is not.
 */
function pieces(): SitePiece[] {
  const out: SitePiece[] = [];
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

/**
 * THE STAFF LOT — everybody's car, parked behind the fence.
 *
 * TWO ROWS, NOSE TO TAIL, CYCLING THE ROSTER — offset by three so no two
 * neighbours and no two opposite each other are the same picture, which at this
 * size is the whole difference between a car park and a wallpaper tile.
 */
function lot(): SitePiece[] {
  if (!LOT_SPRITES.length) return [];
  const out: SitePiece[] = [];
  let n = 0;
  for (
    let at = CAMPUS.lotFromPx;
    at < CAMPUS.lotToPx;
    at += CAMPUS.lotPitchPx
  ) {
    for (const [i, back] of [0, 1].entries()) {
      out.push({
        sprite: LOT_SPRITES[(n + back * 3) % LOT_SPRITES.length]!,
        at: at + (i * CAMPUS.lotPitchPx) / 2,
        setback: CAMPUS.lotSetbackPx + back * CAMPUS.lotRowPx,
      });
    }
    n++;
  }
  return out;
}

/** GOODCO, as the road's own site. Built once — the place does not change, and
 * a leg that drives past it twice plans it once. */
export const GOODCO_SITE: SiteLayout = {
  id: "goodco",
  art: CAMPUS_ART_SIZE,
  // Poured concrete from the fence back to the skyline, which is what turns the
  // last stretch of far verge into a SITE rather than a field with buildings in
  // it.
  ground: "apron",
  fromPx: CAMPUS.fenceFromPx,
  toPx: CAMPUS.fenceToPx,
  // Level with the last hall, with the pad still ahead through the windscreen —
  // the frame the two arrival lines are written for. The camera carries most of
  // its view AHEAD of the car (`CAMERA_LEAD_FRAC`), so what the beat is about
  // has to be in front of where the wagon stops rather than behind it.
  parkPx: 900,
  pieces: pieces(),
  vehicles: lot(),
};
