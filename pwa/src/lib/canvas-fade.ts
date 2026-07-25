// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Fade a whole canvas draw pass out as ONE.
//
// A pass made of many pieces that each set their own `globalAlpha` (particles,
// glow trails, floating text) can't be dimmed by pre-scaling the destination
// context's alpha — the first piece that assigns `globalAlpha` throws the
// multiplier away. `drawFaded` renders the pass to a scratch canvas of the same
// size and blits that at the fade's alpha, so the pass composites as a single
// translucent layer with its internal alphas intact.

/** The scratch canvas, kept for the app's life and resized on demand — a pass
 * only routes through it while it is actually mid-fade. */
let layer: {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} | null = null;

function layerFor(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!layer) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    layer = { canvas, ctx };
  }
  const target = layer;
  if (target.canvas.width !== width || target.canvas.height !== height) {
    target.canvas.width = width;
    target.canvas.height = height;
  }
  target.ctx.clearRect(0, 0, width, height);
  return target;
}

/**
 * Run `draw` and composite everything it drew at `fade` opacity.
 *
 * `fade >= 1` draws straight to `ctx` (no scratch canvas, no blit) and
 * `fade <= 0` skips the pass entirely, so a caller can hand this the live fade
 * value every frame and pay nothing outside the transition. The scratch context
 * inherits `imageSmoothingEnabled` from `ctx` so pixel art stays crisp.
 */
export function drawFaded(
  ctx: CanvasRenderingContext2D,
  fade: number,
  draw: (target: CanvasRenderingContext2D) => void,
): void {
  if (fade <= 0) return;
  if (fade >= 1) {
    draw(ctx);
    return;
  }
  const target = layerFor(ctx.canvas.width, ctx.canvas.height);
  // No scratch context (a canvas-less environment): draw at full strength
  // rather than dropping the pass on the floor.
  if (!target) {
    draw(ctx);
    return;
  }
  target.ctx.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
  draw(target.ctx);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.drawImage(target.canvas, 0, 0);
  ctx.restore();
}
