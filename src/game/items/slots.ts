// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SLOT VOCABULARY: which item kinds exist, where each is worn, and the
// guard save-loading uses to spot a kind this build has retired.
//
// This module is a LEAF — it imports nothing but types, on purpose. The
// startup path (`@game/menu`) re-exports `isLiveItemSlot` so a save can be
// read and re-homed before a run exists; were this vocabulary to live in
// `derived.ts` beside the stat maths, that one read would drag the config,
// the difficulty catalog, the set catalog and the leveling curve onto the
// critical path. Same reasoning as `flags.ts` (see CLAUDE.md).

import type { EquipSlot, ItemSlot } from "../types/index.ts";

/**
 * The equipment slots, in their canonical (paper-doll) order — the keys of
 * `Player.equipment`. The allocation-free derived-stat walks iterate these
 * instead of building a fresh pieces array per read.
 */
export const EQUIP_SLOTS = [
  "weapon",
  "head",
  "chest",
  "legs",
  "feet",
  "amulet",
  "ring1",
  "ring2",
  "bag",
] as const;

/** The two ring fingers, in the order a newly-worn ring looks for a home. */
export const RING_SLOTS = ["ring1", "ring2"] as const;

/** Every item KIND the game still knows how to carry or wear. */
export const ITEM_SLOTS: readonly ItemSlot[] = [
  "weapon",
  "head",
  "chest",
  "legs",
  "feet",
  "amulet",
  "ring",
  "trinket",
  "bag",
];

/**
 * Is this piece's kind one the game still has a home for? The guard every
 * SAVE-loading path runs each persisted piece through: a loadout banked
 * before a slot revamp can carry a kind that no longer exists (the old `suit`
 * pieces), and such a piece is left behind rather than crashing the load.
 *
 * It asks about the KIND, not about a free slot — a `ring` is live even though
 * no `ring` key exists on the equipment record, and so is a `trinket`, which
 * is never worn at all. A retired kind that still has a successor is REWRITTEN
 * rather than dropped, upstream of this in `adoptEquipment` (charm → trinket).
 */
export function isLiveItemSlot(slot: string): slot is ItemSlot {
  return (ITEM_SLOTS as readonly string[]).includes(slot);
}

/**
 * May a piece of this KIND be worn in `slot`? The one place the
 * ring-fills-either-finger rule is spelled out — every other kind names its
 * own slot, and a TRINKET fits nowhere (it is carried, never worn).
 */
export function fitsEquipSlot(item: ItemSlot, slot: EquipSlot): boolean {
  if (item === "trinket") return false;
  if (item === "ring") return slot === "ring1" || slot === "ring2";
  return item === slot;
}

/**
 * Where a piece of this KIND is worn, ignoring what the hero already has on.
 * A ring answers its FIRST finger; the equip paths call `wearSlotFor`
 * (inventory.ts) instead, which picks the finger that is actually free. A
 * TRINKET answers null: it is never worn, it pays out from the bag.
 */
export function equipSlotForItem(slot: ItemSlot): EquipSlot | null {
  if (slot === "trinket") return null;
  return slot === "ring" ? "ring1" : slot;
}
