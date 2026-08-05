// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE XP SCROLL'S VEIL — the blue the hero wears while his double-XP window
// burns (`Player.xpBoostMs`, lit by walking over an XP scroll).
//
// It is deliberately the QUIETEST always-on effect in the game. The level-up
// burn beside it (render/player.ts `drawLevelUpBurn`) is a one-second event and
// is allowed to blind you; this one is up for thirty seconds at a stretch, over
// a fight, on a phone — so anything with real contrast would sit between the
// player and the horde for the whole window. What it has to say is one thing
// ("the double is running"), and it says it with a cool blue cast the eye reads
// at the edge of attention rather than a light show it has to look past.
//
// Three layers, all of them faint:
//
//   under — a soft blue halo behind the hero, breathing slowly. This is the
//           bulk of the read: a body standing in its own cold light.
//   over  — an additive wash across the sprite, a third the halo's strength, so
//           the hero himself is tinted rather than merely back-lit. This is the
//           "ghost" half; without it the halo reads as something on the ground.
//   over  — a handful of motes drifting up off him, the only MOVING part.
//
// It obeys the same three rules the loot aura's header sets out, for the same
// reasons: CLOSED-FORM off the render clock (no state, no allocation, nothing
// to desync), BAKED light (one cached `glowSprite`, scaled and alpha'd at draw
// time — never a gradient per frame), and it NEVER HIDES THE FIGHT.

import { XP_TUNING, type GameState } from "@game/core";

import { localHero } from "../local-seat.ts";
import { glowSprite } from "./caches.ts";
import { fract, seatX, seatY } from "./shared.ts";
import { beginBillboard, endBillboard } from "./tilt.ts";
import { type Camera } from "./view.ts";

/** The veil's blue, as an `r, g, b` triplet for `rgba()`. The same hue as the
 * scroll sprite's script (`content/sprites/effects/xp_scroll.yaml`) and as the
 * "+N XP" combat text, so the pickup, the number and the glow are visibly one
 * system rather than three blues. */
const VEIL_RGB = "90, 180, 255";

/** How far the halo reaches off the hero (world px). About a body and a half —
 * enough to read as a shroud around him, short of a puddle he stands in. */
const HALO_RADIUS = 26;

/** Peak alpha of the halo behind the hero. Tuned on goodco_hq, which is the
 * WORST CASE and the reason it isn't lower: that level's floor is already a
 * cool blue-grey, so a blue glow over it has almost no hue to separate on and
 * lives or dies on the luminance it adds. It still reads as a soft shroud
 * rather than a lamp — present at a glance, forgotten the moment you look at
 * what you are fighting. */
const HALO_ALPHA = 0.3;

/** Peak alpha of the additive wash ACROSS the hero — a third of the halo's, so
 * he is tinted rather than washed out. Any higher and the paper-doll's own
 * colours (a bloodied coat, a tier-coloured weapon) start to go. */
const WASH_ALPHA = 0.11;

/** The breath: the halo swells and settles over this period (ms), between
 * `1 − BREATH_DEPTH` and 1 of its peak. Slow — a veil, not a strobe. */
const BREATH_MS = 2200;
const BREATH_DEPTH = 0.25;

/** How long the veil takes to swell in when a scroll is read (ms). Short, so
 * the pickup is felt; a REFRESH mid-window re-runs it, which is the only cue
 * that a second scroll did anything at all. */
const FADE_IN_MS = 260;

/** How long before the window lapses the veil starts thinning (ms). Long
 * enough to be a WARNING — "spend the last of it" — rather than a light
 * switching off. */
const FADE_OUT_MS = 1400;

/** Motes drifting up through the veil — the only moving part, and the reason
 * the effect reads as alive rather than as a decal. */
const MOTES = 7;
/** How high a mote climbs before it fades out (world px). */
const MOTE_RISE = 34;
/** One mote's climb, in ms. */
const MOTE_MS = 1900;

/**
 * The veil's overall strength this frame, 0 (dark) to 1 (full), folding the
 * swell-in, the lapse-out and the breath together. Returns 0 when no window is
 * lit, which is the caller's early-out.
 */
function veilStrength(remainingMs: number, timeMs: number): number {
  if (remainingMs <= 0) return 0;
  const duration = Math.max(1, XP_TUNING.scrollDurationMs);
  // Elapsed is derived rather than stored, which is exactly what makes a
  // REFRESH re-run the swell: a scroll read mid-window puts `remainingMs` back
  // to the full duration, so `elapsed` returns to 0 with it.
  const elapsed = Math.max(0, duration - remainingMs);
  const swell = Math.min(1, elapsed / FADE_IN_MS);
  const lapse = Math.min(1, remainingMs / FADE_OUT_MS);
  const breath =
    1 -
    BREATH_DEPTH * (0.5 - 0.5 * Math.cos((timeMs / BREATH_MS) * Math.PI * 2));
  return swell * lapse * breath;
}

/**
 * Draw the XP-scroll veil around the local hero. Called twice a frame from
 * `render.ts`, straddling `drawPlayer` exactly as the level-up burn is: the
 * `under` halo behind the sprite, the `over` wash and motes in front of it, so
 * the light wraps the character instead of sitting behind or on top of him.
 */
export function drawXpBoostVeil(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  timeMs: number,
  layer: "under" | "over",
): void {
  const hero = localHero(state);
  const strength = veilStrength(hero.xpBoostMs ?? 0, timeMs);
  if (strength <= 0) return;
  const halo = glowSprite(VEIL_RGB, HALO_RADIUS);
  if (!halo) return;

  const x = seatX(hero.pos.x, camera.x);
  const y = seatY(hero.pos.y, camera.y) - Math.round(hero.z);

  // Billboarded as one piece, like the ding's burn: the halo is a shroud
  // AROUND a standing body and the motes climb, and foreshortening either with
  // the ground would flatten the veil into a puddle at his feet.
  beginBillboard(ctx, hero.pos.x, hero.pos.y, camera.x, camera.y);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  if (layer === "under") {
    // The halo, drawn a touch taller than wide and lifted to the chest: a body
    // is upright, and a circular glow centred on the feet reads as a puddle.
    const w = HALO_RADIUS * 2;
    const h = HALO_RADIUS * 2.4;
    ctx.globalAlpha = HALO_ALPHA * strength;
    ctx.drawImage(halo, x - w / 2, y - h / 2 + 8, w, h);
  } else {
    // The wash: the same baked light, small and tight over the sprite itself,
    // so the hero is lit blue rather than merely standing in blue.
    const w = HALO_RADIUS * 1.1;
    ctx.globalAlpha = WASH_ALPHA * strength;
    ctx.drawImage(halo, x - w / 2, y - w / 2 + 2, w, w);

    // The motes: each on its own deterministic lane and phase off its index, so
    // the column shimmers without two ever climbing in step. Pure function of
    // the render clock — no state, no allocation, nothing to desync.
    ctx.fillStyle = `rgba(${VEIL_RGB}, 1)`;
    for (let i = 0; i < MOTES; i++) {
      const lane = (fract(i * 17.31) - 0.5) * 22;
      const climb = fract(timeMs / MOTE_MS + fract(i * 7.77));
      const mx = x + Math.round(lane + Math.sin(timeMs / 420 + i) * 2);
      const my = Math.round(y + 4 - climb * MOTE_RISE);
      // Brightest mid-climb and gone at both ends, so a mote appears out of the
      // veil and dissolves back into it rather than popping in at his boots.
      ctx.globalAlpha = 0.75 * strength * Math.sin(climb * Math.PI);
      ctx.fillRect(mx, my, 1, 1);
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
  endBillboard(ctx);
}
