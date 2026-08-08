// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PERSON GENERATOR — every body on the road to GOODCO, ruled from a spec
// rather than drawn.
//
// WHY GENERATED AND NEVER HAND-DRAWN. The crowd is twenty people in two frames
// each, plus the riders, plus the drivers who come out through windscreens —
// and the twenty-first is whatever gets added next week. Drawing them means a
// crowd that can only grow at the speed somebody can pixel a body, and, worse, a
// crowd where retuning the ground line means opening forty files. It also means
// a crowd that DRIFTS: every walker in this game already carries a header
// saying it was "built from one of six shared silhouette templates", and that
// template lived nowhere but in prose. Copying it by hand is exactly how five
// drivers arrived a head-width narrow with no faces on them.
//
// So a person ships a SPEC and earns their picture, exactly as a building ships
// a def and earns its shell (`facade.mjs`), a vehicle ships one grid and earns
// its wrecks (`wreck.mjs`), and an enemy ships two frames and earns its wounds
// (`damage.mjs`).
//
// IT IS ALSO THE RIGHT TOOL FOR THIS PARTICULAR SUBJECT, which is worth saying
// out loud because "generated art" is usually a confession. What makes a crowd
// read as a crowd is entirely regular: every body stands on ONE ground line,
// every head sits at ONE gauge off it, every outline is ONE weight, and every
// stride swings the same way. Those are the things a hand gets wrong at 16 px
// and a loop gets right every time. What a hand is better at — a mohawk, a
// walking frame, a guide dog, a pram — is exactly what is NOT ruled here: the
// parts bin next door (`person-parts.mjs`) is drawn shape by shape, and the body
// is what it all hangs on.
//
// FIVE AXES, AND THEY ARE THE FIVE THINGS YOU NOTICE ABOUT SOMEBODY AT A
// GLANCE:
//
//   AGE      a young adult is slighter, an elder stoops and stands closer to
//            their own feet. It moves the GAUGE — every landmark on the body —
//            which is why it cannot be a palette swap. There is no CHILD age and
//            there is not going to be one; see `AGES`.
//   BUILD    thin, average, heavy. It moves the WIDTH, and the arms move with
//            it, because an arm hangs off a shoulder rather than at a column
//            number.
//   HAIR     the crown, the cap, the hood, the helmet — the loudest thing about
//            a 16 px person and the cheapest to vary.
//   CLOTHES  what the torso and legs are filled with: a coat that reaches the
//            knees, a skirt that flares, a hi-vis band across the chest.
//   AID and  a cane, a white stick, crutches, a frame, a guide dog — and a bag,
//   CARRY    a briefcase, a pram, a trolley, a board.
//
// THE ROAD IS FULL OF PEOPLE THE WELFARE DID NOT REACH, and the aids are in the
// axis list rather than bolted on for that reason: a crowd of twenty able-bodied
// adults is a crowd somebody forgot to think about, and this is the road the
// whole joke is told on.
//
// NOTHING HERE ROLLS ITS OWN DICE. A spec is a spec; two builds of the same spec
// are byte-identical, which is what keeps `make assets` from churning the atlas
// on every unrelated commit.

import { AIDS, CARRY, HAIR, KEEP } from "./person-parts.mjs";

/** The canvas every person is drawn on. */
export const PERSON_SIZE = 16;

/** The column the body is centred between — 16 px has no middle column, so a
 * half-width `h` covers `8 - h` … `7 + h`. */
const LEFT = 8;
const RIGHT = 7;

/**
 * THE GAUGE, BY AGE — where each landmark sits, in rows from the top.
 *
 * `foot` is 13 for everybody and that is the one number that may never vary: a
 * crowd whose members do not share a ground line reads as a bug rather than as a
 * crowd, and it is the single most common way generated bodies go wrong. What
 * age changes is where the HEAD is, which is the same thing as how tall somebody
 * is, and how big it is relative to the rest of them.
 */
export const AGES = {
  /**
   * A SLIGHT YOUNG ADULT — a row shorter than the rest and narrower through the
   * shoulders, which is the youngest body this generator can draw.
   *
   * AND THERE IS DELIBERATELY NOTHING UNDER IT. A `child` age is four numbers
   * and it is not here, because the one road this draws people for is a road you
   * drive down at a hundred and seventy killing everybody on it. The whole joke
   * is that the hero does not notice — he arrives and remarks on the SUSPENSION
   * — and that only holds while the crowd is adults who could, in principle,
   * have stepped back. A child under the bumper is not the same joke told
   * harder; it is a different thing entirely, and not one this game is making.
   *
   * It is ABSENT rather than merely unused, which is the same move
   * `townArtSizeCheck` makes next door: the roster cannot ask for one, so nobody
   * has to remember not to.
   */
  young: {
    headTop: 2,
    shoulder: 6,
    hip: 10,
    foot: 13,
    headHalf: 3,
    torsoHalf: 3,
  },
  adult: {
    headTop: 1,
    shoulder: 5,
    hip: 10,
    foot: 13,
    headHalf: 3,
    torsoHalf: 4,
  },
  /** A row shorter and a shade rounder. */
  older: {
    headTop: 2,
    shoulder: 6,
    hip: 10,
    foot: 13,
    headHalf: 3,
    torsoHalf: 4,
  },
  /** …and stooped: the head comes FORWARD as well as down, which is the read
   * that a shorter adult does not give you. */
  elder: {
    headTop: 2,
    shoulder: 6,
    hip: 10,
    foot: 13,
    headHalf: 3,
    torsoHalf: 4,
    stoop: 1,
  },
};

/** How much wider than average, in px either side of the centre line. The arms
 * hang off the shoulder rather than at a fixed column, so they move with it. */
export const BUILDS = { thin: -1, average: 0, heavy: 1 };

/**
 * GENDER — the TAPER of the torso, and the hair somebody gets when the spec
 * does not say.
 *
 * IT IS A SILHOUETTE AXIS, NOT A PALETTE ONE. At sixteen pixels there is very
 * little of a person to work with and almost none of it is colour, so what this
 * moves is the only thing that can carry the read: how the torso goes from the
 * shoulders to the hips. Broad at the top and narrow at the waist, or narrow at
 * the top and wide at the hip. One pixel each way, which does not sound like
 * much and is most of the difference on a body this size — and it is why the
 * torso is drawn as a TAPER at all rather than as a box, which it was until this
 * axis existed.
 *
 * `hair` is a DEFAULT and never a lock. It is here because the correlation is
 * real and leaving it to every call site means every call site forgets it: a
 * woman gets long hair, an older woman gets it cut short, an older man's goes
 * thin and an elderly one's goes altogether. Any spec that names its own `hair`
 * overrides the lot — a woman with a shaved head is a person, not an error, and
 * the roster has to be able to say so.
 *
 * COLOUR IS NOT HERE, and cannot be: "short grey hair" is a short crop with grey
 * in the sprite's own `H` slot, and the palette belongs to the person's YAML
 * rather than to the ruler. The generator draws WHERE the hair is; the roster
 * says what colour it went.
 */
export const GENDERS = {
  /** Broader at the shoulder than at the hip. */
  man: {
    shoulder: 0,
    hip: -1,
    hair: {
      young: "crop",
      adult: "crop",
      older: "thinning",
      elder: "bald",
    },
  },
  /** …and the other way about. */
  woman: {
    shoulder: -1,
    hip: 0,
    hair: {
      young: "long",
      adult: "long",
      older: "crop",
      elder: "crop",
    },
  },
  /** Neither read is asked for — the body stays a straight column and the hair
   * is whatever the spec says. Its own entry rather than a missing value,
   * because plenty of the crowd is a coat at forty paces and the roster should
   * not have to pick a side to draw one. */
  unspecified: {
    shoulder: 0,
    hip: 0,
    hair: {
      young: "crop",
      adult: "crop",
      older: "crop",
      elder: "thinning",
    },
  },
};

/**
 * WHAT THE BODY IS WEARING — flags on the same ruled torso rather than a second
 * skeleton, because a coat does not change where somebody's shoulders are.
 *
 * `panel` is the garment's front: the band of `S` down the chest that stops a
 * torso reading as a rectangle of one colour. `legs` is what the lower half is
 * filled with and how far the garment reaches down it.
 */
export const GARMENTS = {
  /** An open shirt or jacket over a lighter front. The default. */
  shirt: { panel: "wide", legs: "trousers" },
  /** A suit — the panel narrows to lapels and a shirt between them. */
  suit: { panel: "narrow", legs: "trousers" },
  /** A hood up, and a big pocket across the middle. */
  hoodie: { panel: "wide", legs: "trousers" },
  /** A coat to the knee: the top's own colour carries down past the hips and
   * the legs are only the last two rows of it. */
  coat: { panel: "wide", legs: "coat" },
  /** A skirt, which FLARES — the one garment whose silhouette is wider at the
   * bottom than the top, and the reason it is worth having at all. */
  skirt: { panel: "wide", legs: "skirt" },
  /** A hi-vis over-jacket: a reflective band straight across the chest, which
   * at this size is a brighter read than any amount of colour. */
  hivis: { panel: "band", legs: "trousers" },
  /** A tracksuit — a stripe down the outside of the sleeve and the leg. */
  tracksuit: { panel: "none", legs: "trousers", stripe: true },
  /** Overalls: the panel runs from the chest to the hem in one piece. */
  overalls: { panel: "bib", legs: "trousers" },
  /** Seated, belted, behind a windscreen. Its own entry because the LEGS are
   * folded forward rather than standing — see `paintSeated`. */
  seated: { panel: "belt", legs: "seated" },
};

/** How wide the body is at a given row — the shoulder's width at the top, the
 * hip's at the bottom, and a straight walk between them. */
function torsoHalfAt(cfg, y) {
  const { hip, shoulderHalf, hipHalf } = cfg;
  // THE TAPER HAPPENS BELOW THE ARMS, and that is not a detail. An arm hangs
  // straight down at the shoulder's own width; a torso that narrowed under it
  // put its own outline one column inside the arm's, and the two of them read as
  // a two-pixel black stripe down the ribs. So the chest stays the shoulder's
  // width for as long as there is an arm beside it, and the whole of the taper
  // is spent on the last rows into the hip — which is where a waist is anyway.
  const waist = hip - 1;
  if (y < waist) return shoulderHalf;
  const t = Math.min(1, Math.max(0, (y - waist) / Math.max(1, hip - waist)));
  return Math.round(shoulderHalf + (hipHalf - shoulderHalf) * t);
}

/** A blank canvas. */
function blank() {
  return Array.from({ length: PERSON_SIZE }, () =>
    Array(PERSON_SIZE).fill("."),
  );
}

/** Paint a run of cells on one row, and outline it either side. */
function span(rows, y, from, to, ch, ink = "O") {
  if (y < 0 || y >= PERSON_SIZE) return;
  for (let x = from; x <= to; x++) {
    if (x >= 0 && x < PERSON_SIZE) rows[y][x] = ch;
  }
  if (ink) {
    if (from - 1 >= 0) rows[y][from - 1] = ink;
    if (to + 1 < PERSON_SIZE) rows[y][to + 1] = ink;
  }
}

/**
 * THE HEAD — crown, hair, face and the eye row, at the age's own gauge.
 *
 * The eyes are two ink pixels and they are the whole face. Everything this game
 * has learnt about 16 px people says the same thing: a mouth is a smudge, a nose
 * is noise, and two dark pixels at the right height is a person looking at you.
 */
function paintHead(rows, cfg, hair) {
  const { headTop, headHalf, stoop = 0 } = cfg;
  const dx = stoop; // a stooped head sits forward, toward the way they are going
  const skull = hair.skull ?? "H";
  const crownFrom = LEFT - (headHalf - 1) + dx;
  const crownTo = RIGHT + (headHalf - 1) + dx;
  const from = LEFT - headHalf + dx;
  const to = RIGHT + headHalf + dx;
  span(rows, headTop, crownFrom, crownTo, skull);
  span(rows, headTop + 1, from, to, skull);
  // A PEAK on a cap: one row of brim, out over the face, on the side they are
  // facing. It is two pixels and it is the whole difference between a cap and a
  // beanie at this size.
  if (hair.brim) {
    span(rows, headTop + 1, from, to + 2, skull);
  }
  span(rows, headTop + 2, from, to, "P");
  // A FRINGE IS THE TEMPLES, NOT THE WHOLE BROW. Carried right across, it eats
  // the face and leaves a person who is all hair and two eyes.
  if (hair.brow) {
    rows[headTop + 2][from] = skull;
    rows[headTop + 2][to] = skull;
  }
  if (hair.visor) {
    // A helmet has no face under it — the visor is the whole of it.
    span(rows, headTop + 3, from, to, skull);
  } else {
    span(rows, headTop + 3, from, to, "P");
    // …and the eyes, one in from each side of the face. Two dark pixels at the
    // right height is a person looking at you; a mouth is a smudge and a nose is
    // noise.
    rows[headTop + 3][from + 1] = "O";
    rows[headTop + 3][to - 1] = "O";
  }
  // HAIR PAST THE JAW — long hair, a hood, a scarf. Drawn down the OUTSIDE of
  // the face rather than over it, so the eyes survive.
  // …in HAIR rather than in the skull's own colour, which is the whole point on
  // a head that is bald on top: `thinning` is a bare crown with a fringe of hair
  // round the sides, and painting those sides skin-coloured makes it just bald.
  const sideChar = hair.skull === "P" ? "H" : skull;
  for (let i = 0; i < (hair.sides ?? 0); i++) {
    const y = headTop + 2 + i;
    if (y >= PERSON_SIZE) break;
    rows[y][from] = sideChar;
    rows[y][to] = sideChar;
    if (from - 1 >= 0) rows[y][from - 1] = "O";
    if (to + 1 < PERSON_SIZE) rows[y][to + 1] = "O";
  }
  // …and whatever stands proud of the skull, drawn UPWARD from the crown so a
  // mohawk is a mohawk on a slight young adult and on a heavy one alike.
  const over = hair.over ?? [];
  over.forEach((line, i) => {
    const y = headTop - (over.length - i);
    if (y < 0) return;
    [...line].forEach((ch, rx) => {
      if (ch === KEEP) return;
      const x = crownFrom + rx;
      if (x < 0 || x >= PERSON_SIZE) return;
      rows[y][x] = ch;
      if (x - 1 >= 0 && rows[y][x - 1] === ".") rows[y][x - 1] = "O";
      if (x + 1 < PERSON_SIZE && rows[y][x + 1] === ".") rows[y][x + 1] = "O";
      if (y - 1 >= 0 && rows[y - 1][x] === ".") rows[y - 1][x] = "O";
    });
  });
}

/** The torso, from the shoulders to the hips, with the garment's own front on
 * it. */
function paintTorso(rows, cfg, garment) {
  const { shoulder, hip } = cfg;
  // THE TORSO IS A TAPER, not a box — it walks from the shoulder's own width to
  // the hip's over the rows between them, which is the whole of what `GENDERS`
  // moves and is worth having even when it moves nothing.
  for (let y = shoulder; y < hip; y++) {
    const half = torsoHalfAt(cfg, y);
    span(rows, y, LEFT - half, RIGHT + half, "C");
  }
  const from = LEFT - cfg.shoulderHalf;
  const to = RIGHT + cfg.shoulderHalf;
  // TWO PIXELS, NOT FOUR. A panel half the width of the torso stops being a
  // shirt showing between the front edges of a jacket and becomes a BIB — and a
  // roster of twenty people all wearing one is the single loudest thing on the
  // sheet. What the panel is for is breaking the torso's flat block; it does
  // that at any width, and the narrow one keeps the garment's own colour as the
  // thing you actually read.
  const mid = { wide: 1, narrow: 1, bib: 1, belt: 0, band: 0, none: 0 }[
    garment.panel
  ];
  if (garment.panel === "band") {
    // A reflective band goes all the way across, which is what makes it read.
    span(rows, shoulder + 2, from, to, "S");
  } else if (garment.panel === "belt") {
    // A sash from the near shoulder down across the chest — the seatbelt, and
    // the one marking on this body that says "in a car" rather than "on a
    // pavement".
    for (let i = 0; i < hip - shoulder; i++) {
      const y = shoulder + i;
      const x = to - 1 - i;
      if (x >= from && y < hip) rows[y][x] = "S";
    }
  } else if (mid > 0) {
    const top = shoulder + 1;
    const bottom = garment.panel === "bib" ? hip - 1 : shoulder + 3;
    for (let y = top; y <= bottom; y++) {
      // IT TAPERS AT THE COLLAR. A panel of one width top to bottom reads as a
      // stripe painted on a box; one pixel narrower on the first row reads as a
      // jacket open over a shirt, which is what it is.
      span(rows, y, LEFT - mid, RIGHT + mid, "S", null);
    }
  }
}

/**
 * THE ARMS — one either side of the torso, one column wide, hung off the
 * SHOULDER rather than at a fixed column so they travel with the build.
 *
 * The stride is in the hands: on frame 0 the near hand is down and the far hand
 * is up, and on frame 1 they swap. That is the entire walk cycle, and it is
 * enough — at 16 px a leg that moves and an arm that does not reads as a person
 * being dragged.
 */
function paintArms(rows, cfg, frame, garment) {
  const { shoulder, hip, shoulderHalf } = cfg;
  const near = LEFT - shoulderHalf - 2;
  const far = RIGHT + shoulderHalf + 2;
  // IT STARTS A ROW BELOW THE SHOULDER LINE, and that one pixel is the whole
  // difference between an arm and a slab bolted to a torso. Level with the
  // shoulders there is no shoulder left above it — the eye gets a rectangle
  // whose top edge is the body's top edge, and reads the two of them as one
  // wide object with lumps. Dropped a row, the shoulder line runs clear over
  // the top and the arm hangs OFF something.
  const top = shoulder + 1;
  // …and it stops a row above the hip, so the hand hangs clear of the jacket.
  const bottom = hip - 2;
  // ONLY THE NEAR ARM SWINGS, which is measured off the shipped crowd rather
  // than assumed: on frame 0 both hands are down, and on frame 1 only the near
  // one has come up. Swinging both is what a diagram of walking does; what the
  // art does is move the arm the eye is actually on, and leave the far one to
  // hold whatever the person is carrying.
  for (const [x, isNear] of [
    [near, true],
    [far, false],
  ]) {
    if (x < 0 || x >= PERSON_SIZE) continue;
    // INKED BOTH SIDES, as the shipped crowd's are. The inner column doubling
    // the torso's own outline is not a mistake — it is the gap that separates an
    // arm from a chest, and without it the two colours meet and the arm stops
    // being a limb.
    for (let y = top; y <= bottom; y++) {
      rows[y][x] = garment.stripe && y < bottom ? "S" : "A";
      if (x - 1 >= 0) rows[y][x - 1] = "O";
      if (x + 1 < PERSON_SIZE) rows[y][x + 1] = "O";
    }
    rows[isNear && frame === 1 ? top : bottom][x] = "K";
  }
}

/** The legs and what is on the end of them — the stride, and whatever the
 * garment does to the lower half. */
function paintLegs(rows, cfg, frame, garment) {
  const { hip, foot, hipHalf } = cfg;
  const torsoHalf = hipHalf;
  const from = LEFT - hipHalf;
  const to = RIGHT + hipHalf;
  span(rows, hip, from, to, "T");

  if (garment.legs === "coat") {
    // A coat to the knee: the top carries on down and only the last row is leg.
    for (let y = hip + 1; y < foot; y++) span(rows, y, from, to, "T");
  } else if (garment.legs === "skirt") {
    // …and a skirt FLARES, one px wider each row, which is the only silhouette
    // in the roster that gets wider on the way down.
    for (let y = hip + 1; y < foot; y++) {
      span(rows, y, from - (y - hip), to + (y - hip), "T");
    }
  }

  // The stride: apart on one frame, together on the other. Measured from the
  // torso's own edges so a heavy person's legs are under a heavy person.
  // TWO PIXELS WIDE, ALWAYS. A three-px leg on a 16-px body is a trouser leg
  // the width of the torso, and the pair of them close the gap the stride is
  // made of.
  const apart = frame === 0;
  const inner = apart ? torsoHalf : 2;
  const outer = apart ? torsoHalf + 1 : 3;
  const legs = [
    [LEFT - outer, LEFT - inner],
    [RIGHT + inner, RIGHT + outer],
  ];
  const legTop = garment.legs === "trousers" ? hip + 1 : foot;
  for (let y = legTop; y < foot; y++) {
    for (const [a, b] of legs) span(rows, y, a, b, "T", "O");
  }
  for (const [a, b] of legs) span(rows, foot, a, b, "B", "O");
}

/** A seated body — the drivers and the riders. The legs go FORWARD rather than
 * down, so the whole lower half is a different shape and gets its own painter
 * rather than a flag. */
function paintSeated(rows, cfg, frame, garment) {
  const { shoulder, hip, foot, hipHalf: torsoHalf } = cfg;
  const from = LEFT - torsoHalf;
  const to = RIGHT + torsoHalf;
  span(rows, hip, from, to, "T");
  span(rows, hip + 1, from, to + 1, "T");
  // Knees forward, shins down: two stubs off the front of the lap.
  for (let y = hip + 2; y < foot; y++) {
    span(rows, y, from, from + 1, "T", "O");
    span(rows, y, to - 1, to, "T", "O");
  }
  span(rows, foot, from, from + 1, "B", "O");
  span(rows, foot, to - 1, to, "B", "O");
  // Both hands out in front, on the wheel or the bars.
  const x = RIGHT + torsoHalf + 2;
  for (const y of [shoulder + 1, shoulder + 2]) {
    if (x < PERSON_SIZE) {
      rows[y][x] = "K";
      rows[y][x - 1] = "O";
      if (x + 1 < PERSON_SIZE) rows[y][x + 1] = "O";
    }
  }
  void frame;
  void garment;
}

/**
 * Stamp one part over the body, honouring its `~` holes — and CLOSE ITS
 * OUTLINE.
 *
 * THE OUTLINE IS THE HALF THAT WAS MISSING, and it is not a nicety: every
 * silhouette in this game is built on a dark rim, so a briefcase stamped as bare
 * brown cells reads as a hole in the picture rather than as a thing somebody is
 * holding. The parts cannot draw their own — a bag's left edge is the body's
 * outline when it is against a hip and its own when it is swinging clear — so it
 * is derived here, once, for every part: paint first, then ink any EMPTY cell
 * orthogonally touching what was painted.
 *
 * Deriving it also means a part author never has to think about it. A cane, a
 * dog, a board and a pram all get a correct rim from the shape alone, and a new
 * one added tomorrow does too.
 */
function stamp(rows, part, at) {
  if (!part || !part.rows || part.rows.length === 0) return;
  const x0 = at.x + (part.dx ?? 0);
  const y0 = at.y + (part.dy ?? 0);
  const painted = [];
  part.rows.forEach((line, ry) => {
    [...line].forEach((ch, rx) => {
      if (ch === KEEP) return;
      const x = x0 + rx;
      const y = y0 + ry;
      if (x < 0 || x >= PERSON_SIZE || y < 0 || y >= PERSON_SIZE) return;
      rows[y][x] = ch;
      if (ch !== ".") painted.push([x, y]);
    });
  });
  for (const [x, y] of painted) {
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= PERSON_SIZE || ny < 0 || ny >= PERSON_SIZE) continue;
      if (rows[ny][nx] === ".") rows[ny][nx] = "O";
    }
  }
}

/**
 * ONE PERSON, BOTH FRAMES — the only entry point.
 *
 * `spec` is `{ age, build, garment, hair, aid, carry }`; everything has a
 * default, so the smallest honest person is `{}` and comes out as an
 * average-built adult in a shirt with a crop.
 */
export function personFrames(spec = {}) {
  const ageId = spec.age ?? "adult";
  const age = AGES[ageId] ?? AGES.adult;
  const build = BUILDS[spec.build ?? "average"] ?? 0;
  const gender = GENDERS[spec.gender ?? "unspecified"] ?? GENDERS.unspecified;
  const garment = GARMENTS[spec.garment ?? "shirt"] ?? GARMENTS.shirt;
  // THE SPEC WINS. The gender's own table is only what somebody gets when the
  // roster did not say — see `GENDERS`.
  const hairId = spec.hair ?? gender.hair[ageId] ?? "crop";
  const hair = HAIR[hairId] ?? HAIR.crop;
  const aid = AIDS[spec.aid ?? "none"] ?? AIDS.none;
  const carry = CARRY[spec.carry ?? "none"] ?? CARRY.none;
  const half = Math.max(2, age.torsoHalf + build);
  const cfg = {
    ...age,
    torsoHalf: half,
    shoulderHalf: Math.max(2, half + gender.shoulder),
    hipHalf: Math.max(2, half + gender.hip),
    headHalf: age.headHalf,
  };

  return [0, 1].map((frame) => {
    const rows = blank();
    paintHead(rows, cfg, hair);
    paintTorso(rows, cfg, garment);
    if (garment.legs === "seated") {
      paintSeated(rows, cfg, frame, garment);
    } else {
      paintArms(rows, cfg, frame, garment);
      paintLegs(rows, cfg, frame, garment);
    }
    // …then everything that is DRAWN rather than ruled, in the order it sits:
    // hair on the skull, then whatever is worn over it, then what is in a hand.
    const crown = {
      x: LEFT - (cfg.headHalf - 1) + (cfg.stoop ?? 0),
      y: cfg.headTop,
    };
    // THE FAR HAND, AND IT DOES NOT MOVE. A briefcase that hopped up the body
    // between frame 0 and frame 1 is a briefcase being juggled — the shipped
    // crowd keeps everything carried in the hand that does not swing, and this
    // is why that hand exists.
    const hand = { x: RIGHT + cfg.shoulderHalf + 2, y: cfg.hip - 2 };
    const hips = { x: LEFT - cfg.hipHalf, y: cfg.hip };
    const ground = { x: LEFT, y: cfg.foot };
    const anchors = { crown, hand, hips, ground };
    stamp(rows, aid, anchors[aid.anchor] ?? hand);
    stamp(rows, carry, anchors[carry.anchor] ?? hand);
    return rows.map((r) => r.join(""));
  });
}

/** Every axis, for the sprite schema and for a test that wants to walk them. */
export const AGE_IDS = Object.keys(AGES);
export const BUILD_IDS = Object.keys(BUILDS);
export const GARMENT_IDS = Object.keys(GARMENTS);
export const GENDER_IDS = Object.keys(GENDERS);
