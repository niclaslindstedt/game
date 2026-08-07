// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE GLUED HAVE TO SAY, AND HOW IT REACHES THE SCREEN.
//
// THE WORDS ARE HERE RATHER THAN IN A THOUGHT CATALOG, and the reason is the
// shape of the line rather than a filing preference. `content/thoughts.yaml`
// holds BEATS: a speaker's name, a portrait family, pages the dialogue box
// flows into a measured column and the player taps through. Not one of those
// four things exists here — a line shouted from a road going past at 120 mph has
// no name plate, no face, no column and nobody to tap it. It is a
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

/**
 * BARE FLOATING TEXT, THE WAY THE RUN ALREADY SPEAKS — the ink, and the hard
 * one-pixel shadow under it.
 *
 * IT IS NOT A SPEECH BUBBLE, and it stopped being one after a look at it. A
 * panel with a rim, a fill and a tail is the game's WINDOW skin, and a window is
 * a thing the player is meant to stop and read — it takes a fifth of a
 * 844×390 frame, it covers the town, and over a road going past at 120 mph it
 * reads as the game having paused when it plainly has not. What the run already
 * uses for a word that has to be read WITHOUT stopping anything is the float
 * (`kind: "text"` in render/effects.ts): pixel glyphs, a hard near-black
 * shadow a pixel down-right so they keep contrast over anything, and no
 * furniture at all. That is what a line shouted from a road is, so that is what
 * these are.
 *
 * The shadow is the whole reason it works over tarmac AND over the pale
 * crossing paint the blockade is usually standing on — a low-contrast glyph is
 * invisible on exactly one of those two, whichever colour you pick.
 */
const INK = "#e8e4d8";
const SHADOW = "#0b0d10";

/** How wide a line is allowed to get, in unscaled font px, and the scale it is
 * drawn at. Wider than the boxed version could afford now there is no padding
 * or rim to pay for, which is fewer lines for the same words. */
const WRAP_PX = 62;
const TEXT_SCALE = 1;
/** How far above the body's own anchor the text sits (world px) — a seated
 * person is half the height of a standing one, so this clears a head rather
 * than a sprite. */
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
 * ONE VOICE AT A TIME, AND THAT NUMBER WAS ARRIVED AT BY LOOKING — three times.
 *
 * The blockade holds four voices spread through twenty people, all of them
 * inside a couple of hundred pixels of road. Four lines overprint into a single
 * block of illegible grey, which turns four people who have something to say
 * into one smudge. Stacking them in lanes fixed that and broke something else:
 * the formation spans the carriageway kerb to kerb, so the speaker nearest the
 * top edge has barely a body's height of sky above them, and the stack ran
 * straight off the top of the frame — clamped back down, the lanes collapsed
 * into each other and it was the smudge again. Dropping the boxes for bare
 * floating text bought a great deal of room back, and it did not change this
 * answer: two voices a lane apart still overprint, because what overlaps is the
 * TEXT and the boxes were only ever making it worse.
 *
 * So the NEAREST one speaks and the rest hold their placards in silence. As the
 * car closes, that one is passed and the next takes its place, which turns a
 * wall of text into a SEQUENCE — three or four lines read one after another over
 * the second and a half it takes to arrive, which is how you would actually read
 * a picket line through a windscreen.
 */
const MAX_BUBBLES = 1;
/** How close to the top of the picture a line may get (canvas px) — the top row
 * of the formation has almost no sky above it. */
const CEILING_PX = 6;

/** …read by the renderer, which is what decides WHICH one speaks: it has the
 * whole field and can pick the nearest, where this module only ever sees one
 * line at a time. */
export const MAX_PLACARDS = MAX_BUBBLES;

/** One speaker's line, floating over their own spot. This is a draw. */
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
  const alpha = awayPx > READ_PX - FADE_PX ? (READ_PX - awayPx) / FADE_PX : 1;
  const lines = font.wrap(text, WRAP_PX);
  const lineH = (font.height + 1) * TEXT_SCALE;
  // IN CANVAS SPACE, NOT THE WORLD'S — the one thing on this road drawn outside
  // the projection, and deliberately. Everything with a PLACE on the road is
  // raked with the tarmac it stands on; WORDS are not a thing on the road, they
  // are a thing being read, and a skewed paragraph is a worse paragraph. Where
  // it POINTS still comes from the world (`worldToCanvas` of the speaker's own
  // spot), so it stays over its owner as the road slides past.
  const seat = worldToCanvas(worldX, worldY, camera);
  const sx = Math.round(seat.x);
  const bottom = Math.round(seat.y) - LIFT;
  const top = Math.max(CEILING_PX, bottom - lines.length * lineH);

  ctx.save();
  ctx.globalAlpha = alpha;
  for (const [i, line] of lines.entries()) {
    const width = font.measure(line) * TEXT_SCALE;
    const x = Math.round(sx - width / 2);
    const y = top + i * lineH;
    // The shadow first, a pixel down-right, then the glyphs over it — the run's
    // own float, exactly (render/effects.ts).
    font.draw(ctx, line, x + 1, y + 1, { scale: TEXT_SCALE, color: SHADOW });
    font.draw(ctx, line, x, y, { scale: TEXT_SCALE, color: INK });
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
