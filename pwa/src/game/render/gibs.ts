// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A BODY COMING APART — the two halves of a cleaved one, and the pieces of a
// burst one.
//
// It is the blood spray's sibling (`./blood.ts`) and is built the same way:
// authored art thrown along seeded bearings, everything derived from one
// intensity, and no `Math.random` anywhere in a draw — the pass runs every frame
// for the same `t` and has to come out identical each time.
//
// WHAT IT DRAWS IS NOT DECIDED HERE. `game-screen/gore-burst.ts` owns the
// pieces, their bearings, their arcs and their bounces, because the FLOOR has to
// agree with them: the blood was soaked into the ground under each landing spot
// at the moment of the kill, so a head that flew somewhere this module invented
// would land on clean regolith beside its own puddle. This module is the hand,
// not the head — it asks `piecePose` where a piece is and blits it there.
//
// THREE THINGS SELL IT, and each is one line of the loot toss's own recipe:
//   THE SHADOW stays on the ground and tightens as a piece climbs. Without it a
//   sprite rising up the screen reads as a sprite walking away from the camera —
//   the exact bug the loot toss was written to avoid, and gibs inherit both the
//   problem and the fix.
//   THE BOUNCE is what tells bone from offal without a word of explanation: a
//   skull kicks up off the floor and skitters, a liver lands once and stops.
//   THE TRAIL is a bead of blood dropped behind anything still in the air, so
//   the mess in the middle of the room is joined to the mess at the edges.
//
// The CLEAVE is the one thing in the game that takes authored art apart:
// `render/sprite-split.ts` cuts the victim's own sprite in two along the blade's
// line and this module flies the halves apart, with the cut face drawn along the
// seam so the body is seen from INSIDE rather than merely in two pieces — and a
// strand left hanging out of the top half, because that is the detail that makes
// it read as a body rather than as a broken statue.
//
// WHICH cut face, which strand and what colour the beads are is the FAMILY's
// (`game-screen/gore.ts`): a man opens on viscera and trails a rope of gut, a
// machine on packed wiring and trails a torn loom, a rift-thing on collapsed
// light and trails a thread of it. Nothing here knows which — it asks the family
// and blits what it is handed.

import { spriteByName, type Sprites } from "../assets.ts";
import { goreFamily, type GoreFamily } from "../game-screen/gore.ts";
import {
  cleaveCut,
  CLEAVE_MS,
  GORE_BURST_MS,
  GORE_FLATTEN,
  piecePose,
  type GoreBurst,
  type GorePiece,
} from "../game-screen/gore-burst.ts";
import { enemySprites } from "./caches.ts";
import { recolorSprite } from "./recolor.ts";
import { clamp01, fract } from "./shared.ts";
import {
  pickShreds,
  shredSprite,
  slicedPiece,
  splitSprite,
  type SpriteShred,
} from "./sprite-split.ts";
import type { Effect } from "./effects.ts";
import type { SpriteImage } from "@ui/lib/atlas.ts";

/** The effect kinds this module owns. */
export const GORE_KINDS = new Set(["cleave", "gib"]);

/**
 * A gore piece at the size the VICTIM warrants: the small authored set for a
 * small body, the ordinary one otherwise, falling back to the ordinary one when
 * a piece has no small variant — so a MOD that adds an organ authors one sprite
 * and it works at both sizes.
 */
function gorePiece(
  sprites: Sprites,
  name: string,
  bodyPx: number,
): SpriteImage | undefined {
  if (bodyPx < SMALL_BODY_PX) {
    const small = spriteByName(sprites, `${name}_s`);
    if (small) return small;
  }
  return spriteByName(sprites, name);
}

/**
 * A piece of BLOOD's own spray art, re-hued to whatever this body was made of.
 *
 * Only the shared bits go through here — the bead a piece sheds behind it in
 * flight. The gore PIECES themselves are authored per family (a wire is not a
 * green gut), so they never touch it; the spray, the haze and the floor do,
 * which is what keeps four families off sixty sprites (see render/recolor.ts).
 * Blood's own ramp is null, so its art comes back untouched.
 */
function familyArt(
  sprites: Sprites,
  name: string,
  family: GoreFamily,
): SpriteImage | undefined {
  const art = spriteByName(sprites, name);
  if (!art || !family.ramp) return art;
  return recolorSprite(art, name, family.ramp);
}

/** World px above the recorded point a body's middle sits — the event carries
 * the mob's centre, and pieces coming off its feet read as a puddle it is
 * standing in. The same lift the blood spray takes. */
const BODY_LIFT = 3;

/** How long the mess takes to fade off the floor at the END of the effect's
 * life, in ms. The two clocks are deliberately separate: the FLIGHT runs on the
 * burst's own short duration (`GORE_BURST_MS` / `CLEAVE_MS`) and the effect then
 * LIVES for seconds after it, so the pieces come apart at the speed of a blow
 * and then lie there at the speed of a battlefield. Running one clock for both —
 * the mistake this replaced — plays the whole thing in slow motion and reads as
 * a body politely disassembling itself. */
const FADE_MS = 900;

/** A bead of blood dropped behind a piece still in the air, every this many
 * turns of its flight. */
const TRAIL_STEPS = 3;

/** THE BODY SIZE A GORE PIECE IS DRAWN FOR, and the one below which the SMALL
 * set is used instead.
 *
 * A ribcage authored against a 24 px body is wider than a 16 px one, which is
 * how the first pass shipped: every organ was roughly double the size it should
 * have been, and a burst read as a pile of props rather than as the inside of
 * the thing it came out of. The answer is a second AUTHORED set rather than a
 * scale factor — scaling pixel art resamples it, and the game's every other
 * size ladder (the wound frames, the blood tiles) is authored rungs for exactly
 * that reason.
 *
 * The 49 bodies that can come apart are 28 at 24 px and 21 at 16–20 px, so the
 * split falls naturally between them. */
const SMALL_BODY_PX = 22;

/** How far a THROWN piece of a cleaved body carries (a head coming off), as a
 * fraction of the body's width before the blow's force stretches it, and how
 * many whole turns it takes getting there. Generous on both: a severed head that
 * merely leaned away from the neck is the least convincing thing this effect
 * could draw. */
const TOSS_REACH_FRAC = 1;
const TOSS_SPINS = 1.5;

/**
 * Draw one body coming apart at screen (`x`, `y`) — the victim's own spot.
 * Returns false when the effect isn't ours, so the main effect pass falls
 * through to its own kinds.
 */
export function drawGore(
  ctx: CanvasRenderingContext2D,
  effect: Effect,
  x: number,
  y: number,
  timeMs: number,
  sprites: Sprites,
): boolean {
  if (!GORE_KINDS.has(effect.kind)) return false;
  const burst = effect.gib;
  if (!burst) return true;
  // Two clocks (see FADE_MS): `t` runs the FLIGHT over the burst's own length,
  // `fade` takes the leftovers away at the end of the effect's much longer life.
  const life = effect.durationMs ?? GORE_BURST_MS;
  const age = life - (effect.untilMs - timeMs);
  const t = clamp01(
    age / (burst.kind === "cleave" ? CLEAVE_MS : GORE_BURST_MS),
  );
  const fade =
    effect.persist === true
      ? 1
      : 1 - clamp01((age - (life - FADE_MS)) / FADE_MS);
  const by = y - BODY_LIFT;
  const mob = effect.sprite ?? "ghost";
  // WHAT THIS BODY WAS MADE OF, resolved once and handed down: the wound in the
  // gap, the wet face of an oblique slice, the strand left hanging and the beads
  // shed in flight all come off it (game-screen/gore.ts).
  const family = goreFamily(burst.family);

  ctx.save();
  if (burst.kind === "cleave") {
    drawCleave(ctx, effect, burst, mob, family, x, by, t, fade, sprites);
  } else {
    drawGibs(ctx, burst, mob, family, x, by, t, fade, sprites);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  return true;
}

/**
 * THE CLEAVE: the body's own sprite cut in two, the pieces parting along the
 * cut, the wound drawn in the gap they open and a strand of gut left hanging
 * out of it.
 *
 * WHICH cut this is came off `cleaveCut` (game-screen/gore-burst.ts) — one of
 * six, picked from the hero's own bearing, the blow's force and the kill's seed
 * — and this function draws whichever it was told. That split is the point: the
 * catalog is data anyone can add a seventh entry to, while the drawing below is
 * one path with three flags on it (a piece may PART, be THROWN clear, or be
 * PINNED where it stood).
 *
 * THE CUT IS AXIS-ALIGNED OR DIAGONAL, never at the blow's exact bearing, and
 * that is a deliberate retreat from realism: a cut at the true angle is what a
 * physicist would draw and it is mush on screen — the pieces come apart at an
 * angle nobody reads and a 16 px body ends up a red smear. The bearing chooses
 * the FAMILY instead, so the cut still agrees with where the hero was standing
 * while the pixel art stays on the few angles it survives.
 *
 * The pieces also ride the killing blow's own punt (`effect.launch`, sized by
 * `corpseLaunch` exactly as an ordinary corpse's is), so a cleaved body is
 * knocked back AND opened rather than daintily falling apart on the spot — with
 * the one exception the catalog can name: a PINNED piece does not go anywhere at
 * all, which is what leaves a pair of legs standing where their owner was.
 */
function drawCleave(
  ctx: CanvasRenderingContext2D,
  effect: Effect,
  burst: GoreBurst,
  mob: string,
  family: GoreFamily,
  x: number,
  y: number,
  t: number,
  fade: number,
  sprites: Sprites,
): void {
  ctx.globalAlpha = fade;
  const body = enemySprites(sprites, mob).dying[0];
  const w = body.width;
  const h = body.height;
  // A burst that somehow reached here without a cut still has to draw a body
  // coming apart, so one is rolled on the spot from its own seed.
  const cut =
    burst.cut ??
    cleaveCut(burst.heading, burst.force, burst.seed, "humanoid", burst.family);
  // Where the cut line sits, in sprite px along its own normal — the same
  // number the splitter cuts at and the wound is drawn on, so the three can
  // never disagree about where the body was opened.
  // The body's size ALONG the cut's normal — the one measurement everything
  // about this cut is priced in. A cut straight across a body parts its pieces
  // vertically, so it is the body's HEIGHT that says how far apart they have to
  // go; measuring both against the width is what left a toppling torso sitting
  // on top of the legs it was cut off.
  const span = cut.angle === 0 ? h : w;
  const offsetPx = Math.round(cut.offset * span);
  // WHERE THE BLADE WENT IN AND WHERE IT CAME OUT. A flat cut has one line and
  // the two pieces are plain halves; an OBLIQUE one has two, and the band
  // between them is the wet face of the piece whose cut is turned toward us
  // (`slicedPiece`). The far line is clamped inside the body — a slice that
  // exited past the silhouette would be a blade that missed on the way out.
  const backPx = Math.round(
    Math.min(span / 2, Math.max(-span / 2, offsetPx + cut.depth * span)),
  );
  // The wet face is the FAMILY's own inside — a body's viscera, a ghost's goo, a
  // machine's packed innards, a rift-thing's collapsed light — masked to the
  // victim's own silhouette, so every mob gets a correct view of its own inside
  // with nothing authored per monster.
  const wet = cut.depth > 0 ? spriteByName(sprites, family.inside) : null;
  const halves =
    wet && cut.depth > 0
      ? ([
          // The piece whose face we SEE: its own art out to the entry line, then
          // its cut face out to the exit line.
          slicedPiece(body, mob, wet, cut.angle, offsetPx, backPx, -1),
          // The piece whose face is turned AWAY: plain art, starting at the exit
          // line, so the two of them are a quarter and the rest rather than two
          // halves of the same line.
          slicedPiece(body, mob, wet, cut.angle, backPx, backPx, 1),
        ] as const)
      : splitSprite(body, mob, cut.angle, offsetPx);
  // The punt, on the same curve the corpse effect flies: out fast, easing into
  // the landing.
  const launch = effect.launch;
  const flight = launch ? clamp01(t / 0.45) : 0;
  const punt = flight * (2 - flight);
  const px = launch ? launch.dx * launch.dist * punt : 0;
  const py = launch ? launch.dy * launch.dist * punt * GORE_FLATTEN : 0;
  const hop = launch ? Math.sin(flight * Math.PI) * launch.dist * 0.14 : 0;
  // How far apart they have come: fast at first (the blade drove them apart),
  // then still — they are lying on the floor, not drifting away from each other.
  // The separation is in SCREEN space with no ground squash on it, because these
  // are two halves of a BILLBOARD standing up in the world, not two marks on the
  // floor: flattening it is what collapsed the gap to nothing and stacked the
  // two halves back on top of each other. It is a fraction of the BODY, so one
  // cut reads at every size — a flat number tuned on a 16 px minion opens a gap
  // wider than the minion and reads as two unrelated bodies.
  const open = clamp01(t / 0.35);
  const gap = span * cut.spread * (open * (2 - open));
  // The cut's own normal, in screen space: the direction the pieces part along.
  const nx = Math.cos(cut.angle + Math.PI / 2);
  const ny = Math.sin(cut.angle + Math.PI / 2);
  // Each piece keels OUTWARD, away from the cut — the two ends of a body falling
  // apart, and what actually puts them on the FLOOR: two halves left standing
  // upright a few px apart read as a sprite with a line through it.
  const tip = cut.tip * clamp01(t / 0.5);

  if (!halves || !halves[0] || !halves[1]) {
    // No canvas to cut with: draw the whole body toppling, so the kill still
    // reads as a death rather than as nothing at all.
    ctx.save();
    ctx.translate(x + px, y + py + h / 2 - hop);
    ctx.rotate(tip);
    ctx.drawImage(body, -Math.round(w / 2), -h);
    ctx.restore();
    return;
  }

  for (const [i, half] of halves.entries()) {
    if (!half) continue;
    // Index 0 is the piece on the NEGATIVE side of the cut's normal — the head
    // end of a cut straight across a body (see `splitSprite`).
    const side: -1 | 1 = i === 0 ? -1 : 1;
    ctx.save();
    if (cut.pinned === side) {
      // PINNED: it does not move at all. No punt, no part, no tip — a pair of
      // legs left standing exactly where their owner was.
      ctx.translate(Math.round(x), Math.round(y));
    } else if (cut.toss === side) {
      // THROWN CLEAR: a head that came off does not slide, it goes somewhere
      // else. It arcs away along the cut's normal, well past the punt, tumbling
      // as it goes and settling where it lands — the gib toss in miniature, and
      // for the same reason (a severed head that merely leaned away from the
      // neck is the least convincing thing this effect could draw).
      const fly = clamp01(t / 0.55);
      const ease = fly * (2 - fly);
      const reach = span * TOSS_REACH_FRAC * (1 + burst.force * 0.5);
      ctx.translate(
        Math.round(x + px + nx * side * reach * ease),
        Math.round(
          y +
            py +
            ny * side * reach * ease * GORE_FLATTEN -
            Math.sin(fly * Math.PI) * reach * 0.35,
        ),
      );
      ctx.rotate(side * TOSS_SPINS * Math.PI * 2 * ease);
    } else {
      ctx.translate(
        Math.round(x + px + nx * gap * side),
        Math.round(y + py - hop + ny * gap * side),
      );
      ctx.rotate(tip * side);
    }
    ctx.drawImage(half, -Math.round(w / 2), -Math.round(h / 2));
    ctx.restore();
  }

  // The cut FACE, drawn ONCE, in the gap the pieces opened — so the body is seen
  // INTO rather than merely in two pieces. One band rather than one per half:
  // two of them, each as thick as a fifth of the body, meet in the middle and
  // paint the whole torso a solid red slab, which is the exact mush this effect
  // was straightened out to avoid. Laid ON the cut line (angle and offset both),
  // and gone by the time the pieces have keeled over, at which point the gap
  // between them is the thing doing the talking.
  const wound = cut.depth > 0 ? null : spriteByName(sprites, family.wound);
  if (wound) {
    ctx.save();
    ctx.translate(Math.round(x + px), Math.round(y + py - hop));
    ctx.rotate(cut.angle);
    ctx.globalAlpha = fade * (1 - clamp01((t - 0.15) / 0.35));
    ctx.drawImage(
      wound,
      -Math.round(wound.width / 2),
      Math.round(offsetPx - wound.height / 2),
    );
    ctx.restore();
  }

  // WHAT THE BLADE WENT THROUGH, falling out of the opening: a skull and a
  // brain out of a neck, a heart and a ribcage out of a chest, the gut and the
  // liver out of a belly (the cut's own `spills`). They are ordinary pieces on
  // the ordinary flight, so they arc, tumble, bounce if they are bone, and land
  // on the blood the floor was already given for them — the same agreement a
  // burst's pieces have. Drawn from the CUT rather than from the body's middle.
  for (const [i, gib] of burst.pieces.entries()) {
    const art = gib.sprite ? gorePiece(sprites, gib.sprite, w) : null;
    if (!art) continue;
    drawPiece(
      ctx,
      burst,
      family,
      gib,
      art,
      x + px + nx * offsetPx,
      y + py - hop + ny * offsetPx,
      t,
      fade,
      i,
      sprites,
    );
  }

  // What was inside, LEFT HANGING rather than thrown clear: a rope of gut out of
  // a man, a trailing wisp out of a haunting, a torn loom of wire out of a
  // machine, a thread of light out of a rift-thing — swinging as the body goes
  // over. Only on a blow that properly opened it, and never out of a neck: a
  // beheading is a clean thing and a rope of intestine coming out of one is a
  // different, sillier effect.
  const gut = spriteByName(sprites, family.strand);
  if (gut && burst.force >= 1.6 && cut.toss === null) {
    const sway = Math.sin(t * Math.PI * 2.2) * 3 * (1 - t * 0.6);
    ctx.globalAlpha = fade * (1 - clamp01((t - 0.4) / 0.4));
    ctx.drawImage(
      gut,
      Math.round(x + px + nx * gap * 0.5 + sway - gut.width / 2),
      Math.round(y + py - hop + offsetPx + ny * gap * 0.5),
    );
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = 1;
}

/**
 * THE BURST: every piece of the body thrown out along its own bearing, arcing,
 * tumbling, bouncing if it is dense enough, and coming to rest on the floor it
 * already bled on.
 *
 * The victim's OWN sprite is in there too — a handful of fragments cut out of it
 * by `shredSprite` — which is the difference between "a body burst" and "the red
 * effect played again".
 */
function drawGibs(
  ctx: CanvasRenderingContext2D,
  burst: GoreBurst,
  mob: string,
  family: GoreFamily,
  x: number,
  y: number,
  t: number,
  fade: number,
  sprites: Sprites,
): void {
  const bodyPx = enemySprites(sprites, mob).dying[0].width;
  for (const [i, gib] of burst.pieces.entries()) {
    const art = gib.sprite ? gorePiece(sprites, gib.sprite, bodyPx) : null;
    if (!art) continue;
    drawPiece(ctx, burst, family, gib, art, x, y, t, fade, i, sprites);
  }
  // The victim's OWN fragments ride the same flight on bearings of their own,
  // and each starts where it SAT on the body rather than at its centre — so the
  // burst blows the mob apart along its own outline.
  const shreds = shredsFor(burst, mob, sprites);
  const count = burst.pieces.length;
  for (const [i, shred] of shreds.entries()) {
    const gib = burst.pieces[(i * 3 + 1) % Math.max(1, count)];
    if (!gib) continue;
    drawPiece(
      ctx,
      burst,
      family,
      // A shred is a scrap of skin: it never bounces, whatever piece's flight
      // it borrowed.
      { ...gib, angle: gib.angle + 0.7 + i * 0.9, bounces: 0 },
      shred.canvas,
      x + shred.dx,
      y + shred.dy,
      t,
      fade,
      i + count,
      sprites,
    );
  }
}

/** The victim's own art, cut into fragments — `shredSprite` bakes and caches
 * them, so this is a map lookup after the first burst of each family. */
function shredsFor(
  burst: GoreBurst,
  mob: string,
  sprites: Sprites,
): readonly SpriteShred[] {
  if (burst.shreds <= 0) return [];
  const body = enemySprites(sprites, mob).dying[0];
  return pickShreds(
    shredSprite(body, mob, burst.shreds > 5 ? 4 : 3),
    burst.shreds,
    burst.seed,
  );
}

/** One piece — its shadow, its arc, its tumble, and the blood it sheds on the
 * way. Shared by the authored gore and the victim's own fragments, which is why
 * it takes the art rather than a sprite name. */
function drawPiece(
  ctx: CanvasRenderingContext2D,
  burst: GoreBurst,
  family: GoreFamily,
  gib: GorePiece,
  art: SpriteImage,
  x: number,
  y: number,
  t: number,
  fade: number,
  n: number,
  sprites: Sprites,
): void {
  if (t < gib.delay) return;
  const pose = piecePose(gib, t);
  const ang = burst.heading + gib.angle;
  const gx = Math.round(x + Math.cos(ang) * pose.dist);
  const gy = Math.round(y + Math.sin(ang) * pose.dist * GORE_FLATTEN);

  // The shadow, on the ground the whole way — widest and darkest when the piece
  // is on the floor, tightest at the top of its hop.
  const close = 1 - Math.min(1, pose.lift / Math.max(1, gib.peak));
  ctx.globalAlpha = (0.12 + 0.2 * close) * fade;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(
    gx,
    gy + 2,
    2 + 3 * close,
    (2 + 3 * close) * GORE_FLATTEN,
    0,
    0,
    7,
  );
  ctx.fill();
  ctx.globalAlpha = 1;

  // What it sheds on the way: a few beads dropped back along the path it has
  // already flown, so the mess in the middle of the room is JOINED to the mess
  // at the edges rather than being two unrelated stains. Only while it is still
  // in the air — a piece skittering along the floor is already painting the
  // ground layer's own blood.
  if (!pose.landed && pose.lift > 1) {
    const bead = familyArt(sprites, "blood_drop_1", family);
    if (bead) {
      for (let s = 1; s <= TRAIL_STEPS; s++) {
        const back = s / (TRAIL_STEPS + 1);
        const d = pose.dist * (1 - back);
        ctx.globalAlpha = 0.5 * (1 - back) * fade;
        ctx.drawImage(
          bead,
          Math.round(x + Math.cos(ang) * d - bead.width / 2),
          Math.round(
            y +
              Math.sin(ang) * d * GORE_FLATTEN -
              pose.lift * (1 - back) * 0.8 -
              bead.height / 2,
          ),
        );
      }
      ctx.globalAlpha = 1;
    }
  }

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(gx, gy - Math.round(pose.lift));
  // It stops turning once it has stopped moving, and comes to rest at an angle
  // of its own rather than bolt upright: a piece that kept spinning where it lay
  // would read as a bug, and a floor of pieces all facing the same way reads as
  // a tile pattern.
  ctx.rotate(
    pose.landed ? fract(n * 9.71 + burst.seed) * Math.PI * 2 : pose.spin,
  );
  ctx.drawImage(art, -Math.round(art.width / 2), -Math.round(art.height / 2));
  ctx.restore();
  ctx.globalAlpha = 1;
}
