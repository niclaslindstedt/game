// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LOAD ORDER — which mods are on, in what order, and how a clash resolves.
//
// Pure functions over the persisted list and whatever is installed right now.
// It imports nothing but the settings leaf, for the same reachability reason
// `mod-state.ts` imports nothing at all: the MODS screen is on the app's
// startup path and must not drag the simulation in behind it.
//
// THE RULE IS **LATER WINS**, and it is one rule for every kind of content —
// sprites, levels, enemies alike. Two mods that ship the same sprite both
// compile perfectly: each was authored alone, and its author never saw the
// other. So a clash between mods is not something validation can catch the way
// a clash with the base game is, and it cannot be resolved by the compiler at
// all. It is resolved at LOAD, by an order the player owns — which makes "move
// it down to make it win" the fix, rather than "ask one of the two authors to
// rename their sprite".
//
// The persisted list is the SOURCE OF TRUTH for order, not the installed set.
// Mods arrive and leave as the player subscribes and unsubscribes, and a list
// rebuilt from whatever is installed would reshuffle itself every time that
// happened — silently changing which mod wins. So entries persist for mods that
// are no longer installed (they cost nothing and are filtered at apply), and a
// newly-seen mod is APPENDED, landing last: a fresh subscription wins its
// clashes by default, which is what a player who just installed something
// expects to see.

import type { ModOrderEntry } from "./settings.ts";

/** One row of the MODS screen: a mod, its place, and whether it is switched
 * on. Keyed by mod id — the compiled bundle's `id`, not the folder. */
export type OrderedMod<T> = {
  id: string;
  mod: T;
  on: boolean;
};

/**
 * Merge the persisted order with what is actually installed.
 *
 * @param stored     the persisted list, oldest-known first
 * @param installed  what is on disk now, as `[id, value]` pairs
 * @returns the installed mods in load order, plus the list to persist back
 *          (which keeps rows for mods that are not installed right now)
 */
export function resolveOrder<T>(
  stored: ModOrderEntry[],
  installed: [string, T][],
): { rows: OrderedMod<T>[]; order: ModOrderEntry[] } {
  const byId = new Map(installed);
  const known = new Set<string>();
  const order: ModOrderEntry[] = [];

  // Everything already ranked keeps its rank, installed or not.
  for (const entry of stored) {
    if (known.has(entry.id)) continue;
    known.add(entry.id);
    order.push(entry);
  }
  // Anything new lands at the END — last, so it wins its clashes. A mod the
  // player just subscribed to doing nothing visible because an older mod
  // outranks it is the worst possible first impression.
  for (const [id] of installed) {
    if (known.has(id)) continue;
    known.add(id);
    order.push({ id, on: true });
  }

  const rows: OrderedMod<T>[] = [];
  for (const entry of order) {
    const mod = byId.get(entry.id);
    if (mod === undefined) continue; // ranked but not installed right now
    rows.push({ id: entry.id, mod, on: entry.on });
  }
  return { rows, order };
}

/** Flip one mod on or off, leaving its rank alone. */
export function setModEnabled(
  order: ModOrderEntry[],
  id: string,
  on: boolean,
): ModOrderEntry[] {
  return order.map((entry) => (entry.id === id ? { ...entry, on } : entry));
}

/**
 * Move one mod one place earlier (`-1`) or later (`+1`).
 *
 * It steps over the entries that are not installed rather than counting them,
 * so a press moves the row the player can SEE by one row. Otherwise a list with
 * three stale entries between two visible mods takes four presses to reorder,
 * with nothing on screen changing for the first three.
 */
export function moveMod(
  order: ModOrderEntry[],
  id: string,
  dir: -1 | 1,
  isInstalled: (id: string) => boolean,
): ModOrderEntry[] {
  const from = order.findIndex((entry) => entry.id === id);
  if (from < 0) return order;

  let to = from + dir;
  while (to >= 0 && to < order.length && !isInstalled(order[to]!.id)) {
    to += dir;
  }
  if (to < 0 || to >= order.length) return order; // already at its end

  const next = [...order];
  const [moved] = next.splice(from, 1);
  if (!moved) return order;
  next.splice(to, 0, moved);
  return next;
}
