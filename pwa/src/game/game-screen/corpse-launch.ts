// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE KILL LAUNCH — how a killing blow turns into a corpse throw. Its own leaf
// module (nothing but the vector helper and the settings): the rule is pure
// arithmetic over the kill event, so it stays testable without dragging the
// whole game screen's render/asset graph along. `event-fx.ts` sizes each
// `enemyKilled` with it; `render/effects.ts` animates the arc and the tumble.

import { normalize } from "@game/lib/vec.ts";

import { getSettings } from "../settings.ts";

// The one number that drives the throw is the blow measured in the mob's own
// STARTING HEALTHBARS (`damage / maxHp`), so it is PROPORTIONAL to the damage
// AND to the weight of what took it: a crit (twice the damage) throws twice as
// far as the plain blow beside it, and a mob with a big bar for the damage
// dealt is HEAVIER — the same weapon that punts trash off the rim barely rocks
// it.
//
// The calibration, in bars of the victim's own health:
//   1 bar (a clean one-shot)  → `LAUNCH_MIN_PX`. Always a real knock, never a
//                               lean: one-shotting something must LOOK like it.
//   3 bars                    → `LAUNCH_EDGE_PX`, i.e. off the rim. A phone's
//                               world viewport is ~422×260 units (half-width
//                               ~211) and the camera chases the advancing hero,
//                               so clearing the screen means clearing the
//                               half-width AND the camera's drift.
//   beyond                    → the SAME slope, UNCAPPED. There is deliberately
//                               no ceiling: a blow ten times a mob's health has
//                               to read as ten times the blow that merely
//                               cleared the screen, and a cap is exactly what
//                               would flatten the whole top of the range into
//                               one indistinguishable throw.
//   under 1 bar               → the blow only finished an already-wounded mob;
//                               the push tails off with it to nothing, so a
//                               chip finish just topples in place.
const LAUNCH_MIN_PX = 18;
const LAUNCH_EDGE_PX = 240;
/** Px per extra healthbar between the 1-bar floor and the 3-bar screen edge —
 * the one slope the whole curve rides, all the way up. */
const LAUNCH_PX_PER_HEALTH = (LAUNCH_EDGE_PX - LAUNCH_MIN_PX) / 2;
// Heavier bodies barely budge. A big bar already damps the throw on its own (it
// divides the damage), but this is the design clamp on top: flinging a giant
// across the map would read as a bug however hard it was hit, so a set piece
// stays roughly on its mark — the flying HORDE is what the feature is for.
const LAUNCH_MASS: Record<string, number> = { elite: 0.32, boss: 0.14 };
// One end-over-end spin per FULL extra starting-HP bar of overkill: 2× starting
// HP tumbles once, 3× twice, 4× thrice. Capped so a monstrous one-shot stays a
// countable tumble rather than a spun blur.
const LAUNCH_MAX_SPINS = 4;

/** A corpse throw: the unit heading (already pointing AWAY from the hero), how
 * far the body sails in world px, and how many whole times it tumbles. */
export type CorpseLaunch = {
  dx: number;
  dy: number;
  dist: number;
  spins: number;
};

/**
 * Size a corpse throw from the killing blow measured against the mob's STARTING
 * health (`damage / maxHp`). Returns null only when the throw would be too
 * small to read (a chip finish on an already-wounded mob, or the KNOCKBACK
 * slider turned down) — then the body just topples in place.
 */
export function corpseLaunch(
  damage: number,
  maxHp: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  role: string,
): CorpseLaunch | null {
  // The blow in the victim's own healthbars: the damage dealt PRICED BY the hp
  // that had to absorb it. 1 = a clean one-shot, 2 = a crit that one-shot it,
  // 0.2 = a tap that finished a mob already down to its last fifth.
  const bars = damage / Math.max(1, maxHp);
  if (bars <= 0) return null;
  const mass = LAUNCH_MASS[role] ?? 1;
  // At and above one full bar the throw rides the calibrated slope off the
  // floor; below it, the same floor tails off proportionally to nothing. The
  // DEVELOPER → VISUALS → KNOCKBACK slider scales the whole throw live (1× shipped, 0×
  // disables it, higher rockets bodies off the screen) and heavy elites/bosses
  // barely budge (LAUNCH_MASS).
  const reach =
    bars >= 1
      ? LAUNCH_MIN_PX + (bars - 1) * LAUNCH_PX_PER_HEALTH
      : LAUNCH_MIN_PX * bars;
  const dist = reach * mass * getSettings().knockback;
  if (dist <= 2) return null;
  // Whole spins tied STRAIGHT to the OVERKILL — one per full extra bar, so the
  // tumble reads the hit's strength, not the (mass- and slider-scaled) distance:
  // 2× → 1 spin, 3× → 2, 4× → 3. This is what makes the throw feel deliberate
  // instead of random. A one-shot that merely clears the bar flies without
  // completing a rotation. The DISTANCE is uncapped, but the spin COUNT is not:
  // past a few turns a tumble stops being countable and reads as a blur, which
  // is less legible rather than more.
  const spins = Math.max(0, Math.min(LAUNCH_MAX_SPINS, Math.floor(bars - 1)));
  // Away from the hero — the corpse flies off in the direction it was struck.
  // If the body sits right on top of him (no clear heading), throw it upward.
  const n = normalize(to.x - from.x, to.y - from.y);
  const dx = n.len > 0.01 ? n.x : 0;
  const dy = n.len > 0.01 ? n.y : -1;
  return { dx, dy, dist, spins };
}
