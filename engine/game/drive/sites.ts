// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT IS AT THE END OF THE ROAD — the SITE the leg pulls into, whichever leg
// it is.
//
// THE FINISH LINE IS NOT THE ARRIVAL, and the stretch between the two is this
// file's whole subject. The clock stops and the town stops at the same world x;
// then the wheel comes off the player and the car rolls in past somebody's
// boundary, past whatever they have out there, and stops. The hero says which
// of it he has noticed, gets out, and the picture goes.
//
// IT USED TO BE ONE PLACE AND IT IS TWO NOW, which is the reason this seam
// exists rather than a `campus.ts` with an `if` in it. The road runs both ways
// (`DriveDirection`): out to GOODCO, and home again to the garage. Those are
// the same road and the same run-in beats, and they are completely different
// PICTURES — three windowless halls with a launch stack behind a palisade, and
// a bungalow with a home-made rocket on the back lawn. So the run-in's DRESSING
// is data, the placement is here, and a third destination is one more layout
// table and one more line in `DRIVE_SITES`.
//
// WHAT A LAYOUT IS. A flat list of pieces, each at a distance PAST THE FINISH
// along the direction of travel, at a setback behind the far pavement. Written
// as a sequence on purpose: the arrangement IS the design, and anybody retuning
// one should be able to read it in the order the car meets it, which a nest of
// loops is not.
//
// IT SHARES THE TOWN'S OUTPUT SHAPE (`TownProp`) AND NOTHING ELSE, which is the
// whole reason a site can exist without touching the renderer: a planned piece
// of scenery is a key, a base, a size and a stack of sprites, and the app
// already knows how to compose and blit one of those (`drawTownProp`).
//
// NOT ONE `state.rng()` DRAW, like everything else on this tarmac. A site is
// FIXED — it is the last thing the minigame shows and the first thing the next
// level is standing in, so it has to read the same way every single time. A
// company's own site is not procedural, and neither is a man's front garden.

// The two layouts, each in its own file for the reason `campus-parts.ts` is in
// its own file: they are long, they are read as sequences, and one of them is
// enough to have in front of you at a time.
import { GOODCO_SITE } from "./campus.ts";
import { courseLength } from "./config.ts";
import { crowdEdges } from "./crowd.ts";
import { HOME_SITE } from "./homestead.ts";
import type { TownProp, TownRoad } from "./town-plan.ts";

/** Every place the road can end at. */
export type DriveSiteId = "goodco" | "home";

/**
 * WHAT THE GROUND BEHIND THE BOUNDARY IS, as a name rather than a colour — the
 * engine has no palette and never has had one. The app maps it
 * (`drive-screen/render.ts`); what belongs here is the FACT that GOODCO's
 * frontage is poured concrete to the skyline and the hero's is mown grass,
 * because that is a property of the place rather than of the picture.
 */
export type SiteGround = "apron" | "lawn";

/** One thing standing on a site. `at` is world px PAST THE FINISH along the
 * direction of travel; `setback` is world px behind the far pavement, and the
 * y-sort makes it the depth. */
export type SitePiece = {
  sprite: string;
  at: number;
  setback: number;
};

/**
 * ONE PLACE, WRITTEN DOWN.
 *
 * `art` is the site's own size table, and it is not decoration: the layout
 * places every piece against it, so a picture a pixel wider than its entry does
 * not look slightly wrong — it lands somewhere it was not put. The generator
 * that RULES these pictures imports the same table, which is what makes that
 * impossible rather than unlikely.
 */
export type SiteLayout = {
  id: DriveSiteId;
  art: Readonly<Record<string, readonly [number, number]>>;
  ground: SiteGround;
  /** How far the boundary runs, px past the finish. It opens BEFORE the line so
   * the town's last building and the site's edge meet rather than leaving a gap
   * of nothing. */
  fromPx: number;
  toPx: number;
  /**
   * WHERE THE CAR PULLS UP (px past the finish) — the spot the whole run-in is
   * framed around.
   *
   * IT IS AIMED AT RATHER THAN COASTED TO, and that is the difference between a
   * beat and a coincidence. The wagon crosses the line at whatever the player
   * left it at — anything from a crawl to a hundred and seventy — and a fixed
   * deceleration turns that into a parking spot anywhere across eight hundred
   * pixels of site. Which means the thing the hero then gets out and talks
   * about is off the side of the screen about half the time: he says HOME AT
   * LAST beside a stretch of fence, or THERE'S GOODCO with the halls behind
   * him. So the coast BRAKES HARDER when it has to (`DRIVE.arrival.coastPx` is
   * the floor, never the whole answer) and the car comes to rest here.
   *
   * A slow enough arrival still stops short — there is no accelerating on a
   * run-in, and a man who crawled over the line has earned a longer walk. Which
   * is why the frontage either side of this mark still has to be worth looking
   * at.
   */
  parkPx: number;
  /** Everything with a size, in the order the car meets it. */
  pieces: readonly SitePiece[];
  /**
   * …AND EVERY VEHICLE PARKED ON IT, which is a separate list because it is
   * drawn a separate way.
   *
   * A planned piece of scenery carries its own SIZE, because the app composes it
   * onto a canvas of exactly that size before it blits — which works for a fence
   * and a hall, whose sizes are the engine's own table. A car is not the
   * engine's: it is one of the fleet's sprites, whose grid is authored under
   * `content/sprites/` and whose dimensions nothing in here knows. Giving the
   * planner a guess would clip somebody's van; naming the sprite and letting the
   * renderer's ordinary blit find it in the atlas cannot.
   */
  vehicles: readonly SitePiece[];
};

/** One of a site's parked vehicles, placed. */
export type SiteVehicle = { sprite: string; x: number; y: number };

/** Every site the road knows, by id. A third destination is one entry here and
 * one layout table beside it. */
export const DRIVE_SITES: Readonly<Record<DriveSiteId, SiteLayout>> = {
  goodco: GOODCO_SITE,
  home: HOME_SITE,
};

/**
 * WHICH SITE A LEG ENDS AT, off the level it is bound for (`DriveParams.to`).
 *
 * The map is deliberately over LEVEL IDS rather than over directions: what a
 * player drives into is a property of where they are going, and a leg is only
 * ever built for a destination the road has one of (`legDirection` refuses the
 * rest), so the fallback below is a belt on a fastened belt.
 */
const SITE_FOR_LEVEL: Readonly<Record<string, DriveSiteId>> = {
  goodco_hq: "goodco",
  garage: "home",
};

/** The site at the end of this leg. */
export function driveSite(to: string): SiteLayout {
  return DRIVE_SITES[SITE_FOR_LEVEL[to] ?? "goodco"];
}

/**
 * EVERY PIECE OF A SITE BETWEEN TWO WORLD X, ready to be composed and blitted —
 * the site's answer to `planTown`, and read by the same pass.
 *
 * Each piece is its own one-layer stack rather than a composed assembly, because
 * unlike a house there is nothing here to dress: a fence bay is a fence bay. The
 * `key` is still the sprite's own name, so the app's compositor caches one
 * canvas per KIND and a hundred and forty fence bays cost one.
 */
export function planSite(
  fromX: number,
  toX: number,
  road: TownRoad,
  site: SiteLayout,
): TownProp[] {
  const walk = crowdEdges();
  const finishX = road.direction * courseLength(road);
  const out: TownProp[] = [];
  for (const piece of site.pieces) {
    const size = site.art[piece.sprite];
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

/** …and the vehicles standing on it, as bare placements — see
 * `SiteLayout.vehicles` for why they are not planned pieces. */
export function siteVehicles(
  fromX: number,
  toX: number,
  road: TownRoad,
  site: SiteLayout,
): SiteVehicle[] {
  const walk = crowdEdges();
  const finishX = road.direction * courseLength(road);
  const out: SiteVehicle[] = [];
  for (const piece of site.vehicles) {
    const x = finishX + road.direction * piece.at;
    if (x < fromX || x > toX) continue;
    out.push({ sprite: piece.sprite, x, y: walk.top - piece.setback });
  }
  return out;
}

/**
 * WHERE A SITE STARTS AND STOPS IN WORLD X — what a renderer needs to know
 * before it asks for any of it, and what tells the ground pass where the site's
 * own surface replaces the verge.
 *
 * Derived from the boundary rather than from the finish line, because the fence
 * is what a player actually reads as the edge of the place.
 */
export function siteSpanX(
  road: TownRoad,
  site: SiteLayout,
): { fromX: number; toX: number } {
  const finishX = road.direction * courseLength(road);
  const a = finishX + road.direction * site.fromPx;
  const b = finishX + road.direction * site.toPx;
  return { fromX: Math.min(a, b), toX: Math.max(a, b) };
}

/** How far past the town's own end a site reaches — the run-in's length, and
 * what `DRIVE.arrival` is timed to cover. Exported for the tests, which hold the
 * two against each other rather than trusting a comment. */
export function siteRunInPx(site: SiteLayout): number {
  return site.toPx;
}
