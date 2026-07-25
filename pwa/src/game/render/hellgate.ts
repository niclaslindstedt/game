// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HELLGATE TEAR — the world-anchored effect for the engine's
// `hellgateOpened` event (config HELLGATES / src/game/spawners.ts): a rampage
// has grown ugly enough that one of a map's rampage-only spawn points RIPS OPEN
// and starts letting historic cross-universe horrors through.
//
// The read has to be "reality just tore", not "a monster arrived", so nothing
// here is a ring: it is a VERTICAL SLIT that snaps open, breathes, then leaves a
// churning wound. Four layers, all driven off one normalized `t` so the whole
// thing is a single timeline (see the `visual-effects` craft rules):
//
//   1. FLASH   — a white-violet blade of light on the opening frames, the
//                instant of the tear, gone within a fifth of the life.
//   2. SLIT    — the tear itself: a tall lens whose half-width EASES OPEN
//                (a fast cube-out so it snaps rather than grows), filled with
//                the void's near-black and rimmed in magenta.
//   3. VEINS   — deterministic lightning-ish cracks fanning off the slit into
//                the ground, seeded off the effect so they hold still across
//                frames instead of strobing.
//   4. EMBERS  — motes dragged OUT of the tear on outward arcs, cooling from
//                white through magenta to violet, so something is visibly
//                coming through rather than the hole just sitting there.
//
// The deeper the rampage that opened the gate, the BIGGER and longer the tear
// (`stage` scales reach and ember count) — the escalation the gates themselves
// run on, made visible. Split out of render/effects.ts as its own module so the
// tear's four layers don't push that file further past the source-size cap.

import { clamp01 } from "./shared.ts";

/** The tear's base half-height in world px before the rampage stage widens it. */
const BASE_REACH = 34;
/** Extra half-height per rampage stage past the gate's threshold, saturating —
 * a stage-100 gate is a wound in the map, not a hundred times a slit. */
const REACH_PER_STAGE = 5;
/** Cap on the tear's half-height however deep the rampage runs. */
const MAX_REACH = 86;
/** Embers dragged out at the shallowest gate, and per stage on top. */
const BASE_EMBERS = 14;
const EMBERS_PER_STAGE = 1.6;
const MAX_EMBERS = 46;

/** How tall a tear a gate opened at `stage` tears: saturating in the stage, so
 * the spectacle climbs steeply at first and then just gets meaner. */
export function hellgateReach(stage: number): number {
  return Math.min(MAX_REACH, BASE_REACH + Math.max(0, stage) * REACH_PER_STAGE);
}

/** A cheap deterministic hash → [0, 1). Seeded per ember so the fan holds still
 * for the whole life of one tear instead of re-rolling every frame. */
function hash01(seed: number, salt: number): number {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Draw one hellgate tear at screen `(x, y)`.
 *
 * @param t      progress through the effect's life, 0 → 1.
 * @param stage  the rampage stage the gate opened at (scales reach + embers).
 * @param seed   per-effect seed for the veins and the ember fan.
 */
export function drawHellgateTear(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  stage: number,
  seed: number,
): void {
  const p = clamp01(t);
  const reach = hellgateReach(stage);
  // The slit SNAPS open (cube-out over the first third), holds, then closes as
  // the tear seals — so the shape has an attack, a sustain and a release rather
  // than a linear grow-and-shrink.
  const open = p < 0.34 ? 1 - Math.pow(1 - p / 0.34, 3) : 1;
  const seal = p > 0.74 ? 1 - (p - 0.74) / 0.26 : 1;
  const halfH = reach * open * seal;
  // The slit BREATHES: its width wobbles a little so the wound churns instead
  // of sitting as a clean geometric lens.
  const breathe = 1 + 0.25 * Math.sin(p * Math.PI * 6 + seed);
  const halfW = Math.max(0.6, halfH * 0.19 * breathe);

  // 1. THE FLASH: the instant of the tear, a blade of white-violet light that
  // is gone almost at once — it sells the RIP, and additive light is what makes
  // a burst read as bright rather than merely pale.
  if (p < 0.2) {
    const f = 1 - p / 0.2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.85 * f;
    const grad = ctx.createLinearGradient(x - reach, y, x + reach, y);
    grad.addColorStop(0, "rgba(122, 44, 224, 0)");
    grad.addColorStop(0.5, "rgba(255, 236, 255, 1)");
    grad.addColorStop(1, "rgba(122, 44, 224, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(
      x - reach,
      y - halfH * (0.6 + 0.4 * f),
      reach * 2,
      halfH * 1.2,
    );
    ctx.restore();
  }

  // 2. THE SLIT: the void showing through, rimmed hot. Drawn as a lens (two
  // quadratic curves meeting at the poles) rather than an ellipse so the tear
  // has POINTS — the look of something ripped, not bored.
  if (halfH > 1) {
    ctx.beginPath();
    ctx.moveTo(x, y - halfH);
    ctx.quadraticCurveTo(x + halfW, y, x, y + halfH);
    ctx.quadraticCurveTo(x - halfW, y, x, y - halfH);
    ctx.closePath();
    ctx.fillStyle = `rgba(10, 6, 20, ${0.92 * seal})`;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(236, 82, 190, ${0.9 * seal})`;
    ctx.stroke();
    // An inner core glow, so the hole reads as DEEP rather than as a hole cut
    // in the floor.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = (0.3 + 0.2 * Math.sin(p * Math.PI * 5)) * seal;
    const core = ctx.createRadialGradient(x, y, 0, x, y, halfH * 0.8);
    core.addColorStop(0, "rgba(192, 92, 255, 1)");
    core.addColorStop(1, "rgba(122, 44, 224, 0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(x, y, halfW * 2.2, halfH * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 3. THE VEINS: cracks running off the tear into the ground — the tear is not
  // a free-floating light, it has BROKEN something. They grow with the slit and
  // fade out over the tail.
  const veins = 5;
  ctx.lineWidth = 1;
  for (let i = 0; i < veins; i++) {
    const r0 = hash01(seed, i * 3.1);
    const r1 = hash01(seed, i * 3.1 + 1);
    const up = i % 2 === 0 ? -1 : 1;
    const side = r0 < 0.5 ? -1 : 1;
    const len = halfH * (0.5 + r1 * 0.7);
    ctx.strokeStyle = `rgba(236, 82, 190, ${0.5 * seal * (1 - p * 0.6)})`;
    ctx.beginPath();
    ctx.moveTo(x, y + up * halfH * 0.35);
    ctx.lineTo(
      x + side * len * 0.5,
      y + up * (halfH * 0.35 + len * 0.35) + (r0 - 0.5) * 6,
    );
    ctx.lineTo(x + side * len, y + up * (halfH * 0.35 + len * 0.2));
    ctx.stroke();
  }

  // 4. THE EMBERS: motes dragged OUT of the tear along outward arcs, cooling as
  // they go — the visible proof that something is coming through. Additive, so
  // a swarm of them lights the ground the way sparks do.
  const embers = Math.min(
    MAX_EMBERS,
    Math.round(BASE_EMBERS + Math.max(0, stage) * EMBERS_PER_STAGE),
  );
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < embers; i++) {
    // Each ember has its own launch delay, so the fan pours out over the life
    // of the tear rather than all leaving on frame one.
    const delay = hash01(seed, i * 7.3) * 0.45;
    const life = (p - delay) / (1 - delay);
    if (life <= 0 || life >= 1) continue;
    const angle = hash01(seed, i * 7.3 + 2) * Math.PI * 2;
    const speed = 0.5 + hash01(seed, i * 7.3 + 4);
    const dist = life * reach * 1.5 * speed;
    // Arc: embers rise as they fly out and then fall back, so they read as
    // thrown matter under gravity rather than as a flat radial burst.
    const ex = x + Math.cos(angle) * dist;
    const ey =
      y + Math.sin(angle) * dist * 0.55 - Math.sin(life * Math.PI) * 10;
    // Cool white → magenta → violet as the ember ages.
    const heat = 1 - life;
    const r = Math.round(150 + 105 * heat);
    const g = Math.round(40 + 180 * heat * heat);
    const b = Math.round(200 + 55 * heat);
    ctx.globalAlpha = 0.85 * (1 - life);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    const size = 1 + Math.round(heat * 1.6);
    ctx.fillRect(Math.round(ex), Math.round(ey), size, size);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
