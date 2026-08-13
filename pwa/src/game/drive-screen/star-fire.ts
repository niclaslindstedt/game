// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A BURNING CAR LOOKS LIKE WHEN THERE IS NO FIRE IN THE GAME — the SFW
// answer to the road's flame, and to the fuel tank behind it.
//
// SFW ALREADY HAD AN ANSWER FOR EVERYTHING A BODY DOES and none at all for
// STEEL CATCHING LIGHT. A wagon driven through a crowd in the mode threw pastel
// dust, laid pastel marks and wore a pastel film — and then the first car the
// player finished went up in an orange flame ladder that stayed on the road for
// the rest of the leg, brighter than anything else in the frame. One effect,
// left in the wrong material, and the whole mode reads as unfinished.
//
// SO A CAR ALIGHT FIZZES: gold stars streaming up off the bonnet, thickening as
// the burn takes hold exactly as the flame's own stages do, and a fuel tank
// throws a party popper's worth of them instead of a fireball.
//
// PRIMITIVES RATHER THAN SPRITES, WHICH IS THE OPPOSITE CALL THE FLAME MAKES,
// and both are right for their own material. Fire is ONE thing with a shape the
// eye knows, so it is authored art (`content/sprites/effects/flame_*`) and a
// fire built out of orange dots reads as sparks. Glitter is the reverse: there
// are HUNDREDS of grains and the MASS is the picture, so a star sheet would be
// one tile drawn a hundred times a frame — and a drawn star takes any gold at
// any size for free, where an atlas would owe a tile per size-and-colour pair.
// `render/stardust.ts` reached the same conclusion for the same reason.
//
// EVERYTHING HERE IS DETERMINISTIC ON THE EFFECT'S OWN SEED and on its own
// 0→1 life, so a paused road holds the shower exactly where it was and a
// replayed tick draws the identical one. No draw is spent off the drive's RNG.

import { fract } from "../render/shared.ts";

/**
 * The only part of a road effect a star shower needs. Declared structurally
 * rather than imported so `DriveFx` can stay private to `drive-fx.ts`.
 */
export type StarSource = {
  /** 0→1-ish. For a burn it is `DriveTraffic.fire` — how far the fire has got —
   * and it is what thickens the stream, so the player watches a flicker under a
   * wing become a bonnet fizzing rather than a shower switching on. */
  force: number;
  /** Per-effect scatter seed, so two burning cars never twinkle in step. */
  seed: number;
  /** How far off the road it is thrown from (world px) — a bonnet, not the
   * tarmac. */
  lift?: number;
};

/**
 * THE GOLD, DARKEST FIRST. Yellow is the whole brief and a single yellow is a
 * flat one: the shower has to have depth in it, so the grains run from a deep
 * amber through the two butters to a white core, and over `lighter` on night
 * tarmac the pale end is what actually reads while the amber gives it body.
 *
 * DELIBERATELY NOT THE FAIRY RAMP. The dust a BODY leaves is lilac, rose and
 * pale gold — a substance the player has learned means "somebody was there" —
 * and a burning car is not somebody. Keeping the burn to one narrow gold band
 * is what lets a glance tell a fizzing wreck from a cloud of a person, which is
 * a distinction the mode otherwise loses.
 */
const GOLD = [
  "#ffb42e", // amber
  "#ffd34a", // gold
  "#ffe98a", // butter
  "#fff6c8", // pale
  "#ffffff", // core
];

/** How many points a star has, and how deep the notch between them is as a
 * share of the outer radius. Five and 0.42 is the shape everybody draws when
 * asked for a star; anything shallower reads as a cog. */
const POINTS = 5;
const INNER = 0.42;

/**
 * ONE STAR, on whole pixels at its outer points so it stays crisp under the
 * game's integer scale tiers.
 *
 * Filled rather than stroked: at the two- to four-pixel radii this shower runs
 * at, a one-pixel outline is a ring of disconnected dots — the points are the
 * only part of a star small enough to survive, and they are exactly the part an
 * outline loses.
 */
function star(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  spin: number,
  color: string,
  alpha: number,
): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < POINTS * 2; i++) {
    const reach = i % 2 === 0 ? r : r * INNER;
    const angle = spin + (i * Math.PI) / POINTS;
    const px = x + Math.cos(angle) * reach;
    // FLATTENED ALONG THE ROAD'S OWN RAKE. Everything with a place on this road
    // is seated through the projection (`bodyAnchor*`), so a star drawn round
    // stands a shade too tall beside the traffic it is coming off; the same
    // 0.8 the drive's other airborne scatter uses keeps it in the picture.
    const py = y + Math.sin(angle) * reach * 0.8;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** Deterministic per-grain scatter — the same hash the rest of the road's
 * effect layer uses instead of `Math.random`, which would reshuffle the picture
 * every frame. */
function grain(seed: number, i: number, salt: number): number {
  return fract(Math.sin(seed * 0.017 + i * 12.9898 + salt) * 43758.5453);
}

/**
 * HOW MANY STARS ONE ISSUE OF A BURN THROWS, at a flicker and at a bonnet well
 * alight.
 *
 * MEASURED AGAINST THE FLAME IT REPLACES, in the gallery, side by side. The
 * burn is the one effect on this road that OUTLIVES its collision — re-issued
 * on a cadence for the rest of the leg — and the flame it stands in for is the
 * brightest thing in the frame the whole time. A thin sprinkle at the wheels
 * does not say "that car is in trouble", it says the renderer is dropping
 * something, and the first cut of these numbers said exactly that.
 *
 * The cadence is shorter than one issue's life (`burning.ts`), so two or three
 * issues are always overlapping into one continuous fountain rather than one
 * puff blinking.
 */
const FIZZ_MIN = 9;
const FIZZ_MAX = 26;
/** How far a star climbs over its life (world px), and how far it wanders off
 * the vertical while it does. A shower that went straight up would read as a
 * jet; the wander is what makes it a fizz. */
const CLIMB_PX = 34;
const WANDER_PX = 10;
/**
 * …AND WHERE IT LEAVES FROM, above the effect's own lift (world px).
 *
 * THE LIFT IS THE FLAME'S FOOT, NOT ITS BODY. `burning.ts` hands both draws the
 * same 9 px because that is where a bonnet is, and the flame then occupies the
 * sprite's whole height ABOVE it — so a fountain rising from the foot alone
 * pours out from under the sills while the flame it replaces sits on the
 * bodywork. This is the rest of that sprite, paid back.
 */
const BODY_PX = 9;
/** …and how far along a four-metre car they leave from. The flame spreads three
 * tongues along the body for the same reason: one point of origin on the middle
 * of a car reads as something parked beside it rather than as the car itself. */
const ALONG_PX = 22;
/** How far the burn LIGHTS the road around it (world px of radius at a full
 * burn), and how hard. The flame is drawn additively out of art that is mostly
 * glow, so a car alight visibly lifts the tarmac it is standing on; a fountain
 * of hard little stars has no glow in it at all and reads as a sparkler held
 * over an unlit wreck without this. Low alpha and three flat discs rather than
 * a gradient — a `CanvasGradient` per burning car per frame is an allocation on
 * the hot path for a halo nobody is looking straight at. */
const HALO_PX = 17;
const HALO_ALPHA = 0.1;

/**
 * A CAR FIZZING — the burn, as a fountain of gold stars off the bodywork.
 *
 * `t` is the issue's own 0→1 life. Each star inside it has its own delay, span,
 * size, colour, spin rate and wander, so the fountain thins from the bottom
 * rather than winking out as a block — the same rule the pastel shower obeys
 * and the same reason: grains that die together are a shape disappearing, and
 * grains that die apart are a cloud.
 *
 * ADDITIVE, because a star catching the light IS light. Over night tarmac
 * `source-over` would paste yellow stickers on the road.
 */
export function drawStarFire(
  ctx: CanvasRenderingContext2D,
  fx: StarSource,
  t: number,
  sx: number,
  sy: number,
): void {
  const lift = fx.lift ?? 0;
  const burn = Math.min(1, Math.max(0, fx.force));
  const count = Math.round(FIZZ_MIN + (FIZZ_MAX - FIZZ_MIN) * burn);
  // Fades in and out over its own short life so consecutive issues overlap
  // into one continuous fizz instead of popping.
  const issue = Math.min(1, (1 - t) * 1.9) * (0.6 + burn * 0.4);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // The light it throws on the road, under the grains that are throwing it.
  for (const [share, tone] of [
    [1, "#ff9c1e"],
    [0.6, "#ffd34a"],
    [0.28, "#fff6c8"],
  ] as const) {
    ctx.globalAlpha = issue * HALO_ALPHA * (0.4 + burn * 0.6);
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.ellipse(
      sx,
      sy - lift - BODY_PX,
      HALO_PX * share * (0.6 + burn * 0.5),
      HALO_PX * share * 0.6 * (0.6 + burn * 0.5),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  for (let i = 0; i < count; i++) {
    const h1 = grain(fx.seed, i, 11); // where along the body it left from
    const h2 = grain(fx.seed, i, 12); // delay and span
    const h3 = grain(fx.seed, i, 13); // climb rate and wander reach
    const h4 = grain(fx.seed, i, 14); // size, colour, spin
    const life = Math.min(1, Math.max(0, (t - h2 * 0.3) / (0.6 + h3 * 0.4)));
    if (life <= 0 || life >= 1) continue;
    // A star LEAVES fast and slows as it rises — hot gas throwing something
    // light, which runs out of push almost at once.
    const rise = life * (2 - life);
    const px =
      sx +
      (h1 - 0.5) * ALONG_PX +
      Math.sin(life * (2.2 + h3 * 3) * Math.PI) * WANDER_PX * h3;
    const py =
      sy - lift - BODY_PX * (0.3 + h2) - rise * CLIMB_PX * (0.5 + h3 * 0.8);
    // A TWINKLE ON THE SIZE, never on the alpha: a grain that flickers its
    // opacity reads as a dropped frame, one that flickers its size reads as
    // catching the light.
    const r =
      (1.8 + h4 * 2.6) *
      (0.72 + 0.36 * Math.sin((life * (3 + h3 * 4) + h4) * Math.PI * 2));
    star(
      ctx,
      px,
      py,
      r,
      h4 * Math.PI * 2 + life * (2 + h4 * 4),
      GOLD[Math.floor(h4 * GOLD.length) % GOLD.length]!,
      // HELD, THEN DROPPED. A grain that starts fading on the frame it is born
      // spends most of its life nearly invisible, which is what made the first
      // cut of this a smudge: the fountain has to be BRIGHT while it is
      // climbing and gone at the top.
      issue * Math.min(1, (1 - life) * 2.2) * (0.7 + h4 * 0.3),
    );
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/** How many stars a tank throws, how far the ring gets (world px), and how high
 * the shower climbs through the shell as it opens. Sized against the fireball
 * it replaces — a blast is the biggest single thing that happens on this road
 * and the mode may not quietly make it the smallest. */
const POP_STARS = 34;
const POP_REACH_PX = 48;
const POP_RISE_PX = 30;

/**
 * THE FUEL TANK GOING, IN THE MODE — a party popper rather than a fireball.
 *
 * ITS OWN DRAW RATHER THAN A BIG `drawStarFire`, for the same reason the blast
 * is its own kind beside the fire: it is a different SHAPE as well as a
 * different size. A burn sits on a car and streams upward for as long as it
 * lasts; a pop opens outward beneath the shell in three frames, climbs through
 * it and is gone.
 *
 * THE CORE IS DRAWN FIRST AND FADES FASTEST, which is what makes the opening
 * frames read: a burst is a flash with the shower behind it, and a ring of
 * stars with nothing in the middle reads as a smoke ring.
 */
export function drawStarBlast(
  ctx: CanvasRenderingContext2D,
  fx: StarSource,
  t: number,
  sx: number,
  sy: number,
): void {
  const lift = fx.lift ?? 0;
  const ease = t * (2 - t);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const core = Math.max(0, 1 - t * 3.2);
  if (core > 0) {
    ctx.globalAlpha = core;
    ctx.fillStyle = "rgba(255, 240, 190, 0.9)";
    ctx.beginPath();
    ctx.ellipse(
      Math.round(sx),
      Math.round(sy - lift),
      12 + ease * 30,
      8 + ease * 17,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  for (let i = 0; i < POP_STARS; i++) {
    const h1 = grain(fx.seed, i, 21); // bearing off the ring
    const h2 = grain(fx.seed, i, 22); // how far it gets
    const h3 = grain(fx.seed, i, 23); // how high, and how long it lasts
    const h4 = grain(fx.seed, i, 24); // size, colour, spin
    const life = Math.min(1, t / (0.55 + h3 * 0.45));
    if (life >= 1) continue;
    // Spread round the whole ring with a per-star stray, so the burst is even
    // without being a wheel of spokes.
    const angle = (i / POP_STARS) * Math.PI * 2 + (h1 - 0.5) * 0.6;
    const reach = POP_REACH_PX * ease * (0.35 + h2 * 1.05);
    const px = sx + Math.cos(angle) * reach;
    const py =
      sy -
      lift +
      Math.sin(angle) * reach * 0.4 -
      ease * POP_RISE_PX * (0.4 + h3 * 0.9);
    const r =
      (1.4 + h4 * 2.4) *
      (0.75 + 0.35 * Math.sin((life * (2 + h3 * 4) + h4) * Math.PI * 2));
    star(
      ctx,
      px,
      py,
      r,
      h4 * Math.PI * 2 + life * (3 + h4 * 5),
      GOLD[Math.floor(h4 * GOLD.length) % GOLD.length]!,
      Math.max(0, 1 - life) * (0.65 + h4 * 0.35),
    );
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
