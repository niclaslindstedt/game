// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A RAIN LAYER — hash-placed streaks falling over a canvas region, animated
// off the caller's own clock. Generic: any screen with weather in it draws its
// rain through this (the launch cutscene's storm, the rocket climb's), so the
// two never disagree about what rain looks like.
//
// DETERMINISTIC AND STATELESS on purpose: every streak's place and pace is a
// hash of its own index, the fall is a function of `timeMs`, and nothing here
// touches an rng stream — presentation must never spend anybody's draw, and a
// layer with no state is one any caller can paint mid-frame without owning it.

export type RainOptions = {
  /** 0–1: density and visibility together. 1 is a downpour. */
  intensity: number;
  /** Horizontal px a streak leans over its own length — the wind. */
  slantPx?: number;
  /** World scroll, so streaks can live in the caller's world rather than on
   * the glass: the layer offsets by these and wraps. */
  scrollX?: number;
  scrollY?: number;
  color?: string;
};

/** One depth of the sheet: nearer rain is longer, faster and brighter. */
const DEPTHS = [
  { lengthPx: 11, speedPx: 640, alpha: 0.34, salt: 0x1f123bb5 },
  { lengthPx: 7, speedPx: 430, alpha: 0.2, salt: 0x5bd1e995 },
] as const;

/** Streaks per depth at intensity 1, per 10k px² of region. */
const DENSITY_PER_10K = 9;

function hash01(n: number): number {
  let h = (n ^ 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

/** Paint the sheet over `x,y,w,h`. Call after the picture it falls on. */
export function drawRain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  timeMs: number,
  opts: RainOptions,
): void {
  const intensity = Math.min(1, Math.max(0, opts.intensity));
  if (intensity <= 0) return;
  const slant = opts.slantPx ?? 3;
  const scrollX = opts.scrollX ?? 0;
  const scrollY = opts.scrollY ?? 0;
  ctx.save();
  ctx.strokeStyle = opts.color ?? "#9db4d8";
  ctx.lineWidth = 1;
  for (const depth of DEPTHS) {
    const span = h + depth.lengthPx;
    const count = Math.round(((w * h) / 10000) * DENSITY_PER_10K * intensity);
    ctx.globalAlpha = depth.alpha * intensity;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const hx = hash01(i * 2 + depth.salt);
      const hy = hash01(i * 2 + 1 + depth.salt);
      const pace = 0.75 + hash01(i * 3 + depth.salt) * 0.5;
      const fall = (timeMs / 1000) * depth.speedPx * pace;
      let sx = hx * w + scrollX;
      let sy = hy * span + fall + scrollY;
      sx = ((sx % w) + w) % w;
      sy = (((sy % span) + span) % span) - depth.lengthPx;
      ctx.moveTo(x + sx, y + sy);
      ctx.lineTo(x + sx + slant, y + sy + depth.lengthPx);
    }
    ctx.stroke();
  }
  ctx.restore();
}
