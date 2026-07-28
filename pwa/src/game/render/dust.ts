// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DUST A JUMP KICKS UP — the gravel stirred at the shove-off and the puff of
// smoke at the touchdown, world-anchored on the spot the boot met the floor.
//
// It is one effect kind with two moods, because they are one motion: a takeoff
// rakes the floor loose and shoves it BACKWARD (low, fast, trailing behind him),
// a landing drives it OUT (a ring that rolls away from the impact and hangs).
//
// The cloud is AUTHORED ART, not drawn shapes: `dust_puff_0..2` billow, grow and
// tear open (each puff walks the three frames over its own short life), and
// `ground_grit_0..1` are the chips of floor raked loose. They are drawn in
// neutral greys and TINTED per landing (`tintedSprite`) to the colour of the
// ground he actually touched (`groundColorAt` samples the baked ground layer),
// which is what lets one set of frames throw pale regolith on the moon, rust on
// Mars and deck grey inside a base — including on carved maps and any venue
// added later, with nothing to author per level.
//
// Two more things size it. The IMPACT — the fall speed as a fraction of a
// standing hop — decides how much comes up, so a plain hop kicks a wisp and a
// Spring Heels landing throws a proper cloud. His GROUND SPEED smears the whole
// thing along his heading, so a jump taken at a sprint drags its dust behind it
// instead of blooming evenly from a man who was clearly standing still.
//
// Everything is seeded off the effect, never `Math.random` in a draw — the pass
// runs every frame for the same `t` and has to come out identical each time.

import { spriteByName, type Sprites } from "../assets.ts";
import { tintedSprite } from "./caches.ts";
import { clamp01, fract } from "./shared.ts";
import type { Effect } from "./effects.ts";

/** The effect kinds this module owns. */
export const DUST_KINDS = new Set(["dustTakeoff", "dustLand"]);

/** How long each mood runs (ms). The landing hangs a good deal longer than the
 * shove-off — the takeoff is over the moment he is airborne, the cloud he lands
 * in has to settle. */
export const TAKEOFF_DUST_MS = 340;
export const LANDING_DUST_MS = 560;

/** The ground plane is seen at a shallow angle, so a cloud spreads wider than it
 * is tall. The same squash the blood pool and every ground ring use. */
const FLATTEN = 0.42;

/** World px BELOW the jump's recorded point that the burst is centred on. The
 * event carries the hero's own position — his middle — and dust thrown from a
 * man's waist reads as a man on fire. The same few px down to the ground line
 * that his jump shadow uses. */
const FOOT_OFFSET = 5;

/** Puff counts at full power. A landing throws about twice what a takeoff does,
 * and both scale down with the impact — but a jump happens every few seconds, so
 * the ceiling stays modest. This is not a panic-button blast. */
const TAKEOFF_PUFFS = 5;
const LANDING_PUFFS = 11;

/** How many clusters of raked-up gravel each mood throws. */
const TAKEOFF_GRIT = 2;
const LANDING_GRIT = 3;

/** World px the cloud reaches at full power, before the speed smear. */
const TAKEOFF_REACH = 12;
const LANDING_REACH = 24;
/** The grit outruns the cloud — chips carry, dust doesn't. */
const GRIT_REACH_MULT = 1.6;

/** How far a ground speed of `SMEAR_REF_SPEED` px/s drags the burst along the
 * hero's heading, as a fraction of its own reach. Deliberately under half: the
 * cloud still blooms on BOTH sides of him and merely drifts downwind, where a
 * bigger drag shunts the whole thing past him and reads as dust somebody else
 * kicked up. */
const SMEAR_REF_SPEED = 84;
const SMEAR_FRAC = 0.55;

/** The puff frames, walked over each puff's own life, and the grit frames,
 * walked over the burst's. */
const PUFF_FRAMES = ["dust_puff_0", "dust_puff_1", "dust_puff_2"];
const GRIT_FRAMES = ["ground_grit_0", "ground_grit_1"];

/** Peak opacity of a puff and of a grit cluster. The dust is meant to be felt
 * rather than looked at — it must never hide the hero standing in it. */
const PUFF_ALPHA = 0.72;
const GRIT_ALPHA = 1;

/**
 * Draw one dust burst at screen (`x`, `groundY`). Returns false when the effect
 * isn't one of ours, so the main effect pass falls through to its own kinds.
 *
 * `effect.color` is the floor's own `"r, g, b"`, `effect.intensity` the impact
 * (1 = a plain hop), and `effect.angle`/`effect.speed` the heading and pace he
 * carried through the jump.
 */
export function drawDust(
  ctx: CanvasRenderingContext2D,
  effect: Effect,
  x: number,
  groundY: number,
  timeMs: number,
  sprites: Sprites,
): boolean {
  if (!DUST_KINDS.has(effect.kind)) return false;
  const landing = effect.kind === "dustLand";
  const duration =
    effect.durationMs ?? (landing ? LANDING_DUST_MS : TAKEOFF_DUST_MS);
  const t = clamp01(1 - (effect.untilMs - timeMs) / duration);
  const seed = effect.seed ?? 0;
  const rgb = effect.color ?? "150, 145, 135";
  // A standing hop is 1; anything under a quarter of one is a step off a kerb
  // and barely stirs the floor. Capped so a talent-launched slam stays a cloud.
  const power = clamp01(((effect.intensity ?? 1) - 0.2) / 1);
  if (power <= 0) return true;

  // The smear: how far the burst is dragged along his heading. A takeoff drags
  // BACKWARD (the floor is shoved the other way as he pushes off); a landing
  // slides FORWARD, carried by the momentum he brought down with him.
  const pace = clamp01((effect.speed ?? 0) / SMEAR_REF_SPEED);
  const shape: Shape = {
    x,
    groundY: groundY + FOOT_OFFSET,
    seed,
    rgb,
    power,
    heading: effect.angle ?? 0,
    smear: pace * SMEAR_FRAC * (landing ? 1 : -1),
    reach: (landing ? LANDING_REACH : TAKEOFF_REACH) * (0.45 + 0.55 * power),
    landing,
  };

  ctx.save();
  // Order: the ring is the WEIGHT of the landing and goes down first, then the
  // grit it rakes loose, then the cloud that settles over both.
  if (landing) drawImpactRing(ctx, shape, t);
  drawGrit(ctx, shape, t, sprites);
  drawPuffs(ctx, shape, t, sprites);
  ctx.restore();
  ctx.globalAlpha = 1;
  return true;
}

/** Everything about a burst that doesn't change over its life. */
type Shape = {
  x: number;
  groundY: number;
  seed: number;
  rgb: string;
  power: number;
  heading: number;
  smear: number;
  reach: number;
  landing: boolean;
};

/** How far along the heading a thing at progress `ease` has been dragged. */
function smearAt(s: Shape, ease: number): { x: number; y: number } {
  const d = s.reach * s.smear * ease;
  return { x: Math.cos(s.heading) * d, y: Math.sin(s.heading) * d * FLATTEN };
}

/**
 * The cloud: a handful of puffs thrown out along the ground, each walking the
 * three authored frames as it grows and tears open, and drifting up as it thins.
 * Each has its own bearing, reach and start time off the seed, so no two
 * landings are the same shape and none of them reads as a ring of evenly spaced
 * blobs.
 */
function drawPuffs(
  ctx: CanvasRenderingContext2D,
  s: Shape,
  t: number,
  sprites: Sprites,
): void {
  const count = Math.max(
    2,
    Math.round(
      (s.landing ? LANDING_PUFFS : TAKEOFF_PUFFS) * (0.5 + 0.5 * s.power),
    ),
  );
  for (let i = 0; i < count; i++) {
    const n = i + s.seed * 7.31;
    // Bearings favour the two SIDES over straight up and down the screen: seen
    // from above, dust kicked toward the camera is what would cover the hero's
    // feet, and a cloud that hides the character is a cloud in the way.
    const side = fract(n * 4.11) < 0.5 ? -1 : 1;
    const ang = side * (Math.PI / 2) + (fract(n * 1.37) - 0.5) * 1.5;
    // Each puff runs its own clock, staggered so the cloud keeps blooming rather
    // than appearing whole and fading whole.
    const stagger = fract(n * 2.71) * (s.landing ? 0.32 : 0.2);
    const life = clamp01((t - stagger) / (1 - stagger));
    if (life <= 0) continue;
    const ease = 1 - (1 - life) * (1 - life); // out fast, settling
    const frame =
      PUFF_FRAMES[Math.min(2, Math.floor(life * 3))] ?? PUFF_FRAMES[0]!;
    const art = spriteByName(sprites, frame);
    if (!art) continue;
    const dist = s.reach * (0.3 + 0.7 * fract(n * 3.17)) * ease;
    const drag = smearAt(s, ease);
    const px = s.x + Math.cos(ang) * dist + drag.x;
    const py =
      s.groundY +
      Math.sin(ang) * dist * FLATTEN +
      drag.y -
      // The rise: the cloud lifts off the floor as it loses its energy. A
      // takeoff's stays low — he is going up, the dust is not.
      ease * (s.landing ? 5 : 2) * (0.5 + 0.5 * fract(n * 5.53));
    ctx.globalAlpha = PUFF_ALPHA * s.power * (1 - life * life);
    ctx.drawImage(
      tintedSprite(art, frame, s.rgb),
      Math.round(px - art.width / 2),
      Math.round(py - art.height / 2),
    );
  }
}

/**
 * The gravel: clusters of chips raked off the floor, thrown further than the
 * dust and staying crisp the whole way. This is what reads as FORCE — a cloud
 * alone is soft, and softness is not what a body meeting the ground looks like.
 * The two authored frames run in order, so the chips visibly scatter as they go.
 */
function drawGrit(
  ctx: CanvasRenderingContext2D,
  s: Shape,
  t: number,
  sprites: Sprites,
): void {
  const count = Math.max(
    1,
    Math.round((s.landing ? LANDING_GRIT : TAKEOFF_GRIT) * s.power),
  );
  for (let i = 0; i < count; i++) {
    const n = i + s.seed * 3.77 + 11;
    const life = clamp01(t / 0.75);
    if (life >= 1) return;
    const ease = 1 - (1 - life) * (1 - life);
    const frame = GRIT_FRAMES[life < 0.45 ? 0 : 1] ?? GRIT_FRAMES[0]!;
    const art = spriteByName(sprites, frame);
    if (!art) return;
    const ang =
      (fract(n * 4.11) < 0.5 ? -1 : 1) * (Math.PI / 2) +
      (fract(n * 12.9898) - 0.5) * 1.9;
    const dist =
      s.reach * GRIT_REACH_MULT * (0.4 + 0.8 * fract(n * 7.7)) * ease;
    const drag = smearAt(s, ease);
    // Up on the way out and down on the way back — chips thrown, not chips slid.
    const hop = Math.sin(life * Math.PI) * (2 + 4 * fract(n * 3.1));
    ctx.globalAlpha = GRIT_ALPHA * (1 - life * life);
    ctx.drawImage(
      tintedSprite(art, frame, s.rgb),
      Math.round(s.x + Math.cos(ang) * dist + drag.x - art.width / 2),
      Math.round(
        s.groundY +
          Math.sin(ang) * dist * FLATTEN +
          drag.y -
          hop -
          art.height / 2,
      ),
    );
  }
}

/**
 * The landing's opening beat: a flat ring of displaced floor snapping outward
 * from under his boots over the first third of the effect, under everything
 * else. Short and sharp — it is the WEIGHT of the landing, and the cloud is its
 * aftermath.
 */
function drawImpactRing(
  ctx: CanvasRenderingContext2D,
  s: Shape,
  t: number,
): void {
  const RING_END = 0.35;
  if (t > RING_END) return;
  const ring = t / RING_END;
  const r = s.reach * (0.3 + 0.9 * (1 - (1 - ring) * (1 - ring)));
  ctx.globalAlpha = 0.5 * s.power * (1 - ring);
  ctx.strokeStyle = `rgb(${s.rgb})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(s.x, s.groundY, r, Math.max(1, r * FLATTEN), 0, 0, Math.PI * 2);
  ctx.stroke();
}
