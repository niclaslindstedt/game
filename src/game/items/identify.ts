// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// IDENTIFICATION — the D2 rule that a MAGIC-or-better find drops with its
// rolls hidden. The rolls themselves are all made at mint (rolling.ts), so the
// seeded loot stream never shifts; this module owns the two ways the veil
// comes off: the merchant's counter service (`identifyItem`, coins, shop
// phase) and the ITEM LOOKUP TICKET spent from the bag in the field
// (`spendLookupTicket` — D2's scroll of identify, `GearDef.identify`).
// Both are UI-driven mutators reached through `applyRunCommand`, safe to call
// outside `step()` like every bag verb.

import { ECONOMY } from "../config/index.ts";
import { gearDef, isGearDef, tierRank } from "../defs/equipment.ts";
import type { Equipment, GameState, Player, Tier } from "../types/index.ts";
import { equipmentName } from "./quality.ts";

/**
 * Does a fresh mint of this tier drop UNIDENTIFIED? Magic and everything above
 * it — keyed off the tier ladder rather than a hand-listed set, so a tier
 * added above (the way ARTIFACT once was) can never fall through to dropping
 * pre-identified. Regular/trash finds have nothing to hide.
 */
export function mintsUnidentified(tier: Tier): boolean {
  return tierRank(tier) >= tierRank("magic");
}

/** Is this piece still waiting to be identified? */
export function isUnidentified(item: Equipment): boolean {
  return item.unidentified === true;
}

/**
 * Strip the unidentified veil WITHOUT the reveal ceremony — for mints that are
 * handed over already known: the merchant's stall (he knows his own stock),
 * a quest reward chosen off a card that shows its stats, and the staging paths
 * (scenarios, the simulator's arrival kits). Returns the same instance so a
 * mint expression can wrap in place.
 */
export function markIdentified(item: Equipment): Equipment {
  delete item.unidentified;
  return item;
}

/**
 * What the merchant charges to identify one piece at his counter: a flat base
 * plus a share per item level (config `ECONOMY.identifyPrice`), so a deep find
 * costs a little more to appraise — always well under the piece's own tier
 * value, because the fee is a ritual, not a tax that outweighs the reveal.
 */
export function identifyCost(item: Equipment): number {
  return Math.round(
    ECONOMY.identifyPrice.base + ECONOMY.identifyPrice.perIlvl * item.ilvl,
  );
}

/** The reveal itself, shared by both doors: clear the flag and announce the
 * piece by its now-visible name. The event is only readable before the next
 * `step()` wipes it (like `gearRepaired`), so the app also cues its reveal
 * card directly from the command's result. */
function reveal(state: GameState, item: Equipment): void {
  markIdentified(item);
  state.events.push({
    type: "itemIdentified",
    tier: item.tier,
    name: equipmentName(item),
    defId: item.defId,
    itemId: item.id,
    ...(item.uniqueId !== undefined ? { uniqueId: item.uniqueId } : {}),
  });
}

/**
 * IDENTIFY the piece in bag cell `index` at the merchant's counter: only with
 * the shop open, only on an unidentified piece, and only when the purse covers
 * the fee (`identifyCost`). Returns the coins paid, or null on a refusal (no
 * mutation) — the same shape `repairGear` answers in, so the app can ignore a
 * dud tap.
 */
export function identifyItem(
  state: GameState,
  hero: Player,
  index: number,
): number | null {
  if (state.phase !== "shop") return null;
  const item = hero.inventory[index];
  if (!item || !isUnidentified(item)) return null;
  const cost = identifyCost(item);
  if (hero.coins < cost) return null;
  hero.coins -= cost;
  reveal(state, item);
  return cost;
}

/**
 * The bag cell holding an ITEM LOOKUP TICKET stack, or -1 when the hero
 * carries none — the USE-affordance probe the inventory card asks (shaped
 * like `gateKeyTarget`/`reviveTarget`): an unidentified piece offers its
 * IDENTIFY row only while a ticket is actually in the bag to spend.
 */
export function lookupTicketIndex(hero: Player): number {
  return hero.inventory.findIndex(
    (cell) =>
      cell !== null && isGearDef(cell.defId) && gearDef(cell.defId).identify,
  );
}

/**
 * USE an ITEM LOOKUP TICKET from bag cell `ticketIndex` on the unidentified
 * piece in cell `targetIndex` — the field identify, no counter needed. One
 * unit leaves the ticket's stack (`Equipment.qty`; the cell frees at zero) and
 * the target is revealed. Returns false (and consumes nothing) when the ticket
 * cell holds no identify item or the target cell holds nothing unidentified,
 * so a mistap can never burn a ticket.
 */
export function spendLookupTicket(
  state: GameState,
  hero: Player,
  ticketIndex: number,
  targetIndex: number,
): boolean {
  const ticket = hero.inventory[ticketIndex] ?? null;
  if (!ticket || !isGearDef(ticket.defId) || !gearDef(ticket.defId).identify) {
    return false;
  }
  const target = hero.inventory[targetIndex] ?? null;
  if (!target || target === ticket || !isUnidentified(target)) return false;
  const left = (ticket.qty ?? 1) - 1;
  if (left > 0) ticket.qty = left;
  else hero.inventory[ticketIndex] = null;
  reveal(state, target);
  return true;
}
