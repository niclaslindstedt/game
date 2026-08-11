// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE ROAD IS MADE OF — the sprite tables the drive draws from, and the
// kerbside lighting it reads off the sim.
//
// WHAT IS LEFT HERE IS THE BODIES AND THE LAMPS, and the two things that USED to
// be here both left for the same reason: a table in the app that has to agree
// with a table in the engine is a drift waiting to happen. The KERB went first —
// the lamp posts and the parked cars were derived here, and the sim knew nothing
// about any of it, so the wagon drove through a parked van at 120 mph. Furniture
// the player can hit is WORLD (`engine/game/drive/street.ts`), and this file draws
// what the sim is holding.
//
// THE TOWN WENT SECOND, and it is worth saying why, because unlike the kerb it
// was never a lie: a building on the far verge really is behind the pavement,
// really cannot be reached, and really does not have to be simulated. What it
// could not stay was EIGHT PICTURES ON A FIXED PITCH. The town is now a catalog
// with a layout (`engine/game/drive/town.ts`, `town-plan.ts`) and an assembly
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
  type DriveVehicleDef,
} from "@game/core";

import type { LightBody } from "../render/vehicles.ts";

/**
 * WHAT THE ROAD IS PAINTED IN — the four inks the carriageway is made of, and
 * the ONE place the county's tarmac is a colour.
 *
 * IT IS HERE RATHER THAN IN `render.ts` BECAUSE THE ROAD IS DRAWN TWICE. The
 * minigame paints it as flat fills through the world projection; the garage
 * cutscenes lay it across the front of the lot as authored ground art
 * (`content/sprites/scenes/road_lane.yaml`) — and it is THE SAME ROAD, the one
 * the wagon leaves the drive by thirty seconds later. Two sets of greys for one
 * stretch of tarmac is a drift nobody notices until the two are on screen
 * within a minute of each other, which is exactly what the homecoming and the
 * road to GOODCO are. `tests/content/road_ink_test.ts` holds the tile to this
 * table; a sprite cannot import a constant, so the test is the seam.
 */
export const ROAD_INK = {
  /** The tarmac itself. */
  road: "#31333c",
  /** …and its darker rim, the gutter the paint stops short of. */
  edge: "#3c3f4a",
  /** The kerb that steps up off it onto the footway. */
  kerb: "#605c53",
  /** Traffic white, as this game's night actually renders it. */
  paint: "#c9c4a8",
} as const;

/**
 * THE CENTRE LINE'S BROKEN RHYTHM out of town, in world px — `on` painted,
 * `off` blank. A two-lane road's centre marks are stubbier and closer together
 * than a lane divider's, and at this size that difference is the whole of what
 * tells the two apart.
 *
 * The cutscene tile paints the same rhythm at the same size, rounded to a
 * cycle its own width is a whole multiple of, so a row of tiles comes out as
 * one evenly broken line rather than as a line with a stutter every 56 px.
 */
export const CENTRE_DASH = { on: 12, off: 14 } as const;

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
 * engine's `CROWD_VARIANTS` (engine/game/drive/crowd.ts).
 */
export const CROWD_SPRITES: readonly (readonly [string, string])[] = [
  ["walker_old_man_0", "walker_old_man_1"],
  ["walker_old_woman_0", "walker_old_woman_1"],
  ["walker_hoodie_0", "walker_hoodie_1"],
  ["walker_young_woman_0", "walker_young_woman_1"],
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
 * (engine/game/drive/blockade.ts).
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
    // `dy: 7` on everything with a saddle is not a coincidence and not a
    // shortcut: a saddle is about 0.8 m off the road, this road runs at nine px
    // to the metre, and the machines are drawn to that scale — so seven px is
    // where every saddle on it is. A machine that needed its own number would
    // be a machine drawn at its own scale.
    traffic_motorcycle: { dx: -1, dy: 7 },
    traffic_scooter: { dx: -1, dy: 7 },
    // The two delivery machines carry a box where a pillion would be, so their
    // riders sit further FORWARD than anybody else's — seated over the saddle
    // they are simply behind the crate and invisible, which is the one way to
    // draw a rider that is worse than not drawing one.
    traffic_ebike: { dx: 1, dy: 7 },
    traffic_delivery_moped: { dx: 1, dy: 7 },
    traffic_bicycle: { dx: 0, dy: 5 },
    // A skater STANDS ON the deck rather than sitting in it, so the seat is
    // barely off the road — and the board is the one machine here whose rider
    // is most of the silhouette.
    traffic_skateboard: { dx: 0, dy: 4 },
  };

/** The damage rungs a vehicle's art climbs as it is battered, derived at build
 * time from its clean grid (`scripts/asset-tools/wreck.mjs`). Index 0 is the
 * undamaged sprite, so this is read with `DriveTraffic.rung` directly. */
const WRECK_SUFFIX = ["", "_dent1", "_dent2", "_dent3"];

/**
 * WHICH END OF A VEHICLE HAS BEEN STOVE IN — what the renderer asks for when it
 * wants a picture rather than a rung.
 *
 * `undefined` is a car that has only been battered: it wears the derived dent
 * ladder above, which is a texture painted over a body that is still the shape
 * it was. Either of the other two is a car that has changed SHAPE, and the only
 * honest way to draw that is a different grid.
 */
export type CrashEnd = "front" | "rear" | undefined;

/**
 * Which picture a vehicle is wearing right now.
 *
 * THE CRASH ART OUTRANKS THE DENT LADDER, and it replaces it rather than
 * stacking on it. The rungs are a progressive scuffing of one silhouette; the
 * crash grids are the body BENT — shorter at the struck end, roofline broken,
 * screen gone, wheel torn off — and a car that has folded up is not also
 * slightly dented, it is folded up. Painting one over the other would put a
 * scatter of paint damage across a panel that is no longer where the scatter was
 * dealt.
 *
 * It falls back to the rung when the vehicle has no crash art authored yet,
 * which is the whole of how the fleet gets its two grids one model at a time
 * without the road ever drawing a missing sprite.
 */
export function trafficSprite(
  variant: number,
  rung: number,
  end: CrashEnd = undefined,
  has: (name: string) => boolean = () => true,
): string {
  const base = TRAFFIC_SPRITES[variant % TRAFFIC_SPRITES.length] ?? "";
  if (end) {
    const crashed = `${base}_${end}`;
    if (has(crashed)) return crashed;
  }
  const suffix =
    WRECK_SUFFIX[Math.max(0, Math.min(WRECK_SUFFIX.length - 1, rung))] ?? "";
  return `${base}${suffix}`;
}

/**
 * WHICH END'S ART A VEHICLE SHOULD BE WEARING — the sim's own two latches, read
 * once so nothing downstream has to ask twice.
 *
 * A car hit at BOTH ends wears the worse one. There is deliberately no third
 * grid for it: two authored pictures per vehicle is what the request asked for,
 * and a body that is folded at both ends reads, at this size, as a body that is
 * folded — which of the two the eye is looking at is settled by which one is
 * pointing at the wagon.
 */
export function crashEnd(other: {
  smashNose: boolean;
  smashTail: boolean;
  crushNose: number;
  crushTail: number;
}): CrashEnd {
  if (other.smashNose && other.smashTail) {
    return other.crushNose >= other.crushTail ? "front" : "rear";
  }
  if (other.smashNose) return "front";
  if (other.smashTail) return "rear";
  return undefined;
}

/** THE KERB'S own furniture is no longer here — it is the engine's, because it
 * is collidable (`DRIVE.street`, engine/game/drive/street.ts). The renderer reads
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
 * already stands a collidable post at every kerb slot (`engine/game/drive/
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

/**
 * WHERE A MACHINE'S LAMPS ARE — how far its body reaches from its own centre,
 * and how high off the road the lights burn.
 *
 * IT CANNOT BE READ OFF THE ART, which is the thing that makes this a table
 * rather than a derivation. Every vehicle on this road is authored on the SAME
 * 48x26 canvas — a bicycle drawn small in the middle of one, a bus filling one —
 * so the sprite's dimensions are identical for a pushbike and a lorry and say
 * nothing at all about either. The lamps went on the wagon's own numbers for as
 * long as the wagon was the only thing that had any, which put a delivery
 * moped's headlight cone a body and a half out in front of the bike and its tail
 * glow the same distance behind: two loose smears of light with a moped riding
 * between them.
 *
 * IT LIVES BESIDE `RIDER_SEATS` because it is the same kind of fact and the same
 * kind of table: where on THIS machine's art does a thing sit. Only the machines
 * that are not car-shaped need an entry; everything with a roof is the default,
 * which is the hero's own wagon.
 */
export const VEHICLE_LAMPS: Readonly<Record<string, LightBody>> = {
  // The open machines, in the fleet's own order. `halfPx` is the drawn body's
  // reach from its centre — a shade more than the collision extent, because a
  // lamp is bolted to the very end of the thing — and `liftPx` is the height the
  // lamp burns at, which on all of these is about the top of the wheel.
  traffic_motorcycle: { halfPx: 11, liftPx: 10 },
  traffic_scooter: { halfPx: 10, liftPx: 6 },
  traffic_ebike: { halfPx: 10, liftPx: 11 },
  traffic_bicycle: { halfPx: 8, liftPx: 9 },
  traffic_delivery_moped: { halfPx: 10, liftPx: 6 },
  // …and the skateboard has none at all, so it never asks (`DriveVehicleDef.lights`).
  //
  // THE ONE CAR THAT NEEDS AN ENTRY. Every other roofed vehicle in the fleet
  // fills its canvas (23 px of reach either way) and takes the default below;
  // the hatchback is drawn well inside its own, at 20, which on the shared
  // number put both of its beams four px off the ends of the car.
  traffic_hatch: { halfPx: 20, liftPx: 10 },
};

/**
 * WHERE A VEHICLE'S LIGHT BAR IS PAINTED — the two lamps' own places in its art.
 *
 * THE SAME KIND OF FACT AS THE TABLE ABOVE and it lives beside it for the same
 * reason: every vehicle on this road is authored on the SAME 48x26 canvas, so
 * the sprite's own box says nothing about where the roof of the thing drawn
 * inside it is, nor where along that roof anything sits. Read off the box, the
 * flash landed five px clear of the roof and a body's length from the bar — two
 * lights floating along beside a car rather than bolted to one.
 *
 * MEASURED OFF THE GRID, which is why the numbers are halves: in
 * `content/sprites/earth/traffic_police.yaml` the bar is rows 3-5 and columns
 * 19-24 of a 48x26 canvas drawn about its bottom centre, so its middle is 2.5 px
 * behind the body's centre and 20 px off the road, with the two lamps a pixel
 * and a half either side of that.
 */
export type RoofBar = {
  /** Where the bar's middle sits along the body, in the sprite's own frame:
   * negative is toward the boot. */
  atPx: number;
  /** …how far each lamp is from that middle… */
  halfPx: number;
  /** …and how high the whole thing is off the road. */
  liftPx: number;
};

export const ROOF_BARS: Readonly<Record<string, RoofBar>> = {
  traffic_police: { atPx: -2.5, halfPx: 1.5, liftPx: 20 },
};

/** Where this vehicle's light bar is, or undefined if it has not got one — which
 * is everything on this road but the patrol car. */
export function roofBar(def: DriveVehicleDef): RoofBar | undefined {
  return ROOF_BARS[def.id];
}

/**
 * WHAT EVERYTHING WITH A ROOF IS, unless the table above says otherwise — the
 * traffic's own body rather than the HERO's.
 *
 * MEASURED OFF THE GRIDS, like every other number in this block: the fleet's
 * cars fill 46 to 48 px of their 48-px canvas and carry their lamps eight to ten
 * px off the road (`content/sprites/earth/traffic_*.yaml`). The default used to
 * be the wagon's own 24/11, which is the longest body on this road and a lamp
 * line above any of theirs — close enough on a saloon to pass, and a pixel or
 * two proud on everything else.
 *
 * IT IS NOT `def.halfLengthPx`, which was the obvious guess and is the wrong
 * number: that is the COLLISION extent, deliberately shorter than the art (a
 * saloon is 20 against 23 drawn), so a lamp placed on it burns two or three px
 * inside the bodywork it is supposed to be bolted to.
 */
const ROOFED_LAMPS: LightBody = { halfPx: 23, liftPx: 10 };

/**
 * WHAT THIS VEHICLE'S LAMPS ARE BOLTED TO.
 *
 * `tests/content/drive_scenery_test.ts` holds every answer here against the ART
 * — a lamp may sit anywhere inside the body it is on and never past the end of
 * it — which is what stops the next short vehicle quietly inheriting a body it
 * is nothing like. That is exactly how the hatchback went wrong: it is the one
 * car in the fleet drawn well inside its canvas (20 px of reach against
 * everything else's 23), and on the wagon's 24 it threw both its beams from a
 * point four px OFF THE END of itself — a car driving along between two lights
 * that are not attached to it.
 */
export function lightBody(def: DriveVehicleDef): LightBody {
  return VEHICLE_LAMPS[def.id] ?? ROOFED_LAMPS;
}
