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
};

/** THE DENSE PIECES — what kicks back up off the floor. A heart is muscle, a
 * kidney is rubber, a skull and a rib and a bone shard are bone. */
const BOUNCY = new Set([
  "gib_head_0",
  "gib_head_1",
  "gib_head_2",
  "gib_ribs",
  "gib_bone",
  "gib_heart",
  "gib_kidney",
]);

/** The three ruined heads, picked between off the seed so a cleared room is not
 * a row of identical faces. */
const HEADS = ["gib_head_0", "gib_head_1", "gib_head_2"];

/** The pieces only a PERSON has. A beast keeps its meat, gut, bone and organs
 * and throws none of these — a giant lizard has no hands, and the face in that
 * sprite is not its face. */
const HUMAN_ONLY = new Set([
  ...HEADS,
  "gib_arm",
  "gib_hand",
  "gib_foot",
  "gib_shin",
]);

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
  { sprite: "gib_hand", force: 1.6 },
  { sprite: "gib_heart", force: 1.9 },
  { sprite: "gib_shin", force: 2.2 },
  { sprite: "gib_foot", force: 2.6 },
  { sprite: "__head__", force: 3 },
  { sprite: "gib_arm", force: 3.6 },
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
  const pieces: GorePiece[] =
    kind === "gib" ? gibPieces(force, body, anatomy, seed) : [];
  return {
    kind,
    heading,
    force,
    body,
    pieces,
    seed,
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
    const sprite =
      entry.sprite === "__head__"
        ? (HEADS[Math.floor(fract(seed * 4.77) * HEADS.length)] ?? HEADS[0]!)
        : entry.sprite;
    if (anatomy !== "humanoid" && HUMAN_ONLY.has(sprite)) continue;
    pieces.push(piece(sprite, n++, force, body, seed));
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
      x: Math.cos(ang) * gib.dist,
      y: Math.sin(ang) * gib.dist * FLATTEN,
    };
  });
}

/** The squash every gore scatter is laid out under — shared with the renderer
 * so the flight and the stain use one number. */
export const GORE_FLATTEN = FLATTEN;
