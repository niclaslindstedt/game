// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FIREWORKS — every transient the flight throws: the explosions, their
// sparks and debris, the shockwave rings, the screen flash and shake, the RCS
// poofs, and the burst a piece of garbage comes apart in.
//
// EVERY EXPLOSION IS ITS OWN EXPLOSION. The engine hands each blast a SEED
// (`FlightEvent.explosion.seed`, minted off ids, never off the sky's stream)
// and the whole look is rolled from it — how many fireballs, where they sit,
// how staggered their births are, how hot the palette runs, how much iron
// leaves the scene burning. Two blasts never look alike and a replayed seed
// always looks like itself, which is the drive's determinism rule wearing
// party clothes.
//
// T-DRIVEN, NOT STEPPED: every particle stores its birth and its constants and
// is evaluated analytically at draw time (pos = p0 + v·t + ½g·t²), so a slow
// frame never fast-forwards a spark and the pause card freezes the whole show
// mid-bloom for free.

import { blastRoll, type OrbitKind } from "@game/core";

import { spriteByName, type GameAssets } from "../assets.ts";
import { orbitSprite } from "./orbit-art.ts";

/** How the sky's world maps onto the canvas — the render's own camera, shared
 * so the fx land on the picture they were born into. `y` grows DOWN the
 * screen while altitude grows up, so the map flips. */
export type SkyCamera = {
  /** World x at the left edge of the frame. */
  x: number;
  /** Altitude at the TOP edge of the frame. */
  topAlt: number;
};

export function toScreen(
  cam: SkyCamera,
  x: number,
  alt: number,
): { x: number; y: number } {
  return { x: x - cam.x, y: cam.topAlt - alt };
}

type Fireball = {
  x: number;
  alt: number;
  born: number;
  delayMs: number;
  lifeMs: number;
  r: number;
  /** 0 classic orange, 1 the hotter white-out, 2 the electric one a satellite
   * dies in. */
  heat: number;
};

type Spark = {
  x: number;
  alt: number;
  vx: number;
  vy: number;
  born: number;
  lifeMs: number;
  w: number;
};

type Debris = {
  x: number;
  alt: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  size: number;
  born: number;
  lifeMs: number;
  /** Burning debris drags a little flame tail — the part of an explosion that
   * keeps being one after the bang. */
  burns: boolean;
};

type Ring = {
  x: number;
  alt: number;
  born: number;
  delayMs: number;
  lifeMs: number;
  maxR: number;
};

type Poof = {
  x: number;
  alt: number;
  vx: number;
  born: number;
};

type SpriteBurst = {
  sprite: string;
  x: number;
  alt: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  born: number;
};

export type RocketFxState = {
  fireballs: Fireball[];
  sparks: Spark[];
  debris: Debris[];
  rings: Ring[];
  poofs: Poof[];
  bursts: SpriteBurst[];
  flashUntil: number;
  flashPower: number;
  shakeUntil: number;
  shakeAmp: number;
  /** The poof funnel's own clock — one breath per `POOF_GAP_MS`, however hard
   * the thumb is held. */
  lastPoofMs: number;
};

export function createRocketFx(): RocketFxState {
  return {
    fireballs: [],
    sparks: [],
    debris: [],
    rings: [],
    poofs: [],
    bursts: [],
    flashUntil: 0,
    flashPower: 0,
    shakeUntil: 0,
    shakeAmp: 0,
    lastPoofMs: 0,
  };
}

/** A restart throws the show away with the sky it happened over. */
export function clearRocketFx(fx: RocketFxState): void {
  fx.fireballs.length = 0;
  fx.sparks.length = 0;
  fx.debris.length = 0;
  fx.rings.length = 0;
  fx.poofs.length = 0;
  fx.bursts.length = 0;
  fx.flashUntil = 0;
  fx.shakeUntil = 0;
}

const POOF_GAP_MS = 90;

/** Debris falls a little even up here — not physics, theatre: wreckage that
 * hangs is confetti, wreckage that drops is iron (px/s²). */
const DEBRIS_G = 60;

/**
 * ONE EXPLOSION, ROLLED WHOLE FROM ITS SEED. `big` is the ship (or the module)
 * going; `small` is a satellite — which dies a little ELECTRIC, cyan arcs in
 * the orange, because the company's hardware should be recognisable even as
 * light.
 */
export function boomFx(
  fx: RocketFxState,
  x: number,
  alt: number,
  size: "big" | "small",
  seed: number,
  nowMs: number,
): void {
  const roll = (n: number) => blastRoll(seed ^ n);
  const big = size === "big";
  const scale = big ? 1 : 0.55;

  // THE FIREBALLS — a cluster, never one ball: count, spread, stagger and heat
  // all the seed's. The stagger is what makes a blast read as an EVENT rather
  // than a stamp: the cluster blooms outward over a few frames.
  const balls = (big ? 5 : 3) + Math.floor(roll(1) * (big ? 5 : 3));
  for (let i = 0; i < balls; i++) {
    const a = roll(10 + i) * Math.PI * 2;
    const d = roll(20 + i) * (big ? 34 : 18);
    fx.fireballs.push({
      x: x + Math.cos(a) * d,
      alt: alt + Math.sin(a) * d,
      born: nowMs,
      delayMs: roll(30 + i) * (big ? 260 : 140),
      lifeMs: 380 + roll(40 + i) * 420,
      r: (10 + roll(50 + i) * 16) * scale,
      heat: !big && roll(60 + i) < 0.45 ? 2 : roll(60 + i) < 0.3 ? 1 : 0,
    });
  }

  // THE SPARKS — fast, straight, gone in half a second.
  const sparks = (big ? 14 : 8) + Math.floor(roll(2) * 12);
  for (let i = 0; i < sparks; i++) {
    const a = roll(100 + i) * Math.PI * 2;
    const speed = (90 + roll(120 + i) * 260) * scale;
    fx.sparks.push({
      x,
      alt,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      born: nowMs,
      lifeMs: 240 + roll(140 + i) * 360,
      w: roll(160 + i) < 0.3 ? 2 : 1,
    });
  }

  // THE IRON — tumbling chunks, some burning, arcing down.
  const chunks = (big ? 5 : 3) + Math.floor(roll(3) * (big ? 6 : 3));
  for (let i = 0; i < chunks; i++) {
    const a = roll(200 + i) * Math.PI * 2;
    const speed = (50 + roll(220 + i) * 150) * scale;
    fx.debris.push({
      x,
      alt,
      vx: Math.cos(a) * speed,
      vy: Math.abs(Math.sin(a)) * speed * 0.9 + 30,
      spin: (roll(240 + i) - 0.5) * 14,
      angle: roll(260 + i) * Math.PI * 2,
      size: (2 + roll(280 + i) * 3) * (big ? 1.4 : 1),
      born: nowMs,
      lifeMs: 900 + roll(300 + i) * 900,
      burns: roll(320 + i) < (big ? 0.6 : 0.4),
    });
  }

  // THE FRONT — one ring always, a second one sometimes, late.
  fx.rings.push({
    x,
    alt,
    born: nowMs,
    delayMs: 0,
    lifeMs: big ? 520 : 380,
    maxR: (big ? 110 : 62) * (0.8 + roll(4) * 0.5),
  });
  if (roll(5) < 0.4) {
    fx.rings.push({
      x,
      alt,
      born: nowMs,
      delayMs: 120 + roll(6) * 120,
      lifeMs: big ? 460 : 320,
      maxR: (big ? 70 : 40) * (0.8 + roll(7) * 0.5),
    });
  }

  // THE WHOLE SCREEN FEELS IT.
  const power = big ? 1 : 0.45 + roll(8) * 0.2;
  fx.flashUntil = Math.max(fx.flashUntil, nowMs + (big ? 160 : 90));
  fx.flashPower = Math.max(fx.flashPower, power);
  fx.shakeUntil = Math.max(fx.shakeUntil, nowMs + (big ? 550 : 300));
  fx.shakeAmp = Math.max(fx.shakeAmp, big ? 7 : 3.5);
}

/** A piece of the field coming apart — its own art, flung and fading, plus a
 * pinch of sparks. Direction hashed off position: deterministic, drawless. */
export function burstFx(
  fx: RocketFxState,
  kind: OrbitKind,
  variant: number,
  x: number,
  alt: number,
  nowMs: number,
): void {
  const h = (n: number) =>
    blastRoll((Math.round(x * 3) ^ (Math.round(alt * 7) << 8)) + n);
  const a = h(1) * Math.PI * 2;
  const speed = 60 + h(2) * 120;
  fx.bursts.push({
    sprite: orbitSprite(kind, variant),
    x,
    alt,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    spin: (h(3) - 0.5) * 16,
    angle: h(4) * Math.PI * 2,
    born: nowMs,
  });
  for (let i = 0; i < 5; i++) {
    const sa = h(10 + i) * Math.PI * 2;
    const sp = 60 + h(20 + i) * 140;
    fx.sparks.push({
      x,
      alt,
      vx: Math.cos(sa) * sp,
      vy: Math.sin(sa) * sp,
      born: nowMs,
      lifeMs: 200 + h(30 + i) * 240,
      w: 1,
    });
  }
}

/** One breath of the steering poofs, through the funnel: at most one per
 * `POOF_GAP_MS`, however hard the stick is held. Returns whether it fired, so
 * the caller can voice it. */
export function poofFx(
  fx: RocketFxState,
  x: number,
  alt: number,
  side: 1 | -1,
  nowMs: number,
): boolean {
  if (nowMs - fx.lastPoofMs < POOF_GAP_MS) return false;
  fx.lastPoofMs = nowMs;
  fx.poofs.push({ x, alt, vx: side * (40 + (nowMs % 7) * 4), born: nowMs });
  return true;
}

/** The camera's tremble — decaying, deterministic per ms. */
export function shakeOffset(
  fx: RocketFxState,
  nowMs: number,
): { dx: number; dy: number } {
  if (nowMs >= fx.shakeUntil) {
    fx.shakeAmp = 0;
    return { dx: 0, dy: 0 };
  }
  const left = (fx.shakeUntil - nowMs) / 550;
  const amp = fx.shakeAmp * Math.min(1, left);
  return {
    dx: Math.sin(nowMs * 0.101) * amp,
    dy: Math.cos(nowMs * 0.083) * amp,
  };
}

const POOF_LIFE_MS = 420;
const BURST_LIFE_MS = 700;

/** Paint the whole show, over the finished picture, on its camera. */
export function drawRocketFx(
  ctx: CanvasRenderingContext2D,
  fx: RocketFxState,
  cam: SkyCamera,
  nowMs: number,
  viewW: number,
  viewH: number,
  assets: GameAssets,
): void {
  // ── THE POOFS — soft grey breaths that drift off and thin out. ────────────
  for (let i = fx.poofs.length - 1; i >= 0; i--) {
    const p = fx.poofs[i]!;
    const t = (nowMs - p.born) / POOF_LIFE_MS;
    if (t >= 1) {
      fx.poofs.splice(i, 1);
      continue;
    }
    const s = toScreen(cam, p.x + p.vx * t * 0.42, p.alt);
    ctx.globalAlpha = 0.5 * (1 - t);
    ctx.fillStyle = "#d6dce4";
    const r = 1.5 + t * 4;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── THE GARBAGE COMING APART — its own art, flung, tumbling, fading. ──────
  for (let i = fx.bursts.length - 1; i >= 0; i--) {
    const b = fx.bursts[i]!;
    const t = (nowMs - b.born) / BURST_LIFE_MS;
    if (t >= 1) {
      fx.bursts.splice(i, 1);
      continue;
    }
    const sprite = spriteByName(assets.sprites, b.sprite);
    if (!sprite) continue;
    const secs = (nowMs - b.born) / 1000;
    const s = toScreen(cam, b.x + b.vx * secs, b.alt + b.vy * secs);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(b.angle + b.spin * secs);
    ctx.globalAlpha = 1 - t * t;
    const shrink = 1 - t * 0.4;
    ctx.drawImage(
      sprite,
      (-sprite.width / 2) * shrink,
      (-sprite.height / 2) * shrink,
      sprite.width * shrink,
      sprite.height * shrink,
    );
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // ── THE IRON. ─────────────────────────────────────────────────────────────
  for (let i = fx.debris.length - 1; i >= 0; i--) {
    const d = fx.debris[i]!;
    const t = nowMs - d.born;
    if (t >= d.lifeMs) {
      fx.debris.splice(i, 1);
      continue;
    }
    const secs = t / 1000;
    const wx = d.x + d.vx * secs;
    const wAlt = d.alt + d.vy * secs - 0.5 * DEBRIS_G * secs * secs;
    const s = toScreen(cam, wx, wAlt);
    const frac = t / d.lifeMs;
    if (d.burns && frac < 0.8) {
      // The tail: a short streak back along the travel, fire-coloured.
      const tail = 6 + d.size * 2;
      const len = Math.hypot(d.vx, d.vy - DEBRIS_G * secs) || 1;
      const ux = (d.vx / len) * tail;
      const uy = ((d.vy - DEBRIS_G * secs) / len) * tail;
      ctx.globalAlpha = 0.55 * (1 - frac);
      ctx.strokeStyle = "#ffb02e";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - ux, s.y + uy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1 - frac * 0.5;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(d.angle + d.spin * secs);
    ctx.fillStyle = "#3f4553";
    ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // ── THE SPARKS — additive streaks. ────────────────────────────────────────
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = fx.sparks.length - 1; i >= 0; i--) {
    const sp = fx.sparks[i]!;
    const t = nowMs - sp.born;
    if (t >= sp.lifeMs) {
      fx.sparks.splice(i, 1);
      continue;
    }
    const secs = t / 1000;
    const s = toScreen(cam, sp.x + sp.vx * secs, sp.alt + sp.vy * secs);
    const frac = t / sp.lifeMs;
    ctx.globalAlpha = 1 - frac;
    ctx.strokeStyle = frac < 0.4 ? "#fff3c8" : "#ffb02e";
    ctx.lineWidth = sp.w;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - sp.vx * 0.03, s.y + sp.vy * 0.03);
    ctx.stroke();
  }

  // ── THE FIREBALLS — layered discs blooming out of one another. ────────────
  for (let i = fx.fireballs.length - 1; i >= 0; i--) {
    const f = fx.fireballs[i]!;
    const t = nowMs - f.born - f.delayMs;
    if (t >= f.lifeMs) {
      fx.fireballs.splice(i, 1);
      continue;
    }
    if (t < 0) continue;
    const frac = t / f.lifeMs;
    const s = toScreen(cam, f.x, f.alt);
    // Fast out, slow fade: the ball reaches most of its size in the first
    // fifth and spends the rest cooling through the palette.
    const grow = 1 - (1 - Math.min(1, frac * 4)) ** 2;
    const r = f.r * (0.4 + 0.6 * grow) * (1 + frac * 0.35);
    const cool = frac;
    const core =
      f.heat === 2 ? "#c8f6ff" : f.heat === 1 ? "#ffffff" : "#fff3c8";
    const mid = f.heat === 2 ? "#8ccdd7" : "#ffb02e";
    const rim = f.heat === 2 ? "#4054bc" : "#d83a3a";
    ctx.globalAlpha = (1 - cool) * 0.9;
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mid;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = (1 - cool) ** 1.5;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * Math.max(0.08, 0.42 - cool * 0.3), 0, Math.PI * 2);
    ctx.fill();
  }

  // ── THE RINGS. ────────────────────────────────────────────────────────────
  for (let i = fx.rings.length - 1; i >= 0; i--) {
    const ring = fx.rings[i]!;
    const t = nowMs - ring.born - ring.delayMs;
    if (t >= ring.lifeMs) {
      fx.rings.splice(i, 1);
      continue;
    }
    if (t < 0) continue;
    const frac = t / ring.lifeMs;
    const s = toScreen(cam, ring.x, ring.alt);
    ctx.globalAlpha = (1 - frac) * 0.6;
    ctx.strokeStyle = "#f4f4f4";
    ctx.lineWidth = 2 * (1 - frac) + 0.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, ring.maxR * (1 - (1 - frac) ** 2), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // ── THE FLASH — the whole picture, for a breath. ──────────────────────────
  if (nowMs < fx.flashUntil) {
    const left = (fx.flashUntil - nowMs) / 160;
    ctx.globalAlpha = Math.min(1, left) * 0.5 * fx.flashPower;
    ctx.fillStyle = "#fff8e6";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.globalAlpha = 1;
  } else {
    fx.flashPower = 0;
  }
}
