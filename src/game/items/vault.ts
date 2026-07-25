// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LOST & FOUND — the vault that catches what the AUTO PILOT throws away.
//
// A watched hero empties his own bag; an unattended one cannot. The ride's bag
// discipline (bot/economy.ts `cullWorstLoot`) sheds the worst piece to make
// room for the next find, and over a long flight — the horde paying out
// uniques faster than seven cells can hold them — the "worst" piece can still
// be something the player would have wanted. Rather than destroy it, the ride
// BANKS it here; the player buys it back afterwards from the title screen's
// LOST & FOUND, priced by tier (config `VAULT.reclaimCost`).
//
// The vault rides the LOADOUT (arrival.ts), so it survives the level-to-level
// hops a multi-lap flight makes and lands on the character with everything
// else the run banked.

import { ECONOMY, VAULT } from "../config/index.ts";
import { tierRank } from "../defs/equipment.ts";
import type { Equipment, GameState, Tier } from "../types/index.ts";
import { sellValue } from "./worth.ts";

/**
 * Is this piece worth banking rather than binning? Everything from
 * `VAULT.minTier` up (magic and better). Plain and trash finds are exactly
 * what the cull exists to shed — banking them would bury the one item worth
 * rescuing under a list of grey mops.
 */
export function isVaultWorthy(item: Equipment): boolean {
  return tierRank(item.tier) >= tierRank(VAULT.minTier as Tier);
}

/**
 * Coins to buy `item` back out of the LOST & FOUND: its tier's rung on the
 * `VAULT.reclaimCost` ladder (≈ ×3 a rung, 10 million for a magic up to 2
 * billion for an artifact). A flat per-tier price on purpose — the thing being
 * priced is the RARITY the ride threw away, not the individual roll, and a
 * price that moved with ilvl would make the ladder unreadable.
 */
export function reclaimCost(item: Equipment): number {
  return VAULT.reclaimCost[item.tier];
}

/**
 * How precious a piece is to the vault, as a sortable key: its TIER first,
 * its sell value second. The same ordering the cull sheds by, so what the
 * vault evicts under pressure is always the least precious thing in it.
 */
export function vaultWorth(item: Equipment): number {
  // Tier dominates absolutely — a legendary outranks any rare, whatever their
  // ilvls — so the rank is scaled past any reachable sell value before the
  // value breaks ties within a tier. The top rung's own multiplier bounds
  // every in-tier value, so one rank step can never be out-bid from below.
  const span = ECONOMY.tierValueMult.artifact * 1_000_000;
  return tierRank(item.tier) * span + Math.min(sellValue(item), span - 1);
}

/**
 * Bank a thrown-away piece in the LOST & FOUND. Junk below `VAULT.minTier` is
 * refused (it is simply dropped — the caller keeps it either way), and at
 * `VAULT.capacity` the LEAST precious entry is pushed out to make room, so a
 * days-long ride keeps the treasure rather than the backlog. A find that
 * cannot beat what is already banked is not stored at all.
 *
 * Returns whether the piece was banked.
 */
export function vaultItem(state: GameState, item: Equipment): boolean {
  if (!isVaultWorthy(item)) return false;
  const vault = state.player.vault;
  if (vault.length < VAULT.capacity) {
    vault.push(item);
    return true;
  }
  // Full: find the least precious entry and let the newcomer displace it, but
  // only if it genuinely outranks it — otherwise the vault already holds a
  // better set and the piece goes the way of the junk.
  let worst = 0;
  let worstWorth = Infinity;
  for (let i = 0; i < vault.length; i++) {
    const worth = vaultWorth(vault[i] as Equipment);
    if (worth < worstWorth) {
      worstWorth = worth;
      worst = i;
    }
  }
  if (vaultWorth(item) <= worstWorth) return false;
  vault[worst] = item;
  return true;
}

/**
 * The vault in the order the LOST & FOUND lists it: most precious first. A
 * copy — the caller sorts nothing in place, so the banked order (and the
 * eviction it drives) is untouched.
 */
export function vaultContents(vault: readonly Equipment[]): Equipment[] {
  return [...vault].sort(
    (a, b) => vaultWorth(b) - vaultWorth(a) || a.id - b.id,
  );
}

/**
 * Empty the LOST & FOUND — whatever was not bought back is TRASHED, for good.
 *
 * The vault is a HOLDING PEN, not a second stash: it holds what the LAST paid
 * flight threw away, and engaging the NEXT one clears it (the app calls this
 * when the player starts a ride — see the AUTO PILOT picker). That is what
 * keeps it honest: a permanent free warehouse of everything a long grind ever
 * shed would be a better bag than the bag, and the buy-back price would mean
 * nothing if the offer never expired. Returns how many pieces were binned, so
 * the caller can say so.
 */
export function clearVault(state: GameState): number {
  const binned = state.player.vault.length;
  state.player.vault.length = 0;
  return binned;
}
