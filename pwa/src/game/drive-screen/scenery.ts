// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE ROAD IS MADE OF — the sprite tables the drive draws from, and the
// deterministic street it dresses itself with.
//
// WHAT IS LEFT HERE IS THE BACKDROP, and the split is deliberate. The KERB —
// the lamp posts and the cars parked along it — used to be derived here too,
// and that made it a lie: the sim knew nothing about any of it, so the wagon
// drove through a parked van at 120 mph and the posts were paint. Furniture the
// player can hit is WORLD, so it moved into the engine (`src/game/drive/
// street.ts`) and this file draws what the sim is holding. The TOWN stayed,
// because a house on the far verge is scenery in the honest sense: it is behind
// the pavement, nothing can reach it, and nothing about it has to be simulated.
//
// THE BACKDROP IS STILL DERIVED, NOT SPAWNED. Every building is a pure function
// of the distance it stands at, so it costs the drive no state, no rng draw and
// no spawner — and the same road looks the same on a restart, which matters
// more than it sounds: the player is re-driving a stretch he just died on, and a
// backdrop that reshuffled would make it read as a different road.
//
// HOUSES STAND ON THE FAR SIDE ONLY. Under the shipped projection the camera
// looks DOWN at the road, so anything below it in world y sits between the
// player and the tarmac — a row of houses there would frame the picture
// beautifully and hide the lane the crowd is walking into. So the far verge
// gets the town, and the near verge gets nothing taller than the kerb the
// engine already stands its furniture on.

import { crowdEdges, roadBandEdges, DRIVE } from "@game/core";

/**
 * THE CROWD's bodies — the twenty people the welfare did not reach.
 *
 * WHY TWENTY AND WHY THESE. A road the player is meant to feel bad about
 * driving down cannot be four office workers on repeat: at the density this
 * minigame runs, a short roster reads as one man cloned across a mile of
 * tarmac, and a clone is a texture rather than a person. So the roster is
 * twenty, and it varies along the axis that actually reads at 16 px — the
 * SILHOUETTE. A bicycle, a wheelchair, a walking frame, a pram, a shopping
 * trolley, a long coat and a child are told apart across four lanes at speed;
 * two jackets in different blues are not.
 *
 * It is also the only place in the feature that argues with the joke, on
 * purpose. The hero never acknowledges a single one of them — so the crowd has
 * to do all of the acknowledging itself, and an old man behind a walking frame
 * or a woman pushing a pram is the moment the bit stops being comfortable.
 *
 * The order is `DrivePedestrian.variant`'s, and its length must match the
 * engine's `CROWD_VARIANTS` (src/game/drive/crowd.ts).
 */
export const CROWD_SPRITES: readonly (readonly [string, string])[] = [
  ["walker_old_man_0", "walker_old_man_1"],
  ["walker_old_woman_0", "walker_old_woman_1"],
  ["walker_hoodie_0", "walker_hoodie_1"],
  ["walker_young_woman_0", "walker_young_woman_1"],
  ["walker_boy_0", "walker_boy_1"],
  ["walker_girl_0", "walker_girl_1"],
  ["walker_suit_0", "walker_suit_1"],
  ["walker_hi_vis_0", "walker_hi_vis_1"],
  ["walker_trolley_0", "walker_trolley_1"],
  ["walker_pram_0", "walker_pram_1"],
  ["walker_dog_0", "walker_dog_1"],
  ["walker_crutches_0", "walker_crutches_1"],
  ["walker_frame_0", "walker_frame_1"],
  ["walker_skater_0", "walker_skater_1"],
  ["walker_long_coat_0", "walker_long_coat_1"],
  ["walker_mohawk_0", "walker_mohawk_1"],
  ["walker_bagman_0", "walker_bagman_1"],
  ["walker_headphones_0", "walker_headphones_1"],
  ["walker_cyclist_0", "walker_cyclist_1"],
  ["walker_wheelchair_0", "walker_wheelchair_1"],
];
/** How fast a walking body cycles its two frames (ms). */
export const CROWD_FRAME_MS = 220;

/**
 * THE TRAFFIC — ten cars, in the order `DriveTraffic.variant` indexes them.
 * The same table dresses the GOODCO car park, which is why they live in the
 * `earth` family rather than under the road: they are the town's cars, and the
 * town is where GOODCO's staff park.
 */
export const TRAFFIC_SPRITES: readonly string[] = [
  "traffic_sedan",
  "traffic_sports",
  "traffic_suv",
  "traffic_hatch",
  "traffic_electric",
  "traffic_police",
  "traffic_van",
  "traffic_pickup",
  "traffic_taxi",
  "traffic_bus",
];

/** THE TOWN — the buildings lining the far verge, authored already cropped. */
export const HOUSE_SPRITES: readonly string[] = [
  "town_house_clapboard",
  "town_house_brick",
  "town_apartment_block",
  "town_shop_shuttered",
  "town_laundromat",
  "town_row_house",
  "town_motel",
  "town_gas_station",
];

/** THE KERB'S own furniture is no longer here — it is the engine's, because it
 * is collidable (`DRIVE.street`, src/game/drive/street.ts). The renderer reads
 * `DriveState.props` for it and names the one sprite a lamp post wears; the
 * parked cars wear `TRAFFIC_SPRITES` above, since they are the town's cars
 * parked rather than a second set of art. */
export const LAMP_SPRITE = "lamp_post";

/** How far apart the buildings stand (world px) — they are 40 wide, so this
 * leaves a gap of alley between them rather than a solid wall. */
const HOUSE_PITCH = 52;
/**
 * …and how far back the frontages stand from the FAR PAVEMENT's outer edge.
 *
 * TWO RULES, BOTH LEARNED BY LOOKING. The town stands CLOSE — set back the
 * thirty pixels it opened with, it read as a village on the horizon rather than
 * a street the hero is driving down, and the whole top third of the frame was
 * empty verge. And it stands CLEAR: measured off the pavement's edge rather
 * than the road's, so no frontage is ever drawn over the pavement people are
 * walking on.
 *
 * The setback carries NO jitter, which is the other half of it. A doorway's
 * depth of variation sounded like realism and drew a ragged saw of a frontage
 * line; a real street's buildings share one building line, and at this size the
 * shared line is what makes the row read as a street at all.
 */
const HOUSE_SETBACK = 11;

/** One piece of standing scenery. */
export type SceneryProp = {
  sprite: string;
  x: number;
  y: number;
};

/**
 * A HASH, NOT A DRAW. Every prop's identity comes from its own position, so the
 * street is reproducible without holding a single byte of state — and, unlike an
 * rng, a prop can be asked about out of order, which is what lets the renderer
 * populate only the stretch actually on screen.
 */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The buildings standing between `fromX` and `toX`, along the far verge. */
export function sceneryBetween(fromX: number, toX: number): SceneryProp[] {
  const walk = crowdEdges();
  const props: SceneryProp[] = [];
  const first = Math.floor(fromX / HOUSE_PITCH) - 1;
  const last = Math.ceil(toX / HOUSE_PITCH) + 1;
  for (let i = first; i <= last; i++) {
    const roll = hash(i);
    const sprite = HOUSE_SPRITES[Math.floor(roll * HOUSE_SPRITES.length)];
    if (!sprite) continue;
    props.push({
      sprite,
      x: i * HOUSE_PITCH,
      y: walk.top - HOUSE_SETBACK,
    });
  }
  return props;
}

/** The tarmac's own edges — the engine's (`roadBandEdges`, because the kerb's
 * furniture is measured off the same line) — plus where each lane's dividing
 * line runs, which only the paint cares about. */
export function roadBands(): { top: number; bottom: number; lanes: number[] } {
  const { top, bottom } = roadBandEdges();
  const lanes: number[] = [];
  for (let i = 1; i < DRIVE.laneCount; i++) {
    lanes.push(top + i * DRIVE.laneWidth);
  }
  return { top, bottom, lanes };
}
