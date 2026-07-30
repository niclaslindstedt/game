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
// **FOUR THINGS LAND, AND THEY ARE FOUR DIFFERENT ANSWERS TO ONE BLOW.** The
// CLOUD is the body of colour the hit put in the air — a wash of the family's own
// colour, drawn under everything, and the thing that makes a landed blow read
// before a single drop has moved. The WOUND is the splash pinned to the point of
// impact. The DROPS are the liquid thrown out of it. The HAZE is what those
// leave behind them. Only the cloud is drawn from a baked glow rather than
// authored art, for the reason given on `drawCloud`.
//
// **AND THE SAME SPRAY SERVES FOUR KINDS OF BODY.** A ghost, a machine and a
// rift-thing throw the identical shapes in their own colours — every frame here
// is re-hued through the family's ramp (`render/recolor.ts`) rather than
// authored a second, third and fourth time, which would be sixty sprites to keep
// in step for ever. What is NOT shared is the AIR: the haze a body leaves is a
// red mist, a machine's is smoke that climbs and lingers, a haunting's is a puff
// that spreads and is gone, a rift-thing's is a glimmer that barely moves. That
// is the cheapest of the differences and the one that names the family from
// across a room, which is why it is the one thing with a table of its own below.
//
// The drops are drawn as they FLY. Where they land is not this module's problem:
// `bloodSpills` (blood-hit.ts, beside the rule that priced the blow) says which
// patches of floor get wetted and `./blood-ground.ts` soaks them into its tile
// grid — off the SAME seed and the SAME cone, so the stains sit under the drops
// that made them.

import { spriteByName, type Sprites } from "../assets.ts";
import {
  SPRAY_CONE,
  SPRAY_FLATTEN,
  type BloodBlow,
} from "../game-screen/blood-hit.ts";
import {
  goreFamily,
  type GoreAir,
  type GoreFamily,
} from "../game-screen/gore.ts";
import { glowSprite } from "./caches.ts";
import { recolorSprite } from "./recolor.ts";
import { clamp01, fract } from "./shared.ts";
import { projectOffset } from "./tilt.ts";
import type { Effect } from "./effects.ts";

/** The effect kind this module owns. */
export const BLOOD_KINDS = new Set(["blood"]);

/** How long a spray runs (ms). Short — it is the punctuation on a hit, not a
 * thing to watch; what lasts is the mark it leaves on the floor. */
export const BLOOD_SPRAY_MS = 380;

/**
 * WHERE A DROP IS ON SCREEN, given how far it has travelled ACROSS THE FLOOR.
 *
 * The travel is worked out in the WORLD first — an ellipse on the floor
 * (`SPRAY_FLATTEN`), which is the shape of a blade's arc rather than anything to
 * do with the camera — and then projected, so the drops fly over the very stains
 * they made (`bloodSpills`, off the same seed and the same cone). Skipping the
 * projection had them flying along the SCREEN's axes while their spatter landed on
 * the turned floor; see `projectOffset`.
 *
 * The HOP is deliberately not part of this: that is the drop rising off the floor
 * and falling back to it, a true vertical on screen.
 */
function groundTravel(ang: number, dist: number): { x: number; y: number } {
  return projectOffset(
    Math.cos(ang) * dist,
    Math.sin(ang) * dist * SPRAY_FLATTEN,
  );
}

/** World px ABOVE the recorded point the wound sits. The event carries the
 * mob's centre; blood coming off its feet reads as a puddle it is standing in. */
const WOUND_LIFT = 3;

/** The wound's own frames, in order, and the FORCE each needs before it is
 * reached — how torn open a wound is, is a question about the blow, not about
 * how much blood came out of it.
 *
 * The chain runs from a tight splash to a full gore detonation, and it is what
 * makes the top of the overkill range READ: a 16 px ring is the right picture
 * for a solid kill and the wrong one for a blow a hundred times a body's health,
 * so past a point the wound stops being a splash and becomes `blood_burst_*` —
 * a 40 px core with the whole body's worth thrown out along its lobes. A light
 * hit never gets past the first frame. */
const WOUND_FRAMES = [
  "blood_hit_0",
  "blood_hit_1",
  "blood_hit_2",
  "blood_burst_0",
  "blood_burst_1",
  "blood_burst_2",
];
const WOUND_FRAME_FORCE = [0, 0.45, 0.9, 1.6, 3, 6];

/** The droplets, smallest first — a blow picks how far up this list it may
 * reach, so a harder hit throws visibly bigger pieces. */
const DROP_FRAMES = [
  "blood_drop_0",
  "blood_drop_1",
  "blood_drop_2",
  "blood_drop_3",
  // The last two are PIECES rather than droplets, and a blow only throws them
  // once it is violent enough to tear them loose (`CHUNK_FORCE`).
  "blood_chunk_0",
  "blood_chunk_1",
];
const CHUNK_FRAMES = 2;
/** Force at which a blow stops throwing beads and starts throwing pieces. */
const CHUNK_FORCE = 1.6;
const MIST_FRAMES = ["blood_mist_0", "blood_mist_1", "blood_mist_2"];

/** How high a droplet arcs, as a fraction of how far it travels. */
const DROP_ARC = 0.34;

/** THE CLOUD's counts, reach, size and weight. `CLOUD_BASE` is above zero on
 * purpose: every connecting blow puts SOMETHING in the air, which is the same
 * rule the drops' own floor follows (a chip finish must not read as a miss).
 * The reach is a fraction of the SPRAY's — the cloud is what the drops came out
 * of, so it has to stay behind them or it reads as a second, slower spray. And
 * the alpha is FAINT: this is a wash the fight is seen THROUGH, and a solid one
 * hides the mob being hit, which is the one thing a hit effect may never do. It
 * sits deliberately at the edge of legibility — the cloud's job is to say a blow
 * landed and what colour the thing bled, not to be looked at, and pushed any
 * higher it starts competing with the splash and the pieces that are the actual
 * read. */
const CLOUD_BASE = 3;
const CLOUD_PER_VOLUME = 5;
const CLOUD_PER_FORCE = 2;
const CLOUD_MAX = 18;
const CLOUD_REACH_FRAC = 0.42;
const CLOUD_RADIUS_BASE = 6.5;
const CLOUD_RADIUS_PER_FORCE = 4.2;
const CLOUD_ALPHA = 0.23;

/** The ONE radius every cloud puff's glow is baked at, whatever size it is
 * drawn. A gradient carries no pixels to resample, so this is a resolution
 * rather than a size — big enough that a puff on a monstrous blow is stretched
 * from plenty of samples, small enough to be a rounding error in memory. */
const CLOUD_BAKE_RADIUS = 64;

/**
 * THE CLOUD'S OWN CONE, AND IT IS MUCH TIGHTER THAN THE DROPS'.
 *
 * The drops spread across `SPRAY_CONE` — 1.25 rad, a 143° fan — because they
 * come off a blade's ARC, which sweeps across the hero rather than away from
 * him. The cloud is a different thing: it is what was atomized AT the point of
 * impact, and it goes where the blow went. Thrown down the drops' fan it came
 * out as a disc centred on the body — a lamp switching on rather than something
 * being opened — which is the whole reason it read as "a perfect circle".
 */
const CLOUD_CONE = 0.5;

/** How far DOWNRANGE the cloud's centre of mass sits, as a fraction of its own
 * reach. The mist is in front of the wound, not around it; without this the
 * cone alone still leaves a puff sitting on top of the body. */
const CLOUD_LEAD = 0.62;

/** A puff is an ELLIPSE — long down the blow's bearing, squat across it. A
 * round puff cannot say which way the blow went however far downrange it is
 * thrown, and four round puffs in a line still read as four round puffs. */
const CLOUD_LONG = 1.5;
const CLOUD_SHORT = 0.66;

/**
 * THE DOUBLE GLOW. One colour is a light; two are a substance.
 *
 * The BODY is the family's colour taken down into its own shadow and the CORE
 * is the same colour lifted toward its highlight, drawn smaller and inside it.
 * That gives the puff a dense middle falling off to a dark rim — what a mouthful
 * of atomized liquid actually looks like — instead of the single flat wash that
 * made it read as a coloured bulb. Both are derived from `GoreFamily.cloud`
 * rather than authored, so a machine's oil and a rift-thing's light get the
 * treatment for free, and so does whatever a MOD adds.
 */
const CLOUD_DEEP = 0.68;
const CLOUD_HOT = 1.5;
const CORE_FRAC = 0.5;
const CORE_ALPHA = 0.85;

/**
 * THE GRIT, and the reason the cloud stops being an airbrush.
 *
 * A gradient is too clean to be liquid. What leaves a wound is a shower of
 * DROPLETS, and at this resolution the honest picture of that is hard little
 * squares — no gradient, no smoothing, landed on the pixel grid the rest of the
 * game is drawn on. They fly further than the puffs (they are the leading edge
 * of the same spray) and they alternate between the two tones, so the cloud has
 * speckle IN it rather than a smooth field with a border.
 */
const SPECKS_PER_PUFF = 5;
const SPECK_ALPHA = 0.8;
const SPECK_REACH = 1.6;

/** `rgb` scaled about its own brightness, clamped — the two tones the double
 * glow is drawn in, and the speck colours. */
function shade(rgb: string, mul: number): string {
  return rgb
    .split(",")
    .map((v) => Math.max(0, Math.min(255, Math.round(Number(v.trim()) * mul))))
    .join(", ");
}

/**
 * WHAT HANGS IN THE AIR AFTERWARDS, per family — the one part of the spray that
 * is not a palette swap, because what a mess does after it stops moving is most
 * of what kind of mess it is.
 *
 * `rise` is world px the cloud drifts UP over its life (a true screen vertical —
 * it is going up, not away), `spread` how far out from the wound it carries as a
 * fraction of the spray's own reach, `life` how long it hangs as a multiple of
 * the spray, and `alpha` how solid it starts.
 *
 * Read the four rows against each other and the families are already distinct
 * without a single new sprite: blood's haze barely rises and is gone with the
 * drops; a machine's SMOKE climbs three times as far and outlives the burst that
 * made it; a haunting's PUFF blows outward and evaporates fastest of all; and a
 * rift-thing's GLIMMER hardly moves at all — it just hangs where the body was
 * and goes out.
 */
const AIR: Record<
  GoreAir,
  { rise: number; spread: number; life: number; alpha: number }
> = {
  haze: { rise: 6, spread: 0.55, life: 1, alpha: 0.55 },
  smoke: { rise: 18, spread: 0.4, life: 1.9, alpha: 0.5 },
  puff: { rise: 9, spread: 0.85, life: 0.75, alpha: 0.6 },
  glimmer: { rise: 3, spread: 0.5, life: 1.5, alpha: 0.7 },
};

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
  // WHAT THIS BODY WAS MADE OF. Every frame below is asked for through it, so a
  // ghost's spray is the same spray in green and a machine's smoke climbs.
  const family = goreFamily(effect.family);

  ctx.save();
  // The CLOUD goes down FIRST, under everything: it is the body of colour the
  // blow put in the air, and the drops and pieces fly through it rather than
  // behind it.
  drawCloud(ctx, blow, family, x, wy, t, seed, heading);
  drawWound(ctx, blow, family, x, wy, t, seed, sprites);
  drawDrops(ctx, blow, family, x, wy, t, seed, heading, sprites);
  // Last, over everything: the grit hangs in the AIR in front of the wound (see
  // `drawSpecks` — under the splash it is invisible, which is where it started).
  drawSpecks(ctx, blow, family, x, wy, t, seed, heading);
  drawMist(ctx, blow, family, x, wy, t, seed, heading, sprites);
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
/** One frame of the spray, in this family's colours. Blood's ramp is null, so
 * its own art comes back untouched rather than round-tripping through a re-hue
 * that is very nearly — but not exactly — the identity. */
function frame(
  sprites: Sprites,
  name: string,
  family: GoreFamily,
): ImageBitmap | HTMLCanvasElement | undefined {
  const art = spriteByName(sprites, name);
  if (!art || !family.ramp) return art;
  return recolorSprite(art, name, family.ramp);
}

function drawWound(
  ctx: CanvasRenderingContext2D,
  blow: BloodBlow,
  family: GoreFamily,
  x: number,
  y: number,
  t: number,
  seed: number,
  sprites: Sprites,
): void {
  let frames = 1;
  while (
    frames < WOUND_FRAMES.length &&
    blow.force >= (WOUND_FRAME_FORCE[frames] ?? Infinity)
  ) {
    frames++;
  }
  const WOUND_END = 0.72;
  if (t >= WOUND_END) return;
  const life = t / WOUND_END;
  const index = Math.min(frames - 1, Math.floor(life * frames));
  const name = WOUND_FRAMES[index] ?? WOUND_FRAMES[0]!;
  const art = frame(sprites, name, family);
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
 * THE CLOUD — the body of colour a blow puts in the air, and the thing that
 * makes a landed hit read at a glance before a single drop has travelled
 * anywhere.
 *
 * It is the one part of a spray that is NOT authored art, and deliberately: what
 * it is drawing is atomized liquid with no shape of its own, and pixel art is
 * exactly the wrong tool for a soft edge. So it is a handful of puffs of ONE
 * BAKED radial glow (`glowSprite`) thrown along the very same cone the drops fly
 * down, blooming and thinning — a spray-can puff rather than a ball, because a
 * cloud centred on the body reads as a smoke bomb going off inside it.
 *
 * **THE BAKE IS ONE FIXED SIZE AND THE PUFFS ARE SCALED TO IT.** A gradient is
 * scale-invariant, so this costs nothing in fidelity — and the alternative is
 * the bug this replaced: the puff's radius grows with its own animation clock,
 * so asking `glowSprite` for it baked a fresh gradient per puff per FRAME into a
 * cache nothing empties within a session. It read as a memory leak everywhere
 * BUT here — the tab past 280 MB, the browser dropping canvas backing stores,
 * and every label in the game (the pixel font is a cached canvas) going blank
 * over a level-up box while the sprites beside them drew fine.
 *
 * **IT IS COMPOSITED WITH PLAIN ALPHA, NEVER `lighter`,** and that is the whole
 * reason one pass serves four families. Additive is the obvious choice for a
 * glow and it is wrong here: a machine's cloud is near-black, and adding black
 * to a floor is drawing nothing at all. Plain alpha lets red, green and violet
 * lie over the ground as colour AND lets the oily one genuinely DARKEN it, which
 * is what a puff of burnt machine should do.
 *
 * Every blow gets one, however light — `CLOUD_BASE` is what stops a chip finish
 * from landing dry — and it grows with the blow like everything else here.
 */
function drawCloud(
  ctx: CanvasRenderingContext2D,
  blow: BloodBlow,
  family: GoreFamily,
  x: number,
  y: number,
  t: number,
  seed: number,
  heading: number,
): void {
  const air = AIR[family.air];
  const puffs = Math.min(
    CLOUD_MAX,
    Math.round(
      (CLOUD_BASE +
        CLOUD_PER_VOLUME * blow.volume +
        CLOUD_PER_FORCE * blow.force) *
        blow.body,
    ),
  );
  // TWO bakes per family colour, for the whole game, ever — then SCALED and
  // ROTATED per puff below. A radial gradient is scale-invariant (both stops
  // are linear in r), so a bake stretched to size S is the same picture as a
  // bake made at S; asking `glowSprite` for the live radius instead baked a new
  // gradient per puff per FRAME into a cache nothing empties, which is what put
  // the tab past 280 MB and started the browser evicting the pixel font's own
  // canvases. See `glowSize`.
  const body = glowSprite(shade(family.cloud, CLOUD_DEEP), CLOUD_BAKE_RADIUS);
  const core = glowSprite(shade(family.cloud, CLOUD_HOT), CLOUD_BAKE_RADIUS);
  if (!body || !core) return;
  // WHICH WAY THE BLOW WENT, ON SCREEN. The bearing is a direction across the
  // FLOOR, and the floor is foreshortened and possibly turned — so the angle to
  // rotate a puff by is the projected step's own angle, not the world one. Under
  // a yaw the two differ by up to 45°, which is the difference between a spray
  // leaning the way the blade swung and one leaning across it.
  const step = groundTravel(heading, 1);
  const screenAng = Math.atan2(step.y, step.x);
  // The one surface in the game that WANTS smoothing: this is atomized liquid
  // with no shape of its own, and a nearest-neighbour upscale of a gradient
  // draws it as concentric bands. Every other pass here is pixel art and stays
  // crisp — so the flag is flipped for these blits alone and put straight back.
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  for (let i = 0; i < puffs; i++) {
    const n = i + seed * 5.11 + 23;
    // Each puff blooms on its own stagger, so the cloud SWELLS out of the wound
    // over the first third of the spray instead of appearing whole.
    const stagger = fract(n * 3.29) * 0.28;
    const raw = (t - stagger) / (1 - stagger) / air.life;
    const life = clamp01(raw);
    if (raw <= 0 || life >= 1) continue;
    const ease = 1 - (1 - life) * (1 - life);
    // WHERE THE PUFF SITS: a lead straight DOWNRANGE plus a scatter inside the
    // cloud's own tight cone. Two terms rather than one, because the lead is
    // what stops the cloud sitting on the body and the scatter is what stops it
    // being a single blob out in front of it.
    const reach = blow.reach * CLOUD_REACH_FRAC * ease;
    const lead = groundTravel(heading, reach * CLOUD_LEAD);
    const ang = heading + (fract(n * 1.53) - 0.5) * 2 * CLOUD_CONE;
    const off = groundTravel(ang, reach * (0.15 + 0.85 * fract(n * 2.37)));
    const px = x + lead.x + off.x;
    // It drifts UP as it thins, a true screen vertical like the drops' hop.
    const py = y + lead.y + off.y - ease * air.rise * 0.6;
    // A cloud EXPANDS as it thins — the one thing about it that has to be a
    // scale rather than a frame, since a baked gradient has no pixels to
    // resample and is the one surface in the game where smoothness is the point.
    const size = Math.max(2, cloudPuffRadius(blow, ease, n) * 2);
    const fade = (1 - life) * (1 - life);
    // The puff, drawn as an ELLIPSE down the bearing: dark body first, hot core
    // inside it. Two glows at once is what gives it a substance rather than a
    // colour — see CLOUD_DEEP / CLOUD_HOT.
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(screenAng);
    ctx.scale(CLOUD_LONG, CLOUD_SHORT);
    ctx.globalAlpha = CLOUD_ALPHA * fade;
    ctx.drawImage(body, -size / 2, -size / 2, size, size);
    const inner = size * CORE_FRAC;
    ctx.globalAlpha = CLOUD_ALPHA * fade * CORE_ALPHA;
    ctx.drawImage(core, -inner / 2, -inner / 2, inner, inner);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = smoothing;
}

/**
 * THE GRIT — the atomized droplets themselves, and the reason the cloud stops
 * reading as an airbrush.
 *
 * A gradient is too clean to be liquid. What comes off a wound is a SHOWER, and
 * at this resolution the honest picture of a droplet is a hard little square on
 * the pixel grid the rest of the game is drawn on — no gradient, no smoothing,
 * no soft edge.
 *
 * **IT IS DRAWN LAST, OVER THE DROPS, AND THAT IS THE WHOLE POINT.** The wash it
 * belongs to goes UNDER everything (a cloud over the mob would hide the thing
 * being hit, which is the one thing a hit effect may never do) — but a speck is
 * a droplet hanging in the AIR in front of the wound, and buried under the
 * splash it may as well not be drawn at all. That was the first attempt, and the
 * grit was invisible in every frame of it.
 *
 * They fly further than the wash and they alternate between its two tones, so
 * the cloud has speckle carried out past its own edge rather than a smooth field
 * with a hard border.
 */
function drawSpecks(
  ctx: CanvasRenderingContext2D,
  blow: BloodBlow,
  family: GoreFamily,
  x: number,
  y: number,
  t: number,
  seed: number,
  heading: number,
): void {
  const air = AIR[family.air];
  const puffs = Math.min(
    CLOUD_MAX,
    Math.round(
      (CLOUD_BASE +
        CLOUD_PER_VOLUME * blow.volume +
        CLOUD_PER_FORCE * blow.force) *
        blow.body,
    ),
  );
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const deep = `rgb(${shade(family.cloud, CLOUD_DEEP)})`;
  const hot = `rgb(${shade(family.cloud, CLOUD_HOT)})`;
  for (let i = 0; i < puffs; i++) {
    const n = i + seed * 5.11 + 23;
    const stagger = fract(n * 3.29) * 0.28;
    const raw = (t - stagger) / (1 - stagger) / air.life;
    const life = clamp01(raw);
    if (raw <= 0 || life >= 1) continue;
    const ease = 1 - (1 - life) * (1 - life);
    const reach = blow.reach * CLOUD_REACH_FRAC * ease;
    const lead = groundTravel(heading, reach * CLOUD_LEAD);
    for (let s = 0; s < SPECKS_PER_PUFF; s++) {
      const m = n * 7.71 + s * 3.17;
      const ang = heading + (fract(m * 1.13) - 0.5) * 2 * CLOUD_CONE;
      const off = groundTravel(
        ang,
        reach * SPECK_REACH * (0.2 + 0.9 * fract(m * 2.71)),
      );
      ctx.fillStyle = fract(m * 5.39) < 0.5 ? deep : hot;
      ctx.globalAlpha = SPECK_ALPHA * (1 - life) * (1 - life);
      // A speck is 1 px until the blow is worth more, then 2 — the same "say it
      // with the art, not with a scale" rule the wound's frame chain follows.
      const px = blow.force > 1 && fract(m * 8.13) < 0.4 ? 2 : 1;
      ctx.fillRect(
        Math.round(x + lead.x + off.x),
        Math.round(y + lead.y + off.y - ease * air.rise * 0.8),
        px,
        px,
      );
    }
  }
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = smoothing;
}

/**
 * How wide a single puff stands, in world px, at `ease` through its life.
 *
 * A puff SWELLS as it thins, and that growth has to be a scale of one baked
 * gradient rather than a gradient baked per size — see `drawCloud`. Kept as a
 * pure function so the growth curve is testable, and so the thing that made
 * this a memory leak (feeding a per-frame value to a cache keyed on it) stays
 * visibly separate from the bake.
 */
export function cloudPuffRadius(
  blow: BloodBlow,
  ease: number,
  n: number,
): number {
  return (
    (CLOUD_RADIUS_BASE + CLOUD_RADIUS_PER_FORCE * blow.force) *
    blow.body *
    (0.5 + 0.9 * ease) *
    (0.45 + 1.15 * fract(n * 4.91))
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
  family: GoreFamily,
  x: number,
  y: number,
  t: number,
  seed: number,
  heading: number,
  sprites: Sprites,
): void {
  // How far up the droplet list this blow may reach: a nick throws only beads, a
  // blow that opens a body up tears gobbets loose. VOLUME, not force — the size
  // of a piece of gore is about how much of the body came away with it.
  // VOLUME picks how far up the BEADS this blow reaches — the size of a piece
  // of gore is about how much of the body came away with it. The two CHUNK
  // frames on the end are unlocked by force instead: they are what a body burst
  // rather than cut throws.
  const beads = DROP_FRAMES.length - CHUNK_FRAMES;
  const biggest = Math.min(
    DROP_FRAMES.length - 1,
    Math.floor(blow.volume * beads) + (blow.force >= CHUNK_FORCE ? 2 : 0),
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
    const art = frame(
      sprites,
      DROP_FRAMES[Math.round(fract(n * 5.53) * biggest)] ?? DROP_FRAMES[0]!,
      family,
    );
    if (!art) continue;
    // Up on the way out and down into the floor on the way back — thrown, not
    // slid. The arc grows with the throw, so the far ones sail.
    const hop = Math.sin(life * Math.PI) * dist * DROP_ARC;
    const at = groundTravel(ang, dist);
    ctx.globalAlpha = 1 - life * life * life;
    ctx.drawImage(
      art,
      Math.round(x + at.x - art.width / 2),
      Math.round(y + at.y - hop - art.height / 2),
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
  family: GoreFamily,
  x: number,
  y: number,
  t: number,
  seed: number,
  heading: number,
  sprites: Sprites,
): void {
  const air = AIR[family.air];
  for (let i = 0; i < blow.mist; i++) {
    const n = i + seed * 3.77 + 11;
    const stagger = fract(n * 2.11) * 0.3;
    // A family that hangs LONGER than the spray runs its cloud on a slower clock
    // than the drops', so a machine is still smoking after the last piece of it
    // has landed. `life` is clamped, so a slow cloud simply has not finished
    // when a fast one has.
    const rawLife = (t - stagger) / (1 - stagger) / air.life;
    const life = clamp01(rawLife);
    if (rawLife <= 0 || life >= 1) continue;
    const ease = 1 - (1 - life) * (1 - life);
    // The cloud widens as it thins, and a more violent blow starts further up
    // the chain — a burst atomizes a body over a far wider area than a cut does.
    const wide = blow.force >= CHUNK_FORCE ? 1 : 0;
    const art = frame(
      sprites,
      MIST_FRAMES[
        Math.min(MIST_FRAMES.length - 1, wide + (life < 0.5 ? 0 : 1))
      ] ?? MIST_FRAMES[0]!,
      family,
    );
    if (!art) continue;
    const ang = heading + (fract(n * 1.91) - 0.5) * 2 * SPRAY_CONE;
    const dist = blow.reach * air.spread * (0.3 + 0.7 * fract(n * 4.3)) * ease;
    const at = groundTravel(ang, dist);
    ctx.globalAlpha = air.alpha * (1 - life);
    ctx.drawImage(
      art,
      Math.round(x + at.x - art.width / 2),
      // The cloud drifts UP as it thins, so its lift is a screen vertical like
      // the drops' hop — not part of the ground travel.
      Math.round(y + at.y - ease * air.rise - art.height / 2),
    );
  }
}
