// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SFW ANSWER TO A HIT — pastel stardust and glitter in place of blood,
// cleaves, gibs and burned remains.
//
// Pure presentation, deterministic on the effect seed, and deliberately made
// from canvas primitives rather than gore sprites: the mode must not reveal a
// red wound frame for one beat while the glitter arrives over it. A small hit
// gets a tight spray; a death that would have come apart gets the larger burst.

import { clamp01, fract } from "./shared.ts";
import type { Effect } from "./effects.ts";

const COLORS = ["#ff8fd8", "#c8a5ff", "#80e8ff", "#fff08a", "#a8ffc5"];

export type StardustSpec = {
  /** Damage in the victim's own healthbars, capped only by the draw budget. */
  intensity: number;
  /** A death that would have cleaved, gibbed or burned up. */
  burst: boolean;
  /** The DRIVE's denser, directional fairy-dust disintegration. */
  fairy?: boolean;
};

/** Exported for the focused presentation tests: a stronger blow earns more
 * glitter, but the per-hit hot-path always stays under one fixed draw budget. */
export function stardustCount(spec: StardustSpec): number {
  return Math.min(
    spec.fairy ? 72 : 56,
    8 +
      Math.round(Math.sqrt(Math.max(0, spec.intensity)) * 7) +
      (spec.burst ? 20 : 0) +
      (spec.fairy ? 12 : 0),
  );
}

function star(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
): void {
  const r = Math.max(1, Math.round(radius));
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x - r), Math.round(y));
  ctx.lineTo(Math.round(x + r), Math.round(y));
  ctx.moveTo(Math.round(x), Math.round(y - r));
  ctx.lineTo(Math.round(x), Math.round(y + r));
  ctx.stroke();
  if (r >= 2) {
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
}

/** Draw one SFW hit/death flourish. Returns false when the effect is not ours,
 * following the same claiming convention as blood.ts and dust.ts. */
export function drawStardust(
  ctx: CanvasRenderingContext2D,
  effect: Effect,
  x: number,
  y: number,
  timeMs: number,
): boolean {
  if (effect.kind !== "stardust") return false;
  const spec = effect.stardust;
  if (!spec) return true;
  const duration = effect.durationMs ?? (spec.burst ? 900 : 440);
  const t = clamp01(1 - (effect.untilMs - timeMs) / duration);
  const seed = effect.seed ?? 0;
  const count = stardustCount(spec);
  const power = Math.min(6, Math.max(0.1, spec.intensity));
  const reach =
    (spec.fairy ? 48 : spec.burst ? 38 : 15) * (0.8 + Math.sqrt(power) * 0.28);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Beat one: a soft white-pink contact flash. It is light, not a plate pasted
  // over the body, and clears before the individual glitter becomes the read.
  const flash = clamp01(1 - t / 0.28);
  if (flash > 0) {
    const radius = (spec.burst ? 13 : 7) * (0.45 + t * 1.6);
    // Three flat halos avoid allocating a CanvasGradient for every live hit on
    // every frame — a blockade can carry dozens of these at once.
    for (const [share, alpha, color] of [
      [1, 0.12, "#80e8ff"],
      [0.62, 0.24, "#ff9ee2"],
      [0.25, 0.5, "#ffffff"],
    ] as const) {
      ctx.globalAlpha = flash * alpha * (spec.burst ? 1 : 0.72);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y - 3, radius * share, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Beat two: the body of the burst. Every particle has its own delayed clock,
  // seeded bearing and pastel, so pausing/replaying draws the identical shower.
  for (let i = 0; i < count; i++) {
    const h1 = fract(seed * 0.731 + i * 0.377);
    const h2 = fract(seed * 0.517 + i * 0.911);
    const h3 = fract(seed * 0.293 + i * 0.641);
    const delay = h3 * 0.18;
    const life = clamp01((t - delay) / Math.max(0.01, 1 - delay));
    if (life <= 0 || life >= 1) continue;
    // Fairy dust peels away with the impact instead of exploding evenly in a
    // circle: a dissolving body caught in the wagon's slipstream. The ordinary
    // field hit stays radial.
    const angle = spec.fairy
      ? (effect.angle ?? 0) + (h1 - 0.5) * Math.PI * 0.9
      : h1 * Math.PI * 2;
    const travel = reach * (0.28 + h2 * 0.72) * (life * (2 - life));
    const lift = Math.sin(life * Math.PI) * (4 + 13 * h3);
    const heading = effect.angle ?? 0;
    const fairyDrift = spec.fairy ? life * life * reach * 0.35 : 0;
    const burstDrift = !spec.fairy && spec.burst ? life * (h2 - 0.5) * 8 : 0;
    const px =
      x +
      Math.cos(angle) * travel +
      Math.cos(heading) * fairyDrift +
      burstDrift;
    const py =
      y -
      3 +
      Math.sin(angle) * travel * 0.68 +
      Math.sin(heading) * fairyDrift * 0.68 -
      lift -
      life * 3;
    const fade = Math.sin(life * Math.PI) * (0.62 + h2 * 0.38);
    const color = COLORS[(i + Math.floor(seed)) % COLORS.length] ?? COLORS[0]!;

    // Roughly one particle in three catches as a proper four-point glint. The
    // rest are one- or two-pixel dust, so the picture is a cloud with highlights
    // rather than thirty identical star icons.
    if (i % 3 === 0) {
      const twinkle = 1 + Math.sin((life * 4 + h3) * Math.PI) * 1.4;
      star(ctx, px, py, twinkle, color, fade);
    } else {
      const size = life < 0.35 && i % 4 === 0 ? 2 : 1;
      ctx.globalAlpha = fade;
      ctx.fillStyle = i % 5 === 0 ? "#ffffff" : color;
      ctx.fillRect(
        Math.round(px - size / 2),
        Math.round(py - size / 2),
        size,
        size,
      );
    }
  }

  // Beat three: a few slower glints hang after the dust has travelled. They do
  // not mark the floor or persist; stardust is a flourish, not a new stain.
  if (spec.burst && t > 0.42) {
    const tail = clamp01((t - 0.42) / 0.58);
    for (let i = 0; i < 5; i++) {
      const a = spec.fairy
        ? (effect.angle ?? 0) + (fract(seed * 0.83 + i * 0.29) - 0.5) * 1.2
        : fract(seed * 0.83 + i * 0.29) * Math.PI * 2;
      const d = 6 + fract(seed * 0.47 + i * 0.61) * reach * 0.55;
      star(
        ctx,
        x + Math.cos(a) * d,
        y - 5 + Math.sin(a) * d * 0.55 - tail * 5,
        1.2 + Math.sin((tail * 3 + i * 0.37) * Math.PI) * 1.2,
        COLORS[i]!,
        (1 - tail) * 0.75,
      );
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return true;
}
