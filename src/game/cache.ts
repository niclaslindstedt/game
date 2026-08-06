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
// FIVE RULES HOLD IT UP.
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
// 3. IT GROWS WITH THE LADDER, AND ONLY UPWARD. Ruth's last errand runs once
//    per difficulty, and each rung she brings something further back out of her
//    mother's house — a bigger piece of furniture with its own name, worth one
//    more ROW (`DifficultyDef.cache`, 16 → 24 → 32 → 40 → 48, the last of them
//    D2's own stash). What a hero OWNS is the deepest they have ever been paid,
//    a HIGH-WATER MARK that a fresh run on a gentler rung never claws back:
//    a stash that shrank when you started an easier game would have to pick
//    which of the player's things to throw away. The cells themselves are
//    always `CACHE.maxSlots` long so there is nothing to pick.
//
// 4. THE CHEST IS PUBLIC, ITS CONTENTS ARE PRIVATE. In a co-op session anybody
//    may walk up to it and open THEIR OWN (`Player.cache`, withheld from every
//    other seat like the bag — see PRIVATE_PLAYER_FIELDS). One piece of
//    furniture, one stash per hero.
//
// 5. OWNING IT IS A SESSION PARAMETER. `cacheSlots` is built from the
//    CHARACTER's own high-water mark before the first tick, never discovered
//    mid-run — or a joiner and the host would build different worlds from the
//    same seed. The single exception is the moment it is EARNED or GROWN
//    (`grantCache`), which is an engine event both ends see.

import { distance, type Vec2 } from "@game/lib/vec.ts";

import { CACHE } from "./config/index.ts";
import { DIFFICULTY_ORDER, difficultyDef } from "./defs/difficulties.ts";
import { syncInventoryCapacity } from "./items/index.ts";
import { isOfferedInTrade } from "./trade.ts";
import type { Equipment, GameState, Player } from "./types/index.ts";

/** A fresh, empty chest — always `CACHE.maxSlots` cells, whatever the hero has
 * actually earned. See rule 3: the array is the CEILING, and how much of it is
 * usable is the run's `cacheSlots`. */
export function emptyCache(): (Equipment | null)[] {
  return new Array<Equipment | null>(CACHE.maxSlots).fill(null);
}

/**
 * Normalize a chest that arrived from outside the engine (a loadout banked
 * before the chest shipped, a save from a build with a different ceiling, a
 * mod's own number). Always returns exactly `CACHE.maxSlots` cells: short lists
 * are padded, and a longer one is truncated from the END.
 *
 * Because the array is the CEILING rather than the rung, this never runs on the
 * path that would hurt — dropping from JESUS back to EASY changes `cacheSlots`,
 * not the list, so nothing the player owns is anywhere near the cut.
 */
export function normalizeCache(
  cells: readonly (Equipment | null)[] | undefined,
): (Equipment | null)[] {
  const out = emptyCache();
  for (let i = 0; i < Math.min(CACHE.maxSlots, cells?.length ?? 0); i++) {
    out[i] = cells?.[i] ?? null;
  }
  return out;
}

/**
 * How deep a chest THIS RUNG pays, or 0 for a rung that names none (the test
 * fixtures). Read wherever the ladder is asked rather than reaching into the
 * difficulty def, so a mod that ships its own rungs works unchanged.
 */
export function cacheSlotsFor(difficulty: string): number {
  return difficultyDef(difficulty).cache?.slots ?? 0;
}

/**
 * WHAT AUTHORED DIALOGUE WRITES where the rung's own provenance line goes —
 * `{CACHE}`, on its own as a whole page.
 *
 * The same idiom (and the same brace reasoning) as `{HERO}`: no line in the
 * game legitimately contains a brace, the pixel font has no glyph for one, so a
 * token that failed to resolve is loud on screen rather than quietly shipping.
 *
 * It exists because the ERRAND is one file and the LADDER is five: Ruth hands
 * the chest over on every difficulty and says something different about where
 * it came from each time (a flea market, her mother, a crossing, a dowry, a
 * king), and writing five copies of THE SCALE to say five sentences would put
 * the ladder in the wrong place. The rung owns its line; the errand says where
 * the line lands.
 */
export const CACHE_TOKEN = "{CACHE}";

/**
 * Resolve `{CACHE}` in one authored page against the rung being played.
 *
 * Returns the SAME array when there is nothing to replace, which is every page
 * of every other errand in the game. A rung with no chest resolves the token to
 * nothing and the page is DROPPED by the caller rather than left blank — an
 * empty box the player has to tap through is worse than a beat that is not
 * there.
 */
export function resolveCacheLine(
  page: readonly string[],
  difficulty: string,
): readonly string[] | null {
  if (!page.some((line) => line.includes(CACHE_TOKEN))) return page;
  const line = difficultyDef(difficulty).cache?.line;
  if (!line) return null;
  return page.map((text) => text.split(CACHE_TOKEN).join(line));
}

/** What Ruth calls the chest this rung pays, or null for a rung with none. */
export function cacheNameFor(difficulty: string): string | null {
  return difficultyDef(difficulty).cache?.name ?? null;
}

/**
 * WHICH CHEST A HERO WHO HAS EARNED `slots` IS LOOKING AT — the deepest rung on
 * the ladder they have been paid, with its name and its sprite.
 *
 * Keyed off the EARNED DEPTH rather than off the rung being played, and that is
 * the whole reason it exists: a hero who beat NIGHTMARE and started a fresh
 * EASY run is still standing in front of the dowry chest, and the title over
 * the window and the thing in the garage must both say so. Returns null for a
 * hero with no chest.
 *
 * Read by the renderer (which sprite stands there), the panel (what it is
 * called) and nothing else — it is presentation, derived, never stored.
 */
export function cacheRungFor(
  slots: number,
): { name: string; slots: number; sprite: string } | null {
  let best: { name: string; slots: number; sprite: string } | null = null;
  for (const id of DIFFICULTY_ORDER) {
    const rung = difficultyDef(id).cache;
    if (!rung || rung.slots > slots) continue;
    if (!best || rung.slots > best.slots) best = rung;
  }
  return best;
}

/**
 * Is the chest standing on this map, and does this hero own one? Both halves,
 * because either alone is a lie: the garage always has a SPOT for one, and a
 * hero who has earned the chest still cannot reach it from Mars.
 */
export function cacheStanding(state: GameState): boolean {
  return state.cacheSlots > 0 && state.cachePos !== null;
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
 * IT ONLY EVER GROWS. Running the errand again on a DEEPER rung replaces the
 * chest with that rung's — a new name, another row of cells, and the arrival
 * plays again, because a bigger piece of furniture arriving is exactly what
 * happened. Running it on a rung at or below what the hero already has is a
 * no-op: the errand still pays its XP, coins and loot, but nothing about the
 * chest changes and the arrival does NOT replay over a chest that is already
 * standing there being used.
 *
 * Returns where it landed when the chest grew, or null when there was nowhere
 * to put one (any map but the hub) or nothing to add.
 */
export function grantCache(state: GameState): Vec2 | null {
  const pos = state.cachePos;
  if (!pos) return null;
  const slots = cacheSlotsFor(state.difficulty);
  if (slots <= state.cacheSlots) return null;
  state.cacheSlots = slots;
  state.cacheArriveMs = CACHE.arriveMs;
  state.events.push({
    type: "cacheGiven",
    pos: { ...pos },
    slots,
    name: cacheNameFor(state.difficulty) ?? "",
  });
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
 * it has finished arriving, and only with the hero actually at it
 * (`CACHE.tapRadius`).
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
 * PUT the piece in bag cell `index` into the chest — into the first free cell
 * the hero has actually EARNED, so the player never has to aim at a slot. Only
 * with the chest open, and only from a cell that holds something.
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
  // Only the EARNED cells are searched. The list is always the ceiling long,
  // and the rows past this rung's chest are locked rather than absent — a
  // piece put into one would be invisible until the player beat a difficulty.
  const free = hero.cache.findIndex(
    (cell, i) => cell === null && i < state.cacheSlots,
  );
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
 * A cell PAST what this hero has earned still gives its piece up, and
 * deliberately: nothing should ever put one there, but if a save from a deeper
 * rung somehow does, the way out has to be open. Locking it would be the one
 * bug in the feature the player could not work around.
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
