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
import type { Vec2 } from "@game/lib/vec.ts";
import type { BossAbility } from "../defs/enemies/abilities.ts";
import type { Enemy, GameEvent, GameState } from "../types/index.ts";

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
  const player = state.players[0];
  const raw = Math.round(damage * (crit ? STATS.critMultiplier : 1));
  const hpDamage = Math.max(
    0,
    Math.round(raw * (1 - armorReduction(state, player, mlvl))),
  );
  wearWornArmor(state, player);
  player.hp -= absorbPlayerDamage(state, player, hpDamage);
  player.hurtFlashMs = 250;
  state.stats.damageTaken += raw;
  state.events.push({ type: "playerHurt", crit, cause });
  // A blow that lands may cast back — the D2 "when struck" procs, and they
  // belong to the hero the blow landed on.
  if (striker) queueStruckProcs(state, striker, player);
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
  return state.players[0].z <= JUMP.dodgeHeight && !state.players[0].disarmed;
}

/**
 * Announce one beat of an ELITE-TIER ability (see `GameEvent.eliteCast`).
 *
 * Every primitive reports through here rather than pushing the event itself,
 * for one reason: the `look` and the `defId` are the two fields an effect
 * cannot recover once the caster is dead, and a burst that outlives its owner
 * is the common case rather than the edge one — the mob that just cast a pulse
 * is frequently killed by the answer to it. Filling them in one place means no
 * primitive can forget, and a mod's elite gets its own colours for free.
 */
export function pushEliteCast(
  state: GameState,
  enemy: Enemy,
  ability: BossAbility,
  fields: Omit<
    Extract<GameEvent, { type: "eliteCast" }>,
    "type" | "kind" | "defId" | "look" | "pos"
  > & { pos?: Vec2 },
): void {
  state.events.push({
    type: "eliteCast",
    kind: ability.id,
    defId: enemy.defId,
    look: ability.look,
    pos: fields.pos ? { ...fields.pos } : { ...enemy.pos },
    ...fields,
  });
}
