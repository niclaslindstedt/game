// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT EACH KIND OF BODY IS MADE OF — the one catalog the whole gore system
// asks, and the reason a ghost, a machine and a rift-thing come apart as
// themselves rather than as a person in a different colour.
//
// `EnemyDef.gore` names the family; everything downstream reads it HERE and
// nowhere else. That is the point: adding a fifth kind of body is a row in this
// file plus its art, not an edit to the spray, the burst, the cleave, the floor
// and the effect pass.
//
// A FAMILY IS NOT A PALETTE SWAP. Four things vary, and each of them is a
// different reason a burst reads as one kind of thing rather than another:
//
//   THE PIECES.   A rover has no liver and a collapsed star has no ribcage. Each
//                 family has its own `bands` (what is inside a body of that kind,
//                 top to bottom), its own `signature` ladder of recognisable
//                 parts, and its own `filler` shower. This is the half that does
//                 the work.
//   THE RAMP.     The spray, the floor and the plain splash are BLOOD's authored
//                 art re-hued onto three stops (render/recolor.ts) rather than
//                 authored four times over — sixty sprites nobody would keep in
//                 step. A re-hue keeps every shape, every ragged edge and every
//                 deliberate speckle; only the colour is the family's.
//   THE AIR.      What hangs after the pieces land: a red haze, a puff of goo, a
//                 column of smoke, a drift of glimmer. It is the cheapest of the
//                 four and the one that names the family from across a room.
//   THE FLOOR.    Whether it STAYS. Blood, oil and a ghost's goo are all matter
//                 and all stay for the rest of the level, each in its own colour.
//                 A rift-thing is the one exception: it is light, and light goes
//                 out — so it marks nothing, which is a fact about it rather than
//                 a saving.
//
// The blood family's own numbers are unchanged: it is the first row here rather
// than a special case, and the other three were built to its shape.

import type { GoreRamp } from "../render/recolor.ts";

/** The four kinds of body (`EnemyDef.gore`). */
export type GoreFamilyId = "blood" | "ecto" | "sparks" | "cosmic";

/** One band of a body, top to bottom, and what is inside it. Fractions of the
 * sprite's height from the top — see `bandsCrossed` in ./gore-burst.ts, which
 * spills the bands a cut passed THROUGH. */
export type GoreBand = {
  id: string;
  from: number;
  to: number;
  spills: readonly string[];
};

/** What hangs in the air once the pieces have landed. Each is drawn from the
 * dust puff's own frames, re-hued and paced differently — a machine's smoke
 * climbs and lingers, a haunting's puff spreads and is gone, a rift-thing's
 * glimmer barely moves at all. */
export type GoreAir = "haze" | "puff" | "smoke" | "glimmer";

export type GoreFamily = {
  id: GoreFamilyId;
  /** The two-frame splash for every blow the full system does not reach — a
   * nick, a chip finish, a censored kill. Frames `<splash>_0` / `_1`. */
  splash: string;
  /** Darkest, middle, brightest — what the blood art is re-hued onto, or NULL
   * for the family the art was drawn FOR. That null is not a shortcut: a
   * luminance re-hue of red art onto a red ramp is very nearly the identity but
   * not exactly it, and "very nearly" is a silent regression on the one look
   * that already shipped. Blood therefore skips the pass entirely and draws its
   * own authored pixels. */
  ramp: GoreRamp | null;
  /** THE ONE COLOUR THAT NAMES THE FAMILY, as `"r, g, b"` — what the hit CLOUD
   * is drawn in (render/blood.ts). For the three re-hued families it is the
   * ramp's own middle stop; blood states it outright, because blood has no ramp
   * (see above) and the cloud still has to know what colour blood is. */
  cloud: string;
  /** Whether what it spills STAYS on the floor for the rest of the level. */
  stains: boolean;
  /** What hangs in the air afterwards. */
  air: GoreAir;
  /** The cut face drawn in the gap a flat cleave opens. */
  wound: string;
  /** The tile an oblique slice's wet face is masked out of. */
  inside: string;
  /** THE ONE PIECE LEFT HANGING out of a cut rather than thrown clear of it —
   * a rope of gut, a trailing wisp, a torn loom of wire, a thread of light. It
   * is the detail that makes a cleave read as a BODY opened rather than as a
   * statue broken, and every family owes one. */
  strand: string;
  /** What is inside a body of this kind, top to bottom. */
  bands: readonly GoreBand[];
  /** The recognisable parts, worst first, each thrown at most once and only
   * once the blow is worth the `force` beside it. */
  signature: readonly { sprite: string; force: number }[];
  /** The shower every burst throws a lot of, by weight. */
  filler: readonly { sprite: string; weight: number }[];
  /** What kicks back up off the floor rather than sticking where it lands. */
  bouncy: ReadonlySet<string>;
  /** Pieces only a `humanoid` body has (blood's `EnemyDef.anatomy`). Empty for
   * the families that have no such distinction — a machine is a machine. */
  humanOnly: ReadonlySet<string>;
};

const FAMILIES: Record<GoreFamilyId, GoreFamily> = {
  // A PERSON: organs, viscera, bone, and a face if it had one.
  blood: {
    id: "blood",
    splash: "blood",
    // The art is already blood's. See `ramp` above for why this is null rather
    // than the red ramp it would otherwise be.
    ramp: null,
    cloud: "168, 44, 44",
    stains: true,
    air: "haze",
    wound: "cleave_wound",
    inside: "gore_inside",
    strand: "gib_gut_1",
    bands: [
      { id: "skull", from: 0, to: 0.2, spills: ["gib_brain", "gib_skull"] },
      { id: "neck", from: 0.2, to: 0.3, spills: ["gib_skull", "gib_meat_0"] },
      { id: "chest", from: 0.3, to: 0.5, spills: ["gib_heart", "gib_ribs"] },
      {
        id: "belly",
        from: 0.5,
        to: 0.68,
        spills: ["gib_gut_0", "gib_liver", "gib_gut_1"],
      },
      {
        id: "hips",
        from: 0.68,
        to: 0.82,
        spills: ["gib_kidney", "gib_meat_1"],
      },
      { id: "legs", from: 0.82, to: 1, spills: ["gib_bone", "gib_meat_0"] },
    ],
    signature: [
      { sprite: "gib_meat_1", force: 0 },
      { sprite: "gib_gut_0", force: 0.6 },
      { sprite: "gib_liver", force: 1 },
      { sprite: "gib_ribs", force: 1.3 },
      { sprite: "gib_kidney", force: 1.6 },
      { sprite: "gib_heart", force: 1.9 },
      { sprite: "gib_gut_1", force: 2.2 },
      { sprite: "gib_bone", force: 2.6 },
      { sprite: "gib_brain", force: 3 },
      { sprite: "gib_skull", force: 3.6 },
    ],
    filler: [
      { sprite: "gib_meat_0", weight: 5 },
      { sprite: "gib_meat_1", weight: 3 },
      { sprite: "gib_gut_1", weight: 2 },
      { sprite: "gib_bone", weight: 2 },
      { sprite: "gib_kidney", weight: 2 },
      { sprite: "gib_gut_0", weight: 1 },
    ],
    bouncy: new Set([
      "gib_skull",
      "gib_ribs",
      "gib_bone",
      "gib_heart",
      "gib_kidney",
    ]),
    // A cranium with a row of human teeth in it is not in a giant lizard.
    humanOnly: new Set(["gib_skull"]),
  },

  // A HAUNTING: goo wrapped around a cold light, and the shapes the goo held.
  // The goo is REAL — it is the one part of a ghost that was ever matter — so it
  // lands on the floor and stays there in green, and a room a haunting was put
  // down in looks it for the rest of the level.
  ecto: {
    id: "ecto",
    splash: "ecto",
    ramp: ["46, 76, 74", "108, 190, 150", "205, 240, 235"],
    cloud: "108, 190, 150",
    stains: true,
    air: "puff",
    wound: "ecto_wound",
    inside: "ecto_inside",
    strand: "gib_ecto_string",
    bands: [
      {
        id: "face",
        from: 0,
        to: 0.28,
        spills: ["gib_ecto_mask", "gib_ecto_ember"],
      },
      {
        id: "light",
        from: 0.28,
        to: 0.5,
        spills: ["gib_ecto_core", "gib_ecto_shard"],
      },
      {
        id: "body",
        from: 0.5,
        to: 0.72,
        spills: ["gib_ecto_blob", "gib_ecto_ring"],
      },
      {
        id: "hem",
        from: 0.72,
        to: 1,
        spills: ["gib_ecto_veil", "gib_ecto_string"],
      },
    ],
    signature: [
      { sprite: "gib_ecto_blob", force: 0 },
      { sprite: "gib_ecto_string", force: 0.6 },
      { sprite: "gib_ecto_veil", force: 1 },
      { sprite: "gib_ecto_ring", force: 1.4 },
      { sprite: "gib_ecto_shard", force: 1.9 },
      { sprite: "gib_ecto_core", force: 2.4 },
      { sprite: "gib_ecto_mask", force: 3.2 },
    ],
    filler: [
      { sprite: "gib_ecto_drip", weight: 5 },
      { sprite: "gib_ecto_blob", weight: 3 },
      { sprite: "gib_ecto_ember", weight: 3 },
      { sprite: "gib_ecto_string", weight: 2 },
      { sprite: "gib_ecto_veil", weight: 1 },
    ],
    // The two pieces that went HARD. Everything else is goo and sticks.
    bouncy: new Set(["gib_ecto_shard", "gib_ecto_core"]),
    humanOnly: new Set(),
  },

  // A MACHINE: plate over a loom of wire, with cells and servos in it and oil
  // through the lot. Oil stays on a floor for ever, so this family marks it.
  sparks: {
    id: "sparks",
    splash: "sparks",
    ramp: ["18, 16, 14", "78, 74, 70", "214, 168, 66"],
    cloud: "78, 74, 70",
    stains: true,
    air: "smoke",
    wound: "bot_wound",
    inside: "bot_inside",
    strand: "gib_bot_wire",
    bands: [
      {
        id: "sensor",
        from: 0,
        to: 0.26,
        spills: ["gib_bot_optic", "gib_bot_board"],
      },
      {
        id: "chassis",
        from: 0.26,
        to: 0.48,
        spills: ["gib_bot_plate", "gib_bot_wire"],
      },
      {
        id: "core",
        from: 0.48,
        to: 0.7,
        spills: ["gib_bot_cell", "gib_bot_board"],
      },
      {
        id: "drive",
        from: 0.7,
        to: 1,
        spills: ["gib_bot_servo", "gib_bot_piston", "gib_bot_spring"],
      },
    ],
    signature: [
      { sprite: "gib_bot_wire", force: 0 },
      { sprite: "gib_bot_plate", force: 0.6 },
      { sprite: "gib_bot_spring", force: 1 },
      { sprite: "gib_bot_servo", force: 1.4 },
      { sprite: "gib_bot_board", force: 1.8 },
      { sprite: "gib_bot_piston", force: 2.2 },
      { sprite: "gib_bot_cell", force: 2.7 },
      { sprite: "gib_bot_optic", force: 3.4 },
    ],
    filler: [
      { sprite: "gib_bot_oil", weight: 5 },
      { sprite: "gib_bot_wire", weight: 3 },
      { sprite: "gib_bot_plate", weight: 3 },
      { sprite: "gib_bot_spring", weight: 2 },
      { sprite: "gib_bot_servo", weight: 1 },
    ],
    // Everything a machine is made of is hard EXCEPT its oil — which is the
    // exact inverse of a body, and most of why the two sound different.
    bouncy: new Set([
      "gib_bot_plate",
      "gib_bot_servo",
      "gib_bot_cell",
      "gib_bot_spring",
      "gib_bot_optic",
      "gib_bot_piston",
    ]),
    humanOnly: new Set(),
  },

  // A RIFT-THING: light, and the dark between light. It leaves nothing: the
  // pieces go out where a body's lie there.
  cosmic: {
    id: "cosmic",
    splash: "cosmic",
    ramp: ["40, 46, 96", "150, 96, 200", "246, 244, 255"],
    cloud: "150, 96, 200",
    stains: false,
    air: "glimmer",
    wound: "cosmic_wound",
    inside: "cosmic_inside",
    strand: "gib_cosmic_thread",
    bands: [
      {
        id: "corona",
        from: 0,
        to: 0.26,
        spills: ["gib_cosmic_mote", "gib_cosmic_dust"],
      },
      {
        id: "halo",
        from: 0.26,
        to: 0.48,
        spills: ["gib_cosmic_ring", "gib_cosmic_lens"],
      },
      {
        id: "core",
        from: 0.48,
        to: 0.72,
        spills: ["gib_cosmic_core", "gib_cosmic_void"],
      },
      {
        id: "trail",
        from: 0.72,
        to: 1,
        spills: ["gib_cosmic_thread", "gib_cosmic_ash"],
      },
    ],
    signature: [
      { sprite: "gib_cosmic_mote", force: 0 },
      { sprite: "gib_cosmic_dust", force: 0.6 },
      { sprite: "gib_cosmic_shard", force: 1 },
      { sprite: "gib_cosmic_ash", force: 1.4 },
      { sprite: "gib_cosmic_thread", force: 1.8 },
      { sprite: "gib_cosmic_ring", force: 2.2 },
      { sprite: "gib_cosmic_lens", force: 2.7 },
      { sprite: "gib_cosmic_void", force: 3.1 },
      { sprite: "gib_cosmic_core", force: 3.6 },
    ],
    filler: [
      { sprite: "gib_cosmic_mote", weight: 6 },
      { sprite: "gib_cosmic_dust", weight: 3 },
      { sprite: "gib_cosmic_ash", weight: 2 },
      { sprite: "gib_cosmic_shard", weight: 2 },
      { sprite: "gib_cosmic_void", weight: 1 },
    ],
    // Only the collapsed heart has weight; light does not bounce.
    bouncy: new Set(["gib_cosmic_core"]),
    humanOnly: new Set(),
  },
};

/**
 * The family a body belongs to. Unknown or absent reads as blood, which is both
 * the default in the def and the right failure: a monster whose family nobody
 * declared bleeds, exactly as it always has.
 */
export function goreFamily(id: string | undefined): GoreFamily {
  return FAMILIES[(id ?? "blood") as GoreFamilyId] ?? FAMILIES.blood;
}

/** Every family, for the tests and the effects gallery. */
export const GORE_FAMILIES: readonly GoreFamily[] = Object.values(FAMILIES);
