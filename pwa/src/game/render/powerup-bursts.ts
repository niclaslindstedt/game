// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The POWERUPS' one-shot bursts — the world-anchored half of the four powers
// that go off rather than run: a MOONFALL rock landing, one of THE UNMAKING's
// waves, a BLAST SHIELD shattering, and a CONTINUITY PROTOCOL ward holding a
// killing blow. The running powers' sustained visuals are ./powerups.ts; the
// screen-space flashes that ride on top of these are the DOM aura layer
// (game-screen/powerup-aura.ts).
//
// Each is a plain `t: 0 → 1` timeline like every other effect, seeded off the
// effect (never `Math.random` in a draw pass) so a burst holds still across
// its own frames instead of boiling.

import { DEFAULT_POWERUP_STYLE, type PowerupStyle } from "../powerup-fx.ts";
import { clamp01, fract } from "./shared.ts";
import type { Effect } from "./effects.ts";

/** The powerup burst kinds this module owns. */
export const POWERUP_BURST_KINDS = new Set([
  "meteorFall",
  "voidWave",
  "barrierBreak",
  "wardHold",
]);

/**
 * Draw one powerup burst at screen (`x`, `groundY`). Returns false when the
 * effect isn't one of ours, so the main effect pass can fall through to its
 * own kinds.
 */
export function drawPowerupBurst(
  ctx: CanvasRenderingContext2D,
  effect: Effect,
  x: number,
  groundY: number,
  timeMs: number,
): boolean {
  if (!POWERUP_BURST_KINDS.has(effect.kind)) return false;
  const duration = effect.durationMs ?? 600;
  const t = clamp01(1 - (effect.untilMs - timeMs) / duration);
  const seed = effect.seed ?? 0;
  // The colours of the power that threw it — stamped on the effect by the event
  // pass, so a MOD's burst is drawn in its own kit rather than in whichever
  // shipped power happens to share its block.
  const style = effect.style ?? DEFAULT_POWERUP_STYLE;
  if (effect.kind === "meteorFall") {
    drawMeteorFall(ctx, x, groundY, t, seed, effect.radius ?? 40, style);
  } else if (effect.kind === "voidWave") {
    drawVoidWave(ctx, x, groundY, t, seed, effect.radius ?? 120, style);
  } else if (effect.kind === "barrierBreak") {
    drawBarrierBreak(ctx, x, groundY, t, seed, style);
  } else {
    drawWardHold(ctx, x, groundY, t, style);
  }
  return true;
}

/**
 * MOONFALL: a rock ARRIVES. The first fifth of the timeline is the fall — a
 * lit streak dropping in from off the top of the frame with the rock at its
 * head — and the rest is the landing: a white flash, a dust shockwave rolling
 * out along the ground, splinters of regolith flung out and bouncing, and the
 * grey cloud that settles over the crater. The fall is what makes it read as
 * coming from the sky rather than appearing on it.
 */
function drawMeteorFall(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  t: number,
  seed: number,
  radius: number,
  style: PowerupStyle,
): void {
  ctx.save();

  // ── The fall (t < 0.2): the rock coming down, lit, on a bright streak.
  if (t < 0.2) {
    const drop = t / 0.2; // 0 at the top of the frame → 1 at the ground
    const from = 150; // how far above the impact the fall starts
    const ry = groundY - from * (1 - drop);
    ctx.globalCompositeOperation = "lighter";
    const streak = ctx.createLinearGradient(x, ry - 60, x, ry);
    streak.addColorStop(0, `rgba(${style.core}, 0)`);
    streak.addColorStop(1, `rgba(${style.hot}, 0.75)`);
    ctx.strokeStyle = streak;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, ry - 60);
    ctx.lineTo(x, ry);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgb(${style.deep})`;
    ctx.beginPath();
    ctx.arc(x, ry, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${style.core}, 0.9)`;
    ctx.beginPath();
    ctx.arc(x - 1, ry - 1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // ── The landing. Re-based so the impact runs its own 0 → 1.
  const it = clamp01((t - 0.2) / 0.8);
  ctx.globalCompositeOperation = "lighter";
  // Flash: a hard white bloom in the opening beats of contact.
  if (it < 0.3) {
    const f = 1 - it / 0.3;
    const glare = ctx.createRadialGradient(
      x,
      groundY,
      0,
      x,
      groundY,
      radius * (0.5 + it),
    );
    glare.addColorStop(0, `rgba(255, 255, 255, ${0.9 * f})`);
    glare.addColorStop(0.5, `rgba(${style.core}, ${0.5 * f})`);
    glare.addColorStop(1, `rgba(${style.core}, 0)`);
    ctx.fillStyle = glare;
    ctx.beginPath();
    ctx.arc(x, groundY, radius * (0.5 + it), 0, Math.PI * 2);
    ctx.fill();
  }
  // Dust shockwave: two rings rolling out along the floor to the blast reach.
  for (let r = 0; r < 2; r++) {
    const rt = clamp01((it - r * 0.14) / (1 - r * 0.14));
    if (rt <= 0) continue;
    const reach = radius * (0.2 + rt * 1.05);
    ctx.globalAlpha = 0.7 * (1 - rt) * (1 - rt);
    ctx.strokeStyle = r === 0 ? `rgb(${style.hot})` : `rgb(${style.core})`;
    ctx.lineWidth = Math.max(1, 3 * (1 - rt));
    ctx.beginPath();
    ctx.ellipse(x, groundY, reach, reach * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Splinters: regolith flung out on a low arc, tumbling, settling as it lands.
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < 14; i++) {
    const a = fract(seed + i * 1.7) * Math.PI * 2;
    const speed = 30 + fract(seed + i * 3.1) * 55;
    const ease = 1 - (1 - it) * (1 - it);
    const reach = speed * ease;
    const sx = x + Math.cos(a) * reach;
    const sy =
      groundY + Math.sin(a) * reach * 0.55 - Math.sin(it * Math.PI) * 14;
    ctx.fillStyle = `rgba(${it < 0.5 ? style.hot : style.core}, ${1 - it})`;
    const s = fract(seed + i * 5.9) < 0.4 ? 2 : 1;
    ctx.fillRect(Math.round(sx), Math.round(sy), s, s);
  }
  // The cloud the crater is left under — grey, thinning as it spreads.
  const cloud = radius * (0.35 + it * 0.75);
  ctx.globalAlpha = 0.4 * (1 - it) * (1 - it);
  ctx.fillStyle = `rgb(${style.deep})`;
  ctx.beginPath();
  ctx.ellipse(x, groundY, cloud, cloud * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * THE UNMAKING: a wave that takes the world away as it passes. The leading
 * edge is drawn DARK and opaque — it is the one ring in the game that
 * subtracts — with a violet rim riding it, ragged spokes tearing outward
 * behind it, and specks of what it passed over dissolving in its wake.
 */
function drawVoidWave(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  t: number,
  seed: number,
  radius: number,
  style: PowerupStyle,
): void {
  const reach = radius * (0.12 + 0.95 * (1 - (1 - t) * (1 - t))); // ease-out
  const fade = 1 - t;
  ctx.save();

  // The dark leading edge: a thick, opaque band — what the wave has unwritten.
  ctx.strokeStyle = `rgba(${style.deep}, ${0.85 * fade})`;
  ctx.lineWidth = 7 * fade + 2;
  ctx.beginPath();
  ctx.ellipse(x, groundY, reach, reach * 0.62, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalCompositeOperation = "lighter";
  // The rim riding it, and a second, hotter edge just inside.
  ctx.strokeStyle = `rgba(${style.core}, ${0.9 * fade})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, groundY, reach, reach * 0.62, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${style.hot}, ${0.45 * fade})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, groundY, reach * 0.82, reach * 0.82 * 0.62, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Tearing spokes: ragged strokes reaching outward past the edge, each on its
  // own length, so the wave's rim reads as ripped rather than drawn.
  for (let i = 0; i < 18; i++) {
    const a = fract(seed + i * 2.3) * Math.PI * 2;
    const len = 6 + fract(seed + i * 4.1) * 16 * fade;
    const x0 = x + Math.cos(a) * reach;
    const y0 = groundY + Math.sin(a) * reach * 0.62;
    ctx.strokeStyle = `rgba(${style.core}, ${0.55 * fade})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len * 0.62);
    ctx.stroke();
  }
  // Specks dissolving in the wake, inside the ring the wave has already passed.
  for (let i = 0; i < 20; i++) {
    const a = fract(seed + i * 6.7) * Math.PI * 2;
    const r = reach * (0.2 + fract(seed + i * 8.3) * 0.7);
    const sx = x + Math.cos(a) * r;
    const sy = groundY + Math.sin(a) * r * 0.62 - t * 10;
    ctx.fillStyle = `rgba(${style.spark}, ${0.7 * fade})`;
    ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
  }
  ctx.restore();
}

/**
 * BLAST SHIELD SHATTERING: the shell's plates blow off the hero and tumble
 * away, each spinning as it goes, over one hard blue flash. The read has to be
 * "your shield is GONE" in a single frame — it is the moment the player stops
 * being protected.
 */
function drawBarrierBreak(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  t: number,
  seed: number,
  style: PowerupStyle,
): void {
  const fade = 1 - t;
  const y = groundY - 6; // the shell rides at body height, not the feet
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // The flash the shell gives up.
  if (t < 0.35) {
    const f = 1 - t / 0.35;
    const glare = ctx.createRadialGradient(x, y, 0, x, y, 22);
    glare.addColorStop(0, `rgba(${style.hot}, ${0.45 * f})`);
    glare.addColorStop(0.6, `rgba(${style.core}, ${0.28 * f})`);
    glare.addColorStop(1, `rgba(${style.core}, 0)`);
    ctx.fillStyle = glare;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
  }
  // The ring it was, blowing outward and thinning.
  ctx.strokeStyle = `rgba(${style.core}, ${0.8 * fade})`;
  ctx.lineWidth = 2 * fade + 0.5;
  ctx.beginPath();
  ctx.arc(x, y, 20 + t * 22, 0, Math.PI * 2);
  ctx.stroke();
  // Plates: short arcs flung out, each turning as it flies.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + fract(seed + i) * 0.4;
    const throw_ = 20 + t * (26 + fract(seed + i * 2.7) * 24);
    const px = x + Math.cos(a) * throw_;
    const py = y + Math.sin(a) * throw_ * 0.8;
    const spin = a + t * 5 * (fract(seed + i * 3.3) < 0.5 ? 1 : -1);
    ctx.strokeStyle = `rgba(${style.hot}, ${0.85 * fade})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 4, spin - 0.8, spin + 0.8);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * CONTINUITY PROTOCOL HOLDING: the blow that should have killed lands, and the
 * ward simply refuses it. Gold, and expensive-looking: a hard ring snapping
 * outward, a crown of spokes, and a slow shimmer settling back down over the
 * hero — this fires at the single most important moment in a run, so it is
 * allowed to be the loudest thing on the field for a beat.
 */
function drawWardHold(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  t: number,
  style: PowerupStyle,
): void {
  const fade = 1 - t;
  const y = groundY - 8;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // The refusal: a hard gold ring snapping out from the body.
  const snap = 8 + (1 - (1 - t) * (1 - t)) * 46;
  ctx.strokeStyle = `rgba(${style.hot}, ${0.95 * fade})`;
  ctx.lineWidth = 3 * fade + 1;
  ctx.beginPath();
  ctx.arc(x, y, snap, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${style.core}, ${0.6 * fade})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, snap * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  // The crown: twelve spokes of light, longest at the start.
  const spokes = 12;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + t * 0.6;
    const inner = 10 + t * 14;
    const outer = inner + 22 * fade;
    ctx.strokeStyle = `rgba(${style.hot}, ${0.6 * fade})`;
    ctx.lineWidth = 2 * fade;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
    ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer);
    ctx.stroke();
  }
  // The shimmer settling back over him — the ward is still up.
  const shimmer = ctx.createRadialGradient(x, y, 0, x, y, 26);
  shimmer.addColorStop(0, `rgba(${style.hot}, ${0.35 * fade})`);
  shimmer.addColorStop(1, `rgba(${style.core}, 0)`);
  ctx.fillStyle = shimmer;
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
