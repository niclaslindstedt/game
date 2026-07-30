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
// THREE DRAWS, ALL AT A QUARTER SIZE. The frame is downscaled into a scratch
// canvas with the darks crushed out of it, blurred, and added back. At a quarter
// of 422×195 that is a ~105×49 buffer — small enough that the whole pass is
// cheaper than the loot auras it is blooming, which matters because the
// reference device is a phone.

import { clamp01 } from "./shared.ts";

/** How much smaller the bloom buffer is than the frame. 4 is chosen for the
 * LOOK as much as the cost: the blur radius is in buffer px, so a quarter-size
 * buffer turns a 2 px blur into an 8 px spread on the canvas — a soft, wide
 * halo — while a full-size buffer at the same radius would be a tight rim that
 * reads as a stroke rather than as light. */
const DOWNSCALE = 4;

/** Blur radius in BUFFER px, so ×DOWNSCALE on the canvas. */
const BLUR_PX = 2;

/**
 * How hard the darks are crushed before blurring — the stand-in for a proper
 * bright-pass threshold, which Canvas2D has no operator for.
 *
 * `brightness(b) contrast(c)` with c well above 1 pushes everything below the
 * midpoint toward black while leaving the highlights, which is the same shape as
 * a threshold with a soft knee. It is not exact and does not need to be: what
 * matters is that ORDINARY floor and ORDINARY sprites contribute nothing, so the
 * bloom is the lights rather than a general glow over the whole picture. That
 * distinction is the entire difference between bloom and haze.
 */
const CRUSH = "brightness(0.72) contrast(3.4)";

/** The scratch buffer, kept across frames — a canvas per frame at 60 Hz is the
 * one allocation pattern that would make this pass cost more than it draws. */
let buffer: {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
} | null = null;

function ensureBuffer(w: number, h: number) {
  if (buffer && buffer.w === w && buffer.h === h) return buffer;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  buffer = { canvas, ctx, w, h };
  return buffer;
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
  const w = Math.max(1, Math.floor(source.width / DOWNSCALE));
  const h = Math.max(1, Math.floor(source.height / DOWNSCALE));
  const buf = ensureBuffer(w, h);
  if (!buf) return;

  // 1. Downscale the frame with the darks crushed out, so only the lights
  //    survive into the buffer. Smoothing stays ON for this one draw: the
  //    downscale is meant to average neighbouring pixels — that averaging IS the
  //    first half of the blur — where nearest-neighbour would sample one pixel
  //    in sixteen and turn a thin light into a dashed line.
  buf.ctx.setTransform(1, 0, 0, 1, 0, 0);
  buf.ctx.globalCompositeOperation = "copy";
  buf.ctx.globalAlpha = 1;
  buf.ctx.imageSmoothingEnabled = true;
  buf.ctx.filter = CRUSH;
  buf.ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, w, h);
  buf.ctx.filter = "none";

  // 2. Blur it, in place. `copy` again so the blurred copy REPLACES the crushed
  //    one rather than compositing over it (which would leave a hard core inside
  //    every halo and undo the softness this step exists for).
  buf.ctx.filter = `blur(${BLUR_PX}px)`;
  buf.ctx.drawImage(buf.canvas, 0, 0);
  buf.ctx.filter = "none";
  buf.ctx.globalCompositeOperation = "source-over";

  // 3. Add it back over the frame. `lighter` because light ADDS — anything else
  //    darkens where two glows overlap, which is the one thing light never does.
  //    The upscale is smoothed for the same reason as the downscale: the halo is
  //    the only thing in the frame that is meant to be a gradient.
  const prevSmoothing = ctx.imageSmoothingEnabled;
  const prevOp = ctx.globalCompositeOperation;
  const prevAlpha = ctx.globalAlpha;
  const prevTransform = ctx.getTransform();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = "lighter";
  // Capped below 1: the buffer already holds near-white cores, and adding those
  // at full strength blows the middle of every light to a flat white blob with
  // its shape lost. The knob's own headroom past 1× is deliberately spent on the
  // halo rather than the core.
  ctx.globalAlpha = clamp01(0.55 * amount);
  ctx.drawImage(buf.canvas, 0, 0, w, h, 0, 0, source.width, source.height);
  ctx.globalAlpha = prevAlpha;
  ctx.globalCompositeOperation = prevOp;
  ctx.imageSmoothingEnabled = prevSmoothing;
  ctx.setTransform(prevTransform);
}

/** Drop the scratch buffer — for tests, and for a context that has gone away. */
export function resetBloom(): void {
  buffer = null;
  filterSupport = null;
}
