// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WARD SHIELD — a shell the mob raises over itself that eats a budget of
// damage. The hero's BARRIER powerup, turned around (see
// defs/enemies/abilities.ts).
//
// The pool and the rule for spending it live in the leaf `ward-pool.ts`,
// because they have to be reachable from `hitEnemy` without dragging the whole
// ability catalog into the damage path. This module is only the CASTING half:
// when the shell goes up, and when it fades if nobody spends it.
//
// A BUDGET, NEVER A TIMER — the distinction is the design. A timed
// invulnerability tells the player to stop playing until it lapses; a budget
// tells them to spend everything they have right now, and rewards them for
// having held a cooldown back. `durationMs` exists only so an unspent shell
// eventually lapses rather than following the mob around for the rest of the
// level; it is the floor of the move, not its point.
//
// IT WAITS UNTIL THE MOB HAS BEEN HURT. A shell raised at full health is a mob
// with more health, which is the one thing this must not be — the player has to
// see it go up in answer to something they did, or they will never connect the
// shell with the sudden wall their damage just hit.

import type { WardShieldAbility } from "../defs/enemies/abilities.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";
import { pushEliteCast } from "./shared.ts";

/** How far into the mob's health the fight must be before it will bother.
 * Deliberately generous — the shell should arrive early enough to be met
 * several times in one fight, so it is learned rather than merely suffered. */
const HURT_BELOW = 0.9;

function ready(ability: WardShieldAbility, ctx: AbilityCtx): boolean {
  const { enemy } = ctx;
  if (enemy.mech?.wardHp) return false; // one shell at a time
  if (enemy.maxHp <= 0) return false;
  if (enemy.hp > enemy.maxHp * HURT_BELOW) return false;
  // Raised in answer to somebody, not to an empty room.
  return ctx.distance <= 420;
}

function cast(ability: WardShieldAbility, ctx: AbilityCtx): void {
  const { enemy, mech } = ctx;
  mech.wardHp = Math.max(1, Math.round(enemy.maxHp * ability.poolFrac));
  mech.wardMs = ability.durationMs;
  pushEliteCast(ctx.state, enemy, ability, { ms: ability.durationMs });
}

function step(ability: WardShieldAbility, ctx: AbilityCtx): boolean {
  const { state, enemy, mech, dtMs } = ctx;
  if (!mech.wardMs || mech.wardMs <= 0) return false;

  mech.wardMs = Math.max(0, mech.wardMs - dtMs);
  // Spent shells are cleared by `spendWard` at the moment they break, and the
  // break is announced from there — this only handles the one that lapsed.
  if (mech.wardMs <= 0) {
    mech.wardMs = undefined;
    if (mech.wardHp) {
      mech.wardHp = undefined;
      pushEliteCast(state, enemy, ability, { phase: "end" });
    }
  }
  // FALSE — a shell is worn, not performed. The mob fights on underneath it.
  return false;
}

registerAbility<WardShieldAbility>({ id: "ward_shield", ready, cast, step });
