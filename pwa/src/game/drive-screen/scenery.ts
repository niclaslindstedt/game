// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE ROAD IS MADE OF — the sprite tables the drive draws from, and the
// kerbside lighting it reads off the sim.
//
// WHAT IS LEFT HERE IS THE BODIES AND THE LAMPS, and the two things that USED to
// be here both left for the same reason: a table in the app that has to agree
// with a table in the engine is a drift waiting to happen. The KERB went first —
// the lamp posts and the parked cars were derived here, and the sim knew nothing
// about any of it, so the wagon drove through a parked van at 120 mph. Furniture
// the player can hit is WORLD (`src/game/drive/street.ts`), and this file draws
// what the sim is holding.
//
// THE TOWN WENT SECOND, and it is worth saying why, because unlike the kerb it
// was never a lie: a building on the far verge really is behind the pavement,
// really cannot be reached, and really does not have to be simulated. What it
// could not stay was EIGHT PICTURES ON A FIXED PITCH. The town is now a catalog
// with a layout (`src/game/drive/town.ts`, `town-plan.ts`) and an assembly
// (`town-art.ts`) — buildings of their own widths and heights, dressed per site
// and worn by how far along the road to GOODCO they stand.
//
// HOUSES STAND ON THE FAR SIDE ONLY. Under the shipped projection the camera
// looks DOWN at the road, so anything below it in world y sits between the
// player and the tarmac — a row of houses there would frame the picture
// beautifully and hide the lane the crowd is walking into. So the far verge
// gets the town, and the near verge gets nothing taller than the kerb the
// engine already stands its furniture on.

import {
  isMastSlot,
  laneCenter,
  roadBandEdges,
  DRIVE,
  FLEET,
} from "@game/core";

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
 * THE GLUED — the eight postures the blockade is built from.
 *
 * ONE FRAME EACH, and that is the point of them rather than an economy. Every
 * other body on this road has a walk cycle because every other body on this road
 * is going somewhere; these people sat down, put their hands in the resin, and
 * are not going to move again. A formation that breathed would undo the one
 * thing the set piece is: from a screen away it is the only perfectly still
 * thing on a road where everything drifts, which is what makes it read as a
 * DECISION rather than as more crowd.
 *
 * The variety is in the POSTURE, for the same reason the walkers' is in their
 * silhouettes: cross-legged, palms down, kneeling, on their back, face down, a
 * board on a stick, both arms up, and one hunched in a hood who has plainly been
 * out here for hours. Sitting and lying tell each other apart across four lanes
 * at speed; two different jackets do not.
 *
 * The order is `DrivePedestrian.variant`'s for a body of `kind: "glued"`, and
 * its length must match the engine's `GLUED_VARIANTS`
 * (src/game/drive/blockade.ts).
 */
export const GLUED_SPRITES: readonly string[] = [
  "glued_cross_legged",
  "glued_hands_down",
  "glued_kneeling",
  "glued_on_back",
  "glued_face_down",
  "glued_placard",
  "glued_arms_up",
  "glued_slumped",
];

/**
 * THE TRAFFIC — every vehicle on the road, in the order `DriveTraffic.variant`
 * indexes them. The same table dresses the GOODCO car park, which is why they
 * live in the `earth` family rather than under the road: they are the town's
 * vehicles, and the town is where GOODCO's staff park.
 *
 * READ OFF THE ENGINE'S OWN FLEET rather than restated here, and that is the
 * one thing about this table worth saying out loud. It used to be a hand-kept
 * list in the same order as a hand-kept list in the engine, with a test holding
 * the two at the same LENGTH — which catches somebody adding a car and forgetting
 * the sprite, and cheerfully misses somebody REORDERING one, at which point
 * every van on the road weighs what a scooter does and nothing fails. The def
 * carries its own sprite stem (`DriveVehicleDef.id`), so there is now one list
 * and no order to keep.
 */
export const TRAFFIC_SPRITES: readonly string[] = FLEET.map((def) => def.id);

/**
 * THE PEOPLE ON THE TWO-WHEELERS — in the order `DriveVehicleDef.rider` indexes
 * them, and the order a `PedestrianKind` of `"rider"` wears.
 *
 * THEY ARE THEIR OWN TABLE AND NOT PART OF THE CROWD, for a reason that is
 * mechanical rather than tidy: a rider is drawn SEATED, and the crowd's art is
 * all drawn walking. A thrown rider has to be cut in half out of the picture the
 * player was actually looking at a moment ago (`slicedPiece`), so the seated
 * body is the one the road has to be holding.
 *
 * One frame each. Everything else on this road that is alive walks; these
 * people are carried, and a walk cycle on somebody sitting on a moped is the
 * kind of wrong that is hard to name and impossible to unsee.
 */
export const RIDER_SPRITES: readonly string[] = [
  "rider_biker",
  "rider_commuter",
  "rider_courier",
  "rider_delivery",
  "rider_cyclist",
  "rider_skater",
];

/**
 * THE DRIVERS — the people behind windscreens, and a table of their own.
 *
 * THE RIDERS USED TO ANSWER FOR THEM, on the argument that somebody who has
 * just left a driving seat looks like somebody sitting down. True of the
 * posture and false of everything else: it put crash helmets and hot-box
 * jackets in the front of saloons, and it meant the biggest sight this road can
 * produce — a head-on posting the driver's upper half out through the glass —
 * threw one of TWO pictures, because only two of the six riders read as
 * ordinary people in coats.
 *
 * FIVE, AND THEY DIFFER WHERE THE CUT LEAVES THEM DIFFERING. The bumper catches
 * a body between three tenths and six tenths of the way down
 * (`DRIVE.gore.cutBand`), so the half that flies is head, shoulders and
 * seatbelt: a bald ruddy head over a black leather shoulder, a red flat-brim
 * cap, white hair pinned up, a dark beanie over a hi-vis collar, a brown head
 * over a pale blue shirt. Below the waist they are near enough the same person,
 * because below the waist nobody ever sees them.
 *
 * Keep this in step with the engine's `DRIVER_VARIANTS`, which is what a car's
 * occupant is rolled against.
 */
export const DRIVER_SPRITES: readonly string[] = [
  "driver_shirt",
  "driver_tracksuit",
  "driver_cardigan",
  "driver_hi_vis",
  "driver_leather",
];

/**
 * WHERE A RIDER SITS ON WHAT THEY ARE RIDING — px right of the machine's own
 * centre, and px up off the road.
 *
 * Per MACHINE rather than per rider, because the saddle is the machine's: a
 * scooter's rider sits further back and higher than a motorcyclist does, and
 * the same person moved between the two would be standing on the engine of one
 * and floating over the tail of the other.
 */
export const RIDER_SEATS: Readonly<Record<string, { dx: number; dy: number }>> =
  {
    traffic_motorcycle: { dx: 4, dy: 3 },
    traffic_scooter: { dx: 2, dy: 4 },
    // The two delivery machines carry a box where a pillion would be, so their
    // riders sit further FORWARD than anybody else's — seated over the saddle
    // they are simply behind the crate and invisible, which is the one way to
    // draw a rider that is worse than not drawing one.
    traffic_ebike: { dx: 6, dy: 5 },
    traffic_delivery_moped: { dx: 5, dy: 4 },
    traffic_bicycle: { dx: 3, dy: 5 },
    // A skater STANDS ON the deck rather than sitting in it, so the seat is
    // barely off the road — and the board is the one machine here whose rider
    // is most of the silhouette.
    traffic_skateboard: { dx: 1, dy: 1 },
  };

/** The damage rungs a vehicle's art climbs as it is battered, derived at build
 * time from its clean grid (`scripts/asset-tools/wreck.mjs`). Index 0 is the
 * undamaged sprite, so this is read with `DriveTraffic.rung` directly. */
const WRECK_SUFFIX = ["", "_dent1", "_dent2", "_dent3"];

/** Which picture a vehicle is wearing right now. */
export function trafficSprite(variant: number, rung: number): string {
  const base = TRAFFIC_SPRITES[variant % TRAFFIC_SPRITES.length] ?? "";
  const suffix =
    WRECK_SUFFIX[Math.max(0, Math.min(WRECK_SUFFIX.length - 1, rung))] ?? "";
  return `${base}${suffix}`;
}

/** THE KERB'S own furniture is no longer here — it is the engine's, because it
 * is collidable (`DRIVE.street`, src/game/drive/street.ts). The renderer reads
 * `DriveState.props` for it and names the one sprite a lamp post wears; the
 * parked cars wear `TRAFFIC_SPRITES` above, since they are the town's cars
 * parked rather than a second set of art. */
export const LAMP_SPRITE = "lamp_post";

/**
 * THE STREET LIGHTING — which of the kerb's lamp posts is a TALL MAST.
 *
 * IT IS NOT A SECOND ROW OF FURNITURE, and that is the whole design. Street
 * lights belong at the kerb, and the kerb is inside the band the wagon can
 * reach (`roadEdges`) — so a mast drawn there and simulated nowhere is exactly
 * the lie this road already learned not to tell: the player hits it once,
 * learns the street is paint, and stops reading the kerb at all. The engine
 * already stands a collidable post at every kerb slot (`src/game/drive/
 * street.ts`), on both sides, offset half a pitch. So every third one of those
 * is simply DRAWN as a mast instead of as a yard light, and it collides,
 * shears off its base and cartwheels down the road exactly as it always did.
 * Nothing about the simulation changes; the column is the same column.
 *
 * The slot is recovered from the post's own x, because a `DriveProp` carries no
 * slot number — and it is a pure function of position, so the masts land on the
 * same stretches of road every run and on the way home as on the way out.
 *
 * A MAST SLOT IS THE ALIGNED ONE, which is what makes the recovery work at all:
 * the sim drops the far row's usual half-pitch offset there so the two masts
 * face each other across the carriageway (`street.ts`), so a post sitting
 * exactly on a slot boundary is a mast on EITHER row, and one sitting half a
 * pitch along is a yard light on the far one.
 */
/** How far across the pool of light reaches (world px). Centred on the lamp's
 * own outermost lane, it covers that lane and most of the one beside it. */
export const ROAD_LAMP_POOL_PX = 32;

/**
 * How far up the mast the lens burns (world px off the base) — read off the
 * sprite, and the apex its cone is thrown from.
 *
 * IT HAS TO CLEAR ITS OWN POOL ON SCREEN, which is why these masts are as tall
 * as they are. A billboard stands at full size while the GROUND foreshortens,
 * so a lamp lighting the tarmac 17 px across the road throws its light only 13
 * screen px — and the near row, whose light lands UP the screen from its own
 * feet, had a head sitting below the patch it was supposed to be lighting. The
 * cone came out as a sliver pointing the wrong way. Height is the whole fix.
 */
export const ROAD_LAMP_HEAD_PX = 46;

/**
 * THE TWO PICTURES OF ONE MAST. The far row throws its light TOWARD the eye, so
 * you look up into a burning lens; the near row throws it away, so what shows
 * is the back of the cowl. Not a mirror of one sprite — a mirrored head would
 * put a lens on a lamp that is pointing away, which a night scene reads as
 * wrong immediately.
 */
export const ROAD_LAMP_SPRITE = "road_lamp";
export const ROAD_LAMP_NEAR_SPRITE = "road_lamp_near";

/**
 * WHERE THE LENS IS on whichever lamp stands here (world px off the base) — the
 * height its glass comes out of when a car takes the post off its foot.
 *
 * The little yard light carries its lens near the top of a 15-px post; a mast
 * carries it up a storey. One number for both would put a handful of glass
 * hanging in the air beside a yard light, or dropping out of the middle of a
 * mast's column.
 */
export function lampHeadLift(pos: { x: number; y: number }): number {
  return mastAt(pos) ? ROAD_LAMP_HEAD_PX : 12;
}

/**
 * HOW MUCH OF THE COLUMN STAYS BOLTED DOWN (sprite rows).
 *
 * A slip-base light shears LOW — that is the whole point of the base — so what
 * is left is a stump rather than half a post. Four rows reads as a break at
 * ground level on the yard light and on the mast alike, which is what makes the
 * two pieces obviously one broken column instead of two objects.
 */
export const LAMP_STUB_PX = 4;

/**
 * Is this kerb post one of the tall ones — and if so, what does it light?
 *
 * `null` for the yard lights, which is most of them. The pool goes on the
 * lamp's OWN OUTERMOST LANE (lane 0 for the far row, the last lane for the
 * near one), so the two rows between them light the two edges of the road
 * rather than both crowding the centre line.
 */
export function mastAt(pos: {
  x: number;
  y: number;
}): { poolY: number; sprite: string } | null {
  const { pitchPx } = DRIVE.street;
  const slot = Math.round(pos.x / pitchPx);
  // Half a pitch off a boundary is the far row's ordinary interleaved yard
  // light, never a mast.
  if (Math.abs(pos.x - slot * pitchPx) > 1) return null;
  if (!isMastSlot(slot)) return null;
  const far = pos.y < 0;
  return {
    poolY: laneCenter(far ? 0 : DRIVE.laneCount - 1),
    sprite: far ? ROAD_LAMP_SPRITE : ROAD_LAMP_NEAR_SPRITE,
  };
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
