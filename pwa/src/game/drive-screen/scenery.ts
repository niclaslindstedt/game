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

import { DRIVE, roadEdges } from "@game/core";

/**
 * THE CROWD's bodies — the people the welfare did not reach.
 *
 * Reused from the goodco roster rather than drawn fresh, which is a deliberate
 * and reversible call: at the size a pedestrian is actually seen (a 16-px body
 * a screen away, for the half-second before it goes under the bumper) what
 * reads is the silhouette and the walk, and these four already have both. The
 * table is a named module for exactly this reason — dedicated art for the road
 * is one edit here and nothing else.
 */
export const CROWD_SPRITES: readonly (readonly [string, string])[] = [
  ["stampede_a_0", "stampede_a_1"],
  ["stampede_b_0", "stampede_b_1"],
  ["stampede_c_0", "stampede_c_1"],
  ["wandering_tourist_0", "wandering_tourist_1"],
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
/** …and how far back off the road's far edge they are set. */
const HOUSE_SETBACK = 30;
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
  const edges = roadEdges();
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
      // A little jitter in the setback so the frontages are not one flat wall —
      // a real street steps in and out by a doorway's depth.
      y: edges.top - HOUSE_SETBACK - Math.round(hash(i * 7 + 1) * 6),
    });
  }
  const kerbFirst = Math.floor(fromX / KERB_PITCH) - 1;
  const kerbLast = Math.ceil(toX / KERB_PITCH) + 1;
  for (let i = kerbFirst; i <= kerbLast; i++) {
    const roll = hash(i * 31 + 5);
    // Two thirds lamp posts, one third somebody's car left at the kerb — which
    // also quietly tells the player that a car CAN be at the roadside and not
    // be traffic he has to dodge.
    const sprite =
      roll < 0.66
        ? "lamp_post"
        : (TRAFFIC_SPRITES[
            Math.floor(hash(i * 13 + 3) * TRAFFIC_SPRITES.length)
          ] ?? "lamp_post");
    props.push({
      sprite,
      x: i * KERB_PITCH,
      y: edges.bottom + 16 + Math.round(hash(i * 17 + 9) * 5),
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
