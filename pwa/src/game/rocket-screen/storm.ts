// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STORM THE SHIP CLIMBS OUT OF — the launch is not a happy occasion: the
// house is burning, the rain is coming down hard, and the low sky is a storm
// deck with lightning in it. This module is that weather, in three parts the
// screen calls separately: how thick it is at an altitude (`stormIntensity`),
// whether a strike is lighting the sky right now (`strikeAt`), and the paint
// (`drawStorm` — the rain sheet, the bolt, the flash).
//
// EVERYTHING IS DERIVED, NOTHING IS ROLLED. Strikes are a hash of the flight's
// own seed per fixed time window, the rain is the shared sheet
// (`@ui/lib/rain.ts`), and no draw is ever spent from the sky's stream — the
// weather is presentation, and a restart replays the same storm over the same
// climb. The THUNDER each strike owes is voiced by the drain (`loop.ts`,
// `thunderDue`), because sound is the drain's job everywhere else too.

import type { FlightState } from "@game/core";

import { drawRain } from "@ui/lib/rain.ts";

import { glowSprite } from "../render/caches.ts";

import type { SkyCamera } from "./rocket-fx.ts";

/** Where the weather stops (world px of altitude): full storm through the low
 * sky, gone before the junk shell's business begins — punching out of the
 * cloud deck into clean starlight is the climb's first act break. */
const STORM_FULL_ALT = 1700;
const STORM_TOP_ALT = 2600;

/** How thick the storm is at this altitude, 0–1. */
export function stormIntensity(alt: number): number {
  if (alt >= STORM_TOP_ALT) return 0;
  if (alt <= STORM_FULL_ALT) return 1;
  return 1 - (alt - STORM_FULL_ALT) / (STORM_TOP_ALT - STORM_FULL_ALT);
}

/** The strike calendar: one window may hold one strike, hashed off the seed —
 * most windows do, because this storm is INTENSE. Exported for the thunder
 * latch (`loop.ts`), which walks the same windows. */
export const STRIKE_WINDOW_MS = 2400;
/** How long a strike lights the sky (flicker included). */
const FLASH_MS = 460;
// THIS STORM'S LIGHTNING IS SHEET LIGHTNING: light going off INSIDE the
// clouds, never a bolt reaching the ground — the ground's one fire is the
// rocket's own, and a drawn bolt over the lot read as the house being
// struck. A distant flash has no parallax worth speaking of, so the glow is
// SKY-PINNED (fractions of the frame, `sx`/`sy`), like the backdrop it
// lights, and always somewhere the player can see it.

function hash01(seed: number, n: number): number {
  let h = (seed ^ Math.imul(n, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

export type StormStrike = {
  /** Ms since this strike began, 0..FLASH_MS. */
  t: number;
  /** The window that owns it — the thunder latch's key. */
  window: number;
  /** Where the glow sits, as fractions of the frame (sky-pinned). */
  sx: number;
  sy: number;
  /** The strike's own seed — the flicker's phase. */
  seed: number;
};

function strikeStart(seed: number, window: number): number | null {
  const roll = hash01(seed, window);
  if (roll > 0.72) return null;
  return window * STRIKE_WINDOW_MS + roll * (STRIKE_WINDOW_MS - FLASH_MS - 200);
}

/** The strike lighting the sky at `nowMs`, if any — checked against the
 * current window and the one before it, since a strike can straddle. */
export function strikeAt(seed: number, nowMs: number): StormStrike | null {
  const w = Math.floor(nowMs / STRIKE_WINDOW_MS);
  for (const window of [w, w - 1]) {
    const start = strikeStart(seed, window);
    if (start === null) continue;
    const t = nowMs - start;
    if (t < 0 || t >= FLASH_MS) continue;
    return {
      t,
      window,
      sx: 0.1 + hash01(seed, window ^ 0x2c1b3c6d) * 0.8,
      sy: 0.06 + hash01(seed, window ^ 0x51ed270b) * 0.48,
      seed: (seed ^ Math.imul(window, 2654435761)) >>> 0,
    };
  }
  return null;
}

/** When `window`'s strike owes its thunder (ms on the flight clock), or null
 * for a quiet window. The gap after the flash is what says the storm is BIG. */
export function thunderDue(seed: number, window: number): number | null {
  const start = strikeStart(seed, window);
  if (start === null) return null;
  return start + 350 + hash01(seed, window ^ 0x7f4a7c15) * 800;
}

/** The glow a strike puts INSIDE the deck — a wide soft ellipse of light at
 * the strike's spot, the clouds lit from within. No bolt: sheet lightning is
 * the whole vocabulary up here. The light is a baked sprite (`glowSprite`)
 * stretched wider than tall — diffusing ALONG the deck, the way a cloud
 * lights — under an alpha, never a per-frame CanvasGradient. */
function drawStrikeGlow(
  ctx: CanvasRenderingContext2D,
  strike: StormStrike,
  viewW: number,
  viewH: number,
  flicker: number,
): void {
  const glow = glowSprite("212, 224, 255", 150);
  if (!glow) return;
  const gx = strike.sx * viewW;
  const gy = strike.sy * viewH;
  ctx.globalAlpha = 0.55 * flicker;
  ctx.drawImage(glow, gx - 150 * 1.7, gy - 150, 300 * 1.7, 300);
  ctx.globalAlpha = 1;
}

/**
 * The weather, painted OVER the picture and the fx — rain is between the
 * camera and everything else. A strike lights the deck from within and lifts
 * the whole frame with a flicker; there is never a bolt.
 */
export function drawStorm(
  ctx: CanvasRenderingContext2D,
  flight: FlightState,
  cam: SkyCamera,
  viewW: number,
  viewH: number,
  nowMs: number,
): void {
  if (flight.phase !== "ascent") return;
  const intensity = stormIntensity(flight.craft.alt);
  if (intensity <= 0) return;
  const strike = strikeAt(flight.params.seed, nowMs);
  if (strike) {
    const t = strike.t / FLASH_MS;
    // Two-pulse flicker — a strike never lights the sky evenly.
    const flicker =
      Math.max(0, Math.sin(t * Math.PI)) *
      (0.6 + 0.4 * Math.sin(t * 26 + (strike.seed % 7)));
    drawStrikeGlow(ctx, strike, viewW, viewH, intensity * flicker);
    ctx.fillStyle = `rgba(208,222,255,${(0.14 * intensity * flicker).toFixed(3)})`;
    ctx.fillRect(0, 0, viewW, viewH);
  }
  drawRain(ctx, 0, 0, viewW, viewH, nowMs, {
    intensity,
    slantPx: 3,
    scrollX: -cam.x,
    scrollY: cam.topAlt,
  });
}
