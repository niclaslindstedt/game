// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The DEATH SCENE's screen wash: the clouds that roll across the field while
// the hero lies fallen and the horde rings him (`phase === "dying"`, held
// through the `defeat` splash behind the modal). Purely presentational — the
// engine owns the mob choreography and the timer (death-scene.ts); this only
// reads `deathScene.ms` to time the roll. Drawn in screen space over the whole
// world (fog and all) so the field is swallowed by drifting cloud and darkens
// as the modal approaches.

import { DEATH_SCENE, type GameState } from "@game/core";

import { clamp01, fract, type ViewSize } from "./shared.ts";

// The banks of cloud that drift in and thicken. Each is seeded off its index so
// the roll is deterministic (like every other FX). Many soft puffs sweeping
// across, plus a creeping darkening, reads as fog closing over the scene.
const CLOUD_BANKS = 30;

/**
 * Roll clouds across the field for the death scene. `intensity` eases 0→1 over
 * the scene: the clouds drift in from the edges, swell, and dim the world under
 * a cold pall so the tableau (the sprawled hero, the silent ring of mobs) sinks
 * into gloom just as the YOU DIED modal rises. A no-op outside the death scene.
 */
export function drawDeathClouds(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  view: ViewSize,
  timeMs: number,
): void {
  if (state.phase !== "dying" && state.phase !== "defeat") return;
  const scene = state.deathScene;
  // Full and held once the modal is up (no live scene) — the pall doesn't lift.
  const prog = scene ? clamp01(scene.ms / DEATH_SCENE.durationMs) : 1;
  // The field stays clear for the first beat (the collapse reads) and the clouds
  // then roll in fast, building through the scene toward the modal. A short
  // clear hold, then a near-linear climb — so the fog is visibly filling the
  // screen by mid-scene, not only at the very end.
  const intensity = clamp01((prog - 0.1) / 0.9);
  if (intensity <= 0) return;
  const { width, height } = view;

  ctx.save();

  // A cold darkening wash creeping over the whole field — the light going out.
  ctx.globalAlpha = 0.42 * intensity;
  ctx.fillStyle = "#080911";
  ctx.fillRect(0, 0, width, height);
  // Back to full so the cloud gradients paint at their own rgba alpha (the wash
  // alpha above would otherwise scale them down to nothing).
  ctx.globalAlpha = 1;

  // The rolling storm: dark billowing cloud banks sweeping across the screen,
  // each on its own lane, phase, and speed. Drawn with plain source-over in a
  // DARK storm-grey so overlapping banks ACCUMULATE — the field is swallowed
  // and genuinely filled with cloud as the scene deepens (rather than the light
  // haze an additive puff gives over the pale floor). A faint lighter crown on
  // each bank gives the billows form.
  const span = width + 260;
  for (let i = 0; i < CLOUD_BANKS; i++) {
    const lane = fract(i * 3.17);
    const speed = 10 + fract(i * 7.7) * 30; // px/s drift
    const dir = i % 2 === 0 ? 1 : -1;
    // Sweep across a span wider than the screen so banks enter and leave the
    // edges rather than popping in place — clouds wandering in over the field.
    const base = fract(i * 11.13) * span;
    const drift = (timeMs / 1000) * speed * dir;
    const cx = ((((base + drift) % span) + span) % span) - 130;
    const cy = lane * height + Math.sin(timeMs / 1400 + i) * 12;
    const radius = (78 + fract(i * 5.9) * 92) * (0.62 + 0.38 * intensity);
    // Thicken toward the end (intensity²) so the field is CLEAR early and truly
    // filled with cloud by the time the modal rises.
    const a =
      (0.16 + fract(i * 2.3) * 0.12) * intensity * (0.45 + 0.55 * intensity);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(22,24,32,${a})`);
    grad.addColorStop(0.55, `rgba(28,31,41,${a * 0.7})`);
    grad.addColorStop(1, "rgba(28,31,41,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    // A faint cold crown catching the last light on the billow's upper edge.
    const crownR = radius * 0.6;
    const cgy = cy - radius * 0.28;
    const ca = a * 0.5;
    const crown = ctx.createRadialGradient(cx, cgy, 0, cx, cgy, crownR);
    crown.addColorStop(0, `rgba(96,104,126,${ca})`);
    crown.addColorStop(1, "rgba(96,104,126,0)");
    ctx.fillStyle = crown;
    ctx.beginPath();
    ctx.arc(cx, cgy, crownR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}
