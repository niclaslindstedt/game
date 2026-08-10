// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PARTS BIN — every loose piece the town on the road to GOODCO is dressed
// with, and how big each of them is.
//
// SPLIT OUT OF THE CATALOG rather than tucked into it, and the line between the
// two is worth stating: `town.ts` says what a BUILDING is — its size, its bays,
// its stretch of road — and this file says what may be hung on one. They change
// for different reasons and at different rates. A new archetype is a paragraph
// in the roster; a new front door is a row here plus a shape in the generator,
// and touches no building at all.
//
// THE SAME LIST IS READ FROM BOTH ENDS OF THE PIPELINE: the generator draws
// exactly what is named here (`scripts/asset-tools/facade-parts.mjs`) and the
// assembly may name nothing else (`pwa/src/game/drive-screen/town-art.ts`). A
// part added on one side and not the other is the classic silent scenery bug —
// `spriteByName` returns undefined and the draw is simply skipped — so
// `tests/content/drive_town_test.ts` walks this table against the shipped atlas.
//
// EACH PART CARRIES ITS OWN STRETCH OF ROAD, for the same reason a building
// does: a security grille over a door belongs at the hero's end and a sheet of
// frameless glass belongs at GOODCO's, and putting the choice on the PART
// rather than on the building is what lets one archetype stand at both ends
// wearing the right face.

// A TYPE-ONLY import, which is the whole reason this file may be the leaf: the
// catalog names the frontage styles, this file says which art each one wears,
// and `import type` is erased before anything runs.
import type { TownFront } from "./town.ts";

// ── THE STREET'S OWN GRID ────────────────────────────────────────────────────
//
// The plot the whole town is measured in lives HERE rather than in the catalog,
// for a reason that is mechanical: a frontage tile is exactly one plot wide, so
// the size table below has to know the plot — and the catalog has to know the
// size table, because a hole is cut to fit the thing that fills it. Putting the
// grid in the catalog made that a cycle, and a cycle between two modules that
// both run at import time is a temporal-dead-zone crash rather than a warning.
// This file is the leaf; everything else in the town reads down into it.

/**
 * THE PLOT (world px) — the unit of frontage every building is a whole number
 * of.
 *
 * A GRID RATHER THAN A FREE WALK, and the reason is that the row has to be
 * resumable from any x. The renderer populates only the stretch actually on
 * screen, so "lay the next house down beside the last one" is not available —
 * there is no last one. Buildings that tile a fixed plot can be asked about out
 * of order, which is the same trick the crowd's own hash plays.
 */
export const TOWN_PLOT_PX = 20;
/** The gap between neighbours (world px) — an alley, a side return, a bin
 * passage. Cut out of the plot rather than added to it, so the grid stays a
 * grid. */
export const TOWN_ALLEY_PX = 4;

/** How far the frontages stand back from the far pavement's outer edge (world
 * px) — the town stands CLOSE, and on one building line. A doorway's depth of
 * jitter sounded like realism and drew a ragged saw; a real street's buildings
 * share a line, and at this size the shared line is what makes a row read as a
 * street at all. */
export const TOWN_SETBACK_PX = 13;
/** …and where the garden wall, the fence and the wheelie bins stand — in the
 * strip of verge between that line and the pavement. */
export const TOWN_FRONTAGE_SETBACK_PX = 4;

/**
 * HOW BIG EVERY PIECE OF TOWN ART IS (px) — the one table the generator draws
 * to and the assembly anchors against.
 *
 * NOTHING IS WIDER THAN A BAY, and that is the constraint the whole parts bin
 * is built under. The narrowest bay the plot grid can produce is about 15 px
 * (a four-bay 76-px facade), so a part that fits one fits every building on the
 * road — which is what lets a shopfront be a repeated 13-px unit rather than a
 * stretched picture cut to each width, and what keeps one door serving 26
 * archetypes.
 */
export const TOWN_ART_SIZE: Readonly<Record<string, [number, number]>> = {
  // The holes.
  win_small: [9, 7],
  win_tall: [9, 9],
  win_wide: [13, 7],
  win_strip: [13, 5],
  win_shop: [13, 11],
  door_panel: [9, 11],
  door_screen: [9, 11],
  door_grille: [9, 11],
  door_glass: [9, 11],
  door_double: [9, 11],
  garage_up: [15, 11],
  garage_roll: [15, 11],
  garage_open: [15, 11],
  // What is hung over them.
  porch_awning: [15, 5],
  porch_stoop: [13, 4],
  porch_portico: [13, 8],
  porch_canopy: [15, 4],
  sign_board: [15, 5],
  sign_hanging: [9, 7],
  sign_hoard: [15, 7],
  sign_letters: [15, 4],
  sign_neon: [13, 7],
  // What has happened to the wall since.
  decal_tag_a: [11, 6],
  decal_tag_b: [9, 5],
  decal_poster: [6, 8],
  decal_damp: [9, 10],
  decal_crack: [5, 12],
  decal_patch: [7, 6],
  decal_ivy: [9, 14],
  decal_soot: [11, 8],
  // The frontage tile — one plot wide, so a run of them fences any width.
  front_picket: [TOWN_PLOT_PX, 7],
  front_wall: [TOWN_PLOT_PX, 6],
  front_hedge: [TOWN_PLOT_PX, 8],
  front_rail: [TOWN_PLOT_PX, 7],
  front_chain: [TOWN_PLOT_PX, 9],
  front_planter: [TOWN_PLOT_PX, 6],
  front_broken: [TOWN_PLOT_PX, 7],
  front_lot: [TOWN_PLOT_PX, 6],
  // …and what is left standing in front of it.
  junk_bin: [5, 7],
  junk_bins: [9, 7],
  junk_sacks: [9, 5],
  junk_pallets: [9, 6],
  junk_trolley: [8, 7],
  junk_sofa: [13, 6],
  junk_skip: [15, 7],
  junk_sale: [7, 10],
  junk_crates: [11, 6],
  junk_vend: [7, 10],
};

/** One interchangeable piece, and where on the road it belongs. */
export type TownPartDef = {
  /** Its sprite stem, less the `town_` prefix the generator adds. */
  id: string;
  /** `[from, to]` on the 0…1 run from the hero's block to GOODCO's gate. */
  district: [number, number];
  /** …and the wear rungs it may appear at, `[least, most]`. */
  wear: [number, number];
  weight: number;
};

/** THE DOORS a doorway may be filled with. */
export const TOWN_DOORS: readonly TownPartDef[] = [
  { id: "door_panel", district: [0, 1], wear: [0, 3], weight: 10 },
  { id: "door_screen", district: [0, 0.75], wear: [0, 3], weight: 7 },
  { id: "door_grille", district: [0, 0.5], wear: [1, 3], weight: 6 },
  { id: "door_glass", district: [0.3, 1], wear: [0, 2], weight: 8 },
  // A PAIR OF PAINTED DOORS runs the whole road, and it is the one that keeps
  // the poor end from being forty red doors: the panel door is the commonest
  // thing in the roster, and with only a green screen door and a grey grille
  // beside it every third house wore the same paint.
  { id: "door_double", district: [0, 1], wear: [0, 2], weight: 6 },
];

/** …and the shutters a vehicle opening wears. */
export const TOWN_GARAGE_DOORS: readonly TownPartDef[] = [
  { id: "garage_up", district: [0, 1], wear: [0, 3], weight: 8 },
  { id: "garage_roll", district: [0, 1], wear: [0, 3], weight: 8 },
  { id: "garage_open", district: [0, 0.8], wear: [1, 3], weight: 4 },
];

/**
 * WHAT STATE A HOLE IS IN — the four faces every window and every door has, and
 * the ladder the wear rung walks up.
 *
 * `board` and `broke` are two different sentences and both are worth having.
 * Boards say somebody came and did it: the shop closed, the family left, the
 * council sent a man round. Broken glass says nobody did — which is the more
 * frightening of the two, and the one the very worst stretch of this road
 * should be made of.
 */
export const TOWN_HOLE_STATES = ["dark", "lit", "board", "broke"] as const;
export type TownHoleState = (typeof TOWN_HOLE_STATES)[number];

/** THE PORCHES, AWNINGS AND CANOPIES a door may shelter under. */
export const TOWN_PORCHES: readonly TownPartDef[] = [
  { id: "porch_awning", district: [0, 0.8], wear: [0, 3], weight: 8 },
  { id: "porch_stoop", district: [0, 0.85], wear: [0, 3], weight: 7 },
  { id: "porch_portico", district: [0.25, 1], wear: [0, 2], weight: 6 },
  { id: "porch_canopy", district: [0.45, 1], wear: [0, 1], weight: 8 },
];

/** THE SIGNS a trade hangs over its door. Never a name — a TRADE
 * (`docs/naming.md`): a board, some letters, a swinging shingle, a hoarding. */
export const TOWN_SIGNS: readonly TownPartDef[] = [
  { id: "sign_board", district: [0, 0.8], wear: [0, 3], weight: 9 },
  { id: "sign_hanging", district: [0, 0.9], wear: [0, 3], weight: 6 },
  { id: "sign_hoard", district: [0, 0.55], wear: [1, 3], weight: 6 },
  { id: "sign_letters", district: [0.35, 1], wear: [0, 1], weight: 9 },
  // A LIT TUBE, which is the one sign on this road that is still ON at the poor
  // end. A liquor store, a diner and a motel all say the same thing after dark
  // and they say it in neon — and a warm box glowing over a shuttered row is
  // the same trick the lit window plays: the street is worse for having one
  // thing left working on it.
  { id: "sign_neon", district: [0, 0.95], wear: [0, 3], weight: 4 },
];

/**
 * THE DECALS — what has happened to a wall since anybody last cared about it.
 *
 * `band` is where on the facade a piece may land, and it is the difference
 * between dressing and noise: a tag is sprayed by somebody standing on the
 * pavement, ivy climbs from the ground, and a damp stain runs down from a
 * gutter. Scattered uniformly they all read as dirt on the lens.
 */
export type TownDecalDef = TownPartDef & { band: "low" | "any" | "high" };
export const TOWN_DECALS: readonly TownDecalDef[] = [
  {
    id: "decal_tag_a",
    district: [0, 0.6],
    wear: [1, 3],
    weight: 9,
    band: "low",
  },
  {
    id: "decal_tag_b",
    district: [0, 0.7],
    wear: [1, 3],
    weight: 8,
    band: "low",
  },
  {
    id: "decal_poster",
    district: [0, 0.85],
    wear: [1, 3],
    weight: 7,
    band: "low",
  },
  {
    id: "decal_damp",
    district: [0, 0.75],
    wear: [1, 3],
    weight: 8,
    band: "any",
  },
  {
    id: "decal_crack",
    district: [0, 0.7],
    wear: [2, 3],
    weight: 7,
    band: "any",
  },
  {
    id: "decal_patch",
    district: [0, 0.8],
    wear: [2, 3],
    weight: 6,
    band: "any",
  },
  {
    id: "decal_ivy",
    district: [0, 0.65],
    wear: [2, 3],
    weight: 5,
    band: "low",
  },
  {
    id: "decal_soot",
    district: [0, 0.45],
    wear: [3, 3],
    weight: 6,
    band: "high",
  },
];

/** THE FRONTAGE — the strip between the building line and the pavement, tiled
 * across the plot. Keyed by `TownFront`, so a def names its own. */
export const TOWN_FRONTS: Readonly<Record<TownFront, string | null>> = {
  none: null,
  picket: "front_picket",
  wall: "front_wall",
  hedge: "front_hedge",
  rail: "front_rail",
  chain: "front_chain",
  planter: "front_planter",
  broken: "front_broken",
  lot: "front_lot",
};

/**
 * …AND WHICH OF THEM A GIVEN-UP STREET TAKES DOWN.
 *
 * Past the second rung of wear a picket, a hedge or a rail is the wrong
 * sentence entirely — what is left at a house nobody keeps is a run of broken
 * palings. TARMAC IS NOT ON THAT LIST: a car park at the worst end of the road
 * is a cracked car park, not a fallen fence, and swapping it for one put a row
 * of broken palings across the front of a supermarket.
 */
export const TOWN_FRONTS_BREAK: readonly TownFront[] = [
  "picket",
  "wall",
  "hedge",
  "rail",
  "chain",
  "planter",
];

/** THE JUNK left in front of it. What a street accumulates when the collections
 * stop, and the fastest read on this whole road that a block has been given
 * up on. */
export const TOWN_JUNK: readonly TownPartDef[] = [
  { id: "junk_bin", district: [0, 1], wear: [0, 3], weight: 10 },
  { id: "junk_bins", district: [0, 1], wear: [0, 3], weight: 8 },
  { id: "junk_sacks", district: [0, 0.7], wear: [1, 3], weight: 8 },
  { id: "junk_pallets", district: [0, 0.75], wear: [1, 3], weight: 6 },
  { id: "junk_trolley", district: [0, 0.8], wear: [1, 3], weight: 6 },
  { id: "junk_sofa", district: [0, 0.5], wear: [2, 3], weight: 6 },
  { id: "junk_skip", district: [0, 0.85], wear: [1, 3], weight: 5 },
  { id: "junk_sale", district: [0.1, 1], wear: [0, 3], weight: 5 },
  // WHAT A TRADE LEAVES ON THE PAVEMENT. Stacked produce crates outside a
  // grocer and an ice machine humming beside a motel door are the two pieces of
  // street furniture that say somebody is still OPEN — which is why they run
  // the whole road rather than only its tired end.
  { id: "junk_crates", district: [0, 0.9], wear: [1, 3], weight: 6 },
  { id: "junk_vend", district: [0.05, 1], wear: [1, 3], weight: 5 },
];
