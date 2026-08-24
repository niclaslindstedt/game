// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PICTURE — the climb out of the night sky into space, and the drop onto
// the regolith, painted around the sim every frame.
//
// THE SKY IS THE ALTIMETER. The launch is at night (the cutscene's lawn), so
// the low sky is the garage's own dark blue and the climb is the world going
// BLACK: the stars arrive with altitude, the planet's limb sinks off the
// bottom of the frame, and by the shell's top there is nothing left but space
// and the company's garbage. A player who never reads a dial still knows how
// high they are, which is the whole job of a background.
//
// EVERYTHING HERE READS THE SAME CAMERA (`SkyCamera`) the fx layer draws on,
// shaken as one — the drive's rule, for the drive's reason.

import {
  FLIGHT,
  flightAltFrac,
  flightCoursePx,
  type FlightState,
} from "@game/core";

import { spriteByName, type GameAssets } from "../assets.ts";
import { orbitSprite } from "./orbit-art.ts";
import { toScreen, type SkyCamera } from "./rocket-fx.ts";

/** Where the frame stands over the sim. The ship rides the lower third on the
 * climb (the danger is above) and the upper half on the drop (the danger is
 * below); near the regolith the camera plants itself so the ground arrives
 * instead of the frame chasing it. */
export function flightCamera(
  state: FlightState,
  viewW: number,
  viewH: number,
): SkyCamera {
  const { craft } = state;
  const halfSpan = Math.min(viewW, FLIGHT.fieldW);
  const x = Math.max(
    0,
    Math.min(FLIGHT.fieldW - halfSpan, craft.x - halfSpan / 2),
  );
  if (state.phase === "landing") {
    // The ground settles at 82% of the frame — ABOVE the console, because the
    // regolith and the marked pad are the whole game down here and chrome must
    // not be able to stand in front of the target.
    return { x, topAlt: Math.max(viewH * 0.82, craft.alt + viewH * 0.42) };
  }
  // 0.72, not the middle: at climb speed the sky above the nose is the whole
  // of the player's warning, and every extra row of it is reaction time.
  return { x, topAlt: craft.alt + viewH * 0.72 };
}

/** The night → space ramp, sampled at one altitude fraction. */
function skyColor(frac: number): string {
  // Garage night (#0e1020) down low, void (#070911) up top, via a barely
  // bluer stratosphere band — the whole ramp stays dark on purpose: the
  // launch was at night and the stars have to be able to arrive.
  const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const t = Math.min(1, Math.max(0, frac));
  const r = mix(0x12, 0x07, t);
  const g = mix(0x16, 0x09, t);
  const b = mix(0x2c, 0x11, t);
  return `rgb(${r},${g},${b})`;
}

/** A cheap integer hash for the star scatter — the sky's dressing must not
 * spend anybody's stream. */
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

const STAR_CELL = 48;

/**
 * The starfield — hashed per world cell, drifting with a light parallax, and
 * FADED IN with altitude: the low sky has weather in it, the high sky is
 * nothing else.
 */
function drawStars(
  ctx: CanvasRenderingContext2D,
  cam: SkyCamera,
  viewW: number,
  viewH: number,
  altFrac: number,
): void {
  const alpha = 0.25 + 0.75 * altFrac;
  for (const layer of [0.35, 0.7] as const) {
    const offY = cam.topAlt * layer;
    const x0 = Math.floor(cam.x / STAR_CELL) - 1;
    const y0 = Math.floor((offY - viewH) / STAR_CELL) - 1;
    for (let cy = y0; cy < y0 + viewH / STAR_CELL + 3; cy++) {
      for (let cx = x0; cx < x0 + viewW / STAR_CELL + 3; cx++) {
        const roll = hash2(cx ^ (layer * 1000), cy);
        if (roll > 0.72) continue;
        const sx = cx * STAR_CELL + roll * STAR_CELL - cam.x;
        const sy = offY - (cy * STAR_CELL + hash2(cy, cx) * STAR_CELL);
        if (sx < -2 || sx > viewW + 2 || sy < -2 || sy > viewH + 2) continue;
        const bright = hash2(cx * 7, cy * 3);
        ctx.globalAlpha = alpha * (0.3 + bright * 0.7);
        ctx.fillStyle = bright > 0.8 ? "#f4f4f4" : "#8b93a4";
        ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
      }
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * THE PLANET'S LIMB — the curved blue rim of home, sinking off the bottom of
 * the frame as the climb takes it away. It is the launch feed's one
 * indispensable picture, and it doubles as the ground: at zero altitude the
 * glow fills the lower frame, so the first frame reads as "over the lawn"
 * without a lawn being drawn.
 */
function drawEarthLimb(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  altFrac: number,
): void {
  // The limb's top edge walks down the screen with altitude and keeps going —
  // fully gone a little past the shell's top.
  const sink = altFrac / 0.9;
  const top = viewH * (0.78 + 0.6 * sink);
  if (top > viewH + 80) return;
  const r = viewW * 2.2;
  const cx = viewW / 2;
  const cy = top + r;
  // The atmosphere's haze, then the limb, then the dark ground of home.
  ctx.save();
  const glow = ctx.createRadialGradient(cx, cy, r * 0.985, cx, cy, r * 1.035);
  glow.addColorStop(0, "rgba(64,84,188,0.55)");
  glow.addColorStop(0.55, "rgba(64,84,188,0.18)");
  glow.addColorStop(1, "rgba(64,84,188,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, Math.max(0, top - viewH * 0.25), viewW, viewH);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#101a38";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(140,205,215,0.7)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** The destination, arriving: the moon grows through the top of the climb and
 * hangs over the drop. */
function drawMoonAhead(
  ctx: CanvasRenderingContext2D,
  sprites: GameAssets["sprites"],
  viewW: number,
  altFrac: number,
  landing: boolean,
): void {
  const moon = spriteByName(sprites, "sky_moon");
  if (!moon) return;
  if (landing) {
    // Home, small and high — the thing the module comes back for.
    const earth = spriteByName(sprites, "sky_earth");
    if (earth) ctx.drawImage(earth, viewW - 34, 16);
    return;
  }
  if (altFrac < 0.5) return;
  const t = (altFrac - 0.5) / 0.5;
  const scale = 1 + t * 2.4;
  const w = moon.width * scale;
  ctx.globalAlpha = Math.min(1, t * 2);
  ctx.drawImage(moon, viewW * 0.72 - w / 2, 14, w, moon.height * scale);
  ctx.globalAlpha = 1;
}

/** Everything adrift — each piece its own art, tumbling on its own angle, the
 * satellites blinking their status light because somebody still pays for it. */
function drawField(
  ctx: CanvasRenderingContext2D,
  state: FlightState,
  cam: SkyCamera,
  sprites: GameAssets["sprites"],
  viewW: number,
  viewH: number,
  nowMs: number,
): void {
  for (const o of state.field) {
    const s = toScreen(cam, o.x, o.alt);
    if (s.x < -40 || s.x > viewW + 40 || s.y < -40 || s.y > viewH + 40) {
      continue;
    }
    const sprite = spriteByName(sprites, orbitSprite(o.kind, o.variant));
    if (!sprite) continue;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(o.angle);
    ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
    ctx.restore();
    if (o.kind === "satellite" && Math.floor(nowMs / 500) % 2 === 0) {
      ctx.fillStyle = "#8ccdd7";
      ctx.fillRect(Math.round(s.x), Math.round(s.y) - 1, 1, 1);
    }
  }
}

/** Which frame of the ship this moment wears: the cold hull coasting, the
 * firing frames under boost — the cutscene's own animation cadence. */
function shipFrame(boost: boolean, nowMs: number): string {
  if (boost) return `ship_fire_${Math.floor(nowMs / 120) % 2}`;
  return `ship_${Math.floor(nowMs / 160) % 2}`;
}

/** The ship (or the module), leaned to its real tilt, wearing its trash. */
function drawCraft(
  ctx: CanvasRenderingContext2D,
  state: FlightState,
  cam: SkyCamera,
  sprites: GameAssets["sprites"],
  boost: boolean,
  nowMs: number,
): void {
  // A wrecked craft is not drawn — it is mid-fireball, and a hull visible
  // inside its own explosion un-says the explosion.
  if (state.outcome === "wrecked") return;
  const { craft } = state;
  const s = toScreen(cam, craft.x, craft.alt);
  const name =
    state.phase === "landing"
      ? boost
        ? "orbit_lander_burn"
        : "orbit_lander"
      : shipFrame(boost, nowMs);
  const sprite = spriteByName(sprites, name);
  if (!sprite) return;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(craft.tilt);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
  // THE TRASH RIDES THE HULL — each bag drawn in the ship's own frame, where
  // the sim stuck it, so a filthy ship leans filthy.
  for (const t of state.trash) {
    if (state.trash.indexOf(t) >= FLIGHT.trash.maxWorn) break;
    const junk = spriteByName(sprites, orbitSprite("junk", t.variant));
    if (!junk) continue;
    ctx.save();
    ctx.translate(t.across, -t.along);
    ctx.rotate(t.angle);
    const s2 = 0.8;
    ctx.drawImage(
      junk,
      (-junk.width / 2) * s2,
      (-junk.height / 2) * s2,
      junk.width * s2,
      junk.height * s2,
    );
    ctx.restore();
  }
  ctx.restore();
}

/** The regolith — a tiled strip of the moon's own ground, the marked pad, and
 * a couple of boulders so the plain is a place. */
function drawMoonGround(
  ctx: CanvasRenderingContext2D,
  state: FlightState,
  cam: SkyCamera,
  sprites: GameAssets["sprites"],
  viewW: number,
  viewH: number,
  nowMs: number,
): void {
  const groundY = cam.topAlt; // alt 0
  if (groundY < -8) return;
  ctx.fillStyle = "#3a3d45";
  ctx.fillRect(0, groundY, viewW, Math.max(0, viewH - groundY));
  const tile = spriteByName(sprites, "moon_0");
  if (tile) {
    const w = tile.width;
    for (let x = -((cam.x % w) + w) % w; x < viewW; x += w) {
      ctx.drawImage(tile, x, groundY);
    }
  }
  // The dressing stands where the seed put the pad, so every attempt at the
  // drop is the same place.
  const boulder = spriteByName(sprites, "boulder");
  if (boulder) {
    const bx = ((state.padX * 7919) % FLIGHT.fieldW) - cam.x;
    ctx.drawImage(boulder, bx, groundY - boulder.height + 3);
  }
  const pad = spriteByName(sprites, "orbit_pad");
  if (pad) {
    const s = toScreen(cam, state.padX, 0);
    ctx.drawImage(pad, s.x - pad.width / 2, s.y - pad.height + 2);
    // The pad's beacons breathe — the one light on the plain, so the eye finds
    // it without being told.
    if (Math.floor(nowMs / 400) % 2 === 0) {
      ctx.fillStyle = "#8ccdd7";
      ctx.fillRect(
        Math.round(s.x - pad.width / 2) + 1,
        Math.round(s.y) - 2,
        1,
        1,
      );
      ctx.fillRect(
        Math.round(s.x + pad.width / 2) - 2,
        Math.round(s.y) - 2,
        1,
        1,
      );
    }
  }
}

/** The whole picture, in paint order: sky, stars, home, the moon, the field,
 * the ground, the craft. The fx layer draws over this on the same camera. */
export function drawFlight(
  ctx: CanvasRenderingContext2D,
  state: FlightState,
  cam: SkyCamera,
  assets: GameAssets,
  viewW: number,
  viewH: number,
  nowMs: number,
  boost: boolean,
): void {
  const landing = state.phase === "landing";
  const altFrac = landing ? 1 : flightAltFrac(state);

  // The ramp is painted as two bands lerped by eye — cheaper than a gradient
  // object per frame and indistinguishable at this darkness.
  ctx.fillStyle = skyColor(altFrac);
  ctx.fillRect(0, 0, viewW, viewH);
  const low = skyColor(Math.max(0, altFrac - 0.12));
  ctx.fillStyle = low;
  ctx.fillRect(0, viewH * 0.6, viewW, viewH * 0.4);

  drawStars(ctx, cam, viewW, viewH, altFrac);
  if (!landing) drawEarthLimb(ctx, viewW, viewH, altFrac);
  drawMoonAhead(ctx, assets.sprites, viewW, altFrac, landing);

  // THE SHELL'S TOP, MADE VISIBLE: a faint line of thinning haze at the
  // altitude the garbage stops, so "get above the junk" is a place on the
  // screen before it is a fact on the timeline.
  if (!landing) {
    const shellTop = flightCoursePx(state.params) * FLIGHT.field.shellTopFrac;
    const y = cam.topAlt - shellTop;
    if (y > -4 && y < viewH + 4) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#8ccdd7";
      ctx.fillRect(0, Math.round(y), viewW, 1);
      ctx.globalAlpha = 1;
    }
  }

  drawField(ctx, state, cam, assets.sprites, viewW, viewH, nowMs);
  if (landing) {
    drawMoonGround(ctx, state, cam, assets.sprites, viewW, viewH, nowMs);
  }
  drawCraft(ctx, state, cam, assets.sprites, boost, nowMs);
}
