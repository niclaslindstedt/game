// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// BLOOM — the light in the frame bleeding out past the things making it.
//
// This is the one post-effect that belongs ON the canvas rather than in CSS (see
// ./postfx.ts for why the other three don't): the light it blooms is the game's
// own baked glow art — the loot rarity shafts, the level-up pillar, a muzzle
// flash, a boss's beam, the elevator's call ring — which lives on the canvas's
// own ~422×195 pixel grid. Blooming at device resolution would make the halo
// smoother than the light that cast it, which reads as a photo filter laid over
// pixel art instead of pixel art glowing.
//
// It runs IN PLACE on the finished frame, which is what keeps it free of blast
// radius: the world canvas stays the presented canvas, so every screen↔world
// crossing, every DOM overlay that pins itself to a world point, the screenshot
// tooling and the effects gallery are all untouched. Nothing above this module
// knows it exists.
//
// THREE DRAWS: the frame is halved with the darks crushed out of it, halved
// again with a blur on the way down, and added back. At a quarter of 422×195
// that is a ~105×48 buffer — small enough that the whole pass is cheaper than
// the loot auras it is blooming, which matters because the reference device is a
// phone.
//
// TWO OF THOSE THREE STEPS ARE LOAD-BEARING IN WAYS THAT ARE EASY TO UNDO, and
// both of them were wrong in the first version of this file: it thresholded at a
// luminance BELOW the floor of every venue in the game (so the ground bloomed,
// and the picture came out milky), and it reached the quarter-size buffer in ONE
// ×4 minify (which Canvas2D undersamples, so the halo pulsed as the camera
// panned). The notes on BRIGHT_PASS and on the halving below are those two bugs
// written down; a "simplification" of either brings its own straight back.

import { clamp01 } from "./shared.ts";

/** How much smaller the bloom buffer is than the frame. 4 is chosen for the
 * LOOK as much as the cost: the blur radius is in buffer px, so a quarter-size
 * buffer turns a 3 px blur into a 12 px spread on the canvas — a soft, wide
 * halo — while a full-size buffer at the same radius would be a tight rim that
 * reads as a stroke rather than as light. */
const DOWNSCALE = 4;

/** Blur radius in BUFFER px, so ×DOWNSCALE on the canvas. */
const BLUR_PX = 3;

/**
 * THE BRIGHT PASS — the threshold that decides what counts as light.
 *
 * `brightness(b) contrast(c)` is the only shape Canvas2D can express here (it
 * has no threshold operator): everything under the knee is pushed toward black
 * and the highlights are kept, which is a threshold with a soft knee. These
 * numbers put the knee at a luminance of **0.795** — the output is 0 where
 * `0.55·x = 0.5 − 0.5/8`, i.e. x = 0.795, ramping to 0.9 at white.
 *
 * THAT NUMBER IS NOT A TASTE SETTING; it is measured against the game's own
 * floors. Sample any frame and the ordinary ground is not a minority of the
 * picture, it IS the picture: the moon's regolith sits at 0.554 luminance and
 * GOODCO HQ's deck at 0.701 — each of them the 50th AND the 90th percentile of
 * its own frame. The lights this exists for live in the top half-percent, at
 * 0.85 and up. So the knee has to clear the brightest ordinary FLOOR with margin
 * and still sit under the dimmest LIGHT, and 0.795 is the middle of that gap.
 *
 * The first version of this file used `brightness(0.72) contrast(3.4)`, whose
 * knee is at 0.49 — BELOW the floor of every venue in the game. So better than
 * nine tenths of every frame was classed as light and added back over itself:
 * measured on real frames, it lifted the mean luminance of the whole picture by
 * 14–24%, which is why the moon came out a milky lavender and GOODCO HQ's deck
 * came out bleached with its tile grid gone. That is haze, not bloom, and this
 * number is the whole difference between the two.
 */
const BRIGHT_BRIGHTNESS = 0.55;
const BRIGHT_CONTRAST = 8;
const BRIGHT_PASS = `brightness(${BRIGHT_BRIGHTNESS}) contrast(${BRIGHT_CONTRAST})`;

/**
 * The luminance the bright pass cuts at, DERIVED from the very numbers that
 * build the filter above so a test cannot check a stale copy of it.
 *
 * Exported for `tests/content/bloom_threshold_test.ts`, which holds it above the
 * brightest ground tile any venue actually lays down — the invariant that was
 * broken, and the one a new pale floor would break again in silence.
 */
export function brightPassKnee(): number {
  return (0.5 - 0.5 / BRIGHT_CONTRAST) / BRIGHT_BRIGHTNESS;
}

/**
 * How hard the halo is added back at the knob's 1×.
 *
 * Deliberately RESTRAINED. Bloom is the effect most able to wreck pixel art,
 * because every luminance point it adds is a luminance point of the artist's own
 * shading it paints over: at 0.7 the loot shafts glow nicely and the level-up
 * pillar has already lost the inside of its ring, and past that a big light
 * stops reading as a shape at all and the hero standing in it disappears. At 0.4
 * a light gains a halo and keeps its drawing, which is the whole target — and a
 * player who wants the overdose has a knob that reaches 2×.
 *
 * That headroom past 1× is spent by ADDING THE BUFFER AGAIN rather than by
 * raising this (see `applyBloom`), because `globalAlpha` cannot exceed 1 — so
 * the whole 0–2 range stays linear instead of flattening out part way along.
 */
const GAIN = 0.4;

/** The scratch buffers, kept across frames — a canvas per frame at 60 Hz is the
 * one allocation pattern that would make this pass cost more than it draws. */
type Scratch = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
type Buffers = {
  w: number;
  h: number;
  /** Half size: the crushed frame. Its whole reason for existing is that the
   * step down to `quarter` has to be two halvings rather than one ×4 minify. */
  half: Scratch;
  /** Quarter size: the blurred bloom buffer that gets added back. */
  quarter: Scratch;
};
let buffers: Buffers | null = null;

function scratch(w: number, h: number): Scratch | null {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

function ensureBuffers(w: number, h: number): Buffers | null {
  if (buffers && buffers.w === w && buffers.h === h) return buffers;
  const half = scratch(
    Math.max(1, Math.floor(w / 2)),
    Math.max(1, Math.floor(h / 2)),
  );
  const quarter = scratch(
    Math.max(1, Math.floor(w / DOWNSCALE)),
    Math.max(1, Math.floor(h / DOWNSCALE)),
  );
  if (!half || !quarter) return null;
  buffers = { w, h, half, quarter };
  return buffers;
}

/**
 * Does this browser do what the pass needs? `ctx.filter` is the whole mechanism
 * — without it the "bloom" would be an unthresholded, unblurred copy of the
 * frame added to itself, i.e. the picture washed out. Feature-detected once, and
 * a browser without it simply gets no bloom rather than a broken one.
 */
let filterSupport: boolean | null = null;
function supportsFilter(): boolean {
  if (filterSupport !== null) return filterSupport;
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return (filterSupport = false);
  probe.filter = "blur(1px)";
  filterSupport = probe.filter !== "none" && probe.filter !== "";
  return filterSupport;
}

/**
 * Halve `source` into `dest` under `filter`.
 *
 * A canvas `filter` runs in the DESTINATION's coordinate space — i.e. AFTER the
 * resample — which is what lets both of this pass's filtered steps ride a
 * halving draw instead of costing a blit of their own. Verified rather than
 * assumed: minify-then-blur and blur-on-the-minify come out bit-identical, and a
 * crush on a minifying draw judges the AVERAGE rather than the source pixels.
 *
 * `copy` so each step REPLACES what the last frame left rather than compositing
 * over it, and smoothing ON because the averaging IS half the blur — a
 * nearest-neighbour halving would sample one pixel in four and turn a thin light
 * into a dashed line.
 */
function halveInto(dest: Scratch, source: HTMLCanvasElement, filter: string) {
  dest.ctx.setTransform(1, 0, 0, 1, 0, 0);
  dest.ctx.globalAlpha = 1;
  dest.ctx.globalCompositeOperation = "copy";
  dest.ctx.imageSmoothingEnabled = true;
  dest.ctx.filter = filter;
  dest.ctx.drawImage(
    source,
    0,
    0,
    source.width,
    source.height,
    0,
    0,
    dest.canvas.width,
    dest.canvas.height,
  );
  dest.ctx.filter = "none";
}

/**
 * Bloom the finished frame in place. `amount` is the SETTINGS → VISUALS knob (0
 * = off, and off does no work at all).
 *
 * Call it after everything world-anchored has been drawn and before any HUD or
 * debug text: those are UI, and UI that blooms reads as a fault rather than as
 * atmosphere.
 */
export function applyBloom(
  ctx: CanvasRenderingContext2D,
  amount: number,
): void {
  if (amount <= 0 || !supportsFilter()) return;
  const source = ctx.canvas;
  const bufs = ensureBuffers(source.width, source.height);
  if (!bufs) return;

  // 1. HALF SIZE, WITH THE DARKS CRUSHED OUT, so only the lights survive.
  // 2. QUARTER SIZE, BLURRING ON THE WAY DOWN.
  //
  // TWO HALVINGS, NOT ONE ×4 MINIFY — this is the flicker fix, and it is the
  // only reason the `half` buffer exists. Canvas2D minification is a 2×2
  // bilinear tap with no mipmap, so it is an honest box filter at exactly ×0.5
  // and an undersample at anything smaller. At ×0.25 it SKIPS most of the
  // frame: draw a 4×4 with one white pixel down to 1×1 in one step and Chrome
  // returns 0, where a true average is 16. Which pixels get dropped is decided
  // by the sample grid, so as the camera pans the ground one canvas pixel at a
  // time, lights drop in and out of the buffer and the halo pulses. Measured on
  // real frames, that made the bloom's contribution to the picture's brightness
  // jump by up to 1.9 luminance points between consecutive one-pixel pans; two
  // halvings put it at 0.14.
  //
  // The crush rides the FIRST halving rather than a full-size blit of its own,
  // so it thresholds 2×2 averages rather than source pixels. That is a
  // deliberate trade and it was measured both ways: a full-resolution bright
  // pass costs ~40% more per frame and buys a slightly cleaner threshold (0.10
  // luminance points of pan-flicker against 0.14), which is invisible beside
  // the 1.9 it replaces. What it costs is that a ONE-PIXEL spark no longer
  // blooms — it is averaged to a quarter of its brightness and falls under the
  // knee — and that turned out to be a second small win: the game's lights are
  // baked glow blobs, while what a full-res threshold additionally caught was
  // the floating damage NUMBERS, whose thin strokes it softened.
  halveInto(bufs.half, source, BRIGHT_PASS);
  halveInto(bufs.quarter, bufs.half.canvas, `blur(${BLUR_PX}px)`);

  // 3. ADD IT BACK OVER THE FRAME. `lighter` because light ADDS — anything else
  //    darkens where two glows overlap, which is the one thing light never
  //    does. The upscale is smoothed for the same reason the downscale is: the
  //    halo is the only thing in the frame that is meant to be a gradient.
  //
  //    The knob's gain can exceed 1 and `globalAlpha` cannot, so the total is
  //    spent over as many blits as it takes. That keeps the whole 0–2 range
  //    linear — clamping instead would make every setting from ~1.4× up look
  //    identical, which is a knob that stops answering half way along.
  const prevSmoothing = ctx.imageSmoothingEnabled;
  const prevOp = ctx.globalCompositeOperation;
  const prevAlpha = ctx.globalAlpha;
  const prevTransform = ctx.getTransform();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = "lighter";
  const buffer = bufs.quarter.canvas;
  let remaining = GAIN * amount;
  while (remaining > 0.001) {
    ctx.globalAlpha = clamp01(remaining);
    ctx.drawImage(
      buffer,
      0,
      0,
      buffer.width,
      buffer.height,
      0,
      0,
      source.width,
      source.height,
    );
    remaining -= 1;
  }
  ctx.globalAlpha = prevAlpha;
  ctx.globalCompositeOperation = prevOp;
  ctx.imageSmoothingEnabled = prevSmoothing;
  ctx.setTransform(prevTransform);
}

/** Drop the scratch buffers — for tests, and for a context that has gone away. */
export function resetBloom(): void {
  buffers = null;
  filterSupport = null;
}
