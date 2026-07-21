// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's ECONOMY: bag discipline and the merchant errand. The bot
// itself (bot.ts) is a PURE consumer of the state — it only produces GameInput
// — so the mutating half of playing the economy (dropping outgrown loot,
// selling at the counter, buying an upgrade) lives here and is invoked by the
// HARNESSES that drive a botted run (the campaign simulator and the app's
// `?bot=` autoplay), exactly like `autoEquipBest`. The predicates are pure so
// `bot.ts` can read them for movement (walk to the stall when a visit pays).

import {
  autoEquipBest,
  canEquip,
  equipmentMaxDurability,
  isScrappableLoot,
  isWeaponBroken,
  repairAllCost,
  weaponScore,
} from "./items.ts";
import {
  buyStock,
  canBuyStock,
  closeShop,
  openShop,
  repairGear,
  sellItem,
  sellValue,
} from "./merchant.ts";
import { abilityDef } from "./defs/abilities.ts";
import type { Equipment, GameState, MerchantStock } from "./types.ts";

/** Bag cells the autopilot keeps FREE, so the next find always has a home —
 * the "one slot open" discipline a human keeps so a drop is never refused. */
export const BOT_BAG_KEEP_FREE = 1;

/** Outgrown (sellable) pieces in the bag before a dedicated SELL RUN to the
 * merchant is worth the walk — fewer and the coins don't pay for the detour. */
const SELL_RUN_MIN_JUNK = 3;

/** Held-weapon durability fraction at/below which the hero is one fight from
 * being dumped onto the sidearm — the starvation line the merchant errand
 * (and the campaign sim's autoShop) trip on. */
const STARVED_DURABILITY_FRAC = 0.15;

/** Held-weapon durability fraction at/below which a paid repair at the counter
 * is worth a visit (when no repair kit is stocked). Looser than the starvation
 * line so the kit is mended BEFORE the blade actually gives out. */
const REPAIR_VISIT_FRAC = 0.35;

/**
 * Can the hero no longer fight his way forward with what's in his hand — he's
 * on the unbreakable fallback sidearm, or his held weapon is about to snap?
 * The cue that a merchant visit is URGENT rather than a convenience. Pure.
 */
export function weaponStarved(state: GameState): boolean {
  const w = state.player.equipment.weapon;
  if (w.defId === "blaster") return true; // dumped onto the fallback sidearm
  if (w.durability === undefined) return false; // a keeper unique/legendary
  const max = equipmentMaxDurability(w);
  return (
    max > 0 &&
    w.durability <= Math.max(1, Math.floor(max * STARVED_DURABILITY_FRAC))
  );
}

/** How many bag pieces are OUTGROWN junk (see `isScrappableLoot`) — neither
 * special nor as good as what's worn. These are the merchant fodder the bot
 * banks for coins; everything else in the bag is a keeper. Pure. */
export function sellableJunkCount(state: GameState): number {
  let n = 0;
  for (const cell of state.player.inventory) {
    if (cell && isScrappableLoot(state, cell)) n++;
  }
  return n;
}

/**
 * BAG DISCIPLINE: keep {@link BOT_BAG_KEEP_FREE} cell(s) open by dropping the
 * bag's obviously-bad pieces, worst first — the least-valuable OUTGROWN item
 * (lowest `sellValue` among `isScrappableLoot`) goes over the shoulder until a
 * slot is free. Keepers are never dropped: specials (uniques/sets/legendaries,
 * gate keys, passive trinkets), upgrades and side-grades all stay, and the
 * junk that survives the cull stays too — it is the merchant fodder the hero
 * carries to the counter. A bag full of nothing but keepers stays full (a
 * human doesn't trash a unique for pocket room either). Returns the dropped
 * pieces. Called by the bot harnesses each tick; cheap when a slot is already
 * open.
 */
export function cullWorstLoot(state: GameState): Equipment[] {
  const inv = state.player.inventory;
  const dropped: Equipment[] = [];
  let free = 0;
  for (const cell of inv) {
    if (cell === null) free++;
  }
  while (free < BOT_BAG_KEEP_FREE) {
    let worst = -1;
    let worstWorth = Infinity;
    for (let i = 0; i < inv.length; i++) {
      const item = inv[i];
      if (!item || !isScrappableLoot(state, item)) continue;
      const worth = sellValue(item);
      if (worth < worstWorth) {
        worstWorth = worth;
        worst = i;
      }
    }
    if (worst < 0) break; // nothing but keepers — a full bag of value stands
    dropped.push(inv[worst] as Equipment);
    inv[worst] = null;
    free++;
  }
  return dropped;
}

/** Is a stall weapon on the counter that the hero could buy, wield, and that
 * genuinely beats what's in his hand? The "the walk would re-arm me" probe. */
function affordableStallUpgrade(state: GameState): boolean {
  const held = weaponScore(state, state.player.equipment.weapon);
  for (const entry of state.merchant.stock) {
    if (entry.kind !== "weapon" || entry.sold) continue;
    if (!canBuyStock(state, entry) || !canEquip(state, entry.equipment)) {
      continue;
    }
    if (weaponScore(state, entry.equipment) > held) return true;
  }
  return false;
}

/** Is the kit worn enough that a PAID mend is worth the counter visit — the
 * held weapon wearing thin, or a broken spare shed into the bag? */
function kitWornOut(state: GameState): boolean {
  if (state.player.inventory.some((c) => c !== null && isWeaponBroken(c))) {
    return true;
  }
  const w = state.player.equipment.weapon;
  if (w.durability === undefined) return false;
  const max = equipmentMaxDurability(w);
  return max > 0 && w.durability / max <= REPAIR_VISIT_FRAC;
}

/**
 * Does a walk to the (already met) merchant PAY right now? True when the visit
 * would resolve something: the hero is weapon-starved and the counter can fix
 * it (junk to bank for coins, or an affordable stall upgrade already waiting),
 * the bag has piled up a sell-run's worth of outgrown loot, or the kit is
 * worn out with no repair kit stocked and the purse covers the mend. Every
 * clause clears itself after a `tradeAtMerchant`, so the errand can't loop.
 * Pure — `bot.ts` reads it to steer, the harnesses to trade.
 */
export function wantsMerchantVisit(state: GameState): boolean {
  if (!state.merchant.discovered) return false;
  const junk = sellableJunkCount(state);
  if (weaponStarved(state) && (junk > 0 || affordableStallUpgrade(state))) {
    return true;
  }
  if (junk >= SELL_RUN_MIN_JUNK) return true;
  if (state.player.repairKits === 0 && kitWornOut(state)) {
    const cost = repairAllCost(state);
    if (cost > 0 && state.player.coins >= cost) return true;
  }
  return false;
}

/**
 * How precious a powerup is to the bot — its one ranking of the whole ability
 * catalog, shared by the stall (buy the best first) and the field play
 * (bot.ts `pickPowerupSlot`: save the best for its moment, burn the cheapest
 * for shelf space). The NUKE tops it (a banked bomb changes how bravely the
 * bot can play — see bot.ts `hasNukeBanked`); the STORM out-damages the ORBIT
 * ring; the STASIS slow and the MAGNET's convenience pull bring up the rear.
 * An unknown future kind lands mid-table, treated like a combat power.
 */
export function abilityValue(defId: string): number {
  switch (abilityDef(defId).kind) {
    case "nuke":
      return 4;
    case "storm":
      return 3;
    case "orbit":
      return 2;
    case "stasis":
      return 1;
    case "magnet":
      return 0;
    default:
      return 2;
  }
}

/**
 * THE COUNTER ROUTINE — what a competent player does at the stall, in order:
 * bank the bag's outgrown junk for coins (keepers stay), buy the best weapon
 * upgrade the purse covers and the hero can wield, mend the whole kit, then
 * spend what's left on POWERUPS (nuke first) while keeping enough back to
 * afford the next mend. Opens and closes the shop itself; only fires when the
 * hero is actually at the counter (`openShop` is proximity-gated) — returns
 * whether a visit really happened, so callers can cool down on it. Mutates
 * state (a harness-side action, like `autoEquipBest` — never called from the
 * pure `botAct`).
 */
export function tradeAtMerchant(state: GameState): boolean {
  if (!openShop(state)) return false;
  // SELL: every outgrown piece across the counter. The cull (cullWorstLoot)
  // only ever drops the cheapest junk in the field, so the good junk lands
  // here — the whole reason the bag hauls it.
  const inv = state.player.inventory;
  for (let i = 0; i < inv.length; i++) {
    const item = inv[i];
    if (item && isScrappableLoot(state, item)) sellItem(state, i);
  }
  // BUY the single best wieldable weapon upgrade the purse covers.
  let bestId = -1;
  let bestScore = weaponScore(state, state.player.equipment.weapon);
  for (const entry of state.merchant.stock) {
    if (entry.kind !== "weapon" || entry.sold) continue;
    if (!canBuyStock(state, entry) || !canEquip(state, entry.equipment)) {
      continue;
    }
    const score = weaponScore(state, entry.equipment);
    if (score > bestScore) {
      bestScore = score;
      bestId = entry.id;
    }
  }
  if (bestId >= 0) buyStock(state, bestId);
  // MEND the whole kit (refused on its own when nothing needs it or the
  // purse is short — a free no-op).
  repairGear(state);
  // POWERUPS with the spare coins — most precious first (abilityValue) —
  // keeping a reserve big enough to pay for the kit's next mend. `buyStock`
  // restocks abilities, so keep buying a useful one until the purse (or the
  // carry cap) says stop.
  const reserve = repairAllCost(state);
  const powerups = state.merchant.stock
    .filter(
      (e): e is Extract<MerchantStock, { kind: "ability" }> =>
        e.kind === "ability",
    )
    .sort((a, b) => abilityValue(b.defId) - abilityValue(a.defId));
  for (const entry of powerups) {
    while (
      state.player.coins - entry.price >= reserve &&
      buyStock(state, entry.id)
    ) {
      // keep stocking up while it pays
    }
  }
  closeShop(state);
  // Wear the purchase (and anything freed by the mend) on the spot.
  autoEquipBest(state);
  return true;
}
