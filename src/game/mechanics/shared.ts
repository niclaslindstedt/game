// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Helpers every set-piece move shares: landing a blow on the hero through the
// ordinary defensive chain, and the readable-danger rules that decide whether
// a blow lands at all. Kept in one place so a new ability cannot accidentally
// invent its own damage path and skip armor, absorption, or the jump dodge.

import { JUMP, STATS } from "../config/index.ts";
import {
  absorbPlayerDamage,
  armorReduction,
  wearWornArmor,
} from "../items/index.ts";
import { queueStruckProcs } from "../loot.ts";
import { BALANCE } from "../tuning.ts";
import type { Enemy, GameState } from "../types/index.ts";

/**
 * Land one hostile blow on the hero, through every layer a contact hit goes
 * through: armor for the attacker's monster level, worn-armor wear, the
 * barrier's absorption, the hurt flash, the damage ledger, the `playerHurt`
 * event (carrying `cause`, which the simulator's death ledger books), and the
 * "when struck" procs.
 *
 * `damage` is the raw figure BEFORE armor — every caller prices its own move
 * (usually a fraction of the attacker's `contactDamage`) and hands it here.
 * Returns the hp actually lost, so a caller can tell a hit from a whiff.
 */
export function landHostileBlow(
  state: GameState,
  damage: number,
  mlvl: number,
  cause: string,
  striker?: Enemy,
  crit = false,
): number {
  const player = state.player;
  const raw = Math.round(damage * (crit ? STATS.critMultiplier : 1));
  const hpDamage = Math.max(
    0,
    Math.round(raw * (1 - armorReduction(state, mlvl))),
  );
  wearWornArmor(state);
  player.hp -= absorbPlayerDamage(state, hpDamage);
  player.hurtFlashMs = 250;
  state.stats.damageTaken += raw;
  state.events.push({ type: "playerHurt", crit, cause });
  // A blow that lands may cast back — the D2 "when struck" procs.
  if (striker) queueStruckProcs(state, striker);
  return hpDamage;
}

/**
 * Price one of this mob's moves: `contactDamage × frac`, through its spawn-time
 * contact multiplier and the BALANCE knob, so a set piece's blows scale with
 * the mob exactly like its bite does.
 */
export function mobBlowDamage(
  enemy: Enemy,
  contactDamage: number,
  frac: number,
): number {
  return contactDamage * frac * (enemy.contactMult ?? 1) * BALANCE.mobDamage;
}

/**
 * May a ground-plane move touch the hero at all? A JUMP sails clean over
 * anything that runs along the floor — the same rule as contact, and the
 * reason "jump it" is a readable answer the player can carry from the slam to
 * the beam to the burning floor without being taught each one separately. The
 * pre-combat grace (`disarmed`) is honoured here too.
 */
export function groundMoveCanTouch(state: GameState): boolean {
  return state.player.z <= JUMP.dodgeHeight && !state.player.disarmed;
}
