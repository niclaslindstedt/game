// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WARD's damage pool (the `ward_shield` elite ability) — the shell a mob
// raises over itself, and the one rule for spending it.
//
// It lives in a LEAF of its own rather than in `ward-shield.ts` beside the rest
// of the ability, and the reason is the import graph: the shell has to be spent
// inside `hitEnemy`, which every blow in the game goes through, and `hitEnemy`
// lives in loot.ts — which `mechanics/shared.ts` already imports. An ability
// module registers itself with the catalog as a load side effect, so importing
// one from loot.ts would drag the whole catalog into the damage path to reach
// ten lines of arithmetic. This file imports nothing but a type.
//
// THE POOL IS A BUDGET, NEVER A TIMER, and that distinction is the whole design
// (see `WardShieldAbility`): a timed invulnerability tells the player to stop
// playing until it lapses, while a budget tells them to spend everything they
// have RIGHT NOW. The shell therefore eats damage until it is gone and then
// stops, rather than refusing damage for a fixed stretch.

import type { Enemy } from "../types/index.ts";

/**
 * Spend a blow against the mob's ward, if it has one up, and return the damage
 * that got THROUGH to its health.
 *
 * The overflow passes on rather than being swallowed: a blow far bigger than
 * what is left of the shell breaks it AND hurts, which is what makes saving a
 * big cooldown for a warded mob the right read. Swallowing the remainder would
 * mean a shell with 1 hp left absorbed a hero's whole burst, and the player
 * would learn — correctly — that the honest answer is to plink it down first.
 *
 * Returns the leftover damage; the caller reports the break so the app can sell
 * it (a ward going quietly is a ward the player never learns to break).
 */
export function spendWard(
  enemy: Enemy,
  damage: number,
): { damage: number; broke: boolean } {
  const mech = enemy.mech;
  const pool = mech?.wardHp;
  if (!mech || !pool || pool <= 0 || damage <= 0) {
    return { damage, broke: false };
  }
  const eaten = Math.min(pool, damage);
  mech.wardHp = pool - eaten;
  const broke = mech.wardHp <= 0;
  if (broke) {
    mech.wardHp = undefined;
    mech.wardMs = undefined;
  }
  return { damage: damage - eaten, broke };
}

/** Is this mob's shell up right now? Read by the renderer and by the bot's
 * target valuation — both want the question, neither wants the bookkeeping. */
export function wardUp(enemy: Enemy): boolean {
  return (enemy.mech?.wardHp ?? 0) > 0;
}
