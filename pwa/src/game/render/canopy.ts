// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CANOPY — scenery drifting BETWEEN the camera and the ground, drawn over the
// hero and the horde (see `LevelDef.canopy`).
//
// Three cues, and it needs all three or it reads as decor drawn in the wrong
// order rather than as something overhead:
//
//   PARALLAX  it slides faster under the camera than the ground does, which is
//             the only cue that actually says "nearer the eye" — the brain reads
//             relative motion long before it reads blur or opacity.
//   BLUR      it is not what you are looking at. Pre-blurred ONCE per sprite into
//             an offscreen canvas rather than through `ctx.filter` per draw: a
//             canvas filter re-runs the blur on every blit, which at a few dozen
//             pieces a frame is a measurable slice of the budget on a phone.
//   DRIFT     derived from the render clock, never stepped, so the layer costs
//             the simulation nothing and cannot desync a replay.
//
// The layer WRAPS: a piece's position is taken modulo the level, so a canopy of
// twenty pieces covers a map of any size and never runs out at the edges.
//
// It is drawn under the fog on purpose. Fog is what the hero has not seen, and he
// has not seen the sky over ground he has not walked either.

import type { GameState } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import type { ViewSize } from "./shared.ts";
import { type Camera } from "./view.ts";

/**
 * Pre-blurred sprite cache, keyed by sprite name + blur + scale. The canopy is
 * a handful of distinct sprites drawn many times, so the whole layer costs a few
 * canvases once and plain blits thereafter.
 */
const blurred = new Map<string, HTMLCanvasElement | null>();

function blurredSprite(
  sprites: Sprites,
  name: string,
  blur: number,
  scale: number,
): HTMLCanvasElement | null {
  const key = `${name}|${blur}|${scale}`;
  const hit = blurred.get(key);
  if (hit !== undefined) return hit;
  const src = spriteByName(sprites, name);
  let out: HTMLCanvasElement | null = null;
  if (src) {
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    // Pad by the blur radius so the soft edge is not clipped off at the bounds.
    const pad = Math.ceil(blur * 2);
    const canvas = document.createElement("canvas");
    canvas.width = w + pad * 2;
    canvas.height = h + pad * 2;
    const c = canvas.getContext("2d");
    if (c) {
      if (blur > 0) c.filter = `blur(${blur}px)`;
      c.drawImage(src, pad, pad, w, h);
      out = canvas;
    }
  }
  blurred.set(key, out);
  return out;
}

/** Positive modulo — a drifting piece must wrap, and `%` keeps the sign. */
function wrap(v: number, m: number): number {
  return ((v % m) + m) % m;
}

/**
 * Draw the level's canopy over the field.
 *
 * Each piece is placed at its drifted position taken modulo the level, then
 * offset by the camera SCALED BY ITS PARALLAX — so the layer slides over the
 * ground rather than with it. Because the modulo makes the layer periodic, a
 * piece near a seam is drawn again one level-width (or height) over, which is
 * what keeps the wrap invisible.
 */
export function drawCanopy(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  sprites: Sprites,
  camera: Camera,
  view: ViewSize,
  timeMs: number,
): void {
  const pieces = state.canopy;
  if (!pieces || pieces.length === 0) return;
  const t = timeMs / 1000;
  const levelW = state.level.width;
  const levelH = state.level.height;
  const prevAlpha = ctx.globalAlpha;
  for (const piece of pieces) {
    const img = blurredSprite(sprites, piece.sprite, piece.blur, piece.scale);
    if (!img) continue;
    const x = wrap(
      piece.pos.x + piece.vel.x * t - camera.x * piece.parallax,
      levelW,
    );
    const y = wrap(
      piece.pos.y + piece.vel.y * t - camera.y * piece.parallax,
      levelH,
    );
    ctx.globalAlpha = piece.alpha;
    // The four wrapped copies: whichever of them lands in view is the one seen,
    // and near a seam two of them are, which is what hides the seam.
    for (const ox of [0, -levelW]) {
      for (const oy of [0, -levelH]) {
        const dx = x + ox - img.width / 2;
        const dy = y + oy - img.height / 2;
        if (
          dx > view.width ||
          dy > view.height ||
          dx + img.width < 0 ||
          dy + img.height < 0
        )
          continue;
        ctx.drawImage(img, Math.round(dx), Math.round(dy));
      }
    }
  }
  ctx.globalAlpha = prevAlpha;
}

/** Drop the pre-blurred canvases — called when the sprite atlas is replaced. */
export function clearCanopyCache(): void {
  blurred.clear();
}
