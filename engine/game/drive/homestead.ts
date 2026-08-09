// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOME, SEEN FROM THE ROAD — the site at the end of the leg BACK, written down
// in the order the car meets it.
//
// IT IS THE ANSWER TO GOODCO AND IT IS BUILT TO BE READ AGAINST IT. That end of
// the road is a palisade, three windowless halls and a launch stack a hundred
// and sixty-eight pixels tall; this end is a timber fence a man could step over,
// a bungalow with its garage door up, two trees and a rocket he made himself
// that comes up to the height of a block of flats. Same beat, same run-in, same
// last thing on the skyline — and the whole distance between the two places is
// in how big the rocket is.
//
// THE STAGING IS THE LAUNCH SCENE'S (`content/cutscenes/launch.yaml`), because
// it has to be: the player has watched this lot from the front, walked it as a
// hub, and is going to watch a rocket go up off it. So the ship stands HARD
// BESIDE THE GARAGE DOOR, a dozen px off it, exactly as far as a man rolls a
// thing he built in there and no further — that closeness is the joke the blast
// pays off later, and a drive that parked the ship politely out on the lawn
// would quietly un-set it up.
//
// AND THE HOUSE IS WHOLE. Every burn on this lot is behind a `cleared:` tag
// (the moon, then Mars), and none of them has happened yet the only time this
// road is driven: the trip home from GOODCO is the leg that BRINGS the part
// back, and the first fire is lit the evening after it. There is no wear ladder
// here for the same reason there is no soot — nothing has been lit yet.
//
// WHAT IS IN HERE IS THE ARRANGEMENT AND NOTHING ELSE. Placing it, drawing it
// and asking where it starts are `sites.ts`, which does the identical job for
// GOODCO at the other end of the same road.

import { HOME_ART_SIZE } from "./homestead-parts.ts";
import type { SiteLayout, SitePiece } from "./sites.ts";

/** How big every piece is — the leaf table (`homestead-parts.ts`), re-exported
 * so nothing downstream has to know the generator forced it into a file of its
 * own. */
export { HOME_ART_SIZE } from "./homestead-parts.ts";

/**
 * The plot's own numbers — where each piece stands, in world px PAST THE FINISH
 * LINE along the direction of travel.
 *
 * THE HOUSE IS WHERE THE CAR STOPS, and that is not a coincidence: the wagon
 * crosses the line at whatever it crossed it at and coasts (`DRIVE.arrival`),
 * which brings it up in about eleven hundred px — so the frontage the beat is
 * about has to be at ELEVEN HUNDRED and not at three, or the hero gets out and
 * delivers his line about being home with his own house off the left-hand edge
 * of the screen.
 */
export const HOMESTEAD = {
  /** The fence along the front of the plot, opening before the line so the
   * town's last building and his boundary meet rather than leaving a gap. */
  fenceFromPx: -220,
  fenceToPx: 1720,
  /** The gap in it his drive comes out of — the finish line, as a picture. */
  gatePx: -120,
  /**
   * THE TREES ALONG THE LAWN, and there are four of them because the plot is
   * eighteen hundred px long and a screenful is four hundred.
   *
   * GOODCO fills the same distance with a staff lot, three halls and a launch
   * pad; a fence with a house at one end of it and nothing in between reads as a
   * field somebody has enclosed, and it reads that way for two full screens
   * before the house arrives. So the lawn is planted: a tree roughly every
   * screenful, so there is always something coming.
   */
  treesPx: [200, 460, 780, 1200] as const,
  housePx: 700,
  /**
   * …AND THE SHIP, standing hard beside the garage door — see the file header:
   * the closeness IS the staging, and the blast that blackens that side of the
   * house a night later is what it pays off.
   *
   * BESIDE THE GARAGE END, WHICH IS THE SMALLER `at`. The house sprite carries
   * its garage on the RIGHT, and this leg runs the other way down the world, so
   * "further along the site" is "further LEFT on the screen": the ship has to
   * sit a little SHORT of the house to end up beside the door rather than
   * outside the living-room window.
   */
  shipPx: 630,

  // ── HOW FAR BACK EACH THING STANDS (world px behind the far pavement) ──────
  // The y-sort IS the depth, exactly as it is on GOODCO's site: a smaller y is
  // drawn first and reads as further away, so this ladder is the order the eye
  // goes through the plot — the fence, the trees on the lawn, the house behind
  // them, the lean-to beside it and the ship standing over the lot.
  fenceSetbackPx: 4,
  lawnSetbackPx: 11,
  houseSetbackPx: 20,
  padSetbackPx: 23,
} as const;

/** Everything on the plot, in the order the car meets it. */
function pieces(): SitePiece[] {
  const out: SitePiece[] = [];
  const { fenceFromPx, fenceToPx, fenceSetbackPx } = HOMESTEAD;
  const bay = HOME_ART_SIZE.home_fence![0];
  for (let at = fenceFromPx; at < fenceToPx; at += bay) {
    // The gate is a HOLE in the fence rather than a thing hung in front of it,
    // so the bay it occupies is simply not built — the campus's own rule, and
    // the reason a drive can come out of it at all.
    const gateSpan = HOME_ART_SIZE.home_gate![0];
    if (Math.abs(at - HOMESTEAD.gatePx) < gateSpan) continue;
    out.push({ sprite: "home_fence", at, setback: fenceSetbackPx });
  }
  out.push({
    sprite: "home_gate",
    at: HOMESTEAD.gatePx,
    setback: fenceSetbackPx,
  });

  // THE SHIP FIRST, because it is the furthest back and the y-sort is the
  // depth: it stands over the roof rather than in front of it, which is the one
  // thing about this picture that has to be unambiguous.
  out.push({
    sprite: "home_ship",
    at: HOMESTEAD.shipPx,
    setback: HOMESTEAD.padSetbackPx,
  });
  out.push({
    sprite: "home_house",
    at: HOMESTEAD.housePx,
    setback: HOMESTEAD.houseSetbackPx,
  });
  // …and the trees on the lawn in front of all of it. They are in leaf and they
  // stay in leaf: nothing has been lit on this lawn yet.
  for (const at of HOMESTEAD.treesPx) {
    out.push({ sprite: "home_tree", at, setback: HOMESTEAD.lawnSetbackPx });
  }
  return out;
}

/**
 * HOME, as the road's own site.
 *
 * NOTHING IS PARKED ON IT, and the empty list is the point rather than an
 * omission: the only car this house has is the one the player has just driven
 * home in, and a staff lot's worth of other people's saloons is exactly what
 * this end of the road is NOT.
 */
export const HOME_SITE: SiteLayout = {
  id: "home",
  art: HOME_ART_SIZE,
  // Mown grass rather than poured concrete — the whole difference between the
  // two ends of this road, said in one band of colour behind the fence.
  ground: "lawn",
  fromPx: HOMESTEAD.fenceFromPx,
  toPx: HOMESTEAD.fenceToPx,
  // On his own drive with the house and the ship both AHEAD of him — the camera
  // carries most of its view forward (`CAMERA_LEAD_FRAC`), so what the beat is
  // about has to be in front of where the wagon stops. The frame HOME AT LAST.
  // AND THERE SHE IS. is written for.
  parkPx: 600,
  pieces: pieces(),
  vehicles: [],
};
