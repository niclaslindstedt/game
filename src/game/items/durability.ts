// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Armor and durability: the material accessors, the worn-armor total and the
// diminishing-returns damage reduction, per-hit wear on armor and weapon, the
// on-break weapon swap, and the repair costs/restores the merchant and the
// repair kit share.

import { ARMOR, ARMOR_TYPES, ECONOMY } from "../config/index.ts";
import { gearDef, isWeaponDef } from "../defs/equipment.ts";
import type { ArmorType, Equipment, GameState } from "../types.ts";
import { ARMOR_SLOTS } from "./class-stats.ts";
import {
  equippedPieces,
  isArmorBroken,
  recomputeMaxHp,
  recomputeMaxStamina,
} from "./derived.ts";
import {
  addToInventory,
  equipFromInventory,
  syncInventoryCapacity,
} from "./inventory.ts";
import { equipmentMaxDurability, qualityMult } from "./quality.ts";
import { canEquip, itemLevelReq } from "./requirements.ts";
import { weaponScore } from "./weapon-math.ts";

/**
 * A gear def's ARMOR MATERIAL (see `ArmorType` / config `ARMOR_TYPES`): the
 * def's own `armorType`, defaulting to `cloth` for anything that names none —
 * charms, bags, and legacy/fixture armor. Weapons have no material. The single
 * accessor every material rule reads (worn armor, the STR gate, the affix
 * stat-lean, the plate drop-gate), so a piece's material is decided in one
 * place.
 */
export function armorTypeOf(defId: string): ArmorType {
  if (isWeaponDef(defId)) return "cloth";
  return gearDef(defId).armorType ?? "cloth";
}

/**
 * The armor points ONE piece contributes while worn: the instance's rolled
 * value (stamped at mint — the def's base grown by item level), falling back
 * to the def's base for pieces minted before the stamp existed, plus any
 * rolled `+armor` affixes. The base value is the piece's CLOTH-equivalent
 * number; its MATERIAL multiplier (config `ARMOR_TYPES[…].armorMult`) scales
 * the plated part — so a mail chest turns far more than a cloth one of the
 * same slot — while rolled `+armor` affixes are material-neutral (a studded
 * charm is a charm). Zero for weapons and for BROKEN armor — a piece at
 * durability 0 hangs silent until repaired.
 */
export function armorValueOf(piece: Equipment): number {
  if (isWeaponDef(piece.defId) || isArmorBroken(piece)) return 0;
  const base = piece.armor ?? gearDef(piece.defId).armor ?? 0;
  let value = base * ARMOR_TYPES[armorTypeOf(piece.defId)].armorMult;
  for (const affix of piece.affixes) {
    if (affix.kind === "armor") value += affix.value;
  }
  return Math.round(value);
}

/**
 * The player's TOTAL armor points: every worn piece's contribution summed
 * (see `armorValueOf` — broken pieces count zero). The single number the
 * damage reduction, the stat panel, and gear comparisons read.
 */
export function totalArmor(state: GameState): number {
  let total = 0;
  for (const piece of equippedPieces(state)) total += armorValueOf(piece);
  return total;
}

/**
 * The fraction of a physical hit the worn armor turns, AGAINST an attacker of
 * `attackerLevel` — the D2/WoW diminishing-returns curve (config `ARMOR`):
 *
 *   armor / (armor + kBase + kPerLevel × attackerLevel)
 *
 * capped at `maxReduction`. Leveling the horde grows the denominator, so a
 * set that turned a third of every blow decays to a shrug unless the armor
 * keeps pace — the reason armor drops matter all campaign.
 */
export function armorReduction(
  state: GameState,
  attackerLevel: number,
): number {
  const armor = totalArmor(state);
  if (armor <= 0) return 0;
  const k = ARMOR.kBase + ARMOR.kPerLevel * Math.max(1, attackerLevel);
  return Math.min(ARMOR.maxReduction, armor / (armor + k));
}

/**
 * Spend one hit's worth of every worn armor piece's durability — called when
 * an enemy's blow or a hazard actually LANDS (a dodged hit costs nothing).
 * A piece reaching zero goes INACTIVE (still worn, contributing nothing —
 * see `isArmorBroken`) and announces itself with an `armorBroke` event; the
 * derived stats are re-derived since its bonuses just went silent.
 */
export function wearWornArmor(state: GameState): void {
  let broke = false;
  for (const slot of ARMOR_SLOTS) {
    const piece = state.player.equipment[slot];
    if (!piece || piece.durability === undefined || piece.durability <= 0) {
      continue;
    }
    piece.durability--;
    if (piece.durability === 0) {
      broke = true;
      state.events.push({ type: "armorBroke", defId: piece.defId });
    }
  }
  if (broke) {
    recomputeMaxHp(state);
    recomputeMaxStamina(state);
  }
}

/**
 * Restore every worn armor piece to full durability — the repair kit mends
 * the wardrobe alongside the weapon's edge, waking any broken piece back up.
 * False when there is nothing to mend (no worn piece is short) so the kit
 * isn't spent on an intact set.
 */
export function repairWornArmor(state: GameState): boolean {
  let mended = false;
  let revived = false;
  for (const slot of ARMOR_SLOTS) {
    const piece = state.player.equipment[slot];
    if (!piece || piece.durability === undefined) continue;
    const max = equipmentMaxDurability(piece);
    if (piece.durability >= max) continue;
    if (piece.durability === 0) revived = true;
    piece.durability = max;
    mended = true;
  }
  // A revived piece's bonuses just came back online.
  if (revived) {
    recomputeMaxHp(state);
    recomputeMaxStamina(state);
  }
  return mended;
}

/**
 * Coins to fully mend ONE instance right now (config `ECONOMY.repair`): 0 for
 * the unbreakable sidearm, a durability-free charm/bag, or an already-full
 * piece. Otherwise it scales with the fraction of durability MISSING and — the
 * three levers the price is meant to reflect — the piece's REQUIRED LEVEL, its
 * RARITY (tier), and its MAKE QUALITY: dearer, higher-end, finer gear costs
 * more to keep whole.
 */
export function repairCost(piece: Equipment): number {
  if (piece.durability === undefined) return 0; // unbreakable
  const max = equipmentMaxDurability(piece);
  if (max <= 0) return 0; // charms, bags — no durability
  const missing = max - piece.durability;
  if (missing <= 0) return 0; // already whole
  const { base, perReqLevel, tierMult } = ECONOMY.repair;
  const cost =
    (base + perReqLevel * itemLevelReq(piece)) *
    tierMult[piece.tier] *
    qualityMult(piece) *
    (missing / max);
  return Math.max(1, Math.ceil(cost));
}

/**
 * The total coins to mend the hero's WHOLE kit — the worn weapon and armor plus
 * every breakable piece riding in the bag — each priced by `repairCost`. The
 * quote the merchant's REPAIR action charges; 0 when nothing needs mending.
 */
export function repairAllCost(state: GameState): number {
  const p = state.player;
  let total = repairCost(p.equipment.weapon);
  for (const slot of ARMOR_SLOTS) {
    const piece = p.equipment[slot];
    if (piece) total += repairCost(piece);
  }
  for (const cell of p.inventory) {
    if (cell) total += repairCost(cell);
  }
  return total;
}

/**
 * Mend every repairable piece — worn weapon, worn armor, and everything in the
 * bag — back to full, reviving any broken worn armor. The COIN cost is charged
 * by the caller (the merchant's `repairGear`); this is the pure restore, so a
 * ground repair kit or a scripted mend can reuse it. Returns whether anything
 * changed.
 */
export function repairAll(state: GameState): boolean {
  const p = state.player;
  let mended = false;
  let wornArmorRevived = false;
  const mend = (piece: Equipment | null, wornArmor: boolean): void => {
    if (!piece || piece.durability === undefined) return;
    const max = equipmentMaxDurability(piece);
    if (max <= 0 || piece.durability >= max) return;
    if (wornArmor && piece.durability === 0) wornArmorRevived = true;
    piece.durability = max;
    mended = true;
  };
  mend(p.equipment.weapon, false);
  for (const slot of ARMOR_SLOTS) mend(p.equipment[slot], true);
  for (const cell of p.inventory) mend(cell, false);
  // A revived worn piece's bonuses just came back online.
  if (wornArmorRevived) {
    recomputeMaxHp(state);
    recomputeMaxStamina(state);
  }
  // Re-equip the weapons durability booted from the hand, in the ORDER they
  // were shed: the earliest-shed (the hero's main before the break cascade)
  // reclaims the hand and the rest stay in the bag as now-wieldable spares.
  // Runs after the mend, so every booted weapon is equippable again.
  const booted = [];
  for (let i = 0; i < p.inventory.length; i++) {
    const cell = p.inventory[i];
    if (cell && cell.slot === "weapon" && cell.unequippedAt !== undefined) {
      booted.push({ index: i, seq: cell.unequippedAt });
    }
  }
  booted.sort((a, b) => a.seq - b.seq);
  for (const { index } of booted) {
    if (equipFromInventory(state, index)) break;
  }
  // The whole kit is whole again: drop every shed marker (worn weapon and every
  // bagged weapon) so a later break starts the ordering fresh.
  if (p.equipment.weapon.unequippedAt !== undefined) {
    delete p.equipment.weapon.unequippedAt;
  }
  for (const cell of p.inventory) {
    if (cell && cell.unequippedAt !== undefined) delete cell.unequippedAt;
  }
  return mended;
}

// ---- Durability -------------------------------------------------------------------

/**
 * The next de-equip sequence number: one past the highest `unequippedAt` on
 * any weapon the hero holds (worn or bagged), or 0 for the first break. Lets
 * `wearEquippedWeapon` stamp broken weapons in the order the hand shed them so
 * a repair can re-equip them in that order (`repairAll`) — see `Equipment.
 * unequippedAt`.
 */
function nextUnequipSeq(state: GameState): number {
  let max = -1;
  const consider = (piece: Equipment | null): void => {
    if (piece && piece.unequippedAt !== undefined && piece.unequippedAt > max) {
      max = piece.unequippedAt;
    }
  };
  consider(state.player.equipment.weapon);
  for (const cell of state.player.inventory) consider(cell);
  return max + 1;
}

/**
 * Pull the best WIELDABLE weapon out of the bag and return it (removing it from
 * its cell), or null when the bag holds none the hero can draw. "Wieldable"
 * routes through `canEquip`, so an under-leveled, under-statted, or BROKEN
 * (durability 0) bag weapon is passed over — a broken spare stays put until a
 * repair kit wakes it. Ranked by the build-aware `weaponScore` so a STRENGTH
 * hero draws the heavier melee and an INTELLIGENCE hero the stronger spell.
 */
function takeBestBagWeapon(state: GameState): Equipment | null {
  const inv = state.player.inventory;
  let bestIndex = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < inv.length; i++) {
    const item = inv[i];
    if (!item || item.slot !== "weapon") continue;
    if (!canEquip(state, item)) continue;
    const score = weaponScore(state, item);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) return null;
  const weapon = inv[bestIndex] as Equipment;
  inv[bestIndex] = null;
  return weapon;
}

/** A fresh, unbreakable sidearm — the last-resort weapon drawn when the bag
 * holds nothing wieldable, so the weapon slot honors its never-empty contract. */
function drawSidearm(state: GameState): Equipment {
  return {
    id: state.nextId++,
    defId: "blaster",
    slot: "weapon",
    tier: "regular",
    ilvl: 1,
    affixes: [],
  };
}

/**
 * Spend one attack's worth of the equipped weapon's durability. At zero the
 * weapon is NOT destroyed — it drops into the bag at durability 0, unequippable
 * until a repair kit mends it (`isWeaponBroken`), stamped with the order the
 * hand shed it (`unequippedAt`) so a repair re-equips in that order. In its
 * place the hero draws the BEST wieldable weapon left in the bag (never the
 * broken one just shed); only with nothing wieldable does he fall back to a
 * fresh sidearm — so a good weapon is preferred over the starter blaster. A
 * bag too full to hold the broken weapon drops it on the ground rather than
 * destroying it.
 */
export function wearEquippedWeapon(state: GameState): void {
  const player = state.player;
  const weapon = player.equipment.weapon;
  if (weapon.durability === undefined) return; // the unbreakable sidearm
  weapon.durability--;
  if (weapon.durability > 0) return;

  state.events.push({ type: "weaponBroke", defId: weapon.defId });

  // Stamp the shed order BEFORE picking the replacement, then choose the best
  // survivor from the bag (the just-broken blade is excluded — it isn't in the
  // bag yet, and `canEquip` would refuse it anyway).
  weapon.unequippedAt = nextUnequipSeq(state);
  const replacement = takeBestBagWeapon(state);
  // Stow the broken weapon so it can be repaired later; a full bag drops it on
  // the ground rather than letting it vanish — a broken weapon is never lost.
  if (!addToInventory(state, weapon)) {
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos: { ...player.pos },
      equipment: weapon,
    });
  }
  player.equipment.weapon = replacement ?? drawSidearm(state);
  player.weaponCooldownMs = 0;
  // A broken weapon leaving the hand can shed its stat affixes (a +STAMINA
  // "OF THE BEAR" blade, a +vitality piece), so re-derive the pools it fed —
  // exactly as `equipFromInventory`/`unequipToInventory` do on a hand swap.
  // Skipping it here left the hp/stamina bars sized to the broken weapon's
  // stats until the next recompute (a level-up, a stat spend), so a drink or
  // heal could top off to a stale max. Grow-only for the bag (STRENGTH).
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  syncInventoryCapacity(state);
  state.events.push({
    type: "autoEquipped",
    defId: player.equipment.weapon.defId,
  });
}

/**
 * Restore the equipped weapon to full durability (the repair-kit pickup).
 * False when there is nothing to repair — unbreakable or already pristine —
 * so the kit can stay on the ground for later.
 */
export function repairEquippedWeapon(state: GameState): boolean {
  const weapon = state.player.equipment.weapon;
  if (weapon.durability === undefined) return false;
  const max = equipmentMaxDurability(weapon);
  if (weapon.durability >= max) return false;
  weapon.durability = max;
  return true;
}
