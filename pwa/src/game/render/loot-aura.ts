// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RARITY AURA — what a find looks like lying on the floor, and the reason a
// player crosses a room for one.
//
// A drop used to be its icon, one warm glow, and four pixels of tier colour at
// the corners. That reads at arm's length and nowhere else: on the phone
// viewport a legendary on the far side of the field is a 16 px sprite in a
// crowd of 16 px sprites, and the whole chase — the thing the entire loot ladder
// exists to pay out — arrives with no more presence than a medkit.
//
// So the presentation is a LADDER, climbed one layer at a time, each layer
// gated on the tier's own rank (`TIER_RANK`) and every one of them lit in the
// tier's own colour (`TIER_RGB`) — the same colour the item's NAME is written
// in, so what the floor promises and what the card says are the same claim:
//
//   trash / regular — the plain warm halo it always had. Nothing is added, and
//                     that is the point: the ladder needs a floor to climb off.
//   magic           — the halo takes the tier colour, and a pool of light
//                     settles on the ground under the piece.
//   rare            — SMOKE. Wisps rise off it and fade out overhead.
//   set             — thicker smoke, a wider pool.
//   unique          — a LIGHT SHAFT stands over it (D2's beam: the single most
//                     legible "something happened over there" in the genre).
//   legendary       — motes orbit it.
//   artifact        — a ground ring pulses out of it, on top of everything else.
//
// THREE RULES HOLD THE WHOLE FILE TOGETHER.
//
// 1. IT IS CLOSED-FORM, NOT SIMULATED. Every wisp, mote and pulse is a pure
//    function of the render clock and the item's id — the canopy and fauna rule.
//    So the aura costs the simulation nothing, adds nothing to a save, cannot
//    desync a replay, and a floor with forty finds on it allocates not one
//    object per frame.
// 2. THE LIGHT IS BAKED, NOT BUILT. Gradients come from the (rgb, size)-keyed
//    caches; the pulse is `globalAlpha` over a baked sprite. Building a
//    CanvasGradient per item per frame is the most expensive thing a
//    loot-covered floor can do, and it is exactly what this replaced.
// 3. IT NEVER HIDES THE FIGHT. Everything is drawn UNDER the icon and stays
//    translucent, and the beam thins as it rises. A player must be able to see
//    the mob standing on the loot.

import type { Tier } from "@game/core";

import { TIER_RANK, TIER_RGB } from "../tiers.ts";
import { beamSprite, glowSprite } from "./caches.ts";
import type { Effect } from "./effects.ts";
import { clamp01, fract } from "./shared.ts";

/** The ground plane is seen at a shallow angle, so anything lying ON it is
 * wider than it is tall. The same squash the blood pools and dust rings use. */
const FLATTEN = 0.42;

/** Rank gates. Read them as the ladder in the header — a layer is drawn from
 * its rank upward, so `artifact` wears every one of them at once. */
const RANK_POOL = TIER_RANK.magic;
const RANK_SMOKE = TIER_RANK.rare;
const RANK_BEAM = TIER_RANK.unique;
const RANK_MOTES = TIER_RANK.legendary;
const RANK_RING = TIER_RANK.artifact;

/** How many wisps a rank throws, and how long one takes to rise and fade. The
 * count climbing with rank is most of what makes a legendary read as "more"
 * than a rare without any layer being brighter. */
const SMOKE_PERIOD_MS = 1700;
const SMOKE_RISE_PX = 34;
const SMOKE_DRIFT_PX = 8;

/** A stable 0..1 fraction off two integers — the id-hash idiom the menu bobs
 * its icons with. Every per-wisp constant (its phase, its bearing, its size)
 * comes from here, so the same drop smokes identically every frame and two
 * drops side by side never smoke in lockstep. */
function hash01(a: number, b: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * How much spectacle a find of `tier` earns: its rank on the rarity ladder and
 * the colour every layer is lit in. Split out from the drawing so the effects
 * gallery, a test, or a future minimap pip can ask the same question.
 */
export type LootAura = { rank: number; rgb: string };

export function lootAuraFor(tier: Tier): LootAura {
  return { rank: TIER_RANK[tier], rgb: TIER_RGB[tier] };
}

/** Wisps at `rank` — 2 at rare, one more per rung, so an artifact fumes. */
function smokeCount(rank: number): number {
  return 3 + 2 * (rank - RANK_SMOKE);
}

/**
 * Draw everything that belongs UNDER the item's icon: the pool on the ground,
 * the beam standing over it, and the halo behind it. `cx`/`cy` are the drop's
 * screen position, `width` its icon's width (every size is derived from it, so
 * a big weapon carries a bigger aura than a ring does).
 */
export function drawLootAuraUnder(
  ctx: CanvasRenderingContext2D,
  aura: LootAura,
  id: number,
  cx: number,
  cy: number,
  width: number,
  timeMs: number,
): void {
  const { rank, rgb } = aura;
  // The halo, and the one layer every drop gets. Brighter up the ladder, but
  // only by a little — rarity is told by the LAYERS, not by turning one of them
  // up until it blooms out.
  const breath = 0.5 + 0.5 * Math.sin(timeMs / 240 + id);
  const halo = glowSprite(rgb, Math.round(width * (0.95 + rank * 0.12)));
  if (halo) {
    ctx.globalAlpha = 0.32 + 0.05 * rank + 0.16 * breath;
    ctx.drawImage(
      halo,
      cx - Math.round(halo.width / 2),
      cy - Math.round(halo.height / 2),
    );
    ctx.globalAlpha = 1;
  }

  // The pool: the floor under a named find is LIT. A flattened glow rather
  // than a stroked ellipse — a stroked ring on the ground reads as a debug
  // overlay, which is what the boss telegraphs had to be talked out of.
  if (rank >= RANK_POOL) {
    const pool = glowSprite(rgb, Math.round(width * (1.1 + rank * 0.3)));
    if (pool) {
      ctx.save();
      ctx.globalAlpha = 0.16 + 0.05 * rank + 0.07 * breath;
      ctx.translate(cx, cy + 3);
      ctx.scale(1, FLATTEN);
      ctx.drawImage(
        pool,
        -Math.round(pool.width / 2),
        -Math.round(pool.height / 2),
      );
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // THE BEAM, and it is drawn TWICE — a wide soft flare with a narrow bright
  // core standing inside it. One column alone cannot be both: made wide enough
  // to glow it stops reading as a beam and becomes more halo, and made narrow
  // enough to read it lights nothing. Two passes give the shaft a hard middle
  // and a soft edge, which is what a beam of light in a dusty room looks like.
  // It rises from the FLOOR rather than from the icon's middle, so the item
  // reads as standing in the light instead of wearing it.
  if (rank >= RANK_BEAM) {
    const height = 46 + (rank - RANK_BEAM) * 14;
    const flare = beamSprite(rgb, Math.round(width * 1.3), height);
    if (flare) {
      ctx.globalAlpha = 0.26 + 0.04 * (rank - RANK_BEAM) + 0.08 * breath;
      ctx.drawImage(flare, cx - Math.round(flare.width / 2), cy + 3 - height);
    }
    const core = beamSprite(rgb, Math.max(3, Math.round(width * 0.3)), height);
    if (core) {
      ctx.globalAlpha = 0.6 + 0.06 * (rank - RANK_BEAM) + 0.16 * breath;
      ctx.drawImage(core, cx - Math.round(core.width / 2), cy + 3 - height);
    }
    ctx.globalAlpha = 1;
  }

  // The artifact's ground ring: a pulse rolling out of the find and fading at
  // its rim, once every couple of seconds. The top of the ladder gets the one
  // layer that MOVES outward, which is what makes it catch an eye that is
  // looking somewhere else.
  if (rank >= RANK_RING) {
    const t = fract(timeMs / 2000 + hash01(id, 7));
    const spread = width * (0.8 + t * 2.4);
    const ring = glowSprite(rgb, Math.round(spread));
    if (ring) {
      ctx.save();
      ctx.globalAlpha = 0.42 * (1 - t) * (1 - t);
      ctx.translate(cx, cy + 3);
      ctx.scale(1, FLATTEN);
      ctx.drawImage(
        ring,
        -Math.round(ring.width / 2),
        -Math.round(ring.height / 2),
      );
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
}

/**
 * Draw everything that belongs OVER the item's icon: the smoke rising off it
 * and the motes orbiting it. Called after the icon so the wisps pass in front
 * of the piece on their way up, which is what stops them reading as a static
 * decal painted behind it.
 */
export function drawLootAuraOver(
  ctx: CanvasRenderingContext2D,
  aura: LootAura,
  id: number,
  cx: number,
  cy: number,
  width: number,
  timeMs: number,
): void {
  const { rank, rgb } = aura;

  // THE SMOKE. Each wisp is a soft blob that rises, drifts sideways on its own
  // bearing, swells as it goes and fades to nothing at the top — the phase is
  // `fract(t/period + phase)`, so a wisp is BORN the instant the one before it
  // dies and the column never stalls or restarts.
  if (rank >= RANK_SMOKE) {
    const wisps = smokeCount(rank);
    for (let i = 0; i < wisps; i++) {
      const phase = hash01(id, i);
      const t = fract(timeMs / SMOKE_PERIOD_MS + phase);
      // Fade in over the first quarter, then out LINEARLY over the rest. A
      // squared fade puts nearly all of a wisp's life in its first few px,
      // which is exactly where the halo already is — the plume only reads if
      // the wisps are still visible at head height.
      const alpha = Math.min(1, t * 4) * (1 - t);
      if (alpha < 0.02) continue;
      const lean = (hash01(id, i + 32) - 0.5) * 2;
      const x = cx + lean * SMOKE_DRIFT_PX * t;
      const y = cy - 2 - t * SMOKE_RISE_PX;
      // Small and getting bigger as it climbs. Kept SMALL on purpose: a wisp
      // the width of the icon is not a wisp, it is a second halo, and a column
      // of them is the haze this replaced.
      const size = width * (0.22 + 0.5 * t) * (0.7 + 0.5 * hash01(id, i + 64));
      const puff = glowSprite(rgb, 12);
      if (!puff) continue;
      ctx.globalAlpha = alpha * (0.6 + 0.05 * rank);
      ctx.drawImage(puff, x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  // THE MOTES: two bright specks orbiting the find on a squashed ellipse, one
  // opposite the other. Drawn as flat pixels rather than as glows — after five
  // layers of soft light the piece needs something with a hard edge on it or
  // the whole thing turns to fog.
  if (rank >= RANK_MOTES) {
    const speed = timeMs / 900 + hash01(id, 3) * Math.PI * 2;
    for (let i = 0; i < 2; i++) {
      const angle = speed + i * Math.PI;
      const x = Math.round(cx + Math.cos(angle) * width * 0.75);
      const y = Math.round(cy + Math.sin(angle) * width * 0.75 * FLATTEN - 1);
      // Behind the item on the far half of the orbit, in front on the near
      // half — the near pass is the bright one, so the orbit reads as 3D.
      const near = Math.sin(angle) > 0;
      ctx.globalAlpha = near ? 0.95 : 0.4;
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
}

/** How long the arrival bloom runs. Short — it is a punctuation mark on the
 * landing, and the standing aura is what carries the find from then on. */
export const LOOT_SHINE_MS = 620;

/**
 * THE ARRIVAL — the one-shot bloom a magic-or-better find throws as it touches
 * down, and the visual half of the chime (`lootShine`). Three beats over 620 ms:
 * a flash of the tier's colour that swells and fades, a ring rolling out across
 * the floor, and — from unique upward — a spray of sparks thrown clear.
 *
 * The rank is what separates them. A magic find flashes and is done; an
 * artifact throws a ring twice as wide and a dozen sparks with it. That
 * escalation is the whole job: a five-item spill has to say which one to walk
 * to before the player has read a single item name.
 *
 * Claims the effect (returns true) the way `drawDust` and `drawBlood` do, so
 * the main pass stays a list of one-line handoffs.
 */
export function drawLootShine(
  ctx: CanvasRenderingContext2D,
  effect: Effect,
  x: number,
  groundY: number,
  timeMs: number,
): boolean {
  if (effect.kind !== "lootShine") return false;
  const duration = effect.durationMs ?? LOOT_SHINE_MS;
  const t = clamp01(1 - (effect.untilMs - timeMs) / duration);
  const rgb = effect.color ?? TIER_RGB.magic;
  const rank = effect.intensity ?? TIER_RANK.magic;
  const seed = effect.seed ?? 0;

  // The flash: hardest in the first fifth, then fading out over the rest —
  // a bloom that faded linearly reads as a lamp being switched off.
  const flash = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
  const bloom = glowSprite(rgb, 14 + rank * 4);
  if (bloom) {
    ctx.globalAlpha = 0.75 * flash * flash;
    ctx.drawImage(
      bloom,
      x - Math.round(bloom.width / 2),
      groundY - 4 - Math.round(bloom.height / 2),
    );
    ctx.globalAlpha = 1;
  }

  // The ring, rolling out along the ground — flattened, like every other ring
  // in this game, because the floor is seen at an angle.
  const spread = (10 + rank * 7) * (0.3 + t);
  const ring = glowSprite(rgb, Math.round(spread));
  if (ring) {
    ctx.save();
    ctx.globalAlpha = 0.45 * (1 - t) * (1 - t);
    ctx.translate(x, groundY + 2);
    ctx.scale(1, FLATTEN);
    ctx.drawImage(
      ring,
      -Math.round(ring.width / 2),
      -Math.round(ring.height / 2),
    );
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // The sparks: hard pixels thrown out and arcing back down, from unique up.
  // After two soft light layers the burst needs an edge on it, exactly as the
  // standing aura's motes do.
  if (rank >= RANK_BEAM) {
    const sparks = 4 + (rank - RANK_BEAM) * 4;
    ctx.fillStyle = `rgb(${rgb})`;
    for (let i = 0; i < sparks; i++) {
      const angle = hash01(seed + i, 11) * Math.PI * 2;
      const reach = (10 + rank * 3) * (0.5 + hash01(seed + i, 23));
      const sx = Math.round(x + Math.cos(angle) * reach * t);
      // Up first, then down: the same 4·t·(1−t) hop the toss itself flies.
      const sy = Math.round(
        groundY +
          Math.sin(angle) * reach * t * FLATTEN -
          4 * t * (1 - t) * (8 + rank),
      );
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.fillRect(sx, sy, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
  return true;
}
