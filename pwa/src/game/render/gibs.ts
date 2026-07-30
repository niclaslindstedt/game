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
// line and this module flies the halves apart, with the cut face
// (`cleave_wound`) drawn along the seam so the body is seen from INSIDE rather
// than merely in two pieces — and a length of gut left hanging out of the top
// half, because that is the detail that makes it read as a body rather than as a
// broken statue.

import { spriteByName, type Sprites } from "../assets.ts";
import {
  CLEAVE_MS,
  GORE_BURST_MS,
  GORE_FLATTEN,
  piecePose,
  type GoreBurst,
  type GorePiece,
} from "../game-screen/gore-burst.ts";
import { enemySprites } from "./caches.ts";
import { clamp01, fract } from "./shared.ts";
import {
  pickShreds,
  shredSprite,
  splitSprite,
  type SpriteShred,
} from "./sprite-split.ts";
import type { Effect } from "./effects.ts";

/** The effect kinds this module owns. */
export const GORE_KINDS = new Set(["cleave", "gib"]);

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

/** How far the two halves of a cleaved body come apart, as a fraction of the
 * BODY's own width, and how far each keels outward.
 *
 * Both are held DELIBERATELY SHORT, and the fraction is the important half of
 * that: a flat number tuned on a 16 px minion opens a gap wider than the minion
 * and reads as two unrelated bodies, while the same number on a 48 px set piece
 * is a scratch. Scaled to the body, one cut reads at every size. The tip is
 * The tip is what puts the pieces on the FLOOR: two halves left standing upright
 * a few px apart read as a sprite with a line through it, so each keels most of
 * the way over — the same fall the ordinary corpse takes, mirrored outward from
 * the cut. Short of flat, because a half turned fully onto its side stops
 * reading as half of a person. */
const CLEAVE_GAP_FRAC = 0.3;
const CLEAVE_TIP = Math.PI / 2.6;

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
  const family = effect.sprite ?? "ghost";

  ctx.save();
  if (burst.kind === "cleave") {
    drawCleave(ctx, effect, burst, family, x, by, t, fade, sprites);
  } else {
    drawGibs(ctx, burst, family, x, by, t, fade, sprites);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  return true;
}

/**
 * THE CLEAVE: the body's own sprite cut in two, the halves sliding apart to
 * either side of the cut and keeling outward, the wound drawn along each seam
 * and a strand of gut left hanging out of one of them.
 *
 * THE CUT IS AXIS-ALIGNED, and that is a deliberate retreat from realism. A cut
 * at the blow's exact bearing is what a physicist would draw and it is mush on
 * screen: the two halves come apart at an angle nobody reads, the wound band
 * lies across both of them at once, and a 24 px body ends up a red smear. So the
 * bearing only chooses BETWEEN TWO CUTS — the hero beside the victim swings the
 * blade vertically down the screen and takes it in half down the middle; the
 * hero in front of or behind it swings across and takes it in half at the waist.
 * Both are instantly legible, both agree with where the hero was standing, and
 * the pixel art stays square-on where it is sharpest.
 *
 * The halves also both ride the killing blow's own punt (`effect.launch`, sized
 * by `corpseLaunch` exactly as an ordinary corpse's is), so a cleaved body is
 * knocked back AND opened rather than daintily falling into two pieces on the
 * spot.
 */
function drawCleave(
  ctx: CanvasRenderingContext2D,
  effect: Effect,
  burst: GoreBurst,
  family: string,
  x: number,
  y: number,
  t: number,
  fade: number,
  sprites: Sprites,
): void {
  ctx.globalAlpha = fade;
  const body = enemySprites(sprites, family).dying[0];
  const w = body.width;
  const h = body.height;
  // Which of the two cuts: DOWN THE MIDDLE when the blade swept vertically past
  // the camera (the hero was to one side), ACROSS THE WAIST when it swept
  // horizontally (he was in front or behind).
  const lengthwise =
    Math.abs(Math.cos(burst.heading)) > Math.abs(Math.sin(burst.heading));
  const cut = lengthwise ? Math.PI / 2 : 0;
  const halves = splitSprite(body, family, cut);
  // The punt, on the same curve the corpse effect flies: out fast, easing into
  // the landing. Both halves ride it together.
  const launch = effect.launch;
  const flight = launch ? clamp01(t / 0.45) : 0;
  const ease = flight * (2 - flight);
  const px = launch ? launch.dx * launch.dist * ease : 0;
  const py = launch ? launch.dy * launch.dist * ease * GORE_FLATTEN : 0;
  const hop = launch ? Math.sin(flight * Math.PI) * launch.dist * 0.14 : 0;
  // How far apart they have come: fast at first (the blade drove them apart),
  // then still — they are lying on the floor, not drifting away from each other.
  // The separation is in SCREEN space with no ground squash on it, because these
  // are two halves of a BILLBOARD standing up in the world, not two marks on the
  // floor: flattening it is what collapsed the gap to nothing and stacked the
  // two halves back on top of each other.
  const open = clamp01(t / 0.35);
  const gap =
    Math.min(w * CLEAVE_GAP_FRAC, 2 + 1.5 * burst.force) * (open * (2 - open));
  // Each half keels OUTWARD, away from the cut — the two ends of a body falling
  // apart. Well short of flat: a half rotated onto its side is unrecognisable as
  // half of anything, and a tip that closes the gap hides the cut.
  const tip = CLEAVE_TIP * clamp01(t / 0.5);

  if (!halves) {
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
    const side = i === 0 ? -1 : 1;
    ctx.save();
    ctx.translate(
      Math.round(x + px + (lengthwise ? gap * side : 0)),
      Math.round(y + py - hop + (lengthwise ? 0 : gap * side)),
    );
    ctx.rotate(tip * side);
    ctx.drawImage(half, -Math.round(w / 2), -Math.round(h / 2));
    ctx.restore();
  }

  // The cut FACE, drawn ONCE, in the GAP the halves opened — so the body is seen
  // INTO rather than merely in two pieces. One band rather than one per half:
  // two of them, each as tall as a fifth of the body, meet in the middle and
  // paint the whole torso a solid red slab, which is the exact mush this cut was
  // straightened out to avoid. It fades as the halves keel over, by which point
  // the gap between them is the thing doing the talking.
  const wound = spriteByName(sprites, "cleave_wound");
  if (wound) {
    ctx.save();
    ctx.translate(Math.round(x + px), Math.round(y + py - hop));
    ctx.rotate(cut);
    ctx.globalAlpha = fade * (1 - clamp01((t - 0.15) / 0.35));
    ctx.drawImage(
      wound,
      -Math.round(wound.width / 2),
      -Math.round(wound.height / 2),
    );
    ctx.restore();
  }

  // What was inside: a length of gut hanging out of one half and swinging as it
  // goes over. Drawn AFTER both halves so it is never buried by the one it came
  // out of, and only on a blow that properly opened the body.
  const gut = spriteByName(sprites, "gib_gut_1");
  if (gut && burst.force >= 1.6) {
    const sway = Math.sin(t * Math.PI * 2.2) * 3 * (1 - t * 0.6);
    ctx.globalAlpha = fade * (1 - clamp01((t - 0.4) / 0.4));
    ctx.drawImage(
      gut,
      Math.round(x + px + sway - gut.width / 2),
      Math.round(y + py - hop + (lengthwise ? 2 : gap)),
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
  family: string,
  x: number,
  y: number,
  t: number,
  fade: number,
  sprites: Sprites,
): void {
  for (const [i, gib] of burst.pieces.entries()) {
    const art = gib.sprite ? spriteByName(sprites, gib.sprite) : null;
    if (!art) continue;
    drawPiece(ctx, burst, gib, art, x, y, t, fade, i, sprites);
  }
  // The victim's OWN fragments ride the same flight on bearings of their own,
  // and each starts where it SAT on the body rather than at its centre — so the
  // burst blows the mob apart along its own outline.
  const shreds = shredsFor(burst, family, sprites);
  const count = burst.pieces.length;
  for (const [i, shred] of shreds.entries()) {
    const gib = burst.pieces[(i * 3 + 1) % Math.max(1, count)];
    if (!gib) continue;
    drawPiece(
      ctx,
      burst,
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
  family: string,
  sprites: Sprites,
): readonly SpriteShred[] {
  if (burst.shreds <= 0) return [];
  const body = enemySprites(sprites, family).dying[0];
  return pickShreds(
    shredSprite(body, family, burst.shreds > 5 ? 4 : 3),
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
  gib: GorePiece,
  art: ImageBitmap | HTMLCanvasElement,
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
    const bead = spriteByName(sprites, "blood_drop_1");
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
