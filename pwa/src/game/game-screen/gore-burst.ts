// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A BODY COMES APART INTO — the pieces, where each one lands, and how it
// gets there. The rule alone, no canvas anywhere near it, exactly like
// `blood-hit.ts` and `corpse-launch.ts` beside it.
//
// It is a leaf for a reason beyond testability this time: TWO passes have to
// agree about where a piece lands. `render/gibs.ts` flies the piece there, and
// `bloodSpills` wets the floor under it — so if either one derived its own
// scatter, the game would throw a head onto clean ground and pool blood where
// nothing landed. Both read the SAME `GorePiece[]` off the same seed, which is
// the same trick the blood spray already uses to put its stains under its own
// droplets.
//
// THE FLIGHT IS THE LOOT TOSS. A gib arcs exactly as a dropped item does
// (items/toss.ts, drawn by render/items.ts): a straight line across the ground
// with one parabola over it and a shadow that stays on the floor and tightens as
// the piece climbs. That was not a shortcut — a body's pieces and a body's drops
// come out of the same corpse at the same instant, and the two reading as one
// event is most of what sells the kill. Nothing is integrated: position is a
// closed-form function of the piece's own progress, so the arc is identical at
// 30 fps and at 144, and a pause leaves every piece exactly where it hung.
//
// WHAT BOUNCES IS WHAT IT IS MADE OF, and it is the one thing here nobody has to
// be told. A skull, a ribcage, a bone shard, a heart and a kidney are dense and
// springy: they hit, kick up, hit again, and skitter to a stop. A liver, a
// length of gut, a hand and a slab of meat are wet and floppy: they land once,
// stick, and stay in the puddle they made. Getting that pairing wrong is
// instantly, comically wrong in a way no amount of tuning fixes — a bouncing
// liver is a beach ball.

import { fract } from "../render/shared.ts";

/** How a body was taken apart. */
export type GoreKind =
  /** Cut in two along the blade's line — an EDGED killing blow. */
  | "cleave"
  /** Burst into pieces — a blunt one: a round, a spell, a bomb, a hammer. */
  | "gib";

/** WHAT SHAPE THE BODY WAS. The engine's `EnemyDef.anatomy`, carried through so
 * only a person loses a face. */
export type Anatomy = "humanoid" | "beast";

/** One way a blade can take a body apart. */
export type CleaveCut = {
  /** For the gallery, the tests and anyone reading a log. */
  id: string;
  /** THE CUT LINE's bearing in the sprite's own upright frame: 0 is a cut
   * straight ACROSS the body, π/2 one straight DOWN it, π/4 and 3π/4 the two
   * diagonals. Quantized by `splitSprite` into eight buckets, of which these
   * four are exact. */
  angle: number;
  /** WHERE the cut sits along its own normal, as a fraction of the body's size
   * — negative toward the head. 0 cuts through the middle; this is the knob that
   * turns one angle into three pictures (a neck, a waist, a pair of knees). */
  offset: number;
  /** How far the two pieces come apart, as a fraction of the body's size
   * ALONG the cut's normal — its height for a cut straight across, its width for
   * one straight down. */
  spread: number;
  /** How far each piece keels over, in radians. */
  tip: number;
  /** The piece that is THROWN CLEAR rather than merely parting — a head coming
   * off — named by the side of the cut it lies on (−1 is the head side). Null
   * when the body simply falls into two. */
  toss: -1 | 1 | null;
  /** The piece that does not move AT ALL: a pair of legs left standing where
   * they were. Null when both pieces go over. */
  pinned: -1 | 1 | null;
  /** How hard the blow has to be, in `BloodBlow.force`, before this cut is in
   * the pool. */
  force: number;
  /** THE FAMILY. `true` when the blade swept vertically past the camera (the
   * hero stood to one side of the victim), `false` when it swept across (he
   * stood in front or behind). What the hero's own position is allowed to
   * decide; the seed picks from there. */
  lengthwise: boolean;
  /** HOW OBLIQUE THE SLICE WAS, as a fraction of the body: how far the cut line
   * travels sideways between where the blade entered the FRONT of the body and
   * where it left the BACK.
   *
   * 0 is a flat cut straight through the screen plane — the two lines coincide,
   * no cut face is visible, and it is the plain two-halves cleave. Above 0 the
   * blade went in at an angle: on screen the plane crosses the silhouette twice
   * and the band between is the wet face, seen foreshortened, so one piece keeps
   * a quarter of the body and the other keeps the rest. At 1 it went in parallel
   * to the screen and took a whole slab off the front.
   *
   * It is the third axis of the cut and the only one that reads as DEPTH; a
   * billboard has no back to contradict it (see `slicedPiece`). */
  depth: number;
  /** WHAT THE BLADE WENT THROUGH, and therefore what falls out of the opening:
   * a skull and a brain out of a neck, a heart and a ribcage out of a chest,
   * the gut and the liver out of a belly. This is the half of the variety that
   * names the wound — without it every cut spills the same anonymous red. */
  spills: readonly string[];
};

/**
 * THE BODY, IN BANDS — where a person is, top to bottom, as fractions of the
 * sprite's height, and WHAT IS INSIDE EACH.
 *
 * This is the table that replaced a catalog of hand-authored cuts, and the
 * trade is the whole design. Twenty authored rows gave twenty pictures and a
 * maintenance burden; six bands and a rolled cut line give an UNBOUNDED number,
 * and — the part that actually matters — the organs can no longer disagree with
 * the wound, because they are not chosen at all. They are read off the bands the
 * blade PASSED THROUGH.
 *
 * So a cut at the neck spills a skull and a brain because that is what is up
 * there; a cut across the belly spills the gut and the liver; and a cut straight
 * down the middle spills nearly everything, for free, because a vertical line
 * crosses every band on its way. Nobody wrote the bisection down.
 *
 * The fractions are measured from the TOP of the sprite. They are deliberately a
 * person's proportions rather than any particular monster's — every mob that can
 * be cleaved is roughly upright and roughly humanoid (`EnemyDef.anatomy`), and a
 * per-monster anatomy would be an authoring burden paid on every mob a mod adds
 * for a difference nobody can see at sixteen pixels.
 */
const ANATOMY_BANDS: readonly {
  id: string;
  from: number;
  to: number;
  spills: readonly string[];
}[] = [
  { id: "skull", from: 0, to: 0.2, spills: ["gib_brain", "gib_skull"] },
  { id: "neck", from: 0.2, to: 0.3, spills: ["gib_skull", "gib_meat_0"] },
  { id: "chest", from: 0.3, to: 0.5, spills: ["gib_heart", "gib_ribs"] },
  {
    id: "belly",
    from: 0.5,
    to: 0.68,
    spills: ["gib_gut_0", "gib_liver", "gib_gut_1"],
  },
  { id: "hips", from: 0.68, to: 0.82, spills: ["gib_kidney", "gib_meat_1"] },
  { id: "legs", from: 0.82, to: 1, spills: ["gib_bone", "gib_meat_0"] },
];

/** The four bearings a cut may run at. Not a style choice: `splitSprite`
 * quantizes into eight buckets and these are the four it lands on exactly, and
 * a cut at an arbitrary angle is mush at sixteen pixels whatever the physics
 * says. The ROLL is over these; everything else about a cut is continuous. */
const CUT_ANGLES = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];

/** How far from the middle a cut may fall, as a fraction of the body along the
 * cut's own normal. Just short of the edge: a cut at 0.5 misses the body
 * entirely and draws one whole corpse and one empty canvas. */
const CUT_OFFSET_MAX = 0.44;

/** THE FORCE LADDER, and it is one number rather than twenty. A weak cleave may
 * only land near an EXTREMITY — it takes a head or a pair of legs off, which is
 * what a blade that just barely went through does. As the blow grows the whole
 * body opens up to it, and only a monstrous one can take a man through the
 * middle. So the escalation the authored table spelled out row by row falls out
 * of where the cut is ALLOWED to land. */
const CUT_CENTRE_FORCE = 2.4;

/** A piece smaller than this fraction of the body is a LIMB rather than a half,
 * and is treated as one: thrown clear if it came off the top (a head has
 * nowhere to stand), left standing where it was if it came off the bottom (a
 * pair of legs is already on the floor). Both of the two most memorable cuts in
 * the game — the beheading and the man walking out from under himself — are
 * this one rule, and neither is written down anywhere. */
const CUT_LIMB_FRAC = 0.32;

/** How often a cut goes in OBLIQUELY — through the body's depth rather than
 * flat across the screen — and how far round it goes when it does. A minority on
 * purpose: a body opening across the screen is the legible picture and has to
 * stay the common one, while the oblique slice is the surprise that says the
 * blade went through something solid. Never below a third, because a slice too
 * shallow to show a face is a flat cut that cost a canvas. */
const OBLIQUE_CHANCE = 0.22;
const OBLIQUE_MIN = 0.35;
/** …and never all the way through, either: at a full slab the far piece starts
 * at the body's own edge and there is nothing left of it to draw, so the cut
 * loses a half instead of gaining a dimension. */
const OBLIQUE_MAX = 0.8;

/** How many organs a cut may spill however many bands it went through. A
 * bisection crosses all six and would otherwise empty a fishmonger's onto the
 * floor; five is a mess with pieces you can still tell apart. */
const SPILL_MAX = 5;

/** How much of its cell a body actually fills ACROSS — a humanoid sprite is a
 * narrow column in a square frame, not a square. It is what decides how many
 * bands a SLANTED cut passes through, and getting it wrong is not subtle:
 * measured against the frame's diagonal instead, every diagonal crosses the
 * whole body, every cut spills everything, and the entire "it spills what it
 * went through" rule quietly evaporates into one anonymous pile. */
const BODY_WIDTH_FRAC = 0.55;

/**
 * WHICH CUT THIS BLOW MADE — rolled, not chosen from a list.
 *
 * The bearing picks the FAMILY (a blade that swept down the screen cannot open
 * a body sideways, or the weapon visibly goes one way and the wound the other),
 * the force decides how near the MIDDLE the cut may fall, and the seed rolls the
 * rest. Everything else — which pieces part, which is thrown clear, which stays
 * standing, how far they go and what falls out of the opening — is DERIVED from
 * where the line landed.
 */
export function cleaveCut(
  heading: number,
  force: number,
  seed: number,
  anatomy: Anatomy = "humanoid",
): CleaveCut {
  const h = (salt: number) => fract(seed * salt + 0.317);
  const lengthwise = Math.abs(Math.cos(heading)) > Math.abs(Math.sin(heading));
  // A blade that swept down the screen cuts down or diagonally; one that swept
  // across cuts across or diagonally. The diagonals are in both families, which
  // is why they are the commonest cut in the game — as they should be, since a
  // diagonal is what a swing actually does.
  const angles = lengthwise
    ? [Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4]
    : [0, Math.PI / 4, (3 * Math.PI) / 4];
  const angle = angles[Math.floor(h(3.7) * angles.length)] ?? CUT_ANGLES[0]!;
  // WHERE it landed. A weak blow is pushed out to an extremity; a strong one may
  // land anywhere. `inner` is the nearest to the middle this blow has earned.
  const inner = Math.max(0, CUT_OFFSET_MAX * (1 - force / CUT_CENTRE_FORCE));
  const magnitude = inner + (CUT_OFFSET_MAX - inner) * h(5.9);
  const offset = (h(7.3) < 0.5 ? -1 : 1) * magnitude;
  // The two pieces, measured along the cut's normal: the cut sits at `offset`
  // from the middle, so the piece on the negative side is `0.5 + offset` of the
  // body and the other is `0.5 - offset`.
  const negative = 0.5 + offset;
  const positive = 0.5 - offset;
  // A LIMB comes off; a HALF parts. Which of the two it is falls out of where
  // the line landed, and so does what happens to it: a small piece off the TOP
  // is thrown clear, a small piece off the BOTTOM is left standing.
  const across = Math.abs(Math.sin(angle)) < 0.5;
  const smallSide: -1 | 1 | null =
    negative < CUT_LIMB_FRAC ? -1 : positive < CUT_LIMB_FRAC ? 1 : null;
  const toss = smallSide === -1 ? -1 : null;
  const pinned = smallSide === 1 && across ? 1 : null;
  // A limb parts further than a half does — it is lighter, and it has to clear
  // the body it came off. A half keels most of the way over; a limb barely
  // turns, because a rotating stump reads as a body rather than as a piece.
  const limb = smallSide !== null;
  // HOW OBLIQUE. Most cuts are flat — a body opening across the screen is the
  // legible one and has to stay the common case — but a fifth of them go in at
  // an angle and come out somewhere else, which is the one cut that reads as
  // having gone THROUGH a solid body rather than across a picture of one. A
  // limb coming off is never oblique: the illusion needs a piece big enough to
  // show a face.
  const oblique = !limb && h(9.31) < OBLIQUE_CHANCE;
  const depth = oblique
    ? OBLIQUE_MIN + (OBLIQUE_MAX - OBLIQUE_MIN) * h(11.7)
    : 0;
  return {
    // Named for what the blade went through, which is what a debug line, a
    // gallery caption and a failing test all want to say.
    id: `${bandsCrossed(angle, offset)
      .map((b) => b.id)
      .join("-")}/${Math.round((angle * 180) / Math.PI)}`,
    angle,
    offset,
    spread: limb ? 0.5 : 0.3,
    tip: limb ? Math.PI / 5 : Math.PI / 2.8,
    toss,
    pinned,
    force,
    lengthwise,
    depth,
    // An OBLIQUE slice goes through the whole thickness of a body, so it opens
    // everything the line crosses on screen AND everything behind it — which is
    // to say all of it. A flat cut only opens what it crossed.
    spills:
      depth > 0
        ? spillsFor(angle, offset, seed, anatomy, true)
        : spillsFor(angle, offset, seed, anatomy),
  };
}

/**
 * The bands a cut line passes through inside the sprite.
 *
 * A cut straight across sits at one height and crosses one band; a cut straight
 * down runs the length of the body and crosses all six; a diagonal crosses the
 * span in between. That is the whole rule, and it is why a bisection spills
 * everything without anybody having said so.
 */
function bandsCrossed(
  angle: number,
  offset: number,
): readonly (typeof ANATOMY_BANDS)[number][] {
  // The line runs through `offset` along its normal, in the direction `angle`.
  // How far it reaches UP AND DOWN is how much height it gains crossing the
  // body's WIDTH: none at all for a cut straight across (it stays at one
  // height), the whole body for one straight down, and the width times the
  // slope for a diagonal.
  const mid = offset * Math.cos(angle);
  const sin = Math.abs(Math.sin(angle));
  const cos = Math.abs(Math.cos(angle));
  const span = cos < 1e-6 ? 1 : Math.min(1, (BODY_WIDTH_FRAC * sin) / cos);
  const half = span / 2;
  // As fractions from the TOP of the sprite, clamped inside it.
  const lo = Math.max(0, mid - half + 0.5);
  const hi = Math.min(1, mid + half + 0.5);
  const hit = ANATOMY_BANDS.filter((b) => b.to > lo && b.from < hi);
  // A cut that somehow fell outside every band still went through SOMETHING.
  return hit.length > 0
    ? hit
    : [
        ANATOMY_BANDS.find((b) => mid + 0.5 <= b.to) ??
          ANATOMY_BANDS[ANATOMY_BANDS.length - 1]!,
      ];
}

/** What falls out: every band the blade passed through, capped and shuffled off
 * the seed so a cut through half a body is a mess rather than an inventory. */
function spillsFor(
  angle: number,
  offset: number,
  seed: number,
  anatomy: Anatomy,
  everything = false,
): readonly string[] {
  // Deduped: two neighbouring bands may name the same organ (a skull is in the
  // head band and at the top of the neck), and a cut that crossed both should
  // not spill two of it.
  const pool = [
    ...new Set(
      (everything ? ANATOMY_BANDS : bandsCrossed(angle, offset))
        .flatMap((b) => b.spills)
        .filter((sprite) => anatomy === "humanoid" || !HUMAN_ONLY.has(sprite)),
    ),
  ];
  if (pool.length <= SPILL_MAX) return pool;
  const picked: string[] = [];
  const taken = new Set<number>();
  for (let i = 0; picked.length < SPILL_MAX && i < pool.length * 3; i++) {
    const at = Math.floor(fract(seed * 2.71 + i * 9.13) * pool.length);
    if (taken.has(at)) continue;
    taken.add(at);
    picked.push(pool[at]!);
  }
  return picked;
}

/** A typical body's size across, in world px — what a cut's `offset` fraction is
 * measured against for the FLOOR's benefit. The renderer measures the same
 * offset against the victim's actual sprite; this is the one place a nominal
 * body is good enough, because the difference is a few px against a scatter of
 * dozens. */
/** How far a piece SPILLED out of a cut carries, at no force and per unit of
 * it, and how high it hops. Far shorter than a burst's throw and far lower: this
 * is offal falling out of an opening, not a body being blown apart, and a liver
 * that sailed across the room would read as the wrong effect entirely. */
const CUT_SPAN_PX = 18;

const SPILL_REACH_BASE = 13;
const SPILL_REACH_PER_FORCE = 8;
const SPILL_ARC_FRAC = 0.3;
/** The half-angle they spill into. Wide: four organs out of one opening on the
 * same bearing land in a pile that reads as one anonymous red lump, which is
 * exactly what naming the pieces was supposed to fix. */
const SPILL_CONE = 2.4;

/**
 * What falls out of a cut — the gore the blade went through, tumbling out of the
 * opening and landing at the body's feet.
 *
 * They are ordinary `GorePiece`s, so they ride the same flight, the same
 * bounces and the same `landingSpots` the burst's pieces do: the floor is wetted
 * under each one, and a heart lands on its own blood exactly as a burst's does.
 * That reuse is the whole reason the cleave and the burst share a shape.
 */
function spillPieces(
  cut: CleaveCut,
  force: number,
  body: number,
  seed: number,
): GorePiece[] {
  return cut.spills.map((sprite, n) => {
    const h = (salt: number) => fract((n + 1) * salt + seed * 2.29);
    // Out of the cut and down: offal falls, it does not fly. Spread wide, and
    // over a wide range of distances, so four pieces out of one opening land as
    // four pieces rather than as a pile.
    const angle = (h(1.77) - 0.5) * 2 * SPILL_CONE;
    const reach = (SPILL_REACH_BASE + SPILL_REACH_PER_FORCE * force) * body;
    const dist = reach * (0.45 + 0.55 * h(3.31));
    return {
      sprite,
      angle,
      dist,
      peak: 3 + dist * SPILL_ARC_FRAC,
      spins: h(5.13) < 0.5 ? 0 : 1,
      bounces: BOUNCY.has(sprite) ? 1 : 0,
      // They come out as the cut opens rather than at the instant of the blow.
      delay: 0.06 + h(6.7) * 0.2,
      flight: 0.35 + 0.2 * h(4.9),
    };
  });
}

/** One thing thrown clear of a burst body. */
export type GorePiece = {
  /** The authored gore sprite, or null for a shred of the victim's OWN art —
   * `render/gibs.ts` cuts those with `shredSprite` so a burst throws pieces of
   * the thing it burst rather than of a generic body. */
  sprite: string | null;
  /** Bearing it flies on, in world radians. */
  angle: number;
  /** World px between the body and where the piece finally comes to rest,
   * bounces included. What `bloodSpills` wets, and where the piece ends up. */
  dist: number;
  /** How high the first hop carries, in world px. */
  peak: number;
  /** Whole turns it tumbles across the whole flight. */
  spins: number;
  /** Extra hops after the first landing: 0 for anything wet, 1–2 for anything
   * dense enough to kick back up off the floor. */
  bounces: number;
  /** Fraction of the burst's length the piece waits before it leaves the body
   * — a burst that threw everything on frame one reads as a still image that
   * moved. */
  delay: number;
  /** How long its flight lasts, as a fraction of the burst. */
  flight: number;
};

/** Everything one burst body throws. */
export type GoreBurst = {
  kind: GoreKind;
  /** The blow's bearing (away from whoever landed it). The cut runs along it;
   * a burst throws widest across it. */
  heading: number;
  /** How hard the blow was, in the victim's own healthbars (`BloodBlow.force`)
   * — how far the pieces carry and how many there are. */
  force: number;
  /** The victim's build multiplier (`BloodBlow.body`) — a boss's pieces are
   * bigger and travel further. */
  body: number;
  /** The pieces, in the order they leave. */
  pieces: readonly GorePiece[];
  /** The seed everything above was derived from, so a redraw is identical. */
  seed: number;
  /** How many fragments of the victim's own sprite ride along with them. */
  shreds: number;
  /** WHICH WAY THE BLADE WENT THROUGH — rolled by `cleaveCut` from the blow's
   * own bearing, its force and the seed. Null on a burst, which has no cut to
   * make. */
  cut: CleaveCut | null;
  /** Where the pieces come FROM, in world px from the body's own middle. Zero
   * for a burst (the whole body went at once); the CUT's own point for a cleave,
   * so a skull spills out of the neck rather than out of the navel — and so the
   * floor is wetted there, since `landingSpots` adds it. */
  origin: { x: number; y: number };
};

/** THE DENSE PIECES — what kicks back up off the floor. A heart is muscle, a
 * kidney is rubber, a skull and a rib and a bone shard are bone. */
const BOUNCY = new Set([
  "gib_skull",
  "gib_ribs",
  "gib_bone",
  "gib_heart",
  "gib_kidney",
]);

/** EVERY GIB IS SOMETHING THAT WAS ON THE INSIDE, and that is a rule rather
 * than an oversight. There is no severed head, no hand, no foot and no arm in
 * any pool here, because the victim's OWN SPRITE is already supplying those:
 * `splitSprite` hands the cleave two halves of the actual monster and
 * `shredSprite` hands the burst a fistful of its actual fragments, all of them
 * in its own colours, wearing its own gear, for every mob in the game and every
 * mob a mod adds. An authored generic head thrown beside them is a SECOND,
 * worse answer to a question already answered — and a wrong one the moment the
 * monster is not the shape that head was drawn as.
 *
 * So the authored gore is exactly what a sprite cannot show: the organs, the
 * viscera, the bone and the meat that were never on the outside to be drawn. */

/** The pieces only a PERSON has. The rest — a heart, a liver, a gut, a kidney,
 * bone, meat — is in anything warm-blooded, so a beast throws all of it. A
 * cranium with a row of human teeth in it is not in a giant lizard. */
const HUMAN_ONLY = new Set(["gib_skull"]);

/** The SIGNATURE pieces, worst first: a body only gives up so many recognisable
 * parts, and which ones it gives up is how a burst reads as an escalation. Each
 * is thrown at most once, and only once the blow is worth the `force` beside it
 * — so a bare burst is meat and gut, and a truly obscene one is a person coming
 * apart into their own inventory. */
const SIGNATURE: readonly { sprite: string; force: number }[] = [
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
];

/** The FILLER pool — the shower of small stuff every burst throws a lot of,
 * picked at random with the weights below (meat is most of a body). */
const FILLER: readonly { sprite: string; weight: number }[] = [
  { sprite: "gib_meat_0", weight: 5 },
  { sprite: "gib_meat_1", weight: 3 },
  { sprite: "gib_gut_1", weight: 2 },
  { sprite: "gib_bone", weight: 2 },
  { sprite: "gib_kidney", weight: 2 },
  { sprite: "gib_gut_0", weight: 1 },
];
const FILLER_TOTAL = FILLER.reduce((sum, f) => sum + f.weight, 0);

/** How many filler pieces fly, at no force and per unit of it, and the draw
 * budget on top: a screen-clearing bomb bursts a whole horde at once, so no
 * single body may put a hundred sprites in the air. */
const FILLER_BASE = 3;
const FILLER_PER_FORCE = 2;
const FILLER_MAX = 16;

/** Fragments of the victim's own sprite thrown along with the gore — the thing
 * that keeps a burst looking like THIS mob rather than like a generic body. */
const SHREDS_BASE = 3;
const SHREDS_PER_FORCE = 2;
const SHREDS_MAX = 9;

/** World px a piece carries, at no force and per unit of it. Deliberately
 * SHORTER than the blood spray reaches: blood atomizes and drifts, a leg does
 * not, and a burst whose solids outran its own spray reads as a firework. */
const REACH_BASE = 20;
const REACH_PER_FORCE = 30;

/** How high a piece hops, as a fraction of the ground it covers, and the
 * ceiling on it — the same shape the loot toss uses, for the same reason (a
 * long throw must not sail out of the viewport). */
const ARC_FRAC = 0.34;
const ARC_MAX = 34;

/** The half-angle a burst throws into. Nearly a full circle: a body that bursts
 * goes everywhere, unlike a spray, which comes off the side that was hit. The
 * blow's heading still gets the longest pieces (see `dist` below), so the
 * direction of the blow is legible without the burst being a fan. */
const BURST_CONE = 2.6;

/** How much further a piece thrown ALONG the blow carries than one thrown back
 * against it. */
const FOLLOW_THROUGH = 0.55;

/** How long a whole burst takes, ms — flight, bounces and settling. */
export const GORE_BURST_MS = 900;
/** How long a cleave's two halves take to come apart and settle, ms. */
export const CLEAVE_MS = 1100;

/**
 * Build the burst one killing blow throws.
 *
 * `force` is `BloodBlow.force` — the blow in the victim's own healthbars, the
 * same number the spray, the pool and the corpse launch are all priced on, so
 * the gore can never disagree with the blood about how bad the hit was.
 */
export function goreBurst(
  kind: GoreKind,
  heading: number,
  force: number,
  body: number,
  anatomy: Anatomy,
  seed: number,
): GoreBurst {
  const cut =
    kind === "cleave" ? cleaveCut(heading, force, seed, anatomy) : null;
  // A BURST throws the whole body; a CLEAVE spills what the blade went through
  // out of the opening it made. Both are `GorePiece`s, so both ride the same
  // flight and both wet the floor where they land.
  const pieces: GorePiece[] = cut
    ? spillPieces(cut, force, body, seed)
    : kind === "gib"
      ? gibPieces(force, body, anatomy, seed)
      : [];
  return {
    kind,
    heading,
    force,
    body,
    pieces,
    seed,
    cut,
    // The cut's own point on the body, along the cut's normal. The renderer
    // measures the same offset against the sprite; this is the world-px
    // equivalent the FLOOR is wetted at, and a few px either way is invisible
    // beside a piece's own scatter.
    origin: cut
      ? {
          x: Math.cos(cut.angle + Math.PI / 2) * cut.offset * CUT_SPAN_PX,
          y: Math.sin(cut.angle + Math.PI / 2) * cut.offset * CUT_SPAN_PX,
        }
      : { x: 0, y: 0 },
    shreds:
      kind === "gib"
        ? Math.min(
            SHREDS_MAX,
            Math.round(SHREDS_BASE + SHREDS_PER_FORCE * Math.max(0, force - 1)),
          )
        : 0,
  };
}

/** The pieces a burst body throws: its signature parts, then the shower. */
function gibPieces(
  force: number,
  body: number,
  anatomy: Anatomy,
  seed: number,
): GorePiece[] {
  const pieces: GorePiece[] = [];
  let n = 0;
  for (const entry of SIGNATURE) {
    if (force < entry.force) continue;
    if (anatomy !== "humanoid" && HUMAN_ONLY.has(entry.sprite)) continue;
    pieces.push(piece(entry.sprite, n++, force, body, seed));
  }
  const filler = Math.min(
    FILLER_MAX,
    Math.round(
      (FILLER_BASE + FILLER_PER_FORCE * Math.max(0, force - 0.5)) * body,
    ),
  );
  for (let i = 0; i < filler; i++) {
    pieces.push(piece(pickFiller(n, seed), n++, force, body, seed));
  }
  return pieces;
}

/** Which filler sprite the `n`th piece is, by weight. */
function pickFiller(n: number, seed: number): string {
  let roll = fract(n * 3.71 + seed * 5.17) * FILLER_TOTAL;
  for (const entry of FILLER) {
    roll -= entry.weight;
    if (roll <= 0) return entry.sprite;
  }
  return FILLER[0]!.sprite;
}

/** One piece's whole flight, derived from its index and the burst's seed. */
function piece(
  sprite: string,
  n: number,
  force: number,
  body: number,
  seed: number,
): GorePiece {
  const h = (salt: number) => fract((n + 1) * salt + seed * 1.37);
  // Where it goes. The bearing is measured from the BLOW, and how far it
  // carries falls off as it turns back against it, so a burst reads as having a
  // direction without being a cone.
  const angle = (h(1.61) - 0.5) * 2 * BURST_CONE;
  const along = 1 - FOLLOW_THROUGH * (Math.abs(angle) / BURST_CONE);
  const reach = (REACH_BASE + REACH_PER_FORCE * force) * body;
  const dist = reach * along * (0.35 + 0.65 * h(2.93));
  const bounces = BOUNCY.has(sprite) ? (h(6.13) < 0.45 ? 2 : 1) : 0;
  return {
    sprite,
    angle,
    dist,
    peak: Math.min(ARC_MAX, 8 + dist * ARC_FRAC),
    // A long piece turns over as it flies; the small wet ones mostly just sail.
    spins: 1 + Math.floor(h(4.31) * 2),
    bounces,
    // The signature pieces leave FIRST (they are the ones being read) and the
    // shower follows over the next fraction of the burst.
    delay: Math.min(0.3, h(5.53) * 0.26),
    flight: 0.4 + 0.25 * h(7.19),
  };
}

/**
 * Where a piece is, `t` through the burst — its distance along its own bearing,
 * how high off the ground it is, and how far it has turned. All closed-form off
 * `t`, all in world px.
 *
 * The BOUNCE is the one thing here that is not the loot toss: after the first
 * landing a dense piece kicks up again, each hop covering a fraction of the one
 * before it in both reach and height, until it is out of them and skitters to a
 * stop. It is done as a geometric split of the piece's OWN total distance
 * rather than as extra travel bolted on the end, so `dist` stays the honest
 * answer to "where does this end up" — which is what the floor's blood is
 * placed on.
 */
export function piecePose(
  gib: GorePiece,
  t: number,
): { dist: number; lift: number; spin: number; landed: boolean } {
  const start = gib.delay;
  const end = Math.min(1, gib.delay + gib.flight);
  if (t <= start) return { dist: 0, lift: 0, spin: 0, landed: false };
  const p = Math.min(1, (t - start) / Math.max(0.001, end - start));
  const hops = gib.bounces + 1;
  // Each hop is `DECAY` of the one before it, in reach, height and duration.
  const DECAY = 0.42;
  let total = 0;
  for (let i = 0; i < hops; i++) total += DECAY ** i;
  // Which hop `p` is in, and how far through it.
  let acc = 0;
  for (let i = 0; i < hops; i++) {
    const share = DECAY ** i / total;
    if (p <= acc + share || i === hops - 1) {
      const local = Math.min(1, (p - acc) / share);
      const covered = (acc + share * local) * gib.dist;
      const height = gib.peak * DECAY ** i;
      return {
        dist: covered,
        // The parabola over this hop — the loot toss's own `4p(1-p)`.
        lift: 4 * local * (1 - local) * height,
        // It stops turning once it is done bouncing: a head that kept spinning
        // where it lay would read as a bug rather than as a head.
        spin: gib.spins * Math.PI * 2 * p,
        landed: p >= 1,
      };
    }
    acc += share;
  }
  return {
    dist: gib.dist,
    lift: 0,
    spin: gib.spins * Math.PI * 2,
    landed: true,
  };
}

/**
 * Where every piece of `burst` comes to rest, in world px relative to the body.
 * The floor's blood is laid at exactly these spots (see `event-fx.ts`), so a
 * gib always lands ON its own spatter rather than beside it.
 *
 * The ground plane is seen at a shallow angle, so a scatter lands wider than it
 * is deep — the same `FLATTEN` squash the spray, the dust and every ground ring
 * use. It is applied HERE rather than in the renderer precisely because the
 * blood has to agree with it.
 */
const FLATTEN = 0.42;
export function landingSpots(
  burst: GoreBurst,
): readonly { x: number; y: number }[] {
  return burst.pieces.map((gib) => {
    const ang = burst.heading + gib.angle;
    return {
      x: burst.origin.x + Math.cos(ang) * gib.dist,
      y: burst.origin.y + Math.sin(ang) * gib.dist * FLATTEN,
    };
  });
}

/** The squash every gore scatter is laid out under — shared with the renderer
 * so the flight and the stain use one number. */
export const GORE_FLATTEN = FLATTEN;
