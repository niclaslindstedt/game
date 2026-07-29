// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BLOOD A BLOW THROWS — the wound opening, the drops that fly out of it,
// and the haze left hanging behind them.
//
// It is the dust burst's twin (`./dust.ts`) and is built the same way: authored
// art thrown along seeded bearings, everything derived from one intensity, no
// `Math.random` anywhere in a draw (the pass runs every frame for the same `t`
// and has to come out identical each time).
//
// **The whole thing is one number: how hard the blow landed.** `bloodBlow`
// (game-screen/blood-hit.ts) prices it in the victim's own healthbars, and every
// count here reads off that — how many drops fly, how far they carry, how much
// haze hangs, and HOW FAR UP THE WOUND'S OWN FRAME CHAIN the splash gets. That
// last one is why the splash grows with the damage without a single scaled
// blit: a nick shows only the tight `blood_hit_0` blob, a solid blow carries on
// into the ragged `blood_hit_1`, and only a blow that properly opens something
// up reaches `blood_hit_2`, the torn ring coming apart. Scaling a pixel sprite
// to say the same thing would just resample the art.
//
// The drops are drawn as they FLY. Where they land is not this module's problem:
// `bloodSpills` (blood-hit.ts, beside the rule that priced the blow) says which
// patches of floor get wetted and `./blood-ground.ts` soaks them into its tile
// grid — off the SAME seed and the SAME cone, so the stains sit under the drops
// that made them.

import { spriteByName, type Sprites } from "../assets.ts";
import { SPRAY_CONE, type BloodBlow } from "../game-screen/blood-hit.ts";
import { clamp01, fract } from "./shared.ts";
import type { Effect } from "./effects.ts";

/** The effect kind this module owns. */
export const BLOOD_KINDS = new Set(["blood"]);

/** How long a spray runs (ms). Short — it is the punctuation on a hit, not a
 * thing to watch; what lasts is the mark it leaves on the floor. */
export const BLOOD_SPRAY_MS = 380;

/** The ground plane is seen at a shallow angle, so a spray spreads wider than
 * it is tall — the same squash the dust, the blood pool and every ground ring
 * use. */
const FLATTEN = 0.42;

/** World px ABOVE the recorded point the wound sits. The event carries the
 * mob's centre; blood coming off its feet reads as a puddle it is standing in. */
const WOUND_LIFT = 3;

/** The wound's own frames, in order, and the severity each needs before it is
 * reached. A light hit never gets past the first. */
const WOUND_FRAMES = ["blood_hit_0", "blood_hit_1", "blood_hit_2"];
const WOUND_FRAME_SEVERITY = [0, 0.45, 0.9];

/** The droplets, smallest first — a blow picks how far up this list it may
 * reach, so a harder hit throws visibly bigger pieces. */
const DROP_FRAMES = [
  "blood_drop_0",
  "blood_drop_1",
  "blood_drop_2",
  "blood_drop_3",
];
const MIST_FRAMES = ["blood_mist_0", "blood_mist_1"];

/** How high a droplet arcs, as a fraction of how far it travels. */
const DROP_ARC = 0.34;

/**
 * Draw one blood spray at screen (`x`, `y`) — the mob's centre. Returns false
 * when the effect isn't ours, so the main effect pass falls through to its own
 * kinds.
 */
export function drawBlood(
  ctx: CanvasRenderingContext2D,
  effect: Effect,
  x: number,
  y: number,
  timeMs: number,
  sprites: Sprites,
): boolean {
  if (!BLOOD_KINDS.has(effect.kind)) return false;
  const blow = effect.blood;
  if (!blow) return true;
  const duration = effect.durationMs ?? BLOOD_SPRAY_MS;
  const t = clamp01(1 - (effect.untilMs - timeMs) / duration);
  const seed = effect.seed ?? 0;
  const heading = effect.angle ?? 0;
  const wy = y - WOUND_LIFT;

  ctx.save();
  drawWound(ctx, blow, x, wy, t, seed, sprites);
  drawDrops(ctx, blow, x, wy, t, seed, heading, sprites);
  drawMist(ctx, blow, x, wy, t, seed, heading, sprites);
  ctx.restore();
  ctx.globalAlpha = 1;
  return true;
}

/**
 * The wound itself: the splash pinned to the point of impact, walking as far up
 * the frame chain as the blow earned. The frames it may use are shared out over
 * the spray's first two thirds, so a heavy blow's splash visibly evolves while a
 * light one's simply blooms and goes.
 */
function drawWound(
  ctx: CanvasRenderingContext2D,
  blow: BloodBlow,
  x: number,
  y: number,
  t: number,
  seed: number,
  sprites: Sprites,
): void {
  let frames = 1;
  while (
    frames < WOUND_FRAMES.length &&
    blow.severity >= (WOUND_FRAME_SEVERITY[frames] ?? Infinity)
  ) {
    frames++;
  }
  const WOUND_END = 0.72;
  if (t >= WOUND_END) return;
  const life = t / WOUND_END;
  const index = Math.min(frames - 1, Math.floor(life * frames));
  const name = WOUND_FRAMES[index] ?? WOUND_FRAMES[0]!;
  const art = spriteByName(sprites, name);
  if (!art) return;
  // A splash lands where the blow did, not dead centre on the body — nudged
  // off the middle by the seed so repeated hits don't stack one on top of the
  // other.
  const ox = Math.round((fract(seed * 1.31) - 0.5) * 5);
  const oy = Math.round((fract(seed * 2.17) - 0.5) * 5);
  ctx.globalAlpha = 1 - life * life;
  ctx.drawImage(
    art,
    Math.round(x + ox - art.width / 2),
    Math.round(y + oy - art.height / 2),
  );
}

/**
 * The drops: thrown out along the blow's heading, arcing up and back down, and
 * gone by the time they reach the floor — where their stains are already waiting
 * (`bloodSpills`, soaked in at the same moment off the same seed).
 */
function drawDrops(
  ctx: CanvasRenderingContext2D,
  blow: BloodBlow,
  x: number,
  y: number,
  t: number,
  seed: number,
  heading: number,
  sprites: Sprites,
): void {
  // How far up the droplet list this blow may reach: a nick throws only beads,
  // a heavy blow tears gobbets loose.
  const biggest = Math.min(
    DROP_FRAMES.length - 1,
    Math.floor(blow.severity * DROP_FRAMES.length),
  );
  for (let i = 0; i < blow.drops; i++) {
    const n = i + seed * 7.31;
    // Each drop runs its own clock, staggered over the spray's opening so the
    // burst keeps throwing rather than appearing whole.
    const stagger = fract(n * 2.71) * 0.22;
    const life = clamp01((t - stagger) / (1 - stagger));
    if (life <= 0 || life >= 1) continue;
    const ease = 1 - (1 - life) * (1 - life); // out fast, slowing
    const ang = heading + (fract(n * 1.37) - 0.5) * 2 * SPRAY_CONE;
    const dist = blow.reach * (0.25 + 0.75 * fract(n * 3.17)) * ease;
    const frame =
      DROP_FRAMES[Math.round(fract(n * 5.53) * biggest)] ?? DROP_FRAMES[0]!;
    const art = spriteByName(sprites, frame);
    if (!art) continue;
    // Up on the way out and down into the floor on the way back — thrown, not
    // slid. The arc grows with the throw, so the far ones sail.
    const hop = Math.sin(life * Math.PI) * dist * DROP_ARC;
    ctx.globalAlpha = 1 - life * life * life;
    ctx.drawImage(
      art,
      Math.round(x + Math.cos(ang) * dist - art.width / 2),
      Math.round(y + Math.sin(ang) * dist * FLATTEN - hop - art.height / 2),
    );
  }
}

/**
 * The haze: what the drops leave behind them, drifting up and thinning out.
 * Only a blow worth more than a scratch makes any (`bloodBlow` zeroes the count
 * below its threshold), which is most of what tells a solid hit from a chip.
 */
function drawMist(
  ctx: CanvasRenderingContext2D,
  blow: BloodBlow,
  x: number,
  y: number,
  t: number,
  seed: number,
  heading: number,
  sprites: Sprites,
): void {
  for (let i = 0; i < blow.mist; i++) {
    const n = i + seed * 3.77 + 11;
    const stagger = fract(n * 2.11) * 0.3;
    const life = clamp01((t - stagger) / (1 - stagger));
    if (life <= 0) continue;
    const ease = 1 - (1 - life) * (1 - life);
    const frame = MIST_FRAMES[life < 0.5 ? 0 : 1] ?? MIST_FRAMES[0]!;
    const art = spriteByName(sprites, frame);
    if (!art) continue;
    const ang = heading + (fract(n * 1.91) - 0.5) * 2 * SPRAY_CONE;
    const dist = blow.reach * 0.55 * (0.3 + 0.7 * fract(n * 4.3)) * ease;
    ctx.globalAlpha = 0.55 * (1 - life);
    ctx.drawImage(
      art,
      Math.round(x + Math.cos(ang) * dist - art.width / 2),
      Math.round(
        y + Math.sin(ang) * dist * FLATTEN - ease * 6 - art.height / 2,
      ),
    );
  }
}
