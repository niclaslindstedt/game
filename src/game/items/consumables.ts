// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Consumables: medkits (tiered stacks) and the two stack-and-spend pickups
// — repair kits and stamina potions — with their shared bank/spend lifecycle,
// plus the pool restores they apply and the APPETITE reads the drop ladder
// asks before minting one — how stocked the pouch is (SUPPLY) against how far
// down the pool that kind refills has fallen (NEED).

import { clamp, clamp01 } from "@game/lib/vec.ts";
import { CONSUMABLES, MEDKIT } from "../config/index.ts";
import type { GameEvent, GameState } from "../types/index.ts";
import { repairAll } from "./durability.ts";
import { desperationRamp, worstKitDurability } from "./mercy.ts";

/**
 * Refill the sprint pool to full — the energy-drink pickup. False when there
 * is nothing to top up (already at max) so, like the repair kit on a pristine
 * weapon, the drink stays on the ground for a hero who has actually run himself
 * winded rather than being spent on a rested one.
 */
export function restoreStamina(state: GameState): boolean {
  const player = state.players[0];
  if (player.stamina >= player.maxStamina) return false;
  player.stamina = player.maxStamina;
  return true;
}

/** Clamp a medkit item's `tier` field into a valid `MEDKIT.tiers` index —
 * untiered kits (minted before tiers shipped) read as the lightest. */
export function medkitTierIndex(tier: number | undefined): number {
  return clamp(tier ?? 0, 0, MEDKIT.tiers.length - 1);
}

/** The deepest MEDKIT tier a monster level has unlocked (an index into
 * `MEDKIT.tiers`) — the quality a kill at this depth pays, and the top of the
 * band `rollMedkitTier` draws from. */
export function topMedkitTier(mlvl: number): number {
  let top = 0;
  for (let i = 0; i < MEDKIT.tiers.length; i++) {
    if ((MEDKIT.tiers[i] as { minMlvl: number }).minMlvl <= mlvl) top = i;
  }
  return top;
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
  const medkits = state.players[0].medkits;
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
  if (state.players[0][counter] >= CONSUMABLES.stackCap) return false;
  state.players[0][counter] += 1;
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
  if (state.players[0][counter] <= 0) return false;
  const event = spend(state);
  if (!event) return false;
  state.players[0][counter] -= 1;
  state.events.push(event);
  return true;
}

/**
 * The SUPPLY factor: how much of a kind's authored drop share a pouch this
 * `fill` (0 empty … 1 full) still earns. Full rate up to
 * `CONSUMABLES.appetiteStart`, fading linearly over the top of the stack, and
 * bottoming out at `CONSUMABLES.appetiteFloor` — never zero, so a full pouch
 * still sees the thin rain of ground bait a player can plan a dive around.
 * The taper is `desperationRamp` read backwards (the mercy ramps ask how BADLY
 * something is needed; this asks how little), so the ordinary rain and the
 * rescue ropes bend on one shared curve.
 */
function supplyFor(fill: number): number {
  const floor = CONSUMABLES.appetiteFloor;
  const room = desperationRamp(fill, 1, CONSUMABLES.appetiteStart);
  return floor + (1 - floor) * room;
}

/**
 * The NEED factor: how much a pool this far down widens the slice, linearly in
 * the `deficit` (0 = topped off, 1 = bone dry) up to
 * `CONSUMABLES.appetiteNeedBonus`. Simply not being at 100% ticks the rate up;
 * a hero with everything full changes nothing. The gentle, always-on companion
 * to the MERCY desperation ramps, which stay silent until he is drowning.
 */
function needFor(deficit: number): number {
  return 1 + CONSUMABLES.appetiteNeedBonus * clamp01(deficit);
}

/** A pool's deficit as a 0→1 fraction — how much of `max` is missing. */
function deficitOf(value: number, max: number): number {
  return max > 0 ? clamp01(1 - value / max) : 0;
}

/**
 * The MEDKIT slice's appetite for a kill at `mlvl`: how stocked the hero is on
 * the qualities such a kill could actually pay, leaned on by how hurt he is.
 *
 * Medkits stack PER QUALITY, and a drop only ever rolls the deepest tier the
 * monster level has unlocked or the one under it (`rollMedkitTier`), so the
 * fill is weighted by those same odds (`MEDKIT.topTierChance`): a hero sitting
 * on five SUPERIOR kits has little room for the three-in-four drops that would
 * be superior, however empty his LIGHT stack is.
 */
export function medkitAppetite(state: GameState, mlvl: number): number {
  const player = state.players[0];
  const medkits = player.medkits;
  const cap = CONSUMABLES.stackCap;
  const top = topMedkitTier(mlvl);
  const topFill = Math.min(1, (medkits[top] ?? 0) / cap);
  const underFill =
    top === 0 ? topFill : Math.min(1, (medkits[top - 1] ?? 0) / cap);
  const p = top === 0 ? 1 : MEDKIT.topTierChance;
  const fill = topFill * p + underFill * (1 - p);
  return supplyFor(fill) * needFor(deficitOf(player.hp, player.maxHp));
}

/**
 * The REPAIR-KIT or ENERGY-DRINK slice's appetite: one shared stack each, so
 * the supply read is just how deep the pouch already is — leaned on by how far
 * down the thing that kind restores has fallen (the sprint pool for a drink,
 * the worst-worn piece of the kit for a repair).
 */
export function consumableAppetite(
  state: GameState,
  kind: StackedConsumableKind,
): number {
  const player = state.players[0];
  const { counter } = STACKED_CONSUMABLES[kind];
  const deficit =
    kind === "drink"
      ? deficitOf(player.stamina, player.maxStamina)
      : 1 - worstKitDurability(state);
  return (
    supplyFor(Math.min(1, player[counter] / CONSUMABLES.stackCap)) *
    needFor(deficit)
  );
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
  const medkits = state.players[0].medkits;
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
  const player = state.players[0];
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
