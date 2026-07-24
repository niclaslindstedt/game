// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Consumables: medkits (tiered stacks) and the two stack-and-spend pickups
// — repair kits and stamina potions — with their shared bank/spend lifecycle,
// plus the pool restores they apply.

import { clamp } from "@game/lib/vec.ts";
import { CONSUMABLES, MEDKIT } from "../config/index.ts";
import type { GameEvent, GameState } from "../types/index.ts";
import { repairAll } from "./durability.ts";

/**
 * Refill the sprint pool to full — the energy-drink pickup. False when there
 * is nothing to top up (already at max) so, like the repair kit on a pristine
 * weapon, the drink stays on the ground for a hero who has actually run himself
 * winded rather than being spent on a rested one.
 */
export function restoreStamina(state: GameState): boolean {
  const player = state.player;
  if (player.stamina >= player.maxStamina) return false;
  player.stamina = player.maxStamina;
  return true;
}

/** Clamp a medkit item's `tier` field into a valid `MEDKIT.tiers` index —
 * untiered kits (minted before tiers shipped) read as the lightest. */
export function medkitTierIndex(tier: number | undefined): number {
  return clamp(tier ?? 0, 0, MEDKIT.tiers.length - 1);
}

/**
 * Bank a medkit of the given tier into the consumable dock. Returns false —
 * so the caller leaves it on the ground — when that quality's stack is
 * already full (`CONSUMABLES.stackCap`). Medkits stack only within their own
 * quality, so a full LIGHT stack never blocks banking a SUPERIOR kit.
 */
export function bankMedkit(
  state: GameState,
  tier: number | undefined,
): boolean {
  const index = medkitTierIndex(tier);
  const medkits = state.player.medkits;
  if ((medkits[index] ?? 0) >= CONSUMABLES.stackCap) return false;
  medkits[index] = (medkits[index] ?? 0) + 1;
  return true;
}

/** The ground-item kinds that bank into a simple capped stack on the player
 * (medkits are NOT one of these — they stack per quality tier). */
export type StackedConsumableKind = "repair" | "drink";

/**
 * The two STACK-AND-SPEND consumables — the repair kit ("repair") and the
 * energy-drink stamina potion ("drink") — share one lifecycle: a touched pickup
 * BANKS into a capped stack on the player (refused — left on the ground — at
 * `CONSUMABLES.stackCap`), and the hero SPENDS one on his own input edge,
 * refusing a no-op (nothing to mend, pool already full) so a mistap never wastes
 * one. Each row below is the single home of a kind's counter field, pickup-card
 * name, and spend effect + used-event, so the two can never drift apart; add a
 * kind here and `bankConsumable`/`spendConsumable` (and the pickup dispatch in
 * step.ts) pick it up.
 */
const STACKED_CONSUMABLES: Record<
  StackedConsumableKind,
  {
    /** The `Player` stack counter this kind banks into. */
    counter: "repairKits" | "staminaPotions";
    /** The pickup card's display name. */
    pickupName: string;
    /** Apply the spend effect; the event to emit, or null on a no-op. */
    spend: (state: GameState) => GameEvent | null;
  }
> = {
  repair: {
    counter: "repairKits",
    pickupName: "REPAIR KIT",
    spend: (state) => (repairAll(state) ? { type: "repairKitUsed" } : null),
  },
  drink: {
    counter: "staminaPotions",
    pickupName: "STAMINA POTION",
    spend: (state) =>
      restoreStamina(state) ? { type: "staminaPotionUsed" } : null,
  },
};

/**
 * Bank a touched stacked-consumable pickup into its dock stack. False (leave
 * it grounded) when the stack is already full — so a hoarded pickup never
 * overflows, and a touched one waits in the pouch until the player spends it
 * rather than firing on contact.
 */
export function bankConsumable(
  state: GameState,
  kind: StackedConsumableKind,
): boolean {
  const { counter } = STACKED_CONSUMABLES[kind];
  if (state.player[counter] >= CONSUMABLES.stackCap) return false;
  state.player[counter] += 1;
  return true;
}

/** The pickup-card name of a stacked consumable ("REPAIR KIT", …). */
export function consumableName(kind: StackedConsumableKind): string {
  return STACKED_CONSUMABLES[kind].pickupName;
}

/**
 * Spend one stacked consumable of `kind`: a no-op — returns false, nothing
 * consumed — when none is held or the effect has nothing to do, else the
 * stack shrinks by one and the kind's used-event fires.
 */
function spendConsumable(
  state: GameState,
  kind: StackedConsumableKind,
): boolean {
  const { counter, spend } = STACKED_CONSUMABLES[kind];
  if (state.player[counter] <= 0) return false;
  const event = spend(state);
  if (!event) return false;
  state.player[counter] -= 1;
  state.events.push(event);
  return true;
}

/** Bank a stamina potion into the consumable dock (see `bankConsumable`). */
export function bankStaminaPotion(state: GameState): boolean {
  return bankConsumable(state, "drink");
}

/** Bank a weapon repair kit into the consumable dock (see `bankConsumable`). */
export function bankRepairKit(state: GameState): boolean {
  return bankConsumable(state, "repair");
}

/**
 * Spend one stacked repair kit to mend the hero's WHOLE kit — the held weapon,
 * every weapon in the bag (waking any that broke), and the worn armor — then
 * re-equip the weapons durability booted from the hand, in the order they were
 * shed (`repairAll`). A no-op with no kit held or nothing to mend, so a mistap
 * keeps the kit. Emits `repairKitUsed`.
 */
export function consumeRepairKit(state: GameState): boolean {
  return spendConsumable(state, "repair");
}

/** The highest medkit quality the player is holding (index into
 * `MEDKIT.tiers`), or -1 when the medkit stacks are all empty. This is the
 * kit `consumeMedkit` spends and the one the HUD's medkit slot shows. */
export function bestMedkitTier(state: GameState): number {
  const medkits = state.player.medkits;
  for (let i = medkits.length - 1; i >= 0; i--) {
    if ((medkits[i] ?? 0) > 0) return i;
  }
  return -1;
}

/**
 * Spend one stacked medkit, biggest heal first, to top up the hero's hp.
 * A no-op — returns false, nothing consumed — when no medkit is held or the
 * hero is already at full hp (so a mistap never wastes a kit). Emits
 * `medkitUsed` with the quality name and the hp actually restored.
 */
export function consumeMedkit(state: GameState): boolean {
  const player = state.player;
  if (player.hp >= player.maxHp) return false;
  const tierIndex = bestMedkitTier(state);
  if (tierIndex < 0) return false;
  const tier = MEDKIT.tiers[tierIndex] ?? MEDKIT.tiers[0];
  const before = player.hp;
  // Percentage-of-max heal (config MEDKIT.tiers) — floored at 1 so a kit is
  // never a no-op, then capped at full below.
  const heal = Math.max(1, Math.round(player.maxHp * tier.healPct));
  player.hp = Math.min(player.maxHp, player.hp + heal);
  player.medkits[tierIndex] = (player.medkits[tierIndex] ?? 0) - 1;
  state.events.push({
    type: "medkitUsed",
    tier: tierIndex,
    name: tier.name,
    heal: player.hp - before,
  });
  return true;
}

/**
 * Spend one stacked stamina potion to refill the sprint pool. A no-op with
 * none held or the pool already full (`restoreStamina`), so a mistap keeps
 * the potion. Emits `staminaPotionUsed`.
 */
export function consumeStaminaPotion(state: GameState): boolean {
  return spendConsumable(state, "drink");
}
