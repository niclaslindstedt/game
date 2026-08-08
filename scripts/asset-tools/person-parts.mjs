// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PEOPLE PARTS BIN — every loose piece a person is dressed and equipped
// with: the hair and hats that sit on a head, the aids somebody walks with, and
// the things they are carrying.
//
// THIS HALF IS DRAWN, AND THE SPLIT IS THE WHOLE DESIGN — the same split the
// town is built along (`facade-parts.mjs` beside this file). Next door,
// `person.mjs` RULES a body: a head at a gauge, shoulders at a width, a stride
// that swings, an outline that closes. Those are regularities, and a loop gets
// them right at 16 px every time while a hand copying a template out of a
// comment does not. Everything in THIS file is the opposite kind of thing — a
// walking frame, a guide dog, a pram, a mohawk. Those are SHAPES, and a shape
// ruled from a formula reads as a formula.
//
// SO THE BODY IS GENERATED AND THE CHARACTER IS DRAWN, which is also the honest
// division of labour: what makes the crowd a CROWD (one ground line, one scale,
// one outline weight) is exactly what a generator is for, and what makes one
// person a person is exactly what it is not.
//
// EVERY PART IS A LITTLE GRID PLUS AN ANCHOR. The anchor says which of the
// body's own landmarks it hangs off — `crown` for hair, `hand` for a cane, a
// briefcase or a lead, `ground` for a board or a wheelchair's wheels — so a part
// authored once lands correctly on a child, an adult and somebody stooped, and
// nobody has to author a second copy per age.
//
// `~` IS "LEAVE WHAT IS THERE". It is the one char with a meaning of its own in
// this file, and it is what lets a part be a picture with holes in it rather
// than a rectangle that punches the body out behind it.

/** The char every part paints its own ink with — the body's, so an outline is
 * one weight across the whole sprite. */
export const INK = "O";

/** "Leave the body alone here." */
export const KEEP = "~";

// ── HAIR, HATS AND WHAT IS ON A HEAD ─────────────────────────────────────────
//
// A CROWN, not a whole head. The body rules the skull and the face — they are a
// gauge, and a face at the wrong height is the one error that makes a crowd read
// as broken — so what is authored here is only what sits ON it. Each grid is
// anchored so its LAST row lands on the head's own top row, which is what lets
// the same mohawk sit on a child and on a heavy adult.
//
// `H` is the hair colour the sprite's own palette supplies; a hat that is not
// hair paints `X`, the accent, so a cap can be red on a person whose hair is
// grey.

/**
 * A HAIR ENTRY IS A SKULL PAINT PLUS AN OPTIONAL SHAPE ON TOP, and that split
 * is what keeps the bin small. The body already rules a skull at the age's own
 * gauge; nine times in twelve "hair" is nothing more than what COLOUR that
 * skull is — `H` for hair, `P` for a bald head, `X` for a hat, which is why a
 * cap can be red on somebody whose hair is grey. Only the shapes that genuinely
 * leave the skull — a bun, a mohawk, a peak, a hood — author pixels.
 *
 * `over` is drawn from the crown row UPWARD, so a two-row mohawk stands two rows
 * proud of whatever head it is on and needs no per-age copy. `sides` hangs hair
 * past the jaw. `visor` says there is no face under this at all.
 */
/** @type {Record<string, {skull: string, over?: string[], sides?: number, brim?: boolean, visor?: boolean}>} */
export const HAIR = {
  /** A bald head is a real silhouette and one of the few that reads instantly
   * at this size — so it is a skin-coloured skull rather than an absence. */
  bald: { skull: "P" },
  /** The default: a close crop that follows the skull. */
  crop: { skull: "H" },
  /** …and the same crop carried down over the brow. */
  fringe: { skull: "H", brow: true },
  /** Long hair, which at this size is a crown that continues PAST the jaw — the
   * length is what reads, not the strands. */
  long: { skull: "H", sides: 2 },
  /** Pinned up. Off-centre on purpose: a symmetrical lump on top of a head
   * reads as a hat, and an offset one reads as hair somebody put up. */
  bun: { skull: "H", over: ["HH~~~~"] },
  /** A strip, shaved either side. Two rows proud, because one row of anything
   * at 16 px is a smudge. */
  mohawk: { skull: "H", over: ["~~HH~~", "~~HH~~"] },
  /** Bald on top with a fringe round the sides — an age read that costs two
   * pixels and is worth more than any amount of grey. */
  thinning: { skull: "P", sides: 1 },
  /** A flat brim, worn level, peak forward (everything on this road faces
   * right). */
  cap: { skull: "X", brim: true },
  /** Pulled down over the ears. */
  beanie: { skull: "X" },
  /** A hood, which is a BIGGER silhouette than a head, and that is the point. */
  hood: { skull: "X", sides: 1 },
  /** A headscarf tied at the back. */
  scarf: { skull: "X", sides: 1 },
  /** A crash helmet — the riders', and the one piece of headwear on this road
   * with no face under it. */
  helmet: { skull: "X", visor: true },
};

// ── WHAT SOMEBODY WALKS WITH ─────────────────────────────────────────────────
//
// THE ROAD IS FULL OF PEOPLE THE WELFARE DID NOT REACH, and a crowd of twenty
// able-bodied adults is a crowd somebody forgot to think about. These are drawn
// rather than ruled for the reason everything in this file is — a cane is a line
// at an angle and a wheelchair is a machine — and every one of them is anchored
// off a HAND or off the GROUND so it lands right whatever age is holding it.
//
// `F` is the aid's own material (alloy, painted steel); `D` is an animal.

/** @type {Record<string, {rows: string[], anchor: string, dx?: number, dy?: number, hand?: "near"|"far"}>} */
export const AIDS = {
  none: { rows: [], anchor: "hand" },
  // A walking cane — held in one hand, planted a little ahead of the feet. The
  // shaft leans, because a cane held vertical reads as a pole somebody is
  // carrying rather than as weight going through it.
  cane: {
    rows: ["~F", "~F", "F~", "F~"],
    anchor: "hand",
    dx: 1,
    dy: 1,
  },
  // A white stick, swept ahead. Longer than a cane, held further out, and the
  // only aid here that is drawn ANGLED ACROSS the direction of travel — which
  // is what it is doing.
  white_stick: {
    rows: ["~~F", "~F~", "F~~", "F~~"],
    anchor: "hand",
    dx: 1,
    dy: 1,
  },
  // A pair of forearm crutches — one either side, which is the silhouette.
  crutches: {
    rows: ["F~~~~F", "F~~~~F", "F~~~~F", "F~~~~F"],
    anchor: "hips",
    dx: -3,
    dy: 0,
  },
  // A wheeled walking frame, pushed ahead.
  frame: {
    rows: ["FF", "~F", "~F", "~F", "FF"],
    anchor: "hand",
    dx: 1,
    dy: -1,
  },
  // A guide dog, at heel on the near side.
  guide_dog: {
    rows: ["DD~~", "DDDD", "~O~O"],
    anchor: "ground",
    dx: -5,
    dy: -2,
  },
};

// ── AND WHAT THEY ARE CARRYING ───────────────────────────────────────────────

/** @type {Record<string, {rows: string[], anchor: string, dx?: number, dy?: number}>} */
export const CARRY = {
  none: { rows: [], anchor: "hand" },
  // A carrier bag, hanging.
  bag: { rows: ["GG", "GG", "GG"], anchor: "hand", dx: 1, dy: 0 },
  // A briefcase — squarer, held still.
  briefcase: { rows: ["GG", "GG"], anchor: "hand", dx: 1, dy: 1 },
  // A shopping trolley, pushed ahead of both hands.
  trolley: {
    rows: ["GG", "GG", "GG", "GG", "~O"],
    anchor: "hand",
    dx: 1,
    dy: -1,
  },
  // A pram.
  pram: {
    rows: ["GG", "GG", "GG", "GG", "OO"],
    anchor: "hand",
    dx: 1,
    dy: -1,
  },
  // A skateboard, under the feet rather than in a hand.
  board: { rows: ["GGGGGG", "~O~~O~"], anchor: "ground", dx: -3, dy: 1 },
  // Headphones — worn rather than carried, and the one entry here that lands on
  // the head. It is in this table rather than in HAIR because it goes OVER
  // whatever the hair is.
  headphones: { rows: ["X~~~~X", "X~~~~X"], anchor: "crown", dx: 0, dy: 1 },
};

/** Every part id, for the schema and for a test that wants to walk them. */
export const HAIR_IDS = Object.keys(HAIR);
export const AID_IDS = Object.keys(AIDS);
export const CARRY_IDS = Object.keys(CARRY);
