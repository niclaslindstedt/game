// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SFW ANSWER TO A HIT — pastel stardust and glitter in place of blood,
// cleaves, gibs and burned remains.
//
// Pure presentation, deterministic on the effect seed, and deliberately made
// from canvas primitives rather than atlas sprites. Two reasons, and both are
// load-bearing: the mode must not reveal a red wound frame for one beat while
// the glitter arrives over it, and a mote drawn here takes ANY pastel at ANY
// size for free — a sprite sheet would need one entry per shape-and-colour
// pairing, which for ten shapes across eight pastels is eighty tiles of atlas
// spent on things that live for half a second.
//
// A small hit gets a tight spray; a death that would have come apart gets the
// larger burst; a collision that merely dented something gets a puff.

import { clamp01, fract } from "./shared.ts";
import type { Effect } from "./effects.ts";

const COLORS = [
  "#ff8fd8", // rose
  "#c8a5ff", // lilac
  "#80e8ff", // ice
  "#fff08a", // butter
  "#a8ffc5", // mint
  "#ffb98a", // peach
  "#9fb4ff", // periwinkle
  "#ffc8f0", // blush
];

/** How far off the wagon's own heading a gust may blow, in radians. The dust
 * never simply streams straight out behind the car: each burst picks its own
 * bearing inside this band and to its own side, so two collisions a second
 * apart sweep differently and the road never looks like one canned animation. */
const WIND_MIN = (10 * Math.PI) / 180;
const WIND_MAX = (70 * Math.PI) / 180;
/** …and how far an individual grain may stray from its burst's gust (radians),
 * which is what stops the cloud reading as a solid comb of parallel lines. */
const WIND_SPREAD = 0.42;

export type StardustSpec = {
  /** Damage in the victim's own healthbars, capped only by the draw budget. */
  intensity: number;
  /** A death that would have cleaved, gibbed or burned up. */
  burst: boolean;
  /** The DRIVE's denser, wind-borne fairy-dust disintegration. */
  fairy?: boolean;
};

/** Exported for the focused presentation tests: a stronger blow earns more
 * glitter, but the per-hit hot-path always stays under one fixed draw budget.
 *
 * The fairy bonus is spent on the BURST alone. A road collision that only bent
 * a panel raises fairy dust too — "something happened here" — and it has to
 * stay visibly smaller than the shower a person leaves, or the mode loses the
 * one distinction it still makes. */
export function stardustCount(spec: StardustSpec): number {
  return Math.min(
    spec.fairy ? 90 : 56,
    8 +
      Math.round(Math.sqrt(Math.max(0, spec.intensity)) * 7) +
      (spec.burst ? 20 : 0) +
      (spec.fairy ? (spec.burst ? 26 : 6) : 0),
  );
}

// ── THE MOTE KIT ────────────────────────────────────────────────────────────
// Ten shapes a grain of dust can take, all drawn on whole pixels so they stay
// crisp under the game's integer scale tiers, and all additive (the caller
// holds `lighter` for the whole pass). `r` is the half-extent in device px and
// `bearing` is the grain's own travel direction — the shapes that lean, lean
// along it, which is most of what makes the cloud read as WIND rather than as
// an explosion.

type MoteDraw = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
  bearing: number,
) => void;

const dot: MoteDraw = (ctx, x, y, _r, color, alpha) => {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
};

const chip: MoteDraw = (ctx, x, y, r, color, alpha) => {
  const s = Math.max(1, Math.min(3, Math.round(r)));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
};

/** The four-point catch of light — the shape that says "glitter" on its own. */
const glint: MoteDraw = (ctx, x, y, r, color, alpha) => {
  const a = Math.max(1, Math.round(r));
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x - a), Math.round(y));
  ctx.lineTo(Math.round(x + a), Math.round(y));
  ctx.moveTo(Math.round(x), Math.round(y - a));
  ctx.lineTo(Math.round(x), Math.round(y + a));
  ctx.stroke();
  if (a >= 2) {
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
};

/** Six points — a rarer, showier catch than the cross. */
const spark: MoteDraw = (ctx, x, y, r, color, alpha) => {
  const a = Math.max(1, Math.round(r));
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const th = (k * Math.PI) / 3;
    const dx = Math.cos(th) * a;
    const dy = Math.sin(th) * a;
    ctx.moveTo(Math.round(x - dx), Math.round(y - dy));
    ctx.lineTo(Math.round(x + dx), Math.round(y + dy));
  }
  ctx.stroke();
};

const diamond: MoteDraw = (ctx, x, y, r, color, alpha) => {
  const a = Math.max(1, Math.round(r));
  const cx = Math.round(x);
  const cy = Math.round(y);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy - a);
  ctx.lineTo(cx + a, cy);
  ctx.lineTo(cx, cy + a);
  ctx.lineTo(cx - a, cy);
  ctx.closePath();
  ctx.stroke();
};

/** A hollow bubble. Reads as depth: the cloud gains holes in it. */
const ring: MoteDraw = (ctx, x, y, r, color, alpha) => {
  ctx.globalAlpha = alpha * 0.85;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(
    Math.round(x),
    Math.round(y),
    Math.max(1, Math.round(r)),
    0,
    Math.PI * 2,
  );
  ctx.stroke();
};

/** A cross with corner pips — the biggest shape in the kit, and the rarest. */
const flake: MoteDraw = (ctx, x, y, r, color, alpha, bearing) => {
  const a = Math.max(2, Math.round(r));
  glint(ctx, x, y, a, color, alpha, bearing);
  const d = Math.max(1, Math.round(a * 0.6));
  ctx.globalAlpha = alpha * 0.8;
  ctx.fillStyle = color;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    ctx.fillRect(Math.round(x + sx * d), Math.round(y + sy * d), 1, 1);
  }
};

/** A dash trailing back along the grain's own travel — the shape that carries
 * the SPEED of the sweep. Deliberately common: a cloud of these leaning one way
 * is the whole "blown by the wind" read. */
const streak: MoteDraw = (ctx, x, y, r, color, alpha, bearing) => {
  const len = Math.max(2, Math.round(r * 2.4));
  const bx = Math.cos(bearing);
  const by = Math.sin(bearing) * 0.68;
  ctx.globalAlpha = alpha * 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x - bx * len), Math.round(y - by * len));
  ctx.lineTo(Math.round(x), Math.round(y));
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
};

/** A soft leaning flake — mass in the cloud, so it is not all pinpricks. */
const petal: MoteDraw = (ctx, x, y, r, color, alpha, bearing) => {
  const a = Math.max(1, r);
  ctx.globalAlpha = alpha * 0.75;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(
    Math.round(x),
    Math.round(y),
    a * 1.5,
    a * 0.7,
    bearing,
    0,
    Math.PI * 2,
  );
  ctx.fill();
};

/** Five rows of a pixel heart, high bit leftmost — the mode's one wink at the
 * player, and rare enough to stay a wink. */
const HEART_ROWS = [0b01010, 0b11111, 0b11111, 0b01110, 0b00100];

const heart: MoteDraw = (ctx, x, y, r, color, alpha) => {
  const p = Math.max(1, Math.round(r * 0.5));
  const ox = Math.round(x - p * 2.5);
  const oy = Math.round(y - p * 2.5);
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = color;
  for (let row = 0; row < HEART_ROWS.length; row++) {
    const bits = HEART_ROWS[row]!;
    for (let col = 0; col < 5; col++) {
      if (bits & (1 << (4 - col))) {
        ctx.fillRect(ox + col * p, oy + row * p, p, p);
      }
    }
  }
};

/**
 * The kit and its odds, as a cumulative table walked by one hash draw. Weighted
 * hard toward the small shapes: the picture wanted is a fine cloud with a few
 * things catching the light in it, not a shoal of star icons — which is exactly
 * what an even spread over ten shapes produces.
 */
const MOTES: readonly (readonly [number, MoteDraw])[] = [
  [0.22, dot],
  [0.38, chip],
  [0.56, streak],
  [0.68, glint],
  [0.76, spark],
  [0.83, diamond],
  [0.89, ring],
  [0.94, petal],
  [0.975, flake],
  [1, heart],
];

function moteFor(h: number): MoteDraw {
  for (const [upto, draw] of MOTES) if (h < upto) return draw;
  return dot;
}

/** Draw one SFW hit/death flourish. Returns false when the effect is not ours,
 * following the same claiming convention as blood.ts and dust.ts. */
export function drawStardust(
  ctx: CanvasRenderingContext2D,
  effect: Effect,
  x: number,
  y: number,
  timeMs: number,
): boolean {
  if (effect.kind !== "stardust") return false;
  const spec = effect.stardust;
  if (!spec) return true;
  const duration = effect.durationMs ?? (spec.burst ? 620 : 320);
  const t = clamp01(1 - (effect.untilMs - timeMs) / duration);
  const seed = effect.seed ?? 0;
  const count = stardustCount(spec);
  const power = Math.min(6, Math.max(0.1, spec.intensity));
  const scale = 0.8 + Math.sqrt(power) * 0.28;
  // How far the initial POP throws a grain, before the wind takes over.
  const reach =
    (spec.fairy ? (spec.burst ? 40 : 22) : spec.burst ? 38 : 15) * scale;
  // …and how far the wind then CARRIES it. On the road this is the dominant
  // motion — a body caught by a bumper does not explode, it peels off into the
  // slipstream — so it outruns the pop. In the field it is a breath, enough to
  // stop a burst reading as a static ring.
  const windReach = (spec.fairy ? 118 : 10) * scale;

  // THE GUST. Seeded per burst: the wagon's heading swung 10°–70° to one side
  // or the other. Off the road (no `angle` on the effect) that band still
  // applies, around an arbitrary seeded bearing, so a field burst also drifts
  // somewhere rather than hanging in place.
  const heading = effect.angle ?? fract(seed * 0.211) * Math.PI * 2;
  const side = fract(seed * 0.911 + 0.07) < 0.5 ? -1 : 1;
  const wind =
    heading +
    side * (WIND_MIN + (WIND_MAX - WIND_MIN) * fract(seed * 0.157 + 0.31));

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Beat one: a soft white-pink contact flash. It is light, not a plate pasted
  // over the body, and clears before the individual glitter becomes the read.
  const flash = clamp01(1 - t / 0.22);
  if (flash > 0) {
    const radius = (spec.burst ? 13 : 7) * (0.45 + t * 1.6);
    // Three flat halos avoid allocating a CanvasGradient for every live hit on
    // every frame — a blockade can carry dozens of these at once.
    for (const [share, alpha, color] of [
      [1, 0.12, "#80e8ff"],
      [0.62, 0.24, "#ff9ee2"],
      [0.25, 0.5, "#ffffff"],
    ] as const) {
      ctx.globalAlpha = flash * alpha * (spec.burst ? 1 : 0.72);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y - 3, radius * share, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Beat two: the body of the burst. Every grain has its own delayed clock, its
  // own lifespan, its own shape, size, pastel, gust bearing and wobble, all
  // hashed off the seed — so pausing and replaying draws the identical shower,
  // and no two showers look alike.
  for (let i = 0; i < count; i++) {
    const h1 = fract(seed * 0.731 + i * 0.377); // pop bearing
    const h2 = fract(seed * 0.517 + i * 0.911); // pop and carry speed
    const h3 = fract(seed * 0.293 + i * 0.641); // delay and buoyancy
    const h4 = fract(seed * 0.877 + i * 0.233); // gust stray, wobble rate
    const h5 = fract(seed * 0.401 + i * 0.827); // lifespan, phase
    const h6 = fract(seed * 0.659 + i * 0.149); // size, highlight, wobble reach
    // The SHAPE gets a hash to itself. Sharing one with the lifespan above
    // would mean every heart outlived every speck of dust, which reads as the
    // kit being sorted rather than mixed.
    const h7 = fract(seed * 0.983 + i * 0.457);

    const delay = h3 * 0.14;
    // Grains do NOT all die together: a span well under 1 retires a mote early
    // and leaves the long ones still travelling, which is what turns a burst
    // into a trailing cloud instead of a shape that vanishes on one frame.
    const span = 0.45 + h5 * 0.55;
    const life = clamp01((t - delay) / span);
    if (life <= 0 || life >= 1) continue;

    // The POP: an outward scatter that eases to a stop almost at once.
    const ease = life * (2 - life);
    const pop = reach * (0.22 + h2 * 0.6);
    // The CARRY: the wind, accelerating — a grain that has broken free keeps
    // gathering pace rather than coasting.
    const gust = wind + (h4 - 0.5) * WIND_SPREAD;
    const carry = windReach * (0.3 + h2 * 0.95) * Math.pow(life, 1.35);
    // …and the TURBULENCE across it, at its own rate and reach per grain. This
    // is the sweep: without it a gust is a comb.
    const wobble =
      Math.sin((life * (1.6 + h4 * 3.6) + h5) * Math.PI * 2) *
      (1.5 + h6 * 7) *
      life;
    const lift = Math.sin(life * Math.PI) * (3 + 12 * h3) + life * 5;

    const px =
      x +
      Math.cos(h1 * Math.PI * 2) * pop * ease +
      Math.cos(gust) * carry -
      Math.sin(gust) * wobble;
    const py =
      y -
      3 +
      Math.sin(h1 * Math.PI * 2) * pop * ease * 0.68 +
      Math.sin(gust) * carry * 0.68 +
      Math.cos(gust) * wobble * 0.68 -
      lift;

    // Snaps in over the first few percent of the grain's life and thins out
    // over the rest, so nothing pops out of existence mid-flight.
    const fade =
      Math.min(1, life * 8) * Math.pow(1 - life, 0.6) * (0.72 + h6 * 0.28);
    // A twinkle on the SHAPE rather than on the alpha: a mote that flickered
    // its opacity reads as a dropped frame, one that flickers its size reads as
    // catching the light.
    const r =
      (0.6 + h6 * 2.1) *
      (0.72 + 0.42 * Math.sin((life * (2 + h4 * 5) + h5) * Math.PI * 2));
    // White is a HIGHLIGHT rather than a member of the palette: over `lighter`
    // on a night road it swamps the pastels it sits beside, so only about one
    // grain in twelve gets it.
    const color =
      h6 < 0.08
        ? "#ffffff"
        : (COLORS[(i + Math.floor(seed)) % COLORS.length] ?? COLORS[0]!);

    moteFor(h7)(ctx, px, py, Math.max(0.5, r), color, fade, gust);
  }

  // Beat three: a few slower glints hanging in the gust after the dust has
  // travelled. They do not mark the floor or persist; stardust is a flourish,
  // not a new stain.
  if (spec.burst && t > 0.42) {
    const tail = clamp01((t - 0.42) / 0.58);
    for (let i = 0; i < 5; i++) {
      const a = wind + (fract(seed * 0.83 + i * 0.29) - 0.5) * 1.1;
      const d = 6 + fract(seed * 0.47 + i * 0.61) * (reach + windReach) * 0.4;
      glint(
        ctx,
        x + Math.cos(a) * d * (0.5 + tail * 0.8),
        y - 5 + Math.sin(a) * d * 0.55 - tail * 7,
        1.2 + Math.sin((tail * 3 + i * 0.37) * Math.PI) * 1.2,
        COLORS[i]!,
        (1 - tail) * 0.75,
        a,
      );
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return true;
}
