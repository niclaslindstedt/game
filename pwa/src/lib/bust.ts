// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BUST — a character's sprite cropped to head and shoulders, so a portrait
// frame shows a FACE rather than a whole body standing in a box.
//
// A portrait frame is small and square, and a full-length sprite dropped into
// one comes out as a thumbnail of a person seen across a room: the head, which
// is the only part that says WHO is talking, ends up a handful of pixels tall
// with legs and boots taking the rest. Every game that shows a speaker beside a
// speech box crops in on the face instead, and so does this one.
//
// THE HARD PART IS THAT THE CAST IS NOT ONE SIZE. The art is drawn at a single
// pixel density — a 24px elite is a BIGGER PERSON than the 16px hero, not a
// more detailed one, and a 48px boss is bigger again — so the head is a
// different SHARE of the body in every one of them (the hero's is 43% of his
// ink, the architect's 27%, the founder's 35%). A fixed "top 60% of the sprite"
// crop therefore frames each of them differently: a face for one, a torso for
// the next. What has to be constant is the head, so the head is what the crop
// is measured in — the window is `HEADS` heads tall, wherever the head happens
// to end, which is a portrait camera at a fixed distance rather than a fixed
// slice off the top.
//
// FINDING THE HEAD IS THE NECK FIRST, NOT THE JUMP AT THE SHOULDERS. The
// obvious rule — "the first row much wider than the rows above it" — fires on
// row two of every sprite in the game, because a head WIDENS as it comes down
// from the crown (6 → 8 → 10 px on the hero) as sharply as the shoulders widen
// below it. A head instead ends where the silhouette PINCHES: widest at the
// ears, a narrowest row at the neck, then out again at the shoulders. That
// pinch is what this looks for first, and it is why the rule reads a running
// minimum rather than a running maximum.
//
// THE SECOND RULE IS FOR THE ONES WITH NO NECK TO FIND — a helmet, a hood, a
// visor, a hard hat: the moon's astronauts are exactly as wide at the shoulders
// as at the crown and pinch nowhere at all, and on a pinch rule alone every one
// of them came out framed head to boots. So a plain STEP OUT counts as
// shoulders too, once there is enough head above it to compare against
// (`MIN_HEAD_ROWS`, `MIN_FLARE_PX`) and once it HOLDS for the row below it
// (`SHOULDER_HOLD`) — because the other thing that steps out for exactly one
// row is a HAT BRIM, and framing on that leaves a portrait of a hat.
//
// AND IT DECLINES TO GUESS. A rover, a drifting core, a server rack and the
// campaign's rocket have no head at all, and a crop measured off a head that
// isn't there is measured off noise. When neither rule fires the whole thing is
// framed instead (`HEADLESS_SHARE`) — a thing with no face reads correctly as
// itself, which is the honest answer rather than a fallback.
//
// The geometry is a PURE function of the sprite's per-row ink spans
// (`bustFromSpans`), so it is unit-testable without a canvas; the canvas half is
// the two-line wrapper that reads the pixels and blits the crop.

/** What a bust can be cut out of: a sliced atlas sprite, or a canvas something
 * has been composed onto (the hero's paper doll). Spelled out rather than taken
 * as the wider `CanvasImageSource`, whose other members (a video, a live
 * `<img>`) have no size a crop could be measured against. */
export type Drawable = ImageBitmap | HTMLCanvasElement;

/** A rectangle in sprite pixels. */
export type Rect = { x: number; y: number; w: number; h: number };

/** One row of a sprite: its leftmost and rightmost opaque pixel, inclusive. */
export type Span = { x0: number; x1: number };

/** Alpha at or above which a pixel counts as ink. Pixel art is hard-edged, so
 * this only has to reject the fully-transparent field and the odd translucent
 * highlight authored over it. */
const ALPHA_MIN = 16;

/** How far below its widest row the silhouette must pinch before that pinch
 * counts as a neck rather than as the head's own taper. */
const NECK_DROP = 0.85;

/** How much wider than the neck a row must be to read as the shoulders under
 * it. A chin sits a row or two above a neck and is nearly as narrow, so a
 * gentle rise is still the head; the shoulders are a plain step out. */
const SHOULDER_RISE = 1.4;

/** How much wider than the head a row must be to read as shoulders when there
 * was no neck to find at all — a helmet, a hood or a visor is often exactly as
 * wide as the shoulders it sits on, and pinches nowhere. */
const SHOULDER_FLARE = 1.3;

/** Rows of head that must be in hand before a widening row can be called
 * shoulders. Without it the crown's own taper (6 → 8 px on the second row of
 * nearly every sprite in the game) reads as a step out and every portrait is
 * framed on the top two rows of a scalp. */
const MIN_HEAD_ROWS = 3;

/** …and the step has to be a real one in PIXELS as well as in proportion. A
 * ratio alone is meaningless at the crown, where a hairpin one pixel wide is
 * followed by rows of four and six — each of them a clean 1.3× step out. */
const MIN_FLARE_PX = 3;

/** …and it has to HOLD. Shoulders stay out; a hat brim is one wide row with a
 * face going narrow again under it, and framing on that leaves a portrait of a
 * hat. */
const SHOULDER_HOLD = 0.85;

/** A neck found below this share of the ink is not a neck — it is a waist, a
 * pair of legs, or a creature that happens to pinch in the middle. */
const NECK_MAX_DEPTH = 0.6;

/** The window, in heads: the head itself plus about as much again below it —
 * head, shoulders and the top of the chest, which is what reads as a portrait.
 * Tighter than this and the shoulders are cut off the sides of a small sprite. */
const HEADS = 1.9;

/** Air above the crown, as a share of the window. */
const HEADROOM = 0.08;

/** What a creature with no head shows: its whole width, or this share of its
 * height, whichever is larger. */
const HEADLESS_SHARE = 0.6;

/** The smallest window worth cropping to, in sprite pixels. */
const MIN_SIDE = 4;

/** Every row's ink span, top to bottom — null where a row is empty. */
export function inkSpans(pixels: ImageData): (Span | null)[] {
  const { width, height, data } = pixels;
  const spans: (Span | null)[] = [];
  for (let y = 0; y < height; y++) {
    let x0 = -1;
    let x1 = -1;
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) < ALPHA_MIN) continue;
      if (x0 < 0) x0 = x;
      x1 = x;
    }
    spans.push(x0 < 0 ? null : { x0, x1 });
  }
  return spans;
}

const widthOf = (span: Span) => span.x1 - span.x0 + 1;

/**
 * The last row of the head — the neck where the silhouette has one, the row
 * above the shoulders where it doesn't — or null when neither turns up, i.e.
 * when there is no head to find.
 */
function headBottom(spans: readonly (Span | null)[]): number | null {
  const rows: { y: number; w: number }[] = [];
  for (let y = 0; y < spans.length; y++) {
    const span = spans[y];
    if (span) rows.push({ y, w: widthOf(span) });
  }
  let peak = 0;
  let neck = -1;
  let narrowest = Infinity;
  for (let i = 0; i < rows.length; i++) {
    const { y, w } = rows[i]!;
    if (neck < 0) {
      // Still coming down the head: widening is expected here, so a row only
      // counts as shoulders when it steps plainly outside what the head above
      // it ever reached — and STAYS out. Shoulders hold their width; a hat
      // brim is one wide row over a face that goes narrow again beneath it.
      if (w <= peak * NECK_DROP) {
        neck = y;
        narrowest = w;
      } else if (
        i >= MIN_HEAD_ROWS &&
        w >= peak * SHOULDER_FLARE &&
        w >= peak + MIN_FLARE_PX &&
        (rows[i + 1]?.w ?? w) >= w * SHOULDER_HOLD
      ) {
        return rows[i - 1]!.y;
      } else peak = Math.max(peak, w);
    } else if (w <= narrowest) {
      neck = y;
      narrowest = w;
    } else if (w >= narrowest * SHOULDER_RISE) {
      // Past the pinch and stepping out again: shoulders.
      return neck;
    }
  }
  // Narrowed and never came back — a body tapering to its feet, not a neck.
  return null;
}

/**
 * The square head-and-shoulders window for a subject described by its per-row
 * ink spans, in that subject's own coordinates. Null when the subject is empty.
 *
 * The window may hang off the sprite's edges — a head close to the top of its
 * frame is given its headroom regardless, and the transparent margin that
 * results is exactly what the portrait's own dark frame is for.
 */
export function bustFromSpans(spans: readonly (Span | null)[]): Rect | null {
  let top = -1;
  let bottom = -1;
  let inkX0 = Infinity;
  let inkX1 = -Infinity;
  for (let y = 0; y < spans.length; y++) {
    const span = spans[y];
    if (!span) continue;
    if (top < 0) top = y;
    bottom = y;
    inkX0 = Math.min(inkX0, span.x0);
    inkX1 = Math.max(inkX1, span.x1);
  }
  if (top < 0) return null;
  const inkW = inkX1 - inkX0 + 1;
  const inkH = bottom - top + 1;

  // A head found this far down the body is not a head — the pinch was a waist,
  // or a pair of legs — and framing on it would cut the creature off at the
  // chest.
  const chin = headBottom(spans);
  const head =
    chin != null && chin - top < inkH * NECK_MAX_DEPTH
      ? { rows: chin - top + 1, ...headBox(spans, top, chin) }
      : null;

  const side = Math.max(
    MIN_SIDE,
    Math.min(
      Math.round(
        head ? head.rows * HEADS : Math.max(inkW, inkH * HEADLESS_SHARE),
      ),
      Math.max(inkW, inkH),
    ),
  );
  // Centred on the HEAD where there is one: a figure holding something out to
  // one side must not have its face shoved to the edge of its own portrait.
  const centreX = head ? (head.x0 + head.x1 + 1) / 2 : (inkX0 + inkX1 + 1) / 2;
  return {
    x: Math.round(centreX - side / 2),
    y: top - Math.max(1, Math.round(side * HEADROOM)),
    w: side,
    h: side,
  };
}

/** The head's own ink box — the rows from the crown down to the neck. */
function headBox(
  spans: readonly (Span | null)[],
  top: number,
  neck: number,
): { x0: number; x1: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  for (let y = top; y <= neck; y++) {
    const span = spans[y];
    if (!span) continue;
    x0 = Math.min(x0, span.x0);
    x1 = Math.max(x1, span.x1);
  }
  return { x0, x1 };
}

/**
 * The bust window for a drawable, in ITS coordinates. The window it returns is
 * a rect rather than a picture, so a caller may measure one image and crop
 * ANOTHER with the answer — which is how the hero's portrait is framed on his
 * bare body and drawn from his dressed, armed doll.
 */
export function bustRect(
  source: Drawable,
  width: number,
  height: number,
): Rect | null {
  if (width <= 0 || height <= 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0);
  return bustFromSpans(inkSpans(ctx.getImageData(0, 0, width, height)));
}

/** A drawable cropped to `rect`, as a data URL for a DOM `<img>`. */
export function cropDataUrl(source: Drawable, rect: Rect): string {
  const canvas = document.createElement("canvas");
  canvas.width = rect.w;
  canvas.height = rect.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, -rect.x, -rect.y);
  return canvas.toDataURL();
}

/**
 * A character cropped to head and shoulders, as a data URL — null when the
 * drawable is empty, so a caller can fall back to the full art.
 */
export function bustDataUrl(
  source: Drawable,
  width: number,
  height: number,
): string | null {
  const rect = bustRect(source, width, height);
  return rect ? cropDataUrl(source, rect) : null;
}
