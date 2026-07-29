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
import { getSettings } from "../settings.ts";

/** Bars of the victim's own health a blow has to take to spray at FULL power.
 * Deliberately under one: most kills are the last hit of several, and a fight
 * where only one-shots bleed reads as a fight where nothing bleeds. */
const HEAVY_BARS = 0.6;
/** Past full power the curve keeps climbing, but at a third the slope and into
 * a ceiling — a blow ten times a mob's health still has only one mob's worth of
 * blood in it, so the extra reads as reach and mist, not as ten times the gore. */
const OVERKILL_SLOPE = 0.35;
const SEVERITY_MAX = 2;
/** Even a 1-damage tickle draws blood: nothing the hero connects with should
 * land dry, or a chip finish reads as a miss. */
const SEVERITY_MIN = 0.12;

/** How many droplets fly at severity 0 and at severity 1 (it keeps climbing
 * past 1 on the same slope). */
const DROPS_BASE = 2;
const DROPS_PER_SEVERITY = 12;
/** The airborne haze only shows up once a blow is worth more than a scratch. */
const MIST_SEVERITY = 0.5;
const MIST_PER_SEVERITY = 2.4;
/** World px the spray reaches, at severity 0 and per unit of severity. */
const REACH_BASE = 6;
const REACH_PER_SEVERITY = 22;
/** Patches of floor the spray wets, same shape. Fewer than the drops that fly:
 * most of a spray is mist that never lands as anything you could see. */
const SPATTERS_BASE = 1;
const SPATTERS_PER_SEVERITY = 5;

/** Half-angle of the spray cone about the blow's heading. Wide enough to read as
 * a burst rather than a jet, narrow enough that the blood clearly comes off the
 * side the hit landed on. Shared with `render/blood.ts`, which throws the drops
 * along the very same bearings — the whole point of the floor's scatter is that
 * it agrees with what flew over it. */
export const SPRAY_CONE = 1.25;

/** The ground plane is seen at a shallow angle, so a spray lands wider than it
 * is deep — the same squash the dust and every ground ring use. */
const FLATTEN = 0.42;

/** A bigger body simply has more blood in it. The bars already price the blow
 * against the health that took it, so this is the SIZE knob on top: a scratch
 * on a boss is still a scratch, it is just a bigger one. */
const ROLE_BODY: Record<string, number> = { elite: 1.35, boss: 1.8 };

/** The pool a death leaves, as a rung on `bloodSpills`' pool ladder (0 = the
 * small one). A set piece earns its pool by being what it is; a minion earns the
 * bigger one by having been hit hard enough to deserve it. */
const POOL_MINION_HEAVY = 0.9;

/** What one landed blow is worth, in blood. */
export type BloodBlow = {
  /** The blow in the victim's healthbars, curved and clamped to [0, 2] — the
   * one number every count below is derived from. */
  severity: number;
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
 * Price one landed blow. Returns null when no blood should exist at all — EXTRA
 * GORE off, or the developer amount at zero. Otherwise every connecting blow is
 * worth at least the floor spray: nothing the hero lands should read as a miss.
 *
 * `damage` and `maxHp` come straight off the `enemyHit`/`enemyKilled` event,
 * `role` off the victim's def, and `kill` says whether this was the last blow.
 */
export function bloodBlow(
  damage: number,
  maxHp: number,
  role: string,
  kill: boolean,
): BloodBlow | null {
  const settings = getSettings();
  if (settings.extraGore !== "on") return null;
  const amount = settings.blood;
  if (amount <= 0) return null;
  const bars = Math.max(0, damage) / Math.max(1, maxHp);
  // Up to a heavy blow the spray grows straight with the bars it took; past it
  // the same slope would run away, so the overkill is worth a third as much and
  // stops entirely at the ceiling.
  const raw = bars / HEAVY_BARS;
  const curved = raw <= 1 ? raw : 1 + (raw - 1) * OVERKILL_SLOPE;
  const severity = Math.max(
    SEVERITY_MIN,
    Math.min(SEVERITY_MAX, curved) * amount,
  );
  const body = ROLE_BODY[role] ?? 1;
  return {
    severity,
    drops: Math.round((DROPS_BASE + DROPS_PER_SEVERITY * severity) * body),
    mist:
      severity >= MIST_SEVERITY
        ? Math.round(MIST_PER_SEVERITY * severity * body)
        : 0,
    reach: (REACH_BASE + REACH_PER_SEVERITY * severity) * body,
    spatters: Math.round(
      (SPATTERS_BASE + SPATTERS_PER_SEVERITY * severity) * body,
    ),
    body,
    pool: kill ? poolTier(role, severity) : null,
  };
}

/**
 * Which of the three pools a death lays down. A boss and an elite are sized by
 * WHAT THEY ARE rather than by the blow — a boss's last hit is usually a sliver
 * of its enormous bar, and a giant that dies leaving a minion's smear would read
 * as a bug. A minion earns the middle pool only by being properly opened up.
 */
function poolTier(role: string, severity: number): number {
  if (role === "boss") return 2;
  if (role === "elite") return 1;
  return severity >= POOL_MINION_HEAVY ? 1 : 0;
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
    amount: SPATTER_AMOUNT * (0.8 + 0.9 * blow.severity) * blow.body,
  });
  // Then where the drops came down: the same seeded bearings `drawDrops` throws
  // them along, so the floor agrees with what flew over it.
  for (let i = 0; i < blow.spatters; i++) {
    const n = i + seed * 9.13 + 3;
    const ang = heading + (fract(n * 1.61) - 0.5) * 2 * SPRAY_CONE;
    const dist = blow.reach * (0.2 + 0.8 * fract(n * 2.93));
    spills.push({
      x: pos.x + Math.cos(ang) * dist,
      y: pos.y + Math.sin(ang) * dist * FLATTEN,
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
