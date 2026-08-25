// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// INSIDE THE SHIP — the picture behind the flight's two cabin beats
// (`RocketVoyage.tsx`): the first time the game goes inside anything, and the
// one scene drawn with a DEPTH ILLUSION instead of a stage.
//
// THE WINDOW IS THE SCENE. A homemade cockpit is mostly panel, so the frame is
// one big porthole with the trip in it — Earth falling away on the first beat,
// the moon arriving on the second — and depth is faked the only way 2D ever
// fakes it: things that come closer are drawn BIGGER. The planet eases along a
// scale curve, the cabin's loose props breathe near and far on their own slow
// phases, and the hero floats through the middle of it zoomed far past field
// scale, turning over, because nothing in the cabin is holding him down.
//
// EVERYTHING IS T-DRIVEN off the scene's own clock — no per-frame state, so a
// dropped frame never jumps a prop and the whole picture is deterministic.

import { spriteByName, type GameAssets } from "../assets.ts";

/** Which trip the window shows. */
export type VoyageKind = "earthAway" | "moonClose";

/** How long each window's travel takes to play out (ms) — the planet keeps
 * easing this whole stretch; a reader who lingers just watches it drift. */
export const EARTH_SHRINK_MS = 18000;
export const MOON_GROW_MS = 14000;

/** A cheap integer hash → 0..1 — the cabin's dressing must not spend any
 * stream (the sky renderer's own rule). */
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) * (1 - c);
}

/** The porthole's geometry for this frame — one place, so the glass, the ring
 * and the clip always agree. */
function portal(
  viewW: number,
  viewH: number,
): {
  x: number;
  y: number;
  r: number;
} {
  return {
    x: viewW * 0.5,
    y: viewH * 0.42,
    r: Math.min(viewW, viewH) * 0.33,
  };
}

/** THE CABIN — panels, rivets, tape, cables and a console that still blinks:
 * a garage build, seen from inside for the first time. LIT, on purpose — the
 * cabin lights are on, the walls read as bright metal, and the porthole is
 * the one dark thing in the frame, which is what makes space look like
 * space instead of the room looking like a cave. */
function drawCabin(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  tMs: number,
): void {
  ctx.fillStyle = "#4a5263";
  ctx.fillRect(0, 0, viewW, viewH);

  // The panel grid — seams a shade darker, one panel a shade off (he ran out
  // of the first sheet), rivets catching the light on the crossings.
  const P = 46;
  for (let py = 0; py * P < viewH + P; py++) {
    for (let px = 0; px * P < viewW + P; px++) {
      if (hash2(px * 3 + 1, py * 7 + 2) < 0.14) {
        ctx.fillStyle = "#525a6e";
        ctx.fillRect(px * P, py * P, P, P);
      }
    }
  }
  ctx.fillStyle = "#363d4c";
  for (let x = 0; x < viewW; x += P) ctx.fillRect(x, 0, 1, viewH);
  for (let y = 0; y < viewH; y += P) ctx.fillRect(0, y, viewW, 1);
  ctx.fillStyle = "#79839a";
  for (let x = 0; x < viewW; x += P) {
    for (let y = 0; y < viewH; y += P) {
      if (hash2(x, y) < 0.7) ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  // DUCT TAPE — the build material, in honest strips over two of the seams.
  ctx.fillStyle = "#7d7968";
  ctx.fillRect(P * 2 - 4, P - 10, 8, 34);
  ctx.fillRect(viewW - P - 18, P * 3 - 4, 30, 8);
  ctx.fillStyle = "#8f8b7a";
  ctx.fillRect(P * 2 - 4, P - 10, 8, 3);
  ctx.fillRect(viewW - P - 18, P * 3 - 4, 3, 8);

  // THE CONSOLE — a low shelf of switches under the window, a step darker
  // than the walls so the lamps carry, each blinking on its own clock
  // because somebody wired every one by hand.
  const cy = viewH - 34;
  ctx.fillStyle = "#2b3140";
  ctx.fillRect(0, cy, viewW, 34);
  ctx.fillStyle = "#5b6478";
  ctx.fillRect(0, cy, viewW, 3);
  const LAMPS = ["#7ef0c8", "#ffd75e", "#e8635a", "#8ccdd7"] as const;
  for (let i = 0; i < 14; i++) {
    const lx = 16 + i * ((viewW - 32) / 13);
    const beat = 340 + (i % 5) * 190;
    const on = Math.floor((tMs + i * 137) / beat) % 2 === 0;
    ctx.fillStyle = on ? LAMPS[i % LAMPS.length]! : "#3a4150";
    ctx.fillRect(Math.round(lx), cy + 10, 2, 2);
    ctx.fillStyle = "#3a4150";
    ctx.fillRect(Math.round(lx) - 1, cy + 18, 4, 6);
  }
}

/** THE WINDOW — space clipped inside the glass: stars adrift, and the trip's
 * planet easing along its scale curve. `t` is 0..1 of the travel. */
function drawWindow(
  ctx: CanvasRenderingContext2D,
  kind: VoyageKind,
  t: number,
  viewW: number,
  viewH: number,
  sprites: GameAssets["sprites"],
  tMs: number,
): void {
  const p = portal(viewW, viewH);
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#070911";
  ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);

  // Stars, two layers, drifting the way the ship is going — toward the moon,
  // away from home — so even a full window reads as travel.
  for (const layer of [0.5, 1] as const) {
    const drift = tMs * 0.004 * layer * (kind === "earthAway" ? 1 : -1);
    for (let i = 0; i < 40; i++) {
      const span = p.r * 2;
      const wrapped =
        (((hash2(i, layer * 9) * span + drift) % span) + span) % span || 0;
      const sx = p.x - p.r + wrapped;
      const sy = p.y - p.r + hash2(i * 3, layer * 5) * p.r * 2;
      const bright = hash2(i * 7, 3);
      ctx.globalAlpha = 0.3 + bright * 0.6;
      ctx.fillStyle = bright > 0.8 ? "#f4f4f4" : "#8b93a4";
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
  }
  ctx.globalAlpha = 1;

  if (kind === "earthAway") {
    // HOME, GETTING SMALLER — the whole scene in one scale curve: the sprite
    // opens filling the glass and eases down to a marble, drifting off
    // centre as the ship's course diverges from straight back.
    const earth = spriteByName(sprites, "sky_earth");
    if (earth) {
      const big = (p.r * 2.05) / earth.width;
      const small = big * 0.16;
      const scale = big + (small - big) * easeOut(t);
      const w = earth.width * scale;
      const cx = p.x - w / 2 + p.r * 0.22 * easeOut(t);
      const cy = p.y - w / 2 + p.r * 0.3 * easeOut(t);
      // NO ATMOSPHERE DISC BEHIND IT. The globe does not sit in the middle of
      // its own 16×16 cell (`sky_earth` — it is drawn up and to the left), so a
      // circle centred on the CELL hangs out past the planet on the low side
      // and nowhere on the high one; and a flat-alpha arc has a hard antialiased
      // edge, which beside a pixel globe reads as a second object rather than as
      // air. The sprite carries its own shaded rim.
      ctx.drawImage(earth, cx, cy, w, w);
    }
  } else {
    // THE MOON, ARRIVING — the same curve run the other way. The moon alone:
    // this window faces the way the ship is going, and home is behind us.
    const moon = spriteByName(sprites, "sky_moon");
    if (moon) {
      const small = 1.6;
      const big = (p.r * 2.3) / moon.width;
      const scale = small + (big - small) * easeOut(t) * easeOut(t);
      const w = moon.width * scale;
      ctx.drawImage(
        moon,
        p.x - w / 2 + p.r * 0.1 * (1 - t),
        p.y - w / 2 + p.r * 0.08 * (1 - t),
        w,
        w,
      );
    }
  }
  ctx.restore();

  // THE RING — two tones of frame and six honest bolts, over the glass edge.
  ctx.strokeStyle = "#2e3442";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#68718a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#8a92a4";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    ctx.fillRect(
      Math.round(p.x + Math.cos(a) * (p.r + 3)) - 1,
      Math.round(p.y + Math.sin(a) * (p.r + 3)) - 1,
      3,
      3,
    );
  }
  // A curved glint on the glass.
  ctx.strokeStyle = "rgba(214,220,228,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * 0.82, -2.1, -1.3);
  ctx.stroke();
}

/** One loose thing adrift in the cabin — position, turn and NEARNESS all on
 * slow phases of the clock, so it breathes toward and away from the glass. */
type Drifter = {
  /** Sprite name, or null for the drawn props below. */
  sprite: string | null;
  drawn?: "tape" | "bolt";
  cx: number;
  cy: number;
  /** The drift ellipse (fractions of the view). */
  rx: number;
  ry: number;
  /** Base scale, and how much of it the depth breath adds and takes. */
  scale: number;
  breathe: number;
  /** Radians per second of lazy tumble. */
  spin: number;
  phase: number;
};

const DRIFTERS: readonly Drifter[] = [
  {
    sprite: "drink",
    cx: 0.2,
    cy: 0.3,
    rx: 0.08,
    ry: 0.1,
    scale: 1.6,
    breathe: 0.55,
    spin: 0.35,
    phase: 0.9,
  },
  {
    sprite: "orbit_junk_10",
    cx: 0.82,
    cy: 0.62,
    rx: 0.07,
    ry: 0.09,
    scale: 1.9,
    breathe: 0.45,
    spin: -0.22,
    phase: 2.6,
  },
  {
    sprite: null,
    drawn: "tape",
    cx: 0.78,
    cy: 0.2,
    rx: 0.06,
    ry: 0.08,
    scale: 1,
    breathe: 0.5,
    spin: 0.5,
    phase: 4.4,
  },
  {
    sprite: null,
    drawn: "bolt",
    cx: 0.14,
    cy: 0.72,
    rx: 0.05,
    ry: 0.06,
    scale: 1,
    breathe: 0.6,
    spin: -0.8,
    phase: 1.7,
  },
];

function drawDrifters(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  sprites: GameAssets["sprites"],
  tMs: number,
): void {
  const t = tMs / 1000;
  for (const d of DRIFTERS) {
    const x = (d.cx + Math.sin(t * 0.31 + d.phase) * d.rx) * viewW;
    const y = (d.cy + Math.cos(t * 0.23 + d.phase * 1.7) * d.ry) * viewH;
    // The depth breath: nearer is bigger, and nothing else has to be said.
    const near = 1 + d.breathe * Math.sin(t * 0.4 + d.phase * 2.1);
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(d.spin * t + d.phase);
    if (d.sprite) {
      const sprite = spriteByName(sprites, d.sprite);
      if (sprite) {
        const s = d.scale * near;
        ctx.drawImage(
          sprite,
          (-sprite.width / 2) * s,
          (-sprite.height / 2) * s,
          sprite.width * s,
          sprite.height * s,
        );
      }
    } else if (d.drawn === "tape") {
      const r = 7 * near;
      ctx.fillStyle = "#7d7968";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4a5263";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const s = Math.max(2, 3 * near);
      ctx.fillStyle = "#8a92a4";
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.fillStyle = "#363d4c";
      ctx.fillRect(-s / 6, -s / 6, s / 3, s / 3);
    }
    ctx.restore();
  }
}

/** THE MAN HIMSELF — zoomed far past field scale, adrift through the middle
 * of his own cockpit, turning over slowly, swimming a little (the walk frames
 * alternated at a lazy beat read as exactly that). */
function drawFloatingHero(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  sprites: GameAssets["sprites"],
  tMs: number,
): void {
  const t = tMs / 1000;
  const frame = Math.floor(tMs / 700) % 2;
  const hero = spriteByName(sprites, `hero_${frame}`);
  if (!hero) return;
  const x = viewW * (0.5 + 0.3 * Math.sin(t * 0.16 + 1.1));
  const y = viewH * (0.55 + 0.2 * Math.sin(t * 0.11 + 3.9));
  // Near and far on the slowest breath in the scene, spinning slower still.
  const scale = 4.6 * (1 + 0.3 * Math.sin(t * 0.21 + 0.6));
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(t * 0.42);
  ctx.drawImage(
    hero,
    (-hero.width / 2) * scale,
    (-hero.height / 2) * scale,
    hero.width * scale,
    hero.height * scale,
  );
  ctx.restore();
}

/** The whole cabin beat, in paint order: panels, the window and its trip,
 * the loose props, the man. `travelMs` is the scene's own clock. */
export function drawVoyage(
  ctx: CanvasRenderingContext2D,
  kind: VoyageKind,
  travelMs: number,
  viewW: number,
  viewH: number,
  assets: GameAssets,
): void {
  const total = kind === "earthAway" ? EARTH_SHRINK_MS : MOON_GROW_MS;
  const t = Math.min(1, travelMs / total);
  drawCabin(ctx, viewW, viewH, travelMs);
  drawWindow(ctx, kind, t, viewW, viewH, assets.sprites, travelMs);
  drawDrifters(ctx, viewW, viewH, assets.sprites, travelMs);
  drawFloatingHero(ctx, viewW, viewH, assets.sprites, travelMs);

  // A whisper of shade at the frame's edges — enough to round the room off,
  // never enough to un-light it — and a slightly firmer band low down, where
  // the thought text sits, so the words keep their contrast on lit metal.
  const p = portal(viewW, viewH);
  ctx.fillStyle = "rgba(14,17,26,0.1)";
  ctx.fillRect(0, 0, viewW, Math.max(0, p.y - p.r - 12));
  ctx.fillStyle = "rgba(14,17,26,0.28)";
  ctx.fillRect(0, p.y + p.r + 12, viewW, viewH);
}
