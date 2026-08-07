// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE GLUED HAVE TO SAY, AND THE BUBBLE IT IS SAID IN.
//
// THE WORDS ARE HERE RATHER THAN IN A THOUGHT CATALOG, and the reason is the
// shape of the line rather than a filing preference. `content/thoughts.yaml`
// holds BEATS: a speaker's name, a portrait family, pages the dialogue box
// flows into a measured column and the player taps through. Not one of those
// four things exists here — a bubble over somebody's head on a road going past
// at 120 mph has no name plate, no face, no column and nobody to tap it. It is a
// BARK, the same kind of line a boss shouts over its own head mid-fight
// (`AbilityDef`), and the shipped barks are authored in code for the same
// reason. `docs/manuscript.md` transcribes them either way — the story chain
// cares that a line is written down, not which file it sleeps in.
//
// THEY ARE RIGHT, AND THAT IS THE WHOLE JOB OF THESE FIVE LINES. Nothing here
// is a strawman: no chanting, nothing that argues with itself, nothing written
// to be laughed at. They are polite, they are patient, they have plainly thought
// about this harder than the man in the car has, and one of them apologises for
// the inconvenience. What plays is the gap — he agrees with every word, reads
// none of it, says nothing about it before or afterwards, and could not stop the
// car if he wanted to.
//
// AND NOTHING NAMES ANYBODY REAL. Not a campaign, not a group, not a person, not
// a near-miss pun on one (docs/naming.md). THE GLUED is a role, and a role does
// not date: there has been somebody sitting in a road since there have been
// roads.

import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { worldToCanvas } from "../render/tilt.ts";
import type { Camera } from "../render/view.ts";

/**
 * THE LINES, in `DrivePedestrian.bark`'s own order. The engine picks an index
 * into this list without ever being told what is in it (`GLUED_BARKS`,
 * src/game/drive/blockade.ts) — keep the two lengths in step, or the last voice
 * on the road never speaks.
 */
export const GLUED_BARKS: readonly string[] = [
  "WE'VE GLUED OURSELVES TO THE TARMAC FOR THE CLIMATE",
  "NO CARS ON A DEAD PLANET",
  "MY HANDS ARE IN THE ROAD. THEY DON'T COME OUT.",
  "THE ROAD IS CLOSED TODAY",
  "SORRY FOR THE DISRUPTION",
];

/** The bubble's own colours — the game's window skin, so a placard on the road
 * belongs to the same object as every other panel the player reads. */
const FILL = "#e8e4d8";
const RIM = "#1a1c2c";
const INK = "#1a1c2c";

/** How wide a bubble is allowed to get, in unscaled font px, and the scale its
 * text is drawn at. NARROW on purpose: the reference viewport is 422 world px
 * across and a bubble a third of that wide over four different heads is a wall
 * of text with a road somewhere behind it. */
const WRAP_PX = 46;
const TEXT_SCALE = 1;
/** Padding inside the bubble, and the height of the tail under it. */
const PAD_X = 3;
const PAD_Y = 2;
const TAIL_H = 3;
/** How far above the body's own anchor the bubble's point sits (world px) — a
 * seated person is half the height of a standing one, so this clears a head
 * rather than a sprite. */
const LIFT = 13;

/**
 * HOW FAR OFF A BUBBLE IS STILL DRAWN (world px along the road).
 *
 * A blockade holds four voices and the road holds one blockade, so this is not
 * a draw budget — it is a READING one. A bubble that fades up as the car closes
 * gives the player the same beat a real one has: something pale on the road,
 * then words, then no time at all. Drawn from the moment it is legible and not
 * before.
 */
const READ_PX = 260;
const FADE_PX = 90;

/**
 * ONE BUBBLE AT A TIME, AND THAT NUMBER WAS ARRIVED AT BY LOOKING — twice.
 *
 * The blockade holds four voices spread through twenty people, all of them
 * inside a couple of hundred pixels of road. Four bubbles overprint into a
 * single block of illegible grey, which turns four people who have something to
 * say into one smudge. Stacking them in lanes fixed that and broke something
 * else: the formation spans the carriageway kerb to kerb, so the speaker nearest
 * the top edge has barely a body's height of sky above them, and the stack ran
 * straight off the top of the frame — clamped back down, the lanes collapsed
 * into each other and it was the smudge again.
 *
 * So the NEAREST one speaks and the rest hold their placards in silence. As the
 * car closes, that one is passed and the next takes its place, which turns a
 * wall of text into a SEQUENCE — three or four lines read one after another over
 * the second and a half it takes to arrive, which is how you would actually read
 * a picket line through a windscreen.
 */
const MAX_BUBBLES = 1;
/** How close to the top of the picture a bubble may get (canvas px) — the top
 * row of the formation has almost no sky above it. */
const CEILING_PX = 3;

/** …read by the renderer, which is what decides WHICH one speaks: it has the
 * whole field and can pick the nearest, where this module only ever sees one
 * bubble at a time. */
export const MAX_PLACARDS = MAX_BUBBLES;

/** One bubble, at a body's world spot. Returns nothing — this is a draw. */
export function drawPlacard(
  ctx: CanvasRenderingContext2D,
  font: PixelFont,
  text: string,
  worldX: number,
  worldY: number,
  camera: Camera,
  /** How far the car still is from this body (world px), for the fade-in. */
  awayPx: number,
): void {
  if (awayPx > READ_PX) return;
  const alpha =
    awayPx > READ_PX - FADE_PX ? (READ_PX - awayPx) / FADE_PX : 1;
  const lines = font.wrap(text, WRAP_PX);
  const width =
    Math.max(...lines.map((line) => font.measure(line))) * TEXT_SCALE;
  const height = lines.length * (font.height + 1) * TEXT_SCALE;
  const boxW = width + PAD_X * 2;
  const boxH = height + PAD_Y * 2;
  // IN CANVAS SPACE, NOT THE WORLD'S — the one thing on this road drawn outside
  // the projection, and deliberately. Everything with a PLACE on the road is
  // raked with the tarmac it stands on; WORDS are not a thing on the road, they
  // are a thing being read, and a skewed paragraph is a worse paragraph. The
  // bubble's POINT still comes from the world (`worldToCanvas` of the speaker's
  // own spot), so it stays over its owner as the road slides past.
  const seat = worldToCanvas(worldX, worldY, camera);
  const sx = Math.round(seat.x);
  const sy = Math.round(seat.y) - LIFT;
  const left = Math.round(sx - boxW / 2);
  const top = Math.max(CEILING_PX, Math.round(sy - boxH - TAIL_H));

  ctx.save();
  ctx.globalAlpha = alpha;
  // The rim first as a fattened copy of the box, then the fill inside it — the
  // same one-pixel near-black outline every solid thing in this game is built
  // on, which is what stops a pale panel reading as a hole in the picture.
  ctx.fillStyle = RIM;
  ctx.fillRect(left - 1, top - 1, boxW + 2, boxH + 2);
  // The tail reaches all the way down to the head it belongs to, however far the
  // ceiling above pushed the box up — a bubble that has been shoved clear of the
  // top of the frame still has to say WHOSE it is.
  const tail = Math.max(TAIL_H, sy - top - boxH);
  ctx.fillRect(sx - 2, top + boxH, 4, tail + 1);
  ctx.fillStyle = FILL;
  ctx.fillRect(left, top, boxW, boxH);
  ctx.fillRect(sx - 1, top + boxH, 2, tail);
  for (const [i, line] of lines.entries()) {
    font.draw(
      ctx,
      line,
      left + PAD_X,
      top + PAD_Y + i * (font.height + 1) * TEXT_SCALE,
      { scale: TEXT_SCALE, color: INK },
    );
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
