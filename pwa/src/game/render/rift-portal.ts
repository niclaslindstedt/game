// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RIFT PORTALS — the tears in space the campaign is threaded through: the
// seam humming on the garage's bay wall, the door THE FOUNDER left standing on
// Mars, the far door at the end of the void, and the blast gate a dead man's
// hand talks open.
//
// They were flat sprites, and a flat sprite is the one thing a hole in reality
// must not look like. What this module adds is the part the pixel art cannot
// hold: the tear ANIMATES, and what it animates is a shape with one more axis
// than the screen has. The read to aim for is "this is folding into itself" —
// not "this is spinning" and not "this is glowing".
//
// Four layers make that read, and each one is doing a different job:
//
//   THE THROAT   — nested shells receding into the mouth, and here is the whole
//                  trick: each shell TURNS as it goes down, a half-turn over
//                  the depth of the throat, its width collapsing to a line at
//                  the halfway point and opening back out beyond it. A 3-D
//                  tunnel's rings only ever get smaller; these ones pass
//                  through edge-on and come back, which is what a solid looks
//                  like when it is rotated through an axis the screen does not
//                  have. Two shells travel the other way — out — so the mouth
//                  is swallowing and disgorging at once.
//   THE FOLD     — the beat the whole thing is built around. Every FOLD_MS the
//                  throat CLOSES: the shells, the motes and the light all rush
//                  to a point, an iris of hot rim light collapses after them,
//                  and the mouth snaps back open with an overshoot. The tear
//                  folds shut into itself and unfolds, on its own clock, over
//                  and over.
//   THE MOTES    — violet, gold and green sparks adrift in the black, each
//                  spiralling in toward the point and winking out when it
//                  arrives. The three colours are the rift's signature and they
//                  are the only colour inside the mouth.
//   THE SMOKE    — black smoke, rising. Drawn dark on purpose (it OCCLUDES, it
//                  does not add) with a violet edge, because black smoke over a
//                  black void reads as nothing at all without one.
//
// Everything here is PRESENTATION and nothing here is random: the draw runs
// every frame and must look identical for a given clock, so all the scatter is
// hashed off `fract` and a per-portal seed (see the `visual-effects` craft
// rules). Nothing in this module touches the simulation.
//
// TWO CALLERS, one look. The field draws it over the landmark's own sprite
// (render/world.ts, inside the landmark's billboard) and the cutscene stage
// draws it over the scene prop (overlays/CutsceneOverlay.tsx) — so the door the
// hero walks into at the end of a scene is the same object he finds standing on
// the field a moment later.

import { clamp01, fract } from "./shared.ts";

/** The rift's three signature spark colours: violet, gold, green. */
const MOTE_COLORS = ["#b05cdc", "#ffd75e", "#5ce6a0"] as const;
/**
 * How bright each of the three burns, drawn additively.
 *
 * They are NOT equal and cannot be: gold at full strength is nearly white on a
 * black ground and swamps the other two, so a tear drawn with three equal
 * sparks is a tear full of yellow. The weights are what keeps all three
 * colours readable at once.
 */
const MOTE_WEIGHTS = [1.15, 0.66, 0.88] as const;

/** The `i`th thing inside the tear, cycling the three colours. */
function moteColor(i: number): string {
  return MOTE_COLORS[i % MOTE_COLORS.length] ?? MOTE_COLORS[0];
}

/** How brightly the `i`th thing inside the tear burns. */
function moteWeight(i: number): number {
  return MOTE_WEIGHTS[i % MOTE_WEIGHTS.length] ?? 1;
}

/** One full fold — the tear closing into itself and bursting back open. */
const FOLD_MS = 5200;
/** How much of that cycle the fold itself takes; the rest is the tear at rest. */
const FOLD_SHARE = 0.26;
/** One shell's trip down the throat. */
const THROAT_MS = 2600;
/** One mote's spiral from the rim to the point. */
const MOTE_MS = 2200;
/** One puff of smoke's rise. */
const SMOKE_MS = 3600;
/** The slow breath under everything, so a resting tear is never quite still. */
const BREATH_MS = 3100;
/** One rise and fall of a hanging tear. Deliberately slower than the breath and
 * not a multiple of it, so the two never lock into one motion. */
const BOB_MS = 4300;

/**
 * What one kind of tear looks like. Keyed by the SPRITE the landmark or the
 * scene prop carries, so a new portal is a sprite plus a row in `PORTALS` —
 * the powerup look-kit idiom (see `powerup-fx.ts`), for the same reason: two
 * tears that are the same phenomenon should differ in their palette and their
 * size, never in their code.
 */
export type RiftPortalLook = {
  /** The mouth, in world px — half its width and half its height. */
  halfW: number;
  halfH: number;
  /** World px the mouth sits above the sprite's own centre. */
  dy?: number;
  /**
   * The nothing behind the tear, painted over whatever the art left in the
   * mouth — or null for the ONE door in the game you can see THROUGH, the far
   * door onto Boot Hill, which has a desert on the other side and says so.
   */
  voidColor: string | null;
  /**
   * How the throat is painted. `light` is the void's answer — additive shells
   * burning in the black. `dark` is the seen-through door's: the same shells
   * as shadow, because additive light on a sunlit interior is invisible.
   */
  throat: "light" | "dark";
  /** The hot lip the fold's iris flares in. */
  rim: string;
  /** The glow the tear throws on what stands near it. */
  halo: string;
  /** Shells receding down the throat at once. */
  shells: number;
  /** Sparks adrift in the mouth. */
  motes: number;
  /** Puffs of black smoke rising off it. */
  smoke: number;
  /**
   * How hard the light in the throat burns, 1 being the big tear's own.
   *
   * A SMALL mouth is not a small version of a big one: the same shells drawn
   * over a third of the area stack their additive light into one white-hot
   * blob, and a white-hot blob is the opposite of the black nothing this is
   * supposed to be. Every tear smaller than the road's own door turns itself
   * down here.
   */
  glow: number;
  /**
   * How far the tear RIDES UP AND DOWN, in world px — 0 for a thing that is
   * bolted to something.
   *
   * A hole in space is not standing on the floor, it is HANGING in it, and the
   * cheapest way to say so is to stop it sitting still: a slow bob over a
   * couple of pixels reads as "this is not attached to the world" long before
   * the throat's fold is noticed. The blast gate is the exception and its 0 is
   * the point — that one is a slab of steel in a frame, and a bobbing door
   * would read as a bug rather than as physics.
   */
  bob: number;
};

/**
 * THE PORTALS, by sprite name.
 *
 * `rift` stands twice on the rift's own road (the door in at the hero's
 * landing, the far door at the end of it) and once more in the scene where THE
 * FOUNDER tears it open on Mars. `rift_seam` is the small one humming on the
 * garage's bay wall once the RIFT CREATOR is in the hero's pocket. `rift_west` is the far
 * door with Boot Hill's daylight behind it. `bunker_gate` is not a tear at all
 * — it is an armoured blast door — but a mummified hand talks it open onto a
 * vault that is nowhere, so the same nothing churns behind its panel, kept
 * small enough to stay inside the steel.
 */
const PORTALS: Record<string, RiftPortalLook> = {
  rift: {
    halfW: 10,
    halfH: 17,
    voidColor: "#07060d",
    throat: "light",
    rim: "#ec52be",
    halo: "#9a5bdc",
    shells: 7,
    motes: 22,
    smoke: 18,
    glow: 1,
    bob: 2.2,
  },
  rift_seam: {
    halfW: 5,
    halfH: 8,
    voidColor: "#07060d",
    throat: "light",
    rim: "#ec52be",
    halo: "#9a5bdc",
    shells: 5,
    motes: 13,
    smoke: 11,
    glow: 0.5,
    bob: 1.4,
  },
  rift_west: {
    halfW: 10,
    halfH: 17,
    voidColor: null,
    throat: "dark",
    rim: "#ffb347",
    halo: "#c86bd8",
    shells: 6,
    motes: 16,
    smoke: 4,
    glow: 0.4,
    bob: 2,
  },
  bunker_gate: {
    halfW: 5,
    halfH: 9,
    dy: 1,
    voidColor: "#07060d",
    throat: "light",
    rim: "#ec52be",
    halo: "#8a52c8",
    shells: 5,
    motes: 11,
    smoke: 9,
    glow: 0.4,
    bob: 0,
  },
};

/**
 * HOW FAR THIS TEAR HAS RIDDEN UP, in whole px, at `timeMs`.
 *
 * Exported because the ART has to move with it: the caller draws the sprite and
 * this module draws what churns inside it, so a bob applied only here would
 * slide the throat out of its own lips. Whole pixels, because the sprite is
 * pixel art and a fractional offset resamples it into mush.
 */
export function riftPortalBob(
  look: RiftPortalLook,
  timeMs: number,
  seed: number,
): number {
  if (look.bob <= 0) return 0;
  return Math.round(
    Math.sin((timeMs / BOB_MS + seed) * Math.PI * 2) * look.bob,
  );
}

/** The look for a landmark's or a scene prop's sprite, or null when the art is
 * not a tear in anything. */
export function riftPortalLook(sprite: string): RiftPortalLook | null {
  return PORTALS[sprite] ?? null;
}

/** How much taller than wide one puff of smoke is drawn. */
const SMOKE_STRETCH = 1.6;

/**
 * ONE PUFF OF SMOKE, baked once.
 *
 * The plume is the busiest layer in this module — near twenty puffs per tear,
 * every frame — and each of them used to mint its own `createRadialGradient`.
 * The gradient's SHAPE never changes, only how big and how strong the puff is,
 * so it is baked to a bitmap once and blitted scaled from then on, with the
 * strength carried by `globalAlpha`. The bake is small and blown up, which
 * costs nothing on art this soft.
 */
const PUFF_ART = 64;
let puffArt: HTMLCanvasElement | null | undefined;

function smokePuff(): HTMLCanvasElement | null {
  if (puffArt !== undefined) return puffArt;
  const out = document.createElement("canvas");
  out.width = PUFF_ART;
  out.height = PUFF_ART;
  const ctx = out.getContext("2d");
  if (!ctx) {
    puffArt = null;
    return null;
  }
  const r = PUFF_ART / 2;
  // Black at the heart, a violet edge under it: a black puff over the void's
  // own black ground is invisible, and the edge is the only thing that gives
  // it a volume to read.
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, "rgba(5, 4, 9, 1)");
  g.addColorStop(0.5, "rgba(12, 8, 20, 0.86)");
  g.addColorStop(0.82, "rgba(46, 24, 74, 0.34)");
  g.addColorStop(1, "rgba(46, 24, 74, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PUFF_ART, PUFF_ART);
  puffArt = out;
  return out;
}

/** An almond path around the local origin — the tear's own silhouette. The
 * control point is `2 × half-width` because a quadratic's widest point is half
 * its control offset, so the curve peaks at exactly `hw`. */
function lens(ctx: CanvasRenderingContext2D, hw: number, hh: number): void {
  const c = Math.max(0.2, hw) * 2;
  ctx.beginPath();
  ctx.moveTo(0, -hh);
  ctx.quadraticCurveTo(c, 0, 0, hh);
  ctx.quadraticCurveTo(-c, 0, 0, -hh);
  ctx.closePath();
}

/** `#rrggbb` → `rgba(r, g, b, a)`, so one authored colour can be drawn at any
 * strength without a second entry in the look. */
function tint(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * THE FOLD's progress through one cycle, as the two numbers every layer reads:
 *
 * `squeeze` runs 0 → 1 → 0 across the fold beat and is how far the tear has
 * collapsed into itself; `pulse` is the overshoot that follows, so the mouth
 * does not merely reopen, it BURSTS back. A fold that eased both ways read as
 * breathing; the asymmetry is what makes it read as a fold.
 */
function foldPhase(
  timeMs: number,
  seed: number,
): {
  squeeze: number;
  pulse: number;
} {
  const p = fract(seed * 0.37 + timeMs / FOLD_MS);
  const inFold = clamp01((p - (1 - FOLD_SHARE)) / FOLD_SHARE);
  if (inFold <= 0) return { squeeze: 0, pulse: 0 };
  // Closing takes two thirds of the beat and opening a third — it shuts
  // reluctantly and snaps.
  const shut = 0.66;
  if (inFold < shut) {
    return { squeeze: Math.pow(inFold / shut, 1.6), pulse: 0 };
  }
  const back = (inFold - shut) / (1 - shut);
  return {
    squeeze: Math.pow(1 - back, 2.4),
    pulse: Math.sin(back * Math.PI) * (1 - back * 0.35),
  };
}

/**
 * Draw one rift portal, mouth centred on (`cx`, `cy`) in whatever space the
 * caller has set up — the landmark's billboard on the field, the stage's own
 * pixel space in a cutscene.
 *
 * `seed` puts two tears on the same map out of step with each other (the field
 * hands it the landmark's own position); `timeMs` is the caller's clock, so the
 * field's tears slow down with a slowed run and a cutscene's runs on the scene.
 */
export function drawRiftPortal(
  ctx: CanvasRenderingContext2D,
  look: RiftPortalLook,
  cx: number,
  cy: number,
  timeMs: number,
  seed: number,
): void {
  const { squeeze, pulse } = foldPhase(timeMs, seed);
  // The resting breath, plus the fold: the mouth narrows hard as it shuts and
  // stretches a little while it does, the way a thing does when it is being
  // folded rather than closed.
  const breath = Math.sin((timeMs / BREATH_MS + seed) * Math.PI * 2);
  const open = 1 - 0.88 * squeeze + 0.14 * pulse;
  const hw = look.halfW * (1 + 0.05 * breath) * (1 - 0.74 * squeeze);
  const hh = look.halfH * (1 + 0.03 * breath) * (1 + 0.18 * squeeze);
  const x = Math.round(cx);
  const y = Math.round(cy + (look.dy ?? 0));

  ctx.save();
  ctx.imageSmoothingEnabled = true;

  drawThroat(ctx, look, x, y, hw, hh, open, squeeze, pulse, timeMs, seed);
  drawHalo(ctx, look, x, y, hw, hh, breath, squeeze, pulse);
  drawSmoke(ctx, look, x, y, hh, timeMs, seed);

  ctx.restore();
}

/** The inside of the tear: the nothing, the turning shells, the iris of the
 * fold and the motes adrift in it — all clipped to the mouth, so none of it can
 * spill over the pixel lips the art drew. */
function drawThroat(
  ctx: CanvasRenderingContext2D,
  look: RiftPortalLook,
  x: number,
  y: number,
  hw: number,
  hh: number,
  open: number,
  squeeze: number,
  pulse: number,
  timeMs: number,
  seed: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  // THE TURN the fold makes. Only the INSIDE turns — the pixel lips the art
  // drew stay exactly where they are, which is the difference between a tear
  // folding into itself and a sprite being spun around.
  ctx.rotate(squeeze * 0.7 - pulse * 0.25);
  // A hair inside the art's own lips, so the black never eats them.
  lens(ctx, hw * 0.94, hh * 0.94);
  ctx.clip();

  if (look.voidColor) {
    ctx.fillStyle = look.voidColor;
    ctx.fill();
  }

  const lit = look.throat === "light";
  ctx.globalCompositeOperation = lit ? "lighter" : "source-over";

  // THE SHELLS. `u` is how far down the throat one shell has travelled; it
  // shrinks as it goes AND turns a half-turn, which is the whole illusion —
  // `Math.abs(Math.cos(u × π))` collapses its width to a line at the halfway
  // point and opens it back out, so the shell passes edge-on through an axis
  // the screen does not have instead of merely getting smaller.
  const inward = look.shells;
  for (let i = 0; i < inward + 2; i++) {
    // The last two travel the OTHER way: the mouth disgorges as well as
    // swallows, and a throat that only swallowed read as a drain.
    const out = i >= inward;
    const rate = out ? 1.45 : 1;
    const u = fract(
      (out ? -1 : 1) * ((timeMs / THROAT_MS) * rate) + i * (1 / inward) + seed,
    );
    const depth = Math.pow(1 - u, 1.7) * open;
    if (depth <= 0.02) continue;
    const turn = u * Math.PI + seed * 0.7;
    const edge = Math.abs(Math.cos(turn));
    const sw = hw * depth * (0.16 + 0.84 * edge);
    const sh = hh * depth;
    const fade = Math.sin(Math.PI * u);
    const color = moteColor(i);
    ctx.save();
    ctx.translate(0, Math.sin(turn) * hh * 0.06);
    // A shell DIMS as it recedes (× depth): light that kept its strength all
    // the way down piled every shell's stroke onto the same few pixels at the
    // point and burned the middle of the tear white.
    ctx.globalAlpha =
      fade * depth * (out ? 0.5 : 0.95) * (lit ? look.glow : 1.15);
    ctx.strokeStyle = lit ? color : "#3d1420";
    // A SHADOW has to be fatter than a light to read at all: a one-pixel dark
    // stroke across a sunlit interior is invisible, where the same stroke of
    // light on black is a clean line.
    ctx.lineWidth = (lit ? 1 : 2.4) * Math.max(0.7, 1.4 * depth + pulse * 0.6);
    lens(ctx, sw, sh);
    ctx.stroke();
    ctx.restore();
  }

  // THE PUPIL. Whatever is down there, it is not lit: a soft plug of the void's
  // own black over the deep end, so the throat recedes INTO darkness instead of
  // into the pile-up of its own shells. Painted over the shells and under the
  // motes — a spark still crosses it, which is what gives the black a depth.
  // The seen-through door gets one too, in its own warm shadow: a door with a
  // desert behind it still has to have a FAR SIDE, and a flat plate of daylight
  // has none.
  {
    ctx.globalCompositeOperation = "source-over";
    const deep = look.voidColor ?? "#5a2418";
    const weight = look.voidColor ? 1 : 0.42;
    const pupil = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, hw));
    pupil.addColorStop(0, tint(deep, 0.94 * weight));
    pupil.addColorStop(0.45, tint(deep, 0.72 * weight));
    pupil.addColorStop(1, tint(deep, 0));
    ctx.save();
    ctx.scale(1, Math.max(0.2, hh / Math.max(0.2, hw)));
    ctx.fillStyle = pupil;
    ctx.beginPath();
    ctx.arc(0, 0, hw, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // THE IRIS of the fold: hot rim light collapsing after everything else, and
  // the flare it leaves when the mouth bursts back open.
  if (squeeze > 0.01) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.pow(squeeze, 0.6) * 0.55;
    ctx.strokeStyle = look.rim;
    ctx.lineWidth = 1 + 2.4 * squeeze;
    lens(ctx, hw * (1 - squeeze) * 0.94, hh * (1 - squeeze) * 0.94);
    ctx.stroke();
  }
  if (pulse > 0.01) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = pulse * 0.28;
    ctx.fillStyle = look.rim;
    lens(ctx, hw * 0.94, hh * 0.94);
    ctx.fill();
  }

  drawMotes(ctx, look, hw, hh, open, timeMs, seed);
  ctx.restore();
}

/** The sparks adrift in the black: violet, gold and green, each spiralling in
 * toward the point and winking out when it gets there. */
function drawMotes(
  ctx: CanvasRenderingContext2D,
  look: RiftPortalLook,
  hw: number,
  hh: number,
  open: number,
  timeMs: number,
  seed: number,
): void {
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < look.motes; i++) {
    const phase = fract(seed + i * 5.31);
    const life = fract(timeMs / MOTE_MS + phase);
    const angle = fract(seed + i * 1.77) * Math.PI * 2;
    const spin = (1.2 + fract(seed + i * 3.11) * 2.4) * (i % 2 ? 1 : -1);
    // Out at the lips it fades in; at the point it is gone. The radius is
    // elliptical, so a mote can never leave the mouth it belongs to.
    const r = Math.pow(1 - life, 0.75) * open;
    const theta = angle + spin * life * Math.PI;
    const mx = Math.cos(theta) * hw * 0.78 * r;
    const my = Math.sin(theta) * hh * 0.84 * r;
    const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(timeMs / 130 + i * 2.1));
    const alpha =
      Math.sin(Math.PI * life) *
      twinkle *
      (0.4 + 0.6 * look.glow) *
      moteWeight(i);
    if (alpha <= 0.02) continue;
    const color = moteColor(i);
    const size = 0.5 + fract(seed + i * 9.7) * 0.5;
    // A soft bloom under a hard point — the point is what reads as a spark, the
    // bloom is what stops it reading as a dead pixel. Keep the bloom WEAK: at
    // any real strength the two stack into a fat glowing egg, and a tear full
    // of those reads as eyes rather than as sparks.
    ctx.globalAlpha = Math.min(1, alpha) * 0.2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx, my, size * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.beginPath();
    ctx.arc(mx, my, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The light the tear throws on the ground and the walls around it — a DONUT,
 * starting at the lips: an additive disc over the mouth would grey out the very
 * nothing the whole thing is about. */
function drawHalo(
  ctx: CanvasRenderingContext2D,
  look: RiftPortalLook,
  x: number,
  y: number,
  hw: number,
  hh: number,
  breath: number,
  squeeze: number,
  pulse: number,
): void {
  const reach = hw * (2.2 + 0.12 * breath + 0.5 * pulse);
  const strength =
    (0.2 + 0.05 * breath + 0.22 * squeeze + 0.4 * pulse) * look.glow;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(x, y);
  ctx.scale(1, Math.max(0.2, hh / Math.max(0.2, hw)));
  const g = ctx.createRadialGradient(0, 0, hw * 0.62, 0, 0, reach);
  g.addColorStop(0, tint(look.halo, 0));
  g.addColorStop(0.16, tint(look.rim, strength * 0.6));
  g.addColorStop(0.44, tint(look.halo, strength * 0.34));
  g.addColorStop(1, tint(look.halo, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, reach, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * BLACK SMOKE, rising off the mouth.
 *
 * Drawn `source-over` and dark, never additively: this is the one layer that
 * has to take light AWAY. Each puff carries a violet edge under the black,
 * because a black puff over the void's black ground is invisible — the edge is
 * the only thing that gives it a volume to read.
 */
function drawSmoke(
  ctx: CanvasRenderingContext2D,
  look: RiftPortalLook,
  x: number,
  y: number,
  hh: number,
  timeMs: number,
  seed: number,
): void {
  const puff = smokePuff();
  if (!puff) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  const rise = hh * 1.55 + 8;
  for (let i = 0; i < look.smoke; i++) {
    const phase = fract(seed * 1.31 + i * 2.77);
    const life = fract(timeMs / SMOKE_MS + phase);
    const drift = (fract(seed + i * 7.13) - 0.5) * look.halfW * 1.4;
    const sway = Math.sin(life * 4.2 + i * 1.9) * look.halfW * 0.55;
    const px = x + drift + sway * life;
    const py = y - hh * 0.3 - rise * Math.pow(life, 0.82);
    const r = look.halfW * (0.3 + life * 0.95);
    // Fades in off the lips, thins as it climbs and spreads.
    const a = Math.pow(Math.sin(Math.PI * life), 1.15) * 0.66;
    if (a <= 0.02 || r <= 0.4) continue;
    // Drawn TALLER than it is wide, and overlapping its neighbours: a column of
    // round puffs reads as bubbles, and smoke is a continuous thing being
    // dragged upward.
    ctx.globalAlpha = a;
    ctx.drawImage(
      puff,
      px - r,
      py - r * SMOKE_STRETCH,
      r * 2,
      r * 2 * SMOKE_STRETCH,
    );
  }
  ctx.restore();
}
