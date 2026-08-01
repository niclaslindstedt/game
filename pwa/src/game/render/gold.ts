// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GLITTER on a pile of gold — the thing that makes money on the floor read
// as money rather than as a yellow rock.
//
// The pile's SPRITE already says how much is in it (the `GOLD.pileTiers`
// ladder), but a static sprite says it once and then sits there. What a player
// actually notices across a dark room is MOVEMENT, so the pile twinkles: bright
// specks winking on and off over its top faces, and — this is the whole point —
// THE MORE COINS, THE MORE SPARKS. A boss's hoard is visibly alive at the far
// edge of the viewport while two coins off a guard glint once and wait.
//
// Everything here is derived from the item's own id and the clock, exactly as
// the loot aura's motes and the toss's scatter are. No draw is spent, no state
// is kept, and two clients watching the same pile see the same twinkle.

import { glowSprite } from "./caches.ts";

/** The twinkle's period, ms — one speck's full off → on → off cycle. */
const TWINKLE_MS = 1100;
/** How much of that cycle a speck is actually visible. The rest is dark, which
 * is what makes it a twinkle rather than a row of fairy lights — but not so
 * dark that a small pile is only ever caught winking by somebody watching it:
 * at half, two specks out of phase keep a couple of coins visibly alive. */
const LIT_SHARE = 0.5;

/** A stable 0..1 fraction off two integers — the id-hash idiom the toss scatter
 * and the loot aura both derive from, so the glitter costs no rng draw. */
function hash01(a: number, b: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * HOW MANY SPARKS A PILE THROWS, from what is in it.
 *
 * Logarithmic rather than linear, for the reason every wealth read in this game
 * is: the ladder spans two coins off an intern to a nine-figure hoard off THE
 * FOUNDER, and a linear count would be one speck for the whole early campaign
 * and a solid white square at the end of it. On a log scale each ×10 buys about
 * two more, and the ends of the range are three specks apart instead of a
 * million.
 */
export function goldSparkCount(amount: number): number {
  const n = Math.round(2 + 2.4 * Math.log10(1 + Math.max(0, amount) / 20));
  return Math.max(2, Math.min(14, n));
}

/**
 * Draw one pile's glitter, centred on `(cx, cy)` — its sprite's centre in
 * screen space — over a sprite `width × height` px.
 *
 * Each speck keeps a FIXED spot on the pile (hashed off the item id and the
 * speck's index) and only its brightness moves, because a speck that wandered
 * would read as an insect rather than as light catching an edge. The spots are
 * biased toward the pile's upper half: light catches the faces that are turned
 * up, and a speck under the mound's shadow line is a speck nobody believes.
 *
 * The brightest beat of a big pile's speck also blooms — a couple of px of warm
 * light — so a hoard reads as GLOWING while a couple of coins merely wink.
 */
export function drawGoldGlitter(
  ctx: CanvasRenderingContext2D,
  id: number,
  amount: number,
  cx: number,
  cy: number,
  width: number,
  height: number,
  timeMs: number,
): void {
  const sparks = goldSparkCount(amount);
  // A real pile's specks BLOOM — a couple of px of warm light behind the
  // white — while two loose coins just wink. Same escalation ladder the pile
  // sprite and the pickup float ride, so all three say one number three ways.
  const blooms = sparks >= 5;
  for (let i = 0; i < sparks; i++) {
    const phase = hash01(id, i);
    const t = (timeMs / TWINKLE_MS + phase) % 1;
    if (t > LIT_SHARE) continue;
    // Triangle in, triangle out — a speck that faded linearly reads as a lamp
    // on a dimmer rather than as light glancing off a moving edge.
    const q = t / LIT_SHARE;
    const alpha = q < 0.5 ? q * 2 : (1 - q) * 2;
    if (alpha < 0.06) continue;

    const x = Math.round(cx + (hash01(id, i + 32) - 0.5) * width * 0.78);
    // Biased up: `sqrt` pushes the spread toward the top of the sprite, where
    // the coin faces that catch the light actually are.
    const up = Math.sqrt(hash01(id, i + 64));
    const y = Math.round(cy + height * (0.34 - up * 0.72));

    if (blooms && alpha > 0.45) {
      const halo = glowSprite("255, 236, 170", 11);
      if (halo) {
        ctx.globalAlpha = (alpha - 0.45) * 1.3;
        ctx.drawImage(
          halo,
          x - Math.round(halo.width / 2),
          y - Math.round(halo.height / 2),
        );
      }
    }
    // THE STAR GROWS AND SHRINKS RATHER THAN FADING. A speck that only changed
    // opacity reads as a stuck pixel dimming; one that opens from a dot into a
    // four-point star and then an eight-point one reads as light swinging past
    // a milled edge — which is the thing being drawn.
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fffbe8";
    ctx.fillRect(x, y, 1, 1);
    if (alpha > 0.4) {
      ctx.globalAlpha = (alpha - 0.4) * 1.6;
      ctx.fillStyle = "#fff3c4";
      ctx.fillRect(x - 1, y, 1, 1);
      ctx.fillRect(x + 1, y, 1, 1);
      ctx.fillRect(x, y - 1, 1, 1);
      ctx.fillRect(x, y + 1, 1, 1);
    }
    if (alpha > 0.78) {
      ctx.globalAlpha = (alpha - 0.78) * 3;
      ctx.fillStyle = "#ffe9a8";
      ctx.fillRect(x - 2, y, 1, 1);
      ctx.fillRect(x + 2, y, 1, 1);
      ctx.fillRect(x, y - 2, 1, 1);
      ctx.fillRect(x, y + 2, 1, 1);
      ctx.fillRect(x - 1, y - 1, 1, 1);
      ctx.fillRect(x + 1, y + 1, 1, 1);
      ctx.fillRect(x - 1, y + 1, 1, 1);
      ctx.fillRect(x + 1, y - 1, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}
