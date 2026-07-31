// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW MUCH BLOOD A BLOW IS WORTH — the rule alone, no canvas anywhere near it.
//
// Its own leaf module for the same reason `corpse-launch.ts` is one: the whole
// thing is arithmetic over a hit event, so it stays testable without dragging
// the game screen's render/asset graph along. `event-fx.ts` sizes every
// `enemyHit`/`enemyKilled` with it; `render/blood.ts` throws the spray it
// describes and `render/blood-decals.ts` stamps the marks it leaves.
//
// The one number the whole thing rides is the blow measured in the victim's own
// STARTING HEALTHBARS (`damage / maxHp`) — exactly what the kill launch prices
// its throw on. A nick sprays a few drops; a blow that takes most of the bar
// opens a wound; a one-shot throws the lot. Pricing it in bars rather than in
// raw damage is what makes it hold across the campaign: a level-1 blaster round
// on a moon rat and a legendary slam on a rift horror read the same way relative
// to what they did, instead of the whole late game drowning in blood because the
// numbers got bigger.

import { fract } from "../render/shared.ts";

import { goreAmount } from "./gore-gate.ts";
import type { GoreFamilyId } from "./gore.ts";

/** Bars of the victim's own health a blow has to take to spill EVERYTHING it
 * has. Deliberately under one: most kills are the last hit of several, and a
 * fight where only one-shots bleed reads as a fight where nothing bleeds. */
const FULL_BARS = 0.6;
/** Even a 1-damage tickle draws blood: nothing the hero connects with should
 * land dry, or a chip finish reads as a miss. */
const MIN = 0.12;

/** Past a full spill the FORCE curve keeps climbing FOREVER — there is no
 * ceiling, deliberately, exactly as there is none on the corpse launch. A level
 * 99 hero cutting through a level 1 crowd is hitting for hundreds of times what
 * those bodies hold, and that has to keep looking more absurd than the merely
 * enormous blow before it; a cap is precisely what flattens the whole top of the
 * range into one picture.
 *
 * It grows as a POWER of the overkill rather than linearly, because linear does
 * not survive the real numbers: a thousandfold blow would ask for a spray a
 * screen and a half wide before the sprites even ran out. At this exponent a 10×
 * blow throws about 2.5× a one-shot's reach, a 100× blow about 6×, and a 1000×
 * blow about 16× — always more, never unbounded in practice. */
const FORCE_EXP = 0.4;

/** How many droplets fly at no volume and at a full one, plus what the FORCE
 * adds on top — same blood, divided finer. `DROPS_MAX` is a per-blow draw budget
 * (a screen-clearing AoE fires one of these per mob), not a design ceiling. */
const DROPS_BASE = 2;
const DROPS_PER_VOLUME = 12;
const DROPS_PER_FORCE = 3;
const DROPS_MAX = 60;
/** The airborne haze rides FORCE: it is blood ATOMIZED, which is what an
 * overwhelming blow does to a body rather than what a big body contains. */
const MIST_FORCE = 0.5;
const MIST_PER_FORCE = 2.4;
const MIST_MAX = 20;
/** World px the spray reaches, at no force and per unit of it. Force again —
 * the same pint can be pushed out or blown across the room. */
const REACH_BASE = 6;
const REACH_PER_FORCE = 22;
/** Patches of floor the spray wets. Mostly volume (there is only so much blood
 * to land), with a few more as the force flings it over a wider area — a big
 * throw spread over the same handful of spatters lands as freckles. */
const SPATTERS_BASE = 1;
const SPATTERS_PER_VOLUME = 5;
const SPATTERS_PER_FORCE = 1.6;
const SPATTERS_MAX = 48;

/** Half-angle of the spray cone about the blow's heading. Wide enough to read as
 * a burst rather than a jet, narrow enough that the blood clearly comes off the
 * side the hit landed on. Shared with `render/blood.ts`, which throws the drops
 * along the very same bearings — the whole point of the floor's scatter is that
 * it agrees with what flew over it. */
export const SPRAY_CONE = 1.25;

/**
 * A spray goes WIDER than it goes deep: blood comes off a blade's arc, which
 * sweeps across the hero rather than away from him, so the pattern is an ellipse
 * on the floor rather than a circle.
 *
 * This is a shape IN THE WORLD, not a foreshortening — the camera's own squash is
 * the projection's job and is applied on top (see `render/blood.ts`). Shared with
 * that module for the same reason `SPRAY_CONE` is: the drops have to fly over the
 * stains they made, and two copies of this number is one edit away from them
 * parting company.
 */
export const SPRAY_FLATTEN = 0.42;

/** A bigger body simply has more blood in it. The bars already price the blow
 * against the health that took it, so this is the SIZE knob on top: a scratch
 * on a boss is still a scratch, it is just a bigger one. */
const ROLE_BODY: Record<string, number> = { elite: 1.35, boss: 1.8 };

/** Volume at which a minion's death leaves the middle pool rather than the small
 * one, and the FORCE at which anything that dies is EMPTIED — a blow several
 * times a body's whole health does not merely kill it, it puts everything the
 * body had on the floor at once, so it leaves the biggest pool there is
 * regardless of how small the thing was. */
const POOL_HEAVY_VOLUME = 0.9;
const EMPTIED_FORCE = 3;

/** What one landed blow is worth, in blood. */
export type BloodBlow = {
  /** HOW MUCH BLOOD came out, in [0, 1]. A body holds exactly one body's worth,
   * so this SATURATES at a blow that takes the whole bar: hitting a mob for ten
   * times its health cannot spill more blood than it had. */
  volume: number;
  /** HOW HARD it was hit, from 0 and UNBOUNDED. Nothing caps this the way volume
   * is capped — the same pint can be pushed out or blown clear across the room —
   * so it is what keeps a vast overkill legible after the volume has run out,
   * all the way up to a level 99 hero deleting a level 1 crowd. */
  force: number;
  /** Droplets thrown off the wound. */
  drops: number;
  /** Puffs of atomized haze hanging behind them (0 on light hits). */
  mist: number;
  /** How far the spray carries, in world px. */
  reach: number;
  /** Patches of floor the spray wets — they stay there for the rest of the
   * level (render/blood-ground.ts). */
  spatters: number;
  /** Size multiplier for everything, from the victim's build. */
  body: number;
  /** The pool a death leaves, as a rung on the pool ladder (0/1/2), or null
   * when this blow was not the last one. */
  pool: number | null;
};

/**
 * Price one landed blow. Returns null when this kind of body should spill
 * nothing at all — the device's MATURE CONTENT switch off, the family's own
 * GORE switch off, or the developer amount at zero. Otherwise every connecting
 * blow is worth at least the floor spray: nothing the hero lands should read as
 * a miss.
 *
 * The gate is `goreAmount(family)` (game-screen/gore-gate.ts), asked HERE, where
 * the spill is decided — never at the draw call. That is the whole trick: `off`
 * means nothing is drawn AND nothing is recorded, so a gate further down would
 * leave the floor's saturation grid quietly filling up and hand the player a red
 * battlefield the moment the switch came back on.
 *
 * `damage` and `maxHp` come straight off the `enemyHit`/`enemyKilled` event,
 * `role` and `family` off the victim's def, and `kill` says whether this was the
 * last blow.
 */
export function bloodBlow(
  damage: number,
  maxHp: number,
  role: string,
  kill: boolean,
  family: GoreFamilyId = "blood",
): BloodBlow | null {
  const amount = goreAmount(family);
  if (amount == null) return null;
  const bars = Math.max(0, damage) / Math.max(1, maxHp);
  const raw = bars / FULL_BARS;
  // VOLUME saturates. Everything the body had is already on the floor at one
  // full bar; a blow ten times that cannot produce more blood, only throw the
  // same blood harder.
  const volume = Math.max(MIN, Math.min(1, raw) * amount);
  // FORCE does not, and has no ceiling at all: a 10× one-shot must read as
  // visibly more violent than the 3× beside it, and a 1000× more violent again.
  // Below a full spill it is just the raw fraction; above, a power curve that
  // keeps climbing for ever without asking for a spray the size of the level.
  const force = Math.max(MIN, (raw <= 1 ? raw : raw ** FORCE_EXP) * amount);
  const body = ROLE_BODY[role] ?? 1;
  return {
    volume,
    force,
    // The gore COUNTS keep climbing with the force too — not because a burst
    // body holds more blood (it does not) but because a body burst rather than
    // cut comes apart into more, finer pieces. The ceilings here are a DRAW
    // BUDGET and nothing else: a screen-clearing AoE fires one of these per mob,
    // so no single blow may put a thousand sprites in the air.
    drops: Math.min(
      DROPS_MAX,
      Math.round(
        (DROPS_BASE +
          DROPS_PER_VOLUME * volume +
          DROPS_PER_FORCE * Math.max(0, force - 1)) *
          body,
      ),
    ),
    mist:
      force >= MIST_FORCE
        ? Math.min(MIST_MAX, Math.round(MIST_PER_FORCE * force * body))
        : 0,
    reach: (REACH_BASE + REACH_PER_FORCE * force) * body,
    spatters: Math.min(
      SPATTERS_MAX,
      Math.round(
        (SPATTERS_BASE +
          SPATTERS_PER_VOLUME * volume +
          SPATTERS_PER_FORCE * Math.max(0, force - 1)) *
          body,
      ),
    ),
    body,
    pool: kill ? poolTier(role, volume, force) : null,
  };
}

/**
 * Which of the three pools a death lays down.
 *
 * A boss and an elite are sized by WHAT THEY ARE rather than by the blow — a
 * boss's last hit is usually a sliver of its enormous bar, and a giant that died
 * leaving a minion's smear would read as a bug. A minion earns the middle pool
 * by being properly opened up.
 *
 * And ANYTHING hit several times harder than its whole health is EMPTIED: that
 * blow did not kill it, it burst it, so every drop the body had goes on the
 * floor at once and it leaves the biggest pool there is however small it was.
 * That is the top of the overkill range, and the one place where force outranks
 * both volume and the victim's size.
 */
function poolTier(role: string, volume: number, force: number): number {
  if (force >= EMPTIED_FORCE) return 2;
  if (role === "boss") return 2;
  if (role === "elite") return 1;
  return volume >= POOL_HEAVY_VOLUME ? 1 : 0;
}

/** One patch of floor a blow wets: where, how wide (world px, before the ground
 * plane's squash), and how hard, in [0, 1] of a full soaking. The floor itself
 * (render/blood-ground.ts) knows nothing beyond this — it is a saturation grid
 * with no idea what a blow is. */
export type BloodSpill = {
  x: number;
  y: number;
  radius: number;
  amount: number;
};

/** How hard one landed droplet wets the tile it hits, as a fraction of a full
 * soaking, and how wide a patch it covers. Small on purpose: a floor goes red
 * because a fight was had on it, not because one mob was hit once. */
const SPATTER_AMOUNT = 0.13;
const SPATTER_RADIUS = 5;
/** The pool a death leaves, per tier (`BloodBlow.pool`) — how hard it soaks the
 * floor and how far across. A boss's pool is a landmark; a minion's is a mark. */
const POOL_AMOUNT = [0.32, 0.58, 0.9];
const POOL_RADIUS = [16, 26, 40];
/** The skid a launched body paints through its own blood: how hard, relative to
 * the pool it came from, and how far apart the steps are laid. */
const SKID_AMOUNT = 0.45;
const SKID_STEP_PX = 22;

/**
 * Where a blow wets the floor — the same scatter the drops fly along, landed.
 *
 * Pure: it returns the spills and hands them to the caller, so the ground
 * (`./blood-ground.ts`) stays a saturation grid with no idea what a blow is.
 *
 * `launch` is the corpse throw, when this blow was a kill that threw the body:
 * the pool then sits where the body ENDED UP and the skid between is wetted
 * along the way, because blood left at the spot a punted corpse took off from
 * reads as the body having been deleted rather than thrown.
 */
export function bloodSpills(
  blow: BloodBlow,
  pos: { x: number; y: number },
  seed: number,
  heading: number,
  launch?: { dx: number; dy: number; dist: number } | null,
): BloodSpill[] {
  const spills: BloodSpill[] = [];
  // The wound's own splash, right under where the blow landed — always the
  // wettest patch, so a hit reads at the mob rather than out in the spray.
  spills.push({
    x: pos.x,
    y: pos.y,
    radius: SPATTER_RADIUS + blow.reach * 0.25,
    amount: SPATTER_AMOUNT * (0.8 + 0.9 * blow.volume) * blow.body,
  });
  // Then where the drops came down: the same seeded bearings `drawDrops` throws
  // them along, so the floor agrees with what flew over it.
  for (let i = 0; i < blow.spatters; i++) {
    const n = i + seed * 9.13 + 3;
    const ang = heading + (fract(n * 1.61) - 0.5) * 2 * SPRAY_CONE;
    const dist = blow.reach * (0.2 + 0.8 * fract(n * 2.93));
    spills.push({
      x: pos.x + Math.cos(ang) * dist,
      y: pos.y + Math.sin(ang) * dist * SPRAY_FLATTEN,
      radius: SPATTER_RADIUS * (0.7 + 0.6 * fract(n * 8.9)) * blow.body,
      amount: SPATTER_AMOUNT * (0.5 + 0.5 * fract(n * 6.7)),
    });
  }
  if (blow.pool != null) {
    const slide = launch && launch.dist > 2 ? launch : null;
    const tier = Math.min(POOL_AMOUNT.length - 1, blow.pool);
    if (slide) {
      // The skid: the body drags its own blood the whole way, so the trail is
      // one continuous smear rather than two unrelated stains at either end.
      const steps = Math.max(1, Math.round(slide.dist / SKID_STEP_PX));
      for (let i = 1; i <= steps; i++) {
        const f = i / (steps + 1);
        spills.push({
          x: pos.x + slide.dx * slide.dist * f,
          y: pos.y + slide.dy * slide.dist * f,
          radius: POOL_RADIUS[tier]! * 0.4,
          amount: POOL_AMOUNT[tier]! * SKID_AMOUNT * (1 - 0.5 * f),
        });
      }
    }
    spills.push({
      x: pos.x + (slide ? slide.dx * slide.dist : 0),
      y: pos.y + (slide ? slide.dy * slide.dist : 0),
      radius: POOL_RADIUS[tier]! * blow.body,
      amount: POOL_AMOUNT[tier]!,
    });
  }
  return spills;
}
