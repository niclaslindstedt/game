// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CACHE — the antique chest against the garage's north wall, and the only
// place in the game a piece of gear can be KEPT without being carried.
//
// WHY IT EXISTS. Everything the hero owns rides on his body: what is worn, and
// what fits in the bag. That is fine for loot, which is meant to be spent or
// sold — but it makes the piece a player is SAVING (the off-build unique, the
// set item three pieces short, the weapon for a level they have not reached)
// cost a bag cell for as long as they save it. A chest in the hub is D2's
// answer and it is the right one: the bag stays a bag, and keeping something
// stops competing with carrying something.
//
// FOUR RULES HOLD IT UP.
//
// 1. IT IS A FIXTURE, NOT AN ITEM. The chest is a place on a map (`cachePos`,
//    off the carve like any landmark), never a thing in a bag. It cannot be
//    carried, dropped, sold or lost, and there is exactly one.
//
// 2. IT IS THE HUB'S ALONE. Only the garage's blueprint stands one, and that
//    is the whole balance of the feature: a stash reachable mid-mission is a
//    bag with no cap, and the decision the bag exists to force — what do I
//    carry home — would stop being a decision. Everywhere else `cachePos` is
//    null and the verbs below simply refuse.
//
// 3. THE CHEST IS PUBLIC, ITS CONTENTS ARE PRIVATE. In a co-op session anybody
//    may walk up to it and open THEIR OWN (`Player.cache`, withheld from every
//    other seat like the bag — see PRIVATE_PLAYER_FIELDS). One piece of
//    furniture, one stash per hero.
//
// 4. OWNING IT IS A SESSION PARAMETER. `cacheOwned` is built from the
//    CHARACTER's keepsakes before the first tick, never discovered mid-run —
//    or a joiner and the host would build different worlds from the same seed.
//    The single exception is the moment it is EARNED (`grantCache`), which is
//    an engine event both ends see.

import { distance, type Vec2 } from "@game/lib/vec.ts";

import { CACHE } from "./config/index.ts";
import { syncInventoryCapacity } from "./items/index.ts";
import { isOfferedInTrade } from "./trade.ts";
import type { Equipment, GameState, Player } from "./types/index.ts";

/** A fresh, empty chest — `CACHE.slots` null cells, laid out like the bag. */
export function emptyCache(): (Equipment | null)[] {
  return new Array<Equipment | null>(CACHE.slots).fill(null);
}

/**
 * Normalize a chest that arrived from outside the engine (a loadout banked
 * before the chest shipped, a save from a build with a different `CACHE.slots`,
 * a mod's own number). Always returns exactly `CACHE.slots` cells: short lists
 * are padded, and a longer one is truncated from the END — where a shrink can
 * only ever lose the cells a smaller chest never had.
 */
export function normalizeCache(
  cells: readonly (Equipment | null)[] | undefined,
): (Equipment | null)[] {
  const out = emptyCache();
  for (let i = 0; i < Math.min(CACHE.slots, cells?.length ?? 0); i++) {
    out[i] = cells?.[i] ?? null;
  }
  return out;
}

/**
 * Is the chest standing on this map, and does this hero own it? Both halves,
 * because either alone is a lie: the garage always has a SPOT for one, and a
 * hero who has earned the chest still cannot reach it from Mars.
 */
export function cacheStanding(state: GameState): boolean {
  return state.cacheOwned && state.cachePos !== null;
}

/**
 * HAND THE CHEST OVER — Ruth's payout, and the only way one is ever earned.
 *
 * It lands at the spot the CARVE reserved for it (`cachePos`, the bay's north
 * wall) rather than at the giver's feet: a chest is furniture, and furniture
 * goes where it lives. `cacheArriveMs` starts the arrival the app dramatizes,
 * and the tap is held until it finishes — nobody opens a chest that is still
 * becoming one.
 *
 * Idempotent. An errand cannot be handed in twice, but a mod could easily wire
 * two that pay it, and the second must not re-run the arrival on a chest the
 * hero has been using for an hour.
 *
 * Returns where it landed, or null when there was nowhere to put it (any map
 * but the hub) — a caller that pays the chest somewhere it cannot stand has
 * authored a bug, and a silent no-op is how it would ship.
 */
export function grantCache(state: GameState): Vec2 | null {
  const pos = state.cachePos;
  if (!pos) return null;
  if (state.cacheOwned) return pos;
  state.cacheOwned = true;
  state.cacheArriveMs = CACHE.arriveMs;
  state.events.push({ type: "cacheGiven", pos: { ...pos } });
  return pos;
}

/**
 * Count the arrival off. Called from the step beside every other timer; a
 * no-op on every tick of every run where the chest is already furniture.
 */
export function stepCache(state: GameState, dtMs: number): void {
  if (state.cacheArriveMs === undefined || state.cacheArriveMs <= 0) return;
  state.cacheArriveMs = Math.max(0, state.cacheArriveMs - dtMs);
}

/**
 * Open the chest for this hero: only mid-run, only where one stands, only once
 * it has finished arriving, and only with the hero actually at it (
 * `CACHE.tapRadius`).
 *
 * `hero` is the one who TAPPED — on the wire, the seat the session admitted the
 * client into — emphatically not "any hero", or a player across the lot would
 * find the chest open in front of them because somebody else walked up to it.
 * Returns false when any gate refuses, so the app can ignore a stray tap.
 */
export function openCache(state: GameState, hero: Player): boolean {
  if (state.phase !== "playing" || hero.screen !== undefined) return false;
  if (!cacheStanding(state)) return false;
  if ((state.cacheArriveMs ?? 0) > 0) return false;
  if (distance(hero.pos, state.cachePos!) > CACHE.tapRadius) return false;
  hero.screen = "cache";
  return true;
}

/** Close the chest. */
export function closeCache(hero: Player): void {
  if (hero.screen !== "cache") return;
  delete hero.screen;
}

/**
 * PUT the piece in bag cell `index` into the chest — into the first free cell,
 * so the player never has to aim at a slot. Only with the chest open, and only
 * from a cell that holds something.
 *
 * Returns the chest cell it landed in, or null when the bag cell was empty or
 * the chest is full (no mutation either way — a refused move must leave the
 * piece exactly where the player last saw it).
 */
export function stashItem(
  state: GameState,
  hero: Player,
  index: number,
): number | null {
  if (hero.screen !== "cache") return null;
  const item = hero.inventory[index];
  if (!item) return null;
  // A PIECE ON A TRADE TABLE STAYS IN THE BAG UNTIL IT CROSSES (src/game/
  // trade.ts). The settle would catch it anyway — the offer names the cell AND
  // the id — but the player who stashed it would have no idea why the trade
  // failed a minute later. The same guard `equipFromInventory` carries.
  if (isOfferedInTrade(state, hero, index)) return null;
  const free = hero.cache.indexOf(null);
  if (free < 0) return null;
  hero.cache[free] = item;
  hero.inventory[index] = null;
  return free;
}

/**
 * TAKE the piece in chest cell `index` back into the bag — the mirror of
 * `stashItem`, and it fails the same way: a full bag simply refuses, leaving
 * the piece in the chest where the player can still see it. NEVER onto the
 * floor, which is the one outcome a stash must not have.
 *
 * The capacity read is `syncInventoryCapacity` rather than the raw array
 * length, because a bag's width follows STRENGTH and the worn bag — a hero who
 * dropped their satchel between visits has fewer cells than the list has slots.
 *
 * Returns the bag cell it landed in, or null on an empty cell or a full bag.
 */
export function takeFromCache(
  state: GameState,
  hero: Player,
  index: number,
): number | null {
  if (hero.screen !== "cache") return null;
  const item = hero.cache[index];
  if (!item) return null;
  syncInventoryCapacity(state, hero);
  const free = hero.inventory.indexOf(null);
  if (free < 0) return null;
  hero.inventory[free] = item;
  hero.cache[index] = null;
  return free;
}
