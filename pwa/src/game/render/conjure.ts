// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CONJURED ARRIVAL — THE CACHE coming into being against the garage's
// north wall, the moment Ruth hands it over.
//
// TWO HALVES, ONE CLOCK, AND THE SPLIT IS THE SAME ONE THE MERCY ANGEL MAKES.
// The engine sets a timer on the run (`GameState.cacheArriveMs`) and emits one
// cue (`cacheGiven`); everything below is presentation and the engine knows
// none of it. The BURST — the ground light, the motes rushing in, the shock
// ring — is a transient `Effect`, so the effects gallery can stage it with no
// chest at all; the KNIT — the thing assembling itself out of that light —
// rides the run's own countdown, because it belongs to the fixture and has to
// survive the effect list being culled off screen.
//
// Both are driven by `t` (0 → 1 over `CACHE.arriveMs`) and by an integer seed,
// never `Math.random`: a draw runs every frame for the same `t` and must come
// out identical, or pausing mid-arrival reshuffles the motes.
//
// NOTHING HERE NAMES A CHEST. It is a general "this is becoming real" look, so
// the next thing the game conjures reuses it by passing its own sprite.

import { glowSprite } from "./caches.ts";
import { clamp01, fract } from "./shared.ts";

/** Motes that rush in and knit the thing together. Enough to read as a swarm
 * on a phone, few enough that the icon is never buried under them. */
const MOTES = 14;

/** How far out the motes start, in world px. About a body's width past the
 * drop, so they enter from OFF the piece rather than growing out of it. */
const GATHER_REACH = 34;

/** The sub-windows of the arrival, as fractions of its life. They deliberately
 * OVERLAP: the gather is still finishing while the icon starts knitting, which
 * is what makes the light look like it is being spent on building the thing
 * rather than played beside it. */
const SEED_END = 0.2;
const GATHER_START = 0.08;
const GATHER_END = 0.68;
const KNIT_START = 0.5;
const KNIT_END = 0.88;
const SNAP_START = 0.86;

/** Ease-out — quick away, settling as it arrives. */
function easeOut(q: number): number {
  return q * (2 - q);
}

/** A sub-window's own 0→1 progress, or 0/1 outside it. */
function stage(t: number, from: number, to: number): number {
  return clamp01((t - from) / (to - from));
}

/**
 * THE BURST: the light the arrival is made of, drawn on the GROUND and in the
 * air around the spot — everything except the piece itself.
 *
 * `rgb` is the relic's own rarity colour (`lootAuraFor`), so a conjuration
 * wears the grade the player already reads every other find by rather than
 * inventing a second vocabulary for "something good".
 */
export function drawConjureBurst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  rgb: string,
  seed: number,
): void {
  const p = clamp01(t);
  ctx.save();
  // Every layer here is LIGHT, so it adds over the field instead of punching a
  // hole in it.
  ctx.globalCompositeOperation = "lighter";

  // 1. THE SEED — a point of light on the floor, opening into a pool. It stays
  //    lit under everything else, dimming as the piece takes the light over.
  const seedIn = easeOut(stage(p, 0, SEED_END));
  // SMALL. A radial glow this size reads as a POOL somebody is standing in; the
  // first pass sized it off the gather's reach and got a room light instead,
  // which washed the floor flat and buried the motes doing the actual work.
  const pool = glowSprite(rgb, Math.round(5 + 9 * seedIn));
  if (pool) {
    ctx.globalAlpha = 0.34 * seedIn * (1 - 0.5 * stage(p, SEED_END, 1));
    ctx.drawImage(
      pool,
      Math.round(cx - pool.width / 2),
      Math.round(cy - pool.height / 2),
    );
  }

  // 2. THE RING on the floor: one circle of light opening outward and fading,
  //    then a second, tighter one drawn INWARD as the gather closes. Two rings
  //    rather than one because a single expanding circle reads as an explosion,
  //    and this is the opposite gesture — something being collected.
  const out = stage(p, 0, SEED_END + 0.15);
  if (out > 0 && out < 1) {
    ctx.globalAlpha = 0.5 * (1 - out);
    ctx.strokeStyle = `rgba(${rgb}, 1)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      4 + easeOut(out) * 26,
      (4 + easeOut(out) * 26) * 0.42,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  const inward = stage(p, GATHER_START, GATHER_END);
  if (inward > 0 && inward < 1) {
    const r = 30 * (1 - easeOut(inward)) + 3;
    ctx.globalAlpha = 0.42 * Math.sin(inward * Math.PI);
    ctx.strokeStyle = `rgba(${rgb}, 1)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 3. THE GATHER — motes falling in from every side, each on its own clock so
  //    the swarm arrives raggedly rather than as one closing iris. They come in
  //    high and land level with the piece, which is what sells the light as
  //    being pulled out of the air rather than swept along the floor.
  for (let i = 0; i < MOTES; i++) {
    const lead = fract(seed * 0.317 + i * 0.211) * 0.34;
    const q = stage(p, GATHER_START + lead, GATHER_END);
    if (q <= 0 || q >= 1) continue;
    const angle = fract(seed * 0.713 + i * 0.137) * Math.PI * 2;
    const reach =
      GATHER_REACH * (0.55 + fract(seed * 0.911 + i * 0.379) * 0.75);
    const pull = 1 - easeOut(q); // 1 out at the rim, 0 arrived
    const lift = 16 * pull * pull;
    const mx = cx + Math.cos(angle) * reach * pull;
    const my = cy + Math.sin(angle) * reach * 0.5 * pull - lift;
    // Brightest just before it lands, so the swarm visibly feeds the middle.
    // They are the whole read of the effect — a spark has to be legible against
    // a lit garage floor at a phone's size, so it is 2 px for most of its
    // flight and 3 as it arrives, at close to full alpha.
    ctx.globalAlpha = Math.min(1, q * 4) * (0.5 + 0.5 * easeOut(q));
    ctx.fillStyle = `rgba(${rgb}, 1)`;
    const size = q > 0.75 ? 3 : 2;
    ctx.fillRect(
      Math.round(mx - size / 2),
      Math.round(my - size / 2),
      size,
      size,
    );
  }

  // 4. THE SNAP — the moment it becomes real: one hard bloom of light out of
  //    the middle and a thin shock ring leaving it. Held to the last beat, so
  //    the arrival ENDS on the brightest frame instead of trailing off.
  const snap = stage(p, SNAP_START, 1);
  if (snap > 0) {
    // Hard and SMALL, peaking on the first frame of the window and gone by the
    // last: the arrival should END on a bright beat, not fade out under a wide
    // halo that leaves the floor looking overexposed for half a second.
    const flash = glowSprite(rgb, Math.round(12 + 14 * easeOut(snap)));
    if (flash) {
      ctx.globalAlpha = 0.9 * (1 - snap) * (1 - snap);
      ctx.drawImage(
        flash,
        Math.round(cx - flash.width / 2),
        Math.round(cy - flash.height / 2),
      );
    }
    ctx.globalAlpha = 0.55 * (1 - snap);
    ctx.strokeStyle = `rgba(${rgb}, 1)`;
    ctx.lineWidth = 1;
    const r = 3 + easeOut(snap) * 30;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * THE KNIT: the thing itself assembling, drawn in place of the ordinary sprite
 * while the arrival runs.
 *
 * It comes in as a WIPE up the sprite, one row of art pixels at a time, with a
 * bright bar riding the leading edge — the pixel-art reading of "it is being
 * built", and the one that survives a sprite this small (a fade at 14 px is
 * just a dim sprite, and a scale-up is a dim sprite that also wobbles). Under
 * it the thing settles the last few pixels down onto the spot it will stand on,
 * so the arrival ends exactly where the ordinary draw picks it up.
 *
 * `cx`/`cy` is the sprite's CENTRE on screen, which is what the caller has
 * already worked out from the landmark's own anchor.
 */
export function drawConjuringSprite(
  ctx: CanvasRenderingContext2D,
  sprite: ImageBitmap,
  cx: number,
  cy: number,
  t: number,
  rgb: string,
): void {
  const knit = stage(clamp01(t), KNIT_START, KNIT_END);
  if (knit <= 0) return;
  const h = sprite.height;
  // Whole art pixels only — a fractional row leaves a half-lit line that reads
  // as a rendering seam rather than as an edge of light.
  const rows = Math.max(1, Math.round(h * easeOut(knit)));
  const drop = Math.round(6 * (1 - easeOut(clamp01(t / KNIT_END))));
  const left = Math.round(cx - sprite.width / 2);
  const top = Math.round(cy - h / 2) + drop;

  ctx.save();
  // The built part, from the BOTTOM up: the piece stands out of the light.
  ctx.globalAlpha = 0.55 + 0.45 * knit;
  ctx.drawImage(
    sprite,
    0,
    h - rows,
    sprite.width,
    rows,
    left,
    top + (h - rows),
    sprite.width,
    rows,
  );
  ctx.globalAlpha = 1;

  // The leading edge, while there is still something left to build.
  if (rows < h) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = `rgba(${rgb}, 1)`;
    ctx.fillRect(left, top + (h - rows) - 1, sprite.width, 1);
  }
  ctx.restore();
}
