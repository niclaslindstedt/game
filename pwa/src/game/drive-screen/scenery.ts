// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE ROAD IS MADE OF — the sprite tables the drive draws from, and the
// deterministic street it dresses itself with.
//
// THE STREET IS DERIVED, NOT SPAWNED. Every building, lamp post and parked car
// is a pure function of the distance it stands at, so the scenery costs the
// drive no state, no rng draw and no spawner — and the same road looks the same
// on a restart, which matters more than it sounds: the player is re-driving a
// stretch he just died on, and a backdrop that reshuffled would make it read as
// a different road.
//
// HOUSES STAND ON THE FAR SIDE ONLY. Under the shipped projection the camera
// looks DOWN at the road, so anything below it in world y sits between the
// player and the tarmac — a row of houses there would frame the picture
// beautifully and hide the lane the crowd is walking into. So the far verge
// gets the town and the near verge gets a kerb, a lamp post and the occasional
// car left at the roadside: enough to close the picture in, nothing that can
// swallow a pedestrian.

import { crowdEdges, DRIVE } from "@game/core";

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
/** The near verge's furniture pitch — sparser, because it is in front of the
 * player and everything here costs him a view of the road. */
const KERB_PITCH = 104;

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

/**
 * The buildings and kerbside furniture standing between `fromX` and `toX`.
 *
 * Returned back-to-front (far verge first), which is the order they have to be
 * painted in: the town is behind everything, the kerb is in front of the road
 * but behind the traffic on it.
 */
export function sceneryBetween(fromX: number, toX: number): SceneryProp[] {
  const bands = roadBands();
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
  // THE FAR PAVEMENT gets lamp posts of its own, between the town and the
  // kerb — a street lit from one side only reads as a road with a film set
  // along it. Offset half a pitch from the near side's so the two rows
  // interleave rather than marching in pairs.
  const lampFirst = Math.floor(fromX / KERB_PITCH) - 1;
  const lampLast = Math.ceil(toX / KERB_PITCH) + 1;
  for (let i = lampFirst; i <= lampLast; i++) {
    props.push({
      sprite: "lamp_post",
      x: i * KERB_PITCH + KERB_PITCH / 2,
      y: bands.top - 4,
    });
  }
  const kerbFirst = Math.floor(fromX / KERB_PITCH) - 1;
  const kerbLast = Math.ceil(toX / KERB_PITCH) + 1;
  for (let i = kerbFirst; i <= kerbLast; i++) {
    const roll = hash(i * 31 + 5);
    // MOSTLY EMPTY KERB, and one car in six. A third of the kerb slots being
    // parked cars put one in the frame at all times, and a car in the picture
    // is read as TRAFFIC however far off the tarmac it is standing — the
    // player brakes for scenery. Rare enough to be a detail, not a hazard.
    const sprite =
      roll < 0.84
        ? "lamp_post"
        : (TRAFFIC_SPRITES[
            Math.floor(hash(i * 13 + 3) * TRAFFIC_SPRITES.length)
          ] ?? "lamp_post");
    props.push({
      sprite,
      x: i * KERB_PITCH,
      // Standing ON the near pavement — kerbside furniture belongs on the
      // pavement, not out in the grass behind it.
      y: bands.bottom + 4,
    });
  }
  return props;
}

/** The tarmac's own edges, plus where each lane's dividing line runs. */
export function roadBands(): { top: number; bottom: number; lanes: number[] } {
  const half = (DRIVE.laneCount * DRIVE.laneWidth) / 2;
  const lanes: number[] = [];
  for (let i = 1; i < DRIVE.laneCount; i++) {
    lanes.push(-half + i * DRIVE.laneWidth);
  }
  return { top: -half, bottom: half, lanes };
}
