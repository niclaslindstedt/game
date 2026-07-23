// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The bag: STRENGTH-scaled capacity, the equip/unequip/move/add/discard
// mutators the app's drag-and-drop UI calls into, and the travel-gate keys
// spent from a cell.

import { clamp } from "@game/lib/vec.ts";
import { GATES, LOOT, STATS } from "../config/index.ts";
import { gearDef, isWeaponDef } from "../defs/equipment.ts";
import { levelDef } from "../defs/levels/index.ts";
import type { Equipment, EquipSlot, GameState } from "../types/index.ts";
import {
  effectiveStat,
  recomputeMaxHp,
  recomputeMaxStamina,
} from "./derived.ts";
import { canEquip } from "./requirements.ts";

// ---- Inventory capacity (STRENGTH-scaled) --------------------------------------

/**
 * Extra cells granted by the BAG worn in the bag slot (its `GearDef.bagSlots`),
 * or 0 when no bag is worn. A bag only pays out from the slot — one sitting in
 * a cell is just loot until it's equipped.
 */
export function equippedBagSlots(state: GameState): number {
  const bag = state.player.equipment.bag;
  if (!bag || isWeaponDef(bag.defId)) return 0;
  // Prefer the FROZEN def so a unique bag's overridden capacity (mintUnique)
  // stands; fall back to the live catalog for rolled/legacy bags.
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
  const inv = state.player.inventory;
  const want = inventoryCapacity(state);
  while (inv.length < want) inv.push(null);
}

// ---- Inventory mutations (called by the app's UI) ------------------------------

/**
 * Equip the item in inventory cell `index`, swapping whatever occupied its
 * slot back into that cell. Returns false on an empty cell.
 */
export function equipFromInventory(state: GameState, index: number): boolean {
  const player = state.player;
  const item = player.inventory[index];
  if (!item) return false;
  // The equip gates hold in the bag too: an under-leveled or under-statted
  // find stays banked until the hero grows into it.
  if (!canEquip(state, item)) return false;
  const slot = item.slot;
  const previous =
    slot === "weapon" ? player.equipment.weapon : player.equipment[slot];
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
 * Move an equipped piece back into the first free inventory cell. The weapon
 * slot can never be emptied — the character always fights with something —
 * so weapons only leave via an `equipFromInventory` swap.
 */
export function unequipToInventory(state: GameState, slot: EquipSlot): boolean {
  if (slot === "weapon") return false;
  const player = state.player;
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
  const inv = state.player.inventory;
  if (from === to || !(from in inv) || !(to in inv)) return;
  const a = inv[from] ?? null;
  inv[from] = inv[to] ?? null;
  inv[to] = a;
}

/** Add loot to the first free cell; false (and no mutation) when full. */
export function addToInventory(state: GameState, item: Equipment): boolean {
  const free = state.player.inventory.indexOf(null);
  if (free === -1) return false;
  state.player.inventory[free] = item;
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
  const gate = (levelDef(state.level.id).gates ?? []).find(
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
  const item = state.player.inventory[index] ?? null;
  if (!item) return false;
  const gate = gateKeyTarget(state, item);
  if (!gate) return false;
  const def = levelDef(state.level.id);
  const gateDef = (def.gates ?? []).find((g) => g.id === gate.id);
  if (!gateDef) return false;
  state.player.inventory[index] = null;
  const pos = {
    x: clamp(state.player.pos.x + GATES.summonDistance, 24, def.width - 24),
    y: clamp(state.player.pos.y, 24, def.height - 24),
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
  const inv = state.player.inventory;
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
  const player = state.player;
  const item = player.equipment[slot];
  if (!item) return null;
  player.equipment[slot] = null;
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  return item;
}
