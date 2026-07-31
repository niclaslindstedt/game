// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The bag: STRENGTH-scaled capacity, the equip/unequip/move/add/discard
// mutators the app's drag-and-drop UI calls into, and the travel-gate keys
// spent from a cell.

import { clamp } from "@game/lib/vec.ts";
import { GATES, LOOT, STATS } from "../config/index.ts";
import { gearDef, isWeaponDef } from "../defs/equipment.ts";
import { runLevelDef } from "../defs/levels/index.ts";
import type {
  Equipment,
  EquipSlot,
  GameState,
  RingSlot,
} from "../types/index.ts";
import {
  effectiveStat,
  recomputeMaxHp,
  recomputeMaxStamina,
} from "./derived.ts";
import { freeHandsFor } from "./hands.ts";
import { equipSlotForItem, fitsEquipSlot, RING_SLOTS } from "./slots.ts";
import { canEquip } from "./requirements.ts";
import { gearScore } from "./weapon-math.ts";

// ---- Where a piece is worn ----------------------------------------------------

/**
 * WHICH ring finger a newly-worn ring takes: the first FREE one, or — with
 * both taken — the WEAKER of the two, so an upgrade always displaces the ring
 * it actually beats instead of always clobbering `ring1`. The displaced ring
 * is what the caller swaps back into the bag.
 */
export function ringSlotFor(state: GameState): RingSlot {
  const equipment = state.players[0].equipment;
  for (const slot of RING_SLOTS) if (!equipment[slot]) return slot;
  const [first, second] = RING_SLOTS;
  return gearScore(equipment[second] as Equipment) <
    gearScore(equipment[first] as Equipment)
    ? second
    : first;
}

/**
 * WHERE this piece would be worn right now — the bridge from what an item IS
 * (`ItemSlot`) to where it goes (`EquipSlot`). Rings resolve to a finger via
 * `ringSlotFor`; a TRINKET answers null, because it is never worn at all (it
 * pays out from the bag — see `carriedTrinkets`). Every equip path routes
 * through this so the two rules live in exactly one place.
 */
export function wearSlotFor(
  state: GameState,
  piece: Equipment,
): EquipSlot | null {
  if (piece.slot === "trinket") return null;
  if (piece.slot === "ring") return ringSlotFor(state);
  return equipSlotForItem(piece.slot);
}

/**
 * The worn piece this candidate would REPLACE — what an item card compares
 * against ("is this an upgrade?"). Null when nothing would be displaced:
 * the slot is empty, or the piece is a TRINKET, which is never worn and so
 * has no counterpart to be judged against.
 *
 * For a RING this is the WEAKER of the two worn rings, matching where the
 * piece would actually land, so the comparison a player reads is the trade
 * they would actually make.
 */
export function wornCounterpart(
  state: GameState,
  piece: Equipment,
): Equipment | null {
  const slot = wearSlotFor(state, piece);
  return slot ? state.players[0].equipment[slot] : null;
}

// ---- Inventory capacity (STRENGTH-scaled) --------------------------------------

/**
 * Extra cells granted by the BAG worn in the OFFHAND slot (its
 * `GearDef.bagSlots`), or 0 when the second arm is empty or holding a SHIELD.
 * A bag only pays out from the slot — one sitting in a cell is just loot until
 * it's equipped, and a hero who chose the shield chose the smaller carry.
 */
export function equippedBagSlots(state: GameState): number {
  const bag = state.players[0].equipment.offhand;
  // The second arm may be holding a SHIELD instead, which carries no cells.
  if (!bag || bag.slot !== "bag" || isWeaponDef(bag.defId)) return 0;
  // The INSTANCE stamp first — the ilvl-grown count `rollEquipment` froze at
  // mint (`LOOT.bagSlotsPerIlvl`), which is what makes a deep find roomier than
  // an early one. Then the FROZEN def, so a unique bag's overridden capacity
  // (mintUnique) stands; then the live catalog, for legacy instances minted
  // before either.
  if (bag.bagSlots !== undefined) return bag.bagSlots;
  const frozen = bag.def;
  const slots =
    frozen && "bagSlots" in frozen
      ? frozen.bagSlots
      : gearDef(bag.defId).bagSlots;
  return slots ?? 0;
}

/**
 * How many bag cells the player should have right now: the small
 * `baseInventorySize` floor plus `bagSlotsPerStr` per point of STRENGTH
 * (affixes folded in, via `effectiveStat`) plus whatever a worn BAG adds. A STR
 * build and a roomy bag are both ways to earn the room to hoard loot.
 */
export function inventoryCapacity(state: GameState): number {
  return (
    LOOT.baseInventorySize +
    Math.floor(effectiveStat(state, "strength") * STATS.bagSlotsPerStr) +
    equippedBagSlots(state)
  );
}

/**
 * Grow the physical bag array to match `inventoryCapacity` — called whenever
 * STRENGTH could have changed (a level-up allocation, an equip). Grow-only:
 * the bag never shrinks below what it already holds, so dropping a
 * STRENGTH-boosting charm can never strand or discard a carried item.
 */
export function syncInventoryCapacity(state: GameState): void {
  const inv = state.players[0].inventory;
  const want = inventoryCapacity(state);
  while (inv.length < want) inv.push(null);
}

// ---- Inventory mutations (called by the app's UI) ------------------------------

/**
 * Equip the item in inventory cell `index`, swapping whatever occupied its
 * slot back into that cell. Returns false on an empty cell.
 */
export function equipFromInventory(state: GameState, index: number): boolean {
  const player = state.players[0];
  const item = player.inventory[index];
  if (!item) return false;
  // The equip gates hold in the bag too: an under-leveled or under-statted
  // find stays banked until the hero grows into it.
  if (!canEquip(state, item)) return false;
  // A TRINKET has no slot to move to — it already works from the cell it sits
  // in, so "equipping" one is a no-op rather than a failure.
  const slot = wearSlotFor(state, item);
  if (!slot) return false;
  // THE TWO-HANDED RULE: a greatsword needs the second arm, and a shield or
  // bag needs the hand a greatsword is holding. Refused whole when the bag has
  // no room for what would come off (items/hands.ts).
  if (!freeHandsFor(state, item, index)) return false;
  const previous = player.equipment[slot];
  player.inventory[index] = previous ?? null;
  if (slot === "weapon") {
    player.equipment.weapon = item;
    player.weaponCooldownMs = 0;
  } else {
    player.equipment[slot] = item;
  }
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  // A +STRENGTH piece can widen the bag; grow it so the swap has somewhere
  // to land (grow-only — see syncInventoryCapacity).
  syncInventoryCapacity(state);
  return true;
}

/**
 * Equip the item in cell `index` into a SPECIFIC slot, swapping whatever was
 * there back into that cell — what a drag-and-drop onto a named slot means.
 * `equipFromInventory` picks the slot itself (the right rule for a tap or the
 * auto-equip sweep); this one honours the player's aim, which matters for the
 * two ring fingers: dropping a ring on the SECOND finger must land there and
 * not on whichever one happens to be free. Refuses a piece that cannot be
 * worn in `slot` at all.
 */
export function equipFromInventoryInto(
  state: GameState,
  index: number,
  slot: EquipSlot,
): boolean {
  const player = state.players[0];
  const item = player.inventory[index];
  if (!item) return false;
  if (!fitsEquipSlot(item.slot, slot)) return false;
  if (!canEquip(state, item)) return false;
  if (!freeHandsFor(state, item, index)) return false;
  const previous = player.equipment[slot];
  player.inventory[index] = previous ?? null;
  if (slot === "weapon") {
    player.equipment.weapon = item;
    player.weaponCooldownMs = 0;
  } else {
    player.equipment[slot] = item;
  }
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  syncInventoryCapacity(state);
  return true;
}

/**
 * Move an equipped piece back into the first free inventory cell. The weapon
 * slot can never be emptied — the character always fights with something —
 * so weapons only leave via an `equipFromInventory` swap.
 */
export function unequipToInventory(state: GameState, slot: EquipSlot): boolean {
  if (slot === "weapon") return false;
  const player = state.players[0];
  const item = player.equipment[slot];
  if (!item) return false;
  const free = player.inventory.indexOf(null);
  if (free === -1) return false;
  player.inventory[free] = item;
  player.equipment[slot] = null;
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  return true;
}

/** Swap two inventory cells (drag-to-rearrange). */
export function moveInventoryItem(
  state: GameState,
  from: number,
  to: number,
): void {
  const inv = state.players[0].inventory;
  if (from === to || !(from in inv) || !(to in inv)) return;
  const a = inv[from] ?? null;
  inv[from] = inv[to] ?? null;
  inv[to] = a;
}

/** Add loot to the first free cell; false (and no mutation) when full. */
export function addToInventory(state: GameState, item: Equipment): boolean {
  const free = state.players[0].inventory.indexOf(null);
  if (free === -1) return false;
  state.players[0].inventory[free] = item;
  return true;
}

/**
 * The travel gate this bag piece would tear open HERE — the USE-affordance
 * probe the inventory card asks per item. Non-null only when the running
 * level ships a latent gate (`LevelDef.gates`) whose `opensWith` names this
 * piece's def and that gate isn't already standing. Everywhere else the
 * piece is inert — which is the whole cow-level joke.
 */
export function gateKeyTarget(
  state: GameState,
  item: Equipment,
): { id: string; to: string } | null {
  const gate = (runLevelDef(state).gates ?? []).find(
    (g) => g.opensWith === item.defId,
  );
  if (!gate || state.gates.some((g) => g.id === gate.id)) return null;
  return { id: gate.id, to: gate.to };
}

/**
 * USE a gate-key trinket from bag cell `index` (the cow-level ritual):
 * consumes the piece and tears its gate open a step ahead of the hero — a
 * GateState for the crossing logic, a landmark so the renderer draws it with
 * zero edits, and a `gateOpened` event for the app's rupture cue. Returns
 * false (and consumes nothing) when the cell holds no key for this level or
 * the gate already stands.
 */
export function spendGateKey(state: GameState, index: number): boolean {
  const item = state.players[0].inventory[index] ?? null;
  if (!item) return false;
  const gate = gateKeyTarget(state, item);
  if (!gate) return false;
  const def = runLevelDef(state);
  const gateDef = (def.gates ?? []).find((g) => g.id === gate.id);
  if (!gateDef) return false;
  state.players[0].inventory[index] = null;
  const pos = {
    x: clamp(state.players[0].pos.x + GATES.summonDistance, 24, def.width - 24),
    y: clamp(state.players[0].pos.y, 24, def.height - 24),
  };
  state.gates.push({ id: gate.id, to: gate.to, pos, entered: false });
  state.landmarks.push({
    kind: gateDef.id,
    sprite: gateDef.sprite ?? gateDef.id,
    anchor: "base",
    pos: { ...pos },
  });
  state.events.push({ type: "gateOpened", pos: { ...pos }, to: gate.to });
  return true;
}

/**
 * Permanently destroy the item in bag cell `index` — the "drag it out and
 * drop it on the ground" gesture. Returns the discarded item (so the UI can
 * announce what was trashed), or null on an empty cell. There is no undo and
 * nothing is left on the ground: the piece is gone for good.
 */
export function discardFromInventory(
  state: GameState,
  index: number,
): Equipment | null {
  const inv = state.players[0].inventory;
  const item = inv[index] ?? null;
  if (!item) return null;
  inv[index] = null;
  return item;
}

/**
 * Permanently destroy the piece worn in `slot` — the drag-it-off-the-body,
 * drop-it-on-the-ground gesture. The weapon slot is never emptied (the hero
 * always fights with something), so only worn gear — armor, a charm, a bag —
 * is trashed this way. Returns the discarded piece, or null when the slot is
 * the weapon or already bare.
 */
export function discardEquipped(
  state: GameState,
  slot: EquipSlot,
): Equipment | null {
  if (slot === "weapon") return null;
  const player = state.players[0];
  const item = player.equipment[slot];
  if (!item) return null;
  player.equipment[slot] = null;
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  return item;
}
